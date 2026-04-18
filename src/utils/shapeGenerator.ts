/**
 * Deterministic shape + placement helpers used on the backend to populate a
 * shard's shape_seed and normalized [0,1] position. The actual polygon
 * geometry is generated on the frontend from `shape_seed` using the mirror
 * algorithm in `client/utils/shapeUtils.ts`.
 */

export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

export function lcg(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

interface PlacementInput {
  seed: number;
  existing: Array<{ position_x: number; position_y: number }>;
  layerOrder: number;
}

export interface Placement {
  position_x: number;
  position_y: number;
  rotation: number;
  scale: number;
}

const MIN_DIST = 0.16;
const MAX_TRIES = 30;

export function chooseShardPlacement(input: PlacementInput): Placement {
  const rand = lcg(input.seed);
  const scale = 0.85 + rand() * 0.3;
  const rotation = (rand() - 0.5) * 0.6;

  // First 4 shards land near quadrant centers for a readable starting layout.
  if (input.layerOrder <= 4) {
    const cells: [number, number][] = [
      [0.3, 0.3],
      [0.7, 0.3],
      [0.3, 0.7],
      [0.7, 0.7],
    ];
    const [cx, cy] = cells[(input.layerOrder - 1) % 4];
    return {
      position_x: cx + (rand() - 0.5) * 0.04,
      position_y: cy + (rand() - 0.5) * 0.04,
      rotation,
      scale,
    };
  }

  // Poisson disk-ish rejection sampling against previously placed shards.
  let best: [number, number] = [0.5, 0.5];
  let bestDist = -1;
  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    const x = 0.1 + rand() * 0.8;
    const y = 0.1 + rand() * 0.8;
    let minDist = Infinity;
    for (const { position_x: ex, position_y: ey } of input.existing) {
      const dx = x - ex;
      const dy = y - ey;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < minDist) minDist = d;
    }
    if (minDist >= MIN_DIST) {
      return { position_x: x, position_y: y, rotation, scale };
    }
    if (minDist > bestDist) {
      best = [x, y];
      bestDist = minDist;
    }
  }
  return {
    position_x: best[0],
    position_y: best[1],
    rotation,
    scale,
  };
}
