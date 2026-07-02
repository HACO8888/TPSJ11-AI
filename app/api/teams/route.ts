import { requireAuth } from "@/lib/auth/session";
import { route } from "@/lib/http";
import { getTeams } from "@/lib/settings";

export const runtime = "nodejs";

/** The team roster for the cloud-save picker (auth required). */
export const GET = route(async () => {
  await requireAuth();
  const teams = await getTeams();
  return Response.json({ data: teams });
});
