"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ApiError, apiGet, apiSend } from "@/lib/api/client";
import type { Team } from "@/lib/types";

export function AdminTeams() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["teams"],
    queryFn: () => apiGet<{ data: Team[] }>("/api/teams").then((r) => r.data),
  });
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (q.data) setText(JSON.stringify(q.data, null, 2));
  }, [q.data]);

  async function save() {
    setErr(null);
    setMsg(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      setErr("JSON 格式錯誤");
      return;
    }
    const ok =
      Array.isArray(parsed) &&
      parsed.every((t) => {
        const o = t as { code?: unknown; name?: unknown };
        return typeof o?.code === "string" && typeof o?.name === "string";
      });
    if (!ok) {
      setErr('必須是 [{ "code": "T01", "name": "..." }] 陣列');
      return;
    }
    try {
      await apiSend("/api/admin/settings", "PUT", { key: "teams", value: parsed });
      await qc.invalidateQueries({ queryKey: ["teams"] });
      setMsg("已儲存");
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "儲存失敗");
    }
  }

  async function reset() {
    setErr(null);
    setMsg(null);
    if (!window.confirm("重設為預設 72 隊？")) return;
    try {
      await apiSend("/api/admin/settings?key=teams", "DELETE");
      await qc.invalidateQueries({ queryKey: ["teams"] });
      setMsg("已重設為預設");
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "重設失敗");
    }
  }

  return (
    <div className="space-y-2">
      <div className="text-sm text-muted">
        小隊清單（JSON 陣列，每項 {`{ "code": "T01", "name": "…" }`}）。目前共 {q.data?.length ?? 0}{" "}
        隊。
      </div>
      {err && <div className="rounded bg-danger/10 px-3 py-2 text-sm text-danger">{err}</div>}
      {msg && <div className="rounded bg-brand/10 px-3 py-2 text-sm text-brand">{msg}</div>}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={16}
        className="w-full rounded-lg border border-line bg-canvas p-3 font-mono text-xs text-ink"
      />
      <div className="flex gap-2">
        <Button variant="brand" onClick={save}>
          儲存
        </Button>
        <Button variant="outline" onClick={reset}>
          重設為預設
        </Button>
      </div>
    </div>
  );
}
