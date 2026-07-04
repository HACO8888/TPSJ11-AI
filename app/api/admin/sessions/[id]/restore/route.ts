import type { NextRequest } from "next/server";
import { getSessionAdmin, restoreSession } from "@/db/queries";
import { assertSameOrigin } from "@/lib/auth/csrf";
import { HttpError, route, uuidParam } from "@/lib/http";
import { requireAdmin } from "@/lib/permissions";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Restore a soft-deleted session (admin). */
export const POST = route<Ctx>(async (req: NextRequest, { params }) => {
  await requireAdmin();
  assertSameOrigin(req);
  const id = uuidParam.parse((await params).id);
  const session = await getSessionAdmin(id);
  if (!session) throw new HttpError(404, "NOT_FOUND", "找不到此對話");
  await restoreSession(id);
  return Response.json({ ok: true });
});
