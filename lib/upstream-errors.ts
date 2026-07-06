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
 * auth/rate by status first, then body-text sniffing for real quota / transient
 * no-provider / no-image, else a generic upstream error.
 */
export function classifyUpstreamError(status: number, body: string): UpstreamErrorInfo {
  if (status === 401) return { code: "UPSTREAM_AUTH", message: "AI 服務驗證失敗" };
  if (status === 429) return { code: "UPSTREAM_RATE", message: "AI 服務忙碌中，請稍後再試" };
  // The user's real quota is exhausted (provider replies RESOURCE_EXHAUSTED / quota /
  // rate-limit). Retrying can't help — it needs a reset window. Surfaced honestly as a
  // quota message. NOTE: checked BEFORE the no-provider branch so a genuine quota body
  // never falls through to the transient bucket.
  if (/quota|exhausted|resource_exhausted|ratelimitexceeded/i.test(body)) {
    return { code: "UPSTREAM_CAPACITY", message: "AI 服務今天的額度已用盡，請稍後再試" };
  }
  // The gateway has no healthy backend provider for the model right now. This is a
  // TRANSIENT availability problem on the gateway side — NOT the user's quota — so it
  // must not read as "額度用盡". It's retryable and usually clears in seconds.
  if (/no healthy provider/i.test(body)) {
    return { code: "UPSTREAM_BUSY", message: "圖片服務暫時忙線中，請稍後再試" };
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

/**
 * Whether an upstream image-generation failure is worth retrying. The gateway's single
 * image model is intermittently unavailable ("no healthy provider") or briefly 5xx —
 * a quick retry usually succeeds. Deliberately does NOT retry:
 *   • real quota exhaustion (needs a reset window — retry only burns more quota)
 *   • auth (401) and rejected prompts (upstreamStatus 400/422 — same prompt re-fails)
 *   • an abort (the user cancelled)
 *
 * `upstreamStatus` is the ORIGINAL gateway status (from HttpError.details), not the
 * wrapper 502 — a rejected prompt is a 400 wrapped as 502, and must not be retried.
 */
export function isRetryableUpstream(
  code: string | undefined,
  upstreamStatus: number | undefined,
): boolean {
  if (code === "UPSTREAM_AUTH" || code === "UPSTREAM_CAPACITY" || code === "ABORTED") return false;
  if (upstreamStatus === 400 || upstreamStatus === 401 || upstreamStatus === 422) return false;
  if (
    code === "UPSTREAM_BUSY" ||
    code === "IMAGE_NO_OUTPUT" ||
    code === "UPSTREAM_RATE" ||
    code === "UPSTREAM_TIMEOUT" ||
    code === "UPSTREAM"
  ) {
    return true;
  }
  return false;
}

/** What the image branch should do when generation fails. */
export type ImageFailureAction = "capacity" | "busy" | "no-output" | "rejected" | "rethrow";

/**
 * Decide how the image branch recovers from a failure, given the classified error
 * `code` and the raw upstream HTTP status. Mirrors the original `generate.ts` catch:
 * capacity/busy/no-output degrade to a friendly chat reply; a 400/422 means the model
 * rejected the prompt (also degrade + ask for a clearer description); anything else
 * is a real error to rethrow.
 */
export function imageFailureAction(
  code: string | undefined,
  upstreamStatus: number | undefined,
): ImageFailureAction {
  if (code === "UPSTREAM_CAPACITY") return "capacity";
  if (code === "UPSTREAM_BUSY") return "busy";
  if (code === "IMAGE_NO_OUTPUT") return "no-output";
  if (upstreamStatus === 400 || upstreamStatus === 422) return "rejected";
  return "rethrow";
}
