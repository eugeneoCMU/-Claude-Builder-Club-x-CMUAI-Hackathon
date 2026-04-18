"use client";

import { memo } from "react";
import type { Tile as TileType } from "@/lib/types";

interface Props {
  tile: TileType;
  svgMarkup: string;
  index: number;
  selected: boolean;
  hovered: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}

/**
 * Stable 0-1 float from a tile id. Same input → same output → no hydration
 * mismatch and no delay jumps between parent re-renders. Based on a small
 * FNV-1a variant so collision is acceptable for visual phase offsets.
 */
function stableFloat(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h % 10000) / 10000;
}

function TileInner({
  tile,
  svgMarkup,
  index,
  selected,
  hovered,
  onSelect,
  onHover,
}: Props) {
  const phase = stableFloat(tile.id);
  const breatheDelay = `${-phase * 7}s`;
  const breatheDuration = `${6 + Math.floor(phase * 4)}s`;

  return (
    <button
      type="button"
      aria-label={`Tile ${index + 1}: ${tile.poeticLine}`}
      onClick={() => onSelect(tile.id)}
      onMouseEnter={() => onHover(tile.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(tile.id)}
      onBlur={() => onHover(null)}
      style={{
        all: "unset",
        cursor: "pointer",
        aspectRatio: "1 / 1",
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
        borderRadius: 3,
        background: "var(--bg-soft)",
        transition:
          "transform 400ms cubic-bezier(.2,.8,.2,1), filter 400ms ease",
        filter: selected
          ? "brightness(1.25) saturate(1.1)"
          : hovered
            ? "brightness(1.15) saturate(1.05)"
            : "brightness(0.94)",
        transform: selected
          ? "scale(1.03)"
          : hovered
            ? "scale(1.015)"
            : "scale(1)",
        animation: `tileBreathe ${breatheDuration} ease-in-out infinite`,
        animationDelay: breatheDelay,
        outline: selected
          ? "1px solid var(--gold-bright)"
          : hovered
            ? "1px solid rgba(212, 175, 55, 0.35)"
            : "none",
        outlineOffset: -1,
      }}
      dangerouslySetInnerHTML={{
        __html: wrapSvgMarkup(svgMarkup),
      }}
    />
  );
}

/**
 * We read the server-written SVG strings, but we need them to fill the tile
 * and behave (preserveAspectRatio, width/height 100%). We also strip any
 * attributes on the root <svg> that could override our sizing or positioning.
 */
function wrapSvgMarkup(svg: string): string {
  const trimmed = svg.trim();
  const opening = trimmed.match(/^<svg\b[^>]*>/i);
  if (!opening) return trimmed;
  let tag = opening[0];
  tag = tag.replace(/\swidth\s*=\s*"[^"]*"/i, "");
  tag = tag.replace(/\sheight\s*=\s*"[^"]*"/i, "");
  tag = tag.replace(/\sstyle\s*=\s*"[^"]*"/i, "");
  tag = tag.replace(/\sclass\s*=\s*"[^"]*"/i, "");
  if (!/preserveAspectRatio=/i.test(tag)) {
    tag = tag.replace(/>$/, ' preserveAspectRatio="xMidYMid slice">');
  }
  tag = tag.replace(
    /<svg\b/i,
    '<svg width="100%" height="100%" style="display:block"'
  );
  return tag + trimmed.slice(opening[0].length);
}

export default memo(TileInner);
