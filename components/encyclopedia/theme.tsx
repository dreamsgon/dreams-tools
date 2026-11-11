"use client";
import { useEffect, useState, type ReactNode } from "react";
import { ThemeProvider as Provider, useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

export function ThemeProvider({ children }: { children: ReactNode }) {
  return <Provider attribute="data-theme" storageKey="ttrpg-color-theme" defaultTheme="light" enableSystem={false} disableTransitionOnChange>{children}</Provider>;
}

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = mounted && resolvedTheme === "dark";
  return <button type="button" className="theme-toggle" role="switch" aria-label="Dark mode" aria-checked={dark} disabled={!mounted} title={dark ? "Switch to light mode" : "Switch to dark mode"} onClick={() => setTheme(dark ? "light" : "dark")}>
    <Sun className="theme-sun" size={16} aria-hidden="true" />
    <Moon className="theme-moon" size={16} aria-hidden="true" />
    <span className="theme-label">Dark mode</span>
    <span className="theme-track" aria-hidden="true"><span /></span>
  </button>;
}
