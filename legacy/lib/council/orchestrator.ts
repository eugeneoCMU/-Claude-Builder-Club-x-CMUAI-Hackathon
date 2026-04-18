import type { Deliberation, Entry } from "../types";
import { runEmpath } from "./empath";
import { runKintsugiPhilosopher } from "./kintsugiPhilosopher";
import { runPoet } from "./poet";
import { runVisualArtist } from "./visualArtist";
import { runCurator } from "./curator";

/**
 * Run the full five-voice Council deliberation for a single entry.
 *
 * Flow:
 *   1. Empath listens.
 *   2. Poet, Visual Artist, Kintsugi Philosopher each respond to the Empath
 *      in parallel.
 *   3. Curator synthesizes all four into the final tile.
 */
export async function deliberate(entry: Entry): Promise<Deliberation> {
  const started = Date.now();

  // 1. Empath first — everyone else builds on their read.
  const t0 = Date.now();
  const empath = await runEmpath(entry);
  const empathMs = Date.now() - t0;

  // 2. Three advisors in parallel.
  const t1 = Date.now();
  const [poet, artist, philosopher] = await Promise.all([
    runPoet(entry, empath),
    runVisualArtist(entry, empath),
    runKintsugiPhilosopher(entry, empath),
  ]);
  const advisorsMs = Date.now() - t1;

  // 3. Curator synthesizes.
  const t2 = Date.now();
  const curator = await runCurator(entry, empath, poet, artist, philosopher);
  const curatorMs = Date.now() - t2;

  return {
    tileId: entry.id,
    entry,
    empath,
    poet,
    artist,
    philosopher,
    curator,
    timingMs: {
      empath: empathMs,
      advisors: advisorsMs,
      curator: curatorMs,
      total: Date.now() - started,
    },
  };
}
