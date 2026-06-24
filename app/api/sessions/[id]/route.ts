import type { NextRequest } from "next/server";
import { z } from "zod";
import { deleteSession, renameSession } from "@/db/queries";
import { assertSameOrigin } from "@/lib/auth/csrf";
import { requireAuth } from "@/lib/auth/session";
import { HttpError, parseJson, route, uuidParam } from "@/lib/http";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const PatchBody = z.object({ title: z.string().trim().min(1).max(120) });

export const PATCH = route<Ctx>(async (req: NextRequest, { params }) => {
  const uid = await requireAuth();
  assertSameOrigin(req);
  const id = uuidParam.parse((await params).id);
  const { title } = await parseJson(req, PatchBody);
  const row = await renameSession(uid, id, title);
  if (!row) throw new HttpError(404, "NOT_FOUND", "找不到此對話");
  return Response.json({ data: row });
});

export const DELETE = route<Ctx>(async (req: NextRequest, { params }) => {
  const uid = await requireAuth();
  assertSameOrigin(req);
  const id = uuidParam.parse((await params).id);
  const ok = await deleteSession(uid, id);
  if (!ok) throw new HttpError(404, "NOT_FOUND", "找不到此對話");
  return Response.json({ ok: true });
});
