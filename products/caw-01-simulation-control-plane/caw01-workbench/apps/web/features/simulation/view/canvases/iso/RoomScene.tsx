import type { HwTreeNode } from "@/features/simulation/model/fixtures/c3";

/**
 * RoomScene — a PRESENTATIONAL 2.5D isometric data-center ROOM for one HW level
 * of the Canvas-3 digital twin. Used when the current container is a
 * `data_center` or a `cluster`:
 *
 *   • container.level === "data_center" → each child is a CLUSTER, drawn as a
 *     labelled ZONE: a tinted floor patch + a small group of rack cabinets,
 *     coloured by the cluster's categorical accent (--cat-*, never a status hue).
 *   • otherwise (inside a cluster) → each child is a RACK, drawn as one cabinet
 *     in a row of cabinets on the floor.
 *
 * It is a schematic isometric SVG (NOT a flat grid, NOT photoreal): an iso floor
 * grid in faux-perspective, low back walls, a subtle overhead power busway and a
 * floor cooling loop for realism. Every child part is a clickable iso <g> hit
 * region. No hooks / no state — pure props in, SVG out.
 *
 * Color rule (DESIGN.md §2/§9): faces are fixed metal greys, taxonomy uses the
 * categorical palette, and the reserved status hues are untouched — var(--accent)
 * (cyan) appears ONLY as the selection outline/glow.
 */

/* ---- fixed metal-grey palette (the canvas is always dark) ---------------- */
const FACE_TOP = "#313c49";
const FACE_LEFT = "#232d38";
const FACE_RIGHT = "#19212b";
const EDGE = "#11161d";
const FLOOR = "#161d26";
const FLOOR_LINE = "#222c38";
const WALL_L = "#10161e";
const WALL_R = "#0d1319";
const DETAIL = "#3b4a5a";
const PIPE = "#46566a";

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

/* ---- layout constants ---------------------------------------------------- */
const START = 1.6; // first cell offset from the room corner
const MARGIN = 1.5; // floor border beyond the last cabinet

const RACK = { dx: 1.6, dy: 2.5, h: 5.2 };
const RACK_PITCH_X = 2.15;
const RACK_PITCH_Y = 4.6;
const RACK_COLS_MAX = 6;

const MC = { dx: 0.95, dy: 1.5, h: 4.0 }; // a zone's mini rack cabinet
const MC_COLS = 3;
const MC_ROWS = 2;
const MC_PITCH_X = 1.25;
const MC_PITCH_Y = 2.0;
const PATCH_PAD = 0.6; // tinted floor patch border around a zone's cabinets
const ZONE_W = (MC_COLS - 1) * MC_PITCH_X + MC.dx + PATCH_PAD * 2;
const ZONE_D = (MC_ROWS - 1) * MC_PITCH_Y + MC.dy + PATCH_PAD * 2;
const ZONE_PITCH_X = ZONE_W + 2.1;
const ZONE_PITCH_Y = ZONE_D + 2.8;

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

/** A short secondary readout for a part label. */
function subLabel(part: HwTreeNode): string {
  if (part.count && part.count > 1) return `×${part.count}`;
  const first = Object.entries(part.spec)[0];
  return first ? truncate(`${first[0]} ${first[1]}`, 18) : part.level;
}

/* ---- glyph pieces -------------------------------------------------------- */

/** One iso rack cabinet: 3 metal-grey faces + front slot lines + accent ridge. */
function Cabinet({
  gx,
  gy,
  dx,
  dy,
  h,
  ridge,
}: {
  gx: number;
  gy: number;
  dx: number;
  dy: number;
  h: number;
  ridge: string;
}) {
  const top = poly(
    iso(gx, gy, h),
    iso(gx + dx, gy, h),
    iso(gx + dx, gy + dy, h),
    iso(gx, gy + dy, h),
  );
  const left = poly(
    iso(gx, gy + dy, h),
    iso(gx + dx, gy + dy, h),
    iso(gx + dx, gy + dy, 0),
    iso(gx, gy + dy, 0),
  );
  const right = poly(
    iso(gx + dx, gy, h),
    iso(gx + dx, gy + dy, h),
    iso(gx + dx, gy + dy, 0),
    iso(gx + dx, gy, 0),
  );
  const slots = [1, 2, 3, 4].map((s) => {
    const z = (h * s) / 5;
    const a = iso(gx + dx, gy, z);
    const b = iso(gx + dx, gy + dy, z);
    return (
      <line
        key={s}
        x1={r(a.x)}
        y1={r(a.y)}
        x2={r(b.x)}
        y2={r(b.y)}
        stroke={DETAIL}
        strokeWidth={0.5}
        opacity={0.7}
      />
    );
  });
  return (
    <>
      <polygon points={left} fill={FACE_LEFT} stroke={EDGE} strokeWidth={0.6} />
      <polygon points={right} fill={FACE_RIGHT} stroke={EDGE} strokeWidth={0.6} />
      <polygon points={top} fill={FACE_TOP} stroke={EDGE} strokeWidth={0.6} />
      {slots}
      <polyline
        points={poly(iso(gx, gy + dy, h), iso(gx + dx, gy + dy, h), iso(gx + dx, gy, h))}
        fill="none"
        stroke={ridge}
        strokeWidth={1.1}
        opacity={0.85}
      />
      {/* hover highlight (group lives on the part <g>) */}
      <polygon
        points={top}
        fill="#ffffff"
        className="pointer-events-none opacity-0 transition-opacity duration-150 group-hover:opacity-10"
      />
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
      filter="url(#iso-glow)"
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

/** A small font-readout label tag, anchored on the floor near a part. */
function Label({
  at,
  name,
  sub,
  swatch,
  anchor,
}: {
  at: P;
  name: string;
  sub: string;
  swatch?: string;
  anchor: "start" | "middle";
}) {
  const text = truncate(name, 22);
  const w = Math.max(text.length, sub.length) * 5.9 + (swatch ? 16 : 12);
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
        fillOpacity={0.82}
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
    </g>
  );
}

export function RoomScene({
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
  const zones = container.level === "data_center";
  const slots = layout(zones, parts);

  /* floor extent + camera bounds derived from the placed cabinets */
  const maxRight = slots.reduce((m, s) => Math.max(m, s.gx + s.dx), START + 1);
  const maxFront = slots.reduce((m, s) => Math.max(m, s.gy + s.dy), START + 1);
  const FW = Math.ceil(maxRight + MARGIN);
  const FD = Math.ceil(maxFront + MARGIN);
  const cabH = zones ? MC.h : RACK.h;
  const wallH = cabH + 2.6;

  const minX = -FD * TW - 28;
  const maxX = FW * TW + 28;
  const minY = -wallH * UH - 22;
  const maxY = (FW + FD) * TH + 44;
  const vb = `${r(minX)} ${r(minY)} ${r(maxX - minX)} ${r(maxY - minY)}`;

  /* floor grid lines */
  const gridLines: P[][] = [];
  for (let i = 0; i <= FW; i++) gridLines.push([iso(i, 0, 0), iso(i, FD, 0)]);
  for (let j = 0; j <= FD; j++) gridLines.push([iso(0, j, 0), iso(FW, j, 0)]);

  /* draw back-to-front */
  const ordered = [...slots].sort((a, b) => a.gx + a.gy - (b.gx + b.gy));

  const busZ = wallH - 0.6;

  return (
    <svg
      viewBox={vb}
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      className="block h-full w-full"
    >
      <defs>
        <filter id="iso-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <rect x={r(minX)} y={r(minY)} width={r(maxX - minX)} height={r(maxY - minY)} fill="var(--canvas-bg)" />

      {/* low back walls for room depth */}
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

      {/* floor + grid */}
      <polygon
        points={poly(iso(0, 0, 0), iso(FW, 0, 0), iso(FW, FD, 0), iso(0, FD, 0))}
        fill={FLOOR}
        stroke={EDGE}
        strokeWidth={0.8}
      />
      {gridLines.map((l, i) => (
        <line
          key={`g${i}`}
          x1={r(l[0].x)}
          y1={r(l[0].y)}
          x2={r(l[1].x)}
          y2={r(l[1].y)}
          stroke={FLOOR_LINE}
          strokeWidth={0.5}
          opacity={0.6}
        />
      ))}

      {/* cooling loop (floor pipes, supply + return) */}
      {[
        [iso(0.7, 0.6, 0.05), iso(0.7, FD - 0.6, 0.05)],
        [iso(FW - 0.7, 0.6, 0.05), iso(FW - 0.7, FD - 0.6, 0.05)],
        [iso(0.7, FD - 0.6, 0.05), iso(FW - 0.7, FD - 0.6, 0.05)],
      ].map((l, i) => (
        <line
          key={`c${i}`}
          x1={r(l[0].x)}
          y1={r(l[0].y)}
          x2={r(l[1].x)}
          y2={r(l[1].y)}
          stroke={PIPE}
          strokeWidth={1.4}
          strokeDasharray="3 3"
          opacity={0.45}
        />
      ))}

      {/* overhead power busway + drop hangers */}
      <polyline
        points={poly(iso(1, 0.5, busZ), iso(FW - 0.5, 0.5, busZ))}
        fill="none"
        stroke={DETAIL}
        strokeWidth={1.6}
        opacity={0.6}
      />
      {Array.from({ length: Math.max(2, Math.floor(FW / 3)) }, (_, k) => {
        const gx = 2 + k * 3;
        if (gx > FW - 1) return null;
        const a = iso(gx, 0.5, busZ);
        const b = iso(gx, 0.5, busZ - 1);
        return (
          <line
            key={`h${k}`}
            x1={r(a.x)}
            y1={r(a.y)}
            x2={r(b.x)}
            y2={r(b.y)}
            stroke={DETAIL}
            strokeWidth={1}
            opacity={0.5}
          />
        );
      })}

      {/* the clickable parts */}
      {ordered.map((slot) => {
        const { part, gx, gy, dx, dy } = slot;
        const selected = part.partId === selectedId;
        const drillable = !!part.children && part.children.length > 0;
        const accent = zones ? accentFor(part.clusterType) : accentFor(container.clusterType);
        const ridge = selected ? "var(--accent)" : accent;

        return (
          <g
            key={part.partId}
            className="group cursor-pointer"
            onClick={(e) => onPick(part.partId, e.ctrlKey || e.metaKey)}
          >
            <title>
              {drillable ? `${part.partId} — Ctrl/⌘+click to drill in` : part.partId}
            </title>

            {zones ? (
              <>
                {/* tinted zone floor patch */}
                <polygon
                  points={poly(
                    iso(gx, gy, 0),
                    iso(gx + dx, gy, 0),
                    iso(gx + dx, gy + dy, 0),
                    iso(gx, gy + dy, 0),
                  )}
                  fill={accent}
                  fillOpacity={0.1}
                  stroke={accent}
                  strokeOpacity={0.35}
                  strokeWidth={0.8}
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
                      ridge={ridge}
                    />
                  );
                })}
                {/* zone-wide hover highlight */}
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
              <Cabinet gx={gx} gy={gy} dx={dx} dy={dy} h={RACK.h} ridge={ridge} />
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

            {zones ? (
              <Label
                at={{ x: iso(gx, gy, 0).x, y: iso(gx, gy, 0).y - (MC.h + 1.8) * UH }}
                name={part.name}
                sub={subLabel(part)}
                swatch={accent}
                anchor="start"
              />
            ) : (
              <Label
                at={{
                  x: iso(gx + dx / 2, gy + dy, 0).x,
                  y: iso(gx + dx / 2, gy + dy, 0).y + 18,
                }}
                name={part.name}
                sub={subLabel(part)}
                anchor="middle"
              />
            )}
          </g>
        );
      })}

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
