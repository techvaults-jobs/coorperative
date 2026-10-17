"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/components/ui/cn";

type Theme = "system" | "light" | "dark";
const ORDER: Theme[] = ["system", "light", "dark"];
const ICON = { system: Monitor, light: Sun, dark: Moon };
const LABEL = { system: "Theme: match system", light: "Theme: light", dark: "Theme: dark" };

/** Cycles system → light → dark. Saved in a cookie so the server renders the right theme. */
export function ThemeToggle({ initial, className }: { initial: Theme; className?: string }) {
  const [theme, setTheme] = useState<Theme>(initial);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
    document.cookie = `cv_theme=${theme}; path=/; max-age=31536000; samesite=lax`;
  }, [theme]);
  const Icon = ICON[theme];
  return (
    <button
      type="button"
      onClick={() => setTheme(ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length]!)}
      aria-label={LABEL[theme]}
      title={LABEL[theme]}
      className={cn("text-muted hover:bg-surface-2 hover:text-foreground flex size-9 items-center justify-center rounded-lg transition-colors", className)}
    >
      <Icon className="size-[18px]" aria-hidden />
    </button>
  );
}
