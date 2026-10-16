/**
 * The display width an /api/images request asks for via `?w=<n>`, clamped to 64–2048.
 * 0 means "serve the original": no `w`, an empty one, or anything that is not a
 * positive number. (`Number(null)` is 0, so a missing `w` must be checked first —
 * otherwise it clamps to 64 and 原圖 download returns a 64px thumbnail.)
 */
export function requestedWidth(w: string | null): number {
  if (w === null || w.trim() === "") return 0;
  const n = Number(w);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(2048, Math.max(64, Math.round(n)));
}
