"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiSend } from "@/lib/api/client";
import type { SessionMeta } from "@/lib/types";

export function useSessions() {
  return useQuery({
    queryKey: ["sessions"],
    queryFn: () => apiGet<{ data: SessionMeta[] }>("/api/sessions").then((r) => r.data),
  });
}

export function useCreateSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (title?: string) =>
      apiSend<{ data: SessionMeta }>("/api/sessions", "POST", title ? { title } : {}).then(
        (r) => r.data,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sessions"] }),
  });
}

export function useRenameSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      apiSend(`/api/sessions/${id}`, "PATCH", { title }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sessions"] }),
  });
}

export function useDeleteSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiSend(`/api/sessions/${id}`, "DELETE"),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ["sessions"] });
      qc.removeQueries({ queryKey: ["messages", id] });
    },
  });
}
