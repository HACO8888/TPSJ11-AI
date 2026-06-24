import type { NextRequest } from "next/server";
import { assertSameOrigin } from "@/lib/auth/csrf";
import { destroySession } from "@/lib/auth/session";
import { route } from "@/lib/http";

export const runtime = "nodejs";

export const POST = route(async (req: NextRequest) => {
  assertSameOrigin(req);
  await destroySession();
  return new Response(null, { status: 204 });
});
