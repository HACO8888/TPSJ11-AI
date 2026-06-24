"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
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
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);

  const sessionsQ = useSessions();
  const sessions = sessionsQ.data ?? [];
  const createM = useCreateSession();
  const renameM = useRenameSession();
  const deleteM = useDeleteSession();
  const convo = useConversation(activeId);

  // Restore a deep-linked session from the URL. Otherwise the default is a fresh,
  // unsaved conversation — a session is only created on the first message, so
  // opening the app (or "新對話") without typing leaves nothing behind.
  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get("s");
    if (s) setActiveId(s);
  }, []);

  function setActive(id: string | null) {
    setActiveId(id);
    window.history.replaceState(null, "", id ? `/?s=${id}` : "/");
  }

  // When a brand-new session has just been created for the first message, send it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: fire once the new session id + queued message are both ready
  useEffect(() => {
    if (activeId && pendingMessage) {
      convo.send(pendingMessage);
      setPendingMessage(null);
    }
  }, [activeId, pendingMessage]);

  async function handleSend(text: string) {
    if (activeId) {
      convo.send(text);
      return;
    }
    // Lazy create: only record a session once there is a message.
    const s = await createM.mutateAsync(undefined);
    setActive(s.id);
    setPendingMessage(text);
  }

  function handleNew() {
    // Go to a fresh conversation; the session is created on the first message.
    setActive(null);
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
        if (id === activeId) setActive(null);
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

  const busy = convo.busy || createM.isPending || pendingMessage !== null;
  const activeTitle = sessions.find((s) => s.id === activeId)?.title ?? "新對話";

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

        <MessageList
          messages={convo.messages}
          live={convo.live}
          busy={busy}
          onRegenerate={convo.regenerate}
        />
        <Composer busy={busy} onSend={handleSend} onStop={convo.stop} />
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
