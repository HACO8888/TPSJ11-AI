import "server-only";

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
