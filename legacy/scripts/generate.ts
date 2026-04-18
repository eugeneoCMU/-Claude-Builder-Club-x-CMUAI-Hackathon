#!/usr/bin/env tsx
/**
 * CSV → Council → tiles
 *
 * Reads data/entries.csv, hashes each row's content, runs the five-voice
 * Council deliberation for rows that haven't been processed yet, and writes:
 *
 *   - public/tiles/<id>.svg          (the rendered SVG)
 *   - data/tiles.json                (array of tile metadata)
 *   - data/deliberations/<id>.json   (full council transcript)
 *
 * Idempotent: re-running skips tiles whose content hash matches an existing
 * entry. Safe to ctrl-c mid-batch — each tile is written atomically before
 * the next call starts.
 */

import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

import { deliberate } from "../lib/council/orchestrator";
import type { Entry, Tile, Deliberation } from "../lib/types";

const ROOT = process.cwd();
const ENTRIES_CSV = path.join(ROOT, "data", "entries.csv");
const TILES_JSON = path.join(ROOT, "data", "tiles.json");
const TILES_DIR = path.join(ROOT, "public", "tiles");
const DELIB_DIR = path.join(ROOT, "data", "deliberations");

interface CsvRow {
  name?: string;
  regret?: string;
  proud?: string;
  dream?: string;
}

function hashEntry(row: CsvRow): string {
  const payload = `${(row.regret ?? "").trim()}|${(row.proud ?? "").trim()}|${(
    row.dream ?? ""
  ).trim()}`;
  return createHash("sha256").update(payload).digest("hex").slice(0, 12);
}

async function ensureDirs() {
  await fs.mkdir(TILES_DIR, { recursive: true });
  await fs.mkdir(DELIB_DIR, { recursive: true });
  await fs.mkdir(path.dirname(TILES_JSON), { recursive: true });
}

async function loadExistingTiles(): Promise<Tile[]> {
  let raw: string;
  try {
    raw = await fs.readFile(TILES_JSON, "utf-8");
  } catch (err) {
    // File doesn't exist yet — fresh start.
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return [];
    throw err;
  }
  try {
    return JSON.parse(raw) as Tile[];
  } catch {
    throw new Error(
      `data/tiles.json exists but is not valid JSON. Refusing to silently overwrite work. ` +
        `Inspect it, fix or remove it, then re-run.`
    );
  }
}

async function saveTiles(tiles: Tile[]): Promise<void> {
  const tmp = `${TILES_JSON}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(tiles, null, 2), "utf-8");
  await fs.rename(tmp, TILES_JSON);
}

async function readEntries(): Promise<Entry[]> {
  let raw: string;
  try {
    raw = await fs.readFile(ENTRIES_CSV, "utf-8");
  } catch {
    throw new Error(
      `No entries file found at ${ENTRIES_CSV}.\n` +
        `Export your spreadsheet as CSV with columns: name (optional), regret, proud, dream.`
    );
  }

  const rows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as CsvRow[];

  const entries: Entry[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const regret = (row.regret ?? "").trim();
    const proud = (row.proud ?? "").trim();
    const dream = (row.dream ?? "").trim();
    if (!regret && !proud && !dream) continue;
    if (!regret || !proud || !dream) {
      console.warn(
        `  skipping row ${i + 1}: needs all three of regret, proud, dream`
      );
      continue;
    }
    const contentHash = hashEntry(row);
    entries.push({
      id: contentHash,
      name: row.name?.trim() || undefined,
      regret,
      proud,
      dream,
      contentHash,
    });
  }
  return entries;
}

function tileFromDeliberation(d: Deliberation, svgPath: string): Tile {
  return {
    id: d.entry.id,
    name: d.entry.name,
    regret: d.entry.regret,
    proud: d.entry.proud,
    dream: d.entry.dream,
    contentHash: d.entry.contentHash,
    palette: d.curator.palette,
    poeticLine: d.curator.poeticLine,
    themes: d.curator.themes,
    councilWhispers: d.curator.councilWhispers,
    svgPath,
    createdAt: new Date().toISOString(),
  };
}

async function main() {
  await ensureDirs();

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(
      "ANTHROPIC_API_KEY is not set. Copy .env.example to .env.local and fill it in."
    );
    process.exit(1);
  }

  const entries = await readEntries();
  if (entries.length === 0) {
    console.log("No entries found in data/entries.csv. Add some rows and re-run.");
    return;
  }

  const existing = await loadExistingTiles();
  const byHash = new Map(existing.map((t) => [t.contentHash, t]));

  // Deduplicate within this CSV: two rows with identical content share a hash
  // and would otherwise overwrite each other's tile files. Keep the first.
  const seenInCsv = new Set<string>();
  const uniqueEntries: Entry[] = [];
  let csvDupes = 0;
  for (const e of entries) {
    if (seenInCsv.has(e.contentHash)) {
      csvDupes++;
      continue;
    }
    seenInCsv.add(e.contentHash);
    uniqueEntries.push(e);
  }

  const todo = uniqueEntries.filter((e) => !byHash.has(e.contentHash));

  console.log(`Entries in CSV:        ${entries.length}`);
  if (csvDupes > 0) {
    console.log(`Duplicate rows:        ${csvDupes} (skipped — same content hash)`);
  }
  console.log(`Already generated:     ${uniqueEntries.length - todo.length}`);
  console.log(`To generate:           ${todo.length}\n`);

  if (todo.length === 0) {
    console.log("Mosaic is up to date. Nothing to do.");
    return;
  }

  const tiles: Tile[] = [...existing];

  for (let i = 0; i < todo.length; i++) {
    const entry = todo[i];
    const label = entry.name ? `"${entry.name}"` : `#${entry.id}`;
    console.log(`[${i + 1}/${todo.length}] Council deliberating on ${label}…`);

    try {
      const deliberation = await deliberate(entry);

      const svgRelative = `/tiles/${entry.id}.svg`;
      const svgAbsolute = path.join(TILES_DIR, `${entry.id}.svg`);
      await fs.writeFile(svgAbsolute, deliberation.curator.svg, "utf-8");

      const delibFile = path.join(DELIB_DIR, `${entry.id}.json`);
      await fs.writeFile(
        delibFile,
        JSON.stringify(deliberation, null, 2),
        "utf-8"
      );

      const tile = tileFromDeliberation(deliberation, svgRelative);
      tiles.push(tile);
      byHash.set(tile.contentHash, tile);
      await saveTiles(tiles);

      console.log(
        `   "${deliberation.curator.poeticLine}"  ` +
          `(empath ${deliberation.timingMs.empath}ms, ` +
          `advisors ${deliberation.timingMs.advisors}ms, ` +
          `curator ${deliberation.timingMs.curator}ms)\n`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`   ✗ failed: ${msg}\n`);
    }
  }

  console.log(`\nDone. ${tiles.length} tiles in the mosaic.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
