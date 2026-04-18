#!/usr/bin/env tsx
/**
 * Build connections between tiles.
 *
 * Runs the Weaver (proposes candidate connections) and the Critic
 * (challenges weak ones). Writes surviving connections to
 * data/connections.json.
 */

import { promises as fs } from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

import { runWeaverCritic } from "../lib/council/weaver";
import type { Deliberation, Tile } from "../lib/types";

const ROOT = process.cwd();
const TILES_JSON = path.join(ROOT, "data", "tiles.json");
const CONN_JSON = path.join(ROOT, "data", "connections.json");
const DELIB_DIR = path.join(ROOT, "data", "deliberations");

async function loadTiles(): Promise<Tile[]> {
  try {
    const raw = await fs.readFile(TILES_JSON, "utf-8");
    return JSON.parse(raw) as Tile[];
  } catch {
    return [];
  }
}

async function loadDeliberations(
  tiles: Tile[]
): Promise<Map<string, Deliberation>> {
  const map = new Map<string, Deliberation>();
  for (const t of tiles) {
    try {
      const p = path.join(DELIB_DIR, `${t.id}.json`);
      const raw = await fs.readFile(p, "utf-8");
      map.set(t.id, JSON.parse(raw) as Deliberation);
    } catch {
      // missing deliberation — weaver will just not have a throughline for this tile
    }
  }
  return map;
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(
      "ANTHROPIC_API_KEY is not set. Copy .env.example to .env.local and fill it in."
    );
    process.exit(1);
  }

  const tiles = await loadTiles();
  if (tiles.length < 2) {
    console.log(
      `Need at least 2 tiles to build connections; found ${tiles.length}.`
    );
    return;
  }

  const deliberations = await loadDeliberations(tiles);
  console.log(
    `Weaving across ${tiles.length} tiles (${deliberations.size} with throughlines)…`
  );

  const connections = await runWeaverCritic(tiles, deliberations);

  const tmp = `${CONN_JSON}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(connections, null, 2), "utf-8");
  await fs.rename(tmp, CONN_JSON);

  console.log(
    `\n${connections.length} connections survived the Critic.\nWritten to ${path.relative(ROOT, CONN_JSON)}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
