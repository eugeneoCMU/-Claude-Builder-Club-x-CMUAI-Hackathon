"use client";

import { useMemo } from "react";

interface Props {
  cols: number;
  rows: number;
  tileCount: number;
  activeTileId: string | null;
  positionById: Map<string, { row: number; col: number; index: number }>;
}

/**
 * The Kintsugi seams.
 *
 * Each seam is a narrow, absolutely-positioned element sitting exactly in the
 * CSS grid's gap between two tiles — using CSS calc() to reference the same
 * column/row tracks and gap width as the grid itself. This keeps the seams
 * aligned regardless of viewport size or CSS gap value.
 *
 * Each seam carries a small SVG tremor path so the gold feels mended, not
 * manufactured. On tile hover/select, the seams adjacent to that tile glow
 * more brightly.
 */
export default function GoldSeams({
  cols,
  rows,
  tileCount,
  activeTileId,
  positionById,
}: Props) {
  const activePos = activeTileId ? positionById.get(activeTileId) : null;

  const seams = useMemo(
    () => buildSeams(rows, cols, tileCount),
    [rows, cols, tileCount]
  );

  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 2,
      }}
    >
      {seams.map((seam) => (
        <SeamElement key={seam.key} seam={seam} cols={cols} rows={rows} active={isAdjacent(seam, activePos)} />
      ))}
    </div>
  );
}

interface Seam {
  key: string;
  row: number;
  col: number;
  orientation: "v" | "h";
}

function buildSeams(rows: number, cols: number, tileCount: number): Seam[] {
  const out: Seam[] = [];
  // Vertical seams — between col and col+1 at row r.
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const leftIdx = r * cols + c;
      const rightIdx = r * cols + c + 1;
      if (leftIdx >= tileCount || rightIdx >= tileCount) continue;
      out.push({ key: `v-${r}-${c}`, row: r, col: c, orientation: "v" });
    }
  }
  // Horizontal seams — between row and row+1 at col c.
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols; c++) {
      const topIdx = r * cols + c;
      const bottomIdx = (r + 1) * cols + c;
      if (topIdx >= tileCount || bottomIdx >= tileCount) continue;
      out.push({ key: `h-${r}-${c}`, row: r, col: c, orientation: "h" });
    }
  }
  return out;
}

function isAdjacent(
  seam: Seam,
  pos: { row: number; col: number } | null | undefined
): boolean {
  if (!pos) return false;
  if (seam.orientation === "v") {
    return (
      seam.row === pos.row &&
      (seam.col === pos.col || seam.col === pos.col - 1)
    );
  }
  return (
    seam.col === pos.col && (seam.row === pos.row || seam.row === pos.row - 1)
  );
}

/**
 * Position one seam inside the grid gap using CSS calc().
 *
 * The parent is a CSS grid with:
 *   grid-template-columns: repeat(cols, 1fr)
 *   grid-template-rows: repeat(rows, 1fr)  (effectively, via gridAutoRows: 1fr)
 *   gap: var(--mosaic-gap)
 *
 * A track's width = (containerWidth - (cols - 1) * gap) / cols.
 * Vertical seam k (0-indexed, between col k and k+1) sits at:
 *   left = (k + 1) * trackWidth + k * gap + gap/2  (center of gap)
 *         = (k + 1) * (100% - (cols-1) * gap) / cols + k * gap + gap/2
 *
 * Those `100%` expressions below resolve against the parent width/height.
 */
function SeamElement({
  seam,
  cols,
  rows,
  active,
}: {
  seam: Seam;
  cols: number;
  rows: number;
  active: boolean;
}) {
  const gap = "var(--mosaic-gap)";
  const thickness = active ? 3 : 2;

  if (seam.orientation === "v") {
    const k = seam.col;
    const leftExpr = `calc((100% - ${cols - 1} * ${gap}) / ${cols} * ${k + 1} + ${k} * ${gap} + ${gap} / 2)`;
    const topExpr = `calc((100% - ${rows - 1} * ${gap}) / ${rows} * ${seam.row} + ${seam.row} * ${gap})`;
    const heightExpr = `calc((100% - ${rows - 1} * ${gap}) / ${rows})`;
    const animDelay = `${((seam.row * 7 + seam.col * 13) % 60) / 10}s`;
    const animDur = `${7 + ((seam.row + seam.col) % 4)}s`;
    return (
      <div
        style={{
          position: "absolute",
          left: leftExpr,
          top: topExpr,
          width: thickness,
          height: heightExpr,
          transform: "translateX(-50%)",
          transition: "width 400ms ease, opacity 400ms ease",
          opacity: active ? 1 : 0.92,
          animation: `breathe ${animDur} ease-in-out infinite`,
          animationDelay: animDelay,
        }}
      >
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 2 100"
          preserveAspectRatio="none"
          style={{ display: "block", overflow: "visible" }}
        >
          <defs>
            <linearGradient id={`vg-${seam.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8a6b17" stopOpacity="0.85" />
              <stop offset="40%" stopColor="#d4af37" stopOpacity="1" />
              <stop offset="60%" stopColor="#f4e5a1" stopOpacity="1" />
              <stop offset="100%" stopColor="#8a6b17" stopOpacity="0.85" />
            </linearGradient>
          </defs>
          <path
            d={verticalTremor(seam.row, seam.col)}
            stroke={`url(#vg-${seam.key})`}
            strokeWidth="1.5"
            strokeLinecap="round"
            fill="none"
            style={{
              filter: active
                ? "drop-shadow(0 0 2px #f4e5a1) drop-shadow(0 0 5px #d4af37)"
                : "drop-shadow(0 0 1.5px #d4af37) drop-shadow(0 0 3px #8a6b17)",
            }}
          />
        </svg>
      </div>
    );
  }

  // horizontal
  const k = seam.row;
  const topExpr = `calc((100% - ${rows - 1} * ${gap}) / ${rows} * ${k + 1} + ${k} * ${gap} + ${gap} / 2)`;
  const leftExpr = `calc((100% - ${cols - 1} * ${gap}) / ${cols} * ${seam.col} + ${seam.col} * ${gap})`;
  const widthExpr = `calc((100% - ${cols - 1} * ${gap}) / ${cols})`;
  const animDelay = `${((seam.row * 11 + seam.col * 5) % 60) / 10}s`;
  const animDur = `${7 + ((seam.row + seam.col) % 4)}s`;
  return (
    <div
      style={{
        position: "absolute",
        top: topExpr,
        left: leftExpr,
        height: thickness,
        width: widthExpr,
        transform: "translateY(-50%)",
        transition: "height 400ms ease, opacity 400ms ease",
        opacity: active ? 1 : 0.92,
        animation: `breathe ${animDur} ease-in-out infinite`,
        animationDelay: animDelay,
      }}
    >
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 100 2"
        preserveAspectRatio="none"
        style={{ display: "block", overflow: "visible" }}
      >
        <defs>
          <linearGradient id={`hg-${seam.key}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#8a6b17" stopOpacity="0.85" />
            <stop offset="40%" stopColor="#d4af37" stopOpacity="1" />
            <stop offset="60%" stopColor="#f4e5a1" stopOpacity="1" />
            <stop offset="100%" stopColor="#8a6b17" stopOpacity="0.85" />
          </linearGradient>
        </defs>
        <path
          d={horizontalTremor(seam.row, seam.col)}
          stroke={`url(#hg-${seam.key})`}
          strokeWidth="1.5"
          strokeLinecap="round"
          fill="none"
          style={{
            filter: active
              ? "drop-shadow(0 0 2px #f4e5a1) drop-shadow(0 0 5px #d4af37)"
              : "drop-shadow(0 0 1.5px #d4af37) drop-shadow(0 0 3px #8a6b17)",
          }}
        />
      </svg>
    </div>
  );
}

function verticalTremor(r: number, c: number): string {
  const w = 2;
  const h = 100;
  const mid = w / 2;
  const j1 = 0.28 + ((seedHash(r, c) % 20) / 200);
  const j2 = 0.28 - ((seedHash(r * 3, c) % 20) / 220);
  return `M ${mid} 0 C ${mid + j1} ${h * 0.33} ${mid - j2} ${h * 0.66} ${mid} ${h}`;
}

function horizontalTremor(r: number, c: number): string {
  const w = 100;
  const h = 2;
  const mid = h / 2;
  const j1 = 0.28 + ((seedHash(r * 17, c) % 20) / 200);
  const j2 = 0.28 - ((seedHash(r, c * 5) % 20) / 220);
  return `M 0 ${mid} C ${w * 0.33} ${mid + j1} ${w * 0.66} ${mid - j2} ${w} ${mid}`;
}

function seedHash(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) >>> 0;
  h = ((h ^ (h >>> 13)) * 1274126177) >>> 0;
  return Math.abs(h ^ (h >>> 16));
}
