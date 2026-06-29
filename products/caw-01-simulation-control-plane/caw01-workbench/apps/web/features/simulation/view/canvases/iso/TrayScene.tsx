import type { MouseEvent, ReactNode } from "react";
import type {
  CompKind,
  HwLink,
  HwTreeNode,
  InterconnectKind,
} from "@/features/simulation/model/fixtures/c3";

/**
 * TrayScene — a PRESENTATIONAL 2.5D isometric digital twin of ONE tray's board.
 *
 * Reference: an HGX H100 / DGX-style 8-GPU baseboard (and the GB200 compute
 * tray, the CXL/storage memory boxes, head nodes, network trays). The board is
 * drawn as a real PCB slab — silkscreen keep-out, mounting holes, a copper bus
 * spine — and the container's child parts are placed as component PACKAGES by
 * their `comp` kind:
 *
 *     CPU sockets ───────── back edge (host, finned heatsinks)
 *     GPU bank A ─────────┐
 *     NVSwitch spine ─────┤  the on-baseboard all-to-all NVLink crossbar
 *     GPU bank B ─────────┘
 *     DPU / NIC row ─────── front modules (BlueField, ConnectX)
 *     OSFP cages ────────── front-edge optical ports
 *     DIMM / flash field ── memory & storage trays
 *
 * (2) INTERCONNECTS. `container.links` (HwLink[]) is rendered as typed EDGES
 * between the two referenced child regions — resolved by `partId` against the
 * placed packages. Style by kind: nvlink/c2c = solid primary (thick), pcie =
 * thin neutral, osfp = dashed accent-cyan, ib/ethernet = dotted neutral; a small
 * mono label sits at the midpoint. A link whose endpoint is not placed is
 * skipped. The whole layout is recomputed from `parts` every render, so edges
 * follow the packages if the tray's children change.
 *
 * Each placed package is a clickable hit region: plain click selects, Ctrl/⌘+
 * click requests a drill (onPick(partId, ctrl|meta)). Selected → cyan accent
 * outline + glow; hover → neutral white wash. Faces use fixed metal greys (the
 * canvas is always dark); the categorical `--cat-*` palette only tints the top
 * ridge per kind. `--accent` (cyan) is the selection colour and the OSFP edge
 * colour; `--primary` (blue) is the NVLink/C2C edge colour — both are the
 * reserved "edge" hues, never taxonomy. Status hues are never used here.
 *
 * Pure / presentational: no hooks, no state.
 */

/* ----------------------------------------------------------------------- *
 * Isometric projection (2:1). Floor (x,y) at height z (px) → screen (x,y).
 * x → screen-right, y → screen-depth (front), z → up.
 * ----------------------------------------------------------------------- */
const U = 6.6; //  half-tile width
const V = 3.3; //  half-tile height
const OX = 372; // screen origin x for floor (0,0)
const OY = 92; //  screen origin y for floor (0,0)
const BW = 50; //  board width  (floor units)
const BD = 48; //  board depth  (floor units)
const BT = 5; //   board thickness (px)

type P = readonly [number, number];

const pt = (x: number, y: number, z = 0): P => [OX + (x - y) * U, OY + (x + y) * V - z];
const r = (n: number): number => Math.round(n * 100) / 100;
const poly = (pts: readonly P[]): string => pts.map((p) => `${r(p[0])},${r(p[1])}`).join(" ");
const lerp = (a: P, b: P, t: number): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/* ----------------------------------------------------------------------- *
 * Metal greys (fixed — the canvas is always dark).
 * ----------------------------------------------------------------------- */
const STROKE = "#11161d";
const DETAIL = "#0c1117";
const PORT = "#0a0e13";

/* ----------------------------------------------------------------------- *
 * Bands — each comp kind drops into a depth band on the board.
 * ----------------------------------------------------------------------- */
type Band =
  | "cpu"
  | "gpu"
  | "nvswitch"
  | "nic"
  | "memory"
  | "dpu"
  | "osfp"
  | "generic";

const bandOf = (comp?: CompKind): Band => {
  switch (comp) {
    case "gpu":
      return "gpu";
    case "cpu":
      return "cpu";
    case "nvswitch":
      return "nvswitch";
    case "nic":
      return "nic";
    case "dpu":
      return "dpu";
    case "osfp":
      return "osfp";
    case "hbm":
    case "cache":
    case "l2":
    case "register-file":
      return "memory";
    default:
      return "generic";
  }
};

/** Per-band package footprint (floor units) + height (px). */
interface Foot {
  w: number;
  d: number;
  h: number;
}
const FOOT: Record<Band, Foot> = {
  cpu: { w: 9, d: 8, h: 8 },
  gpu: { w: 8.5, d: 7, h: 22 },
  nvswitch: { w: 8, d: 4.5, h: 9 },
  nic: { w: 3.6, d: 3.6, h: 6 },
  memory: { w: 1.6, d: 6.5, h: 14 },
  dpu: { w: 7.5, d: 4.5, h: 7 },
  osfp: { w: 8, d: 2.6, h: 8 },
  generic: { w: 6.5, d: 6.5, h: 11 },
};

/** Ordered slot centres per band — parts fill them left→right / bankA→bankB. */
const row = (n: number, x0: number, x1: number, y: number): P[] =>
  Array.from({ length: n }, (_, i): P => [x0 + ((x1 - x0) * i) / (n - 1), y]);

const SLOTS: Record<Band, P[]> = {
  cpu: [
    [14, 4],
    [36, 4],
    [25, 4],
  ],
  gpu: [
    [6, 13],
    [17, 13],
    [28, 13],
    [39, 13],
    [6, 30],
    [17, 30],
    [28, 30],
    [39, 30],
  ],
  nvswitch: [
    [6, 21.5],
    [17, 21.5],
    [28, 21.5],
    [39, 21.5],
  ],
  nic: row(8, 5, 45, 41),
  memory: [...row(12, 5, 45, 15), ...row(12, 5, 45, 27)],
  dpu: [
    [14, 36],
    [36, 36],
  ],
  osfp: [
    [8, 45],
    [21, 45],
    [34, 45],
    [45, 45],
  ],
  generic: [
    [46, 6],
    [46, 14],
    [46, 22],
    [46, 30],
    [46, 38],
  ],
};

/** Categorical accent per comp kind (off the reserved status / edge hues). */
const COMP_ACCENT: Record<string, string> = {
  gpu: "var(--cat-tool)",
  cpu: "var(--cat-router)",
  nvswitch: "var(--cat-llm)",
  nic: "var(--cat-io)",
  dpu: "var(--cat-memory)",
  osfp: "var(--cat-io)",
  hbm: "var(--cat-memory)",
  cache: "var(--cat-memory)",
  l2: "var(--cat-memory)",
  "register-file": "var(--cat-memory)",
};

/* ----------------------------------------------------------------------- *
 * Cuboid geometry (centre-based cell).
 * ----------------------------------------------------------------------- */
interface Cell {
  cx: number;
  cy: number;
  w: number;
  d: number;
  h: number;
}

interface Geom {
  top: P[];
  left: P[];
  right: P[];
  silhouette: P[];
  /** named corners (t = top z=h, b = base z=0). */
  At: P;
  Bt: P;
  Ct: P;
  Dt: P;
}

function geom(c: Cell): Geom {
  const x0 = c.cx - c.w / 2;
  const x1 = c.cx + c.w / 2;
  const y0 = c.cy - c.d / 2;
  const y1 = c.cy + c.d / 2;
  const At = pt(x0, y0, c.h); // back-left  top
  const Bt = pt(x1, y0, c.h); // back-right top
  const Ct = pt(x1, y1, c.h); // front-right top
  const Dt = pt(x0, y1, c.h); // front-left top
  const Bb = pt(x1, y0, 0);
  const Cb = pt(x1, y1, 0);
  const Db = pt(x0, y1, 0);
  return {
    top: [At, Bt, Ct, Dt],
    left: [Bt, Ct, Cb, Bb], //   x+w face (right-facing)
    right: [Dt, Ct, Cb, Db], //  y+d face (front-left facing)
    silhouette: [At, Bt, Bb, Cb, Db, Dt],
    At,
    Bt,
    Ct,
    Dt,
  };
}

/* ----------------------------------------------------------------------- *
 * Package surface detailing (heatsink fins / port cages).
 * ----------------------------------------------------------------------- */
function topFins(g: Geom, n: number): ReactNode[] {
  const out: ReactNode[] = [];
  for (let k = 1; k <= n; k++) {
    const t = k / (n + 1);
    const a = lerp(g.At, g.Dt, t);
    const b = lerp(g.Bt, g.Ct, t);
    out.push(
      <line key={`fin-${k}`} x1={r(a[0])} y1={r(a[1])} x2={r(b[0])} y2={r(b[1])} stroke={DETAIL} strokeWidth={0.7} />,
    );
  }
  return out;
}

/** Dark port openings on the front (y+d) face — OSFP cages, NIC connectors. */
function frontPorts(g: Geom, n: number): ReactNode[] {
  const [TL, TR, BR, BL] = g.right as [P, P, P, P];
  const bil = (u: number, v: number): P => lerp(lerp(TL, TR, u), lerp(BL, BR, u), v);
  const out: ReactNode[] = [];
  for (let k = 0; k < n; k++) {
    const u0 = (k + 0.18) / n;
    const u1 = (k + 0.82) / n;
    const quad = [bil(u0, 0.18), bil(u1, 0.18), bil(u1, 0.64), bil(u0, 0.64)];
    out.push(
      <polygon key={`port-${k}`} points={poly(quad)} fill={PORT} stroke="#05080c" strokeWidth={0.5} />,
    );
  }
  return out;
}

function partDetail(comp: CompKind | undefined, g: Geom): ReactNode {
  switch (comp) {
    case "gpu":
      return <>{topFins(g, 8)}</>;
    case "cpu":
      return <>{topFins(g, 6)}</>;
    case "nvswitch":
      return <>{topFins(g, 3)}</>;
    case "osfp":
      return <>{frontPorts(g, 2)}</>;
    case "nic":
    case "dpu":
      return <>{frontPorts(g, 1)}</>;
    case "hbm":
    case "cache":
    case "l2":
    case "register-file":
      return (
        <>
          {frontPorts(g, 1)}
          {topFins(g, 1)}
        </>
      );
    default:
      return null;
  }
}

/* ----------------------------------------------------------------------- *
 * Interconnect edge styling (by kind). primary/accent are the reserved
 * EDGE hues — never taxonomy.
 * ----------------------------------------------------------------------- */
interface EdgeStyle {
  stroke: string;
  width: number;
  dash?: string;
  cap: "round" | "butt";
}
// Interconnect hues mirror GpuScene's LINK_COLOR (categorical, OFF the status
// hues); --accent stays reserved for selection only.
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
const KIND_LABEL: Record<InterconnectKind, string> = {
  nvlink: "NVLink",
  c2c: "NVLink-C2C",
  pcie: "PCIe",
  cxl: "CXL",
  osfp: "OSFP",
  ib: "InfiniBand",
  ethernet: "Ethernet",
};

/* ----------------------------------------------------------------------- *
 * Layout — allocate slots to parts; collect cuboids, labels, link anchors.
 * ----------------------------------------------------------------------- */
interface Placed {
  part: HwTreeNode;
  cell: Cell;
}
interface Label {
  part: HwTreeNode;
  x: number;
  y: number;
}

function layout(parts: HwTreeNode[]): {
  placed: Placed[];
  labels: Label[];
  anchors: Record<string, P>;
} {
  const cursor: Record<Band, number> = {
    cpu: 0,
    gpu: 0,
    nvswitch: 0,
    nic: 0,
    memory: 0,
    dpu: 0,
    osfp: 0,
    generic: 0,
  };
  const placed: Placed[] = [];
  const labels: Label[] = [];
  const anchors: Record<string, P> = {};

  const take = (band: Band, foot: Foot): Cell | null => {
    const idx = cursor[band];
    if (idx >= SLOTS[band].length) return null;
    cursor[band] = idx + 1;
    const [cx, cy] = SLOTS[band][idx];
    return { cx, cy, ...foot };
  };

  for (const part of parts) {
    const band = bandOf(part.comp);
    const want = Math.max(1, part.count ?? 1);
    const made: Cell[] = [];
    for (let k = 0; k < want; k++) {
      const cell = take(band, FOOT[band]);
      if (!cell) break;
      made.push(cell);
      placed.push({ part, cell });
    }
    // band exhausted before placing anything → spill one block into generic.
    if (made.length === 0) {
      const cell = take("generic", FOOT.generic);
      if (cell) {
        made.push(cell);
        placed.push({ part, cell });
      }
    }
    if (made.length > 0) {
      const f = made[0];
      const top = pt(f.cx, f.cy, f.h);
      anchors[part.partId] = top;
      labels.push({ part, x: top[0], y: top[1] - 8 });
    }
  }

  return { placed, labels, anchors };
}

/* ----------------------------------------------------------------------- *
 * Small atoms.
 * ----------------------------------------------------------------------- */
function Readout({
  x,
  y,
  text,
  color = "var(--canvas-text)",
  anchor = "middle",
  size = 9,
  bold = false,
}: {
  x: number;
  y: number;
  text: string;
  color?: string;
  anchor?: "start" | "middle" | "end";
  size?: number;
  bold?: boolean;
}) {
  return (
    <text
      x={r(x)}
      y={r(y)}
      textAnchor={anchor}
      className="font-readout"
      style={{
        fill: color,
        stroke: "#0b0f14",
        strokeWidth: 3,
        paintOrder: "stroke",
        fontSize: size,
        fontWeight: bold ? 600 : 400,
        letterSpacing: 0.2,
      }}
    >
      {text}
    </text>
  );
}

/* ----------------------------------------------------------------------- *
 * Component.
 * ----------------------------------------------------------------------- */
export function TrayScene({
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
  const { placed, labels, anchors } = layout(parts);

  // Back-to-front paint order for correct 2.5D occlusion.
  const order = [...placed].sort(
    (a, b) =>
      a.cell.cx + a.cell.cy - (b.cell.cx + b.cell.cy) || a.cell.cx - b.cell.cx,
  );

  const pick = (part: HwTreeNode) => (e: MouseEvent<SVGGElement>) =>
    onPick(part.partId, e.ctrlKey || e.metaKey);

  // Interconnects — resolved against placed packages; skip dangling endpoints.
  const links: HwLink[] = container.links ?? [];
  const drawn = links.filter((l) => anchors[l.from] && anchors[l.to]);
  const kinds = Array.from(new Set(drawn.map((l) => l.kind)));

  // Board slab geometry (z from -BT..0).
  const bAt = pt(0, 0, 0);
  const bBt = pt(BW, 0, 0);
  const bCt = pt(BW, BD, 0);
  const bDt = pt(0, BD, 0);
  const bBb = pt(BW, 0, -BT);
  const bCb = pt(BW, BD, -BT);
  const bDb = pt(0, BD, -BT);
  const boardTop = poly([bAt, bBt, bCt, bDt]);
  const boardRight = poly([bDt, bCt, bCb, bDb]);
  const boardLeft = poly([bBt, bCt, bCb, bBb]);
  const silkscreen = poly([pt(1.5, 1.5, 0), pt(BW - 1.5, 1.5, 0), pt(BW - 1.5, BD - 1.5, 0), pt(1.5, BD - 1.5, 0)]);
  const holes: P[] = [pt(2.6, 2.6, 0), pt(BW - 2.6, 2.6, 0), pt(2.6, BD - 2.6, 0), pt(BW - 2.6, BD - 2.6, 0)];
  // copper bus spine along the NVSwitch row.
  const spineA = pt(2.5, 21.5, 0);
  const spineB = pt(BW - 2.5, 21.5, 0);

  const floorC = pt(BW / 2, BD / 2, 0);

  return (
    <svg
      viewBox="0 0 760 478"
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      className="block h-full w-full"
      role="img"
      aria-label={`Tray board topology for ${container.name}`}
    >
      <defs>
        <filter id="tray-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="2.6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <linearGradient id="tg-top" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3a4653" />
          <stop offset="100%" stopColor="#2b343f" />
        </linearGradient>
        <linearGradient id="tg-left" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#27313c" />
          <stop offset="100%" stopColor="#1b232c" />
        </linearGradient>
        <linearGradient id="tg-right" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1d2530" />
          <stop offset="100%" stopColor="#131922" />
        </linearGradient>
        <linearGradient id="tg-board" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#171e27" />
          <stop offset="100%" stopColor="#0e141b" />
        </linearGradient>
        <radialGradient id="tray-floor" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#000000" stopOpacity="0.42" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect x={0} y={0} width={760} height={478} style={{ fill: "var(--canvas-bg)" }} />

      {/* soft ground shadow under the board */}
      <ellipse cx={r(floorC[0])} cy={r(floorC[1] + 24)} rx={330} ry={96} fill="url(#tray-floor)" />

      {/* board slab */}
      <polygon points={boardLeft} fill="#0a0e13" stroke="#05080c" strokeWidth={1} />
      <polygon points={boardRight} fill="#0c1117" stroke="#05080c" strokeWidth={1} />
      <polygon points={boardTop} fill="url(#tg-board)" stroke="#05080c" strokeWidth={1} />

      {/* PCB detailing: silkscreen keep-out, copper bus spine, mounting holes */}
      <polygon points={silkscreen} fill="none" stroke="#2a3340" strokeWidth={0.8} opacity={0.55} />
      <line
        x1={r(spineA[0])}
        y1={r(spineA[1])}
        x2={r(spineB[0])}
        y2={r(spineB[1])}
        stroke="#2a3340"
        strokeWidth={1.4}
        opacity={0.4}
      />
      {holes.map((h, i) => (
        <g key={`hole-${i}`}>
          <circle cx={r(h[0])} cy={r(h[1])} r={2.6} fill="#070a0e" stroke="#2a3340" strokeWidth={0.9} />
        </g>
      ))}

      {/* title */}
      <Readout x={18} y={26} text={container.name} color="var(--canvas-text-muted)" anchor="start" size={12} bold />
      <Readout
        x={18}
        y={40}
        text={`${container.level} · ${container.trayKind ?? "tray"} topology`}
        color="var(--canvas-text-dim)"
        anchor="start"
        size={9}
      />

      {/* component packages, back-to-front */}
      {order.map(({ part, cell }, i) => {
        const g = geom(cell);
        const selected = part.partId === selectedId;
        const accent = selected
          ? "var(--accent)"
          : (COMP_ACCENT[part.comp ?? ""] ?? "var(--canvas-text-muted)");
        return (
          <g
            key={`${part.partId}-${i}`}
            className="group/cell"
            style={{ cursor: "pointer" }}
            onClick={pick(part)}
          >
            {/* hit backing */}
            <polygon points={poly(g.silhouette)} fill="transparent" style={{ pointerEvents: "all" }} />
            {/* metal faces (back-to-front) */}
            <polygon points={poly(g.right)} fill="url(#tg-right)" stroke={STROKE} strokeWidth={0.7} />
            <polygon points={poly(g.left)} fill="url(#tg-left)" stroke={STROKE} strokeWidth={0.7} />
            <polygon points={poly(g.top)} fill="url(#tg-top)" stroke={STROKE} strokeWidth={0.7} />
            {/* fins / port cages */}
            {partDetail(part.comp, g)}
            {/* categorical / selection ridge along the two back-top edges */}
            <polyline
              points={poly([g.Dt, g.At, g.Bt])}
              fill="none"
              style={{ stroke: accent }}
              strokeWidth={selected ? 2 : 1.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity={0.95}
            />
            {/* hover wash (neutral white) */}
            <polygon
              points={poly(g.top)}
              style={{ fill: "#ffffff" }}
              className="pointer-events-none opacity-0 transition-opacity duration-150 group-hover/cell:opacity-[0.12]"
            />
            <polygon
              points={poly(g.left)}
              style={{ fill: "#ffffff" }}
              className="pointer-events-none opacity-0 transition-opacity duration-150 group-hover/cell:opacity-[0.07]"
            />
            {/* selection outline + glow */}
            {selected && (
              <polygon
                points={poly(g.silhouette)}
                fill="none"
                style={{ stroke: "var(--accent)" }}
                strokeWidth={2.4}
                strokeLinejoin="round"
                filter="url(#tray-glow)"
                className="pointer-events-none"
              />
            )}
          </g>
        );
      })}

      {/* interconnect edges (above the packages) */}
      {drawn.map((l, i) => {
        const a = anchors[l.from];
        const b = anchors[l.to];
        const s = edgeStyle(l.kind);
        const mid: P = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        return (
          <g key={`link-${i}-${l.from}-${l.to}`} className="pointer-events-none">
            {/* drop shadow */}
            <line
              x1={r(a[0])}
              y1={r(a[1] + 1.4)}
              x2={r(b[0])}
              y2={r(b[1] + 1.4)}
              stroke="#0b0f14"
              strokeWidth={s.width + 1.6}
              strokeLinecap="round"
              opacity={0.45}
            />
            <line
              x1={r(a[0])}
              y1={r(a[1])}
              x2={r(b[0])}
              y2={r(b[1])}
              style={{ stroke: s.stroke }}
              strokeWidth={s.width}
              strokeDasharray={s.dash}
              strokeLinecap={s.cap}
              opacity={0.95}
            />
            <circle cx={r(a[0])} cy={r(a[1])} r={2.2} style={{ fill: s.stroke }} stroke="#0b0f14" strokeWidth={0.6} />
            <circle cx={r(b[0])} cy={r(b[1])} r={2.2} style={{ fill: s.stroke }} stroke="#0b0f14" strokeWidth={0.6} />
            {l.label && <Readout x={mid[0]} y={mid[1] - 3} text={l.label} color={s.stroke} size={8.5} />}
          </g>
        );
      })}

      {/* package labels (on top, clickable) */}
      {labels.map(({ part, x, y }) => {
        const selected = part.partId === selectedId;
        const nm = part.name.length > 24 ? `${part.name.slice(0, 23)}…` : part.name;
        const badge = part.count && part.count > 1 ? ` ×${part.count}` : "";
        return (
          <g
            key={`lbl-${part.partId}`}
            style={{ cursor: "pointer" }}
            onClick={pick(part)}
          >
            <Readout
              x={x}
              y={y}
              text={`${nm}${badge}`}
              color={selected ? "var(--accent)" : "var(--canvas-text)"}
              size={9}
              bold={selected}
            />
          </g>
        );
      })}

      {/* interconnect legend (only the kinds present) */}
      {kinds.length > 0 && (
        <g>
          <Readout x={18} y={446 - kinds.length * 14} text="fabric" color="var(--canvas-text-dim)" anchor="start" size={8.5} />
          {kinds.map((k, i) => {
            const s = edgeStyle(k);
            const y = 458 - (kinds.length - 1 - i) * 14;
            return (
              <g key={`leg-${k}`}>
                <line
                  x1={20}
                  y1={y - 3}
                  x2={42}
                  y2={y - 3}
                  style={{ stroke: s.stroke }}
                  strokeWidth={s.width}
                  strokeDasharray={s.dash}
                  strokeLinecap={s.cap}
                />
                <Readout x={48} y={y} text={KIND_LABEL[k]} color="var(--canvas-text-muted)" anchor="start" size={8.5} />
              </g>
            );
          })}
        </g>
      )}
    </svg>
  );
}
