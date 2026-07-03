import "server-only";

// Mirror the client-side "download small" limits so cloud-saved 小 size matches.
const MAX_BYTES = 2 * 1024 * 1024; // ≤2MB
const MAX_DIM = 2048; // longest side

/**
 * Re-encode a (large, ~8MB) generated image to a download-friendly JPEG ≤2MB.
 * Resize once to fit MAX_DIM, then step JPEG quality down until it fits the size cap.
 *
 * sharp is imported dynamically (not at module load) so this native dependency never
 * blocks the modules that transitively import it — chat/regenerate pull in this file
 * via lib/drive, and a load-time `import sharp` there was crashing those routes in the
 * standalone deployment. sharp only loads when a 小 size / 都存 save actually runs.
 */
export async function compressForCloud(input: Buffer): Promise<{ bytes: Buffer; mime: string }> {
  const { default: sharp } = await import("sharp");
  const resized = await sharp(input, { failOn: "none" })
    .rotate() // honour EXIF orientation before dropping metadata
    .resize({ width: MAX_DIM, height: MAX_DIM, fit: "inside", withoutEnlargement: true })
    .toBuffer();

  let quality = 82;
  let out = await sharp(resized).jpeg({ quality, mozjpeg: true }).toBuffer();
  while (out.length > MAX_BYTES && quality > 40) {
    quality -= 10;
    out = await sharp(resized).jpeg({ quality, mozjpeg: true }).toBuffer();
  }
  return { bytes: out, mime: "image/jpeg" };
}
