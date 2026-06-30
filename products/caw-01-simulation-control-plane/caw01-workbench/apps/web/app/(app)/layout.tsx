import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { createClient } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/supabase/middleware";

/**
 * Session-gated group. The gate is active only when Supabase is configured (env
 * present) and PREVIEW_NO_AUTH is off — so the app runs locally with no Supabase
 * (auth wired later). Middleware enforces the same; this is defense in depth.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const gated = supabaseConfigured() && process.env.PREVIEW_NO_AUTH !== "1";
  if (gated) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");
  }

  return <AppShell>{children}</AppShell>;
}
