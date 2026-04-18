import express from "express";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { createLogger } from "./utils/logger.js";
import { openDb, requeueStuckShards } from "./db/database.js";
import { createApiRouter } from "./routes/api.js";
import { attachWebSocket, broadcast } from "./routes/websocket.js";
import { enqueue, setBroadcast } from "./services/jobQueue.js";
import { startPolling } from "./services/spreadsheetParser.js";

const log = createLogger("server");

async function main(): Promise<void> {
  log.info("Starting Kintsugi Network backend");

  openDb();
  requeueStuckShards();

  if (!fs.existsSync(config.shardsDir)) {
    fs.mkdirSync(config.shardsDir, { recursive: true });
    log.info(`Created shards directory at ${config.shardsDir}`);
  }

  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "256kb" }));

  app.use(
    "/shards",
    express.static(config.shardsDir, {
      fallthrough: false,
      maxAge: "1d",
    })
  );

  const publicRoot = path.resolve(config.repoRoot, "./public");
  if (fs.existsSync(publicRoot)) {
    app.use(express.static(publicRoot, { fallthrough: true, maxAge: "1h" }));
  }

  app.use("/api", createApiRouter());

  const server = http.createServer(app);
  attachWebSocket(server);
  setBroadcast(broadcast);

  const polling = startPolling(config.pollIntervalMs, async (row) => {
    enqueue(row);
  });

  server.listen(config.port, () => {
    log.info(`HTTP  listening on http://localhost:${config.port}`);
    log.info(`WS    listening on ws://localhost:${config.port}/ws`);
    log.info(`Source: ${polling.source}`);
  });

  const shutdown = (signal: string) => {
    log.info(`Received ${signal}; shutting down`);
    polling.stop();
    server.close(() => {
      log.info("HTTP server closed");
      process.exit(0);
    });
    setTimeout(() => {
      log.warn("Forcing exit after shutdown timeout");
      process.exit(1);
    }, 5_000).unref();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  log.error(`Fatal startup error: ${(err as Error).stack ?? err}`);
  process.exit(1);
});
