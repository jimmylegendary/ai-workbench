"use client";

import type { ReactNode } from "react";
import { SplitPane } from "@/components/shell/SplitPane";
import { useWorkbenchStore, type CanvasId } from "@/store/workbenchStore";
import { useSimulationVM } from "../viewmodel/useSimulationVM";
import { ControlPanel } from "./ControlPanel";
import { ViewToolbar } from "./ViewToolbar";
import { FlowCanvasC1 } from "./canvases/FlowCanvasC1";
import { FlowCanvasC2 } from "./canvases/FlowCanvasC2";
import { HardwareTreeC3 } from "./canvases/HardwareTreeC3";
import { WorkTreeView } from "./work-tree/WorkTreeView";
import {
  projection,
  evidence,
  runStatus,
  dirtyDemo,
} from "../model/fixtures/controlpanel";

/**
 * The flagship 1:(very wide) instrument screen. Client island mounted by the
 * server page. The control panel is a narrow left rail; the workspace dominates.
 *
 * Workspace = ViewToolbar + canvas area + a compact work-tree strip.
 *   - view mode 'all'   → the three canvases in a 3-up grid.
 *   - view mode 'split' → one canvas (active tab) filling the area (large).
 * Each canvas self-frames (CanvasFrame: title · fractal breadcrumb · fullscreen)
 * and supports Ctrl+click fractal drill-down.
 */
export function SimulationScreen({ experimentId }: { experimentId: string }) {
  const vm = useSimulationVM(experimentId);
  const mode = useWorkbenchStore((s) => s.view.mode);
  const activeTab = useWorkbenchStore((s) => s.view.activeTab);

  const canvases: Record<CanvasId, ReactNode> = {
    c1: <FlowCanvasC1 />,
    c2: <FlowCanvasC2 />,
    c3: <HardwareTreeC3 />,
  };

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
        <div className="flex h-full min-h-0 flex-col">
          <ViewToolbar />
          <div className="min-h-0 flex-1 px-2">
            {mode === "all" ? (
              <div className="grid h-full grid-cols-3 grid-rows-1 gap-2">
                {canvases.c1}
                {canvases.c2}
                {canvases.c3}
              </div>
            ) : (
              <div className="h-full">{canvases[activeTab]}</div>
            )}
          </div>
          {/* compact work-tree strip — canvases get the bulk of the height */}
          <div className="mt-2 h-44 shrink-0 border-t border-border">
            <WorkTreeView />
          </div>
        </div>
      }
    />
  );
}
