"use client";

import { useCallback, useMemo, useState } from "react";
import type { Connection, Tile as TileType } from "@/lib/types";
import { gridDimensions } from "@/lib/grid";
import Tile from "./Tile";
import GoldSeams from "./GoldSeams";
import StoryModal from "./StoryModal";

interface Props {
  tiles: TileType[];
  connections: Connection[];
  svgs: Record<string, string>;
}

export default function Mosaic({ tiles, connections, svgs }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const { cols, rows } = useMemo(
    () => gridDimensions(tiles.length),
    [tiles.length]
  );

  const tilesById = useMemo(
    () => new Map(tiles.map((t) => [t.id, t])),
    [tiles]
  );

  const connectionsFor = useCallback(
    (tileId: string) =>
      connections.filter((c) => c.tileA === tileId || c.tileB === tileId),
    [connections]
  );

  const selectedTile = selectedId ? tilesById.get(selectedId) ?? null : null;

  // Map tile id -> position in the layout (0-indexed).
  const positionById = useMemo(() => {
    const m = new Map<string, { row: number; col: number; index: number }>();
    tiles.forEach((t, i) => {
      m.set(t.id, { row: Math.floor(i / cols), col: i % cols, index: i });
    });
    return m;
  }, [tiles, cols]);

  const adjacentIdsOf = useCallback(
    (tileId: string): Set<string> => {
      const pos = positionById.get(tileId);
      if (!pos) return new Set();
      const neighbors = new Set<string>();
      const dirs = [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ];
      for (const [dr, dc] of dirs) {
        const r = pos.row + dr;
        const c = pos.col + dc;
        if (r < 0 || c < 0 || r >= rows || c >= cols) continue;
        const idx = r * cols + c;
        const neighbor = tiles[idx];
        if (neighbor) neighbors.add(neighbor.id);
      }
      return neighbors;
    },
    [positionById, rows, cols, tiles]
  );

  const highlightedNeighbors = useMemo(() => {
    if (!hoveredId && !selectedId) return new Set<string>();
    return adjacentIdsOf(selectedId ?? hoveredId ?? "");
  }, [hoveredId, selectedId, adjacentIdsOf]);

  return (
    <main
      style={{
        position: "relative",
        minHeight: "100vh",
        padding: "clamp(1rem, 2.5vw, 2.5rem)",
        display: "flex",
        flexDirection: "column",
        gap: "clamp(1rem, 2vw, 1.5rem)",
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          color: "var(--ink-muted)",
          fontSize: "0.8rem",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
        }}
      >
        <span className="serif" style={{ fontSize: "1rem", letterSpacing: "0.1em", color: "var(--gold-bright)", fontStyle: "italic" }}>
          Kintsugi Network
        </span>
        <span>
          {tiles.length} fragments · {connections.length} gold threads
        </span>
      </header>

      <div
        style={{
          position: "relative",
          flex: 1,
          display: "grid",
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gridAutoRows: "1fr",
          gap: "var(--mosaic-gap)",
          maxWidth: "min(98vw, 1600px)",
          margin: "0 auto",
          width: "100%",
          ["--mosaic-gap" as string]: "clamp(8px, 1.6vw, 18px)",
        }}
      >
        <GoldSeams
          cols={cols}
          rows={rows}
          tileCount={tiles.length}
          activeTileId={selectedId ?? hoveredId}
          positionById={positionById}
        />

        {tiles.map((tile, i) => (
          <div
            key={tile.id}
            style={{
              opacity:
                selectedId && selectedId !== tile.id
                  ? highlightedNeighbors.has(tile.id)
                    ? 0.92
                    : 0.55
                  : 1,
              transition: "opacity 400ms ease",
            }}
          >
            <Tile
              tile={tile}
              svgMarkup={svgs[tile.id] ?? ""}
              index={i}
              selected={selectedId === tile.id}
              hovered={hoveredId === tile.id}
              onSelect={setSelectedId}
              onHover={setHoveredId}
            />
          </div>
        ))}
      </div>

      <footer
        style={{
          textAlign: "center",
          color: "var(--ink-muted)",
          fontSize: "0.78rem",
          letterSpacing: "0.12em",
          fontStyle: "italic",
        }}
        className="serif"
      >
        {hoveredId && !selectedId ? (
          <span style={{ color: "var(--gold-bright)" }}>
            {tilesById.get(hoveredId)?.poeticLine}
          </span>
        ) : (
          <span>each fragment, a person. together, a whole.</span>
        )}
      </footer>

      {selectedTile && (
        <StoryModal
          tile={selectedTile}
          connections={connectionsFor(selectedTile.id)}
          tilesById={tilesById}
          onClose={() => setSelectedId(null)}
          onJumpTo={(id) => setSelectedId(id)}
        />
      )}
    </main>
  );
}
