"use client";

import type { ReactNode } from "react";
import { useWorkbenchStore } from "@/store/workbenchStore";

/**
 * 1:9 resizable split (component-inventory.md). The divider ratio is UI-local
 * state in the Zustand store (layout slice). Firm min-widths so the control
 * panel never collapses and the workspace stays dominant.
 */
export function SplitPane({
  left,
  right,
}: {
  left: ReactNode;
  right: ReactNode;
}) {
  const ratio = useWorkbenchStore((s) => s.layout.dividerRatio);
  return (
    <div className="flex h-full w-full">
      <aside
        className="min-w-[260px] max-w-[420px] overflow-y-auto border-r border-border bg-surface"
        style={{ flexBasis: `${ratio * 100}%` }}
      >
        {left}
      </aside>
      <section className="min-w-0 flex-1 overflow-hidden bg-background">
        {right}
      </section>
    </div>
  );
}
