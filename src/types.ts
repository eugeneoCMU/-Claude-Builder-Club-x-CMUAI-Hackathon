export type ShardStatus =
  | "pending"
  | "processing"
  | "complete"
  | "failed"
  | "rejected";

export interface Shard {
  id: string;
  row_index: number;
  regret: string;
  proud: string;
  dream: string;
  image_url: string | null;
  image_prompt: string | null;
  shape_seed: number;
  position_x: number;
  position_y: number;
  rotation: number;
  scale: number;
  status: ShardStatus;
  created_at: number;
  layer_order: number;
}

export interface Connection {
  id: string;
  shard_a_id: string;
  shard_b_id: string;
  phrase: string;
  theme: string | null;
  created_at: number;
}

export interface ProcessedRow {
  row_index: number;
  status: "imported" | "rejected" | "failed";
  reason: string | null;
  processed_at: number;
}

export interface RawRow {
  row_index: number;
  regret: string;
  proud: string;
  dream: string;
}

export type WsEvent =
  | { type: "shard:new"; shard: Shard }
  | { type: "connection:new"; connection: Connection }
  | { type: "mosaic:stats"; total: number; pending: number };

export interface MosaicStats {
  total_shards: number;
  pending: number;
  last_updated: number;
}
