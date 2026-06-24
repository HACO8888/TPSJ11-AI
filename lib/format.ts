export function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function totalTokens(usage: Record<string, unknown> | null | undefined): number | null {
  if (!usage) return null;
  const t = usage.total_tokens;
  return typeof t === "number" ? t : null;
}
