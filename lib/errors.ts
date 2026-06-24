import "server-only";
import { randomBytes } from "node:crypto";
import { db } from "@/db";
import { errorLogs } from "@/db/schema";

export interface ErrorLogInput {
  scope: string;
  code?: string;
  status?: number;
  message?: string;
  detail?: unknown;
  sessionId?: string | null;
  path?: string | null;
}

function newRef(): string {
  return `E-${randomBytes(4).toString("hex").toUpperCase()}`;
}

function serialize(d: unknown): string {
  if (d == null) return "";
  if (d instanceof Error) return `${d.name}: ${d.message}\n${d.stack ?? ""}`;
  if (typeof d === "string") return d;
  try {
    return JSON.stringify(d, null, 2);
  } catch {
    return String(d);
  }
}

/**
 * Record an error to the server console (visible in production / Zeabur logs too)
 * and, best-effort, to the error_logs table. Returns the short reference shown to
 * the operator so a reported error can be looked up quickly.
 */
export async function logError(input: ErrorLogInput): Promise<string> {
  const ref = newRef();
  const detail = serialize(input.detail);

  console.error(
    `\n[error ${ref}] scope=${input.scope} code=${input.code ?? "-"} status=${input.status ?? "-"} path=${input.path ?? "-"} session=${input.sessionId ?? "-"}` +
      `\n  message: ${input.message ?? ""}` +
      (detail ? `\n  detail: ${detail.slice(0, 4000)}` : ""),
  );

  try {
    await db.insert(errorLogs).values({
      ref,
      scope: input.scope,
      code: input.code ?? null,
      status: input.status ?? null,
      message: input.message ?? null,
      detail: detail || null,
      sessionId: input.sessionId ?? null,
      path: input.path ?? null,
    });
  } catch (e) {
    console.error(`[error ${ref}] failed to persist to error_logs:`, e);
  }

  return ref;
}
