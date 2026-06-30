"use client";

import type { ReactNode } from "react";
import { SplitPane } from "@/components/shell/SplitPane";
import { useWorkbenchStore, type CanvasId } from "@/store/workbenchStore";
import { useSimulationVM } from "../viewmodel/useSimulationVM";
import { ControlPanel } from "./ControlPanel";
import { ServingOptions } from "./ServingOptions";
import { ViewToolbar } from "./ViewToolbar";
import { FlowCanvasC1 } from "./canvases/FlowCanvasC1";
import { FlowCanvasC2 } from "./canvases/FlowCanvasC2";
import { HardwareTreeC3 } from "./canvases/HardwareTreeC3";
import { SimLog } from "./SimLog";
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
 * Workspace = ViewToolbar + canvas area + a compact live sim-log strip.
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
          /* Once a Run has fired, per-axis status comes live from the VM
             (runSimulation → store/SSE). Before the first run we seed the dev
             fixture so the panel reads as a realistic mid-run. dirty +
             projection/evidence stay fixtures until those loops are wired. */
          perAxis={vm.perAxis.length > 0 ? vm.perAxis : runStatus}
          dirty={dirtyDemo}
          isRunning={vm.isRunning}
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
          {/* canvas area + a self-contained HW-aware serving-options rail
             (Canvas 2 representation, reading the Canvas 3 hardware model). */}
          <div className="flex min-h-0 flex-1 gap-2 px-2">
            <div className="min-h-0 flex-1">
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
            <div className="w-64 shrink-0">
              <ServingOptions />
            </div>
          </div>
          {/* compact live sim-log strip — canvases get the bulk of the height */}
          <div className="mt-2 h-44 shrink-0 border-t border-border">
            <SimLog />
          </div>
        </div>
      }
    />
  );
}
