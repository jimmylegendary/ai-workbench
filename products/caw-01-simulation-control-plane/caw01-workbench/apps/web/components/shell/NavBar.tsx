"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** Top system nav (brief §3): Simulation · Module Design · User · Setting. */
const items = [
  { href: "/simulation", label: "Simulation" },
  { href: "/module-design", label: "Module Design" },
  { href: "/user", label: "User" },
  { href: "/settings", label: "Setting" },
];

export function NavBar() {
  const pathname = usePathname();
  return (
    <header className="flex h-11 items-center justify-between border-b border-border bg-surface px-4">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold tracking-tight">CAW-01</span>
        <span className="text-xs text-text-muted">Simulation Control Plane</span>
      </div>
      <nav className="flex items-center gap-1">
        {items.map((it) => {
          const active = pathname.startsWith(it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              className={cn(
                "rounded-[var(--radius-sm)] px-2.5 py-1 text-sm transition-colors",
                active
                  ? "text-primary font-medium"
                  : "text-text-muted hover:text-text hover:bg-surface-muted",
              )}
            >
              {it.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
