import type { NextRequest } from "next/server";
import { z } from "zod";
import { createUserRow, getUserByUsername, listUsers } from "@/db/queries";
import { assertSameOrigin } from "@/lib/auth/csrf";
import { hashPassword } from "@/lib/auth/password";
import { HttpError, parseJson, route } from "@/lib/http";
import { requireAdmin } from "@/lib/permissions";

export const runtime = "nodejs";

export const GET = route(async () => {
  await requireAdmin();
  return Response.json({ data: await listUsers() });
});

const CreateBody = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(200),
  canUpload: z.boolean().optional(),
  saveFolderId: z.string().trim().optional(),
});

export const POST = route(async (req: NextRequest) => {
  await requireAdmin();
  assertSameOrigin(req);
  const body = await parseJson(req, CreateBody);
  if (await getUserByUsername(body.username)) throw new HttpError(409, "EXISTS", "帳號已存在");
  const passwordHash = await hashPassword(body.password);
  const { id } = await createUserRow(body.username, passwordHash, {
    canUpload: body.canUpload ?? false,
    saveFolderId: body.saveFolderId?.trim() ? body.saveFolderId.trim() : null,
  });
  return Response.json({ data: { id } }, { status: 201 });
});
