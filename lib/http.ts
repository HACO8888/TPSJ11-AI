import type { NextRequest } from "next/server";
import { z } from "zod";

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

export function fail(status: number, code: string, message: string, details?: unknown) {
  return Response.json(
    { error: { code, message, ...(details !== undefined ? { details } : {}) } },
    { status },
  );
}

type Handler<Ctx> = (req: NextRequest, ctx: Ctx) => Promise<Response>;

/** Wrap a route handler so thrown HttpError / ZodError / unknown become uniform envelopes. */
export function route<Ctx = unknown>(fn: Handler<Ctx>): Handler<Ctx> {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      if (e instanceof HttpError) return fail(e.status, e.code, e.message, e.details);
      if (e instanceof z.ZodError)
        return fail(422, "VALIDATION", "輸入格式錯誤", z.treeifyError(e));
      console.error("[route] unhandled error:", e);
      return fail(500, "INTERNAL", "伺服器錯誤");
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
