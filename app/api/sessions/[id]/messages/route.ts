import type { NextRequest } from "next/server";
import { getMessages, getSession } from "@/db/queries";
import { requireAuth } from "@/lib/auth/session";
import { HttpError, route, uuidParam } from "@/lib/http";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (_req: NextRequest, { params }) => {
  const uid = await requireAuth();
  const id = uuidParam.parse((await params).id);
  const session = await getSession(uid, id);
  if (!session) throw new HttpError(404, "NOT_FOUND", "找不到此對話");
  const data = await getMessages(id);
  return Response.json({ data });
});
