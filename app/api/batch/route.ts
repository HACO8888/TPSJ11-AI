import type { NextRequest } from "next/server";
import { z } from "zod";
import { getUserById } from "@/db/queries";
import { assertSameOrigin } from "@/lib/auth/csrf";
import { requireAuth } from "@/lib/auth/session";
import { buildBatchStream } from "@/lib/batch";
import { sseResponse } from "@/lib/generate";
import { HttpError, parseJson, route } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 300; // sequential image gen ×N (~23s each)

const Body = z.object({
  presetKey: z.string().min(1).max(40),
  items: z.array(z.string()).min(1).max(30),
});

/** Batch-generate one image per list item (nametags / certificates / …) as an SSE stream. */
export const POST = route(async (req: NextRequest) => {
  const uid = await requireAuth();
  assertSameOrigin(req);

  // Cost-sensitive (many generations) → limited to upload-enabled power accounts.
  const user = await getUserById(uid);
  if (!user?.canUpload) throw new HttpError(403, "BATCH_FORBIDDEN", "此帳號無法使用批次生成");

  const { presetKey, items } = await parseJson(req, Body);
  // Trim, drop blanks, cap length, de-dupe (keep order).
  const seen = new Set<string>();
  const clean: string[] = [];
  for (const raw of items) {
    const s = raw.trim().slice(0, 50);
    if (s && !seen.has(s)) {
      seen.add(s);
      clean.push(s);
    }
  }
  if (clean.length === 0) throw new HttpError(400, "EMPTY", "請至少輸入一個項目");

  const stream = buildBatchStream({ userId: uid, presetKey, items: clean, signal: req.signal });
  return sseResponse(stream);
});
