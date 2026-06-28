import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "running" | "success" | "danger" | "warning";

const tones: Record<Tone, string> = {
  neutral: "bg-surface-muted text-text-muted",
  running: "bg-accent/15 text-accent",
  success: "bg-success/15 text-success",
  danger: "bg-danger/15 text-danger",
  warning: "bg-warning/15 text-warning",
};

/**
 * Status/boundary badge. Color is paired with text (color-blind-safe per the
 * DESIGN.md anti-patterns) — never hue alone.
 */
export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-[var(--radius-sm)] px-1.5 py-0.5 text-xs font-medium",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}
