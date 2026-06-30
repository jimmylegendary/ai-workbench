import type { Density, Theme } from "./store";

/**
 * Resolve the effective dark-mode boolean for a theme setting. `system` defers
 * to the OS `prefers-color-scheme`. SSR-safe: returns false when there is no
 * `window`/`matchMedia` (server render), letting the client correct on mount.
 */
export function isDark(theme: Theme): boolean {
  if (theme === "dark") return true;
  if (theme === "light") return false;
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * Apply appearance settings to the document root: toggles the `dark` class,
 * stamps `data-density`, and sets the `--accent` selection variable. No-ops on
 * the server.
 */
export function applyAppearance(
  theme: Theme,
  density: Density,
  accentColor: string,
): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", isDark(theme));
  root.dataset.density = density;
  root.style.setProperty("--accent", accentColor);
}
