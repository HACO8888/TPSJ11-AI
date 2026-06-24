import type { NextRequest } from "next/server";
import { z } from "zod";
import { createSession, listSessions } from "@/db/queries";
import { assertSameOrigin } from "@/lib/auth/csrf";
import { requireAuth } from "@/lib/auth/session";
import { parseJson, route } from "@/lib/http";

export const runtime = "nodejs";

export const GET = route(async () => {
  const uid = await requireAuth();
  const data = await listSessions(uid);
  return Response.json({ data });
});

const CreateBody = z.object({ title: z.string().trim().max(120).optional() });

export const POST = route(async (req: NextRequest) => {
  const uid = await requireAuth();
  assertSameOrigin(req);
  const { title } = await parseJson(req, CreateBody);
  const session = await createSession(uid, title);
  return Response.json({ data: session }, { status: 201 });
});
