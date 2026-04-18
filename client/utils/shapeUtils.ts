/**
 * Deterministic shard-silhouette generation. Given a shape_seed from the
 * backend, produces a normalized [0,1]x[0,1] polygon resembling the jagged
 * edge of a pottery fragment with Catmull-Rom smoothing.
 *
 * The algorithm matches `src/utils/shapeGenerator.ts` so a shard's silhouette
 * is stable across page reloads and between the backend metadata and the
 * frontend mask.
 */

function lcg(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/**
 * Generate an irregular pottery-shard polygon normalized to [0,1]^2.
 * Returns an array of [x, y] points forming a closed polygon.
 */
export function generateShardPolygon(shapeSeed: number): [number, number][] {
  const rand = lcg(shapeSeed);
  const n = Math.floor(rand() * 6) + 7; // 7-12 control points
  const baseRadius = 0.35;

  const controls: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2;
    const radius = baseRadius * (0.6 + rand() * 0.8); // +/- 40%
    controls.push([
      0.5 + Math.cos(angle) * radius,
      0.5 + Math.sin(angle) * radius,
    ]);
  }

  const notchCount = Math.floor(rand() * 3) + 2;
  for (let i = 0; i < notchCount; i++) {
    const insertAt = Math.floor(rand() * controls.length);
    const angle = rand() * Math.PI * 2;
    const notchDepth = 0.05 + rand() * 0.08;
    controls.splice(insertAt, 0, [
      0.5 + Math.cos(angle) * (baseRadius - notchDepth),
      0.5 + Math.sin(angle) * (baseRadius - notchDepth),
    ]);
  }

  return catmullRomSmooth(controls, 0.3, 8);
}

/**
 * Closed Catmull-Rom spline smoothing. `segments` is the number of
 * interpolated points between each pair of control points.
 */
function catmullRomSmooth(
  points: [number, number][],
  tension: number,
  segments: number
): [number, number][] {
  const n = points.length;
  if (n < 4) return points;

  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];

    for (let s = 0; s < segments; s++) {
      const t = s / segments;
      const t2 = t * t;
      const t3 = t2 * t;
      const a = -tension * t3 + 2 * tension * t2 - tension * t;
      const b = (2 - tension) * t3 + (tension - 3) * t2 + 1;
      const c = (tension - 2) * t3 + (3 - 2 * tension) * t2 + tension * t;
      const d = tension * t3 - tension * t2;

      out.push([
        a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
        a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
      ]);
    }
  }
  return out;
}

/**
 * Compute a single point on the polygon edge at parametric position `t`
 * in [0, 1). Used to anchor a gold thread at the edge of a shard rather
 * than its center for more organic connections.
 */
export function polygonPointAt(
  poly: [number, number][],
  t: number
): [number, number] {
  const idx = Math.floor(t * poly.length) % poly.length;
  return poly[idx];
}
