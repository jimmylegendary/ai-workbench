"use client";

import { useEffect } from "react";
import type { AxisStatus } from "@caw/core";
import { useWorkbenchStore } from "@/store/workbenchStore";

/**
 * Subscribe to live per-axis run status over SSE (Route Handler), not polling
 * (ADR-0003 §2). Pushes into the store's run slice. IR/trace bytes are never
 * streamed — only status + pointers.
 */
export function useRunStatus(runId: string | undefined) {
  const setAxisStatus = useWorkbenchStore((s) => s.setAxisStatus);

  useEffect(() => {
    if (!runId) return;
    const es = new EventSource(`/api/runs/${runId}/stream`);
    es.onmessage = (ev) => {
      try {
        const perAxis = JSON.parse(ev.data) as AxisStatus[];
        setAxisStatus(perAxis);
      } catch {
        /* ignore malformed frame */
      }
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, [runId, setAxisStatus]);
}
