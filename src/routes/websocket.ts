import type { Server as HttpServer, IncomingMessage } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { createLogger } from "../utils/logger.js";
import { countShards } from "../db/database.js";
import type { WsEvent } from "../types.js";

const log = createLogger("ws");

const clients = new Set<WebSocket>();

export function attachWebSocket(server: HttpServer): void {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    clients.add(ws);
    log.info(
      `Client connected (${clients.size} total) from ${req.socket.remoteAddress ?? "unknown"}`
    );

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg?.type === "ping") {
          ws.send(JSON.stringify({ type: "pong", ts: Date.now() }));
        }
      } catch {
        // ignore malformed messages
      }
    });

    ws.on("close", () => {
      clients.delete(ws);
      log.info(`Client disconnected (${clients.size} total)`);
    });

    ws.on("error", (err: Error) => {
      log.warn(`WebSocket error: ${err.message}`);
    });
  });

  const heartbeat = setInterval(() => {
    if (clients.size === 0) return;
    broadcast({
      type: "mosaic:stats",
      total: countShards("complete"),
      pending: countShards("pending") + countShards("processing"),
    });
  }, 30_000);
  heartbeat.unref?.();
}

export function broadcast(event: WsEvent): void {
  const payload = JSON.stringify(event);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(payload);
      } catch (err) {
        log.warn(`broadcast to client failed: ${(err as Error).message}`);
      }
    }
  }
}

export function clientCount(): number {
  return clients.size;
}
