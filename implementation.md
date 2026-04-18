# Kintsugi Network — Implementation Guide

## Project Structure

```
kintsugi-network/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── .env
├── .env.example
├── src/                              ← Backend (Node.js / Express)
│   ├── server.ts                     ← Express app entry + WebSocket server
│   ├── config.ts                     ← Env var loading and validation
│   ├── types.ts                      ← Shared TypeScript types (Shard, Connection, WsEvent)
│   ├── db/
│   │   ├── database.ts               ← SQLite connection, migrations, query helpers
│   │   └── schema.sql                ← DDL for all four tables
│   ├── services/
│   │   ├── spreadsheetParser.ts      ← Google Sheets polling + validation
│   │   ├── contentSafety.ts          ← Claude haiku content safety check
│   │   ├── shardGenerator.ts         ← Claude sonnet direct image generation (6-step prompt)
│   │   ├── connectionAnalyzer.ts     ← Claude haiku thematic analysis
│   │   └── jobQueue.ts               ← p-queue pipeline orchestrator
│   ├── routes/
│   │   ├── api.ts                    ← REST endpoints
│   │   └── websocket.ts              ← WebSocket broadcast helpers
│   └── utils/
│       ├── logger.ts                 ← Console logger with log levels
│       ├── retry.ts                  ← Exponential backoff helper
│       └── shapeGenerator.ts         ← Deterministic polygon (backend copy)
├── client/                           ← Frontend (Vite + PixiJS)
│   ├── index.html
│   ├── main.ts                       ← Bootstrap: init app, load data, connect WS
│   ├── rendering/
│   │   ├── MosaicApp.ts              ← PIXI.Application wrapper
│   │   ├── ShardSprite.ts            ← Core display object (masked shard image)
│   │   ├── GoldThread.ts             ← Bezier thread + GlowFilter
│   │   ├── MosaicLayer.ts            ← Container managing all shards + placement
│   │   └── AnimationLoop.ts          ← PIXI Ticker: breathing + proximity
│   ├── interaction/
│   │   ├── HoverManager.ts           ← Shard/thread hover detection
│   │   ├── ZoomPanControls.ts        ← Scroll zoom + drag pan + pinch
│   │   └── PoeticLabel.ts            ← Fade-in/out text on gold thread hover
│   ├── state/
│   │   ├── MosaicStore.ts            ← Client-side shard + connection state
│   │   └── WebSocketClient.ts        ← WS connection + event dispatch
│   └── utils/
│       ├── shapeUtils.ts             ← Polygon generation (mirrors backend algorithm)
│       └── colorUtils.ts             ← Emotion → color map, gold constants
└── public/
    └── shards/                       ← Generated PNG files served statically
```

---

## Dependencies

```json
{
  "dependencies": {
    "express": "^4.18.2",
    "better-sqlite3": "^9.4.3",
    "googleapis": "^137.1.0",
    "@anthropic-ai/sdk": "^0.27.0",
    "p-queue": "^8.0.1",
    "ws": "^8.16.0",
    "uuid": "^9.0.0",
    "dotenv": "^16.4.5"
  },
  "devDependencies": {
    "typescript": "^5.4.5",
    "vite": "^5.2.0",
    "pixi.js": "^8.1.0",
    "pixi-filters": "^6.0.0",
    "@types/express": "^4.17.21",
    "@types/better-sqlite3": "^7.6.9",
    "@types/ws": "^8.5.10",
    "@types/uuid": "^9.0.8",
    "tsx": "^4.7.1",
    "concurrently": "^8.2.2"
  }
}
```

**npm scripts:**
```json
{
  "scripts": {
    "dev": "concurrently \"npm run dev:server\" \"npm run dev:client\"",
    "dev:server": "tsx watch src/server.ts",
    "dev:client": "vite",
    "build": "tsc && vite build"
  }
}
```

---

## Phase 0 — Shared Foundation (Both Together, ~30 min)

These files must be created first, before the team splits.

### `src/types.ts`

```typescript
export interface Shard {
  id: string
  row_index: number
  regret: string
  proud: string
  dream: string
  image_url: string | null
  image_prompt: string | null
  shape_seed: number
  position_x: number
  position_y: number
  rotation: number
  scale: number
  status: 'pending' | 'processing' | 'complete' | 'failed' | 'rejected'
  created_at: number
  layer_order: number
}

export interface Connection {
  id: string
  shard_a_id: string
  shard_b_id: string
  phrase: string
  theme: string | null
  created_at: number
}

export type WsEvent =
  | { type: 'shard:new'; shard: Shard }
  | { type: 'connection:new'; connection: Connection }
  | { type: 'mosaic:stats'; total: number; pending: number }
```

### `src/db/schema.sql`

```sql
CREATE TABLE IF NOT EXISTS shards (
  id          TEXT PRIMARY KEY,
  row_index   INTEGER UNIQUE NOT NULL,
  regret      TEXT NOT NULL,
  proud       TEXT NOT NULL,
  dream       TEXT NOT NULL,
  image_url   TEXT,
  image_prompt TEXT,
  shape_seed  INTEGER NOT NULL,
  position_x  REAL NOT NULL DEFAULT 0,
  position_y  REAL NOT NULL DEFAULT 0,
  rotation    REAL NOT NULL DEFAULT 0,
  scale       REAL NOT NULL DEFAULT 1,
  status      TEXT NOT NULL DEFAULT 'pending',
  created_at  INTEGER NOT NULL,
  layer_order INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS connections (
  id          TEXT PRIMARY KEY,
  shard_a_id  TEXT NOT NULL REFERENCES shards(id),
  shard_b_id  TEXT NOT NULL REFERENCES shards(id),
  phrase      TEXT NOT NULL,
  theme       TEXT,
  created_at  INTEGER NOT NULL
);

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
```

---

## Backend Track (Person A)

### Backend Phase 1 — Data + Google Sheets

#### `src/config.ts`

```typescript
import 'dotenv/config'

export const config = {
  port: parseInt(process.env.PORT || '3000'),
  pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || '30000'),
  dbPath: process.env.DB_PATH || './kintsugi.db',
  shardsDir: process.env.SHARDS_DIR || './public/shards',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
  sheetsSpreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID!,
  sheetsCredentials: JSON.parse(
    Buffer.from(process.env.GOOGLE_SHEETS_CREDENTIALS_JSON!, 'base64').toString()
  ),
  maxReflectionLength: 500,
  contentSafetyTimeoutMs: 3000,
  maxConnectionsPerShard: 3,
  nearbyShardCount: 10,
}
```

#### `src/db/database.ts`

Key responsibilities:
- Open SQLite with `better-sqlite3`
- Read and execute `schema.sql` (idempotent `CREATE TABLE IF NOT EXISTS`)
- Export typed query helpers used by all services:
  - `insertShard(shard)`, `updateShard(id, partial)`, `getShard(id)`
  - `getShards(since?, limit?)`, `getCompleteShards(limit)`
  - `insertConnection(conn)`, `getConnections(shardId?)`
  - `upsertProcessedRow(row)`, `isRowProcessed(rowIndex)`
  - `getSystemState(key)`, `setSystemState(key, value)`

#### `src/utils/retry.ts`

```typescript
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 500
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (attempt === maxAttempts) throw err
      await sleep(baseDelayMs * Math.pow(2, attempt - 1))
    }
  }
  throw new Error('unreachable')
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
```

#### `src/services/spreadsheetParser.ts`

```typescript
// Key implementation notes:
// - Auth: google.auth.GoogleAuth with scopes ['https://www.googleapis.com/auth/spreadsheets.readonly']
// - Read: sheets.spreadsheets.values.get({ spreadsheetId, range: 'Sheet1!A:D' })
// - Row format: [timestamp, regret, proud, dream] (columns B, C, D — skip header row 1)
// - Track last processed row in system_state: key='last_processed_row_index'
// - On each poll: fetch from (lastIndex + 1) to end, process each row through pipeline

export function startPolling(intervalMs: number, onNewRow: (row: RawRow) => void): void
```

Validation rules:
- Skip row if any of regret/proud/dream is empty or whitespace-only → log warning
- Truncate each field to 500 chars before forwarding
- Wrap Google Sheets API calls in `withRetry(fn, 3, 1000)`

### Backend Phase 2 — AI Pipeline

#### `src/services/contentSafety.ts`

```typescript
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

export async function screenContent(
  regret: string, proud: string, dream: string
): Promise<{ safe: boolean; reason?: string }> {
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 100,
    system: `You are a content safety filter for an art installation about human vulnerability.
Respond ONLY with JSON: {"safe": true} or {"safe": false, "reason": "..."}
Flag: violence, sexually explicit content, hate speech, self-harm promotion, real personal info (phone numbers, addresses, full names).
Grief, loss, regret, darkness, and emotional pain are SAFE — they are the artistic point.`,
    messages: [{
      role: 'user',
      content: `Regret: ${regret}\nProud moment: ${proud}\nDream: ${dream}`
    }]
  })
  return JSON.parse((response.content[0] as any).text)
}
```

#### `src/services/shardGenerator.ts`

Claude generates the image directly using a 6-step reasoning prompt (see spec.md for the full prompt text). The backend sends the prompt, extracts the image from the response, and saves it to disk.

```typescript
import Anthropic from '@anthropic-ai/sdk'
import * as fs from 'fs'
import * as path from 'path'
import { config } from '../config'

const client = new Anthropic({ apiKey: config.anthropicApiKey })

export async function generateShardImage(
  shardId: string,
  regret: string,
  proud: string,
  dream: string
): Promise<{ imagePath: string; reasoning: string }> {

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: `You are an artist-in-residence for a kintsugi art installation.
Your task is to create a single square image (512×512) that will become one shard
in a collective mosaic of human stories. The image is a close-up of a broken pottery
fragment — the surface texture of a ceramic piece with visible cracks, aged glaze,
and raw clay edges. The imagery must be purely abstract: no text, no faces, no
recognizable figures or objects. Only color, texture, light, and form.

You will reason through six steps before generating. Show your thinking for each step,
then produce the image.`,
    messages: [{
      role: 'user',
      content: buildShardPrompt(regret, proud, dream)
    }]
  })

  // Extract reasoning text (all text blocks before the image)
  const textBlocks = response.content.filter(b => b.type === 'text')
  const reasoning = textBlocks.map(b => (b as any).text).join('\n')

  // Extract the generated image
  const imageBlock = response.content.find(b => b.type === 'image')
  if (!imageBlock) {
    throw new Error('Claude did not return an image block')
  }

  const base64Data = (imageBlock as any).source.data
  const buffer = Buffer.from(base64Data, 'base64')
  const imagePath = path.join(config.shardsDir, `${shardId}.png`)
  fs.writeFileSync(imagePath, buffer)

  return { imagePath, reasoning }
}

function buildShardPrompt(regret: string, proud: string, dream: string): string {
  return `A visitor to our installation submitted these three reflections:

REGRET: "${regret}"
PROUDEST MOMENT: "${proud}"
HALF-FINISHED DREAM: "${dream}"

Follow these six steps, then generate the shard image.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 1 — EMOTIONAL ANALYSIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Read all three reflections carefully. Identify:
- The texture of the regret: What kind of loss is it? (abandonment, failure,
  inaction, time, pride, love?) How old does it feel? Acute or weathered?
- The quality of the proud moment: Is it triumphant or quiet? Public or private?
  A peak or a survival?
- The nature of the dream: What does incompleteness feel like here? Tender, urgent,
  resigned, still alive?
- Where all three intersect or pull against each other. What is the emotional note
  they share underneath?

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 2 — CENTRAL VISUAL METAPHOR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Choose ONE abstract visual metaphor that embodies the emotional intersection from Step 1.
It must be:
- Elemental or natural: fire, water, roots, light, shadow, stone, seed, tide, ash,
  fog, bloom, ice, current, soil
- Not literal: do not illustrate the text. A regret about a parent does not become
  a silhouette — it becomes the quality of fading warmth, or roots cut mid-growth
- Capable of holding both fracture and beauty at once
Name the metaphor and explain in one sentence why it fits.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 3 — COLOR PALETTE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Derive a palette of exactly 3 colors from the emotional content. Each must be specific
(not just "blue" — "slate blue with a grey undertone", "burnt sienna at dusk").

- BASE COLOR: An earthy anchor — the color of the shard's dominant mood.
  Pull from: ochre, umber, slate, ash grey, rust, raw sienna, clay, charcoal,
  deep indigo, storm green
- ACCENT COLOR: The vivid note — the emotion at its most intense moment.
  This should feel like it wants to break through the base. One color only.
- TRANSITION COLOR: The in-between — where the regret meets the dream, where the
  fracture begins to heal.

Colors must feel aged and glazed, not fresh or saturated.
Think: pigment absorbed into ceramic, not paint on canvas.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 4 — CERAMIC SURFACE & CRACK TEXTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Specify the physical character of the pottery surface. Each choice should reflect
the emotional weight of the reflections:

- CRACK DENSITY:
  sparse (1-2 major cracks) = dignified, private grief
  moderate (web of hairlines) = complexity held together
  dense (crazing across entire surface) = overwhelm, transformation
- GLAZE FINISH:
  matte and dry = subdued, exhausted, past tense
  crackled glaze (fine crazing lines) = tension, held complexity
  pooled or runny glaze = movement, still-becoming, hopeful
  unglazed raw clay patches = exposed, honest, unfinished
- AGE OF BREAK:
  fresh fracture (bright, clean clay edge) = recent wound
  old break (darkened, worn smooth) = long-carried, part of identity
- GOLD ENTRY POINT: Where on the surface does the kintsugi gold seep in?
  Place it where the emotional tension is highest.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 5 — COMPOSITION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Plan the image layout:

- CENTER: The focal point. The visual metaphor anchors here.
- EDGES: What bleeds into the jagged shard border? The edge is where the break
  happened — the raw clay, the oldest wound.
- LIGHTING: Single directional light source. Where does it enter?
  (upper left raking = reveals texture; center glow = warmth; edge-lit = isolation)
- GOLD: The kintsugi seam traces the most significant crack — the one that,
  if missing, would split the shard entirely.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 6 — GENERATE THE IMAGE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Now create the shard image using everything from Steps 1–5.

Requirements:
- Square, 512×512 pixels
- Close-up of a pottery shard surface (as if the camera is inches from the ceramic)
- Purely abstract: no text, no faces, no recognizable figures or symbols
- Kintsugi gold seams are luminous and deliberate — not damage, but the most
  intentional lines in the image

Style: the textural intimacy of Anselm Kiefer's surfaces, the color restraint of
Japanese raku ceramics, the emotional directness of Rothko's color fields —
rendered as ceramic artifact, not canvas painting.`
}
```

**What gets saved:**
- `imagePath` → the PNG file at `/public/shards/<id>.png`
- `reasoning` → stored as `image_prompt` in SQLite (Claude's step 1–5 thinking). This is used by `connectionAnalyzer.ts` as richer input than the raw reflections alone.

**Placeholder pattern:** Before calling Claude (which takes a few seconds), immediately broadcast `shard:new` with `status='processing'` and a `placeholder_color` derived from emotional keywords in the reflections. When the image is saved, broadcast `shard:new` again with `status='complete'` and `image_url`. The frontend swaps the colored polygon for the real texture.

#### `src/services/connectionAnalyzer.ts`

```typescript
// Fetch last N complete shards from DB
const recentShards = db.getCompleteShards(config.nearbyShardCount)

// Call Claude haiku
const response = await client.messages.create({
  model: 'claude-haiku-4-5-20251001',
  max_tokens: 400,
  system: `You are a poet finding hidden connections between strangers' confessions.
For each real thematic echo (loss, longing, joy, transformation), write a phrase ≤50 chars.
Respond ONLY with JSON array: [{"shard_id": "...", "phrase": "..."}]
Return [] if no strong connections exist.`,
  messages: [{
    role: 'user',
    content: JSON.stringify({
      new_shard: { regret, proud, dream },
      existing_shards: recentShards.map(s => ({ id: s.id, regret: s.regret, proud: s.proud, dream: s.dream }))
    })
  }]
})

const connections = JSON.parse((response.content[0] as any).text)
// Insert each connection into DB, broadcast connection:new
```

#### `src/services/jobQueue.ts`

```typescript
import PQueue from 'p-queue'
const queue = new PQueue({ concurrency: 1 })

export function enqueue(rowData: RawRow): void {
  queue.add(async () => {
    // 1. Insert shard as 'pending', insert processed_row
    // 2. Content safety check
    // 3. If rejected: update statuses, log, return
    // 4. Update shard to 'processing', broadcast shard:new (placeholder)
    // 5. Generate shard image
    // 6. Update shard to 'complete', broadcast shard:new (with image_url)
    // 7. Async (non-blocking): run connection analysis
  })
}
```

### Backend Phase 3 — API Server

#### `src/server.ts`

```typescript
// Startup sequence:
// 1. Load config, open DB, run migrations
// 2. Create /public/shards directory if it doesn't exist
// 3. Re-queue any shards with status='processing' back to 'pending'
// 4. Set up Express: JSON middleware, static /public, mount routes
// 5. Create HTTP server + attach WebSocket server
// 6. Start spreadsheet polling: spreadsheetParser.startPolling(config.pollIntervalMs, enqueue)
// 7. Listen on config.port
```

#### `src/routes/api.ts`

```typescript
router.get('/shards', (req, res) => {
  const since = parseInt(req.query.since as string) || 0
  const limit = parseInt(req.query.limit as string) || 100
  const shards = db.getShards(since, limit)
  const total = db.countShards()
  res.json({ shards, total })
})

router.get('/connections', (req, res) => {
  const shardId = req.query.shard_id as string | undefined
  res.json({ connections: db.getConnections(shardId) })
})

router.get('/mosaic/state', (req, res) => {
  res.json({
    total_shards: db.countShards('complete'),
    pending: db.countShards('pending') + db.countShards('processing'),
    last_updated: Date.now()
  })
})
```

#### `src/routes/websocket.ts`

Export a `broadcast(event: WsEvent)` function that serializes the event and sends to all connected clients. Store connected clients in a `Set<WebSocket>`. Clean up on `close`.

---

## Frontend Track (Person B)

### Frontend Phase 0 — Mock Setup

Create `client/MOCK_DATA.json` with 5–10 hardcoded shards. Use solid color data URIs for `image_url`:

```json
{
  "shards": [
    {
      "id": "mock-001",
      "shape_seed": 12345,
      "position_x": 0.25,
      "position_y": 0.25,
      "rotation": 0.3,
      "scale": 1.1,
      "status": "complete",
      "image_url": null,
      "layer_order": 1,
      "regret": "I never told her I loved her",
      "proud": "I finished the marathon at 47",
      "dream": "A book about my grandmother's village"
    }
  ],
  "connections": [
    {
      "id": "conn-001",
      "shard_a_id": "mock-001",
      "shard_b_id": "mock-002",
      "phrase": "two lives, one silence"
    }
  ]
}
```

`client/state/MosaicStore.ts` should detect if the API is available; if not, fall back to mock data.

### Frontend Phase 1 — PixiJS Core + Shard Rendering

#### `client/rendering/MosaicApp.ts`

```typescript
import * as PIXI from 'pixi.js'

export class MosaicApp {
  app: PIXI.Application
  worldContainer: PIXI.Container

  async init(): Promise<void> {
    this.app = new PIXI.Application()
    await this.app.init({
      resizeTo: window,
      backgroundColor: 0x1a0a00,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
    })
    document.body.appendChild(this.app.canvas)

    this.worldContainer = new PIXI.Container()
    this.app.stage.addChild(this.worldContainer)

    // Add sub-layers in order
    this.worldContainer.addChild(new PIXI.Container()) // BackgroundLayer
    this.worldContainer.addChild(new PIXI.Container()) // ShardLayer
    this.worldContainer.addChild(new PIXI.Container()) // ThreadLayer
    this.worldContainer.addChild(new PIXI.Container()) // UILayer
  }
}
```

#### `client/utils/shapeUtils.ts`

```typescript
// LCG random number generator seeded by shape_seed
function lcg(seed: number) {
  let state = seed
  return () => {
    state = (1664525 * state + 1013904223) & 0xffffffff
    return (state >>> 0) / 0xffffffff
  }
}

export function generateShardPolygon(shapeSeed: number): [number, number][] {
  const rand = lcg(shapeSeed)
  const n = Math.floor(rand() * 6) + 7          // 7–12 points
  const baseRadius = 0.35
  const points: [number, number][] = []

  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2
    const radius = baseRadius * (0.6 + rand() * 0.8)  // ±40% displacement
    points.push([
      0.5 + Math.cos(angle) * radius,
      0.5 + Math.sin(angle) * radius,
    ])
  }

  // Insert 2–4 concave notch points
  const notchCount = Math.floor(rand() * 3) + 2
  for (let i = 0; i < notchCount; i++) {
    const insertAt = Math.floor(rand() * points.length)
    const angle = rand() * Math.PI * 2
    const notchDepth = 0.05 + rand() * 0.08
    points.splice(insertAt, 0, [
      0.5 + Math.cos(angle) * (baseRadius - notchDepth),
      0.5 + Math.sin(angle) * (baseRadius - notchDepth),
    ])
  }

  return catmullRomSmooth(points, 0.3)
}

// Catmull-Rom spline smoothing — returns more points for smooth curves
function catmullRomSmooth(pts: [number, number][], tension: number): [number, number][] {
  // Standard Catmull-Rom implementation
  // Returns interpolated points between each pair of control points
  // ...implementation...
  return pts // simplified: return as-is for skeleton
}
```

#### `client/rendering/ShardSprite.ts`

```typescript
import * as PIXI from 'pixi.js'
import { BlurFilter } from 'pixi-filters'
import type { Shard } from '../../src/types'
import { generateShardPolygon } from '../utils/shapeUtils'

export class ShardSprite extends PIXI.Container {
  private sprite: PIXI.Sprite
  private mask: PIXI.Graphics
  private edgeGlow: PIXI.Graphics
  private polygon: [number, number][]
  baseScale: number
  breathPhase = 0
  hoverScale = 1
  center: { x: number; y: number }

  constructor(shard: Shard, canvasW: number, canvasH: number) {
    super()
    this.polygon = generateShardPolygon(shard.shape_seed)
    this.baseScale = shard.scale * Math.min(canvasW, canvasH) * 0.2
    this.center = { x: shard.position_x * canvasW, y: shard.position_y * canvasH }
    this.position.set(this.center.x, this.center.y)
    this.rotation = shard.rotation

    // Edge glow (drawn first, below sprite)
    this.edgeGlow = new PIXI.Graphics()
    this.drawEdgeGlow()
    this.edgeGlow.filters = [new BlurFilter({ strength: 4 })]
    this.addChild(this.edgeGlow)

    // Placeholder colored polygon while image loads
    this.sprite = shard.image_url
      ? PIXI.Sprite.from(shard.image_url)
      : this.createColorPlaceholder(shard)

    // Polygon mask
    this.mask = new PIXI.Graphics()
    this.drawMask()
    this.addChild(this.sprite)
    this.addChild(this.mask)
    this.sprite.mask = this.mask

    this.eventMode = 'static'
    this.cursor = 'pointer'
    this.on('pointerover', () => this.setHovered(true))
    this.on('pointerout', () => this.setHovered(false))
  }

  private drawMask(): void {
    const size = this.baseScale
    this.mask.clear()
    this.mask.poly(this.polygon.map(([x, y]) => new PIXI.Point((x - 0.5) * size, (y - 0.5) * size)))
    this.mask.fill(0xffffff)
  }

  private drawEdgeGlow(): void {
    const size = this.baseScale
    this.edgeGlow.clear()
    this.edgeGlow.poly(this.polygon.map(([x, y]) => new PIXI.Point((x - 0.5) * size, (y - 0.5) * size)))
    this.edgeGlow.stroke({ width: 6, color: 0xFFD700, alpha: 0.6 })
  }

  setHovered(hovered: boolean): void {
    this.hoverScale = hovered ? 1.05 : 1
  }

  breathe(time: number, cursorDist: number, breathRadius: number): void {
    if (cursorDist < breathRadius) {
      this.breathPhase += 0.02
      const breathScale = 1 + Math.sin(this.breathPhase) * 0.015
      this.scale.set(this.baseScale * breathScale * this.hoverScale / this.baseScale)
    }
  }

  swapTexture(imageUrl: string): void {
    PIXI.Assets.load(imageUrl).then(texture => {
      this.sprite.texture = texture
    })
  }
}
```

#### `client/rendering/MosaicLayer.ts`

```typescript
export class MosaicLayer {
  container = new PIXI.Container()
  private shards = new Map<string, ShardSprite>()

  addShard(shard: Shard, canvasW: number, canvasH: number, animated = false): ShardSprite {
    const sprite = new ShardSprite(shard, canvasW, canvasH)
    sprite.zIndex = shard.layer_order
    this.container.sortableChildren = true

    if (animated) {
      sprite.alpha = 0
      // Fade in over 1.5s
      const ticker = PIXI.Ticker.shared
      let elapsed = 0
      const fadeIn = (delta: PIXI.Ticker) => {
        elapsed += delta.deltaMS
        sprite.alpha = Math.min(elapsed / 1500, 1)
        if (sprite.alpha >= 1) ticker.remove(fadeIn)
      }
      ticker.add(fadeIn)
    }

    this.shards.set(shard.id, sprite)
    this.container.addChild(sprite)
    return sprite
  }

  getSprite(id: string): ShardSprite | undefined {
    return this.shards.get(id)
  }

  getAllSprites(): ShardSprite[] {
    return Array.from(this.shards.values())
  }
}
```

### Frontend Phase 2 — Gold Threads + Poetic Labels

#### `client/rendering/GoldThread.ts`

```typescript
import * as PIXI from 'pixi.js'
import { GlowFilter } from 'pixi-filters'
import type { Connection } from '../../src/types'

export class GoldThread {
  graphics: PIXI.Graphics
  midpoint: { x: number; y: number }
  connection: Connection
  private glowFilter: GlowFilter

  constructor(
    connection: Connection,
    startPt: { x: number; y: number },
    endPt: { x: number; y: number }
  ) {
    this.connection = connection
    this.graphics = new PIXI.Graphics()
    this.glowFilter = new GlowFilter({ distance: 10, outerStrength: 0.5, color: 0xFFD700 })
    this.graphics.filters = [this.glowFilter]

    // Compute midpoint
    this.midpoint = {
      x: (startPt.x + endPt.x) / 2,
      y: (startPt.y + endPt.y) / 2,
    }

    // Draw Bezier curve
    const cpOffset = 40
    this.graphics
      .moveTo(startPt.x, startPt.y)
      .bezierCurveTo(
        startPt.x + cpOffset, startPt.y - cpOffset,
        endPt.x - cpOffset, endPt.y + cpOffset,
        endPt.x, endPt.y
      )
    this.graphics.stroke({ width: 3, color: 0xFFD700, alpha: 0.85 })
  }

  setGlowStrength(strength: number): void {
    this.glowFilter.outerStrength = 0.5 + strength * 3
  }
}
```

#### `client/interaction/PoeticLabel.ts`

```typescript
export class PoeticLabel {
  text: PIXI.Text
  private fadeTimer: number | null = null

  constructor(container: PIXI.Container) {
    this.text = new PIXI.Text({
      text: '',
      style: {
        fontFamily: 'Georgia, serif',
        fontSize: 14,
        fill: 0xFFD700,
        alpha: 0.9,
        fontStyle: 'italic',
      }
    })
    this.text.alpha = 0
    container.addChild(this.text)
  }

  show(phrase: string, x: number, y: number): void {
    this.text.text = phrase
    this.text.position.set(x - this.text.width / 2, y - 20)
    this.text.alpha = 0
    // Fade in over 300ms
    const start = performance.now()
    const tick = () => {
      const t = Math.min((performance.now() - start) / 300, 1)
      this.text.alpha = t
      if (t < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }

  hide(): void {
    // Fade out over 500ms
    const startAlpha = this.text.alpha
    const start = performance.now()
    const tick = () => {
      const t = Math.min((performance.now() - start) / 500, 1)
      this.text.alpha = startAlpha * (1 - t)
      if (t < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }
}
```

#### `client/interaction/HoverManager.ts`

```typescript
export class HoverManager {
  private cursor = { x: 0, y: 0 }
  private activeThread: GoldThread | null = null
  private label: PoeticLabel
  private threads: GoldThread[] = []
  private GLOW_RADIUS = 150

  constructor(canvas: HTMLCanvasElement, label: PoeticLabel) {
    this.label = label
    canvas.addEventListener('mousemove', e => {
      this.cursor = { x: e.clientX, y: e.clientY }
    })
  }

  update(threads: GoldThread[]): void {
    this.threads = threads
  }

  tick(worldContainer: PIXI.Container): void {
    // Transform cursor to world coordinates
    const worldPos = worldContainer.toLocal(new PIXI.Point(this.cursor.x, this.cursor.y))

    let nearest: GoldThread | null = null
    let nearestDist = this.GLOW_RADIUS

    for (const thread of this.threads) {
      const dx = thread.midpoint.x - worldPos.x
      const dy = thread.midpoint.y - worldPos.y
      const dist = Math.sqrt(dx * dx + dy * dy)

      // Update glow strength
      const strength = Math.max(0, 1 - dist / this.GLOW_RADIUS)
      thread.setGlowStrength(strength)

      if (dist < nearestDist) {
        nearestDist = dist
        nearest = thread
      }
    }

    if (nearest !== this.activeThread) {
      if (this.activeThread) this.label.hide()
      if (nearest) {
        const screenPt = worldContainer.toGlobal(nearest.midpoint)
        this.label.show(nearest.connection.phrase, screenPt.x, screenPt.y)
      }
      this.activeThread = nearest
    }
  }
}
```

### Frontend Phase 3 — Animation + Zoom/Pan

#### `client/rendering/AnimationLoop.ts`

```typescript
export class AnimationLoop {
  private BREATH_RADIUS = 200

  constructor(
    private app: PIXI.Application,
    private mosaicLayer: MosaicLayer,
    private hoverManager: HoverManager,
    private worldContainer: PIXI.Container
  ) {
    this.app.ticker.add(this.tick.bind(this))
  }

  private tick(): void {
    const time = performance.now() / 1000
    const cursor = hoverManager.cursor  // expose cursor from HoverManager

    for (const sprite of this.mosaicLayer.getAllSprites()) {
      const worldCursor = this.worldContainer.toLocal(new PIXI.Point(cursor.x, cursor.y))
      const dx = sprite.center.x - worldCursor.x
      const dy = sprite.center.y - worldCursor.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      sprite.breathe(time, dist, this.BREATH_RADIUS)
    }

    this.hoverManager.tick(this.worldContainer)
  }
}
```

#### `client/interaction/ZoomPanControls.ts`

```typescript
export class ZoomPanControls {
  private isDragging = false
  private dragStart = { x: 0, y: 0 }
  private MIN_ZOOM = 0.1
  private MAX_ZOOM = 3.0

  constructor(
    private canvas: HTMLCanvasElement,
    private worldContainer: PIXI.Container,
    private mosaicLayer: MosaicLayer
  ) {
    canvas.addEventListener('wheel', this.onWheel.bind(this), { passive: false })
    canvas.addEventListener('pointerdown', this.onPointerDown.bind(this))
    canvas.addEventListener('pointermove', this.onPointerMove.bind(this))
    canvas.addEventListener('pointerup', () => { this.isDragging = false })
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault()
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1
    const newScale = Math.max(this.MIN_ZOOM,
      Math.min(this.MAX_ZOOM, this.worldContainer.scale.x * zoomFactor))

    // Zoom centered on cursor
    const mousePos = new PIXI.Point(e.clientX, e.clientY)
    const worldPos = this.worldContainer.toLocal(mousePos)
    this.worldContainer.scale.set(newScale)
    const newWorldPos = this.worldContainer.toGlobal(worldPos)
    this.worldContainer.position.x -= newWorldPos.x - mousePos.x
    this.worldContainer.position.y -= newWorldPos.y - mousePos.y

    // LOD switch
    const useLOD = newScale < 0.3
    for (const sprite of this.mosaicLayer.getAllSprites()) {
      sprite.visible = true // culling handled per-frame separately
      // TODO: swap texture/polygon based on useLOD
    }
  }

  private onPointerDown(e: PointerEvent): void {
    this.isDragging = true
    this.dragStart = { x: e.clientX - this.worldContainer.position.x,
                       y: e.clientY - this.worldContainer.position.y }
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.isDragging) return
    this.worldContainer.position.set(
      e.clientX - this.dragStart.x,
      e.clientY - this.dragStart.y
    )
  }
}
```

#### `client/state/WebSocketClient.ts`

```typescript
import type { WsEvent } from '../../src/types'

export class WebSocketClient {
  private ws: WebSocket | null = null
  private listeners = new Map<string, ((payload: any) => void)[]>()

  connect(url: string): void {
    this.ws = new WebSocket(url)
    this.ws.onmessage = (e) => {
      const event: WsEvent = JSON.parse(e.data)
      const handlers = this.listeners.get(event.type) || []
      handlers.forEach(h => h(event))
    }
    this.ws.onclose = () => setTimeout(() => this.connect(url), 3000)
  }

  on<T extends WsEvent['type']>(type: T, handler: (event: Extract<WsEvent, { type: T }>) => void): void {
    const handlers = this.listeners.get(type) || []
    handlers.push(handler as any)
    this.listeners.set(type, handlers)
  }
}
```

#### `client/main.ts`

```typescript
async function main() {
  // 1. Init PixiJS
  const mosaicApp = new MosaicApp()
  await mosaicApp.init()

  // 2. Init layers
  const mosaicLayer = new MosaicLayer()
  const label = new PoeticLabel(mosaicApp.worldContainer)
  const hoverManager = new HoverManager(mosaicApp.app.canvas, label)
  const animationLoop = new AnimationLoop(mosaicApp.app, mosaicLayer, hoverManager, mosaicApp.worldContainer)
  const zoomPan = new ZoomPanControls(mosaicApp.app.canvas, mosaicApp.worldContainer, mosaicLayer)

  // 3. Load initial data
  const store = new MosaicStore()
  await store.loadInitial()  // GET /api/shards + /api/connections (or mock fallback)

  const { width, height } = mosaicApp.app.screen
  for (const shard of store.shards) {
    mosaicLayer.addShard(shard, width, height, false)
  }

  const threads: GoldThread[] = []
  for (const conn of store.connections) {
    const spriteA = mosaicLayer.getSprite(conn.shard_a_id)
    const spriteB = mosaicLayer.getSprite(conn.shard_b_id)
    if (spriteA && spriteB) {
      const thread = new GoldThread(conn, spriteA.center, spriteB.center)
      mosaicApp.worldContainer.getChildAt(2).addChild(thread.graphics)
      threads.push(thread)
    }
  }
  hoverManager.update(threads)

  // 4. Connect WebSocket
  const wsClient = new WebSocketClient()
  wsClient.connect(`ws://${window.location.host}/ws`)
  wsClient.on('shard:new', ({ shard }) => {
    if (shard.status === 'complete') {
      const existing = mosaicLayer.getSprite(shard.id)
      if (existing) {
        existing.swapTexture(shard.image_url!)
      } else {
        mosaicLayer.addShard(shard, width, height, true)
      }
    }
  })
  wsClient.on('connection:new', ({ connection }) => {
    const spriteA = mosaicLayer.getSprite(connection.shard_a_id)
    const spriteB = mosaicLayer.getSprite(connection.shard_b_id)
    if (spriteA && spriteB) {
      const thread = new GoldThread(connection, spriteA.center, spriteB.center)
      mosaicApp.worldContainer.getChildAt(2).addChild(thread.graphics)
      threads.push(thread)
      hoverManager.update(threads)
    }
  })
}

main()
```

---

## Fallback Strategies

| Issue | Fallback |
|-------|---------|
| Claude image gen takes seconds | Show colored polygon immediately (emotion→color map), swap when image ready |
| Claude sonnet rate limits | p-queue concurrency=1 automatically queues; placeholder keeps mosaic lively |
| Connection Analyzer adds latency | Run as background job every 5 min instead of per-shard |
| PixiJS viewport controls too complex | CSS `transform: scale()` on a wrapper div over the canvas |
| Breathing animation performance | Global sine wave on all shards (no cursor distance check) |

---

## Technical Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Claude image gen latency (seconds per image) | `p-queue` concurrency=1, instant placeholder polygon |
| Claude not returning image block | Retry up to 3× via `withRetry`; log reasoning text for debugging |
| Google Sheets 60 reads/min quota | 30s poll = 2 reads/min — well under limit |
| PixiJS 1000+ shards at 30fps | Viewport frustum culling + LOD at low zoom |
| SQLite concurrent writes | `better-sqlite3` is synchronous; p-queue concurrency=1 eliminates write races |
| Claude haiku latency | <1s for safety/connections — within the 3s content safety requirement |

---

## Verification Checklist

### Backend

- [ ] `npm run dev:server` starts without errors, SQLite file created
- [ ] `/api/health` returns `{ ok: true }`
- [ ] Insert test row in Google Sheet → shard appears in `/api/shards` within 30s
- [ ] `/public/shards/<id>.png` exists and is a valid 512×512 image
- [ ] Shard status progression visible: `pending → processing → complete`
- [ ] Poetic connection appears in `/api/connections` after second shard
- [ ] Kill and restart server → no duplicate shards created

### Frontend

- [ ] Full-screen dark canvas loads in browser
- [ ] Mock shards render as irregular polygon shapes (not rectangles)
- [ ] Gold edge glow visible on shard borders
- [ ] Moving cursor near a shard triggers breathing animation
- [ ] Hovering over a shard increases scale and brightness
- [ ] Gold thread visible between connected mock shards
- [ ] Moving cursor near thread increases glow intensity
- [ ] Hovering near thread midpoint shows poetic phrase text
- [ ] Moving away fades out phrase within 0.5s
- [ ] Scroll wheel zooms centered on cursor
- [ ] Click-drag pans the mosaic
- [ ] New shard arriving via WebSocket fades in with gold shimmer

### Integration

- [ ] Live shard from Google Sheet appears on screen without page refresh
- [ ] Real Claude-generated image loads and replaces colored placeholder
- [ ] Live connection phrase appears on thread after second submission
- [ ] Screen looks cohesive at 10+ shards
