"use client";
import { Moon, Sun } from "lucide-react";
import { useState } from "react";
import { THEME_COLOR, THEME_COOKIE, type Theme } from "@/lib/theme";
import { cn } from "./ui";

function apply(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=31536000; samesite=lax`;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[theme]);
}

/** Icon button that flips between dark (default) and light. */
export function ThemeToggle({ initial, className }: { initial: Theme; className?: string }) {
  const [theme, setTheme] = useState<Theme>(initial);
  const next: Theme = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={() => { apply(next); setTheme(next); }}
      className={cn("inline-flex size-10 items-center justify-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-fg", className)}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
    >
      {theme === "dark" ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
    </button>
  );
}

/** Full-width row version for menus: "Light mode" / "Dark mode" with a switch. */
export function ThemeRow({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState<Theme>(initial);
  const next: Theme = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={() => { apply(next); setTheme(next); }}
      className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-3 text-left text-[15px] text-fg hover:bg-surface-2"
      role="switch"
      aria-checked={theme === "dark"}
    >
      <span className="flex items-center gap-3">
        {theme === "dark" ? <Moon className="size-5 text-muted" /> : <Sun className="size-5 text-muted" />}
        Dark mode
      </span>
      <span className={cn("relative h-6 w-10 rounded-full transition", theme === "dark" ? "bg-accent" : "bg-surface-3")}>
        <span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow transition-all", theme === "dark" ? "left-[18px]" : "left-0.5")} />
      </span>
    </button>
  );
}
