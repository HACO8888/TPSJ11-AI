import type { NextRequest } from "next/server";
import { deleteErrorLogById, deleteImageById, deleteSessionById } from "@/db/queries";
import { assertSameOrigin } from "@/lib/auth/csrf";
import { HttpError, route, uuidParam } from "@/lib/http";
import { requireAdmin } from "@/lib/permissions";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ type: string; id: string }> };

/** Delete a data row (admin): type = sessions | images | logs. */
export const DELETE = route<Ctx>(async (req: NextRequest, { params }) => {
  await requireAdmin();
  assertSameOrigin(req);
  const { type, id: rawId } = await params;
  const id = uuidParam.parse(rawId);
  if (type === "sessions") await deleteSessionById(id);
  else if (type === "images") await deleteImageById(id);
  else if (type === "logs") await deleteErrorLogById(id);
  else throw new HttpError(400, "BAD_TYPE", "未知的資料類型");
  return new Response(null, { status: 204 });
});
