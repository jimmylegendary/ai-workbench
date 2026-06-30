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
    let user = null;
    try {
      const supabase = await createClient();
      user = (await supabase.auth.getUser()).data.user;
    } catch {
      // Supabase unreachable — fail closed to /login rather than 500-ing the
      // whole (app) group for everyone.
      user = null;
    }
    if (!user) redirect("/login"); // outside try: redirect()'s internal throw must propagate
  }

  return <AppShell>{children}</AppShell>;
}
