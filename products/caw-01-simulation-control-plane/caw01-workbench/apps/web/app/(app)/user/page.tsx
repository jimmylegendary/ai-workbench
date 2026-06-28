import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "./SignOutButton";

/** Account surface (routes-and-screens.md). Reads the Supabase user on the server. */
export default async function UserPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">User</h1>
      <div className="mt-4 max-w-md rounded-[var(--radius-md)] border border-border bg-surface p-4">
        <div className="text-xs text-text-muted">Signed in as</div>
        <div className="font-readout text-sm">{user?.email ?? "—"}</div>
        <div className="mt-1 font-readout text-xs text-text-muted">{user?.id}</div>
        <div className="mt-4">
          <SignOutButton />
        </div>
      </div>
    </div>
  );
}
