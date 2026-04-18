import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import { createLogger } from "../utils/logger.js";
import type {
  Connection,
  ProcessedRow,
  Shard,
  ShardStatus,
} from "../types.js";

const log = createLogger("db");
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Embedded fallback schema. The canonical source is `src/db/schema.sql`, but
 * we keep an inlined copy here so production builds (where schema.sql may not
 * be copied into dist/) still work without any extra build steps.
 * Both must stay in sync \u2014 if you edit one, edit the other.
 */
const EMBEDDED_SCHEMA = `
CREATE TABLE IF NOT EXISTS shards (
  id           TEXT PRIMARY KEY,
  row_index    INTEGER UNIQUE NOT NULL,
  regret       TEXT NOT NULL,
  proud        TEXT NOT NULL,
  dream        TEXT NOT NULL,
  image_url    TEXT,
  image_prompt TEXT,
  shape_seed   INTEGER NOT NULL,
  position_x   REAL NOT NULL DEFAULT 0,
  position_y   REAL NOT NULL DEFAULT 0,
  rotation     REAL NOT NULL DEFAULT 0,
  scale        REAL NOT NULL DEFAULT 1,
  status       TEXT NOT NULL DEFAULT 'pending',
  created_at   INTEGER NOT NULL,
  layer_order  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shards_status ON shards(status);
CREATE INDEX IF NOT EXISTS idx_shards_layer_order ON shards(layer_order);

CREATE TABLE IF NOT EXISTS connections (
  id          TEXT PRIMARY KEY,
  shard_a_id  TEXT NOT NULL REFERENCES shards(id),
  shard_b_id  TEXT NOT NULL REFERENCES shards(id),
  phrase      TEXT NOT NULL,
  theme       TEXT,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_connections_shard_a ON connections(shard_a_id);
CREATE INDEX IF NOT EXISTS idx_connections_shard_b ON connections(shard_b_id);

CREATE TABLE IF NOT EXISTS processed_rows (
  row_index    INTEGER PRIMARY KEY,
  status       TEXT NOT NULL,
  reason       TEXT,
  processed_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS system_state (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

function loadSchema(): string {
  const schemaPath = path.resolve(__dirname, "./schema.sql");
  if (fs.existsSync(schemaPath)) {
    return fs.readFileSync(schemaPath, "utf-8");
  }
  return EMBEDDED_SCHEMA;
}

let dbInstance: Database.Database | null = null;

export function openDb(): Database.Database {
  if (dbInstance) return dbInstance;

  const dir = path.dirname(config.dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const db = new Database(config.dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(loadSchema());

  log.info(`SQLite ready at ${config.dbPath}`);

  dbInstance = db;
  return db;
}

// -- Shards -----------------------------------------------------------------

export function insertShard(shard: Shard): void {
  const db = openDb();
  db.prepare(
    `INSERT INTO shards (
      id, row_index, regret, proud, dream, image_url, image_prompt,
      shape_seed, position_x, position_y, rotation, scale, status,
      created_at, layer_order
    ) VALUES (
      @id, @row_index, @regret, @proud, @dream, @image_url, @image_prompt,
      @shape_seed, @position_x, @position_y, @rotation, @scale, @status,
      @created_at, @layer_order
    )`
  ).run(shard);
}

export function updateShard(id: string, patch: Partial<Shard>): void {
  const db = openDb();
  const keys = Object.keys(patch).filter((k) => k !== "id");
  if (keys.length === 0) return;
  const setClause = keys.map((k) => `${k} = @${k}`).join(", ");
  db.prepare(`UPDATE shards SET ${setClause} WHERE id = @id`).run({
    id,
    ...patch,
  });
}

export function getShard(id: string): Shard | undefined {
  const db = openDb();
  return db.prepare(`SELECT * FROM shards WHERE id = ?`).get(id) as
    | Shard
    | undefined;
}

export function getShards(since = 0, limit = 100): Shard[] {
  const db = openDb();
  return db
    .prepare(
      `SELECT * FROM shards
       WHERE layer_order > ?
       ORDER BY layer_order ASC
       LIMIT ?`
    )
    .all(since, limit) as Shard[];
}

export function getCompleteShards(limit = 10): Shard[] {
  const db = openDb();
  return db
    .prepare(
      `SELECT * FROM shards
       WHERE status = 'complete'
       ORDER BY layer_order DESC
       LIMIT ?`
    )
    .all(limit) as Shard[];
}

export function countShards(status?: ShardStatus): number {
  const db = openDb();
  if (status) {
    const row = db
      .prepare(`SELECT COUNT(*) as c FROM shards WHERE status = ?`)
      .get(status) as { c: number };
    return row.c;
  }
  const row = db.prepare(`SELECT COUNT(*) as c FROM shards`).get() as {
    c: number;
  };
  return row.c;
}

export function getMaxLayerOrder(): number {
  const db = openDb();
  const row = db
    .prepare(`SELECT MAX(layer_order) as m FROM shards`)
    .get() as { m: number | null };
  return row.m ?? 0;
}

export function requeueStuckShards(): number {
  const db = openDb();
  const result = db
    .prepare(`UPDATE shards SET status = 'pending' WHERE status = 'processing'`)
    .run();
  if (result.changes > 0) {
    log.info(`Re-queued ${result.changes} stuck 'processing' shards`);
  }
  return result.changes;
}

// -- Connections ------------------------------------------------------------

export function insertConnection(conn: Connection): void {
  const db = openDb();
  db.prepare(
    `INSERT INTO connections (
      id, shard_a_id, shard_b_id, phrase, theme, created_at
    ) VALUES (
      @id, @shard_a_id, @shard_b_id, @phrase, @theme, @created_at
    )`
  ).run(conn);
}

export function getConnections(shardId?: string): Connection[] {
  const db = openDb();
  if (shardId) {
    return db
      .prepare(
        `SELECT * FROM connections
         WHERE shard_a_id = ? OR shard_b_id = ?
         ORDER BY created_at DESC`
      )
      .all(shardId, shardId) as Connection[];
  }
  return db
    .prepare(`SELECT * FROM connections ORDER BY created_at DESC`)
    .all() as Connection[];
}

// -- Processed rows ---------------------------------------------------------

export function upsertProcessedRow(row: ProcessedRow): void {
  const db = openDb();
  db.prepare(
    `INSERT INTO processed_rows (row_index, status, reason, processed_at)
     VALUES (@row_index, @status, @reason, @processed_at)
     ON CONFLICT(row_index) DO UPDATE SET
       status = excluded.status,
       reason = excluded.reason,
       processed_at = excluded.processed_at`
  ).run(row);
}

export function isRowProcessed(rowIndex: number): boolean {
  const db = openDb();
  const row = db
    .prepare(`SELECT 1 FROM processed_rows WHERE row_index = ?`)
    .get(rowIndex);
  return Boolean(row);
}

// -- System state -----------------------------------------------------------

export function getSystemState(key: string): string | undefined {
  const db = openDb();
  const row = db
    .prepare(`SELECT value FROM system_state WHERE key = ?`)
    .get(key) as { value: string } | undefined;
  return row?.value;
}

export function setSystemState(key: string, value: string): void {
  const db = openDb();
  db.prepare(
    `INSERT INTO system_state (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, value);
}

export function getLastProcessedRowIndex(): number {
  const raw = getSystemState("last_processed_row_index");
  return raw ? parseInt(raw, 10) : 0;
}

export function setLastProcessedRowIndex(index: number): void {
  setSystemState("last_processed_row_index", String(index));
}
