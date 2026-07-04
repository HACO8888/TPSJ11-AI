/**
 * Single source of truth for this app's own SSE protocol (server → client), shared by
 * the server emitter (lib/generate.ts) and the client reader (lib/hooks/useConversation.ts)
 * so a protocol change fails typecheck on both sides. No `server-only` / browser API —
 * safe to import from either bundle.
 *
 * `route.kind` includes "mixed": a single assistant turn that carries BOTH streamed
 * text (delta) and an image (Phase 2 text+image feature).
 */

export type RouteKind = "chat" | "image" | "mixed";

export interface SseDataMap {
  meta: { userMessageId: string; sessionId: string };
  route: { kind: RouteKind; prompt?: string };
  delta: { text: string };
  image: { imageId: string; messageId: string; imageUrl: string; prompt: string };
  done: { assistantMessageId?: string; usage?: Record<string, unknown> | null };
  error: { code: string; message: string; ref?: string };
}

export type SseEventName = keyof SseDataMap;
