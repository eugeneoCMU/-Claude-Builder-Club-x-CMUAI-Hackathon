import PQueue from "p-queue";
import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { createLogger } from "../utils/logger.js";
import {
  countShards,
  getMaxLayerOrder,
  getShard,
  getShards,
  insertShard,
  isRowProcessed,
  updateShard,
  upsertProcessedRow,
} from "../db/database.js";
import { chooseShardPlacement, hashString } from "../utils/shapeGenerator.js";
import { screenContent } from "./contentSafety.js";
import { generateShardImage } from "./shardGenerator.js";
import { analyzeConnections } from "./connectionAnalyzer.js";
import type { RawRow, Shard, WsEvent } from "../types.js";

const log = createLogger("queue");

type Broadcast = (event: WsEvent) => void;

const queue = new PQueue({ concurrency: 1 });
let broadcast: Broadcast = () => {};

export function setBroadcast(fn: Broadcast): void {
  broadcast = fn;
}

function buildShard(row: RawRow): Shard {
  const id = randomUUID();
  const seed = hashString(id);
  const layerOrder = getMaxLayerOrder() + 1;
  const existing = getShards(0, 10_000).map((s) => ({
    position_x: s.position_x,
    position_y: s.position_y,
  }));
  const placement = chooseShardPlacement({
    seed,
    existing,
    layerOrder,
  });

  return {
    id,
    row_index: row.row_index,
    regret: row.regret,
    proud: row.proud,
    dream: row.dream,
    image_url: null,
    image_prompt: null,
    shape_seed: seed,
    position_x: placement.position_x,
    position_y: placement.position_y,
    rotation: placement.rotation,
    scale: placement.scale,
    status: "pending",
    created_at: Date.now(),
    layer_order: layerOrder,
  };
}

async function processRow(row: RawRow): Promise<void> {
  if (isRowProcessed(row.row_index)) {
    log.debug(`Row ${row.row_index} already processed; skipping`);
    return;
  }

  const shard = buildShard(row);
  insertShard(shard);
  upsertProcessedRow({
    row_index: row.row_index,
    status: "imported",
    reason: null,
    processed_at: Date.now(),
  });

  log.info(
    `Queued shard ${shard.id} (row ${row.row_index}, layer_order ${shard.layer_order})`
  );

  // 1. Content safety
  try {
    const safety = await screenContent(row.regret, row.proud, row.dream);
    if (!safety.safe) {
      updateShard(shard.id, { status: "rejected" });
      upsertProcessedRow({
        row_index: row.row_index,
        status: "rejected",
        reason: safety.reason ?? "flagged by safety filter",
        processed_at: Date.now(),
      });
      log.warn(
        `Shard ${shard.id} REJECTED by safety: ${safety.reason ?? "unspecified"}`
      );
      return;
    }
  } catch (err) {
    updateShard(shard.id, { status: "failed" });
    upsertProcessedRow({
      row_index: row.row_index,
      status: "failed",
      reason: `safety: ${(err as Error).message}`,
      processed_at: Date.now(),
    });
    log.error(`Safety check failed for ${shard.id}: ${(err as Error).message}`);
    return;
  }

  // 2. Move to 'processing' and broadcast a placeholder so the mosaic can
  //    render a colored polygon while the image is being generated.
  updateShard(shard.id, { status: "processing" });
  const placeholder = getShard(shard.id);
  if (placeholder) broadcast({ type: "shard:new", shard: placeholder });

  // 3. Image generation
  try {
    const gen = await generateShardImage(
      shard.id,
      row.regret,
      row.proud,
      row.dream
    );
    updateShard(shard.id, {
      status: "complete",
      image_url: gen.imageUrl,
      image_prompt: `${gen.reasoning}\n\n--- Image prompt sent to Nano Banana ---\n${gen.imagePrompt}`,
    });
    const complete = getShard(shard.id);
    if (complete) broadcast({ type: "shard:new", shard: complete });
    log.info(`Shard ${shard.id} COMPLETE`);
  } catch (err) {
    updateShard(shard.id, { status: "failed" });
    upsertProcessedRow({
      row_index: row.row_index,
      status: "failed",
      reason: `image: ${(err as Error).message}`,
      processed_at: Date.now(),
    });
    log.error(
      `Image generation failed for ${shard.id}: ${(err as Error).message}`
    );
    return;
  }

  // 4. Connection analysis runs after the shard is visible. Do it inline
  //    so the queue preserves order, but don't let failures poison the row.
  try {
    const finalShard = getShard(shard.id);
    if (finalShard) {
      const connections = await analyzeConnections(finalShard);
      for (const conn of connections) {
        broadcast({ type: "connection:new", connection: conn });
      }
    }
  } catch (err) {
    log.error(
      `Connection analysis failed for ${shard.id}: ${(err as Error).message}`
    );
  }
}

export function enqueue(row: RawRow): void {
  queue.add(() => processRow(row)).catch((err) => {
    log.error(`Unhandled error for row ${row.row_index}: ${String(err)}`);
  });
}

export function getQueueStats() {
  return {
    queued: queue.size,
    running: queue.pending,
    total_shards: countShards(),
    pending_shards: countShards("pending") + countShards("processing"),
  };
}
