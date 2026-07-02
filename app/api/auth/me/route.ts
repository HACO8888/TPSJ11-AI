import { getUserById } from "@/db/queries";
import { getAuthUserId } from "@/lib/auth/session";
import { route } from "@/lib/http";

export const runtime = "nodejs";

export const GET = route(async () => {
  const uid = await getAuthUserId();
  if (!uid) return Response.json({ authenticated: false, username: null });
  const user = await getUserById(uid);
  return Response.json({ authenticated: Boolean(user), username: user?.username ?? null });
});
