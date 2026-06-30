import type { PointerEvent } from "react";
import type {
  HwLink,
  HwTreeNode,
  InterconnectKind,
} from "@/features/simulation/model/fixtures/c3";

/**
 * RoomScene — a PRESENTATIONAL 2.5D isometric data-center ROOM for one HW level
 * of the Canvas-3 digital twin. Used when the current container is a
 * `data_center` or a `cluster`:
 *
 *   • container.level === "data_center" → each child is a CLUSTER, drawn as a
 *     labelled ZONE: a tinted floor patch + a small block of rack cabinets,
 *     coloured by the cluster's categorical accent (--cat-*, never a status hue).
 *   • otherwise (inside a cluster) → each child is a RACK, drawn as one detailed
 *     cabinet, arranged in rows separated by walkable cold/hot aisles.
 *
 * It is a schematic isometric SVG (NOT a flat grid, NOT photoreal): a raised
 * floor in faux-perspective with aisles, low back walls, detailed cabinets
 * (front louvered doors, status-LED marks, top fan grilles), an overhead power
 * busway with drop hangers, a floor cooling loop + CRAH units, and tiny scale
 * figures so the room reads at human scale. Every child part is a clickable iso
 * <g> hit region. No hooks / no state — pure props in, SVG out.
 *
 * Color rule (DESIGN.md §2/§9): faces are fixed metal greys, taxonomy uses the
 * categorical palette, and the reserved status hues are untouched — var(--accent)
 * (cyan) appears ONLY as the selection outline/glow, and hover is a neutral
 * white wash. The cabinet "status" LEDs are decorative activity marks rendered
 * in neutral white + the part's categorical accent — never a status hue.
 */

/* ---- fixed metal-grey palette (the canvas is always dark) ---------------- */
const FACE_TOP = "#313c49";
const FACE_LEFT = "#232d38";
const FACE_RIGHT = "#19212b";
const EDGE = "#11161d";
const RECESS = "#10151c"; // vented door recess (darker than the faces)
const FLOOR = "#141b24";
const FLOOR_AISLE = "#1b2531"; // cold-aisle band (a touch lighter than the floor)
const FLOOR_LINE = "#212b37";
const WALL_L = "#10161e";
const WALL_R = "#0d1319";
const DETAIL = "#3b4a5a";
const HILIGHT = "#4a5b6e"; // top-edge bevel / handles (light direction = top-left)
const PIPE = "#3a4d5a"; // cooling pipe (neutral cool grey, NOT a status hue)
const LED_ON = "#cdd6df"; // neutral activity LED
const LED_OFF = "#283442"; // unlit LED
const FIGURE = "#828c99"; // scale-figure silhouette

/** Cluster taxonomy → categorical accent (mirrors TwinObject.CLUSTER_ACCENT). */
const CLUSTER_ACCENT: Record<string, string> = {
  gpu: "var(--cat-tool)",
  cpu: "var(--cat-router)",
  cxl: "var(--cat-llm)",
  storage: "var(--cat-io)",
  cxmt: "var(--cat-memory)",
  special: "var(--cat-llm)",
  custom: "var(--cat-io)",
};
const accentFor = (clusterType?: string): string =>
  (clusterType && CLUSTER_ACCENT[clusterType]) || "var(--canvas-text-muted)";

/* ---- isometric projection (2:1) ----------------------------------------- */
const TW = 26; // tile half-width  (x/y grid → screen x)
const TH = 13; // tile half-height (x/y grid → screen y)
const UH = 12; // one z unit       (height → screen y)

interface P {
  x: number;
  y: number;
}
const iso = (gx: number, gy: number, gz: number): P => ({
  x: (gx - gy) * TW,
  y: (gx + gy) * TH - gz * UH,
});
const r = (n: number): number => Math.round(n * 100) / 100;
const poly = (...ps: P[]): string => ps.map((p) => `${r(p.x)},${r(p.y)}`).join(" ");

/* ---- interconnect edge styling (by kind) — mirrors TrayScene/GpuScene ----
 * The categorical --cat-* hues are the reserved EDGE palette here; the status
 * hues and --accent (selection only) are never used for fabric edges. */
interface EdgeStyle {
  stroke: string;
  width: number;
  dash?: string;
  cap: "round" | "butt";
}
function edgeStyle(kind: InterconnectKind): EdgeStyle {
  switch (kind) {
    case "nvlink":
      return { stroke: "var(--cat-llm)", width: 2.6, cap: "round" };
    case "c2c":
      return { stroke: "var(--cat-router)", width: 2.2, cap: "round" };
    case "osfp":
      return { stroke: "var(--cat-io)", width: 1.8, dash: "5 4", cap: "round" };
    case "ib":
    case "ethernet":
      return { stroke: "var(--cat-io)", width: 1.5, dash: "0.5 4", cap: "round" };
    case "cxl":
      return { stroke: "var(--cat-memory)", width: 1.6, dash: "4 3", cap: "round" };
    case "pcie":
    default:
      return { stroke: "var(--cat-router)", width: 1.3, cap: "butt" };
  }
}

/** The three visible faces of an iso box footprint [gx,gx+dx]×[gy,gy+dy]×[0,h]. */
function faces(gx: number, gy: number, dx: number, dy: number, h: number) {
  return {
    top: poly(
      iso(gx, gy, h),
      iso(gx + dx, gy, h),
      iso(gx + dx, gy + dy, h),
      iso(gx, gy + dy, h),
    ),
    left: poly(
      iso(gx, gy + dy, h),
      iso(gx + dx, gy + dy, h),
      iso(gx + dx, gy + dy, 0),
      iso(gx, gy + dy, 0),
    ),
    right: poly(
      iso(gx + dx, gy, h),
      iso(gx + dx, gy + dy, h),
      iso(gx + dx, gy + dy, 0),
      iso(gx + dx, gy, 0),
    ),
  };
}

/* ---- layout constants ---------------------------------------------------- */
const START = 1.7; // first cell offset from the room corner
const MARGIN = 1.6; // floor border beyond the last cabinet (front aisle)

const RACK = { dx: 1.55, dy: 2.45, h: 5.2 };
const RACK_PITCH_X = 2.0; // tight within a row
const RACK_PITCH_Y = 4.7; // row pitch → ~2.2u aisle between rows
const RACK_COLS_MAX = 6;

const MC = { dx: 0.95, dy: 1.5, h: 4.0 }; // a zone's mini rack cabinet
const MC_COLS = 3;
const MC_ROWS = 2;
const MC_PITCH_X = 1.25;
const MC_PITCH_Y = 2.0;
const PATCH_PAD = 0.65; // tinted floor patch border around a zone's cabinets
const ZONE_W = (MC_COLS - 1) * MC_PITCH_X + MC.dx + PATCH_PAD * 2;
const ZONE_D = (MC_ROWS - 1) * MC_PITCH_Y + MC.dy + PATCH_PAD * 2;
const ZONE_PITCH_X = ZONE_W + 2.2;
const ZONE_PITCH_Y = ZONE_D + 3.0;

interface Slot {
  part: HwTreeNode;
  gx: number;
  gy: number;
  dx: number;
  dy: number;
}

/** Place each part on the floor (zone block grid, or rack rows). */
function layout(zones: boolean, parts: HwTreeNode[]): Slot[] {
  const n = parts.length;
  if (zones) {
    const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
    return parts.map((part, i) => ({
      part,
      gx: START + (i % cols) * ZONE_PITCH_X,
      gy: START + Math.floor(i / cols) * ZONE_PITCH_Y,
      dx: ZONE_W,
      dy: ZONE_D,
    }));
  }
  const cols = Math.max(1, Math.min(n, RACK_COLS_MAX));
  return parts.map((part, i) => ({
    part,
    gx: START + (i % cols) * RACK_PITCH_X,
    gy: START + Math.floor(i / cols) * RACK_PITCH_Y,
    dx: RACK.dx,
    dy: RACK.dy,
  }));
}

const truncate = (s: string, n: number): string =>
  s.length > n ? `${s.slice(0, n - 1)}…` : s;

/** A short secondary readout (the first spec field) for a part label. */
function subLabel(part: HwTreeNode): string {
  const first = Object.entries(part.spec)[0];
  return first ? truncate(`${first[0]} ${first[1]}`, 18) : part.level;
}

/* ---- glyph pieces -------------------------------------------------------- */

/** Soft floor shadow cast down-right (light = top-left), under a footprint. */
function FloorShadow({
  gx,
  gy,
  dx,
  dy,
}: {
  gx: number;
  gy: number;
  dx: number;
  dy: number;
}) {
  const o = 0.22;
  return (
    <polygon
      points={poly(
        iso(gx + o, gy + o, 0),
        iso(gx + dx + o, gy + o, 0),
        iso(gx + dx + o, gy + dy + o, 0),
        iso(gx + o, gy + dy + o, 0),
      )}
      fill="#000000"
      opacity={0.3}
      filter="url(#room-shadow)"
      className="pointer-events-none"
    />
  );
}

/**
 * One iso rack cabinet: gradient metal faces, a louvered front door with status
 * LEDs + handle, a top fan grille, a side seam, and an accent top ridge. `detail`
 * trims the glyph for the many mini-cabinets inside a zone.
 */
function Cabinet({
  gx,
  gy,
  dx,
  dy,
  h,
  accent,
  selected,
  detail,
}: {
  gx: number;
  gy: number;
  dx: number;
  dy: number;
  h: number;
  accent: string;
  selected: boolean;
  detail: "full" | "mini";
}) {
  const f = faces(gx, gy, dx, dy, h);
  const ridge = selected ? "var(--accent)" : accent;
  const inset = dx * 0.14;
  const full = detail === "full";

  // Front-door louver slats (lines parallel to the dx edge, stacked in z).
  const slatN = full ? 9 : 5;
  const slats = Array.from({ length: slatN }, (_, s) => {
    const z = h * (0.12 + (0.74 * (s + 0.5)) / slatN);
    const a = iso(gx + inset, gy + dy, z);
    const b = iso(gx + dx - inset, gy + dy, z);
    return (
      <line
        key={`sl${s}`}
        x1={r(a.x)}
        y1={r(a.y)}
        x2={r(b.x)}
        y2={r(b.y)}
        stroke={DETAIL}
        strokeWidth={0.5}
        opacity={0.55}
      />
    );
  });

  // Status-LED marks near the top of the door (neutral + one categorical accent).
  const ledN = full ? 3 : 1;
  const ledZ = h * 0.9;
  const ledFill = (i: number): string =>
    i === 0 ? accent : i === 1 ? LED_ON : LED_OFF;
  const leds = Array.from({ length: ledN }, (_, i) => {
    const gxi = gx + inset + i * ((dx - 2 * inset) / 3);
    const p = iso(gxi + 0.12, gy + dy, ledZ);
    return (
      <circle
        key={`led${i}`}
        cx={r(p.x)}
        cy={r(p.y)}
        r={full ? 1.1 : 0.85}
        fill={ledFill(i)}
        opacity={i === 2 ? 0.8 : 0.95}
      />
    );
  });

  // Door handle (full only): a short bright bar on the door near the rail edge.
  const handle = full
    ? (() => {
        const hx = gx + dx - inset - 0.08;
        const a = iso(hx, gy + dy, h * 0.46);
        const b = iso(hx, gy + dy, h * 0.6);
        return (
          <line
            x1={r(a.x)}
            y1={r(a.y)}
            x2={r(b.x)}
            y2={r(b.y)}
            stroke={HILIGHT}
            strokeWidth={1.4}
            strokeLinecap="round"
          />
        );
      })()
    : null;

  // Top fan grille (full only): an inset panel on the lid with a couple of vents.
  const grille = full
    ? (() => {
        const gp = Math.min(dx, dy) * 0.2;
        const panel = poly(
          iso(gx + gp, gy + gp, h),
          iso(gx + dx - gp, gy + gp, h),
          iso(gx + dx - gp, gy + dy - gp, h),
          iso(gx + gp, gy + dy - gp, h),
        );
        const vents = [0.34, 0.5, 0.66].map((t, i) => {
          const gyi = gy + gp + (dy - 2 * gp) * t;
          const a = iso(gx + gp + 0.08, gyi, h);
          const b = iso(gx + dx - gp - 0.08, gyi, h);
          return (
            <line
              key={`v${i}`}
              x1={r(a.x)}
              y1={r(a.y)}
              x2={r(b.x)}
              y2={r(b.y)}
              stroke={EDGE}
              strokeWidth={0.5}
              opacity={0.7}
            />
          );
        });
        return (
          <>
            <polygon points={panel} fill="#222c37" stroke={EDGE} strokeWidth={0.4} />
            {vents}
          </>
        );
      })()
    : null;

  // Side-panel seam (full only): a faint vertical join on the long face.
  const seam = full
    ? (() => {
        const a = iso(gx + dx, gy + dy * 0.5, 0);
        const b = iso(gx + dx, gy + dy * 0.5, h);
        return (
          <line
            x1={r(a.x)}
            y1={r(a.y)}
            x2={r(b.x)}
            y2={r(b.y)}
            stroke={EDGE}
            strokeWidth={0.5}
            opacity={0.6}
          />
        );
      })()
    : null;

  return (
    <>
      {/* faces (light direction: top lightest → left → right darkest) */}
      <polygon points={f.right} fill="url(#room-face-right)" stroke={EDGE} strokeWidth={0.6} />
      {seam}
      <polygon points={f.left} fill="url(#room-face-left)" stroke={EDGE} strokeWidth={0.6} />

      {/* recessed louvered front door */}
      <polygon
        points={poly(
          iso(gx + inset, gy + dy, h * 0.06),
          iso(gx + dx - inset, gy + dy, h * 0.06),
          iso(gx + dx - inset, gy + dy, h * 0.94),
          iso(gx + inset, gy + dy, h * 0.94),
        )}
        fill={RECESS}
        stroke={EDGE}
        strokeWidth={0.4}
      />
      {slats}
      {leds}
      {handle}

      {/* lid */}
      <polygon points={f.top} fill="url(#room-face-top)" stroke={EDGE} strokeWidth={0.6} />
      {grille}

      {/* top-edge bevel highlight + categorical accent ridge */}
      <polyline
        points={poly(iso(gx, gy + dy, h), iso(gx + dx, gy + dy, h), iso(gx + dx, gy, h))}
        fill="none"
        stroke={HILIGHT}
        strokeWidth={0.7}
        opacity={0.5}
      />
      <polyline
        points={poly(iso(gx, gy + dy, h), iso(gx + dx, gy + dy, h), iso(gx + dx, gy, h))}
        fill="none"
        stroke={ridge}
        strokeWidth={1.1}
        opacity={0.85}
      />

      {/* neutral white hover wash (group lives on the part <g>) */}
      <g className="pointer-events-none opacity-0 transition-opacity duration-150 group-hover:opacity-[0.1]">
        <polygon points={f.left} fill="#ffffff" />
        <polygon points={f.right} fill="#ffffff" />
        <polygon points={f.top} fill="#ffffff" />
      </g>
    </>
  );
}

/** Accent selection cage (wireframe + glow) around a part's footprint. */
function Cage({
  gx,
  gy,
  dx,
  dy,
  h,
}: {
  gx: number;
  gy: number;
  dx: number;
  dy: number;
  h: number;
}) {
  const corners: Array<[number, number]> = [
    [gx, gy],
    [gx + dx, gy],
    [gx + dx, gy + dy],
    [gx, gy + dy],
  ];
  const top = poly(...corners.map(([x, y]) => iso(x, y, h)));
  const bot = poly(...corners.map(([x, y]) => iso(x, y, 0)));
  return (
    <g
      filter="url(#room-glow)"
      fill="none"
      stroke="var(--accent)"
      className="pointer-events-none"
    >
      <polygon points={bot} strokeWidth={1} opacity={0.55} />
      {corners.map(([x, y], i) => {
        const a = iso(x, y, 0);
        const b = iso(x, y, h);
        return (
          <line
            key={i}
            x1={r(a.x)}
            y1={r(a.y)}
            x2={r(b.x)}
            y2={r(b.y)}
            strokeWidth={1.1}
            opacity={0.8}
          />
        );
      })}
      <polygon points={top} strokeWidth={1.5} />
    </g>
  );
}

/** A small mono-readout label tag, anchored on the floor near a part. */
function Label({
  at,
  name,
  sub,
  swatch,
  anchor,
  count,
}: {
  at: P;
  name: string;
  sub: string;
  swatch?: string;
  anchor: "start" | "middle";
  count?: number;
}) {
  const text = truncate(name, 22);
  const badge = count && count > 1 ? `×${count}` : "";
  const badgeW = badge ? badge.length * 6 + 8 : 0;
  const w = Math.max(text.length, sub.length) * 5.9 + (swatch ? 16 : 12) + badgeW;
  const left = anchor === "middle" ? at.x - w / 2 : at.x - 5;
  const tx = anchor === "middle" ? at.x : at.x + (swatch ? 11 : 3);
  return (
    <g className="pointer-events-none">
      <rect
        x={r(left)}
        y={r(at.y - 12)}
        width={r(w)}
        height={25}
        rx={3}
        fill="var(--canvas-bg)"
        fillOpacity={0.85}
        stroke="var(--canvas-grid)"
        strokeWidth={0.6}
      />
      {swatch && (
        <rect
          x={r(left + 4)}
          y={r(at.y - 6)}
          width={5}
          height={5}
          rx={1}
          fill={swatch}
        />
      )}
      <text
        x={r(tx)}
        y={r(at.y - 1)}
        fontSize={10.5}
        textAnchor={anchor}
        className="font-readout"
        fill="var(--canvas-text)"
      >
        {text}
      </text>
      <text
        x={r(tx)}
        y={r(at.y + 9)}
        fontSize={8.5}
        textAnchor={anchor}
        className="font-readout"
        fill="var(--canvas-text-muted)"
      >
        {sub}
      </text>
      {badge && (
        <>
          <rect
            x={r(left + w - badgeW - 4)}
            y={r(at.y - 10)}
            width={r(badgeW)}
            height={11}
            rx={2}
            fill="var(--canvas-grid)"
          />
          <text
            x={r(left + w - badgeW - 4 + badgeW / 2)}
            y={r(at.y - 1.5)}
            fontSize={8.5}
            textAnchor="middle"
            className="font-readout"
            fill="var(--canvas-text)"
          >
            {badge}
          </text>
        </>
      )}
    </g>
  );
}

/** A tiny human silhouette standing on the floor, for human scale (decorative). */
function ScaleFigure({ gx, gy }: { gx: number; gy: number }) {
  const figH = 3.6;
  const foot = iso(gx, gy, 0);
  const shoulder = iso(gx, gy, figH * 0.78);
  const head = iso(gx, gy, figH);
  return (
    <g className="pointer-events-none" opacity={0.5}>
      <ellipse cx={r(foot.x)} cy={r(foot.y)} rx={3.2} ry={1.4} fill="#000000" opacity={0.35} />
      <line
        x1={r(foot.x)}
        y1={r(foot.y)}
        x2={r(shoulder.x)}
        y2={r(shoulder.y)}
        stroke={FIGURE}
        strokeWidth={2.4}
        strokeLinecap="round"
      />
      <circle cx={r(head.x)} cy={r(head.y)} r={2} fill="#9aa1ac" />
    </g>
  );
}

/** A non-interactive CRAH/cooling unit against the back wall (room realism). */
function CrahUnit({ gx, gy }: { gx: number; gy: number }) {
  const dx = 2.1;
  const dy = 0.85;
  const h = 4.4;
  const f = faces(gx, gy, dx, dy, h);
  const fan = iso(gx + dx / 2, gy + dy / 2, h);
  return (
    <g className="pointer-events-none">
      <polygon points={f.right} fill={FACE_RIGHT} stroke={EDGE} strokeWidth={0.6} />
      <polygon points={f.left} fill={FACE_LEFT} stroke={EDGE} strokeWidth={0.6} />
      <polygon points={f.top} fill={FACE_TOP} stroke={EDGE} strokeWidth={0.6} />
      {/* front grille hatch */}
      {[0.25, 0.45, 0.65, 0.85].map((t, i) => {
        const a = iso(gx + 0.15, gy + dy, h * t);
        const b = iso(gx + dx - 0.15, gy + dy, h * t);
        return (
          <line
            key={`cg${i}`}
            x1={r(a.x)}
            y1={r(a.y)}
            x2={r(b.x)}
            y2={r(b.y)}
            stroke={DETAIL}
            strokeWidth={0.5}
            opacity={0.6}
          />
        );
      })}
      {/* roof fan */}
      <ellipse cx={r(fan.x)} cy={r(fan.y)} rx={9} ry={4.5} fill="#1c2530" stroke={DETAIL} strokeWidth={0.6} />
      <ellipse cx={r(fan.x)} cy={r(fan.y)} rx={3} ry={1.5} fill={DETAIL} opacity={0.7} />
      <text
        x={r(iso(gx + dx / 2, gy + dy, h * 0.04).x)}
        y={r(iso(gx + dx / 2, gy + dy, h * 0.04).y - 2)}
        fontSize={6.5}
        textAnchor="middle"
        className="font-readout"
        fill="var(--canvas-text-dim)"
      >
        CRAH
      </text>
    </g>
  );
}

export function RoomScene({
  container,
  parts,
  selectedId,
  onPick,
  onPartPointerDown,
  onPartPointerUp,
}: {
  container: HwTreeNode;
  parts: HwTreeNode[];
  selectedId?: string;
  onPick: (partId: string, drill: boolean) => void;
  onPartPointerDown?: (partId: string, e: PointerEvent<SVGGElement>) => void;
  onPartPointerUp?: (partId: string, e: PointerEvent<SVGGElement>) => void;
}) {
  const zones = container.level === "data_center";
  const slots = layout(zones, parts);

  /* floor extent + camera bounds derived from the placed cabinets */
  const maxRight = slots.reduce((m, s) => Math.max(m, s.gx + s.dx), START + 1);
  const maxFront = slots.reduce((m, s) => Math.max(m, s.gy + s.dy), START + 1);
  const FW = Math.ceil(maxRight + MARGIN);
  const FD = Math.ceil(maxFront + MARGIN);
  const cabH = zones ? MC.h : RACK.h;
  const wallH = cabH + 2.8;

  /* per-part screen anchor (footprint centre-top) + resolved interconnects.
     Recomputed from `slots` each render so edges follow the parts; a link is
     skipped unless BOTH endpoint partIds are placed in this room. */
  const anchors: Record<string, P> = {};
  for (const s of slots) {
    anchors[s.part.partId] = iso(s.gx + s.dx / 2, s.gy + s.dy / 2, cabH);
  }
  const links: HwLink[] = container.links ?? [];
  const drawnLinks = links.filter((l) => anchors[l.from] && anchors[l.to]);

  const minX = -FD * TW - 30;
  const maxX = FW * TW + 30;
  const minY = -wallH * UH - 26;
  const maxY = (FW + FD) * TH + 46;
  const vb = `${r(minX)} ${r(minY)} ${r(maxX - minX)} ${r(maxY - minY)}`;

  /* floor grid lines */
  const gridLines: P[][] = [];
  for (let i = 0; i <= FW; i++) gridLines.push([iso(i, 0, 0), iso(i, FD, 0)]);
  for (let j = 0; j <= FD; j++) gridLines.push([iso(0, j, 0), iso(FW, j, 0)]);

  /* walkable aisle bands: the gy gaps between rows (+ front/back margins) */
  const rowMap = new Map<number, number>();
  for (const s of slots) rowMap.set(s.gy, Math.max(rowMap.get(s.gy) ?? 0, s.dy));
  const rows = [...rowMap.entries()]
    .map(([gy, dy]) => ({ gy, dy }))
    .sort((a, b) => a.gy - b.gy);
  const aisles: Array<{ y0: number; y1: number }> = [];
  let prevEnd = 0;
  for (const row of rows) {
    if (row.gy - prevEnd > 0.4) aisles.push({ y0: prevEnd, y1: row.gy });
    prevEnd = row.gy + row.dy;
  }
  if (FD - prevEnd > 0.4) aisles.push({ y0: prevEnd, y1: FD });

  /* one or two scale figures, in the front-most aisle, drawn last (on top) */
  const frontAisle = aisles.reduce<{ y0: number; y1: number } | null>(
    (best, a) =>
      a.y1 - a.y0 >= 1.0 && (!best || a.y0 > best.y0) ? a : best,
    null,
  );
  const figures: P[] = [];
  if (frontAisle) {
    const fy = (frontAisle.y0 + frontAisle.y1) / 2;
    figures.push({ x: START + 0.6, y: fy });
    if (maxRight > START + 3) figures.push({ x: maxRight * 0.62, y: fy });
  }

  /* draw cabinets back-to-front */
  const ordered = [...slots].sort((a, b) => a.gx + a.gy - (b.gx + b.gy));

  const busZ = wallH - 0.5;
  const busY = 0.55;
  const hangerStep = 3;
  const crahGx = FW * 0.42;
  const showCrah = !zones && FW >= 5; // back-wall cooling units in rack rooms

  return (
    <svg
      viewBox={vb}
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      className="block h-full w-full"
      role="img"
      aria-label={`Data-center room: ${container.name}`}
    >
      <defs>
        <filter id="room-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="room-shadow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="2" />
        </filter>
        {/* subtle face gradients for depth (still metal greys, top-left light) */}
        <linearGradient id="room-face-top" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a4757" />
          <stop offset="1" stopColor="#2b343f" />
        </linearGradient>
        <linearGradient id="room-face-left" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#27313d" />
          <stop offset="1" stopColor="#1c242d" />
        </linearGradient>
        <linearGradient id="room-face-right" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1d2531" />
          <stop offset="1" stopColor="#131922" />
        </linearGradient>
        {/* soft light pool over the floor centre */}
        <radialGradient id="room-floor-light" cx="0.5" cy="0.42" r="0.62">
          <stop offset="0" stopColor="#27323f" stopOpacity="0.55" />
          <stop offset="1" stopColor="#27323f" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect
        x={r(minX)}
        y={r(minY)}
        width={r(maxX - minX)}
        height={r(maxY - minY)}
        fill="var(--canvas-bg)"
      />

      {/* low back walls for room depth (with baseboard highlight) */}
      <polygon
        points={poly(iso(0, 0, wallH), iso(0, FD, wallH), iso(0, FD, 0), iso(0, 0, 0))}
        fill={WALL_L}
        stroke={EDGE}
        strokeWidth={0.6}
      />
      <polygon
        points={poly(iso(0, 0, wallH), iso(FW, 0, wallH), iso(FW, 0, 0), iso(0, 0, 0))}
        fill={WALL_R}
        stroke={EDGE}
        strokeWidth={0.6}
      />
      <polyline
        points={poly(iso(0, FD, 0.12), iso(0, 0, 0.12), iso(FW, 0, 0.12))}
        fill="none"
        stroke={HILIGHT}
        strokeWidth={0.6}
        opacity={0.35}
      />

      {/* raised floor + soft light pool */}
      <polygon
        points={poly(iso(0, 0, 0), iso(FW, 0, 0), iso(FW, FD, 0), iso(0, FD, 0))}
        fill={FLOOR}
        stroke={EDGE}
        strokeWidth={0.8}
      />
      <polygon
        points={poly(iso(0, 0, 0), iso(FW, 0, 0), iso(FW, FD, 0), iso(0, FD, 0))}
        fill="url(#room-floor-light)"
        className="pointer-events-none"
      />

      {/* cold/hot aisle bands + perforated-tile centre stripe */}
      {aisles.map((a, i) => (
        <g key={`ai${i}`} className="pointer-events-none">
          <polygon
            points={poly(
              iso(0, a.y0, 0),
              iso(FW, a.y0, 0),
              iso(FW, a.y1, 0),
              iso(0, a.y1, 0),
            )}
            fill={FLOOR_AISLE}
            opacity={0.7}
          />
          <line
            x1={r(iso(0.4, (a.y0 + a.y1) / 2, 0).x)}
            y1={r(iso(0.4, (a.y0 + a.y1) / 2, 0).y)}
            x2={r(iso(FW - 0.4, (a.y0 + a.y1) / 2, 0).x)}
            y2={r(iso(FW - 0.4, (a.y0 + a.y1) / 2, 0).y)}
            stroke={DETAIL}
            strokeWidth={0.8}
            strokeDasharray="2 2.5"
            opacity={0.5}
          />
        </g>
      ))}

      {/* floor tile grid */}
      {gridLines.map((l, i) => (
        <line
          key={`g${i}`}
          x1={r(l[0].x)}
          y1={r(l[0].y)}
          x2={r(l[1].x)}
          y2={r(l[1].y)}
          stroke={FLOOR_LINE}
          strokeWidth={0.5}
          opacity={0.55}
        />
      ))}

      {/* cooling loop: double-line supply + return pipes around the perimeter */}
      {(
        [
          [iso(0.7, 0.6, 0.05), iso(0.7, FD - 0.6, 0.05)],
          [iso(FW - 0.7, 0.6, 0.05), iso(FW - 0.7, FD - 0.6, 0.05)],
          [iso(0.7, FD - 0.6, 0.05), iso(FW - 0.7, FD - 0.6, 0.05)],
        ] as Array<[P, P]>
      ).map((l, i) => (
        <g key={`c${i}`} className="pointer-events-none">
          <line
            x1={r(l[0].x)}
            y1={r(l[0].y)}
            x2={r(l[1].x)}
            y2={r(l[1].y)}
            stroke={PIPE}
            strokeWidth={2.4}
            opacity={0.5}
          />
          <line
            x1={r(l[0].x)}
            y1={r(l[0].y)}
            x2={r(l[1].x)}
            y2={r(l[1].y)}
            stroke={EDGE}
            strokeWidth={0.6}
            opacity={0.6}
          />
        </g>
      ))}

      {/* back-wall CRAH cooling units (rack rooms only) */}
      {showCrah && (
        <>
          <CrahUnit gx={crahGx} gy={0.25} />
          {FW >= 9 && <CrahUnit gx={crahGx + 3} gy={0.25} />}
        </>
      )}

      {/* overhead power busway (3D rail) + drop hangers + tap-off boxes */}
      <polygon
        points={poly(
          iso(1, busY, busZ),
          iso(FW - 0.5, busY, busZ),
          iso(FW - 0.5, busY, busZ - 0.4),
          iso(1, busY, busZ - 0.4),
        )}
        fill="#222c37"
        stroke={EDGE}
        strokeWidth={0.6}
        className="pointer-events-none"
      />
      <polyline
        points={poly(iso(1, busY, busZ), iso(FW - 0.5, busY, busZ))}
        fill="none"
        stroke={HILIGHT}
        strokeWidth={0.8}
        opacity={0.6}
        className="pointer-events-none"
      />
      {Array.from({ length: Math.max(2, Math.floor(FW / hangerStep)) }, (_, k) => {
        const gx = 2 + k * hangerStep;
        if (gx > FW - 1) return null;
        const a = iso(gx, busY, busZ - 0.4);
        const b = iso(gx, busY, busZ - 1.3);
        const tap = iso(gx, busY, busZ - 0.4);
        return (
          <g key={`h${k}`} className="pointer-events-none">
            <line
              x1={r(a.x)}
              y1={r(a.y)}
              x2={r(b.x)}
              y2={r(b.y)}
              stroke={DETAIL}
              strokeWidth={1}
              opacity={0.55}
            />
            <rect
              x={r(tap.x - 2)}
              y={r(tap.y - 1)}
              width={4}
              height={3}
              rx={0.6}
              fill="#2a3441"
              stroke={EDGE}
              strokeWidth={0.4}
            />
          </g>
        );
      })}

      {/* the clickable parts */}
      {ordered.map((slot) => {
        const { part, gx, gy, dx, dy } = slot;
        const selected = part.partId === selectedId;
        const drillable = !!part.children && part.children.length > 0;
        const accent = zones
          ? accentFor(part.clusterType)
          : accentFor(container.clusterType);

        return (
          <g
            key={part.partId}
            className="group cursor-pointer"
            onClick={(e) => onPick(part.partId, e.ctrlKey || e.metaKey)}
            onPointerDown={onPartPointerDown ? (e) => onPartPointerDown(part.partId, e) : undefined}
            onPointerUp={onPartPointerUp ? (e) => onPartPointerUp(part.partId, e) : undefined}
          >
            <title>
              {drillable ? `${part.partId} — Ctrl/⌘+click to drill in` : part.partId}
            </title>

            {zones ? (
              <>
                {/* zone platform shadow */}
                <FloorShadow gx={gx} gy={gy} dx={dx} dy={dy} />
                {/* tinted zone floor patch + dashed inner border */}
                <polygon
                  points={poly(
                    iso(gx, gy, 0),
                    iso(gx + dx, gy, 0),
                    iso(gx + dx, gy + dy, 0),
                    iso(gx, gy + dy, 0),
                  )}
                  fill={accent}
                  fillOpacity={0.12}
                  stroke={accent}
                  strokeOpacity={0.4}
                  strokeWidth={0.9}
                />
                <polygon
                  points={poly(
                    iso(gx + 0.25, gy + 0.25, 0),
                    iso(gx + dx - 0.25, gy + 0.25, 0),
                    iso(gx + dx - 0.25, gy + dy - 0.25, 0),
                    iso(gx + 0.25, gy + dy - 0.25, 0),
                  )}
                  fill="none"
                  stroke={accent}
                  strokeOpacity={0.3}
                  strokeWidth={0.5}
                  strokeDasharray="3 3"
                  className="pointer-events-none"
                />
                {Array.from({ length: MC_COLS * MC_ROWS }, (_, k) => {
                  const col = k % MC_COLS;
                  const row = Math.floor(k / MC_COLS);
                  return (
                    <Cabinet
                      key={k}
                      gx={gx + PATCH_PAD + col * MC_PITCH_X}
                      gy={gy + PATCH_PAD + row * MC_PITCH_Y}
                      dx={MC.dx}
                      dy={MC.dy}
                      h={MC.h}
                      accent={accent}
                      selected={selected}
                      detail="mini"
                    />
                  );
                })}
                {/* zone-wide neutral hover wash */}
                <polygon
                  points={poly(
                    iso(gx, gy, 0),
                    iso(gx + dx, gy, 0),
                    iso(gx + dx, gy + dy, 0),
                    iso(gx, gy + dy, 0),
                  )}
                  fill="#ffffff"
                  className="pointer-events-none opacity-0 transition-opacity duration-150 group-hover:opacity-[0.06]"
                />
              </>
            ) : (
              <>
                <FloorShadow gx={gx} gy={gy} dx={dx} dy={dy} />
                <Cabinet
                  gx={gx}
                  gy={gy}
                  dx={dx}
                  dy={dy}
                  h={RACK.h}
                  accent={accent}
                  selected={selected}
                  detail="full"
                />
              </>
            )}

            {selected && (
              <Cage
                gx={gx}
                gy={gy}
                dx={dx}
                dy={dy}
                h={zones ? MC.h + 0.7 : RACK.h + 0.3}
              />
            )}
          </g>
        );
      })}

      {/* interconnect edges — above the cabinets, below the labels. Anchored at
          each part's footprint centre-top; recomputed from `slots` per render. */}
      {drawnLinks.map((l, i) => {
        const a = anchors[l.from];
        const b = anchors[l.to];
        const es = edgeStyle(l.kind);
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        return (
          <g key={`link-${i}-${l.from}-${l.to}`} className="pointer-events-none">
            {/* drop shadow for legibility over the metal faces */}
            <line
              x1={r(a.x)}
              y1={r(a.y + 1.4)}
              x2={r(b.x)}
              y2={r(b.y + 1.4)}
              stroke="#0b0f14"
              strokeWidth={es.width + 1.6}
              strokeLinecap="round"
              opacity={0.45}
            />
            <line
              x1={r(a.x)}
              y1={r(a.y)}
              x2={r(b.x)}
              y2={r(b.y)}
              style={{ stroke: es.stroke }}
              strokeWidth={es.width}
              strokeDasharray={es.dash}
              strokeLinecap={es.cap}
              opacity={0.95}
            />
            <circle cx={r(a.x)} cy={r(a.y)} r={2.4} style={{ fill: es.stroke }} stroke="#0b0f14" strokeWidth={0.6} />
            <circle cx={r(b.x)} cy={r(b.y)} r={2.4} style={{ fill: es.stroke }} stroke="#0b0f14" strokeWidth={0.6} />
            {l.label && (
              <text
                x={r(mx)}
                y={r(my - 4)}
                className="font-readout"
                fontSize={8.5}
                textAnchor="middle"
                style={{ fill: es.stroke, stroke: "#0b0f14", strokeWidth: 3, paintOrder: "stroke" }}
              >
                {l.label}
              </text>
            )}
          </g>
        );
      })}

      {/* part labels (on top of the edge layer; Label is pointer-events-none so
          clicks fall through to the cabinet faces beneath — selection unchanged) */}
      {ordered.map((slot) => {
        const { part, gx, gy, dx, dy } = slot;
        const accent = zones
          ? accentFor(part.clusterType)
          : accentFor(container.clusterType);
        return zones ? (
          <Label
            key={`lbl-${part.partId}`}
            at={{ x: iso(gx, gy, 0).x, y: iso(gx, gy, 0).y - (MC.h + 1.8) * UH }}
            name={part.name}
            sub={subLabel(part)}
            swatch={accent}
            anchor="start"
            count={part.count}
          />
        ) : (
          <Label
            key={`lbl-${part.partId}`}
            at={{
              x: iso(gx + dx / 2, gy + dy, 0).x,
              y: iso(gx + dx / 2, gy + dy, 0).y + 18,
            }}
            name={part.name}
            sub={subLabel(part)}
            anchor="middle"
            count={part.count}
          />
        );
      })}

      {/* scale figures last → drawn on top, in the front-most aisle */}
      {figures.map((p, i) => (
        <ScaleFigure key={`fig${i}`} gx={p.x} gy={p.y} />
      ))}

      {parts.length === 0 && (
        <text
          x={0}
          y={r((FW + FD) * TH * 0.5)}
          textAnchor="middle"
          fontSize={12}
          className="font-readout"
          fill="var(--canvas-text-dim)"
        >
          — empty room —
        </text>
      )}
    </svg>
  );
}
