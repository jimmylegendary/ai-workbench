import type { MouseEvent, PointerEvent, ReactNode } from "react";
import type { HwTreeNode } from "@/features/simulation/model/fixtures/c3";

/**
 * GpuScene — a PRESENTATIONAL 2.5D isometric FLOORPLAN of one GPU, drawn from
 * real CoWoS-class layouts (NVIDIA H100 / GH100 and Blackwell B200). It renders
 * at two faithful zoom levels, chosen by the container's `level`:
 *
 * ── PACKAGE level (substrate / interposer floorplan) ──────────────────────
 *   A flat silicon INTERPOSER slab carries the compute DIE(s) CENTRED, flanked
 *   on the two opposite edges by parallel rows of tall HBM stacks (each a short
 *   z-stacked tower at its floorplan spot). NVLink / PCIe PHY chips sit on the
 *   host (back) and interconnect (front) edges. A Blackwell die-pair is drawn as
 *   one centred die with a central NV-HBI seam.
 *
 *       ┌─HBM─┐   ┌──────── compute die(s) ────────┐   ┌─HBM─┐
 *       │ ▢ ▢ │   │   (centred on the interposer)   │   │ ▢ ▢ │
 *       └─────┘   └────────────────────────────────┘   └─────┘
 *
 * ── DIE level (GH100-style block floorplan) ───────────────────────────────
 *   The die outline carries a 2×4 array of GPC/SM tile clusters split by a
 *   central horizontal L2 band (two partitions). Memory controllers + HBM PHYs
 *   run as two vertical strips down the LEFT and RIGHT edges (facing the HBM
 *   rows); NVLink / PCIe PHYs sit on the front / back edges.
 *
 *       ┌─MC─┬─ GPC GPC GPC GPC ─┬─MC─┐   ← top GPC row
 *       │    ├──── L2 ─┊─ L2 ────┤    │   ← split L2 band
 *       │    ├─ GPC GPC GPC GPC ─┤    │   ← bottom GPC row
 *       └────┴──── NVLink PHY ───┴────┘
 *
 * Each placed block is a clickable isometric hit region:
 *   onClick → onPick(part.partId, ctrl/⌘)   (plain = select, modifier = drill)
 * Hover lifts a neutral white wash; the selected block gets a cyan accent
 * outline + glow. Faces use fixed metal greys (the canvas is always dark) shaded
 * by a consistent upper-left light; a thin categorical ridge hints the kind.
 *
 * If the container declares typed `links` between its children, those are drawn
 * (solid, per-kind hue) between the placed block anchors. Any child that does
 * not map onto the floorplan (extra dies, sub-chips, unknown comps) is laid into
 * a tidy reserved row at the front so arbitrary trees never break.
 *
 * Pure / presentational: no hooks, no state. The SVG fills its box via viewBox
 * + width/height 100% + preserveAspectRatio.
 */

/* --------------------------------------------------------------------------- *
 * Isometric projection (2:1). x → screen-right, y → screen-depth, z → height.
 * --------------------------------------------------------------------------- */

const OX = 478; // screen origin x (floor 0,0)
const OY = 196; // screen origin y
const U = 12.6; // half-tile width  (x spread)
const V = 6.3; //  half-tile height (y spread)

type P = readonly [number, number];

/** Project a floor point (x,y) at height z (px) to screen space. */
const pt = (x: number, y: number, z = 0): P => [
  OX + (x - y) * U,
  OY + (x + y) * V - z,
];

const poly = (pts: readonly P[]): string => pts.map((p) => `${p[0]},${p[1]}`).join(" ");

const lerp = (a: P, b: P, t: number): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

const mid = (a: P, b: P): P => lerp(a, b, 0.5);

/** The four corners of a flat top patch [x0,y0]→[x1,y1] at height z. */
const quad = (x0: number, y0: number, x1: number, y1: number, z: number): P[] => [
  pt(x0, y0, z),
  pt(x1, y0, z),
  pt(x1, y1, z),
  pt(x0, y1, z),
];

/** The three visible faces of an axis-aligned box (floor rect × [z0,z1]). */
function boxFaces(x: number, y: number, w: number, d: number, z0: number, z1: number) {
  return {
    top: [pt(x, y, z1), pt(x + w, y, z1), pt(x + w, y + d, z1), pt(x, y + d, z1)],
    left: [pt(x + w, y, z1), pt(x + w, y + d, z1), pt(x + w, y + d, z0), pt(x + w, y, z0)],
    right: [pt(x, y + d, z1), pt(x + w, y + d, z1), pt(x + w, y + d, z0), pt(x, y + d, z0)],
  };
}

/** The outer silhouette (hexagon) of a box — used for hover/selection outlines. */
function boxSilhouette(x: number, y: number, w: number, d: number, z0: number, z1: number): P[] {
  return [
    pt(x, y, z1), //        rear-top
    pt(x + w, y, z1), //    right-top
    pt(x + w, y, z0), //    right-bottom
    pt(x + w, y + d, z0), // front-bottom
    pt(x, y + d, z0), //    left-bottom
    pt(x, y + d, z1), //    left-top
  ];
}

/** Centre of a floor rect at height z (anchor for interconnect links). */
const rectCenter = (x: number, y: number, w: number, d: number, z: number): P =>
  pt(x + w / 2, y + d / 2, z);

/* --------------------------------------------------------------------------- *
 * Metal greys (fixed — the canvas is always dark) + categorical accents.
 * Flat fallbacks; the gradients in <defs> add the upper-left light.
 * --------------------------------------------------------------------------- */

const STROKE = "#11161d";
const DETAIL = "#0c1117";
const SM_STROKE = "#161d26";

/** Block kind → categorical accent ridge (OFF the status hues). */
function accentFor(part: HwTreeNode | undefined): string {
  switch (part?.comp) {
    case "sm":
    case "gpu":
    case "tensor":
      return "var(--cat-tool)";
    case "hbm":
      return "var(--cat-memory)";
    case "l2":
    case "cache":
    case "register-file":
      return "var(--cat-io)";
    case "nvswitch":
    case "nvlink":
    case "pcie":
    case "nic":
    case "dpu":
    case "osfp":
    case "cpu":
      return "var(--cat-router)";
    default:
      return "var(--canvas-text-muted)";
  }
}

/** Interconnect kind → hue (mirrors the tray topology palette; off status hues). */
const LINK_COLOR: Record<string, string> = {
  nvlink: "var(--cat-llm)",
  c2c: "var(--cat-router)",
  pcie: "var(--cat-router)",
  cxl: "var(--cat-memory)",
  osfp: "var(--cat-io)",
  ib: "var(--cat-io)",
  ethernet: "var(--cat-io)",
};

/* --------------------------------------------------------------------------- *
 * Small presentational atoms.
 * --------------------------------------------------------------------------- */

/** A mono readout label with a dark halo (paint-order: stroke) for legibility. */
function Label({
  x,
  y,
  text,
  color = "var(--canvas-text)",
  anchor = "middle",
  size = 13,
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
      x={x}
      y={y}
      textAnchor={anchor}
      className="font-readout"
      style={{
        fill: color,
        stroke: "#0b0f14",
        strokeWidth: 3,
        paintOrder: "stroke",
        fontSize: size,
        fontWeight: bold ? 600 : 400,
        letterSpacing: 0.3,
      }}
    >
      {text}
    </text>
  );
}

/** A cyan selection outline + glow over a set of screen-space polygons. */
function SelectionOutline({ outlines }: { outlines: P[][] }) {
  return (
    <>
      {outlines.map((o, i) => (
        <polygon
          key={`sel-${i}`}
          points={poly(o)}
          fill="none"
          style={{ stroke: "var(--accent)" }}
          strokeWidth={2.6}
          strokeLinejoin="round"
          filter="url(#gpu-glow)"
          className="pointer-events-none"
        />
      ))}
    </>
  );
}

/** Neutral white hover wash (lives inside a `group` wrapper) + optional select. */
function RegionFx({ outlines, selected }: { outlines: P[][]; selected: boolean }) {
  return (
    <>
      {outlines.map((o, i) => (
        <polygon
          key={`hover-${i}`}
          points={poly(o)}
          style={{ fill: "#ffffff" }}
          className="pointer-events-none opacity-0 transition-opacity duration-150 group-hover:opacity-10"
        />
      ))}
      {selected && <SelectionOutline outlines={outlines} />}
    </>
  );
}

/** The three shaded faces of a box (drawn back-to-front, upper-left light). */
function BoxFaces({
  x,
  y,
  w,
  d,
  z0,
  z1,
  top = "url(#g-top)",
}: {
  x: number;
  y: number;
  w: number;
  d: number;
  z0: number;
  z1: number;
  top?: string;
}) {
  const f = boxFaces(x, y, w, d, z0, z1);
  return (
    <>
      <polygon points={poly(f.right)} fill="url(#g-right)" stroke={STROKE} strokeWidth={1} />
      <polygon points={poly(f.left)} fill="url(#g-left)" stroke={STROKE} strokeWidth={1} />
      <polygon points={poly(f.top)} fill={top} stroke={STROKE} strokeWidth={1} />
    </>
  );
}

/** Accent "roof" ridge along the two rear-top edges of a box. */
function BoxRidge({
  x,
  y,
  w,
  d,
  z1,
  color,
  width = 1.8,
}: {
  x: number;
  y: number;
  w: number;
  d: number;
  z1: number;
  color: string;
  width?: number;
}) {
  return (
    <polyline
      points={poly([pt(x, y + d, z1), pt(x, y, z1), pt(x + w, y, z1)])}
      fill="none"
      style={{ stroke: color }}
      strokeWidth={width}
      strokeLinejoin="round"
      strokeLinecap="round"
      opacity={0.95}
    />
  );
}

/** Faint machined-edge highlight along the front-top edges of a box. */
function BoxBevel({ x, y, w, d, z1 }: { x: number; y: number; w: number; d: number; z1: number }) {
  return (
    <polyline
      points={poly([pt(x + w, y, z1), pt(x + w, y + d, z1), pt(x, y + d, z1)])}
      fill="none"
      stroke="#ffffff"
      strokeOpacity={0.08}
      strokeWidth={1}
      strokeLinejoin="round"
      className="pointer-events-none"
    />
  );
}

/* --------------------------------------------------------------------------- *
 * Scene geometry (floor units; z in px of screen height).
 * --------------------------------------------------------------------------- */

// ── PACKAGE level — interposer slab + centred die(s) + flanking HBM rows. ──
const SUB = { x: -10, y: -2, w: 46, d: 28, h: 3 }; // silicon interposer / substrate
const PZ0 = SUB.h; //                                  top of substrate = base of dies + HBM
const PKG_DIE = { x0: 2, x1: 28, y0: 1.5, y1: 22.5, h: 8 }; // centred die band
const PKG_HBM = { sw: 3.6, sd: 4.4, h: 34, gap: 1.1, leftX: -7.5, rightX: 30, startY: 1.8 };
const PKG_IO = { d: 2.6, h: 5, x0: 9, x1: 25 }; // NVLink / PCIe edge chips (x span, back/front)

// ── DIE level — die slab on a thin lip + GPC/SM grid + L2 band + edge PHYs. ──
const DSUB = { x: -2, y: -2, w: 32, d: 28, h: 2 }; // thin package lip under the die
const DZ0 = DSUB.h;
const DIE = { x: 0, y: 0, w: 28, d: 24, h: 7 };
const DIE_TOP = DZ0 + DIE.h; // top surface of the die

// SM lattice fields on the die top (split rear / front by the central L2 band).
const SM_REAR = { x0: 3, y0: 2, x1: 25, y1: 9.4 };
const SM_FRONT = { x0: 3, y0: 14.6, x1: 25, y1: 22 };
const SM_Z = DIE_TOP + 0.4; // tiles ride just above the die surface
const GPCS = 4; //       graphics-processing clusters per field (8 total ≈ GH100)
const GPC_COLS = 4; //   SM columns per GPC
const SM_ROWS = 4; //    SM rows per field

// L2 cache band — a thin slab across the die middle (2 partitions + crossbar).
const L2 = { x: 2.5, y: 10.1, w: 23, d: 3.8, h: 2.2 };
const L2_TOP = DIE_TOP + L2.h;
const L2_SEAM = 0.7; // gap (floor units) splitting the band into two partitions

// Memory-controller + HBM-PHY strips down the LEFT and RIGHT die edges.
const MC = { w: 1.5, h: 2.6, y0: 2, y1: 22, segs: 6, gap: 0.5 };

// NVLink / PCIe PHY strips across the back (host) + front (interconnect) edges.
const PHY = { d: 1.5, h: 2.0, x0: 8, x1: 20 };

// Reserved-row field (screen px) for any child that does not map onto the
// floorplan — laid on a screen-space lattice that scales with the count so
// arbitrary N parts never pile up.
const SAT_FIELD = { x0: 150, x1: 850, y0: 446, y1: 588 };

const num = (s?: string): number | undefined => {
  if (!s) return undefined;
  const n = parseInt(s.replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? n : undefined;
};

const isSm = (p: HwTreeNode): boolean =>
  p.comp === "sm" || p.comp === "tensor" || /sm[\s-]?array|\bsm\b|\bgpc/i.test(p.name);
const isL2 = (p: HwTreeNode): boolean => p.comp === "l2" || /\bl2\b/i.test(p.name);
const isHbm = (p: HwTreeNode): boolean =>
  p.comp === "hbm" || /hbm|memory[\s-]?controller/i.test(p.name);
const isNvlink = (p: HwTreeNode): boolean => p.comp === "nvlink" || /nvlink/i.test(p.name);
const isPcie = (p: HwTreeNode): boolean => p.comp === "pcie" || /pcie/i.test(p.name);
const isDie = (p: HwTreeNode): boolean => p.level === "die" || p.comp === "gpu" || /\bdie\b/i.test(p.name);
const isPair = (p: HwTreeNode | undefined): boolean =>
  !!p && (p.spec?.reticles === "2" || /pair|b200|blackwell/i.test(p.name));

/** Build the SM tiles + GPC group outlines for one lattice field. */
function smField(field: { x0: number; y0: number; x1: number; y1: number }): {
  tiles: P[][];
  gpcs: P[][];
} {
  const fieldW = field.x1 - field.x0;
  const fieldD = field.y1 - field.y0;
  const gpcGap = 0.55; //   alley between GPCs
  const tg = 0.12; //       gap around each SM tile
  const blockW = (fieldW - gpcGap * (GPCS - 1)) / GPCS;
  const colW = blockW / GPC_COLS;
  const rowH = fieldD / SM_ROWS;
  const tiles: P[][] = [];
  const gpcs: P[][] = [];
  for (let g = 0; g < GPCS; g++) {
    const bx0 = field.x0 + g * (blockW + gpcGap);
    gpcs.push(quad(bx0 - 0.12, field.y0 - 0.12, bx0 + blockW + 0.12, field.y1 + 0.12, SM_Z));
    for (let r = 0; r < SM_ROWS; r++) {
      for (let c = 0; c < GPC_COLS; c++) {
        const tx = bx0 + c * colW + tg;
        const ty = field.y0 + r * rowH + tg;
        tiles.push(quad(tx, ty, tx + colW - tg * 2, ty + rowH - tg * 2, SM_Z));
      }
    }
  }
  return { tiles, gpcs };
}

/* --------------------------------------------------------------------------- *
 * Component.
 * --------------------------------------------------------------------------- */

export function GpuScene({
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
  // PACKAGE floorplan at package level; DIE floorplan at die / chip level.
  const mode: "package" | "die" = container.level === "package" ? "package" : "die";

  const pick = (part: HwTreeNode) => (e: MouseEvent<SVGGElement>) =>
    onPick(part.partId, e.ctrlKey || e.metaKey);
  const down = (part: HwTreeNode) =>
    onPartPointerDown ? (e: PointerEvent<SVGGElement>) => onPartPointerDown(part.partId, e) : undefined;
  const up = (part: HwTreeNode) =>
    onPartPointerUp ? (e: PointerEvent<SVGGElement>) => onPartPointerUp(part.partId, e) : undefined;
  const isSel = (id?: string): boolean => !!id && id === selectedId;

  // ---- classify children onto the floorplan slots ---------------------------
  const dies: HwTreeNode[] = [];
  const sms: HwTreeNode[] = [];
  const l2s: HwTreeNode[] = [];
  const hbms: HwTreeNode[] = [];
  const ios: HwTreeNode[] = [];
  const others: HwTreeNode[] = [];
  for (const p of parts) {
    if (mode === "package") {
      if (isDie(p)) dies.push(p);
      else if (isHbm(p)) hbms.push(p);
      else if (isNvlink(p) || isPcie(p)) ios.push(p);
      else others.push(p);
    } else {
      if (isSm(p)) sms.push(p);
      else if (isL2(p)) l2s.push(p);
      else if (isHbm(p)) hbms.push(p);
      else if (isNvlink(p) || isPcie(p)) ios.push(p);
      else others.push(p);
    }
  }
  // Split the io bucket into a back (PCIe / host) chip + a front (NVLink) chip;
  // any extras spill into the reserved row.
  const nvPart = ios.find(isNvlink);
  const pciePart = ios.find((p) => p !== nvPart && isPcie(p));
  for (const p of ios) if (p !== nvPart && p !== pciePart) others.push(p);

  const smPart = sms[0];
  const l2Part = l2s[0];
  const hbmPart = hbms[0];

  // Anchor registry for explicit container.links (by partId and comp glyph).
  const anchorByKey: Record<string, P> = {};
  const reg = (part: HwTreeNode | undefined, p: P): void => {
    if (!part) return;
    anchorByKey[part.partId] = p;
    if (part.comp) anchorByKey[part.comp] = p;
  };

  /* ------------------------------------------------------------------------ *
   * Reusable clickable box (centred-rect cuboid) — dies, io chips, reserved.
   * ------------------------------------------------------------------------ */
  const renderBox = (opts: {
    key: string;
    part?: HwTreeNode;
    x: number;
    y: number;
    w: number;
    d: number;
    z0: number;
    z1: number;
    top?: string;
    extra?: ReactNode;
  }): ReactNode => {
    const { key, part, x, y, w, d, z0, z1, top, extra } = opts;
    const interactive = !!part;
    const sel = interactive && isSel(part.partId);
    const accent = sel ? "var(--accent)" : accentFor(part);
    const sil = boxSilhouette(x, y, w, d, z0, z1);
    return (
      <g
        key={key}
        className={interactive ? "group" : undefined}
        style={interactive ? { cursor: "pointer" } : undefined}
        onClick={interactive ? pick(part) : undefined}
        onPointerDown={interactive ? down(part) : undefined}
        onPointerUp={interactive ? up(part) : undefined}
      >
        {interactive && <polygon points={poly(sil)} fill="transparent" style={{ pointerEvents: "all" }} />}
        <g opacity={interactive ? 1 : 0.4}>
          <BoxFaces x={x} y={y} w={w} d={d} z0={z0} z1={z1} top={top} />
          {extra}
          <BoxRidge x={x} y={y} w={w} d={d} z1={z1} color={accent} />
          <BoxBevel x={x} y={y} w={w} d={d} z1={z1} />
        </g>
        {interactive && <RegionFx outlines={[sil]} selected={sel} />}
      </g>
    );
  };

  /* ======================================================================== *
   * PACKAGE floorplan geometry.
   * ======================================================================== */
  // Centred die row (one slab per die child; ≥1 so an empty package still reads).
  const dieN = Math.max(dies.length, 1);
  const dieGap = 1.6;
  const dieW = (PKG_DIE.x1 - PKG_DIE.x0 - dieGap * (dieN - 1)) / dieN;
  const dieD = PKG_DIE.y1 - PKG_DIE.y0;
  const dieViews = Array.from({ length: dieN }, (_, i) => {
    const x = PKG_DIE.x0 + i * (dieW + dieGap);
    const part = dies[i];
    const pair = isPair(part) || (dies.length === 0 && isPair(container));
    reg(part, rectCenter(x, PKG_DIE.y0, dieW, dieD, PZ0 + PKG_DIE.h));
    return { part, x, pair };
  });

  // HBM stacks — split into two flanking rows (left / right of the die complex).
  const hbmTotal = mode === "package"
    ? Math.min(Math.max(hbmPart?.count ?? (isPair(container) || dies.some(isPair) ? 8 : 6), 2), 8)
    : 0;
  const hbmLeftN = Math.ceil(hbmTotal / 2);
  const hbmRightN = hbmTotal - hbmLeftN;
  type Tower = { x: number; y: number };
  const hbmRow = (x: number, n: number): Tower[] =>
    Array.from({ length: n }, (_, i) => ({ x, y: PKG_HBM.startY + i * (PKG_HBM.sd + PKG_HBM.gap) }));
  const hbmLeft = hbmRow(PKG_HBM.leftX, hbmLeftN);
  const hbmRight = hbmRow(PKG_HBM.rightX, hbmRightN);
  const hbmTowers = [...hbmLeft, ...hbmRight];
  const hbmInteractive = !!hbmPart;
  const hbmSel = hbmInteractive && isSel(hbmPart.partId);
  const hbmAccent = hbmSel ? "var(--accent)" : accentFor(hbmPart);
  if (hbmPart && hbmTowers[0]) {
    const t = hbmTowers[0];
    reg(hbmPart, rectCenter(t.x, t.y, PKG_HBM.sw, PKG_HBM.sd, PZ0 + PKG_HBM.h));
  }
  const hbmSilhouettes = hbmTowers.map((t) =>
    boxSilhouette(t.x, t.y, PKG_HBM.sw, PKG_HBM.sd, PZ0, PZ0 + PKG_HBM.h),
  );

  const renderHbmTowers = (towers: Tower[], keyPrefix: string): ReactNode => (
    <g
      className={hbmInteractive ? "group" : undefined}
      style={hbmInteractive ? { cursor: "pointer" } : undefined}
      onClick={hbmPart ? pick(hbmPart) : undefined}
      onPointerDown={hbmPart ? down(hbmPart) : undefined}
      onPointerUp={hbmPart ? up(hbmPart) : undefined}
    >
      {towers.map((s, i) => {
        const f = boxFaces(s.x, s.y, PKG_HBM.sw, PKG_HBM.sd, PZ0, PZ0 + PKG_HBM.h);
        const sil = boxSilhouette(s.x, s.y, PKG_HBM.sw, PKG_HBM.sd, PZ0, PZ0 + PKG_HBM.h);
        const striations = [0.14, 0.28, 0.42, 0.56, 0.7, 0.84].map((t, k) => {
          const lr0 = lerp(f.right[0], f.right[3], t);
          const lr1 = lerp(f.right[1], f.right[2], t);
          const ll0 = lerp(f.left[0], f.left[3], t);
          const ll1 = lerp(f.left[1], f.left[2], t);
          return (
            <g key={`${keyPrefix}-st-${i}-${k}`}>
              <line x1={lr0[0]} y1={lr0[1]} x2={lr1[0]} y2={lr1[1]} stroke={DETAIL} strokeWidth={0.7} />
              <line x1={ll0[0]} y1={ll0[1]} x2={ll1[0]} y2={ll1[1]} stroke={DETAIL} strokeWidth={0.7} />
            </g>
          );
        });
        return (
          <g key={`${keyPrefix}-${i}`} opacity={hbmInteractive ? 1 : 0.4}>
            {hbmInteractive && <polygon points={poly(sil)} fill="transparent" style={{ pointerEvents: "all" }} />}
            <BoxFaces x={s.x} y={s.y} w={PKG_HBM.sw} d={PKG_HBM.sd} z0={PZ0} z1={PZ0 + PKG_HBM.h} />
            {striations}
            <BoxRidge x={s.x} y={s.y} w={PKG_HBM.sw} d={PKG_HBM.sd} z1={PZ0 + PKG_HBM.h} color={hbmAccent} />
            <BoxBevel x={s.x} y={s.y} w={PKG_HBM.sw} d={PKG_HBM.sd} z1={PZ0 + PKG_HBM.h} />
          </g>
        );
      })}
      {hbmInteractive && (
        <RegionFx
          outlines={towers.map((s) => boxSilhouette(s.x, s.y, PKG_HBM.sw, PKG_HBM.sd, PZ0, PZ0 + PKG_HBM.h))}
          selected={false}
        />
      )}
    </g>
  );

  // Package io chips: PCIe on the back (host) edge, NVLink on the front edge.
  const ioBackY = PKG_DIE.y0 - PKG_IO.d - 0.6;
  const ioFrontY = PKG_DIE.y1 + 0.6;
  const ioW = PKG_IO.x1 - PKG_IO.x0;
  if (pciePart) reg(pciePart, rectCenter(PKG_IO.x0, ioBackY, ioW, PKG_IO.d, PZ0 + PKG_IO.h));
  if (nvPart) reg(nvPart, rectCenter(PKG_IO.x0, ioFrontY, ioW, PKG_IO.d, PZ0 + PKG_IO.h));

  /* ======================================================================== *
   * DIE floorplan geometry.
   * ======================================================================== */
  const rear = smField(SM_REAR);
  const front = smField(SM_FRONT);
  const smTiles = [...rear.tiles, ...front.tiles];
  const smGpcs = [...rear.gpcs, ...front.gpcs];
  const smRearQuad = quad(SM_REAR.x0, SM_REAR.y0, SM_REAR.x1, SM_REAR.y1, SM_Z);
  const smFrontQuad = quad(SM_FRONT.x0, SM_FRONT.y0, SM_FRONT.x1, SM_FRONT.y1, SM_Z);
  const smOutlines = [smRearQuad, smFrontQuad];
  const smInteractive = !!smPart;
  const smSel = smInteractive && isSel(smPart.partId);
  const smAccent = smSel ? "var(--accent)" : accentFor(smPart);
  const smCount = smPart?.count ?? num(smPart?.spec.sms);
  reg(
    smPart,
    rectCenter(SM_REAR.x0, SM_REAR.y0, SM_REAR.x1 - SM_REAR.x0, SM_REAR.y1 - SM_REAR.y0, SM_Z),
  );

  // L2 — two partitions split by a central seam.
  const l2HalfW = (L2.w - L2_SEAM) / 2;
  const l2Left = { x: L2.x, w: l2HalfW };
  const l2Right = { x: L2.x + l2HalfW + L2_SEAM, w: l2HalfW };
  const l2Silhouettes = [
    boxSilhouette(l2Left.x, L2.y, l2Left.w, L2.d, DIE_TOP, L2_TOP),
    boxSilhouette(l2Right.x, L2.y, l2Right.w, L2.d, DIE_TOP, L2_TOP),
  ];
  const l2Interactive = !!l2Part;
  const l2Sel = l2Interactive && isSel(l2Part.partId);
  const l2Accent = l2Sel ? "var(--accent)" : accentFor(l2Part);
  reg(l2Part, rectCenter(L2.x, L2.y, L2.w, L2.d, L2_TOP));

  // Memory-controller / HBM-PHY edge strips (left + right), mapped to the hbm part.
  const mcSegD = (MC.y1 - MC.y0 - MC.gap * (MC.segs - 1)) / MC.segs;
  type Seg = { x: number; y: number };
  const mcSegs = (x: number): Seg[] =>
    Array.from({ length: MC.segs }, (_, i) => ({ x, y: MC.y0 + i * (mcSegD + MC.gap) }));
  const mcLeft = mcSegs(DIE.x);
  const mcRight = mcSegs(DIE.x + DIE.w - MC.w);
  const mcAll = [...mcLeft, ...mcRight];
  const mcPart = mode === "die" ? hbmPart : undefined;
  const mcInteractive = !!mcPart;
  const mcSel = mcInteractive && isSel(mcPart.partId);
  const mcAccent = mcSel ? "var(--accent)" : accentFor(mcPart);
  if (mcPart && mcLeft[0]) reg(mcPart, rectCenter(mcLeft[0].x, MC.y0, MC.w, MC.y1 - MC.y0, DIE_TOP + MC.h));
  const mcSilhouettes = mcAll.map((s) => boxSilhouette(s.x, s.y, MC.w, mcSegD, DIE_TOP, DIE_TOP + MC.h));

  // Die-level io PHY strips: PCIe back edge, NVLink front edge.
  const phyW = PHY.x1 - PHY.x0;
  const phyBack = { x: PHY.x0, y: DIE.y };
  const phyFront = { x: PHY.x0, y: DIE.y + DIE.d - PHY.d };
  const diePcie = mode === "die" ? pciePart : undefined;
  const dieNv = mode === "die" ? nvPart : undefined;
  if (diePcie) reg(diePcie, rectCenter(phyBack.x, phyBack.y, phyW, PHY.d, DIE_TOP + PHY.h));
  if (dieNv) reg(dieNv, rectCenter(phyFront.x, phyFront.y, phyW, PHY.d, DIE_TOP + PHY.h));

  /* ======================================================================== *
   * Reserved row — children that do not map onto the floorplan.
   * ======================================================================== */
  const satN = others.length;
  const satCols = Math.max(1, Math.min(satN, Math.ceil(Math.sqrt(satN * 1.7))));
  const satRows = Math.max(1, Math.ceil(satN / satCols));
  const satGapX = satCols > 1 ? (SAT_FIELD.x1 - SAT_FIELD.x0) / (satCols - 1) : 0;
  const satGapY = satRows > 1 ? (SAT_FIELD.y1 - SAT_FIELD.y0) / (satRows - 1) : 0;
  const satPitch = Math.min(
    satCols > 1 ? satGapX : SAT_FIELD.x1 - SAT_FIELD.x0,
    satRows > 1 ? satGapY : SAT_FIELD.y1 - SAT_FIELD.y0,
  );
  const satW = Math.max(1, Math.min(5, (satPitch * 0.62) / (2 * U)));
  const satD = satW;
  const satH = Math.max(2.5, Math.min(7, satW * 1.4));
  const satLabelSize = satN > 16 ? 9 : satN > 8 ? 10 : 11;
  const satViews = others
    .map((part, i) => {
      const c = i % satCols;
      const r = Math.floor(i / satCols);
      const itemsInRow = r < satRows - 1 ? satCols : satN - satCols * (satRows - 1);
      const rowShift = ((satCols - itemsInRow) / 2) * satGapX;
      const screenX = satCols > 1 ? SAT_FIELD.x0 + c * satGapX + rowShift : (SAT_FIELD.x0 + SAT_FIELD.x1) / 2;
      const screenY = satRows > 1 ? SAT_FIELD.y0 + r * satGapY : (SAT_FIELD.y0 + SAT_FIELD.y1) / 2;
      const dxy = (screenX - OX) / U;
      const sxy = (screenY - OY + satH) / V;
      const cxF = (dxy + sxy) / 2;
      const cyF = (sxy - dxy) / 2;
      const x = cxF - satW / 2;
      const y = cyF - satD / 2;
      reg(part, rectCenter(x, y, satW, satD, satH));
      return { part, x, y, depth: x + y };
    })
    .sort((a, b) => a.depth - b.depth);

  // ---- explicit typed interconnects from container.links --------------------
  const containerLinks = (container.links ?? []).flatMap((lk, i) => {
    const a = anchorByKey[lk.from];
    const b = anchorByKey[lk.to];
    if (!a || !b) return [];
    return [{ a, b, color: LINK_COLOR[lk.kind] ?? "var(--canvas-text-muted)", label: lk.label, key: `lk-${i}` }];
  });

  // ---- legend rows (mode-appropriate) ---------------------------------------
  const legend =
    mode === "package"
      ? [
          { c: "var(--cat-tool)", t: "compute die(s)" },
          { c: "var(--cat-memory)", t: "HBM stacks (global)" },
          { c: "var(--cat-router)", t: "NVLink / PCIe PHY" },
        ]
      : [
          { c: "var(--cat-tool)", t: "GPC / SM array" },
          { c: "var(--cat-io)", t: "L2 cache (split band)" },
          { c: "var(--cat-memory)", t: "mem controllers / HBM PHY" },
          { c: "var(--cat-router)", t: "NVLink / PCIe PHY" },
        ];

  return (
    <svg
      viewBox="0 0 1000 640"
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      className="block h-full w-full"
      role="img"
      aria-label={`GPU ${mode} floorplan for ${container.name}`}
    >
      <defs>
        <filter id="gpu-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        {/* consistent upper-left light: top brightest, left mid, right darkest */}
        <linearGradient id="g-top" x1="0" y1="0" x2="0.55" y2="1">
          <stop offset="0%" stopColor="#3b4655" />
          <stop offset="100%" stopColor="#2b343f" />
        </linearGradient>
        <linearGradient id="g-left" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#283340" />
          <stop offset="100%" stopColor="#1b232d" />
        </linearGradient>
        <linearGradient id="g-right" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1d2631" />
          <stop offset="100%" stopColor="#121922" />
        </linearGradient>
        <linearGradient id="g-die-top" x1="0" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="#2a323b" />
          <stop offset="100%" stopColor="#1f262e" />
        </linearGradient>
        <linearGradient id="g-sub-top" x1="0" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="#222a33" />
          <stop offset="100%" stopColor="#181e25" />
        </linearGradient>
        <linearGradient id="g-sm" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor="#43505f" />
          <stop offset="100%" stopColor="#323d4a" />
        </linearGradient>
        <radialGradient id="gpu-floor" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#000000" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect x={0} y={0} width={1000} height={640} style={{ fill: "var(--canvas-bg)" }} />

      {/* soft ground shadow under the package */}
      <ellipse cx={500} cy={500} rx={360} ry={90} fill="url(#gpu-floor)" />

      {/* ============================ PACKAGE FLOORPLAN ===================== */}
      {mode === "package" && (
        <>
          {/* interposer / substrate slab (furthest, bottom) */}
          <BoxFaces x={SUB.x} y={SUB.y} w={SUB.w} d={SUB.d} z0={0} z1={SUB.h} top="url(#g-sub-top)" />
          <BoxBevel x={SUB.x} y={SUB.y} w={SUB.w} d={SUB.d} z1={SUB.h} />

          {/* LEFT HBM row — behind the die (painted first) */}
          {renderHbmTowers(hbmLeft, "hbmL")}

          {/* PCIe / host PHY chip on the back edge */}
          {renderBox({
            key: "io-back",
            part: pciePart,
            x: PKG_IO.x0,
            y: ioBackY,
            w: ioW,
            d: PKG_IO.d,
            z0: PZ0,
            z1: PZ0 + PKG_IO.h,
          })}

          {/* centred compute die(s) */}
          {dieViews.map(({ part, x, pair }, i) => {
            const seamX = x + dieW / 2;
            const extra = pair ? (
              <line
                x1={pt(seamX, PKG_DIE.y0, PZ0 + PKG_DIE.h)[0]}
                y1={pt(seamX, PKG_DIE.y0, PZ0 + PKG_DIE.h)[1]}
                x2={pt(seamX, PKG_DIE.y0 + dieD, PZ0 + PKG_DIE.h)[0]}
                y2={pt(seamX, PKG_DIE.y0 + dieD, PZ0 + PKG_DIE.h)[1]}
                stroke="var(--cat-router)"
                strokeWidth={1.4}
                strokeDasharray="3 2"
                opacity={0.85}
              />
            ) : null;
            return renderBox({
              key: `die-${i}`,
              part,
              x,
              y: PKG_DIE.y0,
              w: dieW,
              d: dieD,
              z0: PZ0,
              z1: PZ0 + PKG_DIE.h,
              top: "url(#g-die-top)",
              extra,
            });
          })}

          {/* NVLink PHY chip on the front edge */}
          {renderBox({
            key: "io-front",
            part: nvPart,
            x: PKG_IO.x0,
            y: ioFrontY,
            w: ioW,
            d: PKG_IO.d,
            z0: PZ0,
            z1: PZ0 + PKG_IO.h,
          })}

          {/* RIGHT HBM row — in front of the die (painted last) */}
          {renderHbmTowers(hbmRight, "hbmR")}

          {/* HBM selection outline over both rows */}
          {hbmInteractive && hbmSel && <SelectionOutline outlines={hbmSilhouettes} />}

          {/* ---- labels ---- */}
          {dieViews.map(({ part, x, pair }, i) =>
            part ? (
              <Label
                key={`die-lbl-${i}`}
                x={pt(x + dieW / 2, PKG_DIE.y0, PZ0 + PKG_DIE.h)[0]}
                y={pt(x + dieW / 2, PKG_DIE.y0, PZ0 + PKG_DIE.h)[1] - 10}
                text={`${part.name}${part.count && part.count > 1 ? ` ×${part.count}` : ""}${pair ? "  ·  NV-HBI" : ""}`}
                color={isSel(part.partId) ? "var(--canvas-text)" : "var(--canvas-text-muted)"}
                size={12}
                bold={isSel(part.partId)}
              />
            ) : null,
          )}
          {hbmRight[0] && (
            <Label
              x={pt(PKG_HBM.rightX + PKG_HBM.sw, PKG_HBM.startY, PZ0 + PKG_HBM.h)[0] + 6}
              y={pt(PKG_HBM.rightX + PKG_HBM.sw, PKG_HBM.startY, PZ0 + PKG_HBM.h)[1] - 6}
              text={hbmPart ? `${hbmPart.name}${hbmPart.count ? ` ×${hbmPart.count}` : ""}` : "HBM (global)"}
              color={hbmPart ? "var(--canvas-text)" : "var(--canvas-text-dim)"}
              anchor="start"
              size={11}
              bold={!!hbmPart && isSel(hbmPart.partId)}
            />
          )}
          {pciePart && (
            <Label
              x={pt(PKG_IO.x0 + ioW / 2, ioBackY, PZ0 + PKG_IO.h)[0]}
              y={pt(PKG_IO.x0 + ioW / 2, ioBackY, PZ0 + PKG_IO.h)[1] - 8}
              text={pciePart.name}
              color={isSel(pciePart.partId) ? "var(--canvas-text)" : "var(--canvas-text-muted)"}
              size={11}
              bold={isSel(pciePart.partId)}
            />
          )}
          {nvPart && (
            <Label
              x={pt(PKG_IO.x0 + ioW / 2, ioFrontY + PKG_IO.d, PZ0 + PKG_IO.h)[0]}
              y={pt(PKG_IO.x0 + ioW / 2, ioFrontY + PKG_IO.d, PZ0 + PKG_IO.h)[1] + 14}
              text={nvPart.name}
              color={isSel(nvPart.partId) ? "var(--canvas-text)" : "var(--canvas-text-muted)"}
              size={11}
              bold={isSel(nvPart.partId)}
            />
          )}
        </>
      )}

      {/* ============================== DIE FLOORPLAN ====================== */}
      {mode === "die" && (
        <>
          {/* thin package lip + the die slab */}
          <BoxFaces x={DSUB.x} y={DSUB.y} w={DSUB.w} d={DSUB.d} z0={0} z1={DSUB.h} top="url(#g-sub-top)" />
          <BoxBevel x={DSUB.x} y={DSUB.y} w={DSUB.w} d={DSUB.d} z1={DSUB.h} />
          <BoxFaces x={DIE.x} y={DIE.y} w={DIE.w} d={DIE.d} z0={DZ0} z1={DIE_TOP} top="url(#g-die-top)" />
          <BoxBevel x={DIE.x} y={DIE.y} w={DIE.w} d={DIE.d} z1={DIE_TOP} />

          {/* memory controllers + HBM PHYs down the left + right edges */}
          <g
            className={mcInteractive ? "group" : undefined}
            style={mcInteractive ? { cursor: "pointer" } : undefined}
            onClick={mcPart ? pick(mcPart) : undefined}
            onPointerDown={mcPart ? down(mcPart) : undefined}
            onPointerUp={mcPart ? up(mcPart) : undefined}
          >
            {mcInteractive &&
              mcSilhouettes.map((sil, i) => (
                <polygon key={`mc-hit-${i}`} points={poly(sil)} fill="transparent" style={{ pointerEvents: "all" }} />
              ))}
            <g opacity={mcInteractive ? 1 : 0.4}>
              {mcAll.map((s, i) => (
                <g key={`mc-${i}`}>
                  <BoxFaces x={s.x} y={s.y} w={MC.w} d={mcSegD} z0={DIE_TOP} z1={DIE_TOP + MC.h} />
                  <BoxRidge x={s.x} y={s.y} w={MC.w} d={mcSegD} z1={DIE_TOP + MC.h} color={mcAccent} width={1.2} />
                </g>
              ))}
            </g>
            {mcInteractive && <RegionFx outlines={mcSilhouettes} selected={mcSel} />}
          </g>

          {/* GPC / SM lattice (rear + front fields) */}
          <g
            className={smInteractive ? "group" : undefined}
            style={smInteractive ? { cursor: "pointer" } : undefined}
            onClick={smPart ? pick(smPart) : undefined}
            onPointerDown={smPart ? down(smPart) : undefined}
            onPointerUp={smPart ? up(smPart) : undefined}
          >
            {smInteractive &&
              smOutlines.map((o, i) => (
                <polygon key={`sm-hit-${i}`} points={poly(o)} fill="transparent" style={{ pointerEvents: "all" }} />
              ))}
            <g opacity={smInteractive ? 1 : 0.4}>
              {smGpcs.map((g, i) => (
                <polygon
                  key={`gpc-${i}`}
                  points={poly(g)}
                  fill="none"
                  style={{ stroke: smAccent }}
                  strokeWidth={0.7}
                  opacity={0.35}
                />
              ))}
              {smTiles.map((t, i) => (
                <polygon key={`sm-${i}`} points={poly(t)} fill="url(#g-sm)" stroke={SM_STROKE} strokeWidth={0.5} />
              ))}
              {smOutlines.map((o, i) => (
                <polyline
                  key={`sm-ridge-${i}`}
                  points={poly([o[0], o[1]])}
                  fill="none"
                  style={{ stroke: smAccent }}
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  opacity={0.95}
                />
              ))}
            </g>
            {smInteractive && <RegionFx outlines={smOutlines} selected={smSel} />}
          </g>

          {/* L2 cache — two partitions split by a central seam */}
          <g
            className={l2Interactive ? "group" : undefined}
            style={l2Interactive ? { cursor: "pointer" } : undefined}
            onClick={l2Part ? pick(l2Part) : undefined}
            onPointerDown={l2Part ? down(l2Part) : undefined}
            onPointerUp={l2Part ? up(l2Part) : undefined}
          >
            {l2Interactive &&
              l2Silhouettes.map((sil, i) => (
                <polygon key={`l2-hit-${i}`} points={poly(sil)} fill="transparent" style={{ pointerEvents: "all" }} />
              ))}
            <g opacity={l2Interactive ? 1 : 0.4}>
              {[l2Left, l2Right].map((h, i) => (
                <g key={`l2h-${i}`}>
                  <BoxFaces x={h.x} y={L2.y} w={h.w} d={L2.d} z0={DIE_TOP} z1={L2_TOP} />
                  {[0.34, 0.68].map((t, k) => {
                    const a = lerp(pt(h.x, L2.y, L2_TOP), pt(h.x + h.w, L2.y, L2_TOP), t);
                    const b = lerp(pt(h.x, L2.y + L2.d, L2_TOP), pt(h.x + h.w, L2.y + L2.d, L2_TOP), t);
                    return <line key={`l2t-${i}-${k}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={DETAIL} strokeWidth={0.6} />;
                  })}
                  <BoxRidge x={h.x} y={L2.y} w={h.w} d={L2.d} z1={L2_TOP} color={l2Accent} width={1.4} />
                  <BoxBevel x={h.x} y={L2.y} w={h.w} d={L2.d} z1={L2_TOP} />
                </g>
              ))}
            </g>
            {l2Interactive && <RegionFx outlines={l2Silhouettes} selected={l2Sel} />}
          </g>

          {/* NVLink / PCIe PHY strips on the front / back edges */}
          {renderBox({
            key: "die-pcie",
            part: diePcie,
            x: phyBack.x,
            y: phyBack.y,
            w: phyW,
            d: PHY.d,
            z0: DIE_TOP,
            z1: DIE_TOP + PHY.h,
          })}
          {renderBox({
            key: "die-nvlink",
            part: dieNv,
            x: phyFront.x,
            y: phyFront.y,
            w: phyW,
            d: PHY.d,
            z0: DIE_TOP,
            z1: DIE_TOP + PHY.h,
          })}

          {/* ---- labels ---- */}
          <Label
            x={pt(SM_REAR.x0, SM_REAR.y0, SM_Z)[0] + 6}
            y={pt(SM_REAR.x0, SM_REAR.y0, SM_Z)[1] - 8}
            text={smPart ? `${smPart.name}${smCount ? ` ×${smCount}` : ""}` : "GPC / SM array"}
            color={smPart ? "var(--canvas-text)" : "var(--canvas-text-dim)"}
            anchor="start"
            size={13}
            bold={smInteractive && smSel}
          />
          <Label
            x={pt(L2.x + L2.w, L2.y + L2.d, L2_TOP)[0] + 8}
            y={pt(L2.x + L2.w, L2.y + L2.d, L2_TOP)[1] + 2}
            text={l2Part ? `${l2Part.name}${l2Part.spec.size ? ` · ${l2Part.spec.size}` : ""}` : "L2 cache"}
            color={l2Part ? "var(--canvas-text)" : "var(--canvas-text-dim)"}
            anchor="start"
            size={12}
            bold={l2Interactive && l2Sel}
          />
          {mcLeft[0] && (
            <Label
              x={pt(DIE.x, MC.y1, DIE_TOP + MC.h)[0] - 6}
              y={pt(DIE.x, MC.y1, DIE_TOP + MC.h)[1] + 6}
              text={mcPart ? `${mcPart.name} · mem ctrl` : "mem controllers"}
              color={mcPart ? "var(--canvas-text)" : "var(--canvas-text-dim)"}
              anchor="end"
              size={11}
              bold={mcInteractive && mcSel}
            />
          )}
          {diePcie && (
            <Label
              x={pt(phyBack.x + phyW / 2, phyBack.y, DIE_TOP + PHY.h)[0]}
              y={pt(phyBack.x + phyW / 2, phyBack.y, DIE_TOP + PHY.h)[1] - 8}
              text={diePcie.name}
              color={isSel(diePcie.partId) ? "var(--canvas-text)" : "var(--canvas-text-muted)"}
              size={11}
              bold={isSel(diePcie.partId)}
            />
          )}
          {dieNv && (
            <Label
              x={pt(phyFront.x + phyW / 2, phyFront.y + PHY.d, DIE_TOP + PHY.h)[0]}
              y={pt(phyFront.x + phyW / 2, phyFront.y + PHY.d, DIE_TOP + PHY.h)[1] + 14}
              text={dieNv.name}
              color={isSel(dieNv.partId) ? "var(--canvas-text)" : "var(--canvas-text-muted)"}
              size={11}
              bold={isSel(dieNv.partId)}
            />
          )}
        </>
      )}

      {/* ---- explicit typed interconnects from container.links (if any) ---- */}
      {containerLinks.length > 0 && (
        <g className="pointer-events-none">
          {containerLinks.map((l) => (
            <g key={l.key}>
              <line x1={l.a[0]} y1={l.a[1]} x2={l.b[0]} y2={l.b[1]} style={{ stroke: l.color }} strokeWidth={1.6} opacity={0.6} />
              <circle cx={l.a[0]} cy={l.a[1]} r={2.1} style={{ fill: l.color }} opacity={0.9} />
              <circle cx={l.b[0]} cy={l.b[1]} r={2.1} style={{ fill: l.color }} opacity={0.9} />
              {l.label && (
                <Label x={mid(l.a, l.b)[0]} y={mid(l.a, l.b)[1] - 4} text={l.label} color="var(--canvas-text-muted)" size={10} />
              )}
            </g>
          ))}
        </g>
      )}

      {/* ---- reserved row: children that do not map onto the floorplan ---- */}
      {satViews.length > 0 && (
        <Label
          x={SAT_FIELD.x0}
          y={SAT_FIELD.y0 - satH - 18}
          text="other parts"
          color="var(--canvas-text-dim)"
          anchor="start"
          size={11}
        />
      )}
      {satViews.map(({ part, x, y }) => {
        const sel = isSel(part.partId);
        const sil = boxSilhouette(x, y, satW, satD, 0, satH);
        const accent = sel ? "var(--accent)" : accentFor(part);
        const top = pt(x + satW / 2, y + satD, satH);
        return (
          <g
            key={part.partId}
            className="group"
            style={{ cursor: "pointer" }}
            onClick={pick(part)}
            onPointerDown={down(part)}
            onPointerUp={up(part)}
          >
            <polygon points={poly(sil)} fill="transparent" style={{ pointerEvents: "all" }} />
            <BoxFaces x={x} y={y} w={satW} d={satD} z0={0} z1={satH} />
            <BoxRidge x={x} y={y} w={satW} d={satD} z1={satH} color={accent} />
            <BoxBevel x={x} y={y} w={satW} d={satD} z1={satH} />
            <RegionFx outlines={[sil]} selected={sel} />
            <Label
              x={top[0]}
              y={top[1] + 14}
              text={`${part.name}${part.count && part.count > 1 ? ` ×${part.count}` : ""}`}
              color={sel ? "var(--canvas-text)" : "var(--canvas-text-muted)"}
              size={satLabelSize}
            />
          </g>
        );
      })}

      {/* ---- title + legend ---- */}
      <Label x={500} y={30} text={`${container.name}  ·  ${container.level}`} size={15} bold />
      <g>
        {legend.map((row, i) => (
          <g key={row.t} transform={`translate(28, ${52 + i * 18})`}>
            <rect x={0} y={-8} width={9} height={9} rx={2} style={{ fill: row.c }} />
            <Label x={16} y={0} text={row.t} color="var(--canvas-text-muted)" anchor="start" size={11} />
          </g>
        ))}
      </g>
    </svg>
  );
}
