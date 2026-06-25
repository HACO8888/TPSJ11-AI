import { Flame } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh-safe flex-col items-center justify-center px-6 text-center">
      <Flame className="mb-4 h-10 w-10 text-accent" strokeWidth={1.8} />
      <p className="font-mono text-sm tracking-[0.2em] text-muted">404</p>
      <h1 className="mt-2 font-display text-2xl font-semibold text-ink">找不到這個頁面</h1>
      <p className="mt-2 max-w-sm text-sm text-muted">
        這條步道沒有通往任何營地。請確認網址，或回到首頁。
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex h-10 items-center rounded-lg bg-brand px-4 text-sm font-medium text-brand-ink hover:brightness-110"
      >
        回到首頁
      </Link>
    </main>
  );
}
