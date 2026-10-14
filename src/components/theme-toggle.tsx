"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

type Theme = "light" | "dark";

function subscribe(cb: () => void) {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  // Follow the OS setting live until the user picks a theme explicitly.
  const mq = matchMedia("(prefers-color-scheme: dark)");
  const onOs = () => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem("theme");
    } catch {}
    if (saved !== "light" && saved !== "dark") apply(mq.matches ? "dark" : "light", false);
  };
  mq.addEventListener("change", onOs);
  return () => {
    mo.disconnect();
    mq.removeEventListener("change", onOs);
  };
}

const getTheme = (): Theme => (document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light");

function apply(theme: Theme, persist = true) {
  const root = document.documentElement;
  root.classList.add("theme-transition");
  root.setAttribute("data-theme", theme);
  if (persist) {
    try {
      localStorage.setItem("theme", theme);
    } catch {}
  }
  window.setTimeout(() => root.classList.remove("theme-transition"), 300);
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getTheme, () => "light" as Theme);
  return { theme, setTheme: (t: Theme) => apply(t), toggle: () => apply(theme === "dark" ? "light" : "dark") };
}

/** Sliding sun/moon pill switch. */
export function ThemeSwitch({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label="Dark mode"
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={toggle}
      className={cn(
        "relative inline-flex h-7 w-[52px] shrink-0 cursor-pointer items-center rounded-full border transition-colors duration-300 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/30",
        dark ? "border-white/10 bg-gradient-to-r from-[#1e1b4b] to-[#312e81]" : "border-amber-200 bg-gradient-to-r from-[#fff7e6] to-[#ffe7d6]",
        className,
      )}
    >
      <Sun className={cn("absolute left-1.5 h-3.5 w-3.5 text-amber-500 transition-opacity", dark ? "opacity-40" : "opacity-0")} />
      <Moon className={cn("absolute right-1.5 h-3.5 w-3.5 text-indigo-300 transition-opacity", dark ? "opacity-0" : "opacity-40")} />
      <span
        className={cn(
          "grid h-[22px] w-[22px] place-items-center rounded-full shadow-md transition-all duration-300 ease-[cubic-bezier(.34,1.56,.64,1)]",
          dark ? "translate-x-[26px] bg-[#0f1020] text-indigo-200" : "translate-x-[3px] bg-white text-amber-500",
        )}
      >
        {dark ? <Moon className="h-3.5 w-3.5" fill="currentColor" /> : <Sun className="h-3.5 w-3.5" />}
      </span>
    </button>
  );
}

/** Sidebar row: label + switch. */
export function ThemeRow() {
  const { theme } = useTheme();
  return (
    <div className="flex items-center justify-between rounded-lg px-3 py-2 text-[14px] text-foreground/80">
      <span className="flex items-center gap-3">
        {theme === "dark" ? <Moon className="h-[18px] w-[18px] text-foreground/70" strokeWidth={1.8} /> : <Sun className="h-[18px] w-[18px] text-foreground/70" strokeWidth={1.8} />}
        {theme === "dark" ? "Dark mode" : "Light mode"}
      </span>
      <ThemeSwitch />
    </div>
  );
}

/** Compact icon button (collapsed sidebar). */
export function ThemeIconButton({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className={cn("grid h-9 w-9 place-items-center rounded-lg text-foreground/70 hover:bg-black/[.05] hover:text-foreground", className)}
    >
      {dark ? <Moon className="h-[18px] w-[18px]" strokeWidth={1.8} /> : <Sun className="h-[18px] w-[18px]" strokeWidth={1.8} />}
    </button>
  );
}
