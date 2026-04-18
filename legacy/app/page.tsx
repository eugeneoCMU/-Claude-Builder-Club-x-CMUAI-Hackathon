import { promises as fs } from "fs";
import path from "path";
import Mosaic from "./components/Mosaic";
import EmptyState from "./components/EmptyState";
import type { Tile, Connection } from "@/lib/types";

export const dynamic = "force-dynamic";

async function loadTiles(): Promise<Tile[]> {
  const tilesPath = path.join(process.cwd(), "data", "tiles.json");
  try {
    const raw = await fs.readFile(tilesPath, "utf-8");
    return JSON.parse(raw) as Tile[];
  } catch {
    return [];
  }
}

async function loadConnections(): Promise<Connection[]> {
  const p = path.join(process.cwd(), "data", "connections.json");
  try {
    const raw = await fs.readFile(p, "utf-8");
    return JSON.parse(raw) as Connection[];
  } catch {
    return [];
  }
}

async function loadSvgs(
  tiles: Tile[]
): Promise<Record<string, string>> {
  const entries = await Promise.all(
    tiles.map(async (t) => {
      try {
        const svgAbs = path.join(process.cwd(), "public", t.svgPath);
        const svg = await fs.readFile(svgAbs, "utf-8");
        return [t.id, svg] as const;
      } catch {
        return [t.id, ""] as const;
      }
    })
  );
  return Object.fromEntries(entries);
}

export default async function Page() {
  const [tiles, connections] = await Promise.all([loadTiles(), loadConnections()]);

  if (tiles.length === 0) {
    return <EmptyState />;
  }

  const svgs = await loadSvgs(tiles);

  return <Mosaic tiles={tiles} connections={connections} svgs={svgs} />;
}
