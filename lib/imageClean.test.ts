import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { whitenBackground } from "./imageClean";

// Build a JPEG from a raw grayscale-as-RGB buffer (r=g=b=v) so we control exact values.
async function jpeg(
  w: number,
  h: number,
  paint: (x: number, y: number) => number,
  quality = 95,
): Promise<Buffer> {
  const rgb = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = paint(x, y);
      const o = (y * w + x) * 3;
      rgb[o] = v;
      rgb[o + 1] = v;
      rgb[o + 2] = v;
    }
  }
  return await sharp(rgb, { raw: { width: w, height: h, channels: 3 } })
    .jpeg({ quality })
    .toBuffer();
}

// Grayscale value of a single pixel in an encoded image.
async function px(buf: Buffer, x: number, y: number): Promise<number> {
  const { data } = await sharp(buf)
    .grayscale()
    .extract({ left: x, top: y, width: 1, height: 1 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return data[0];
}

describe("whitenBackground (flood-fill)", () => {
  it("snaps a textured/streaked white background to pure white while preserving artwork", async () => {
    // White field, a full-width faint streak band (value 190) that the OLD linear fix
    // would have left grey (~224), and a dark central shape that must survive.
    const W = 400;
    const H = 300;
    const src = await jpeg(W, H, (x, y) => {
      if (x >= 150 && x < 250 && y >= 120 && y < 180) return 20; // dark artwork block
      if (y >= 100 && y < 120) return 190; // background streak band
      return 255; // clean white field
    });

    const out = await whitenBackground(src);
    expect(out).not.toBe(src); // it acted (border is white → gate passed)

    // Background — corner and the streak band — is now genuinely pure white.
    expect(await px(out, 5, 5)).toBeGreaterThanOrEqual(250);
    expect(await px(out, 20, 110)).toBeGreaterThanOrEqual(250); // streak swept to white
    // Dark artwork preserved (flood cannot cross it).
    expect(await px(out, 200, 150)).toBeLessThanOrEqual(60);
  });

  it("leaves a non-white-background image (a photo the model invented) untouched", async () => {
    // Mid-grey field: the border is not near-white → the gate must skip and return the
    // SAME buffer, so callers keep the original bytes/mime.
    const photo = await jpeg(400, 300, () => 130, 90);
    const out = await whitenBackground(photo);
    expect(out).toBe(photo);
  });

  it("returns the original bytes when the input cannot be decoded", async () => {
    const garbage = Buffer.from("this is not an image");
    const out = await whitenBackground(garbage);
    expect(out).toBe(garbage);
  });
});
