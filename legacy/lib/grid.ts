/**
 * Compute a near-square grid for N tiles.
 * Always fills rows left-to-right; last row may be short. The mosaic UI
 * centers the short row so the asymmetry feels intentional.
 */
export function gridDimensions(count: number): { cols: number; rows: number } {
  if (count <= 0) return { cols: 0, rows: 0 };
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  return { cols, rows };
}
