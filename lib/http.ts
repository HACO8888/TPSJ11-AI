import type { NextRequest } from "next/server";
import { z } from "zod";
import { logError } from "@/lib/errors";

/** Thrown anywhere in a handler; the route() wrapper turns it into a JSON envelope. */
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/** Error envelope: { error: { code, message, ref? } }. `ref` is the log reference. */
export function fail(status: number, code: string, message: string, ref?: string) {
  return Response.json({ error: { code, message, ...(ref ? { ref } : {}) } }, { status });
}

type Handler<Ctx> = (req: NextRequest, ctx: Ctx) => Promise<Response>;

/**
 * Wrap a route handler so thrown HttpError / ZodError / unknown become uniform
 * envelopes. Server errors (5xx) and unexpected errors are logged (console + DB)
 * and the returned envelope carries the short `ref` for the operator to report.
 */
export function route<Ctx = unknown>(fn: Handler<Ctx>): Handler<Ctx> {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      const path = req.nextUrl?.pathname;

      if (e instanceof z.ZodError) {
        return fail(422, "VALIDATION", "輸入格式錯誤");
      }
      if (e instanceof HttpError) {
        if (e.status >= 500) {
          const ref = await logError({
            scope: "route",
            code: e.code,
            status: e.status,
            message: e.message,
            detail: e.details,
            path,
          });
          return fail(e.status, e.code, e.message, ref);
        }
        return fail(e.status, e.code, e.message);
      }

      const ref = await logError({
        scope: "route",
        code: "INTERNAL",
        status: 500,
        message: e instanceof Error ? e.message : "unknown error",
        detail: e,
        path,
      });
      return fail(500, "INTERNAL", "伺服器錯誤", ref);
    }
  };
}

export async function parseJson<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new HttpError(400, "BAD_JSON", "請求格式錯誤");
  }
  return schema.parse(raw);
}

export const uuidParam = z.string().uuid("無效的 id");
