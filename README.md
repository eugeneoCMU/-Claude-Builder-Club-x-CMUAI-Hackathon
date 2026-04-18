# Kintsugi Network

> An interactive art installation that transforms reflections on regret, pride, and unfinished dreams into a living kintsugi mosaic.

Visitors submit three reflections — their biggest regret, proudest moment, and a half-finished dream. Each submission becomes a unique AI-generated shard on a collective canvas, stitched to other shards with glowing gold threads and poetic phrases that surface thematic resonance between strangers.

---

## Architecture at a glance

- **Backend**: Node.js + TypeScript, Express.js, WebSockets (`ws`), SQLite via `better-sqlite3`, `p-queue` for sequential pipeline work.
- **Inputs**: Google Sheets polling (`googleapis`) with `data/entries.csv` as a drop-in fallback.
- **AI pipeline** (per new shard):
  1. `claude-haiku-4-5` screens the three reflections for content safety.
  2. `claude-sonnet-4-5` runs a 6-step reasoning prompt and emits a distilled textual image prompt inside `<image_prompt>…</image_prompt>`.
  3. `google/gemini-2.5-flash-image-preview` (Nano Banana, via OpenRouter) turns that prompt into a 1024×1024 PNG.
  4. `sharp` normalizes the image to 512×512 and writes it to `public/shards/<id>.png`.
  5. `claude-haiku-4-5` compares the new shard to nearby shards and emits up to 3 poetic connection phrases (≤50 chars each).
- **Frontend**: Vite + PixiJS v8 (WebGL). Four-layer stage (background → shards → gold threads → UI labels). Shard shape, position, rotation, and scale are derived deterministically from a backend-issued `shape_seed`. Threads are quadratic Béziers with a `GlowFilter` whose strength responds to cursor proximity. Zoom/pan and hover are driven by a single ticker.
- **Realtime**: `ws` broadcasts `shard:new`, `connection:new`, and `mosaic:stats` events; the client auto-reconnects and patches its store in place.

For the full design, see [`spec.md`](./spec.md) and [`implementation.md`](./implementation.md). The pre-rebuild Next.js/SVG prototype lives in [`legacy/`](./legacy) and is kept only for reference.

```
src/           ← Express backend, DB, pipeline services, routes
client/        ← Vite + PixiJS frontend (mosaic, threads, controls)
data/          ← entries.csv (fallback when Google Sheets isn't configured)
public/shards/ ← generated PNGs served statically at /shards/<id>.png
```

---

## Prerequisites

- **Node.js ≥ 20.10.0** (required by `better-sqlite3` and `sharp` prebuilt binaries)
- An **Anthropic API key** (for Claude haiku + sonnet)
- An **OpenRouter API key** (for the Nano Banana image model)
- *(Optional)* A Google Sheets spreadsheet and a service account with read access to it

---

## Setup

```bash
npm install
cp .env.example .env
```

Then open `.env` and fill in at minimum:

```
ANTHROPIC_API_KEY=sk-ant-...
OPENROUTER_API_KEY=sk-or-...
```

Everything else has sensible defaults — see [`.env.example`](./.env.example) for the full list (poll interval, model overrides, max reflection length, DB path, etc.).

### Optional: wire up Google Sheets

If you want the backend to poll a live spreadsheet instead of the CSV fallback:

1. Create a Google Cloud service account and download its JSON key.
2. Share the spreadsheet with the service account's `client_email` (read access is enough).
3. Base64-encode the key and put it in `.env`:
   ```bash
   cat service-account.json | base64 | tr -d '\n' > /tmp/sa.b64
   # paste into GOOGLE_SHEETS_CREDENTIALS_JSON=
   ```
4. Set `GOOGLE_SHEETS_SPREADSHEET_ID` to the spreadsheet ID.
5. The sheet must have this column layout in `Sheet1!A:D`:
   | A (name or id) | B (regret) | C (proud) | D (dream) |

If either `GOOGLE_SHEETS_SPREADSHEET_ID` or `GOOGLE_SHEETS_CREDENTIALS_JSON` is missing, the server automatically falls back to `data/entries.csv`.

---

## Running

### Development (hot reload)

```bash
npm run dev
```

This runs two processes concurrently:

- **Server** at `http://localhost:3000` (Express + WebSocket `/ws`)
- **Vite dev server** at `http://localhost:5173` with `/api`, `/ws`, and `/shards` proxied to the backend

Open `http://localhost:5173` in the browser. An empty canvas is expected at first — shards appear as the pipeline processes entries.

### Production build

```bash
npm run build   # emits dist/server/ and dist/client/
npm start       # runs the compiled server, serving dist/client/ as static
```

### Type checking

```bash
npm run typecheck
```

---

## Seeding the mosaic from CSV

The project ships with [`data/entries.csv`](./data/entries.csv) — five sample reflections wired to run end-to-end. On startup the server immediately reads the CSV (no need to wait for the first poll interval) and every `POLL_INTERVAL_MS` afterward picks up newly-appended rows.

**CSV format:**

```csv
name,regret,proud,dream
```

- Row 1 is the header.
- Only columns B–D are used for reflections; the first column is ignored and is just for your own bookkeeping.
- Each reflection is truncated to `MAX_REFLECTION_LENGTH` characters (default 500) before being sent to Claude.
- Row indices are tracked in the SQLite `system_state` table, so re-starting the server won't re-process rows. Only *new* rows (index > last processed) are picked up.

**To run a fresh demo:**

1. Stop the dev server.
2. Delete the DB + generated images:
   ```bash
   rm -f kintsugi.db kintsugi.db-shm kintsugi.db-wal
   rm -f public/shards/*.png
   ```
3. Restart: `npm run dev`. All CSV rows are processed from scratch.

**To regenerate a single shard** (e.g., to retry after a failed generation), delete its row in SQLite and let the poller pick it back up:

```bash
sqlite3 kintsugi.db "DELETE FROM shards WHERE id='<shard-id>';"
sqlite3 kintsugi.db "UPDATE system_state SET value='<row_index - 1>' WHERE key='last_processed_row_index';"
```

---

## REST + WebSocket reference

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/health` | Liveness + queue stats |
| GET | `/api/shards?limit=N&offset=M` | Paginated list of shards |
| GET | `/api/shards/:id` | Single shard by id |
| GET | `/api/connections` | All gold-thread connections |
| GET | `/api/mosaic/state` | Aggregate stats (totals, pending count, last-updated timestamp) |

Generated PNGs are served at `/shards/<id>.png`.

WebSocket endpoint: `ws://localhost:3000/ws` — emits:

```jsonc
{ "type": "shard:new",      "shard": { /* Shard */ } }
{ "type": "connection:new", "connection": { /* Connection */ } }
{ "type": "mosaic:stats",   "totalShards": 42, "activeConnections": 37 }
```

The client reconnects automatically with exponential backoff.

---

## Troubleshooting

**`401` or `invalid_api_key` from Claude or OpenRouter.**
Make sure both keys in `.env` are populated and the server was restarted *after* editing `.env`. Anthropic keys start with `sk-ant-`, OpenRouter keys with `sk-or-`.

**Rate limits / `429` errors.**
Both Anthropic and OpenRouter enforce rate limits. The pipeline runs at `concurrency=1` with exponential-backoff retries (`src/utils/retry.ts`), so bursts should settle on their own. If they don't, lower the CSV polling rate (`POLL_INTERVAL_MS`) or increase the delay between shards by trimming the CSV.

**`Google Sheets not configured` warning.**
Expected whenever `GOOGLE_SHEETS_SPREADSHEET_ID` or `GOOGLE_SHEETS_CREDENTIALS_JSON` is blank. The server falls back to `data/entries.csv` — that's the default dev path.

**`CSV fallback file not found at …/data/entries.csv`.**
Either populate `data/entries.csv` (see the shipped sample) or point `CSV_FALLBACK_PATH` at another file. A missing CSV is not fatal — the poller just logs a warning and waits.

**Shard stuck in `processing`.**
If the server crashes mid-pipeline, any shard still marked `processing` is flipped back to `pending` and its row requeued on the next startup (`requeueStuckShards` in `src/db/database.ts`). Just restart.

**`sharp` or `better-sqlite3` install fails.**
Both depend on prebuilt native binaries for your Node major version. Use Node ≥ 20.10, and reinstall with `npm rebuild` if you change Node versions.

**Frontend is blank with no errors.**
Check the browser console — if WebSocket can't connect it'll show reconnect attempts. Confirm the backend is up at `http://localhost:3000/api/health`. If you're opening `http://localhost:3000` directly instead of the Vite dev server, `main.ts` won't be served; use `http://localhost:5173` during development.

---

## License

Private project — not yet licensed for distribution.
