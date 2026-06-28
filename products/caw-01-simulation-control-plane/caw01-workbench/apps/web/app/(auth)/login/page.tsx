"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

type Status = "idle" | "sending" | "sent" | "error";

/**
 * Login (View + a tiny inline ViewModel). Supabase magic-link / OTP (ADR-0008).
 * The middleware redirects authenticated users away from here.
 */
export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });
    setStatus(error ? "error" : "sent");
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-6">
      <div className="absolute left-4 top-4 text-xs text-text-muted">
        CAW-01 · Simulation Control Plane
      </div>
      <form
        onSubmit={sendLink}
        className="w-full max-w-sm rounded-[var(--radius-lg)] border border-border bg-surface p-6"
      >
        <h1 className="text-xl font-semibold">Sign in</h1>
        <p className="mt-1 text-sm text-text-muted">
          Team-internal access. We&apos;ll email you a sign-in link.
        </p>

        <label className="mt-5 block text-xs font-medium text-text-muted">
          Work email
        </label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-[var(--radius-sm)] border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          placeholder="you@team.com"
        />

        <Button type="submit" className="mt-4 w-full" disabled={status === "sending"}>
          {status === "sending" ? "Sending…" : "Send sign-in link"}
        </Button>

        {status === "sent" && (
          <p className="mt-3 text-sm text-success">
            Check your email — link sent to {email}.
          </p>
        )}
        {status === "error" && (
          <p className="mt-3 text-sm text-danger">Couldn&apos;t send link. Try again.</p>
        )}

        <p className="mt-4 text-xs text-text-muted">
          Magic-link / OTP via Supabase Auth. No passwords.
        </p>
      </form>
    </main>
  );
}
