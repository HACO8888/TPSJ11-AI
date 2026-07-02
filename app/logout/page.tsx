"use client";

import { useEffect } from "react";
import { apiSend } from "@/lib/api/client";

// The visible 登出 button was removed from the sidebar; logging out now happens
// by navigating to /logout. This page fires the CSRF-protected POST and then
// bounces to the login screen.
export default function LogoutPage() {
  useEffect(() => {
    apiSend("/api/auth/logout", "POST")
      .catch(() => {})
      .finally(() => {
        window.location.href = "/login";
      });
  }, []);

  return (
    <main className="flex min-h-dvh-safe items-center justify-center px-5">
      <p className="text-sm text-muted">登出中…</p>
    </main>
  );
}
