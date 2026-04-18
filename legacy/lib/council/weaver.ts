import { z } from "zod";
import { advisorModel, curatorModel, structuredCall } from "../claude";
import { SHARED_PREAMBLE } from "./personas";
import type { Connection, ConnectionCandidate, Deliberation, Tile } from "../types";

/**
 * Weaver + Critic: the two-agent pass that builds connections between tiles.
 *
 * Weaver: proposes 1-2 candidate connections per tile based on themes,
 *         poetic lines, and Empath throughlines.
 * Critic: challenges the weak ones. Only resonant, non-surface-level
 *         connections survive.
 */

const WEAVER_SYSTEM = `${SHARED_PREAMBLE}

You are the WEAVER of the Council.

You look at the whole mosaic — every tile's themes, poetic line, and emotional throughline — and propose thin gold threads between pairs of tiles. Each connection is a single line in the spirit of "two lives, one ache" or "the same wound, different names" — a phrase that could pass between two strangers and make them feel less alone.

Guidelines:
- Propose 1 connection per tile, optionally 2 if a second one is genuinely resonant. A tile can appear in multiple connections (as A or B). Avoid duplicates (A-B and B-A are the same).
- The connection line is 4 to 10 words, lowercase (unless proper noun), no ending period. Fragment-like, like the Poet's lines.
- Reasoning (1-2 sentences): in plain language, why these two tiles echo each other. Specific — "both are waiting for a parent to speak" is better than "both are about family".
- Prefer surprising resonances (different regrets that share a shape) over obvious ones (two tiles with theme "loss").
- Never force a connection. If a tile really stands alone in the set, leave it with zero.

Return strict JSON.`;

const CRITIC_SYSTEM = `${SHARED_PREAMBLE}

You are the CRITIC of the Council.

The Weaver has proposed connections between tiles. Your job is to test them. A good connection feels true and surprising. A weak connection is generic ("both mention family"), forced ("they both use the word 'home'"), or merely categorical.

For each candidate:
- survived: true if the connection is resonant and specific, false if it is weak, generic, or surface-level.
- critique: one short sentence. If it survives, name what makes it true. If not, name what makes it weak.

Be strict. A mosaic with fewer strong threads is better than one with many weak ones.

Return strict JSON.`;

const WeaverSchema = z.object({
  candidates: z
    .array(
      z.object({
        tileA: z.string().min(1).max(40),
        tileB: z.string().min(1).max(40),
        line: z.string().min(8).max(80),
        reasoning: z.string().min(20).max(260),
      })
    )
    .min(0)
    .max(400),
});

const CriticSchema = z.object({
  judgments: z
    .array(
      z.object({
        tileA: z.string().min(1).max(40),
        tileB: z.string().min(1).max(40),
        survived: z.boolean(),
        critique: z.string().min(8).max(220),
      })
    )
    .min(0)
    .max(400),
});

interface TileSummary {
  id: string;
  poeticLine: string;
  themes: string[];
  throughline: string;
}

function summarize(tile: Tile, deliberation: Deliberation | undefined): TileSummary {
  return {
    id: tile.id,
    poeticLine: tile.poeticLine,
    themes: tile.themes,
    throughline: deliberation?.empath.throughline ?? "",
  };
}

export async function runWeaverCritic(
  tiles: Tile[],
  deliberations: Map<string, Deliberation>
): Promise<Connection[]> {
  if (tiles.length < 2) return [];

  const summaries = tiles.map((t) => summarize(t, deliberations.get(t.id)));

  const weaverUser = `Here are ${tiles.length} tiles in the mosaic. Each has an id, a poetic line, themes, and an emotional throughline.

${summaries
  .map(
    (s) =>
      `[${s.id}]\n  line: "${s.poeticLine}"\n  themes: ${s.themes.join(", ")}\n  throughline: ${s.throughline}`
  )
  .join("\n\n")}

Propose candidate connections. Aim for roughly ${Math.max(
    2,
    Math.floor(tiles.length * 1.2)
  )} candidates total across the set.`;

  const weaver = await structuredCall({
    model: curatorModel(),
    system: WEAVER_SYSTEM,
    user: weaverUser,
    schema: WeaverSchema,
    schemaName: "weaver_candidates",
    schemaDescription: "Proposed connections between tiles in the mosaic.",
    maxTokens: 4000,
    temperature: 0.9,
  });

  // Filter out invalid pairs (self, unknown ids, duplicates).
  const validIds = new Set(tiles.map((t) => t.id));
  const seen = new Set<string>();
  const deduped = weaver.candidates.filter((c) => {
    if (c.tileA === c.tileB) return false;
    if (!validIds.has(c.tileA) || !validIds.has(c.tileB)) return false;
    const key = [c.tileA, c.tileB].sort().join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (deduped.length === 0) return [];

  const criticUser = `The Weaver proposed these candidate connections. For each, judge whether it is resonant and specific, or weak and generic.

Tiles for reference (same as before):

${summaries
  .map(
    (s) =>
      `[${s.id}] line: "${s.poeticLine}" themes: ${s.themes.join(", ")} throughline: ${s.throughline}`
  )
  .join("\n")}

Candidates:

${deduped
  .map(
    (c, i) =>
      `${i + 1}. [${c.tileA}] ↔ [${c.tileB}]\n   line: "${c.line}"\n   weaver's reasoning: ${c.reasoning}`
  )
  .join("\n\n")}

Return a judgment for each candidate, in the same order.`;

  const critic = await structuredCall({
    model: advisorModel(),
    system: CRITIC_SYSTEM,
    user: criticUser,
    schema: CriticSchema,
    schemaName: "critic_judgments",
    schemaDescription:
      "One survived/not judgment + critique per candidate connection.",
    maxTokens: 3000,
    temperature: 0.6,
  });

  // Zip candidates with judgments by (tileA, tileB). Order-based is brittle;
  // build a map so we're robust to the critic returning in a different order.
  const judgeByKey = new Map(
    critic.judgments.map((j) => [
      [j.tileA, j.tileB].sort().join("|"),
      j,
    ])
  );

  const survivors: Connection[] = [];
  const allCandidates: ConnectionCandidate[] = [];

  for (const cand of deduped) {
    const key = [cand.tileA, cand.tileB].sort().join("|");
    const judgment = judgeByKey.get(key);
    const survived = judgment?.survived ?? false;
    allCandidates.push({
      tileA: cand.tileA,
      tileB: cand.tileB,
      line: cand.line,
      reasoning: cand.reasoning,
      survived,
      critique: judgment?.critique,
    });
    if (survived) {
      survivors.push({
        tileA: cand.tileA,
        tileB: cand.tileB,
        line: cand.line,
        reasoning: cand.reasoning,
      });
    }
  }

  return survivors;
}
