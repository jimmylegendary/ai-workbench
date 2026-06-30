"use client";

import { cn } from "@/lib/utils";

/**
 * A compact segmented toggle (radiogroup) for small, mutually-exclusive option
 * sets like theme and density. Selection uses --accent (selection-only token).
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex rounded-[var(--radius-md)] border border-border bg-surface-muted p-0.5"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "rounded-[var(--radius-sm)] px-3 py-1 text-sm font-medium transition-colors",
              active
                ? "bg-surface text-text shadow-sm ring-1 ring-[var(--accent)]"
                : "text-text-muted hover:text-text",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
