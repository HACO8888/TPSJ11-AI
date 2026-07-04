/**
 * Pure classification of AI-gateway failures, split out of `aiClient.upstreamError`
 * and the `generate.ts` image-branch catch so the decisions can be unit-tested with
 * fixed inputs (the originals swallowed a `Response` / `HttpError`). No I/O here.
 *
 * These encode the app's "friendly, non-scary" error UX (recent commits): a temporary
 * upstream quota/capacity limit or a prompt the image model refused must degrade to a
 * calm chat reply, never a red error banner.
 */

export interface UpstreamErrorInfo {
  code: string;
  message: string;
}

/**
 * Map an upstream (gateway) HTTP status + response body to a stable error code and a
 * user-facing message. Order matters and mirrors the original `upstreamError`:
 * auth/rate by status first, then body-text sniffing for capacity / no-image, else a
 * generic upstream error.
 */
export function classifyUpstreamError(status: number, body: string): UpstreamErrorInfo {
  if (status === 401) return { code: "UPSTREAM_AUTH", message: "AI 服務驗證失敗" };
  if (status === 429) return { code: "UPSTREAM_RATE", message: "AI 服務忙碌中，請稍後再試" };
  // The gateway often wraps a provider quota/capacity error in a 500 body
  // ("RESOURCE_EXHAUSTED", "quota", "no healthy provider"). Surface it as a clear,
  // non-scary message — it's a temporary upstream limit, not a bug on our side.
  if (/quota|exhausted|resource_exhausted|ratelimitexceeded|no healthy provider/i.test(body)) {
    return { code: "UPSTREAM_CAPACITY", message: "AI 服務目前額度用盡或忙線中，請稍後再試" };
  }
  // The image model ran but returned no image — it often replies with a text
  // description instead of an actual image, which the gateway surfaces as a 500
  // "no image in response" / "Image editing failed". This is a prompt problem, not an
  // outage: the caller turns it into a friendly "couldn't generate this time" reply.
  if (/no image in response|image (?:editing|generation) failed|no image returned/i.test(body)) {
    return { code: "IMAGE_NO_OUTPUT", message: "這次沒有生成出圖片" };
  }
  return { code: "UPSTREAM", message: "AI 服務錯誤" };
}

/** What the image branch should do when generation fails. */
export type ImageFailureAction = "capacity" | "no-output" | "rejected" | "rethrow";

/**
 * Decide how the image branch recovers from a failure, given the classified error
 * `code` and the raw upstream HTTP status. Mirrors the original `generate.ts` catch:
 * capacity/no-output degrade to a friendly chat reply; a 400/422 means the model
 * rejected the prompt (also degrade + ask for a clearer description); anything else
 * is a real error to rethrow.
 */
export function imageFailureAction(
  code: string | undefined,
  upstreamStatus: number | undefined,
): ImageFailureAction {
  if (code === "UPSTREAM_CAPACITY") return "capacity";
  if (code === "IMAGE_NO_OUTPUT") return "no-output";
  if (upstreamStatus === 400 || upstreamStatus === 422) return "rejected";
  return "rethrow";
}
