export interface SessionMeta {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export type Role = "user" | "assistant" | "system";
// 'mixed' = a single assistant turn with both a text caption (content) and an image.
export type Kind = "text" | "image" | "mixed";

export interface ChatMessageDTO {
  id: string;
  role: Role;
  kind: Kind;
  content: string;
  imageId: string | null;
  imageUrl: string | null;
  attachments: { id: string; url: string }[];
  partial: boolean;
  usage: Record<string, unknown> | null;
  createdAt: string;
}

/** Which rendition(s) to cloud-save: original bytes, a compressed ≤2MB JPEG, or both. */
export type CloudSaveSize = "original" | "small" | "both";

/** A patrol/team: a short code (T01) and its full name (陽明營區_第1團_第1隊). */
export interface Team {
  code: string;
  name: string;
}

/** Local-only message used for optimistic rendering before the server confirms. */
export interface PendingImage {
  id: string;
  prompt: string;
  status: "loading" | "error";
  error?: string;
}
