"use client";

import { Moon, Sun } from "lucide-react";
import { Button } from "./Button";
import { useTheme } from "./ThemeProvider";

export function ThemeToggle() {
  const { dark, toggle } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={dark ? "切換為淺色主題" : "切換為深色主題"}
      title="切換主題"
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </Button>
  );
}
