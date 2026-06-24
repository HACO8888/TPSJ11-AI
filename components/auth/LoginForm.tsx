"use client";

import { Flame } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ApiError, apiSend } from "@/lib/api/client";

export function LoginForm() {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await apiSend("/api/auth/login", "POST", { username, password });
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "登入失敗，請稍後再試");
      setPending(false);
    }
  }

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-5">
      {/* campfire ember glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[40rem] w-[40rem] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-60 blur-3xl"
        style={{
          background:
            "radial-gradient(closest-side, color-mix(in srgb, var(--accent) 30%, transparent), transparent)",
        }}
      />

      <div className="relative w-full max-w-sm">
        <div className="mb-7 text-center">
          <div className="mb-3 inline-flex items-center gap-2">
            <Flame className="h-6 w-6 text-accent" strokeWidth={2.2} />
            <span className="font-mono text-sm tracking-[0.2em] text-muted">TSJ11 · 大露營</span>
          </div>
          <h1 className="font-display text-2xl font-semibold text-ink">營地 AI 助理</h1>
          <p className="mt-1.5 text-sm text-muted">登入以開始與模型協作、生成圖片。</p>
        </div>

        <form
          onSubmit={onSubmit}
          className="rounded-2xl border border-line bg-surface p-6 shadow-sm"
        >
          <label className="mb-1.5 block text-sm font-medium text-ink" htmlFor="username">
            帳號
          </label>
          <input
            id="username"
            name="username"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="mb-4 w-full rounded-lg border border-line bg-canvas px-3 py-2.5 text-ink outline-none focus:border-accent"
          />

          <label className="mb-1.5 block text-sm font-medium text-ink" htmlFor="password">
            密碼
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-line bg-canvas px-3 py-2.5 text-ink outline-none focus:border-accent"
          />

          {error && (
            <p className="mt-3 text-sm text-danger" role="alert">
              {error}
            </p>
          )}

          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={pending || !password}
            className="mt-5 w-full"
          >
            {pending ? "登入中…" : "進入營地"}
          </Button>
        </form>

        <p className="mt-5 text-center font-mono text-xs text-muted">
          台北市第 11 次大露營 · 內部工具
        </p>
      </div>
    </main>
  );
}
