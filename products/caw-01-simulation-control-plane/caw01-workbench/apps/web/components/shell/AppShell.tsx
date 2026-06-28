import type { ReactNode } from "react";
import { NavBar } from "./NavBar";

/** Nav + content slot (component-inventory.md → Shell). */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh flex-col">
      <NavBar />
      <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
