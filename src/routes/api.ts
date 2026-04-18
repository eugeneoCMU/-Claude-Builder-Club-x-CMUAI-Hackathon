import { Router, type Request, type Response } from "express";
import { config } from "../config.js";
import {
  countShards,
  getConnections,
  getShard,
  getShards,
} from "../db/database.js";
import { getQueueStats } from "../services/jobQueue.js";

export function createApiRouter(): Router {
  const router = Router();

  router.get("/health", (_req: Request, res: Response) => {
    res.json({
      ok: true,
      db: "connected",
      sheets: config.sheetsConfigured ? "connected" : "csv-fallback",
      queue: getQueueStats(),
    });
  });

  router.get("/shards", (req: Request, res: Response) => {
    const since = Number.isFinite(Number(req.query.since))
      ? parseInt(String(req.query.since), 10)
      : 0;
    const limit = Number.isFinite(Number(req.query.limit))
      ? Math.min(1000, parseInt(String(req.query.limit), 10))
      : 100;
    const shards = getShards(since, limit).filter(
      (s) => s.status === "complete" || s.status === "processing"
    );
    res.json({ shards, total: countShards() });
  });

  router.get("/shards/:id", (req: Request, res: Response) => {
    const id = String(req.params.id);
    const shard = getShard(id);
    if (!shard) {
      res.status(404).json({ error: "not found" });
      return;
    }
    res.json({ shard });
  });

  router.get("/connections", (req: Request, res: Response) => {
    const shardId =
      typeof req.query.shard_id === "string" ? req.query.shard_id : undefined;
    res.json({ connections: getConnections(shardId) });
  });

  router.get("/mosaic/state", (_req: Request, res: Response) => {
    res.json({
      total_shards: countShards("complete"),
      pending: countShards("pending") + countShards("processing"),
      last_updated: Date.now(),
    });
  });

  return router;
}
