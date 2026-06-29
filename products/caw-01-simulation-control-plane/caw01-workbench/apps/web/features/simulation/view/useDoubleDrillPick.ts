"use client";

import { useCallback, useRef } from "react";

/**
 * Wrap a scene's `onPick(id, modifier)` so that a **double-click** (or a
 * Ctrl/⌘+click — the `modifier` flag) DRILLS into a node, while a single click
 * SELECTS it. `canDrill` (optional) gates drilling (e.g. only nodes with an
 * interior); when it returns false the gesture falls back to select.
 */
export function useDoubleDrillPick(
  onSelect: (id: string) => void,
  onDrill: (id: string) => void,
  canDrill?: (id: string) => boolean,
): (id: string, modifier: boolean) => void {
  const last = useRef<{ id: string; t: number } | null>(null);
  return useCallback(
    (id, modifier) => {
      const allow = !canDrill || canDrill(id);
      if (modifier) {
        if (allow) onDrill(id);
        else onSelect(id);
        return;
      }
      const now = Date.now();
      const prev = last.current;
      if (prev && prev.id === id && now - prev.t < 350) {
        last.current = null;
        if (allow) onDrill(id);
        else onSelect(id);
        return;
      }
      last.current = { id, t: now };
      onSelect(id);
    },
    [onSelect, onDrill, canDrill],
  );
}
