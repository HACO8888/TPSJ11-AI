export interface SessionMeta {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export type Role = "user" | "assistant" | "system";
export type Kind = "text" | "image";

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

/** Local-only message used for optimistic rendering before the server confirms. */
export interface PendingImage {
  id: string;
  prompt: string;
  status: "loading" | "error";
  error?: string;
}
