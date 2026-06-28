"use client";

import { useCallback, useRef, type ReactNode } from "react";
import { useWorkbenchStore } from "@/store/workbenchStore";

/**
 * 1:9 resizable split (component-inventory.md). The divider ratio is UI-local
 * state in the Zustand store (layout slice). Dragging the divider updates the
 * ratio, clamped to the aside's min/max (260–420px) so the control panel never
 * collapses and the workspace stays dominant.
 */
export function SplitPane({
  left,
  right,
}: {
  left: ReactNode;
  right: ReactNode;
}) {
  const ratio = useWorkbenchStore((s) => s.layout.dividerRatio);
  const setRatio = useWorkbenchStore((s) => s.setDividerRatio);
  const containerRef = useRef<HTMLDivElement>(null);

  const startDrag = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const el = containerRef.current;
      if (!el) return;
      const onMove = (ev: MouseEvent) => {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0) return;
        const next = (ev.clientX - rect.left) / rect.width;
        const min = 260 / rect.width;
        const max = 420 / rect.width;
        setRatio(Math.min(max, Math.max(min, next)));
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
      };
      document.body.style.cursor = "col-resize";
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [setRatio],
  );

  return (
    <div ref={containerRef} className="flex h-full w-full">
      <aside
        className="min-w-[260px] max-w-[420px] overflow-y-auto bg-surface"
        style={{ flexBasis: `${ratio * 100}%` }}
      >
        {left}
      </aside>
      <div
        role="separator"
        aria-orientation="vertical"
        onMouseDown={startDrag}
        title="Drag to resize"
        className="w-px shrink-0 cursor-col-resize bg-border transition-colors hover:bg-primary"
      />
      <section className="min-w-0 flex-1 overflow-hidden bg-background">
        {right}
      </section>
    </div>
  );
}
