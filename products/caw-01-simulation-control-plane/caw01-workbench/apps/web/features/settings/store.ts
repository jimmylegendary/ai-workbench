"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Workspace settings (Appearance / Engine / AI / Profile).
 *
 * Source of truth is localStorage (key `caw01.settings`) via zustand `persist`.
 * Supabase is intentionally NOT wired here yet — when it lands, this store
 * becomes the optimistic/interaction cache and Supabase the durable store.
 * Appearance changes are applied to <html> live by features/settings/ThemeApplier.
 */

export type Theme = "light" | "dark" | "system";
export type Density = "compact" | "comfortable";
export type AiBackend = "openai" | "claude-cli" | "openclaw-cli" | "none";

export interface Profile {
  displayName: string;
  email: string;
}

/** Categorical accent presets (off the run-state hues; --accent drives selection). */
export const ACCENT_PRESETS: ReadonlyArray<{ name: string; value: string }> = [
  { name: "Cyan", value: "#06b6d4" },
  { name: "Indigo", value: "#6366f1" },
  { name: "Violet", value: "#a855f7" },
  { name: "Teal", value: "#2dd4bf" },
  { name: "Pink", value: "#f472b6" },
  { name: "Amber", value: "#f59e0b" },
];

export const AI_BACKENDS: ReadonlyArray<{ value: AiBackend; label: string; note: string }> = [
  { value: "openai", label: "OpenAI", note: "OPENAI_API_KEY (server env)" },
  { value: "claude-cli", label: "Claude CLI", note: "local `claude` binary" },
  { value: "openclaw-cli", label: "OpenClaw CLI", note: "local `openclaw` binary" },
  { value: "none", label: "None", note: "AI assist disabled" },
];

export const DEFAULT_ENGINE_BASE_URL = "http://localhost:8000";
export const DEFAULT_ACCENT = ACCENT_PRESETS[0].value;

interface SettingsState {
  theme: Theme;
  density: Density;
  accentColor: string;
  engineBaseUrl: string;
  aiBackend: AiBackend;
  profile: Profile;

  /** True once persisted state has been read from localStorage (SSR-safe gate). */
  hasHydrated: boolean;

  setTheme: (theme: Theme) => void;
  setDensity: (density: Density) => void;
  setAccentColor: (accentColor: string) => void;
  setEngineBaseUrl: (engineBaseUrl: string) => void;
  setAiBackend: (aiBackend: AiBackend) => void;
  setProfile: (patch: Partial<Profile>) => void;

  /** Clear the local profile (mock sign-out). Appearance/engine prefs are kept. */
  signOutLocal: () => void;
  /** Restore every setting to its default. */
  reset: () => void;
  setHydrated: () => void;
}

const DEFAULTS = {
  theme: "system" as Theme,
  density: "compact" as Density,
  accentColor: DEFAULT_ACCENT,
  engineBaseUrl: DEFAULT_ENGINE_BASE_URL,
  aiBackend: "none" as AiBackend,
  profile: { displayName: "", email: "" } as Profile,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      hasHydrated: false,

      setTheme: (theme) => set({ theme }),
      setDensity: (density) => set({ density }),
      setAccentColor: (accentColor) => set({ accentColor }),
      setEngineBaseUrl: (engineBaseUrl) => set({ engineBaseUrl }),
      setAiBackend: (aiBackend) => set({ aiBackend }),
      setProfile: (patch) =>
        set((s) => ({ profile: { ...s.profile, ...patch } })),

      signOutLocal: () => set({ profile: { displayName: "", email: "" } }),
      reset: () => set({ ...DEFAULTS }),
      setHydrated: () => set({ hasHydrated: true }),
    }),
    {
      name: "caw01.settings",
      // Persist data only — never the methods or the hydration flag.
      partialize: (s) => ({
        theme: s.theme,
        density: s.density,
        accentColor: s.accentColor,
        engineBaseUrl: s.engineBaseUrl,
        aiBackend: s.aiBackend,
        profile: s.profile,
      }),
      // Flip hasHydrated even on a hydration FAILURE (corrupt/disabled storage),
      // so the gated Settings/User pages never get stuck on "Loading…".
      onRehydrateStorage: () => () => {
        useSettingsStore.setState({ hasHydrated: true });
      },
    },
  ),
);
