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
