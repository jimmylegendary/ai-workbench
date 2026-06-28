import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { createClient } from "@/lib/supabase/server";

/**
 * Session-gated group. Middleware already redirects unauthenticated users, but we
 * re-check on the server (defense in depth) and provide the NavBar shell.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  // Re-check on the server (defense in depth). Skipped under the dev preview
  // escape hatch (OFF by default) — see lib/supabase/middleware.ts.
  if (process.env.PREVIEW_NO_AUTH !== "1") {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");
  }

  return <AppShell>{children}</AppShell>;
}
