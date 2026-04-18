# Kintsugi Network — System Specification

## Overview

Kintsugi Network is an interactive art installation that transforms human vulnerability into collective beauty. Visitors submit three reflections — their biggest regret, proudest moment, and a half-finished dream — through a Google Form. Each submission becomes a unique AI-generated artwork shard shaped like a fragment of broken pottery. All shards compose into a living full-screen mosaic connected by glowing gold threads, inspired by the Japanese philosophy of Kintsugi: the art of honoring fractures with gold.

## System Components

| Component | Responsibility |
|-----------|---------------|
| `Spreadsheet_Parser` | Polls Google Sheets for new visitor submissions every 30s |
| `Content_Safety` | Screens reflections for harmful content using Claude before processing |
| `Shard_Generator` | Uses Claude to reason through visual decisions in 6 steps, then generates the shard image directly |
| `Connection_Analyzer` | Uses Claude to find thematic echoes between submissions and write poetic phrases |
| `Mosaic_Renderer` | PixiJS WebGL frontend rendering shards, gold threads, animations, and interactions |
| REST API + WebSocket | Express backend serving data to the frontend and broadcasting live updates |

## Tech Stack

**Backend**
- Runtime: Node.js + TypeScript
- Framework: Express.js
- Database: SQLite via `better-sqlite3` (file-based, zero infrastructure)
- Google Sheets: `googleapis` npm package (service account auth)
- Claude API: `@anthropic-ai/sdk`
  - `claude-haiku-4-5` for content safety and connection analysis (fast, low cost)
  - `claude-sonnet-4-6` for shard image generation (direct image output via Claude)
- Job Queue: `p-queue` (in-process, no Redis needed)
- Real-time: `ws` WebSocket package

**Frontend**
- Build: Vite + TypeScript
- Renderer: PixiJS v8 (WebGL-backed, 1000+ sprites at 60fps with batching and culling)
- Visual Effects: `pixi-filters` (GlowFilter, BlurFilter)

## Data Flow

```
Google Form → Google Sheets
     ↓
Spreadsheet_Parser (poll every 30s)
  → validate fields, truncate, deduplicate
     ↓
Content_Safety (Claude haiku)
  → flag harmful content, reject if unsafe
     ↓
Shard_Generator (Claude sonnet — direct image generation)
  → Step 1: analyze emotional themes across all 3 reflections
  → Step 2: derive central visual metaphor (abstract, elemental)
  → Step 3: select color palette from emotional content
  → Step 4: specify ceramic surface & crack texture
  → Step 5: plan composition (center, edges, gold entry point)
  → Step 6: generate 512×512 abstract kintsugi shard image
  → decode base64 → save PNG to /public/shards/<id>.png
     ↓ (async, non-blocking)
Connection_Analyzer (Claude haiku)
  → compare new shard against 10 recent shards
  → generate poetic connection phrases (≤50 chars)
     ↓
WebSocket broadcast → PixiJS Mosaic_Renderer
```

---

## Data Models

### `shards` table

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PRIMARY KEY | UUID v4 |
| `row_index` | INTEGER UNIQUE | Spreadsheet row (deduplication key) |
| `regret` | TEXT NOT NULL | Visitor's biggest regret (≤500 chars) |
| `proud` | TEXT NOT NULL | Visitor's proudest moment (≤500 chars) |
| `dream` | TEXT NOT NULL | Visitor's half-finished dream (≤500 chars) |
| `image_url` | TEXT | Relative path: `/shards/<id>.png` |
| `image_prompt` | TEXT | Claude's step 1–5 reasoning (stored for debugging and connection analysis) |
| `shape_seed` | INTEGER NOT NULL | Deterministic RNG seed for polygon shape |
| `position_x` | REAL | Normalized [0,1] canvas position |
| `position_y` | REAL | Normalized [0,1] canvas position |
| `rotation` | REAL | Rotation in radians |
| `scale` | REAL | Scale multiplier |
| `status` | TEXT | `pending \| processing \| complete \| failed \| rejected` |
| `created_at` | INTEGER | Unix timestamp (ms) |
| `layer_order` | INTEGER | Insertion order (z-index in mosaic) |

### `connections` table

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PRIMARY KEY | UUID v4 |
| `shard_a_id` | TEXT | Foreign key → shards.id |
| `shard_b_id` | TEXT | Foreign key → shards.id |
| `phrase` | TEXT | Poetic connection (≤50 chars, Claude-generated) |
| `theme` | TEXT | Optional thematic tag (e.g. "loss", "hope") |
| `created_at` | INTEGER | Unix timestamp (ms) |

### `processed_rows` table

| Column | Type | Description |
|--------|------|-------------|
| `row_index` | INTEGER PRIMARY KEY | Spreadsheet row index |
| `status` | TEXT | `imported \| rejected \| failed` |
| `reason` | TEXT | Rejection/failure reason (nullable) |
| `processed_at` | INTEGER | Unix timestamp (ms) |

### `system_state` table

| Column | Type | Description |
|--------|------|-------------|
| `key` | TEXT PRIMARY KEY | State key |
| `value` | TEXT | State value (e.g. `last_processed_row_index`) |

---

## API Contracts

### REST Endpoints

```
GET /api/shards
  Query params: since=<layer_order> (optional), limit=<n> (default 100)
  Response: { shards: Shard[], total: number }
  Purpose: Initial mosaic load and incremental catch-up

GET /api/shards/:id
  Response: { shard: Shard }

GET /api/connections
  Query params: shard_id=<id> (optional filter)
  Response: { connections: Connection[] }

GET /api/mosaic/state
  Response: { total_shards: number, pending: number, last_updated: number }

GET /api/health
  Response: { ok: true, db: "connected", sheets: "connected" }
```

### WebSocket Events

**Server → Client**

| Event | Payload | When |
|-------|---------|------|
| `shard:new` | `{ shard: Shard }` | Image generation complete |
| `connection:new` | `{ connection: Connection }` | Claude identifies a new poetic link |
| `mosaic:stats` | `{ total: number, pending: number }` | Heartbeat every 30s |

**Client → Server**

| Event | When |
|-------|------|
| `ping` | Client keepalive |

### Shared TypeScript Types (`src/types.ts`)

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

---

## Claude API Prompt Designs

### 1. Content Safety Screening (`claude-haiku-4-5`)

**System prompt:**
```
You are a content safety filter for an art installation about human vulnerability.
Respond ONLY with JSON: {"safe": true} or {"safe": false, "reason": "..."}
Flag content that is: violent, sexually explicit, hateful, promoting self-harm,
or contains real personal information (phone numbers, addresses, full names with context).
Grief, loss, regret, darkness, and emotional pain are safe — they are the artistic point.
Complete in under 3 seconds.
```

**User message:** `Regret: <text>\nProud moment: <text>\nDream: <text>`

---

### 2. Shard Image Generation (`claude-sonnet-4-6` — direct image output)

Claude generates the shard image directly. The prompt instructs Claude to reason through six explicit steps before creating the image. This structured approach ensures every visual decision is grounded in the visitor's specific reflections rather than producing generic abstract art.

#### System Prompt

```
You are an artist-in-residence for a kintsugi art installation.
Your task is to create a single square image (512×512) that will become one shard
in a collective mosaic of human stories. The image is a close-up of a broken pottery
fragment — the surface texture of a ceramic piece with visible cracks, aged glaze,
and raw clay edges. The imagery must be purely abstract: no text, no faces, no
recognizable figures or objects. Only color, texture, light, and form.

You will reason through six steps before generating. Show your thinking for each step,
then produce the image.
```

#### User Message (filled with visitor's reflections)

```
A visitor to our installation submitted these three reflections:

REGRET: "<regret text>"
PROUDEST MOMENT: "<proud text>"
HALF-FINISHED DREAM: "<dream text>"

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
  fracture begins to heal. Optional but use it if the emotional arc needs a bridge.

Colors in this palette must feel aged and glazed, not fresh or saturated.
Think: pigment absorbed into ceramic, not paint on canvas.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 4 — CERAMIC SURFACE & CRACK TEXTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Specify the physical character of the pottery surface. Each choice should reflect
the emotional weight of the reflections:

- CRACK DENSITY: How fractured is this shard?
  sparse (1-2 major cracks) = dignified, private grief
  moderate (web of hairlines) = complexity held together
  dense (crazing across entire surface) = overwhelm, transformation
- GLAZE FINISH:
  matte and dry = subdued, exhausted, past tense
  crackled glaze (fine crazing lines) = tension, held complexity
  pooled or runny glaze = movement, still-becoming, hopeful
  unglazed raw clay patches = exposed, honest, unfinished
- AGE OF BREAK:
  fresh fracture (bright, clean clay edge) = recent wound or recent arrival
  old break (darkened, worn smooth) = long-carried, part of identity now
- GOLD ENTRY POINT: Where on the surface does the kintsugi gold seep in?
  This is where healing enters. Place it where the emotional tension is highest.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 5 — COMPOSITION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Plan the image layout before generating it:

- CENTER: What is the focal point? The visual metaphor from Step 2 should anchor here.
  Is it light emanating outward? A convergence of colors? A texture at its most intense?
- EDGES: What bleeds into the jagged shard border? The edge is where the break happened —
  the raw clay, the oldest wound. Let the color or metaphor dissolve or intensify here.
- LIGHTING: Single directional light source. Where does it enter?
  (upper left, raking across = reveals texture
   center glow from within = warmth, interiority
   edge-lit, dark center = isolation, mystery)
- DEPTH: Does the surface feel recessed (depth, weight, gravity) or raised
  (relief, presence, declaration)?
- GOLD: The kintsugi seam is the line of repair. It should trace the most significant
  crack — the one that, if missing, would split the shard entirely.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 6 — GENERATE THE IMAGE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Now create the shard image using everything from Steps 1–5.

The image must be:
- Square (1:1 aspect ratio), 512×512 pixels
- A close-up of a pottery shard surface — as if the camera is inches away from the ceramic
- Abstract: no text, no faces, no recognizable figures or symbols
- Cohesive: the palette, texture, metaphor, and gold all feel like they belong
  to the same person's story
- Kintsugi: gold seams are luminous and deliberate — they are not damage,
  they are the most intentional lines in the image

Style reference: the textural intimacy of Anselm Kiefer's surfaces, the color restraint
of Japanese raku ceramics, the emotional directness of Mark Rothko's fields — but
rendered as ceramic artifact, not canvas painting.
```

#### What Claude Returns

Claude reasons through steps 1–5 in plain text (visible in logs for debugging), then produces the image. The backend:
1. Extracts the `image` content block from the response
2. Decodes the base64 PNG data
3. Saves to `/public/shards/<id>.png`
4. Stores the step 1–5 reasoning as `image_prompt` in SQLite (useful for debugging and connection analysis)

#### Example of Claude's Reasoning (Steps 1–5)

For a visitor who wrote:
- **Regret:** "I stopped painting when I got the job offer. I told myself it was temporary."
- **Proud:** "I learned to cook my grandmother's recipes from memory after she died."
- **Dream:** "A series of paintings about the kitchens of the women in my family."

Claude might reason:

> **Step 1 — Emotional Analysis:** The regret is quiet self-abandonment — something creative that was deferred and calcified into permanence. The proud moment is an act of embodied memory, keeping something alive through hands and practice. The dream holds the two together: the creative work was never gone, it transformed into a different medium and a deeper subject. The underlying note: grief transmuted into inheritance.
>
> **Step 2 — Metaphor:** *Embers in clay.* Fire that has been banked but not extinguished — still warm beneath ash, waiting for air. This holds the long deferral (banked), the survival of something essential (the heat), and the potential of the dream (air would wake it).
>
> **Step 3 — Palette:** Base: raw umber with a warm grey cast (the ash, the waiting). Accent: deep amber-orange, like the glow visible at the center of an ember (the creative heat, still present). Transition: a dusty rose-clay, the color of flour-dusted hands — linking the cooking to the painting.
>
> **Step 4 — Surface:** Moderate crackle glaze — the surface held together but visibly stressed. Unglazed patches at the edges (raw, unfinished — the dream not yet started). The break is old, edges worn smooth (this was carried for years). Gold entry point: at the center, where the warmest color pools — healing enters exactly where the creative fire still lives.
>
> **Step 5 — Composition:** Center: a warm amber glow diffusing outward through the crackle lines — as if lit from within. Edges dissolve into cool umber and unglazed clay. Upper left light source, raking, to emphasize the raised texture of the crazing. The gold seam runs from the center glow diagonally to the upper right edge — the crack that would split it is the one between the life she chose and the one she set down.

---

### 3. Poetic Connection Analysis (`claude-haiku-4-5`)

**System prompt:**
```
You are a poet finding hidden connections between strangers' confessions.
Given a new visitor's reflections and up to 10 existing reflections, identify pairs
that share a meaningful thematic echo (loss, longing, joy, transformation, etc.).
Only output connections that are genuinely resonant — skip weak or surface matches.
For each real connection, write a poetic phrase of no more than 50 characters.
Respond ONLY with a JSON array: [{"shard_id": "...", "phrase": "..."}]
Return an empty array [] if no strong connections exist.
```

**User message:** New shard reflections + list of `{ id, regret, proud, dream }` for recent shards.

---

## Shard Shape System

Each shard's irregular polygon is generated **deterministically** from its `shape_seed` (a hash of the shard UUID). The same algorithm runs on both the backend (for metadata storage) and the frontend (for PixiJS masking), ensuring consistency.

### Algorithm

1. Seed a Linear Congruential Generator (LCG) with `shape_seed`
2. Choose N = 7–12 control points (N determined by seed)
3. Place points at equal angular intervals around a circle of radius R
4. Displace each point radially by ±40% using the seeded LCG
5. Insert 2–4 sharp concave "notch" points at random intervals to simulate pottery cracks
6. Smooth the polygon with a Catmull-Rom spline (tension 0.3) for organic edges
7. Normalize all points to a unit square [0, 1] × [0, 1]

The resulting array of `[x, y]` points is used on the frontend to create a `PIXI.Graphics` mask applied to the shard's image texture.

---

## Gold Thread System

Gold threads are `PIXI.Graphics` Bezier curves rendered in a dedicated container layer above the shard layer.

**Thread generation:** For each pair of shards that share a poetic `Connection`, draw a cubic Bezier curve from a point on one shard's polygon edge to a point on the other's, with control points offset perpendicular to the line for a natural arc.

**Visual style:**
- Line: width 3px, color `0xFFD700`, alpha 0.85
- Gold edge glow: same polygon outline on each shard, drawn as a wide blurred stroke

**Proximity glow:** A `GlowFilter` (from `pixi-filters`) is applied to the thread container. Each frame, cursor distance to each thread's midpoint is computed and mapped to `outerStrength`:

```
glowStrength = Math.max(0, 1 - cursorDist / GLOW_RADIUS)
thread.glowFilter.outerStrength = BASE_GLOW + glowStrength * MAX_EXTRA_GLOW
```

---

## Frontend Layer Stack (PixiJS v8)

```
PIXI.Application (resizeTo: window)
└── worldContainer              ← zoom/pan transform applied here
    ├── BackgroundLayer          ← solid fill 0x1a0a00
    ├── ShardLayer               ← all ShardSprite containers
    ├── ThreadLayer              ← all GoldThread Graphics
    └── UILayer                  ← PoeticLabel text, HUD counters
```

### ShardSprite (`PIXI.Container`)

Each shard is a container with three children:

1. `PIXI.Sprite` — the generated shard image texture
2. `PIXI.Graphics` mask — the irregular polygon silhouette (applied as sprite mask)
3. `PIXI.Graphics` edge glow — same polygon drawn with a wide gold stroke + `BlurFilter`

**Interaction:**
- `eventMode = 'static'`, `cursor = 'pointer'`
- `onpointerover`: `setHovered(true)` → lerp scale to 1.05×, ColorMatrixFilter brightness +20%
- `onpointerout`: `setHovered(false)` → lerp back to base scale

**Breathing animation (in AnimationLoop per frame):**
```
if distance(cursor, shard.center) < BREATH_RADIUS:
  shard.breathPhase += 0.02
  breathScale = 1 + Math.sin(shard.breathPhase) * 0.015
  shard.scale.set(shard.baseScale * breathScale * shard.hoverScale)
```

### Performance Strategy (1000+ shards)

| Technique | Implementation |
|-----------|---------------|
| Viewport culling | `shard.visible = false` when outside camera bounds; PIXI skips draw calls |
| Level of Detail | zoom < 0.3 → flat colored polygon (no texture); zoom > 0.3 → full texture |
| Lazy connection loading | Only load connections for the currently visible viewport region |
| PIXI Ticker | Built-in RAF ticker auto-throttles to display refresh rate |

### Shard Placement Algorithm

1. **First 4 shards**: placed at the centers of the four screen quadrants
2. **Subsequent shards**: Poisson disk sampling — generate a candidate position, verify it doesn't overlap >20% with any existing shard's bounding circle, retry up to 30 times if it does
3. **Determinism**: position, rotation, and scale are all seeded from `shape_seed` — the mosaic is reproducible after a restart
4. **Storage**: normalized [0,1] positions stored in SQLite and scaled to viewport at render time

---

## State Persistence & Restart Recovery

The Google Spreadsheet is the authoritative source of truth. On restart:

1. SQLite opens (creates and migrates if new)
2. Any shards stuck at `status='processing'` are re-queued to `'pending'`
3. `last_processed_row_index` is read from `system_state`
4. Spreadsheet polling resumes from `(last_processed_row_index + 1)`
5. Frontend loads all `status='complete'` shards via `GET /api/shards` in `layer_order` sequence
6. Frontend connects WebSocket for live updates

---

## Content Safety Requirements

Per Requirement 9:

- All three reflection fields are screened by Claude haiku before any processing begins
- Screening must complete within 3 seconds per entry
- If flagged: shard status set to `rejected`, row logged in `processed_rows` with reason, operator log entry written with full content for review
- Grief, loss, darkness, and emotional pain are explicitly **permitted** — they are the artistic core

---

## Environment Configuration

```
# Google Sheets
GOOGLE_SHEETS_SPREADSHEET_ID=
GOOGLE_SHEETS_CREDENTIALS_JSON=    # base64-encoded service account JSON

# AI Services
ANTHROPIC_API_KEY=

# Server
PORT=3000
POLL_INTERVAL_MS=30000

# Storage
DB_PATH=./kintsugi.db
SHARDS_DIR=./public/shards

# Processing Limits
MAX_REFLECTION_LENGTH=500
CONTENT_SAFETY_TIMEOUT_MS=3000
MAX_CONNECTIONS_PER_SHARD=3
NEARBY_SHARDS_FOR_ANALYSIS=10
```
