"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { apiSend } from "@/lib/api/client";
import { type Me, useMe } from "@/lib/hooks/useMe";

type Theme = "light" | "dark";

const ThemeContext = createContext<{ dark: boolean; toggle: () => void } | null>(null);

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  try {
    // Cache for the head script → instant, flash-free paint on the next reload.
    localStorage.setItem("tpsj-theme", theme);
  } catch {
    /* storage unavailable */
  }
}

/**
 * Account-level theme. The DB (via /api/auth/me) is the source of truth so the
 * preference follows the user across devices/browsers; localStorage is only a
 * local cache the head script reads to avoid a flash of the wrong palette.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const meQ = useMe();
  const [dark, setDark] = useState(false);

  // Seed from the class the head script already applied (from the local cache).
  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  // Once the account's saved theme loads, it wins — apply it and refresh the cache.
  useEffect(() => {
    const t = meQ.data?.theme;
    if (t !== "light" && t !== "dark") return;
    setDark(t === "dark");
    applyTheme(t);
  }, [meQ.data?.theme]);

  const setThemeM = useMutation({
    mutationFn: (theme: Theme) => apiSend("/api/auth/me", "PATCH", { theme }),
  });

  function toggle() {
    const prev: Theme = dark ? "dark" : "light";
    const next: Theme = dark ? "light" : "dark";
    setDark(next === "dark");
    applyTheme(next);
    qc.setQueryData<Me>(["me"], (old) => (old ? { ...old, theme: next } : old));
    setThemeM.mutate(next, {
      onError: () => {
        // Roll back the optimistic change if the server rejected it.
        setDark(prev === "dark");
        applyTheme(prev);
        qc.setQueryData<Me>(["me"], (old) => (old ? { ...old, theme: prev } : old));
      },
    });
  }

  return <ThemeContext.Provider value={{ dark, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
