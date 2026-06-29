"use client";

import { useMemo, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  generateReport,
  type ReportResult,
} from "../model/reportAction";
import type { ResultAxis, ResultMetric, ResultsDataset } from "../model/types";

/**
 * Sim Result — client island. Visualises an accumulated results set in THREE
 * forms (run/axis comparison bars · metric-over-time lines · projection table)
 * and generates an AI report via the server action. All charts are
 * dependency-free inline SVG drawn from the dataset props. View-only: it never
 * touches Supabase (the server page already read it through resultsRepository).
 */

const AXES: ResultAxis[] = ["real", "synthetic", "sim"];
// Categorical encoding for the evidence axis (off the reserved status hues).
const AXIS_COLOR: Record<ResultAxis, string> = {
  real: "var(--cat-io)",
  synthetic: "var(--cat-router)",
  sim: "var(--cat-llm)",
};

type Latest = {
  runId: string;
  axis: ResultAxis;
  name: string;
  value: number;
  unit: string | null;
};

export function SimResultScreen({ dataset }: { dataset: ResultsDataset }) {
  const { runs, metrics, source } = dataset;

  const metricNames = useMemo(() => {
    const names = Array.from(new Set(metrics.map((m) => m.name)));
    // headline metric first if present
    names.sort((a, b) =>
      a === "throughput_tok_s" ? -1 : b === "throughput_tok_s" ? 1 : a.localeCompare(b),
    );
    return names;
  }, [metrics]);

  const [metric, setMetric] = useState(metricNames[0] ?? "");
  const [runId, setRunId] = useState(runs[0]?.runId ?? "");

  // latest sample per (run, axis, metric) — what the bars + table plot.
  const latest = useMemo(() => latestPerSeries(metrics), [metrics]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-6">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Sim Result</h1>
        {source === "example" ? (
          <Badge tone="warning">example data</Badge>
        ) : (
          <Badge tone="success">live · Supabase</Badge>
        )}
        <span className="font-readout text-xs text-text-muted">
          {runs.length} run{runs.length === 1 ? "" : "s"} ·{" "}
          {metricNames.length} metric{metricNames.length === 1 ? "" : "s"} ·{" "}
          {metrics.length} samples
        </span>
        <div className="ml-auto flex items-center gap-2">
          <label className="font-readout text-xs text-text-muted" htmlFor="metric">
            metric
          </label>
          <select
            id="metric"
            value={metric}
            onChange={(e) => setMetric(e.target.value)}
            className="rounded-[var(--radius-md)] border border-border bg-surface px-2 py-1 font-readout text-xs"
          >
            {metricNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <label className="font-readout text-xs text-text-muted" htmlFor="run">
            run
          </label>
          <select
            id="run"
            value={runId}
            onChange={(e) => setRunId(e.target.value)}
            className="rounded-[var(--radius-md)] border border-border bg-surface px-2 py-1 font-readout text-xs"
          >
            {runs.map((r) => (
              <option key={r.runId} value={r.runId}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      </header>

      <AxisLegend />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Run / axis comparison" subtitle={metric}>
          <ComparisonBars latest={latest} metric={metric} runs={runs} />
        </Panel>

        <Panel title="Metric over time" subtitle={runLabel(runs, runId)}>
          <TimeSeries metrics={metrics} runId={runId} metric={metric} />
        </Panel>

        <Panel title="Projection table" subtitle="latest sim value per run">
          <ProjectionTable latest={latest} metricNames={metricNames} runs={runs} />
        </Panel>

        <ReportPanel dataset={dataset} latest={latest} focusRunId={runId} />
      </div>
    </div>
  );
}

// ── layout primitive ─────────────────────────────────────────────────────────
function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex min-h-0 flex-col rounded-[var(--radius-lg)] border border-border bg-surface">
      <div className="flex items-baseline justify-between border-b border-border px-3 py-2">
        <h2 className="text-sm font-medium">{title}</h2>
        {subtitle ? (
          <span className="font-readout text-xs text-text-muted">{subtitle}</span>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">{children}</div>
    </section>
  );
}

function AxisLegend() {
  return (
    <div className="flex items-center gap-4">
      {AXES.map((a) => (
        <span key={a} className="flex items-center gap-1.5 font-readout text-xs">
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ background: AXIS_COLOR[a] }}
          />
          <span className="text-text-muted">{a}</span>
        </span>
      ))}
    </div>
  );
}

// ── chart 1: grouped comparison bars (runs × axis, one metric) ───────────────
function ComparisonBars({
  latest,
  metric,
  runs,
}: {
  latest: Latest[];
  metric: string;
  runs: ResultsDataset["runs"];
}) {
  const rows = latest.filter((m) => m.name === metric);
  if (rows.length === 0) return <Empty />;

  const W = 520;
  const H = 220;
  const padL = 8;
  const padR = 8;
  const padT = 8;
  const padB = 44;
  const plotH = H - padT - padB;
  const max = Math.max(...rows.map((r) => r.value)) * 1.1 || 1;
  const unit = rows[0]?.unit ?? "";

  const groupW = (W - padL - padR) / runs.length;
  const barW = Math.min(22, (groupW - 12) / AXES.length);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${metric} by run and axis`}>
      {/* baseline */}
      <line x1={padL} y1={padT + plotH} x2={W - padR} y2={padT + plotH} stroke="var(--border)" />
      {runs.map((run, gi) => {
        const gx = padL + gi * groupW;
        const axisRows = AXES.map((a) => rows.find((r) => r.runId === run.runId && r.axis === a));
        const innerW = barW * AXES.length + 4 * (AXES.length - 1);
        const startX = gx + (groupW - innerW) / 2;
        return (
          <g key={run.runId}>
            {axisRows.map((r, ai) => {
              if (!r) return null;
              const h = (r.value / max) * plotH;
              const x = startX + ai * (barW + 4);
              const y = padT + plotH - h;
              return (
                <g key={r.axis}>
                  <rect x={x} y={y} width={barW} height={h} rx={2} fill={AXIS_COLOR[r.axis]} />
                  <text
                    x={x + barW / 2}
                    y={y - 3}
                    textAnchor="middle"
                    className="font-readout"
                    fontSize="8"
                    fill="var(--text-muted)"
                  >
                    {fmt(r.value)}
                  </text>
                </g>
              );
            })}
            <text
              x={gx + groupW / 2}
              y={H - padB + 14}
              textAnchor="middle"
              className="font-readout"
              fontSize="9"
              fill="var(--text-muted)"
            >
              {truncate(run.label, 22)}
            </text>
          </g>
        );
      })}
      <text x={padL} y={padT + 8} className="font-readout" fontSize="9" fill="var(--text-muted)">
        max {fmt(max)} {unit}
      </text>
    </svg>
  );
}

// ── chart 2: metric-over-time lines (one run, one metric, line per axis) ─────
function TimeSeries({
  metrics,
  runId,
  metric,
}: {
  metrics: ResultMetric[];
  runId: string;
  metric: string;
}) {
  const rows = metrics
    .filter((m) => m.runId === runId && m.name === metric)
    .slice()
    .sort((a, b) => a.ts.localeCompare(b.ts));
  if (rows.length === 0) return <Empty />;

  const W = 520;
  const H = 220;
  const padL = 40;
  const padR = 10;
  const padT = 10;
  const padB = 28;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const values = rows.map((r) => r.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const unit = rows[0]?.unit ?? "";

  const tsList = Array.from(new Set(rows.map((r) => r.ts))).sort();
  const xOf = (ts: string) =>
    padL + (tsList.indexOf(ts) / Math.max(1, tsList.length - 1)) * plotW;
  const yOf = (v: number) => padT + plotH - ((v - min) / span) * plotH;

  const byAxis = AXES.map((a) => ({
    axis: a,
    pts: rows.filter((r) => r.axis === a).sort((x, y) => x.ts.localeCompare(y.ts)),
  })).filter((g) => g.pts.length > 0);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${metric} over time`}>
      {/* y gridlines */}
      {[0, 0.5, 1].map((t) => {
        const y = padT + plotH - t * plotH;
        const v = min + t * span;
        return (
          <g key={t}>
            <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="var(--border)" strokeDasharray="2 3" />
            <text x={padL - 4} y={y + 3} textAnchor="end" className="font-readout" fontSize="8" fill="var(--text-muted)">
              {fmt(v)}
            </text>
          </g>
        );
      })}
      {byAxis.map((g) => (
        <g key={g.axis}>
          <polyline
            fill="none"
            stroke={AXIS_COLOR[g.axis]}
            strokeWidth={1.5}
            points={g.pts.map((p) => `${xOf(p.ts)},${yOf(p.value)}`).join(" ")}
          />
          {g.pts.map((p, i) => (
            <circle key={i} cx={xOf(p.ts)} cy={yOf(p.value)} r={1.8} fill={AXIS_COLOR[g.axis]} />
          ))}
        </g>
      ))}
      {/* x end labels */}
      <text x={padL} y={H - 8} className="font-readout" fontSize="8" fill="var(--text-muted)">
        {timeLabel(tsList[0])}
      </text>
      <text x={W - padR} y={H - 8} textAnchor="end" className="font-readout" fontSize="8" fill="var(--text-muted)">
        {timeLabel(tsList[tsList.length - 1])} · {unit}
      </text>
    </svg>
  );
}

// ── chart 3: projection table (metrics × runs, sim axis + delta vs first) ────
function ProjectionTable({
  latest,
  metricNames,
  runs,
}: {
  latest: Latest[];
  metricNames: string[];
  runs: ResultsDataset["runs"];
}) {
  const get = (runId: string, name: string) =>
    latest.find((m) => m.runId === runId && m.name === name && m.axis === "sim") ??
    latest.find((m) => m.runId === runId && m.name === name);

  const baseId = runs[0]?.runId;

  return (
    <table className="w-full border-collapse font-readout text-xs">
      <thead>
        <tr className="text-text-muted">
          <th className="border-b border-border px-2 py-1 text-left font-medium">metric</th>
          {runs.map((r) => (
            <th key={r.runId} className="border-b border-border px-2 py-1 text-right font-medium">
              {truncate(r.label, 16)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {metricNames.map((name) => {
          const base = baseId ? get(baseId, name) : undefined;
          return (
            <tr key={name}>
              <td className="border-b border-border px-2 py-1 text-text-muted">{name}</td>
              {runs.map((r) => {
                const cell = get(r.runId, name);
                const delta =
                  base && cell && r.runId !== baseId && base.value !== 0
                    ? ((cell.value - base.value) / base.value) * 100
                    : null;
                return (
                  <td key={r.runId} className="border-b border-border px-2 py-1 text-right tabular-nums">
                    {cell ? (
                      <>
                        {fmt(cell.value)}
                        {cell.unit ? <span className="ml-1 text-text-muted">{cell.unit}</span> : null}
                        {delta != null ? (
                          <span className="ml-1 text-text-muted">
                            ({delta >= 0 ? "+" : ""}
                            {delta.toFixed(0)}%)
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-text-muted">—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ── AI report panel ──────────────────────────────────────────────────────────
function ReportPanel({
  dataset,
  latest,
  focusRunId,
}: {
  dataset: ResultsDataset;
  latest: Latest[];
  focusRunId: string;
}) {
  const [report, setReport] = useState<ReportResult | null>(null);
  const [pending, startTransition] = useTransition();

  const onGenerate = () => {
    startTransition(async () => {
      const res = await generateReport({
        experimentLabel: "current experiment",
        runs: dataset.runs,
        focusRunId,
        latest: latest.map((m) => ({
          runId: m.runId,
          axis: m.axis,
          name: m.name,
          value: m.value,
          unit: m.unit,
        })),
      });
      setReport(res);
    });
  };

  return (
    <section className="flex min-h-0 flex-col rounded-[var(--radius-lg)] border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <h2 className="text-sm font-medium">AI report</h2>
        <div className="flex items-center gap-2">
          {report ? (
            <Badge tone={report.error ? "warning" : "neutral"}>{report.backend}</Badge>
          ) : null}
          <Button onClick={onGenerate} disabled={pending}>
            {pending ? "Generating…" : "Generate report"}
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {report ? (
          <>
            {report.error ? (
              <p className="mb-2 font-readout text-xs text-warning">
                backend failed ({report.error}); showing local summary.
              </p>
            ) : null}
            <Markdown text={report.markdown} />
          </>
        ) : (
          <p className="text-sm text-text-muted">
            Generate a narrative summary of these runs. Uses the configured AI
            backend (AI_BACKEND) or a deterministic local template when none is
            set — so it always produces a report.
          </p>
        )}
      </div>
    </section>
  );
}

// ── tiny markdown-ish renderer (#, ##, -, **bold**, _italic_) ────────────────
function Markdown({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="flex flex-col gap-1 text-sm">
      {lines.map((line, i) => {
        if (line.startsWith("## "))
          return (
            <h3 key={i} className="mt-2 text-sm font-semibold">
              {inline(line.slice(3))}
            </h3>
          );
        if (line.startsWith("# "))
          return (
            <h2 key={i} className="text-base font-semibold">
              {inline(line.slice(2))}
            </h2>
          );
        if (line.startsWith("  - "))
          return (
            <div key={i} className="ml-6 flex gap-2 text-text-muted">
              <span aria-hidden>◦</span>
              <span>{inline(line.slice(4))}</span>
            </div>
          );
        if (line.startsWith("- "))
          return (
            <div key={i} className="ml-2 flex gap-2">
              <span aria-hidden className="text-text-muted">
                •
              </span>
              <span>{inline(line.slice(2))}</span>
            </div>
          );
        if (line.trim() === "") return <div key={i} className="h-1" />;
        if (/^_.*_$/.test(line.trim()))
          return (
            <p key={i} className="text-xs italic text-text-muted">
              {line.trim().replace(/^_|_$/g, "")}
            </p>
          );
        return <p key={i}>{inline(line)}</p>;
      })}
    </div>
  );
}

function inline(s: string): React.ReactNode {
  // split on **bold** keeping delimiters
  const parts = s.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    /^\*\*[^*]+\*\*$/.test(p) ? (
      <strong key={i} className="font-semibold">
        {p.slice(2, -2)}
      </strong>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────
function latestPerSeries(metrics: ResultMetric[]): Latest[] {
  const best = new Map<string, ResultMetric>();
  for (const m of metrics) {
    const k = `${m.runId}::${m.axis}::${m.name}`;
    const cur = best.get(k);
    if (!cur || m.ts > cur.ts) best.set(k, m);
  }
  return Array.from(best.values()).map((m) => ({
    runId: m.runId,
    axis: m.axis,
    name: m.name,
    value: m.value,
    unit: m.unit,
  }));
}

function Empty() {
  return <p className="font-readout text-xs text-text-muted">— no samples —</p>;
}

function runLabel(runs: ResultsDataset["runs"], runId: string): string {
  return runs.find((r) => r.runId === runId)?.label ?? "—";
}

function fmt(v: number): string {
  if (Math.abs(v) >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function timeLabel(ts?: string): string {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}
