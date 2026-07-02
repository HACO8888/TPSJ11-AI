"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api/client";

interface Me {
  authenticated: boolean;
  username: string | null;
}

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => apiGet<Me>("/api/auth/me"),
    staleTime: Number.POSITIVE_INFINITY,
  });
}
