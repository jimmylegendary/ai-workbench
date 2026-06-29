/** Discoverability hint for the fractal Ctrl+click drill-down, shown bottom-right of a canvas. */
export function DrillHint() {
  return (
    <div className="pointer-events-none absolute bottom-1.5 right-2 z-10 rounded-[var(--radius-sm)] bg-canvas-bg/70 px-1.5 py-0.5 font-readout text-[10px] text-canvas-text-dim">
      Ctrl+click ↘ drill in
    </div>
  );
}
