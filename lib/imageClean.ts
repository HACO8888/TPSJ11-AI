import "server-only";
import { wantsFlatWhite } from "./imagePrompt";

/**
 * Background cleanup for flat/plain-background graphics (logos, emblems, nametags,
 * certificates, stickers).
 *
 * Why: the image model renders "white background" not as #FFFFFF but as a *photographed*
 * white material — off-white canvas/paper with horizontal brush streaks, a soft vignette
 * and weave texture (measured: a clean corner is ~248/255, but streak bands dip to ~180).
 * The user sees this as "一塊一塊黑黑的雜訊" — patches of dark noise on what should be a
 * pure-white background.
 *
 * A global tone curve CANNOT fix this: the streaks vary spatially and overlap in
 * luminance with legitimate light artwork, so any single linear stretch either leaves the
 * streaks (too gentle) or — worse — *hardens* the sub-threshold streaks into crisp dark
 * marks by raising contrast (what the previous `linear(1.6,-80)` did, which is why the
 * noise persisted / stood out more).
 *
 * The fix is a connectivity-based background segmentation, not a threshold on brightness:
 *   1. Border gate — only act when the border is genuinely mostly near-white (a real
 *      flat-white graphic). If the model returned a photo/scene despite the prompt, the
 *      border isn't white → skip untouched (avoids ragged whitening of a real backdrop).
 *   2. Flood-fill from the four borders through connected near-white pixels → this is the
 *      background. The dark line-art is a wall the flood can't cross, so the artwork
 *      (and any interior white it encloses) is preserved *exactly*.
 *   3. Absorb faint tiny islands — streak specks that dipped just below the fill
 *      threshold and got stranded. Gated on faint+small so solid/coloured art is safe.
 *   4. Composite pure white over the background region only.
 *
 * Failure mode is bounded: the flood can only ever whiten pixels that are already light
 * AND border-connected — it can never darken or destroy artwork. Any decode/library
 * failure returns the original bytes unchanged, so generation never breaks. When the fix
 * does not apply (gate/failure) the SAME buffer reference is returned, so callers can use
 * an identity check to tell whether the image was rewritten.
 *
 * ONLY call this for prompts that want a flat white background (see wantsFlatWhite).
 */

// Fill from the border through pixels this light (0–255). Well above dark line-art
// (navy/black ~40–60, mid greens ~110–140) and below the streak floor (~180), so streaks
// are swept up while the artwork stays a wall.
const WHITE_L = 168;
// Only proceed when at least this fraction of the border is near-white — the signal that
// this really is a white-background graphic and not a photo the model invented.
const BORDER_GATE = 0.6;
// Downscale width the background mask is computed at (texture is low-frequency, so the
// mask survives downscaling; this keeps the flood/island passes cheap on ~17MP inputs).
const MASK_WIDTH = 1000;
// A stranded foreground island this small (fraction of the mask) AND this faint (mean
// lightness) is a leftover streak speck, not artwork → fold it into the background.
const ISLAND_MAX_FRAC = 0.0008;
const ISLAND_MIN_L = 150;
// Feather (blur px) applied to the upscaled mask so the background/artwork seam is soft.
const FEATHER = 3;

export async function whitenBackground(buf: Buffer): Promise<Buffer> {
  try {
    // sharp is dynamically imported (native module — kept external from the bundle).
    const { default: sharp } = await import("sharp");

    // Bake EXIF orientation first so mask coordinates match the composited pixels.
    const rotated = await sharp(buf, { failOn: "none" }).rotate().toBuffer();
    const meta = await sharp(rotated).metadata();
    const FW = meta.width;
    const FH = meta.height;
    if (!FW || !FH) return buf;

    // Grayscale, downscaled — the source for background segmentation.
    const mw = Math.min(MASK_WIDTH, FW);
    const mh = Math.max(1, Math.round((FH / FW) * mw));
    const { data: g } = await sharp(rotated)
      .resize(mw, mh, { fit: "fill" })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const N = mw * mh;

    // (1) Border gate: is the frame edge genuinely mostly near-white?
    let borderTot = 0;
    let borderWhite = 0;
    const tallyBorder = (i: number) => {
      borderTot++;
      if (g[i] >= WHITE_L) borderWhite++;
    };
    for (let x = 0; x < mw; x++) {
      tallyBorder(x);
      tallyBorder((mh - 1) * mw + x);
    }
    for (let y = 0; y < mh; y++) {
      tallyBorder(y * mw);
      tallyBorder(y * mw + mw - 1);
    }
    if (borderWhite / borderTot < BORDER_GATE) return buf;

    // (2) Flood-fill the background from the four borders through near-white pixels.
    const bg = new Uint8Array(N); // 1 = background (→ pure white)
    const stack: number[] = [];
    const visit = (x: number, y: number) => {
      const i = y * mw + x;
      if (!bg[i] && g[i] >= WHITE_L) {
        bg[i] = 1;
        stack.push(i);
      }
    };
    for (let x = 0; x < mw; x++) {
      visit(x, 0);
      visit(x, mh - 1);
    }
    for (let y = 0; y < mh; y++) {
      visit(0, y);
      visit(mw - 1, y);
    }
    while (stack.length) {
      const i = stack.pop() as number;
      const x = i % mw;
      const y = (i / mw) | 0;
      if (x > 0) visit(x - 1, y);
      if (x < mw - 1) visit(x + 1, y);
      if (y > 0) visit(x, y - 1);
      if (y < mh - 1) visit(x, y + 1);
    }

    // (3) Absorb faint, tiny foreground islands (stranded streak specks). Each foreground
    // component is drained fully once (O(N) total); absorb only if small AND faint so
    // dark/coloured artwork is never touched.
    const maxIslet = Math.max(4, Math.floor(N * ISLAND_MAX_FRAC));
    const seen = new Uint8Array(N);
    for (let s = 0; s < N; s++) {
      if (bg[s] || seen[s]) continue;
      const comp: number[] = [s];
      seen[s] = 1;
      let head = 0;
      let sum = 0;
      while (head < comp.length) {
        const i = comp[head++];
        sum += g[i];
        const x = i % mw;
        const y = (i / mw) | 0;
        if (x > 0 && !bg[i - 1] && !seen[i - 1]) {
          seen[i - 1] = 1;
          comp.push(i - 1);
        }
        if (x < mw - 1 && !bg[i + 1] && !seen[i + 1]) {
          seen[i + 1] = 1;
          comp.push(i + 1);
        }
        if (y > 0 && !bg[i - mw] && !seen[i - mw]) {
          seen[i - mw] = 1;
          comp.push(i - mw);
        }
        if (y < mh - 1 && !bg[i + mw] && !seen[i + mw]) {
          seen[i + mw] = 1;
          comp.push(i + mw);
        }
      }
      if (comp.length <= maxIslet && sum / comp.length >= ISLAND_MIN_L) {
        for (const i of comp) bg[i] = 1;
      }
    }

    // (4) Build a white layer whose alpha is the background mask, upscale (feathering the
    // seam), and composite it over the original — background → pure white, artwork intact.
    const rgba = Buffer.alloc(N * 4);
    for (let i = 0; i < N; i++) {
      const o = i * 4;
      rgba[o] = 255;
      rgba[o + 1] = 255;
      rgba[o + 2] = 255;
      rgba[o + 3] = bg[i] ? 255 : 0;
    }
    const whiteLayer = await sharp(rgba, { raw: { width: mw, height: mh, channels: 4 } })
      .resize(FW, FH, { fit: "fill" })
      .blur(FEATHER)
      .png()
      .toBuffer();

    return await sharp(rotated)
      .composite([{ input: whiteLayer, blend: "over" }])
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer();
  } catch {
    // sharp unavailable / decode failure → keep the original bytes, never break generation.
    return buf;
  }
}

/**
 * Background cleanup for black-and-white coloring pages / line-art (著色頁/線稿).
 *
 * A different regime from whitenBackground. A coloring page is, by definition, pure black
 * line-art on white — there are NO legitimate mid-tones or colours to protect. The model
 * still paints a photographed off-white with a grey haze/vignette, but here the grey
 * overlaps line-art luminance *spatially* (a haze band can dip to ~145, below any single
 * flood threshold that still clears black ink), so a connectivity flood-fill barely helps
 * (measured on real pages: 36% grey → 33%). Because nothing light is worth keeping, the
 * right tool is the very thing that is WRONG for a coloured flat-white graphic — a global
 * tone curve — applied here where it is safe and, measured, effective (grey 36–54% → ~1%,
 * black-ink fraction unchanged).
 *
 * The curve is monotonic and only ever *lightens* (out ≥ in for every input), so it can
 * never darken a pixel and therefore structurally cannot harden a sub-threshold streak
 * into a crisp dark mark — the failure mode of the old `linear(1.6,-80)` white-point
 * stretch. Ink at/below LINE_KNEE_LO is returned byte-for-byte (lines stay crisp black);
 * the grey haze at/above LINE_KNEE_HI snaps to pure white; the narrow band between ramps
 * smoothly so anti-aliased line edges survive.
 *
 * Self-gating on pixels (not the prompt): only fires when the image really is greyscale
 * line-art, so a colourful scene/photo — whose real highlights a global whiten would blow
 * out — is passed through as the SAME buffer reference (callers use the identity check to
 * pick the mime). Any decode/library failure also returns the original bytes unchanged.
 */

// Ink at/below this luminance stays untouched (black lines + their darkest anti-alias).
const LINE_KNEE_LO = 112;
// Grey at/above this snaps to pure white (sweeps the whole haze distribution).
const LINE_KNEE_HI = 150;
// Line-art detector, computed on a downscale: essentially greyscale (no colour to wreck),
// with real black ink, on predominantly white paper.
const LA_DETECT_WIDTH = 256;
const LA_CHROMA = 24; // (max−min) RGB above this = a "coloured" pixel
const LA_MAX_COLOURED = 0.03; // coloured pixels must stay under this fraction
const LA_MIN_INK = 0.02; // ≥ this fraction genuinely dark → the drawing has line-art
const LA_MIN_WHITE = 0.25; // ≥ this fraction near-white → real white paper (excludes photos)
const LA_INK_L = 90;
const LA_WHITE_L = 238;

export async function flattenLineArt(buf: Buffer): Promise<Buffer> {
  try {
    const { default: sharp } = await import("sharp");
    const rotated = await sharp(buf, { failOn: "none" }).rotate().toBuffer();
    const meta = await sharp(rotated).metadata();
    const FW = meta.width;
    const FH = meta.height;
    if (!FW || !FH) return buf;

    // (1) Detect: is this a greyscale line-art page? Scan a downscaled RGB copy.
    const dw = Math.min(LA_DETECT_WIDTH, FW);
    const dh = Math.max(1, Math.round((FH / FW) * dw));
    const { data: s } = await sharp(rotated)
      .resize(dw, dh, { fit: "fill" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const n = dw * dh;
    let coloured = 0;
    let ink = 0;
    let white = 0;
    for (let i = 0; i < s.length; i += 3) {
      const r = s[i];
      const g = s[i + 1];
      const b = s[i + 2];
      if (Math.max(r, g, b) - Math.min(r, g, b) > LA_CHROMA) coloured++;
      const L = (r * 299 + g * 587 + b * 114) / 1000;
      if (L < LA_INK_L) ink++;
      else if (L >= LA_WHITE_L) white++;
    }
    if (coloured / n >= LA_MAX_COLOURED || ink / n < LA_MIN_INK || white / n < LA_MIN_WHITE) {
      return buf; // not a coloring page → leave untouched
    }

    // (2) Monotonic whitening curve applied to every full-res pixel. The lift strength is
    // keyed on luminance and applied equally to R/G/B, so the (near-zero) chroma is kept
    // and grey pixels behave exactly like the 1-D curve.
    const lift = new Float32Array(256);
    for (let L = 0; L < 256; L++) {
      const t = Math.max(0, Math.min(1, (L - LINE_KNEE_LO) / (LINE_KNEE_HI - LINE_KNEE_LO)));
      lift[L] = t * t * (3 - 2 * t); // smoothstep
    }
    const { data: px, info } = await sharp(rotated)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const ch = info.channels;
    for (let i = 0; i < px.length; i += ch) {
      const r = px[i];
      const g = px[i + 1];
      const b = px[i + 2];
      const w = lift[((r * 299 + g * 587 + b * 114) / 1000) | 0];
      if (w === 0) continue; // dark ink → byte-for-byte unchanged (cannot darken)
      px[i] = (r + (255 - r) * w + 0.5) | 0;
      px[i + 1] = (g + (255 - g) * w + 0.5) | 0;
      px[i + 2] = (b + (255 - b) * w + 0.5) | 0;
    }
    // PNG, not JPEG: line-art on pure white would otherwise gain mosquito ringing around
    // the black strokes — re-introducing the very speckle we just removed.
    return await sharp(px, {
      raw: { width: info.width, height: info.height, channels: ch },
    })
      .png()
      .toBuffer();
  } catch {
    return buf;
  }
}

/**
 * Post-process a freshly generated image for its intended background.
 * Returns the cleaned bytes plus the mime to store, or `mime: null` when nothing acted
 * (the SAME buffer is returned, so the caller keeps the original bytes/mime).
 */
export async function cleanupGeneratedImage(
  buf: Buffer,
  prompt: string,
): Promise<{ bytes: Buffer; mime: string | null }> {
  // Colour-on-white graphics (logo/nametag/…): connectivity flood-fill keeps the coloured
  // artwork intact while snapping the textured white to pure white.
  if (wantsFlatWhite(prompt)) {
    const out = await whitenBackground(buf);
    return { bytes: out, mime: out === buf ? null : "image/jpeg" };
  }
  // Everything else: auto-detect a greyscale line-art / coloring page (pixel-gated, so a
  // colourful scene or photo passes through untouched) and flatten its grey haze.
  const out = await flattenLineArt(buf);
  return { bytes: out, mime: out === buf ? null : "image/png" };
}
