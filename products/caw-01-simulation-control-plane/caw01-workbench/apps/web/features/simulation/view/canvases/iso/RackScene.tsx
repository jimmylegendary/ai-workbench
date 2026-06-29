import type { ReactElement } from "react";
import type { HwTreeNode, TrayKind } from "@/features/simulation/model/fixtures/c3";

/**
 * RackScene — a PRESENTATIONAL 2.5D rack-elevation renderer for one HW level of
 * the CAW-01 digital twin (used when the current drill `container` is a `rack`).
 *
 * Reference: a GB200 NVL72 rack front. We draw a tall steel cabinet with a slight
 * isometric depth (top + right faces), two EIA mounting rails, a copper-spine
 * power BUSBAR running down the back (visible on the depth face), and the rack's
 * child `parts` as horizontal tray slots stacked vertically. Slots are grouped by
 * `trayKind` (compute · nvlink-switch · power · network) with a bracket + label
 * per group (e.g. "18× Compute Trays", "9× NVLink Switch Trays"). Slot height is
 * proportional to `count` so the cabinet keeps real proportions (compute trays
 * dominate). Each tray gets a kind-specific front panel — perforated vent sheet
 * (compute), PSU modules + fans (power), dense cable cartridges (nvlink-switch),
 * port cages (network) — so the silhouette reads as real hardware.
 *
 * Grouping is COLOR-NEUTRAL: faces are fixed metal greys; only a thin left
 * edge-bar + the bracket label carry a categorical accent (off the reserved
 * status hues). The selected part gets a cyan (var(--accent)) outline + glow;
 * hover is a neutral white wash.
 *
 * Each part is one clickable isometric <g> hit region:
 *   onClick → onPick(part.partId, ctrl/⌘ held)   (drill flag for the parent)
 *
 * No hooks/state → no "use client" needed. SVG fills the box (viewBox + 100%).
 */

/* ---- fixed metal-grey palette (the canvas is always dark). Face fills come
 *      from the gradient <defs>; these are the flat accents/lines. ---------- */
const EDGE = "#11161d"; // outline stroke (right/bottom shadow direction)
const DETAIL = "#3b4a5a"; // light grey trim / fan rims / louvers
const PANEL = "#222c37"; // recessed device-panel inside a tray front
const BUS_BOLT = "#0c1117"; // deep cavities: holes, ports, bolt seats

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
  const FY = 56; // front face top (header band above clears the iso top cap)
  const FW = 212; // front face width
  const FH = 388; // front face height (slot column)
  const RAIL = 11; // mounting-rail width inside the frame
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

  /* ---- outer silhouette (for the soft floor shadow) --------------------- */
  const outline = [
    [FX, FY],
    [FX + DX, FY - DY],
    [FX + FW + DX, FY - DY],
    [FX + FW + DX, FY + FH - DY],
    [FX + FW + 8, FY + FH],
    [FX + FW + 8, FY + FH + 12],
    [FX - 4, FY + FH + 12],
    [FX - 4, FY + FH],
    [FX, FY + FH],
  ]
    .map(([x, y]) => `${x},${y}`)
    .join(" ");

  /* ---- back busbar: a metallic strip down the depth (right) face -------- */
  const busT1 = 0.5; // depth fraction (front=0 … back=1)
  const busT2 = 0.78;
  const busPt = (t: number, y: number): [number, number] => [FX + FW + DX * t, y - DY * t];
  const [bT1x, bT1y] = busPt(busT1, FY + 2);
  const [bT2x, bT2y] = busPt(busT2, FY + 2);
  const [bB2x, bB2y] = busPt(busT2, FY + FH - 2);
  const [bB1x, bB1y] = busPt(busT1, FY + FH - 2);
  const busTc = (busT1 + busT2) / 2;
  const busBolts = Array.from({ length: 7 }, (_, i) => {
    const yy = FY + 24 + ((FH - 48) * i) / 6;
    const [cx, cy] = busPt(busTc, yy);
    return { cx, cy, key: i };
  });

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
        {/* face shading → depth */}
        <linearGradient id="rackTopFace" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#37424f" />
          <stop offset="1" stopColor="#2a3441" />
        </linearGradient>
        <linearGradient id="rackRightFace" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1d2631" />
          <stop offset="1" stopColor="#141b24" />
        </linearGradient>
        <linearGradient id="rackFrameFace" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#27313d" />
          <stop offset="1" stopColor="#1f2832" />
        </linearGradient>
        <linearGradient id="rackRecess" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0d1219" />
          <stop offset="0.06" stopColor="#11161e" />
          <stop offset="1" stopColor="#161d26" />
        </linearGradient>
        <linearGradient id="rackTray" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#36414e" />
          <stop offset="0.5" stopColor="#2b3643" />
          <stop offset="1" stopColor="#232d38" />
        </linearGradient>
        {/* metallic busbar (sheen across the strip) */}
        <linearGradient id="rackBusbar" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#26303c" />
          <stop offset="0.42" stopColor="#54657b" />
          <stop offset="0.6" stopColor="#3c4b5d" />
          <stop offset="1" stopColor="#202935" />
        </linearGradient>
        {/* perforated vent sheet (compute / network back-fill) */}
        <pattern id="rackVent" width="4.2" height="4.2" patternUnits="userSpaceOnUse">
          <circle cx="1.1" cy="1.1" r="0.62" fill={BUS_BOLT} />
        </pattern>
        {/* soft floor shadow */}
        <filter id="rackSoft" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
        <filter id="rackSelGlow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="var(--accent)" floodOpacity="0.75" />
        </filter>
      </defs>

      {/* soft cast shadow behind the cabinet */}
      <polygon points={outline} transform="translate(5 9)" fill="#000" opacity={0.5} filter="url(#rackSoft)" />

      {/* nameplate above the cabinet */}
      <text x={FX} y={22} className="font-readout" fontSize={12} fill="var(--canvas-text)">
        {truncate(container.name, 30)}
      </text>
      {containerSpec.length > 0 && (
        <text x={FX} y={35} className="font-readout" fontSize={8.5} fill="var(--canvas-text-dim)">
          {containerSpec.map(([k, v]) => `${k} ${v}`).join("   ")}
        </text>
      )}

      {/* cabinet depth: right face (the 2.5D) carries the back busbar */}
      <polygon
        points={`${FX + FW},${FY} ${FX + FW},${FY + FH} ${FX + FW + DX},${FY + FH - DY} ${FX + FW + DX},${FY - DY}`}
        fill="url(#rackRightFace)"
        stroke={EDGE}
        strokeWidth={1}
      />
      {/* busbar strip + back-edge highlight + bolt taps */}
      <polygon
        points={`${bT1x},${bT1y} ${bT2x},${bT2y} ${bB2x},${bB2y} ${bB1x},${bB1y}`}
        fill="url(#rackBusbar)"
        stroke={EDGE}
        strokeWidth={0.5}
      />
      <line x1={bT2x} y1={bT2y} x2={bB2x} y2={bB2y} stroke="#5b6c82" strokeWidth={0.7} opacity={0.7} />
      {busBolts.map((b) => (
        <circle key={`bus-${b.key}`} cx={b.cx} cy={b.cy} r={1.5} fill={BUS_BOLT} stroke="#5b6c82" strokeWidth={0.5} />
      ))}

      {/* top cap face + cable-trough / fan detailing */}
      <polygon
        points={`${FX},${FY} ${FX + FW},${FY} ${FX + FW + DX},${FY - DY} ${FX + DX},${FY - DY}`}
        fill="url(#rackTopFace)"
        stroke={EDGE}
        strokeWidth={1}
      />
      <line x1={FX + 10} y1={FY - 5} x2={FX + FW - 6} y2={FY - 5} stroke={DETAIL} strokeWidth={0.7} opacity={0.55} />
      <line x1={FX + 18} y1={FY - 10} x2={FX + FW + 2} y2={FY - 10} stroke={DETAIL} strokeWidth={0.7} opacity={0.4} />

      {/* front frame + bevel + dark slot recess */}
      <rect x={FX} y={FY} width={FW} height={FH} fill="url(#rackFrameFace)" stroke={EDGE} strokeWidth={1} />
      {/* frame bevel: top/left catch light, bottom is in shadow */}
      <line x1={FX + 0.6} y1={FY + 0.6} x2={FX + FW - 0.6} y2={FY + 0.6} stroke="#43505f" strokeWidth={0.8} opacity={0.7} />
      <line x1={FX + 0.6} y1={FY} x2={FX + 0.6} y2={FY + FH} stroke="#3a4756" strokeWidth={0.8} opacity={0.6} />
      <rect x={slotX} y={FY + 3} width={slotW} height={FH - 6} fill="url(#rackRecess)" stroke={EDGE} strokeWidth={0.6} />

      {/* EIA mounting rails with square punch holes + U ticks */}
      {[FX + RAIL / 2, FX + FW - RAIL / 2].map((cx) => (
        <g key={`rail-${cx}`}>
          <rect x={cx - RAIL / 2} y={FY} width={RAIL} height={FH} fill="#28323e" stroke={EDGE} strokeWidth={0.6} />
          <line x1={cx - RAIL / 2 + 0.7} y1={FY} x2={cx - RAIL / 2 + 0.7} y2={FY + FH} stroke="#3d4b5a" strokeWidth={0.7} opacity={0.6} />
          {railHoles(FY + 9, FY + FH - 9).map((cy) => (
            <rect
              key={cy}
              x={cx - 1.6}
              y={cy - 1.6}
              width={3.2}
              height={3.2}
              rx={0.7}
              fill={BUS_BOLT}
              stroke="#46566a"
              strokeWidth={0.4}
            />
          ))}
        </g>
      ))}

      {/* base plinth + feet + asset-tag scribble */}
      <rect x={FX - 4} y={FY + FH} width={FW + 8} height={12} fill="#1b232d" stroke={EDGE} strokeWidth={1} />
      <line x1={FX - 4} y1={FY + FH + 0.7} x2={FX + FW + 4} y2={FY + FH + 0.7} stroke="#33404d" strokeWidth={0.7} opacity={0.6} />
      <rect x={FX + 8} y={FY + FH + 4} width={20} height={4} rx={1} fill={DETAIL} opacity={0.5} />
      <rect x={FX} y={FY + FH + 12} width={14} height={6} fill={EDGE} />
      <rect x={FX + FW - 14} y={FY + FH + 12} width={14} height={6} fill={EDGE} />

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
              <rect x={slotX} y={y} width={slotW} height={h} fill="url(#rackTray)" stroke={EDGE} strokeWidth={1} />
              {/* top highlight + bottom shadow → drawer read */}
              <line x1={slotX} y1={y + 0.6} x2={slotX + slotW} y2={y + 0.6} stroke="#46566a" strokeWidth={0.8} />
              <line x1={slotX} y1={y + h - 0.6} x2={slotX + slotW} y2={y + h - 0.6} stroke={EDGE} strokeWidth={0.8} />
              {/* categorical left edge-bar (off status hues) */}
              <rect x={slotX} y={y} width={2.5} height={h} fill={meta.accent} opacity={0.55} />

              {/* kind-specific front-panel detailing (recognizable silhouette) */}
              <TrayFront x={slotX} y={y} w={slotW} h={h} kind={part.trayKind} nameY={nameY} />

              {/* stack-of-trays hint for multi-count slots */}
              {dividers.map((ly) => (
                <line key={ly} x1={slotX + 6} y1={ly} x2={slotX + slotW - 6} y2={ly} stroke="#3b4a5a" strokeWidth={0.6} opacity={0.7} />
              ))}

              {/* name (with dark halo so it stays readable over the panel) */}
              <text
                x={slotX + 11}
                y={nameY}
                className="font-readout"
                fontSize={9}
                fill={selected ? "var(--accent)" : "var(--canvas-text)"}
                style={{ paintOrder: "stroke" }}
                stroke={EDGE}
                strokeWidth={2.5}
              >
                {truncate(part.name, showSpecInline ? 14 : n > 1 ? 24 : 30)}
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
                  style={{ paintOrder: "stroke" }}
                  stroke={EDGE}
                  strokeWidth={2.5}
                >
                  {`×${n}`}
                </text>
              )}

              {/* key spec — second line (tall slots) or inline-right (short) */}
              {showSpecLine && spec && (
                <text
                  x={slotX + 11}
                  y={y + 24}
                  className="font-readout"
                  fontSize={8}
                  textAnchor="start"
                  style={{ paintOrder: "stroke" }}
                  stroke={EDGE}
                  strokeWidth={2.5}
                >
                  <tspan fill="var(--canvas-text-muted)">{spec.key} </tspan>
                  <tspan fill="var(--canvas-text)">{spec.value}</tspan>
                </text>
              )}
              {showSpecInline && spec && (
                <text
                  x={slotX + slotW - 8}
                  y={nameY}
                  className="font-readout"
                  fontSize={8}
                  textAnchor="end"
                  style={{ paintOrder: "stroke" }}
                  stroke={EDGE}
                  strokeWidth={2.5}
                >
                  <tspan fill="var(--canvas-text-muted)">{spec.key} </tspan>
                  <tspan fill="var(--canvas-text)">{spec.value}</tspan>
                </text>
              )}

              {/* hover highlight — neutral white wash */}
              <rect
                x={slotX}
                y={y}
                width={slotW}
                height={h}
                fill="var(--canvas-text)"
                fillOpacity={0.08}
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
 * Tray front-panel detailing — a kind-specific glyph drawn on the tray face.
 * Non-interactive: clicks bubble to the parent <g>. Detailing scales with
 * slot height; tiny slots stay clean (just mounting screws).
 * ----------------------------------------------------------------------- */
function TrayFront({
  x,
  y,
  w,
  h,
  kind,
  nameY,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: TrayKind | undefined;
  nameY: number;
}) {
  const cy = y + h / 2;
  // mounting screws on the rail-side ears (universal rack look)
  const screws =
    h >= 14 ? (
      <>
        <circle cx={x + 5.5} cy={cy} r={1.7} fill={BUS_BOLT} stroke={DETAIL} strokeWidth={0.5} />
        <circle cx={x + w - 5.5} cy={cy} r={1.7} fill={BUS_BOLT} stroke={DETAIL} strokeWidth={0.5} />
      </>
    ) : null;

  if (h < 20) return <g className="pointer-events-none">{screws}</g>;

  // recessed device panel (leaves room for screws + the name line at the top)
  const px = x + 14;
  const pw = w - 28;
  const pTop = Math.max(y + 4, nameY + 4);
  const ph = y + h - 5 - pTop;
  if (pw < 12 || ph < 6) return <g className="pointer-events-none">{screws}</g>;

  return (
    <g className="pointer-events-none">
      {screws}
      <rect x={px} y={pTop} width={pw} height={ph} rx={1.5} fill={PANEL} stroke={EDGE} strokeWidth={0.5} />
      {kind === "compute" && computeGlyph(px, pTop, pw, ph)}
      {kind === "nvlink-switch" && switchGlyph(px, pTop, pw, ph)}
      {kind === "power" && powerGlyph(px, pTop, pw, ph)}
      {kind === "network" && networkGlyph(px, pTop, pw, ph)}
      {(kind === undefined) && genericGlyph(px, pTop, pw, ph)}
    </g>
  );
}

/** Compute sled — perforated vent sheet + lid seam + 2 status LEDs (neutral). */
function computeGlyph(px: number, py: number, pw: number, ph: number) {
  const ledX = px + pw - 7;
  return (
    <>
      <rect x={px + 2} y={py + 2} width={pw - 14} height={ph - 4} rx={1} fill="url(#rackVent)" opacity={0.9} />
      <line x1={px + 2} y1={py + ph / 2} x2={px + pw - 14} y2={py + ph / 2} stroke={EDGE} strokeWidth={0.6} opacity={0.6} />
      <circle cx={ledX} cy={py + ph / 2 - 3} r={1.3} fill="var(--canvas-text-muted)" />
      <circle cx={ledX} cy={py + ph / 2 + 3} r={1.3} fill={DETAIL} />
    </>
  );
}

/** NVLink-switch tray — dense rows of cable cartridges (high-radix backplane). */
function switchGlyph(px: number, py: number, pw: number, ph: number) {
  const rows = ph >= 26 ? 2 : 1;
  const inner = pw - 8;
  const n = Math.max(4, Math.min(16, Math.floor(inner / 9)));
  const cw = inner / n;
  const ports: ReactElement[] = [];
  for (let r = 0; r < rows; r++) {
    const ry = rows === 1 ? py + ph / 2 - 3.5 : py + 4 + r * ((ph - 8) / 2 + 1);
    for (let i = 0; i < n; i++) {
      ports.push(
        <rect
          key={`sw-${r}-${i}`}
          x={px + 4 + i * cw + 0.8}
          y={ry}
          width={Math.max(2.5, cw - 1.8)}
          height={Math.max(4, Math.min(7, (ph - 8) / rows))}
          rx={0.8}
          fill={BUS_BOLT}
          stroke={DETAIL}
          strokeWidth={0.4}
        />,
      );
    }
  }
  return <>{ports}</>;
}

/** Power shelf — N PSU modules, each with a fan + a (neutral) presence LED. */
function powerGlyph(px: number, py: number, pw: number, ph: number) {
  const n = Math.max(2, Math.min(6, Math.floor(pw / 26)));
  const mw = (pw - 4) / n;
  const fr = Math.max(2.2, Math.min(5.5, Math.min(mw / 2 - 2, ph / 2 - 3)));
  const mods: ReactElement[] = [];
  for (let i = 0; i < n; i++) {
    const mx = px + 2 + i * mw;
    const cx = mx + mw / 2;
    const cyc = py + ph / 2;
    mods.push(
      <g key={`psu-${i}`}>
        <rect x={mx + 0.8} y={py + 2} width={mw - 1.6} height={ph - 4} rx={1} fill="#283543" stroke={EDGE} strokeWidth={0.5} />
        <circle cx={cx} cy={cyc} r={fr} fill={BUS_BOLT} stroke={DETAIL} strokeWidth={0.6} />
        <circle cx={cx} cy={cyc} r={fr * 0.4} fill={DETAIL} opacity={0.7} />
        <circle cx={mx + 3.5} cy={py + ph - 4} r={1.1} fill="var(--canvas-text-muted)" />
      </g>,
    );
  }
  return <>{mods}</>;
}

/** Network tray — two rows of QSFP/OSFP port cages. */
function networkGlyph(px: number, py: number, pw: number, ph: number) {
  const inner = pw - 8;
  const n = Math.max(4, Math.min(14, Math.floor(inner / 11)));
  const cw = inner / n;
  const cages: ReactElement[] = [];
  const rows = ph >= 22 ? 2 : 1;
  for (let r = 0; r < rows; r++) {
    const ry = rows === 1 ? py + ph / 2 - 3 : py + 4 + r * ((ph - 6) / 2);
    for (let i = 0; i < n; i++) {
      cages.push(
        <rect
          key={`net-${r}-${i}`}
          x={px + 4 + i * cw + 1}
          y={ry}
          width={Math.max(3, cw - 2.4)}
          height={Math.max(4, Math.min(6, (ph - 8) / rows))}
          rx={0.6}
          fill={BUS_BOLT}
          stroke={DETAIL}
          strokeWidth={0.4}
        />,
      );
    }
  }
  return <>{cages}</>;
}

/** Fallback tray — a few faint horizontal vent louvers. */
function genericGlyph(px: number, py: number, pw: number, ph: number) {
  const n = Math.max(1, Math.min(4, Math.floor(ph / 6)));
  const louvers: ReactElement[] = [];
  for (let i = 1; i <= n; i++) {
    const ly = py + (ph * i) / (n + 1);
    louvers.push(
      <line key={`lv-${i}`} x1={px + 4} y1={ly} x2={px + pw - 4} y2={ly} stroke={DETAIL} strokeWidth={0.6} opacity={0.5} />,
    );
  }
  return <>{louvers}</>;
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
