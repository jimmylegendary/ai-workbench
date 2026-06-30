"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Segmented } from "@/features/settings/components/Segmented";
import {
  ACCENT_PRESETS,
  AI_BACKENDS,
  DEFAULT_ENGINE_BASE_URL,
  useSettingsStore,
  type AiBackend,
} from "@/features/settings/store";
import { cn } from "@/lib/utils";

type PingState =
  | { kind: "idle" }
  | { kind: "testing" }
  | { kind: "ok"; status: number; ms: number }
  | { kind: "fail"; error: string };

/** Workspace settings — real, localStorage-backed (Supabase wiring comes later). */
export default function SettingsPage() {
  const hasHydrated = useSettingsStore((s) => s.hasHydrated);

  if (!hasHydrated) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="mt-4 text-sm text-text-muted">Loading preferences…</p>
      </div>
    );
  }
  return <SettingsForm />;
}

function SettingsForm() {
  const theme = useSettingsStore((s) => s.theme);
  const density = useSettingsStore((s) => s.density);
  const accentColor = useSettingsStore((s) => s.accentColor);
  const engineBaseUrl = useSettingsStore((s) => s.engineBaseUrl);
  const aiBackend = useSettingsStore((s) => s.aiBackend);

  const setTheme = useSettingsStore((s) => s.setTheme);
  const setDensity = useSettingsStore((s) => s.setDensity);
  const setAccentColor = useSettingsStore((s) => s.setAccentColor);
  const setEngineBaseUrl = useSettingsStore((s) => s.setEngineBaseUrl);
  const setAiBackend = useSettingsStore((s) => s.setAiBackend);
  const reset = useSettingsStore((s) => s.reset);

  const [ping, setPing] = useState<PingState>({ kind: "idle" });

  async function testConnection() {
    setPing({ kind: "testing" });
    try {
      const res = await fetch(
        `/api/engine/ping?url=${encodeURIComponent(engineBaseUrl)}`,
        { cache: "no-store" },
      );
      const data = (await res.json()) as {
        reachable: boolean;
        ok?: boolean;
        status?: number;
        ms?: number;
        error?: string;
      };
      if (data.reachable) {
        setPing({ kind: "ok", status: data.status ?? 0, ms: data.ms ?? 0 });
      } else {
        setPing({ kind: "fail", error: data.error ?? "Unreachable." });
      }
    } catch {
      setPing({ kind: "fail", error: "Network error." });
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Settings</h1>
        <Button variant="ghost" onClick={reset}>
          Reset to defaults
        </Button>
      </div>
      <p className="mt-1 text-sm text-text-muted">
        Saved to this browser. Changes apply instantly.
      </p>

      <div className="mt-6 max-w-2xl space-y-4">
        {/* Appearance ----------------------------------------------------- */}
        <Section
          title="Appearance"
          note="Theme, density, and the selection accent — applied live."
        >
          <Row label="Theme">
            <Segmented
              ariaLabel="Theme"
              value={theme}
              onChange={setTheme}
              options={[
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
                { value: "system", label: "System" },
              ]}
            />
          </Row>
          <Row label="Density">
            <Segmented
              ariaLabel="Density"
              value={density}
              onChange={setDensity}
              options={[
                { value: "compact", label: "Compact" },
                { value: "comfortable", label: "Comfortable" },
              ]}
            />
          </Row>
          <Row label="Accent">
            <div className="flex flex-wrap items-center gap-2">
              {ACCENT_PRESETS.map((p) => {
                const active = p.value.toLowerCase() === accentColor.toLowerCase();
                return (
                  <button
                    key={p.value}
                    type="button"
                    title={p.name}
                    aria-label={p.name}
                    aria-pressed={active}
                    onClick={() => setAccentColor(p.value)}
                    className={cn(
                      "h-6 w-6 rounded-full ring-offset-2 ring-offset-surface transition",
                      active ? "ring-2 ring-text" : "ring-1 ring-border hover:ring-text-muted",
                    )}
                    style={{ backgroundColor: p.value }}
                  />
                );
              })}
            </div>
          </Row>
        </Section>

        {/* Engine --------------------------------------------------------- */}
        <Section
          title="Engine"
          note="Base URL of the simulation engine the workbench drives."
        >
          <Row label="Base URL">
            <div className="flex w-full max-w-md items-center gap-2">
              <input
                type="url"
                inputMode="url"
                value={engineBaseUrl}
                onChange={(e) => {
                  setEngineBaseUrl(e.target.value);
                  setPing({ kind: "idle" });
                }}
                placeholder={DEFAULT_ENGINE_BASE_URL}
                className="w-full rounded-[var(--radius-sm)] border border-border bg-background px-3 py-1.5 font-readout text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
              <Button
                variant="secondary"
                onClick={testConnection}
                disabled={ping.kind === "testing" || engineBaseUrl.trim() === ""}
              >
                {ping.kind === "testing" ? "Testing…" : "Test"}
              </Button>
            </div>
          </Row>
          {ping.kind !== "idle" && ping.kind !== "testing" && (
            <Row label="">
              {ping.kind === "ok" ? (
                <Badge tone="success">
                  Reachable · {ping.status} · {ping.ms}ms
                </Badge>
              ) : (
                <Badge tone="danger">{ping.error}</Badge>
              )}
            </Row>
          )}
        </Section>

        {/* AI ------------------------------------------------------------- */}
        <Section
          title="AI assist"
          note="Backend that powers AI features. API keys live in server env — never in the browser."
        >
          <Row label="Backend">
            <select
              value={aiBackend}
              onChange={(e) => setAiBackend(e.target.value as AiBackend)}
              className="rounded-[var(--radius-sm)] border border-border bg-background px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {AI_BACKENDS.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </select>
          </Row>
          <Row label="">
            <p className="font-readout text-xs text-text-muted">
              {AI_BACKENDS.find((b) => b.value === aiBackend)?.note}
            </p>
          </Row>
        </Section>
      </div>
    </div>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[var(--radius-md)] border border-border bg-surface p-4">
      <div className="text-sm font-medium">{title}</div>
      <div className="mt-1 text-xs text-text-muted">{note}</div>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-4">
      <div className="w-24 shrink-0 text-xs text-text-muted">{label}</div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
