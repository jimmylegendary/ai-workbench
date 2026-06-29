import type { HwTreeNode, TrayKind } from "@/features/simulation/model/fixtures/c3";

/**
 * RackScene — a PRESENTATIONAL 2.5D rack-elevation renderer for one HW level of
 * the CAW-01 digital twin (used when the current drill `container` is a `rack`).
 *
 * Reference: a GB200 NVL72 rack front. We draw a tall rack cabinet with a slight
 * isometric depth (top + right faces), two mounting rails, and the rack's child
 * `parts` as horizontal tray slots stacked vertically. Slots are grouped by
 * `trayKind` (compute · nvlink-switch · power · network) with a bracket + label
 * per group (e.g. "18× Compute Trays", "9× NVLink Switch Trays"). Slot height is
 * proportional to `count` so the cabinet keeps real proportions (compute trays
 * dominate). Grouping is COLOR-NEUTRAL: faces are fixed metal greys; only a thin
 * left edge-bar + the bracket label carry a categorical accent (off the reserved
 * status hues). The selected part gets a cyan (var(--accent)) outline + glow.
 *
 * Each part is one clickable isometric <g> hit region:
 *   onClick → onPick(part.partId, ctrl/⌘ held)   (drill flag for the parent)
 *
 * No hooks/state → no "use client" needed. SVG fills the box (viewBox + 100%).
 */
export function RackScene({
  container,
  parts,
  selectedId,
  onPick,
}: {
  container: HwTreeNode;
  parts: HwTreeNode[];
  selectedId?: string;
  onPick: (partId: string, drill: boolean) => void;
}) {
  /* ---- canvas geometry (portrait cabinet + slight iso depth) ------------- */
  const VB_W = 360;
  const VB_H = 470;
  const DX = 24; // iso depth, x
  const DY = 16; // iso depth, y
  const FX = 92; // front face left (space to the left holds the brackets)
  const FY = 46; // front face top
  const FW = 212; // front face width
  const FH = 388; // front face height (slot column)
  const RAIL = 10; // mounting-rail width inside the frame
  const slotX = FX + RAIL;
  const slotW = FW - RAIL * 2;

  /* ---- slot layout: height ∝ count, with a clickable minimum ------------- */
  const PAD = 6;
  const GAP = 3;
  const MIN_H = 15;
  const innerTop = FY + PAD;
  const innerH = FH - PAD * 2 - GAP * Math.max(0, parts.length - 1);
  const weight = (p: HwTreeNode): number => Math.max(1, p.count ?? 1);
  const flexTotal = parts.reduce((s, p) => s + weight(p), 0) || 1;
  const flexH = Math.max(0, innerH - MIN_H * parts.length);

  type Slot = { part: HwTreeNode; y: number; h: number; meta: KindMeta };
  let cursorY = innerTop;
  const slots: Slot[] = parts.map((part) => {
    const h = MIN_H + (flexH * weight(part)) / flexTotal;
    const slot: Slot = { part, y: cursorY, h, meta: kindMeta(part.trayKind) };
    cursorY += h + GAP;
    return slot;
  });

  /* ---- contiguous trayKind groups → bracket labels ---------------------- */
  type Group = { meta: KindMeta; sum: number; top: number; bottom: number };
  const groups: Group[] = [];
  for (const s of slots) {
    const last = groups[groups.length - 1];
    if (last && last.meta.label === s.meta.label) {
      last.sum += weight(s.part);
      last.bottom = s.y + s.h;
    } else {
      groups.push({ meta: s.meta, sum: weight(s.part), top: s.y, bottom: s.y + s.h });
    }
  }

  const containerSpec = Object.entries(container.spec).slice(0, 3);

  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      className="block h-full w-full"
      role="img"
      aria-label={`Rack elevation: ${container.name}`}
    >
      <defs>
        <filter id="rackSelGlow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="var(--accent)" floodOpacity="0.75" />
        </filter>
      </defs>

      {/* nameplate above the cabinet */}
      <text x={FX} y={22} className="font-readout" fontSize={12} fill="var(--canvas-text)">
        {truncate(container.name, 30)}
      </text>
      {containerSpec.length > 0 && (
        <text x={FX} y={35} className="font-readout" fontSize={8.5} fill="var(--canvas-text-dim)">
          {containerSpec.map(([k, v]) => `${k} ${v}`).join("   ")}
        </text>
      )}

      {/* cabinet depth: top + right faces (the 2.5D), then the recessed front */}
      <polygon
        points={`${FX},${FY} ${FX + FW},${FY} ${FX + FW + DX},${FY - DY} ${FX + DX},${FY - DY}`}
        fill="#313c49"
        stroke="#11161d"
        strokeWidth={1}
      />
      <polygon
        points={`${FX + FW},${FY} ${FX + FW},${FY + FH} ${FX + FW + DX},${FY + FH - DY} ${FX + FW + DX},${FY - DY}`}
        fill="#19212b"
        stroke="#11161d"
        strokeWidth={1}
      />
      {/* front frame + dark slot recess */}
      <rect x={FX} y={FY} width={FW} height={FH} fill="#232d38" stroke="#11161d" strokeWidth={1} />
      <rect x={slotX} y={FY + 3} width={slotW} height={FH - 6} fill="#141a22" />

      {/* mounting rails with holes */}
      {[FX + RAIL / 2, FX + FW - RAIL / 2].map((cx) => (
        <g key={`rail-${cx}`}>
          <rect x={cx - RAIL / 2} y={FY} width={RAIL} height={FH} fill="#28323e" stroke="#11161d" strokeWidth={0.6} />
          {railHoles(FY + 9, FY + FH - 9).map((cy) => (
            <circle key={cy} cx={cx} cy={cy} r={1.5} fill="#0c1117" stroke="#3b4a5a" strokeWidth={0.5} />
          ))}
        </g>
      ))}

      {/* base plinth + feet */}
      <rect x={FX - 4} y={FY + FH} width={FW + 8} height={12} fill="#1b232d" stroke="#11161d" strokeWidth={1} />
      <rect x={FX} y={FY + FH + 12} width={14} height={6} fill="#11161d" />
      <rect x={FX + FW - 14} y={FY + FH + 12} width={14} height={6} fill="#11161d" />

      {/* group brackets (left side) */}
      {groups.map((g, i) => {
        const bx = FX - 12;
        const mid = (g.top + g.bottom) / 2;
        return (
          <g key={`grp-${i}`}>
            <path
              d={`M ${bx + 6} ${g.top + 1} L ${bx} ${g.top + 1} L ${bx} ${g.bottom - 1} L ${bx + 6} ${g.bottom - 1}`}
              fill="none"
              stroke={g.meta.accent}
              strokeWidth={1.1}
              opacity={0.85}
            />
            <text
              x={bx - 6}
              y={mid}
              className="font-readout"
              fontSize={8.5}
              fill={g.meta.accent}
              textAnchor="middle"
              transform={`rotate(-90 ${bx - 6} ${mid})`}
            >
              {`${g.sum}× ${g.meta.label} ${g.meta.noun}`}
            </text>
          </g>
        );
      })}

      {/* tray slots — one clickable iso <g> per part */}
      {slots.length === 0 ? (
        <text
          x={FX + FW / 2}
          y={FY + FH / 2}
          className="font-readout"
          fontSize={11}
          fill="var(--canvas-text-dim)"
          textAnchor="middle"
        >
          — empty rack —
        </text>
      ) : (
        slots.map((s) => {
          const { part, y, h, meta } = s;
          const selected = part.partId === selectedId;
          const n = weight(part);
          const spec = primarySpec(part);
          const nameY = h >= 16 ? y + 12 : y + h / 2 + 3;
          const showSpecLine = h >= 30 && spec !== null;
          const showSpecInline = !showSpecLine && n <= 1 && h >= 16 && spec !== null;
          const dividers = n > 1 && h >= 30 ? stackLines(y, h, n) : [];

          return (
            <g
              key={part.partId}
              className="group/slot cursor-pointer"
              onClick={(e) => onPick(part.partId, e.ctrlKey || e.metaKey)}
            >
              <title>
                {`${part.partId}${part.children?.length ? " — Ctrl/⌘+click to drill in" : ""}`}
              </title>

              {/* tray face */}
              <rect x={slotX} y={y} width={slotW} height={h} fill="#2b3643" stroke="#11161d" strokeWidth={1} />
              {/* top highlight + bottom shadow → drawer read */}
              <line x1={slotX} y1={y + 0.6} x2={slotX + slotW} y2={y + 0.6} stroke="#3b4a5a" strokeWidth={0.8} />
              <line x1={slotX} y1={y + h - 0.6} x2={slotX + slotW} y2={y + h - 0.6} stroke="#11161d" strokeWidth={0.8} />
              {/* categorical left edge-bar (off status hues) */}
              <rect x={slotX} y={y} width={2.5} height={h} fill={meta.accent} opacity={0.55} />
              {/* stack-of-trays hint for multi-count slots */}
              {dividers.map((ly) => (
                <line key={ly} x1={slotX + 6} y1={ly} x2={slotX + slotW - 6} y2={ly} stroke="#3b4a5a" strokeWidth={0.6} opacity={0.7} />
              ))}

              {/* name */}
              <text
                x={slotX + 9}
                y={nameY}
                className="font-readout"
                fontSize={9}
                fill={selected ? "var(--accent)" : "var(--canvas-text)"}
              >
                {truncate(part.name, n > 1 ? 24 : 30)}
              </text>

              {/* count badge */}
              {n > 1 && (
                <text
                  x={slotX + slotW - 8}
                  y={nameY}
                  className="font-readout"
                  fontSize={9}
                  fill="var(--canvas-text-dim)"
                  textAnchor="end"
                >
                  {`×${n}`}
                </text>
              )}

              {/* key spec — second line (tall slots) or inline-right (short) */}
              {showSpecLine && spec && (
                <text x={slotX + 9} y={y + 24} className="font-readout" fontSize={8} textAnchor="start">
                  <tspan fill="var(--canvas-text-muted)">{spec.key} </tspan>
                  <tspan fill="var(--canvas-text)">{spec.value}</tspan>
                </text>
              )}
              {showSpecInline && spec && (
                <text x={slotX + slotW - 8} y={nameY} className="font-readout" fontSize={8} textAnchor="end">
                  <tspan fill="var(--canvas-text-muted)">{spec.key} </tspan>
                  <tspan fill="var(--canvas-text)">{spec.value}</tspan>
                </text>
              )}

              {/* hover highlight */}
              <rect
                x={slotX}
                y={y}
                width={slotW}
                height={h}
                fill="var(--canvas-text)"
                fillOpacity={0.06}
                stroke="var(--canvas-text)"
                strokeWidth={1}
                className="pointer-events-none opacity-0 transition-opacity group-hover/slot:opacity-100"
              />

              {/* selected outline + glow */}
              {selected && (
                <rect
                  x={slotX + 0.5}
                  y={y + 0.5}
                  width={slotW - 1}
                  height={h - 1}
                  fill="var(--accent)"
                  fillOpacity={0.08}
                  stroke="var(--accent)"
                  strokeWidth={1.8}
                  filter="url(#rackSelGlow)"
                  className="pointer-events-none"
                />
              )}
            </g>
          );
        })
      )}
    </svg>
  );
}

/* ----------------------------------------------------------------------- *
 * helpers
 * ----------------------------------------------------------------------- */

type KindMeta = { label: string; noun: string; accent: string };

/** trayKind → bracket label noun + categorical accent (off the status hues). */
function kindMeta(kind: TrayKind | undefined): KindMeta {
  switch (kind) {
    case "compute":
      return { label: "Compute", noun: "Trays", accent: "var(--cat-tool)" };
    case "nvlink-switch":
      return { label: "NVLink Switch", noun: "Trays", accent: "var(--cat-router)" };
    case "power":
      return { label: "Power", noun: "Shelves", accent: "var(--cat-io)" };
    case "network":
      return { label: "Network", noun: "Trays", accent: "var(--cat-llm)" };
    default:
      return { label: "Tray", noun: "Slots", accent: "var(--canvas-text-muted)" };
  }
}

/** A tray's headline spec field (kind-aware), else its first spec entry. */
function primarySpec(part: HwTreeNode): { key: string; value: string } | null {
  const prefer: Record<string, string[]> = {
    compute: ["gpus", "sockets", "height_u"],
    "nvlink-switch": ["nvswitch_chips", "tray_bw"],
    power: ["shelf_kw", "psus"],
    network: ["ports", "throughput"],
  };
  const keys = (part.trayKind && prefer[part.trayKind]) || [];
  for (const k of keys) {
    if (part.spec[k] !== undefined) return { key: k, value: part.spec[k] };
  }
  const first = Object.entries(part.spec)[0];
  return first ? { key: first[0], value: first[1] } : null;
}

/** Evenly spaced mounting-hole centers between two y bounds. */
function railHoles(top: number, bottom: number): number[] {
  const step = 13;
  const ys: number[] = [];
  for (let y = top; y <= bottom; y += step) ys.push(Math.round(y));
  return ys;
}

/** Internal divider y's that read a multi-count slot as a stack of trays. */
function stackLines(y: number, h: number, count: number): number[] {
  const region = h - 26; // below the text area
  const max = Math.max(0, Math.floor(region / 7));
  const n = Math.min(count - 1, max);
  if (n <= 0) return [];
  const start = y + 26;
  const gap = (h - 26) / (n + 1);
  return Array.from({ length: n }, (_, i) => Math.round(start + gap * (i + 1)));
}

/** Truncate with an ellipsis so long names never overflow a slot. */
function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
