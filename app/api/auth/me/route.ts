import { getAuthUserId } from "@/lib/auth/session";
import { route } from "@/lib/http";

export const runtime = "nodejs";

export const GET = route(async () => {
  const uid = await getAuthUserId();
  return Response.json({ authenticated: Boolean(uid) });
});
