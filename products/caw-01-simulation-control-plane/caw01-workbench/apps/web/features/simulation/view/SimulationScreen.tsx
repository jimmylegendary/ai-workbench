"use client";

import { SplitPane } from "@/components/shell/SplitPane";
import { useSimulationVM } from "../viewmodel/useSimulationVM";
import { ControlPanel } from "./ControlPanel";

/**
 * The flagship 1:9 instrument screen. Client island mounted by the server page.
 * Canvases (React Flow C1/C2, r3f C3) are phase-2 placeholders here — build them
 * per design/06-frontend/canvas-rendering-implementation.md (dynamic ssr:false).
 */
export function SimulationScreen({ experimentId }: { experimentId: string }) {
  const vm = useSimulationVM(experimentId);

  return (
    <SplitPane
      left={
        <ControlPanel
          perAxis={vm.perAxis}
          dirty={vm.dirty}
          isRunning={vm.isRunning}
          onRun={vm.onRun}
          onStop={vm.onStop}
          onSaveItem={vm.onSaveItem}
          onSaveAll={vm.onSaveAll}
        />
      }
      right={
        <div className="grid h-full grid-cols-3 grid-rows-2 gap-2 p-2">
          <CanvasPlaceholder title="Canvas 1 · AI workload flow" body="OpNode → TensorPort" />
          <CanvasPlaceholder title="Canvas 2 · Serving / representation" body="ServingNode + typed handles" />
          <CanvasPlaceholder title="Canvas 3 · Hardware" body="chip → die → package → tray → rack → cluster" />
          <CanvasPlaceholder title="Work-tree" body="branch: memory-diff" />
          <CanvasPlaceholder title="Diff" body="ref ↔ ref" />
          <CanvasPlaceholder title="History" body="commits" />
        </div>
      }
    />
  );
}

function CanvasPlaceholder({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col rounded-[var(--radius-md)] border border-canvas-grid bg-canvas-bg p-3 text-[#cfd6df]">
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-2 font-readout text-xs text-[#8b96a5]">{body}</div>
      <div className="mt-auto text-[10px] text-[#566273]">
        placeholder — build in phase-2
      </div>
    </div>
  );
}
