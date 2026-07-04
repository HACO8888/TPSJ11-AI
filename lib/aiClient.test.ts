import { describe, expect, it } from "vitest";
import { imageSize, sniffMime } from "./aiClient";

describe("sniffMime", () => {
  it("detects JPEG (SOI FF D8)", () => {
    expect(sniffMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
  });

  it("detects PNG (89 50)", () => {
    expect(sniffMime(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBe("image/png");
  });

  it("detects GIF (GIF8)", () => {
    expect(sniffMime(Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toBe("image/gif");
  });

  it("detects WebP (RIFF…WEBP)", () => {
    const b = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
    expect(sniffMime(b)).toBe("image/webp");
  });

  it("does not mistake a non-WEBP RIFF container (e.g. WAV) for an image", () => {
    // RIFF header but "WAVE" tag at offset 8 → not a WebP.
    const b = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45]);
    expect(sniffMime(b)).toBe("application/octet-stream");
  });

  it("returns octet-stream for unknown bytes", () => {
    expect(sniffMime(Buffer.from([0x00, 0x01, 0x02, 0x03]))).toBe("application/octet-stream");
  });
});

describe("imageSize", () => {
  it("reads PNG dimensions from the IHDR chunk", () => {
    const b = Buffer.alloc(24);
    b[0] = 0x89;
    b[1] = 0x50; // PNG signature start
    b.writeUInt32BE(800, 16); // IHDR width
    b.writeUInt32BE(600, 20); // IHDR height
    expect(imageSize(b)).toEqual({ width: 800, height: 600 });
  });

  it("reads JPEG dimensions from an SOF0 marker", () => {
    // SOI, then a full SOF0 (FF C0) segment: len=0x0011, precision 8, height=256,
    // width=512, 3 components. Full-length so the scanner's `off+9 < length` guard
    // (which real JPEGs always satisfy) is met.
    const b = Buffer.from([
      0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x00, 0x02, 0x00, 0x03, 0x01, 0x22, 0x00,
      0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
    ]);
    expect(imageSize(b)).toEqual({ width: 512, height: 256 });
  });

  it("returns null when no size can be parsed", () => {
    expect(imageSize(Buffer.from([0x00, 0x01, 0x02, 0x03]))).toBeNull();
  });
});
