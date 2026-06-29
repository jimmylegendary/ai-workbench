import type { MouseEvent } from "react";
import type { HwTreeNode } from "@/features/simulation/model/fixtures/c3";

/**
 * GpuScene — a PRESENTATIONAL 2.5D isometric schematic of one GPU's interior,
 * drawn the way a CUDA memory-hierarchy diagram reads: a central compute DIE
 * carrying an SM lattice, an L2 cache band laid in front of it, and tall HBM
 * memory stacks FLANKING the die left and right. The hierarchy (SM → L2 →
 * global/HBM) is annotated with neutral tier labels.
 *
 * Used by Canvas 3 when the drill is INSIDE a gpu package / die / compute-chip.
 * It is structurally schematic — NOT a flat grid, NOT photoreal.
 *
 * Each child part becomes a clickable isometric <g> hit region:
 *   onClick → onPick(part.partId, ctrl/⌘)   (plain = select, modifier = drill)
 * Hover lifts a faint accent tint; the selected part gets a cyan accent outline
 * + glow. Faces use fixed metal greys (the canvas is always dark); a thin
 * categorical ridge hints the block kind (off the reserved status hues).
 *
 * Pure / presentational: no hooks, no state. The SVG fills its box via viewBox
 * + width/height 100% + preserveAspectRatio.
 */

/* --------------------------------------------------------------------------- *
 * Isometric projection (2:1). x → screen-right, y → screen-depth, z → height.
 * --------------------------------------------------------------------------- */

const OX = 470; // screen origin x (floor 0,0)
const OY = 178; // screen origin y
const U = 13; //   half-tile width  (x spread)
const V = 6.5; //  half-tile height (y spread)

type P = readonly [number, number];

/** Project a floor point (x,y) at height z (px) to screen space. */
const pt = (x: number, y: number, z = 0): P => [
  OX + (x - y) * U,
  OY + (x + y) * V - z,
];

const poly = (pts: readonly P[]): string => pts.map((p) => `${p[0]},${p[1]}`).join(" ");

const lerp = (a: P, b: P, t: number): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

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

/* --------------------------------------------------------------------------- *
 * Metal greys (fixed — the canvas is always dark) + categorical accents.
 * --------------------------------------------------------------------------- */

const TOP = "#313c49";
const LEFT = "#232d38";
const RIGHT = "#19212b";
const STROKE = "#11161d";
const DIE_TOP = "#283139"; // slightly darker so the SM lattice reads on top
const SM_TILE = "#3a4655"; // one notch lighter than TOP for the cells
const DETAIL = "#0c1117";

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

/** Hover tint + selection outline/glow for a region (outlines in screen space). */
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
      {selected &&
        outlines.map((o, i) => (
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

/** The three grey faces of a box (drawn back-to-front). */
function BoxFaces({
  x,
  y,
  w,
  d,
  z0,
  z1,
  top = TOP,
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
      <polygon points={poly(f.right)} fill={RIGHT} stroke={STROKE} strokeWidth={1} />
      <polygon points={poly(f.left)} fill={LEFT} stroke={STROKE} strokeWidth={1} />
      <polygon points={poly(f.top)} fill={top} stroke={STROKE} strokeWidth={1} />
    </g>
  );
}

/** Accent "roof" ridge along the two back-top edges of a box. */
function BoxRidge({
  x,
  y,
  w,
  d,
  z1,
  color,
}: {
  x: number;
  y: number;
  w: number;
  d: number;
  z1: number;
  color: string;
}) {
  return (
    <polyline
      points={poly([pt(x, y + d, z1), pt(x, y, z1), pt(x + w, y, z1)])}
      fill="none"
      style={{ stroke: color }}
      strokeWidth={1.8}
      strokeLinejoin="round"
      strokeLinecap="round"
      opacity={0.95}
    />
  );
}

/* --------------------------------------------------------------------------- *
 * Scene geometry constants.
 * --------------------------------------------------------------------------- */

// Compute die slab.
const DIE = { x: 0, y: 0, w: 28, d: 22, h: 9 };
// SM lattice region (on the die top, rear ~60%).
const SM = { x0: 1.5, y0: 1.5, x1: 26.5, y1: 13.5 };
// L2 cache band (on the die top, front strip) — drawn as a thin slab.
const L2 = { x: 1.5, y: 15, w: 25, d: 5.5, h: 3 };
// HBM stack footprint + tower height.
const HBM = { sw: 3.5, sd: 5, sh: 44, gap: 1.5, leftX: -6, rightX: 30.5, startY: 2 };
// Satellite chip row (front of the die) for any non-canonical part.
const SAT = { y: 27, x0: 2, w: 5, d: 4, h: 7, step: 7 };

const num = (s?: string): number | undefined => {
  if (!s) return undefined;
  const n = parseInt(s.replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? n : undefined;
};

const isSm = (p: HwTreeNode): boolean => p.comp === "sm" || /sm[\s-]?array|\bsm\b/i.test(p.name);
const isL2 = (p: HwTreeNode): boolean => p.comp === "l2" || /\bl2\b/i.test(p.name);
const isHbm = (p: HwTreeNode): boolean => p.comp === "hbm" || /hbm/i.test(p.name);

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
  const smZ = DIE.h + 1;
  const smRegion = quad(SM.x0, SM.y0, SM.x1, SM.y1, smZ);
  const regW = SM.x1 - SM.x0;
  const regD = SM.y1 - SM.y0;
  const cells = Math.min(smCount, 96);
  const cols = Math.min(14, Math.max(4, Math.round(Math.sqrt((cells * regW) / regD))));
  const rows = Math.min(8, Math.max(2, Math.ceil(cells / cols)));
  const cw = regW / cols;
  const ch = regD / rows;
  const tg = 0.14; // tile gap (floor units)
  const tiles: P[][] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const tx = SM.x0 + c * cw + tg;
      const ty = SM.y0 + r * ch + tg;
      tiles.push(quad(tx, ty, tx + cw - tg * 2, ty + ch - tg * 2, smZ));
    }
  }

  // ---- HBM stacks (flanking) ------------------------------------------------
  const hbmCount = hbmPart?.count ?? 5;
  const total = Math.min(Math.max(hbmCount, 2), 6);
  const leftN = Math.ceil(total / 2);
  const rightN = total - leftN;
  type Stack = { x: number; y: number };
  const hbmStacks: Stack[] = [];
  for (let i = 0; i < leftN; i++) hbmStacks.push({ x: HBM.leftX, y: HBM.startY + i * (HBM.sd + HBM.gap) });
  for (let i = 0; i < rightN; i++) hbmStacks.push({ x: HBM.rightX, y: HBM.startY + i * (HBM.sd + HBM.gap) });
  const hbmSilhouettes = hbmStacks.map((s) => boxSilhouette(s.x, s.y, HBM.sw, HBM.sd, 0, HBM.sh));
  const hbmAccent = isSel(hbmPart?.partId ?? "") ? "var(--accent)" : accentFor(hbmPart);

  // ---- L2 slab --------------------------------------------------------------
  const l2Top = L2.h + DIE.h;
  const l2Silhouette = boxSilhouette(L2.x, L2.y, L2.w, L2.d, DIE.h, l2Top);
  const l2Accent = isSel(l2Part?.partId ?? "") ? "var(--accent)" : accentFor(l2Part);
  const smAccent = isSel(smPart?.partId ?? "") ? "var(--accent)" : accentFor(smPart);

  return (
    <svg
      viewBox="0 0 1000 640"
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      className="block h-full w-full"
      role="img"
      aria-label={`GPU memory hierarchy schematic for ${container.name}`}
    >
      <defs>
        <filter id="gpu-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <radialGradient id="gpu-floor" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#000000" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect x={0} y={0} width={1000} height={640} style={{ fill: "var(--canvas-bg)" }} />

      {/* soft ground shadow under the die */}
      <ellipse cx={509} cy={470} rx={300} ry={86} fill="url(#gpu-floor)" />

      {/* ---- HBM stacks behind / flanking the die (draw first = furthest) ---- */}
      {(() => {
        const sel = isSel(hbmPart?.partId ?? "");
        const interactive = !!hbmPart;
        return (
          <g
            className={interactive ? "group" : undefined}
            style={interactive ? { cursor: "pointer" } : undefined}
            onClick={hbmPart ? pick(hbmPart) : undefined}
          >
            {/* hit backing per stack */}
            {interactive &&
              hbmSilhouettes.map((s, i) => (
                <polygon key={`hbm-hit-${i}`} points={poly(s)} fill="transparent" style={{ pointerEvents: "all" }} />
              ))}
            {hbmStacks.map((s, i) => {
              const f = boxFaces(s.x, s.y, HBM.sw, HBM.sd, 0, HBM.sh);
              // stacked-die striations on the front (right) face
              const lines = [0.22, 0.4, 0.58, 0.76].map((t, k) => {
                const a = lerp(f.right[0], f.right[3], t); // top-left → bottom-left
                const b = lerp(f.right[1], f.right[2], t); // top-right → bottom-right
                return (
                  <line
                    key={`hbm-l-${i}-${k}`}
                    x1={a[0]}
                    y1={a[1]}
                    x2={b[0]}
                    y2={b[1]}
                    stroke={DETAIL}
                    strokeWidth={0.8}
                  />
                );
              });
              return (
                <g key={`hbm-${i}`} opacity={interactive ? 1 : 0.4}>
                  <BoxFaces x={s.x} y={s.y} w={HBM.sw} d={HBM.sd} z0={0} z1={HBM.sh} />
                  {lines}
                  <BoxRidge x={s.x} y={s.y} w={HBM.sw} d={HBM.sd} z1={HBM.sh} color={hbmAccent} />
                </g>
              );
            })}
            {interactive && <RegionFx outlines={hbmSilhouettes} selected={sel} />}
          </g>
        );
      })()}

      {/* labels for the global / HBM tier */}
      {hbmStacks[0] && (
        <Label
          x={lerp(pt(HBM.leftX, HBM.startY, HBM.sh), pt(HBM.leftX + HBM.sw, HBM.startY, HBM.sh), 0.5)[0]}
          y={pt(HBM.leftX, HBM.startY, HBM.sh)[1] - 12}
          text={hbmPart ? `${hbmPart.name}${hbmPart.count ? ` ×${hbmPart.count}` : ""}` : "HBM (global)"}
          color={hbmPart ? "var(--canvas-text)" : "var(--canvas-text-dim)"}
          anchor="middle"
          size={13}
          bold={!!hbmPart}
        />
      )}
      <Label
        x={pt(HBM.rightX + HBM.sw, HBM.startY, HBM.sh)[0] + 6}
        y={pt(HBM.rightX + HBM.sw, HBM.startY, HBM.sh)[1] - 6}
        text="GLOBAL · HBM"
        color="var(--canvas-text-dim)"
        anchor="start"
        size={11}
      />

      {/* ---- the compute die slab (the container; static backdrop) ---- */}
      <BoxFaces x={DIE.x} y={DIE.y} w={DIE.w} d={DIE.d} z0={0} z1={DIE.h} top={DIE_TOP} />

      {/* ---- SM lattice region ---- */}
      {(() => {
        const sel = isSel(smPart?.partId ?? "");
        const interactive = !!smPart;
        return (
          <g
            className={interactive ? "group" : undefined}
            style={interactive ? { cursor: "pointer" } : undefined}
            onClick={smPart ? pick(smPart) : undefined}
          >
            {interactive && (
              <polygon points={poly(smRegion)} fill="transparent" style={{ pointerEvents: "all" }} />
            )}
            <g opacity={interactive ? 1 : 0.4}>
              {tiles.map((t, i) => (
                <polygon key={`sm-${i}`} points={poly(t)} fill={SM_TILE} stroke={STROKE} strokeWidth={0.6} />
              ))}
              <polyline
                points={poly([smRegion[0], smRegion[1]])}
                fill="none"
                style={{ stroke: smAccent }}
                strokeWidth={1.8}
                strokeLinecap="round"
                opacity={0.95}
              />
            </g>
            {interactive && <RegionFx outlines={[smRegion]} selected={sel} />}
          </g>
        );
      })()}

      {/* ---- L2 cache band (thin slab on the die front) ---- */}
      {(() => {
        const sel = isSel(l2Part?.partId ?? "");
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
              <BoxFaces x={L2.x} y={L2.y} w={L2.w} d={L2.d} z0={DIE.h} z1={l2Top} />
              {/* crossbar partition ticks across the band top */}
              {[0.25, 0.5, 0.75].map((t, i) => {
                const a = lerp(pt(L2.x, L2.y, l2Top), pt(L2.x + L2.w, L2.y, l2Top), t);
                const b = lerp(pt(L2.x, L2.y + L2.d, l2Top), pt(L2.x + L2.w, L2.y + L2.d, l2Top), t);
                return <line key={`l2-${i}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={DETAIL} strokeWidth={0.7} />;
              })}
              <BoxRidge x={L2.x} y={L2.y} w={L2.w} d={L2.d} z1={l2Top} color={l2Accent} />
            </g>
            {interactive && <RegionFx outlines={[l2Silhouette]} selected={sel} />}
          </g>
        );
      })()}

      {/* labels for SM + L2 tiers */}
      <Label
        x={pt(SM.x0, SM.y0, smZ)[0] + 8}
        y={pt(SM.x0, SM.y0, smZ)[1] - 6}
        text={smPart ? `${smPart.name} ×${smCount}` : `SM array ×${smCount}`}
        color={smPart ? "var(--canvas-text)" : "var(--canvas-text-dim)"}
        anchor="start"
        size={13}
        bold={!!smPart}
      />
      <Label
        x={pt(L2.x + L2.w, L2.y + L2.d, l2Top)[0] + 8}
        y={pt(L2.x + L2.w, L2.y + L2.d, l2Top)[1] + 4}
        text={l2Part ? `${l2Part.name}${l2Part.spec.size ? ` · ${l2Part.spec.size}` : ""}` : "L2 cache"}
        color={l2Part ? "var(--canvas-text)" : "var(--canvas-text-dim)"}
        anchor="start"
        size={12}
        bold={!!l2Part}
      />

      {/* ---- satellite chips: any non-canonical child part ---- */}
      {sats.map((part, i) => {
        const sx = SAT.x0 + i * SAT.step;
        const sel = isSel(part.partId);
        const sil = boxSilhouette(sx, SAT.y, SAT.w, SAT.d, 0, SAT.h);
        const accent = sel ? "var(--accent)" : accentFor(part);
        const top = pt(sx + SAT.w / 2, SAT.y + SAT.d, SAT.h);
        return (
          <g key={part.partId} className="group" style={{ cursor: "pointer" }} onClick={pick(part)}>
            <polygon points={poly(sil)} fill="transparent" style={{ pointerEvents: "all" }} />
            <BoxFaces x={sx} y={SAT.y} w={SAT.w} d={SAT.d} z0={0} z1={SAT.h} />
            <BoxRidge x={sx} y={SAT.y} w={SAT.w} d={SAT.d} z1={SAT.h} color={accent} />
            <RegionFx outlines={[sil]} selected={sel} />
            <Label x={top[0]} y={top[1] + 16} text={part.name} color="var(--canvas-text-muted)" size={11} />
          </g>
        );
      })}

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
