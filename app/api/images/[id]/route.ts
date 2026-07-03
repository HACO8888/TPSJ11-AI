import type { NextRequest } from "next/server";
import { getImageBytes } from "@/db/queries";
import { requireAuth } from "@/lib/auth/session";
import { logError } from "@/lib/errors";
import { HttpError, route, uuidParam } from "@/lib/http";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// Log a sharp load/resize failure just once per server instance (diagnostic; the
// request still succeeds by serving the original bytes).
let loggedResizeFail = false;

export const GET = route<Ctx>(async (req: NextRequest, { params }) => {
  await requireAuth(); // images are private to logged-in users
  const id = uuidParam.parse((await params).id);

  const img = await getImageBytes(id);
  if (!img) throw new HttpError(404, "NOT_FOUND", "找不到圖片");

  // ?w=<n> → serve a downsized JPEG for display (the originals are ~8–12MB, which
  // makes the chat view load slowly). No ?w → the full original (used for 原圖 download).
  const wRaw = Number(new URL(req.url).searchParams.get("w"));
  const width = Number.isFinite(wRaw) ? Math.min(2048, Math.max(64, Math.round(wRaw))) : 0;

  if (width > 0) {
    try {
      const { default: sharp } = await import("sharp");
      const buf = await sharp(img.bytes, { failOn: "none" })
        .rotate()
        .resize({ width, height: width, fit: "inside", withoutEnlargement: true })
        .flatten({ background: "#ffffff" })
        .jpeg({ quality: 80, mozjpeg: true })
        .toBuffer();
      return new Response(buf as unknown as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": "image/jpeg",
          "Content-Length": String(buf.length),
          // id + width are immutable; private because auth-gated.
          "Cache-Control": "private, max-age=31536000, immutable",
          ETag: `"${id}-w${width}"`,
        },
      });
    } catch (e) {
      if (!loggedResizeFail) {
        loggedResizeFail = true;
        await logError({
          scope: "images.resize",
          code: "SHARP_FAIL",
          message: "sharp 縮圖失敗，改回原圖",
          detail: e,
        }).catch(() => {});
      }
      // sharp unavailable → fall through and serve the original bytes.
    }
  }

  // Node's runtime accepts a Buffer body directly (zero-copy); the DOM BodyInit
  // type is stricter than reality, so cast. Avoids copying ~8MB per request.
  return new Response(img.bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": img.mime,
      "Content-Length": String(img.byteLen),
      "Cache-Control": "private, max-age=31536000, immutable",
      ETag: `"${id}"`,
    },
  });
});
