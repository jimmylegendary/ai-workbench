"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  simLogSeed,
  simLogStream,
  type SimLogLevel,
  type SimLogLine,
} from "@/features/simulation/model/fixtures/simlog";
import { useLogStore } from "@/features/simulation/model/logStore";

/** Stream cadence. */
const TICK_MS = 1100;
/** Idle pause (in ticks) between one simulated run finishing and the next. */
const IDLE_TICKS = 3;
/** Ring-buffer cap so a long-lived stream keeps the DOM light. */
const MAX_LINES = 200;

/**
 * Level → text hue. Hue is the ONLY thing that varies per level (console
 * convention); the uppercase level tag is always rendered, so meaning is never
 * carried by colour alone. Hues come from the reserved status tokens; the
 * panel itself is on the always-dark canvas surface (DESIGN.md §2/§9).
 */
const LEVEL_CLASS: Record<SimLogLevel, string> = {
  debug: "text-canvas-text-dim",
  info: "text-canvas-text-muted",
  ok: "text-success",
  warn: "text-warning",
  error: "text-danger",
};

/** Format an epoch-ms timestamp as HH:MM:SS.mmm (mono, tabular). */
function clock(t: number): string {
  const d = new Date(t);
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(
    d.getMilliseconds(),
    3,
  )}`;
}

/** Stamp the seed backlog into the recent past so it looks already-streamed. */
function seedLines(): SimLogLine[] {
  const now = Date.now();
  return simLogSeed.map((entry, i) => ({
    ...entry,
    id: i,
    t: now - (simLogSeed.length - i) * TICK_MS,
  }));
}

/**
 * Live simulation log / results stream. Self-contained: seeds from a fixture
 * and appends a line per tick (setInterval) to feel live, looping to fake a
 * fresh run with an idle gap in between. Drop-in for the bottom strip; no
 * engine needed yet. RunService/SSE replaces the fixture + interval later.
 *
 * Pure presentation otherwise: console-style (mono, dark), colour per level.
 */
export function SimLog() {
  const [lines, setLines] = useState<SimLogLine[]>([]);
  const [running, setRunning] = useState(true);

  // Real emitted output (runSimulation → logStore). When present it takes over
  // the panel; when empty we fall back to the idle fixture stream below.
  const realLines = useLogStore((s) => s.lines);
  const realRunning = useLogStore((s) => s.running);
  const usingReal = realLines.length > 0;
  const display = usingReal ? realLines : lines;
  const indicatorRunning = usingReal ? realRunning : running;

  const scrollRef = useRef<HTMLDivElement>(null);
  const cursor = useRef(0); // index into simLogStream
  const nextId = useRef(simLogSeed.length); // monotonic line id
  const idle = useRef(0); // ticks spent idle between runs
  const runningRef = useRef(true); // mirrors `running` for the interval

  // Seed + drive the stream. Seeding here (not in the initial state) keeps the
  // SSR/CSR markup identical — timestamps are minted only after mount.
  useEffect(() => {
    setLines(seedLines());

    const id = setInterval(() => {
      if (!runningRef.current) {
        idle.current += 1;
        if (idle.current >= IDLE_TICKS) {
          idle.current = 0;
          cursor.current = 0;
          runningRef.current = true;
          setRunning(true);
        }
        return;
      }

      const entry = simLogStream[cursor.current];
      cursor.current += 1;

      setLines((prev) => {
        const next = [...prev, { ...entry, id: nextId.current++, t: Date.now() }];
        return next.length > MAX_LINES ? next.slice(-MAX_LINES) : next;
      });

      // End of the pool → go idle, then a later tick restarts the run.
      if (cursor.current >= simLogStream.length) {
        runningRef.current = false;
        setRunning(false);
      }
    }, TICK_MS);

    return () => clearInterval(id);
  }, []);

  // Stick to the newest line as it streams in (fixture OR real output).
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [display]);

  return (
    <section className="flex h-full min-h-0 flex-col bg-canvas-bg text-canvas-text">
      <header className="flex items-center justify-between border-b border-canvas-grid px-3 py-1.5">
        <h3 className="font-readout text-[11px] uppercase tracking-wide text-canvas-text-muted">
          Simulation log
        </h3>
        <span className="flex items-center gap-1.5 font-readout text-[11px]">
          <span
            aria-hidden
            className={cn(
              "inline-block h-1.5 w-1.5 rounded-full",
              indicatorRunning ? "animate-pulse bg-accent" : "bg-canvas-text-dim",
            )}
          />
          <span
            className={indicatorRunning ? "text-accent" : "text-canvas-text-dim"}
          >
            {indicatorRunning ? "running" : "idle"}
          </span>
        </span>
      </header>

      <div
        ref={scrollRef}
        role="log"
        aria-live="polite"
        aria-label="Simulation log output"
        className="min-h-0 flex-1 overflow-y-auto px-3 py-1.5 font-readout text-[11px] leading-5"
      >
        {display.map((line) => (
          <div key={line.id} className="flex gap-2">
            <span className="shrink-0 tabular-nums text-canvas-text-dim">
              {clock(line.t)}
            </span>
            <span
              className={cn(
                "w-12 shrink-0 uppercase",
                LEVEL_CLASS[line.level],
              )}
            >
              {line.level}
            </span>
            <span className="min-w-0 flex-1 break-words text-canvas-text">
              {line.msg}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
