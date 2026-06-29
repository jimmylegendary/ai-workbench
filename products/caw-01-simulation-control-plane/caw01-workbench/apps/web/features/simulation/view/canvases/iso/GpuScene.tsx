import type { MouseEvent } from "react";
import type { HwTreeNode } from "@/features/simulation/model/fixtures/c3";

/**
 * GpuScene — a PRESENTATIONAL 2.5D isometric "die shot" of one GPU's interior,
 * drawn the way a CUDA memory-hierarchy / floorplan diagram reads. The silhouette
 * is grounded in a real CoWoS-class package (e.g. H100): a silicon INTERPOSER /
 * substrate carrying a central compute DIE plus tall HBM memory stacks soldered
 * right next to it.
 *
 *   ┌── HBM stacks (global) ──┐   compute die   ┌── HBM stacks (global) ──┐
 *   │   layered DRAM dies     │  ┌───────────┐  │   layered DRAM dies     │
 *   └─────────────────────────┘  │ SM lattice│  └─────────────────────────┘
 *                                │  (8 GPCs) │
 *                                │ ── L2 ── │  ← chip-wide last-level cache band
 *                                │ SM lattice│
 *                                └───────────┘
 *
 * The hierarchy (global HBM → L2 → SM) is drawn as faint dotted TIER links over
 * the top so the three memory tiers read at a glance. If the container declares
 * typed `links` between its children, those are drawn too (solid, per-kind hue).
 *
 * Used by Canvas 3 when the drill is INSIDE a gpu package / die / compute-chip;
 * it is richest at the compute-chip level (sm-array + l2 + hbm are direct kids).
 *
 * Each child part becomes a clickable isometric <g> hit region:
 *   onClick → onPick(part.partId, ctrl/⌘)   (plain = select, modifier = drill)
 * Hover lifts a neutral white wash; the selected part gets a cyan accent outline
 * + glow. Faces use fixed metal greys (the canvas is always dark) shaded by a
 * consistent upper-left light; a thin categorical ridge hints the block kind
 * (off the reserved status hues).
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

/** Centre of a floor rect at height z (anchor for tier / interconnect links). */
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
  opacity = 1,
}: {
  x: number;
  y: number;
  w: number;
  d: number;
  z0: number;
  z1: number;
  top?: string;
  opacity?: number;
}) {
  const f = boxFaces(x, y, w, d, z0, z1);
  return (
    <g opacity={opacity}>
      <polygon points={poly(f.right)} fill="url(#g-right)" stroke={STROKE} strokeWidth={1} />
      <polygon points={poly(f.left)} fill="url(#g-left)" stroke={STROKE} strokeWidth={1} />
      <polygon points={poly(f.top)} fill={top} stroke={STROKE} strokeWidth={1} />
    </g>
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
 * Scene geometry constants (floor units; z in px of screen height).
 * --------------------------------------------------------------------------- */

// Package substrate / silicon interposer (everything sits on this).
const SUB = { x: -9, y: -2, w: 46, d: 28, h: 3 };
const Z0 = SUB.h; // top of the substrate = base of the die + HBM stacks

// Compute die slab, centred on the substrate.
const DIE = { x: 0, y: 0, w: 28, d: 24, h: 8 };
const DIE_TOP = Z0 + DIE.h; // top surface of the die

// SM lattice fields on the die top (split rear / front by the central L2 band).
const SM_REAR = { x0: 2, y0: 1.8, x1: 26, y1: 9.4 };
const SM_FRONT = { x0: 2, y0: 14.6, x1: 26, y1: 22.2 };
const SM_Z = DIE_TOP + 0.4; // tiles ride just above the die surface
const GPCS = 4; //       graphics-processing clusters per field (8 total ≈ GH100)
const GPC_COLS = 4; //   SM columns per GPC
const SM_ROWS = 4; //    SM rows per field

// L2 cache band — a thin slab across the die middle (2 partitions + crossbar).
const L2 = { x: 1.5, y: 10.1, w: 25, d: 3.8, h: 2.4 };
const L2_TOP = DIE_TOP + L2.h;

// HBM stack footprint + tower height (stacks flank the die on the interposer).
const HBM = { sw: 4, sd: 5.5, h: 27, gap: 1.6, leftX: -7.5, rightX: 31.5, startY: 1.5 };
const HBM_TOP = Z0 + HBM.h;

// Die-edge HBM PHY strips (the memory controllers facing the stacks).
const PHY_W = 0.7;

// Satellite chip row (in front of the package) for any non-canonical part.
const SAT = { y: 26.5, x0: 1, w: 5, d: 3, h: 6, step: 7 };

const num = (s?: string): number | undefined => {
  if (!s) return undefined;
  const n = parseInt(s.replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? n : undefined;
};

const isSm = (p: HwTreeNode): boolean => p.comp === "sm" || /sm[\s-]?array|\bsm\b/i.test(p.name);
const isL2 = (p: HwTreeNode): boolean => p.comp === "l2" || /\bl2\b/i.test(p.name);
const isHbm = (p: HwTreeNode): boolean => p.comp === "hbm" || /hbm/i.test(p.name);

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
}: {
  container: HwTreeNode;
  parts: HwTreeNode[];
  selectedId?: string;
  onPick: (partId: string, drill: boolean) => void;
}) {
  // Classify the children onto the canonical hierarchy slots; everything else
  // (io-chip, nvlink, the die at package level, etc.) becomes a satellite chip.
  let smPart: HwTreeNode | undefined;
  let l2Part: HwTreeNode | undefined;
  let hbmPart: HwTreeNode | undefined;
  const sats: HwTreeNode[] = [];
  for (const p of parts) {
    if (isSm(p) && !smPart) smPart = p;
    else if (isL2(p) && !l2Part) l2Part = p;
    else if (isHbm(p) && !hbmPart) hbmPart = p;
    else sats.push(p);
  }

  const pick = (part: HwTreeNode) => (e: MouseEvent<SVGGElement>) =>
    onPick(part.partId, e.ctrlKey || e.metaKey);
  const isSel = (id: string): boolean => id === selectedId;

  // ---- SM lattice -----------------------------------------------------------
  const smCount = smPart?.count ?? num(smPart?.spec.sms) ?? 132;
  const rear = smField(SM_REAR);
  const front = smField(SM_FRONT);
  const smTiles = [...rear.tiles, ...front.tiles];
  const smGpcs = [...rear.gpcs, ...front.gpcs];
  const smRearQuad = quad(SM_REAR.x0, SM_REAR.y0, SM_REAR.x1, SM_REAR.y1, SM_Z);
  const smFrontQuad = quad(SM_FRONT.x0, SM_FRONT.y0, SM_FRONT.x1, SM_FRONT.y1, SM_Z);
  const smOutlines = [smRearQuad, smFrontQuad];
  const smSel = isSel(smPart?.partId ?? "");
  const smAccent = smSel ? "var(--accent)" : accentFor(smPart);

  // ---- L2 slab --------------------------------------------------------------
  const l2Silhouette = boxSilhouette(L2.x, L2.y, L2.w, L2.d, DIE_TOP, L2_TOP);
  const l2Sel = isSel(l2Part?.partId ?? "");
  const l2Accent = l2Sel ? "var(--accent)" : accentFor(l2Part);

  // ---- HBM stacks (flanking; left = behind die, right = in front) -----------
  const hbmCount = hbmPart?.count ?? 5;
  const total = Math.min(Math.max(hbmCount, 2), 6);
  const leftN = Math.ceil(total / 2);
  const rightN = total - leftN;
  type Stack = { x: number; y: number };
  const leftStacks: Stack[] = [];
  const rightStacks: Stack[] = [];
  for (let i = 0; i < leftN; i++) leftStacks.push({ x: HBM.leftX, y: HBM.startY + i * (HBM.sd + HBM.gap) });
  for (let i = 0; i < rightN; i++) rightStacks.push({ x: HBM.rightX, y: HBM.startY + i * (HBM.sd + HBM.gap) });
  const allStacks = [...leftStacks, ...rightStacks];
  const hbmSilhouettes = allStacks.map((s) => boxSilhouette(s.x, s.y, HBM.sw, HBM.sd, Z0, HBM_TOP));
  const hbmSel = isSel(hbmPart?.partId ?? "");
  const hbmAccent = hbmSel ? "var(--accent)" : accentFor(hbmPart);
  const hbmInteractive = !!hbmPart;

  // ---- tier / interconnect anchor points ------------------------------------
  const l2Anchor = rectCenter(L2.x, L2.y, L2.w, L2.d, L2_TOP);
  const smRearAnchor = rectCenter(SM_REAR.x0, SM_REAR.y0, SM_REAR.x1 - SM_REAR.x0, SM_REAR.y1 - SM_REAR.y0, SM_Z);
  const smFrontAnchor = rectCenter(SM_FRONT.x0, SM_FRONT.y0, SM_FRONT.x1 - SM_FRONT.x0, SM_FRONT.y1 - SM_FRONT.y0, SM_Z);
  const hbmAnchors = allStacks.map((s) => rectCenter(s.x, s.y, HBM.sw, HBM.sd, HBM_TOP));

  // Anchor lookup for explicit container.links (by partId and by comp glyph).
  const anchorByKey: Record<string, P> = {};
  if (smPart) anchorByKey[smPart.partId] = smRearAnchor;
  if (l2Part) anchorByKey[l2Part.partId] = l2Anchor;
  if (hbmPart && hbmAnchors[0]) anchorByKey[hbmPart.partId] = hbmAnchors[0];
  anchorByKey.sm = smRearAnchor;
  anchorByKey.l2 = l2Anchor;
  if (hbmAnchors[0]) anchorByKey.hbm = hbmAnchors[0];

  // Satellite chips (any non-canonical child part).
  const satViews = sats.map((part, i) => {
    const sx = SAT.x0 + i * SAT.step;
    const center = rectCenter(sx, SAT.y, SAT.w, SAT.d, SAT.h);
    anchorByKey[part.partId] = center;
    if (part.comp) anchorByKey[part.comp] = center;
    return { part, sx, center };
  });

  const containerLinks = (container.links ?? []).flatMap((lk, i) => {
    const a = anchorByKey[lk.from];
    const b = anchorByKey[lk.to];
    if (!a || !b) return [];
    return [{ a, b, color: LINK_COLOR[lk.kind] ?? "var(--canvas-text-muted)", label: lk.label, key: `lk-${i}` }];
  });

  // A re-usable HBM stack group (faces + striations + ridge + hover).
  const renderStacks = (stacks: Stack[], keyPrefix: string) => (
    <g
      className={hbmInteractive ? "group" : undefined}
      style={hbmInteractive ? { cursor: "pointer" } : undefined}
      onClick={hbmPart ? pick(hbmPart) : undefined}
    >
      {stacks.map((s, i) => {
        const f = boxFaces(s.x, s.y, HBM.sw, HBM.sd, Z0, HBM_TOP);
        const sil = boxSilhouette(s.x, s.y, HBM.sw, HBM.sd, Z0, HBM_TOP);
        // stacked-DRAM-die striations across the two visible faces.
        const striations = [0.12, 0.24, 0.36, 0.48, 0.6, 0.72, 0.84].map((t, k) => {
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
            {hbmInteractive && (
              <polygon points={poly(sil)} fill="transparent" style={{ pointerEvents: "all" }} />
            )}
            <BoxFaces x={s.x} y={s.y} w={HBM.sw} d={HBM.sd} z0={Z0} z1={HBM_TOP} />
            {striations}
            <BoxRidge x={s.x} y={s.y} w={HBM.sw} d={HBM.sd} z1={HBM_TOP} color={hbmAccent} />
            <BoxBevel x={s.x} y={s.y} w={HBM.sw} d={HBM.sd} z1={HBM_TOP} />
          </g>
        );
      })}
      {hbmInteractive && (
        <RegionFx outlines={stacks.map((s) => boxSilhouette(s.x, s.y, HBM.sw, HBM.sd, Z0, HBM_TOP))} selected={false} />
      )}
    </g>
  );

  return (
    <svg
      viewBox="0 0 1000 640"
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      className="block h-full w-full"
      role="img"
      aria-label={`GPU memory hierarchy die schematic for ${container.name}`}
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
      <ellipse cx={500} cy={520} rx={360} ry={90} fill="url(#gpu-floor)" />

      {/* ---- package substrate / interposer (furthest, bottom slab) ---- */}
      <BoxFaces x={SUB.x} y={SUB.y} w={SUB.w} d={SUB.d} z0={0} z1={SUB.h} top="url(#g-sub-top)" />
      <BoxBevel x={SUB.x} y={SUB.y} w={SUB.w} d={SUB.d} z1={SUB.h} />

      {/* ---- LEFT HBM stacks: behind the die (painted before it) ---- */}
      {renderStacks(leftStacks, "hbmL")}

      {/* ---- the compute die slab (the container; static backdrop) ---- */}
      <BoxFaces x={DIE.x} y={DIE.y} w={DIE.w} d={DIE.d} z0={Z0} z1={DIE_TOP} top="url(#g-die-top)" />
      <BoxBevel x={DIE.x} y={DIE.y} w={DIE.w} d={DIE.d} z1={DIE_TOP} />
      {/* memory PHY strips along the die edges that face the HBM stacks */}
      <polygon points={poly(quad(DIE.x, 1, DIE.x + PHY_W, DIE.d - 1, DIE_TOP))} fill={DETAIL} opacity={0.7} />
      <polygon
        points={poly(quad(DIE.x + DIE.w - PHY_W, 1, DIE.x + DIE.w, DIE.d - 1, DIE_TOP))}
        fill={DETAIL}
        opacity={0.7}
      />

      {/* ---- SM lattice (rear + front fields, GPC-grouped) ---- */}
      {(() => {
        const interactive = !!smPart;
        return (
          <g
            className={interactive ? "group" : undefined}
            style={interactive ? { cursor: "pointer" } : undefined}
            onClick={smPart ? pick(smPart) : undefined}
          >
            {interactive &&
              smOutlines.map((o, i) => (
                <polygon key={`sm-hit-${i}`} points={poly(o)} fill="transparent" style={{ pointerEvents: "all" }} />
              ))}
            <g opacity={interactive ? 1 : 0.4}>
              {/* faint GPC cluster backings */}
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
              {/* accent ridge along each field's rear edge */}
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
            {interactive && <RegionFx outlines={smOutlines} selected={smSel} />}
          </g>
        );
      })()}

      {/* ---- L2 cache band (thin slab across the die middle) ---- */}
      {(() => {
        const interactive = !!l2Part;
        return (
          <g
            className={interactive ? "group" : undefined}
            style={interactive ? { cursor: "pointer" } : undefined}
            onClick={l2Part ? pick(l2Part) : undefined}
          >
            {interactive && (
              <polygon points={poly(l2Silhouette)} fill="transparent" style={{ pointerEvents: "all" }} />
            )}
            <g opacity={interactive ? 1 : 0.4}>
              <BoxFaces x={L2.x} y={L2.y} w={L2.w} d={L2.d} z0={DIE_TOP} z1={L2_TOP} />
              {/* crossbar partition ticks across the band top */}
              {[0.2, 0.4, 0.6, 0.8].map((t, i) => {
                const a = lerp(pt(L2.x, L2.y, L2_TOP), pt(L2.x + L2.w, L2.y, L2_TOP), t);
                const b = lerp(pt(L2.x, L2.y + L2.d, L2_TOP), pt(L2.x + L2.w, L2.y + L2.d, L2_TOP), t);
                return <line key={`l2t-${i}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={DETAIL} strokeWidth={0.7} />;
              })}
              {/* central seam — the two L2 partitions */}
              <line
                x1={mid(pt(L2.x, L2.y, L2_TOP), pt(L2.x + L2.w, L2.y, L2_TOP))[0]}
                y1={mid(pt(L2.x, L2.y, L2_TOP), pt(L2.x + L2.w, L2.y, L2_TOP))[1]}
                x2={mid(pt(L2.x, L2.y + L2.d, L2_TOP), pt(L2.x + L2.w, L2.y + L2.d, L2_TOP))[0]}
                y2={mid(pt(L2.x, L2.y + L2.d, L2_TOP), pt(L2.x + L2.w, L2.y + L2.d, L2_TOP))[1]}
                stroke={DETAIL}
                strokeWidth={1.2}
              />
              <BoxRidge x={L2.x} y={L2.y} w={L2.w} d={L2.d} z1={L2_TOP} color={l2Accent} />
              <BoxBevel x={L2.x} y={L2.y} w={L2.w} d={L2.d} z1={L2_TOP} />
            </g>
            {interactive && <RegionFx outlines={[l2Silhouette]} selected={l2Sel} />}
          </g>
        );
      })()}

      {/* ---- RIGHT HBM stacks: in front of the die (painted after it) ---- */}
      {renderStacks(rightStacks, "hbmR")}

      {/* ---- faint TIER links: global HBM → L2 → SM ---- */}
      <g className="pointer-events-none">
        {hbmAnchors.map((a, i) => (
          <line
            key={`tier-hl-${i}`}
            x1={a[0]}
            y1={a[1]}
            x2={l2Anchor[0]}
            y2={l2Anchor[1]}
            style={{ stroke: "var(--cat-memory)" }}
            strokeWidth={1.1}
            strokeDasharray="1 3.5"
            strokeLinecap="round"
            opacity={0.4}
          />
        ))}
        {[smRearAnchor, smFrontAnchor].map((a, i) => (
          <line
            key={`tier-ls-${i}`}
            x1={l2Anchor[0]}
            y1={l2Anchor[1]}
            x2={a[0]}
            y2={a[1]}
            style={{ stroke: "var(--cat-io)" }}
            strokeWidth={1.1}
            strokeDasharray="1 3.5"
            strokeLinecap="round"
            opacity={0.5}
          />
        ))}
        {/* tier nodes */}
        {hbmAnchors.map((a, i) => (
          <circle key={`tn-h-${i}`} cx={a[0]} cy={a[1]} r={2.2} style={{ fill: "var(--cat-memory)" }} opacity={0.85} />
        ))}
        <circle cx={l2Anchor[0]} cy={l2Anchor[1]} r={2.4} style={{ fill: "var(--cat-io)" }} opacity={0.9} />
        {[smRearAnchor, smFrontAnchor].map((a, i) => (
          <circle key={`tn-s-${i}`} cx={a[0]} cy={a[1]} r={2.2} style={{ fill: "var(--cat-tool)" }} opacity={0.85} />
        ))}
      </g>

      {/* ---- explicit typed interconnects from container.links (if any) ---- */}
      {containerLinks.length > 0 && (
        <g className="pointer-events-none">
          {containerLinks.map((l) => (
            <g key={l.key}>
              <line x1={l.a[0]} y1={l.a[1]} x2={l.b[0]} y2={l.b[1]} style={{ stroke: l.color }} strokeWidth={1.6} opacity={0.55} />
              {l.label && (
                <Label x={mid(l.a, l.b)[0]} y={mid(l.a, l.b)[1] - 4} text={l.label} color="var(--canvas-text-muted)" size={10} />
              )}
            </g>
          ))}
        </g>
      )}

      {/* ---- selection outline for HBM (over BOTH groups, on top) ---- */}
      {hbmInteractive && hbmSel && <SelectionOutline outlines={hbmSilhouettes} />}

      {/* ---- satellite chips: any non-canonical child part (front, on top) ---- */}
      {satViews.map(({ part, sx }) => {
        const sel = isSel(part.partId);
        const sil = boxSilhouette(sx, SAT.y, SAT.w, SAT.d, 0, SAT.h);
        const accent = sel ? "var(--accent)" : accentFor(part);
        const top = pt(sx + SAT.w / 2, SAT.y + SAT.d, SAT.h);
        return (
          <g key={part.partId} className="group" style={{ cursor: "pointer" }} onClick={pick(part)}>
            <polygon points={poly(sil)} fill="transparent" style={{ pointerEvents: "all" }} />
            <BoxFaces x={sx} y={SAT.y} w={SAT.w} d={SAT.d} z0={0} z1={SAT.h} />
            <BoxRidge x={sx} y={SAT.y} w={SAT.w} d={SAT.d} z1={SAT.h} color={accent} />
            <BoxBevel x={sx} y={SAT.y} w={SAT.w} d={SAT.d} z1={SAT.h} />
            <RegionFx outlines={[sil]} selected={sel} />
            <Label
              x={top[0]}
              y={top[1] + 16}
              text={`${part.name}${part.count && part.count > 1 ? ` ×${part.count}` : ""}`}
              color="var(--canvas-text-muted)"
              size={11}
            />
          </g>
        );
      })}

      {/* ---- tier labels ---- */}
      <Label
        x={pt(SM_REAR.x0, SM_REAR.y0, SM_Z)[0] + 6}
        y={pt(SM_REAR.x0, SM_REAR.y0, SM_Z)[1] - 8}
        text={smPart ? `${smPart.name} ×${smCount}` : `SM array ×${smCount}`}
        color={smPart ? "var(--canvas-text)" : "var(--canvas-text-dim)"}
        anchor="start"
        size={13}
        bold={!!smPart}
      />
      <Label
        x={pt(L2.x + L2.w, L2.y + L2.d, L2_TOP)[0] + 8}
        y={pt(L2.x + L2.w, L2.y + L2.d, L2_TOP)[1] + 2}
        text={l2Part ? `${l2Part.name}${l2Part.spec.size ? ` · ${l2Part.spec.size}` : ""}` : "L2 cache"}
        color={l2Part ? "var(--canvas-text)" : "var(--canvas-text-dim)"}
        anchor="start"
        size={12}
        bold={!!l2Part}
      />
      {hbmAnchors[0] && (
        <Label
          x={hbmAnchors[0][0]}
          y={hbmAnchors[0][1] - 12}
          text={hbmPart ? `${hbmPart.name}${hbmPart.count ? ` ×${hbmPart.count}` : ""}` : "HBM (global)"}
          color={hbmPart ? "var(--canvas-text)" : "var(--canvas-text-dim)"}
          anchor="middle"
          size={12}
          bold={!!hbmPart}
        />
      )}
      {rightStacks[0] && (
        <Label
          x={pt(HBM.rightX + HBM.sw, HBM.startY, HBM_TOP)[0] + 6}
          y={pt(HBM.rightX + HBM.sw, HBM.startY, HBM_TOP)[1] - 6}
          text="GLOBAL · HBM"
          color="var(--canvas-text-dim)"
          anchor="start"
          size={11}
        />
      )}

      {/* ---- title + hierarchy legend ---- */}
      <Label x={500} y={30} text={`${container.name}  ·  ${container.level}`} size={15} bold />

      <g>
        {[
          { c: "var(--cat-tool)", t: "Tier 0/1 · registers + L1/SMEM (per-SM)" },
          { c: "var(--cat-io)", t: "Tier 2 · L2 cache (chip-wide)" },
          { c: "var(--cat-memory)", t: "Tier 3 · HBM / global memory" },
        ].map((row, i) => (
          <g key={row.t} transform={`translate(28, ${52 + i * 18})`}>
            <rect x={0} y={-8} width={9} height={9} rx={2} style={{ fill: row.c }} />
            <Label x={16} y={0} text={row.t} color="var(--canvas-text-muted)" anchor="start" size={11} />
          </g>
        ))}
      </g>
    </svg>
  );
}
