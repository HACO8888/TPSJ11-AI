"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api/client";

export interface Me {
  authenticated: boolean;
  username: string | null;
  theme: "light" | "dark" | null;
  /** Whether this account may upload 素材 images (per-account, server-computed). */
  canUpload: boolean;
  /** Whether this account is the admin (sees the /admin panel). */
  isAdmin: boolean;
}

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => apiGet<Me>("/api/auth/me"),
    staleTime: Number.POSITIVE_INFINITY,
  });
}
