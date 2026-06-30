"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSettingsStore } from "@/features/settings/store";
import { SignOutButton } from "./SignOutButton";

/** Mock session list (Supabase auth sessions land here later). */
const MOCK_SESSIONS = [
  { id: "cur", device: "This browser", where: "Local", lastActive: "Active now", current: true },
  { id: "s2", device: "Chrome · macOS", where: "San Francisco, US", lastActive: "2h ago", current: false },
  { id: "s3", device: "Safari · iPhone", where: "San Francisco, US", lastActive: "Yesterday", current: false },
] as const;

function initials(name: string, email: string): string {
  const src = name.trim() || email.trim();
  if (!src) return "—";
  const parts = src.split(/[\s@._-]+/).filter(Boolean);
  const letters = parts.length >= 2 ? parts[0][0] + parts[1][0] : src.slice(0, 2);
  return letters.toUpperCase();
}

/** Account surface — editable profile persisted to the local settings store. */
export default function UserPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const profile = useSettingsStore((s) => s.profile);
  const accentColor = useSettingsStore((s) => s.accentColor);
  const setProfile = useSettingsStore((s) => s.setProfile);

  // Local draft so typing doesn't thrash persisted storage; commit on Save.
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!mounted) return;
    setDisplayName(profile.displayName);
    setEmail(profile.email);
  }, [mounted, profile.displayName, profile.email]);

  if (!mounted) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">User</h1>
        <p className="mt-4 text-sm text-text-muted">Loading profile…</p>
      </div>
    );
  }

  const dirty =
    displayName !== profile.displayName || email !== profile.email;

  function save() {
    setProfile({ displayName: displayName.trim(), email: email.trim() });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">User</h1>

      <div className="mt-6 max-w-2xl space-y-4">
        {/* Profile ------------------------------------------------------- */}
        <section className="rounded-[var(--radius-md)] border border-border bg-surface p-4">
          <div className="flex items-center gap-4">
            <div
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-semibold text-white"
              style={{ backgroundColor: accentColor }}
              aria-hidden
            >
              {initials(displayName, email)}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">
                {profile.displayName || "Unnamed user"}
              </div>
              <div className="truncate font-readout text-xs text-text-muted">
                {profile.email || "no email set"}
              </div>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            <Field label="Display name">
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Ada Lovelace"
                className="w-full max-w-md rounded-[var(--radius-sm)] border border-border bg-background px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@team.com"
                className="w-full max-w-md rounded-[var(--radius-sm)] border border-border bg-background px-3 py-1.5 font-readout text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
            </Field>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <Button onClick={save} disabled={!dirty}>
              Save changes
            </Button>
            {saved && <span className="text-xs text-success">Saved.</span>}
          </div>
        </section>

        {/* Sessions ------------------------------------------------------ */}
        <section className="rounded-[var(--radius-md)] border border-border bg-surface p-4">
          <div className="text-sm font-medium">Sessions</div>
          <div className="mt-1 text-xs text-text-muted">
            Where your account is signed in (mock — wired to Supabase later).
          </div>
          <ul className="mt-3 divide-y divide-border">
            {MOCK_SESSIONS.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-2.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="truncate">{s.device}</span>
                    {s.current && <Badge tone="success">Current</Badge>}
                  </div>
                  <div className="font-readout text-xs text-text-muted">
                    {s.where} · {s.lastActive}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Sign out ------------------------------------------------------ */}
        <section className="rounded-[var(--radius-md)] border border-border bg-surface p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Sign out</div>
              <div className="mt-1 text-xs text-text-muted">
                Clears your local session and profile on this device.
              </div>
            </div>
            <SignOutButton />
          </div>
        </section>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-text-muted">{label}</span>
      {children}
    </label>
  );
}
