"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** Primary sections. */
const items = [
  { href: "/simulation", label: "Simulation" },
  { href: "/module-design", label: "Module Design" },
  { href: "/sim-result", label: "Sim Result" },
];

/** Account/settings are icon-only on the right. */
const icons = [
  {
    href: "/user",
    label: "User",
    path: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0",
  },
  {
    href: "/settings",
    label: "Setting",
    path: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8.4-3a8.4 8.4 0 0 0-.1-1.3l2-1.6-2-3.4-2.4 1a8 8 0 0 0-2.2-1.3l-.4-2.5H9.3l-.4 2.5a8 8 0 0 0-2.2 1.3l-2.4-1-2 3.4 2 1.6a8.4 8.4 0 0 0 0 2.6l-2 1.6 2 3.4 2.4-1a8 8 0 0 0 2.2 1.3l.4 2.5h5.4l.4-2.5a8 8 0 0 0 2.2-1.3l2.4 1 2-3.4-2-1.6c.07-.43.1-.86.1-1.3Z",
  },
];

export function NavBar() {
  const pathname = usePathname();
  return (
    <header className="flex h-11 items-center justify-between border-b border-border bg-surface px-4">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold tracking-tight">CAW-01</span>
        <span className="hidden text-xs text-text-muted sm:inline">
          Simulation Control Plane
        </span>
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
                  ? "font-medium text-primary"
                  : "text-text-muted hover:bg-surface-muted hover:text-text",
              )}
            >
              {it.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center gap-1">
        {icons.map((it) => {
          const active = pathname.startsWith(it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              title={it.label}
              aria-label={it.label}
              className={cn(
                "rounded-[var(--radius-sm)] p-1.5 transition-colors",
                active
                  ? "text-primary"
                  : "text-text-muted hover:bg-surface-muted hover:text-text",
              )}
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4.5 w-4.5"
                width="18"
                height="18"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d={it.path} />
              </svg>
            </Link>
          );
        })}
      </div>
    </header>
  );
}
