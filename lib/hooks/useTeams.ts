"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api/client";
import type { Team } from "@/lib/types";

export function useTeams() {
  return useQuery({
    queryKey: ["teams"],
    queryFn: () => apiGet<{ data: Team[] }>("/api/teams").then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });
}
