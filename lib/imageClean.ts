import "server-only";

/**
 * Background cleanup for flat/plain-background graphics (logos, nametags, certificates).
 *
 * Why: the image model renders "white background" as a *photographed* off-white surface
 * — measured ~248/255 with subtle texture (std ~2–4), not pure #FFFFFF. JPEG then
 * amplifies that near-white low-contrast variation into visible 8×8 blocks / banding /
 * marbling. A white-point stretch (linear a·x + b) snaps the near-white background to
 * pure white while deepening the dark line art (measured: background std 2.1 → 0.0).
 *
 * ONLY call this for prompts that want a flat white background (see wantsFlatWhite) —
 * on a photo / scenic illustration it would blow out the real highlights.
 */

// linear(a, b): out = a·in + b (clamped 0–255). With a=1.6, b=-80 anything ≳209 clips
// to pure white — enough to also remove the model's occasional light "vintage/distressed"
// background grunge (~200–235), while genuinely mid/dark design (< ~209) is preserved and
// the dark line-art deepens. Tunable here.
const WHITEN_A = 1.6;
const WHITEN_B = -80;

export async function whitenBackground(buf: Buffer): Promise<Buffer> {
  try {
    // sharp is dynamically imported (native module — kept external from the bundle).
    const { default: sharp } = await import("sharp");
    return await sharp(buf, { failOn: "none" })
      .rotate() // honour EXIF orientation before we bake pixels
      .linear(WHITEN_A, WHITEN_B)
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();
  } catch {
    // sharp unavailable / decode failure → keep the original bytes, never break generation.
    return buf;
  }
}
