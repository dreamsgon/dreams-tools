"use client";
import type { ReactNode } from "react";
import AppearanceMenu from "@/components/appearance-menu";

// The theme and accent are set for every RPG Tools page by the boot script in
// app/layout.tsx and changed from the Appearance menu, so the Encyclopedia no
// longer keeps a theme of its own.
export function ThemeProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function ThemeToggle() {
  return <AppearanceMenu />;
}
