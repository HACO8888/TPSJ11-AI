import type { NextRequest } from "next/server";
import { listUserImages } from "@/db/queries";
import { requireAuth } from "@/lib/auth/session";
import { route } from "@/lib/http";

export const runtime = "nodejs";

/** The signed-in user's generated-image gallery (optional ?q= prompt search). */
export const GET = route(async (req: NextRequest) => {
  const uid = await requireAuth();
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.slice(0, 100) || undefined;
  const limitRaw = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : undefined;
  const data = await listUserImages(uid, { q, limit });
  return Response.json({ data });
});
