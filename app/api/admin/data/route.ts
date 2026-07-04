import type { NextRequest } from "next/server";
import {
  adminCounts,
  getUsageStats,
  listAllSessions,
  listErrorLogsAdmin,
  listImagesMeta,
} from "@/db/queries";
import { HttpError, route } from "@/lib/http";
import { requireAdmin } from "@/lib/permissions";

export const runtime = "nodejs";

/** Read-only data listings for the admin panel: ?type=counts|sessions|images|logs|usage. */
export const GET = route(async (req: NextRequest) => {
  await requireAdmin();
  const type = new URL(req.url).searchParams.get("type") ?? "counts";
  if (type === "counts") return Response.json({ data: await adminCounts() });
  if (type === "sessions") return Response.json({ data: await listAllSessions() });
  if (type === "images") return Response.json({ data: await listImagesMeta() });
  if (type === "logs") return Response.json({ data: await listErrorLogsAdmin() });
  if (type === "usage") return Response.json({ data: await getUsageStats() });
  throw new HttpError(400, "BAD_TYPE", "未知的資料類型");
});
