"use client";

import type { Commit } from "@/features/simulation/model/fixtures/worktree";

/** HH:MM · MM-DD from an ISO string, tabular for alignment. */
function shortTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Commit list for the work-tree strip — message · author · time, all in
 * font-readout (mono + tabular-nums) so ids/times column-align.
 */
export function HistoryList(props: { commits: Commit[] }) {
  return (
    <div className="flex min-h-0 flex-col">
      <h3 className="border-b border-border px-2 py-1 text-xs font-medium uppercase tracking-wide text-text-muted">
        history
      </h3>

      {props.commits.length === 0 ? (
        <p className="px-2 py-2 font-readout text-xs text-text-muted">
          — no commits —
        </p>
      ) : (
        <ul className="min-h-0 overflow-auto py-1">
          {props.commits.map((c) => (
            <li
              key={c.id}
              className="flex items-baseline gap-2 px-2 py-0.5 font-readout text-xs"
            >
              <span className="shrink-0 text-accent">{c.id}</span>
              <span className="truncate text-text">{c.message}</span>
              <span className="ml-auto shrink-0 text-text-muted">{c.author}</span>
              <span className="shrink-0 text-text-muted">{shortTime(c.time)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
