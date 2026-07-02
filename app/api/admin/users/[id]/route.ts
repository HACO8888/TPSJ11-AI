import type { NextRequest } from "next/server";
import { z } from "zod";
import { deleteUserById, getUserById, setUserPassword, updateUserFlags } from "@/db/queries";
import { assertSameOrigin } from "@/lib/auth/csrf";
import { hashPassword } from "@/lib/auth/password";
import { HttpError, parseJson, route, uuidParam } from "@/lib/http";
import { isAdmin, requireAdmin } from "@/lib/permissions";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const PatchBody = z.object({
  canUpload: z.boolean().optional(),
  saveFolderId: z.string().trim().nullable().optional(),
  password: z.string().min(1).max(200).optional(),
});

export const PATCH = route<Ctx>(async (req: NextRequest, { params }) => {
  await requireAdmin();
  assertSameOrigin(req);
  const id = uuidParam.parse((await params).id);
  const body = await parseJson(req, PatchBody);

  if (body.canUpload !== undefined || body.saveFolderId !== undefined) {
    await updateUserFlags(id, {
      canUpload: body.canUpload,
      saveFolderId: body.saveFolderId === undefined ? undefined : body.saveFolderId?.trim() || null,
    });
  }
  if (body.password) await setUserPassword(id, await hashPassword(body.password));
  return Response.json({ data: { ok: true } });
});

export const DELETE = route<Ctx>(async (req: NextRequest, { params }) => {
  await requireAdmin();
  assertSameOrigin(req);
  const id = uuidParam.parse((await params).id);
  const target = await getUserById(id);
  if (target && isAdmin(target.username)) {
    throw new HttpError(400, "ADMIN_PROTECTED", "不能刪除管理員帳號");
  }
  await deleteUserById(id);
  return new Response(null, { status: 204 });
});
