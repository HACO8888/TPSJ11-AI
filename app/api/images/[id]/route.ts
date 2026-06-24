import type { NextRequest } from "next/server";
import { getImageBytes } from "@/db/queries";
import { requireAuth } from "@/lib/auth/session";
import { HttpError, route, uuidParam } from "@/lib/http";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (_req: NextRequest, { params }) => {
  await requireAuth(); // images are private to the admin
  const id = uuidParam.parse((await params).id);

  const img = await getImageBytes(id);
  if (!img) throw new HttpError(404, "NOT_FOUND", "找不到圖片");

  // Node's runtime accepts a Buffer body directly (zero-copy); the DOM BodyInit
  // type is stricter than reality, so cast. Avoids copying ~8MB per request.
  return new Response(img.bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": img.mime,
      "Content-Length": String(img.byteLen),
      // id is content-addressed and immutable; private because auth-gated.
      "Cache-Control": "private, max-age=31536000, immutable",
      ETag: `"${id}"`,
    },
  });
});
