"use client";

import type { ReactNode } from "react";
import { SplitPane } from "@/components/shell/SplitPane";
import { cn } from "@/lib/utils";
import { useWorkbenchStore } from "@/store/workbenchStore";
import { useSimulationVM } from "../viewmodel/useSimulationVM";
import { ControlPanel } from "./ControlPanel";
import { FlowCanvasC1 } from "./canvases/FlowCanvasC1";
import { FlowCanvasC2 } from "./canvases/FlowCanvasC2";
import { HardwareTreeC3 } from "./canvases/HardwareTreeC3";
import { PartInspector } from "./PartInspector";
import { WorkTreeView } from "./work-tree/WorkTreeView";
import {
  projection,
  evidence,
  runStatus,
  dirtyDemo,
} from "../model/fixtures/controlpanel";

/**
 * The flagship 1:9 instrument screen. Client island mounted by the server page.
 *
 * Layout — SplitPane(left = ControlPanel, right = workspace):
 *   right is a vertical column:
 *     TOP  — a 3-up canvas row: C1 (workload flow) · C2 (serving/representation)
 *            · a C3 cell stacking HardwareTreeC3 over PartInspector.
 *     BOTTOM — the WorkTreeView (git-like change-management strip).
 *
 * Sources: useSimulationVM owns run/save/selection (engine stubbed). projection
 * + evidence are dev fixtures passed straight to ControlPanel until the
 * projection engine is wired.
 */
export function SimulationScreen({ experimentId }: { experimentId: string }) {
  const vm = useSimulationVM(experimentId);

  return (
    <SplitPane
      left={
        <ControlPanel
          /* run status + dirty are dev fixtures until RunService/SSE is wired
             (vm.perAxis/vm.dirty stay empty without the engine); handlers are
             the real VM intents. */
          perAxis={runStatus}
          dirty={dirtyDemo}
          isRunning={runStatus.some((a) => a.status === "running")}
          projection={projection}
          evidence={evidence}
          onRun={vm.onRun}
          onStop={vm.onStop}
          onSaveItem={vm.onSaveItem}
          onSaveAll={vm.onSaveAll}
        />
      }
      right={
        <div className="flex h-full min-h-0 flex-col gap-2 p-2">
          {/* TOP — 3-up canvas row (canvases dominate the column) */}
          <div className="grid min-h-0 flex-[3] grid-cols-3 gap-2">
            <CanvasCell title="C1 · AI workload flow" canvasId="c1">
              <FlowCanvasC1 />
            </CanvasCell>
            <CanvasCell title="C2 · Serving / representation" canvasId="c2">
              <FlowCanvasC2 />
            </CanvasCell>
            {/* C3 cell — HardwareTreeC3 above PartInspector */}
            <div className="grid min-h-0 grid-rows-2 gap-2">
              <HardwareTreeC3 />
              <PartInspector />
            </div>
          </div>

          {/* BOTTOM — work-tree strip */}
          <div className="min-h-0 flex-[2]">
            <WorkTreeView />
          </div>
        </div>
      }
    />
  );
}

/**
 * Header + bounded body wrapper that gives a bare React Flow canvas a real
 * height (the flow fills h-full of the flex-1 body). HardwareTreeC3 and
 * PartInspector are self-contained panels and don't need this.
 */
function CanvasCell({
  title,
  canvasId,
  children,
}: {
  title: string;
  canvasId: "c1" | "c2" | "c3";
  children: ReactNode;
}) {
  // Canvas-level focus ring driven by the shared selection, so selecting a
  // work-tree subtree (select({canvas})) visibly focuses the matching canvas.
  const focused = useWorkbenchStore((s) => s.selection.canvas) === canvasId;
  return (
    <div
      className={cn(
        "flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[var(--radius-md)] border bg-canvas-bg",
        focused ? "border-accent ring-1 ring-accent/50" : "border-canvas-grid",
      )}
    >
      <div className="shrink-0 border-b border-canvas-grid px-2 py-1 font-readout text-[10px] uppercase tracking-wide text-[#8b96a5]">
        {title}
      </div>
      <div className="relative min-h-0 flex-1">{children}</div>
    </div>
  );
}
