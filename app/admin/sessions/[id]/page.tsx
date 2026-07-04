"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { MarkdownRenderer } from "@/components/chat/MarkdownRenderer";
import { ThemeProvider } from "@/components/ui/ThemeProvider";
import { ApiError, apiGet, apiSend } from "@/lib/api/client";
import { useMe } from "@/lib/hooks/useMe";

interface AdminMessage {
  id: string;
  role: string;
  kind: string;
  content: string;
  imageId: string | null;
  imageUrl: string | null;
  attachments: { id: string; url: string }[];
  partial: boolean;
  usage: Record<string, unknown> | null;
  createdAt: string;
  deletedAt: string | null;
}

interface AdminSessionDetail {
  id: string;
  title: string;
  username: string | null;
  driveFolderId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

interface Payload {
  session: AdminSessionDetail;
  messages: AdminMessage[];
}

function fmtTime(v: string | null): string {
  if (!v) return "-";
  return new Date(v).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false });
}

export default function AdminSessionPage() {
  const me = useMe();
  const router = useRouter();
  const qc = useQueryClient();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const q = useQuery({
    queryKey: ["admin", "session", id],
    queryFn: () => apiGet<{ data: Payload }>(`/api/admin/sessions/${id}`).then((r) => r.data),
    enabled: Boolean(id) && me.data?.isAdmin === true,
  });

  if (me.isLoading) return <div className="p-6 text-muted">載入中…</div>;
  if (!me.data?.isAdmin) {
    return (
      <div className="p-6 text-sm text-danger">
        沒有權限，此頁僅限管理員。
        <a href="/" className="ml-2 underline">
          回首頁
        </a>
      </div>
    );
  }

  async function restore() {
    try {
      await apiSend(`/api/admin/sessions/${id}/restore`, "POST");
      await qc.invalidateQueries({ queryKey: ["admin", "session", id] });
      await qc.invalidateQueries({ queryKey: ["admin", "data", "sessions"] });
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "還原失敗");
    }
  }

  async function purge() {
    if (
      !window.confirm(
        "確定「永久刪除」這個對話？連同所有訊息與圖片都會從資料庫徹底移除，無法復原。",
      )
    )
      return;
    try {
      await apiSend(`/api/admin/data/sessions/${id}`, "DELETE");
      await qc.invalidateQueries({ queryKey: ["admin", "data", "sessions"] });
      router.push("/admin");
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "刪除失敗");
    }
  }

  const session = q.data?.session;
  const messages = q.data?.messages ?? [];
  const deleted = session?.deletedAt != null;

  return (
    <ThemeProvider>
      <div className="mx-auto min-h-screen max-w-3xl px-4 py-6">
        <div className="mb-4 flex items-center justify-between">
          <a href="/admin" className="text-sm text-muted hover:text-ink">
            ← 回管理後台
          </a>
          <div className="flex gap-2">
            {deleted && (
              <button
                type="button"
                onClick={restore}
                className="rounded-md bg-brand px-3 py-1.5 text-sm text-brand-ink"
              >
                還原對話
              </button>
            )}
            <button
              type="button"
              onClick={purge}
              className="rounded-md border border-danger px-3 py-1.5 text-sm text-danger hover:bg-danger/10"
            >
              永久刪除
            </button>
          </div>
        </div>

        {q.isLoading && <div className="text-muted">載入對話中…</div>}
        {q.isError && <div className="text-danger">載入失敗，請稍後再試。</div>}

        {session && (
          <>
            <div className="mb-5 rounded-lg border border-line bg-surface p-4">
              <div className="flex items-center gap-2">
                <h1 className="font-display text-lg font-bold text-ink">{session.title}</h1>
                {deleted && (
                  <span className="rounded bg-danger/10 px-1.5 py-0.5 text-xs text-danger">
                    已刪除
                  </span>
                )}
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs text-muted">
                <div>擁有者：{session.username ?? "（已移除的帳號）"}</div>
                <div>訊息數：{messages.length}</div>
                <div>建立：{fmtTime(session.createdAt)}</div>
                <div>更新：{fmtTime(session.updatedAt)}</div>
                {deleted && <div className="text-danger">刪除於：{fmtTime(session.deletedAt)}</div>}
              </dl>
            </div>

            <div className="space-y-4">
              {messages.map((m) => (
                <MessageBlock key={m.id} m={m} />
              ))}
              {messages.length === 0 && (
                <div className="text-sm text-muted">這個對話沒有任何訊息。</div>
              )}
            </div>
          </>
        )}
      </div>
    </ThemeProvider>
  );
}

function MessageBlock({ m }: { m: AdminMessage }) {
  const isDeleted = m.deletedAt != null;
  const label = m.kind === "image" ? "營地助理 · 圖片" : m.role === "user" ? "使用者" : "營地助理";

  return (
    <div className={isDeleted ? "opacity-55" : ""}>
      <div className="mb-1 flex items-center gap-1.5 font-mono text-[11px] text-muted">
        <span className={m.role === "user" ? "" : "text-brand"}>{label}</span>
        <span>· {fmtTime(m.createdAt)}</span>
        {isDeleted && (
          <span className="rounded bg-danger/10 px-1.5 py-0.5 text-danger">已刪除／已重生</span>
        )}
        {m.partial && <span className="text-muted">· 已中斷</span>}
      </div>

      {/* Uploaded 素材 attachments on a user message */}
      {m.attachments.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          {m.attachments.map((a) => (
            <a
              key={a.id}
              href={a.url}
              target="_blank"
              rel="noreferrer"
              className="block h-24 w-24 overflow-hidden rounded-lg border border-line bg-surface-2"
            >
              {/* biome-ignore lint/performance/noImgElement: auth-gated dynamic BYTEA image */}
              <img src={`${a.url}?w=256`} alt="附件圖片" className="h-full w-full object-cover" />
            </a>
          ))}
        </div>
      )}

      {m.kind === "image" && m.imageUrl ? (
        <a
          href={m.imageUrl}
          target="_blank"
          rel="noreferrer"
          className="block max-w-sm overflow-hidden rounded-xl border border-line bg-surface-2"
        >
          {/* biome-ignore lint/performance/noImgElement: auth-gated dynamic BYTEA image */}
          <img src={`${m.imageUrl}?w=640`} alt={m.content} className="w-full" />
        </a>
      ) : (
        m.content && (
          <div
            className={
              m.role === "user"
                ? "inline-block max-w-full break-words rounded-xl rounded-tl-sm bg-surface-2 px-3.5 py-1.5"
                : "rounded-xl rounded-tl-sm border border-line bg-surface px-4 py-3"
            }
          >
            <MarkdownRenderer content={m.content} />
          </div>
        )
      )}
    </div>
  );
}
