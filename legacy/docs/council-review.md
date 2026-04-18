# Council Review

During development, three parallel Claude Code subagents reviewed the project before the first generation run. Each had a distinct lens. This document preserves their findings and records what was changed in response. It is both a build log and a working playbook for future tuning passes.

To run a new round, dispatch these three subagent prompts in parallel and fold their findings back into the persona prompts, pipeline, or UI as appropriate. See the prompts in the commit that introduced this file; they are reproducible.

---

## Subagent 1 — Persona prompt reviewer

**Scope:** all five persona system prompts in [`lib/council/personas.ts`](../lib/council/personas.ts) plus each persona runner and `lib/types.ts`.

**Key findings:**

1. **Empath / Philosopher overlap.** Both were being asked to name "latent structure" — the Empath's `tension` and the Philosopher's `fractureLocation` often restated each other.
2. **Empath projection risk.** "Listen more deeply than the person themselves" invited over-interpretation and clinical labels.
3. **Poet cliché risk.** No protection against greeting-card lines; Zod allowed 8–80 chars while the prompt said 4–8 words.
4. **Curator prompt vs schema mismatch.** Prompt said "under ~2500 characters" but Zod allowed up to 4000.
5. **SVG validator gaps.** `<style>`, `<tspan>`, external `<use href>`, and `viewBox` on a nested SVG could slip through.

**Changes applied:**

- Empath prompt rewritten: bans clinical language, requires staying descriptive not definitive, scopes inference strictly to the person's own words.
- Philosopher prompt rewritten: explicit boundary — "do not repeat the Empath in different words. One location. One gold. One honored truth."
- Curator prompt now contains an explicit synthesis checklist (must honor at least one Artist symbol, palette overlap, gold where Philosopher said, Poet line chosen or gently refined).
- Curator size budget aligned: both prompt and schema now say ~4000 chars.
- `validateCuratorOutput` in [`lib/council/curator.ts`](../lib/council/curator.ts) now:
  - Checks `viewBox="0 0 400 400"` is on the root element (not just any `<svg>`).
  - Blocks `<style>`, `<tspan>`, `<script>`, `<foreignObject>`, `<image>`, `<text>`.
  - Blocks external `<use href>` and `<use xlink:href>` (internal `#…` references still allowed).
  - Verifies `<svg>` / `</svg>` open/close counts match.

---

## Subagent 2 — Pipeline / orchestration reviewer

**Scope:** `lib/council/orchestrator.ts`, `lib/council/weaver.ts`, both scripts, `lib/claude.ts`, `lib/zodToJsonSchema.ts`, `lib/types.ts`.

**Key findings:**

1. **In-batch duplicate hashes not deduplicated.** Two CSV rows with identical content would overwrite each other's tile files.
2. **Silent corruption.** `loadExistingTiles` returned `[]` on any parse failure — a malformed `tiles.json` would quietly trigger regenerating the entire mosaic.
3. **Non-atomic `connections.json` write.** A crash mid-write could leave the file partial.
4. **`byHash` not updated in-session** after each successful tile — mattered only in edge cases but trivial to fix.
5. *(Noted but not addressed)* advisors use `structuredCall` without retry. Deferred — schema violations from advisor personas have been rare in testing; adding retries everywhere has cost implications.

**Changes applied:**

- [`scripts/generate.ts`](../scripts/generate.ts):
  - `loadExistingTiles` now throws on invalid JSON instead of silently returning `[]`. File-not-exist is still treated as a fresh start.
  - CSV deduped in-memory before running; duplicate rows are reported and skipped.
  - `byHash` map updated after each successful tile so in-session logic is correct.
- [`scripts/connect.ts`](../scripts/connect.ts): `connections.json` now written via `tmp` + `rename` (atomic).

---

## Subagent 3 — UI / mosaic reviewer

**Scope:** all files under `app/`.

**Key findings:**

1. **Hydration mismatch.** [`app/components/Tile.tsx`](../app/components/Tile.tsx) used `Math.random()` in the render path for the breathing animation offset, causing server/client divergence and phase jumps on re-renders.
2. **Seams misaligned with CSS grid gaps.** The original `GoldSeams` used a single SVG with `viewBox="0 0 cols rows"` and `preserveAspectRatio="none"` — seams fell at equal fractions of the container, not where the CSS `gap` actually was.
3. **Root SVG `style` not sanitized.** `wrapSvgMarkup` stripped `width` and `height` but not a root-level `style` or `class` attribute that a generated SVG might carry.
4. *(Noted but deferred)* modal focus management — no focus trap / restoration.
5. *(Noted but deferred)* responsive column cap for very narrow viewports.

**Changes applied:**

- Tile breathing phase is now derived from a stable FNV-1a hash of the tile id. No `Math.random()` in render; no hydration mismatch; no phase jumps.
- [`app/components/GoldSeams.tsx`](../app/components/GoldSeams.tsx) completely rewritten. Each seam is now an absolutely-positioned element whose `top` / `left` are CSS `calc()` expressions referencing the same column/row tracks and `--mosaic-gap` variable as the grid itself. Seam positions stay aligned with the actual gaps at any viewport size. Each seam still carries a small SVG tremor path for the mended-not-manufactured feel.
- `Mosaic` now exposes `--mosaic-gap` as a CSS variable so `GoldSeams` can reference the same value the grid uses.
- `wrapSvgMarkup` in [`app/components/Tile.tsx`](../app/components/Tile.tsx) now also strips root-level `style` and `class` attributes from generated SVGs.

---

## Not addressed in this pass

These were flagged but intentionally deferred:

- **Advisor retries.** Only Curator retries on schema failure. If this becomes a problem after first-batch testing, adding `structuredCallWithRetry` to the three advisors is a one-line change each.
- **Modal focus management.** Accessibility polish. Add focus trap / restore on a future pass.
- **Responsive tile cap for small screens.** `gridDimensions` always uses `ceil(sqrt(n))` columns; on phones with 50+ tiles the cells become unreadable. Add a viewport-based column cap if the piece is expected to be viewed on phones.

Each subagent's full report is in the agent transcripts attached to the commit that introduced this review.
