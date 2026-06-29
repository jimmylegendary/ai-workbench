"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface Crumb {
  label: string;
  onClick?: () => void;
}

/**
 * Shared chrome for a canvas: title + Back + fractal breadcrumb + Fullscreen.
 * `focused` rings the frame when its canvas is the active selection. When
 * focused and `canBack`, Backspace pops one fractal level (go-back).
 */
export function CanvasFrame({
  title,
  crumbs = [],
  focused = false,
  canBack = false,
  onBack,
  onActivate,
  children,
}: {
  title: string;
  crumbs?: Crumb[];
  focused?: boolean;
  canBack?: boolean;
  onBack?: () => void;
  onActivate?: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const toggleFullscreen = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  }, []);

  // Backspace = go up one fractal level while this canvas is focused.
  useEffect(() => {
    if (!focused || !canBack || !onBack) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)
      )
        return;
      if (e.key === "Backspace") {
        e.preventDefault();
        onBack();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focused, canBack, onBack]);

  return (
    <div
      ref={ref}
      onMouseDown={onActivate}
      className={cn(
        "flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-[var(--radius-md)] border bg-canvas-bg",
        focused ? "border-accent ring-1 ring-accent/50" : "border-canvas-grid",
      )}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-canvas-grid px-2 py-1">
        <span className="shrink-0 font-readout text-[10px] uppercase tracking-wide text-canvas-text-muted">
          {title}
        </span>
        {canBack && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onBack?.();
            }}
            title="Back one level (Backspace)"
            aria-label="Back one level"
            className="shrink-0 rounded-[var(--radius-sm)] px-1 text-xs leading-none text-canvas-text-muted hover:bg-white/5 hover:text-accent"
          >
            ←
          </button>
        )}
        {crumbs.length > 0 && (
          <nav className="flex min-w-0 items-center gap-1 overflow-hidden font-readout text-[10px] text-canvas-text-muted">
            {crumbs.map((c, i) => (
              <span key={`${c.label}:${i}`} className="flex items-center gap-1">
                {i > 0 && <span className="text-canvas-text-dim">›</span>}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    c.onClick?.();
                  }}
                  className={cn(
                    "truncate hover:text-accent",
                    i === crumbs.length - 1 ? "text-accent" : "text-canvas-text-muted",
                  )}
                >
                  {c.label}
                </button>
              </span>
            ))}
          </nav>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleFullscreen();
          }}
          title="Fullscreen"
          aria-label="Toggle fullscreen"
          className="ml-auto shrink-0 rounded-[var(--radius-sm)] px-1 text-sm leading-none text-canvas-text-muted hover:bg-white/5 hover:text-accent"
        >
          ⤢
        </button>
      </div>
      <div className="relative min-h-0 flex-1">{children}</div>
    </div>
  );
}
