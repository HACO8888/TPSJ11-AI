import type { NextRequest } from "next/server";
import { getMessagesAdmin, getSessionAdmin } from "@/db/queries";
import { HttpError, route, uuidParam } from "@/lib/http";
import { requireAdmin } from "@/lib/permissions";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Full conversation of a session for the admin viewer — includes soft-deleted turns. */
export const GET = route<Ctx>(async (_req: NextRequest, { params }) => {
  await requireAdmin();
  const id = uuidParam.parse((await params).id);
  const session = await getSessionAdmin(id);
  if (!session) throw new HttpError(404, "NOT_FOUND", "找不到此對話");
  const messages = await getMessagesAdmin(id);
  return Response.json({ data: { session, messages } });
});
