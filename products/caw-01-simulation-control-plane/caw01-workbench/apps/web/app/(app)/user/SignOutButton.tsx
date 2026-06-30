"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useSettingsStore } from "@/features/settings/store";

/**
 * Working sign-out: clears the local profile/session (settings store), then
 * routes to /login. Local-only by design (Supabase auth is wired later).
 */
export function SignOutButton() {
  const router = useRouter();
  const signOutLocal = useSettingsStore((s) => s.signOutLocal);
  const [busy, setBusy] = useState(false);

  function signOut() {
    setBusy(true);
    signOutLocal();
    router.replace("/login");
  }

  return (
    <Button variant="danger" onClick={signOut} disabled={busy}>
      {busy ? "Signing out…" : "Sign out"}
    </Button>
  );
}
