/**
 * Pure SSE frame decoding, shared by the client reader (our own protocol) and the
 * server-side upstream relay (OpenAI-style chat stream). Only the *mechanical* layer is
 * shared — splitting a growing text buffer into complete `event:`/`data:` frames plus
 * the trailing incomplete remainder; the semantic parsing of each frame's JSON stays
 * with each caller. No `server-only` / Node-only APIs, so it works in both bundles.
 */

export interface SseFrame {
  /** The `event:` field, or "message" when absent (SSE default). */
  event: string;
  /** The concatenated `data:` field(s). Our payloads are single-line JSON. */
  data: string;
}

/**
 * Split an accumulating SSE buffer into complete frames plus the trailing incomplete
 * chunk (which the caller carries into the next read). Frames are separated by a blank
 * line ("\n\n"). Frames with no `data:` are dropped (e.g. keep-alive comments).
 */
export function parseSseFrames(buffer: string): { frames: SseFrame[]; rest: string } {
  const records = buffer.split("\n\n");
  const rest = records.pop() ?? "";
  const frames: SseFrame[] = [];
  for (const rec of records) {
    let event = "message";
    let data = "";
    for (const line of rec.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data += line.slice(5).trim();
    }
    if (data) frames.push({ event, data });
  }
  return { frames, rest };
}
