"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/**
 * Error boundary for the (app) group. It sits BELOW (app)/layout, so the NavBar
 * stays mounted and the rest of the app remains navigable — a crash in one
 * screen (a canvas, the designer, a chart) is contained to that screen and is
 * recoverable via reset(). One user's render error never blocks the others.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // surface to the console for diagnosis (dev) / telemetry hook (later).
    console.error("[app] screen error:", error);
  }, [error]);

  return (
    <div className="flex h-full items-center justify-center bg-background p-8">
      <div className="max-w-md rounded-[var(--radius-lg)] border border-border bg-surface p-6 text-center">
        <h2 className="text-base font-semibold text-text">This screen hit an error</h2>
        <p className="mt-1 text-sm text-text-muted">
          It’s contained here — the rest of the app still works. Try again, or
          switch to another section in the nav.
        </p>
        <p className="mt-2 break-words font-readout text-xs text-danger">
          {error?.message || "Unknown error"}
        </p>
        {error?.digest && (
          <p className="mt-1 font-readout text-[10px] text-text-muted">
            ref: {error.digest}
          </p>
        )}
        <div className="mt-4 flex justify-center gap-2">
          <Button onClick={reset}>Try again</Button>
          <Button variant="secondary" onClick={() => location.assign("/simulation")}>
            Go to Simulation
          </Button>
        </div>
      </div>
    </div>
  );
}
