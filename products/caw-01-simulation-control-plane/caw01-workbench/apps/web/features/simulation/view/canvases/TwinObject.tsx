import { cn } from "@/lib/utils";
import type { HwTreeNode } from "@/features/simulation/model/fixtures/c3";

/** Neutral (canvas-grey) hierarchy-level tag — taxonomy, not status. */
export function LevelTag({ level }: { level: HwTreeNode["level"] }) {
  return (
    <span className="shrink-0 rounded-[var(--radius-sm)] border border-canvas-grid bg-canvas-bg px-1 font-readout text-[10px] uppercase tracking-wide text-canvas-text-muted">
      {level}
    </span>
  );
}

/** Cluster taxonomy → categorical accent (off the status hues). */
const CLUSTER_ACCENT: Record<string, string> = {
  gpu: "var(--cat-tool)",
  cpu: "var(--cat-router)",
  cxl: "var(--cat-llm)",
  storage: "var(--cat-io)",
  cxmt: "var(--cat-memory)",
  special: "var(--cat-llm)",
  custom: "var(--cat-io)",
};

type Pattern = "rooms" | "laptop" | "stack" | "slots" | "grid" | "block";
const PATTERN: Record<string, Pattern> = {
  data_center: "rooms",
  client: "laptop",
  cluster: "stack",
  rack: "slots",
  tray: "slots",
  package: "grid",
  die: "grid",
  chip: "grid",
  component: "block",
};

const DETAIL = "#3b4a5a";

/** Overlay <line>s per pattern (precomputed against the cuboid faces below). */
function overlay(pattern: Pattern) {
  const ln = (x1: number, y1: number, x2: number, y2: number, key: string) => (
    <line key={key} x1={x1} y1={y1} x2={x2} y2={y2} stroke={DETAIL} strokeWidth={0.8} />
  );
  if (pattern === "slots") {
    return [
      ln(30, 50.5, 70, 68.5, "s1"),
      ln(30, 59, 70, 77, "s2"),
      ln(30, 67.5, 70, 85.5, "s3"),
    ];
  }
  if (pattern === "grid" || pattern === "rooms") {
    return [
      ln(43.2, 47.9, 83.2, 29.9, "g1"),
      ln(56.4, 53.9, 96.4, 35.9, "g2"),
      ln(43.2, 36.1, 83.2, 54.1, "g3"),
      ln(56.4, 30.1, 96.4, 48.1, "g4"),
    ];
  }
  if (pattern === "stack") {
    return [
      ln(43.2, 47.9, 43.2, 81.9, "v1"),
      ln(56.4, 53.9, 56.4, 87.9, "v2"),
      ln(83.2, 54.1, 83.2, 88.1, "v3"),
      ln(96.4, 48.1, 96.4, 82.1, "v4"),
    ];
  }
  return null;
}

/**
 * A 2.5D "digital-twin" object glyph (a shaded cuboid with level-specific
 * detailing; client is drawn as a device). Accent ridge = cyan when selected,
 * else the cluster's categorical color. SVG fills are fixed metal greys (the
 * canvas is always dark).
 */
function TwinGlyph({
  level,
  clusterType,
  selected,
}: {
  level: HwTreeNode["level"];
  clusterType?: string;
  selected: boolean;
}) {
  const pattern = PATTERN[level] ?? "block";
  const accent = selected
    ? "var(--accent)"
    : clusterType
      ? (CLUSTER_ACCENT[clusterType] ?? "var(--canvas-text-muted)")
      : "var(--canvas-text-muted)";

  if (pattern === "laptop") {
    return (
      <svg viewBox="0 0 120 100" className="h-full w-full" preserveAspectRatio="xMidYMid meet">
        <polygon points="26,72 94,72 108,90 40,90" fill="#313c49" stroke="#11161d" strokeWidth="1" />
        <rect x="42" y="26" width="56" height="42" rx="2" fill="#232d38" stroke="#11161d" strokeWidth="1" />
        <rect x="46" y="30" width="48" height="34" rx="1" fill="#0c1117" />
        <line x1="50" y1="38" x2="78" y2="38" stroke={accent} strokeWidth="1.2" opacity="0.9" />
        <line x1="50" y1="44" x2="86" y2="44" stroke={DETAIL} strokeWidth="0.8" />
        <line x1="50" y1="50" x2="72" y2="50" stroke={DETAIL} strokeWidth="0.8" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 120 100" className="h-full w-full" preserveAspectRatio="xMidYMid meet">
      {/* cuboid: top (lightest) · left · right (darkest) */}
      <polygon points="30,42 70,24 110,42 70,60" fill="#313c49" stroke="#11161d" strokeWidth="1" />
      <polygon points="30,42 70,60 70,94 30,76" fill="#232d38" stroke="#11161d" strokeWidth="1" />
      <polygon points="70,60 110,42 110,76 70,94" fill="#19212b" stroke="#11161d" strokeWidth="1" />
      {overlay(pattern)}
      {/* accent ridge along the top */}
      <polyline points="30,42 70,24 110,42" fill="none" stroke={accent} strokeWidth="1.6" opacity="0.95" />
    </svg>
  );
}

/**
 * A digital-twin object card (presentational): the glyph + a level tag, name,
 * a key spec, and a drill affordance. The selectable/clickable wrapper lives in
 * HardwareTreeC3.
 */
export function TwinObject({
  part,
  isSelected,
  hasChildren,
}: {
  part: HwTreeNode;
  isSelected: boolean;
  hasChildren: boolean;
}) {
  const specEntries = Object.entries(part.spec).slice(0, 2);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="relative min-h-0 flex-1">
        <TwinGlyph level={part.level} clusterType={part.clusterType} selected={isSelected} />
      </div>
      <div className="mt-1 flex min-w-0 items-center gap-1.5">
        <LevelTag level={part.level} />
        <span
          className={cn(
            "font-readout truncate text-xs",
            isSelected ? "text-accent" : "text-canvas-text",
          )}
        >
          {part.name}
        </span>
        {hasChildren && (
          <span
            aria-hidden
            className="ml-auto shrink-0 font-readout text-[10px] text-canvas-text-dim"
          >
            ↘
          </span>
        )}
      </div>
      {specEntries.length > 0 && (
        <div className="mt-0.5 flex min-w-0 flex-wrap gap-x-2">
          {specEntries.map(([key, value]) => (
            <span
              key={key}
              className="font-readout truncate text-[10px] text-canvas-text-muted"
            >
              {key} <span className="tabular-nums text-canvas-text">{value}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
