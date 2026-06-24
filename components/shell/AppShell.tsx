"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Composer } from "@/components/chat/Composer";
import { MessageList } from "@/components/chat/MessageList";
import { SessionSidebar } from "@/components/sidebar/SessionSidebar";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { apiSend } from "@/lib/api/client";
import { useConversation } from "@/lib/hooks/useConversation";
import {
  useCreateSession,
  useDeleteSession,
  useRenameSession,
  useSessions,
} from "@/lib/hooks/useSessions";
import { TopBar } from "./TopBar";

export function AppShell() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const sessionsQ = useSessions();
  const sessions = sessionsQ.data ?? [];
  const createM = useCreateSession();
  const renameM = useRenameSession();
  const deleteM = useDeleteSession();
  const convo = useConversation(activeId);

  // Restore the active session from the URL on first load.
  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get("s");
    if (s) setActiveId(s);
  }, []);

  function setActive(id: string | null) {
    setActiveId(id);
    window.history.replaceState(null, "", id ? `/?s=${id}` : "/");
  }

  // Auto-select the most recent session when none is active.
  // biome-ignore lint/correctness/useExhaustiveDependencies: one-shot auto-select; setActive must not be a dep or it would loop
  useEffect(() => {
    if (!activeId && sessions.length > 0) setActive(sessions[0].id);
  }, [activeId, sessions.length]);

  async function handleNew() {
    const s = await createM.mutateAsync(undefined);
    setActive(s.id);
    setSheetOpen(false);
  }

  function handleSelect(id: string) {
    setActive(id);
    setSheetOpen(false);
  }

  function confirmDelete() {
    if (!pendingDelete) return;
    const id = pendingDelete;
    deleteM.mutate(id, {
      onSuccess: () => {
        if (id === activeId) {
          const next = sessions.find((s) => s.id !== id);
          setActive(next?.id ?? null);
        }
      },
    });
    setPendingDelete(null);
  }

  async function handleLogout() {
    await apiSend("/api/auth/logout", "POST").catch(() => {});
    window.location.href = "/login";
  }

  const sidebarProps = {
    sessions,
    loading: sessionsQ.isLoading,
    activeId,
    onSelect: handleSelect,
    onNew: handleNew,
    onRename: (id: string, title: string) => renameM.mutate({ id, title }),
    onDelete: (id: string) => setPendingDelete(id),
    onLogout: handleLogout,
  };

  const activeTitle = sessions.find((s) => s.id === activeId)?.title ?? "營地助理";

  return (
    <div className="flex h-dvh overflow-hidden">
      <aside className="hidden w-72 flex-none border-r border-line lg:block">
        <SessionSidebar {...sidebarProps} />
      </aside>

      <Dialog.Root open={sheetOpen} onOpenChange={setSheetOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="overlay-in fixed inset-0 z-40 bg-black/40 lg:hidden" />
          <Dialog.Content
            className="sheet-in fixed inset-y-0 left-0 z-50 w-[min(86vw,20rem)] border-r border-line focus:outline-none lg:hidden"
            aria-describedby={undefined}
          >
            <Dialog.Title className="sr-only">對話列表</Dialog.Title>
            <Dialog.Close asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="關閉"
                className="absolute right-2 top-2.5 z-10"
              >
                <X size={18} />
              </Button>
            </Dialog.Close>
            <SessionSidebar {...sidebarProps} />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <main className="flex min-w-0 flex-1 flex-col">
        <TopBar title={activeTitle} onOpenSidebar={() => setSheetOpen(true)} />

        {convo.error && (
          <div className="flex items-center gap-3 border-b border-danger/30 bg-danger/10 px-4 py-2 text-sm text-danger">
            <span className="flex-1">{convo.error}</span>
            <button type="button" onClick={convo.clearError} aria-label="關閉提示">
              <X size={15} />
            </button>
          </div>
        )}

        {activeId ? (
          <>
            <MessageList messages={convo.messages} live={convo.live} />
            <Composer busy={convo.busy} onSend={convo.send} onStop={convo.stop} />
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
            <h2 className="font-display text-xl font-semibold text-ink">還沒有對話</h2>
            <p className="mt-2 max-w-sm text-sm text-muted">
              建立第一個對話，開始與模型協作、生成大露營需要的圖片。
            </p>
            <Button variant="brand" size="md" onClick={handleNew} className="mt-5">
              <Plus size={16} /> 新對話
            </Button>
          </div>
        )}
      </main>

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(o) => {
          if (!o) setPendingDelete(null);
        }}
        title="刪除這個對話？"
        description="此操作無法復原，對話內的訊息與圖片都會一併刪除。"
        confirmLabel="刪除"
        onConfirm={confirmDelete}
      />
    </div>
  );
}
