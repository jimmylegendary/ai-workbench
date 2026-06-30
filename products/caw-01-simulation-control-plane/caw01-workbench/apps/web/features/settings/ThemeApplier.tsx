"use client";

import { useEffect } from "react";
import { useSettingsStore } from "./store";
import { applyAppearance } from "./theme";

/**
 * Mounts once (in the root layout) and keeps <html> in sync with the settings
 * store: theme class, density attribute, and the --accent variable. Renders
 * nothing. The inline no-flash script in layout.tsx handles the first paint;
 * this component owns every change after hydration, including live OS theme
 * flips while `theme === "system"`.
 */
export function ThemeApplier() {
  const theme = useSettingsStore((s) => s.theme);
  const density = useSettingsStore((s) => s.density);
  const accentColor = useSettingsStore((s) => s.accentColor);

  useEffect(() => {
    applyAppearance(theme, density, accentColor);
  }, [theme, density, accentColor]);

  useEffect(() => {
    if (theme !== "system" || typeof window === "undefined" || !window.matchMedia)
      return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyAppearance(theme, density, accentColor);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme, density, accentColor]);

  return null;
}
