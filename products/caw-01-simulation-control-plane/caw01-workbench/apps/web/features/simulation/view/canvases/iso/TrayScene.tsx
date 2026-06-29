import type { CompKind, HwTreeNode } from "@/features/simulation/model/fixtures/c3";

/**
 * TrayScene — a PRESENTATIONAL 2.5D isometric schematic of ONE tray's interior.
 *
 * Reference: an HGX H100 / DGX-style 8-GPU baseboard topology. The container's
 * child parts are placed onto an isometric board by their `comp` kind:
 *
 *     CPU(s) ──────────── back edge (host sockets)
 *     GPU bank A ───────┐
 *     NVSwitch row ─────┤  the all-to-all NVLink crossbar between the two banks
 *     GPU bank B ───────┘
 *     NIC / memory ───── front module row (ConnectX-7, or DIMM/flash for mem trays)
 *     DPU ────────────── BlueField offload
 *     OSFP cages ─────── front edge optical ports
 *
 * Thin PCB traces are drawn on the board surface for the NVLink fabric (GPU↔
 * NVSwitch), PCIe (CPU↔GPU) and NIC↔OSFP rails; the cuboids sit on top so the
 * traces appear to route beneath the blocks. Each part is a clickable hit region
 * — every cuboid AND its label carry onPick(partId, drill). Plain click selects;
 * Ctrl/⌘+click requests a drill. No hooks / no state — pure render.
 *
 * Faces use fixed metal greys (the canvas is always dark); the categorical
 * `--cat-*` palette only tints the top ridge per kind, and `--accent` is reserved
 * for the selected part. Status hues are never used here.
 */

/* ----------------------------------------------------------------------- *
 * Isometric projection (2:1). A board cell (bx, by) → screen (x, y).
 * ----------------------------------------------------------------------- */
const TW = 42; // half tile width (px)
const TH = 21; // half tile height (px)
const OX = 372; // screen origin x for board cell (0,0)
const OY = 92; // screen origin y for board cell (0,0)

type Pt = [number, number];
const iso = (bx: number, by: number): Pt => [OX + (bx - by) * TW, OY + (bx + by) * TH];
const r = (n: number): number => Math.round(n * 100) / 100;
const poly = (pts: Pt[]): string => pts.map(([x, y]) => `${r(x)},${r(y)}`).join(" ");

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

/** Per-band cuboid footprint (cell units) + height (px). */
const FOOT: Record<Band, { fw: number; fd: number; h: number }> = {
  cpu: { fw: 0.96, fd: 0.74, h: 28 },
  gpu: { fw: 0.8, fd: 0.8, h: 42 },
  nvswitch: { fw: 0.8, fd: 0.44, h: 16 },
  nic: { fw: 0.34, fd: 0.5, h: 22 },
  memory: { fw: 0.2, fd: 0.62, h: 26 },
  dpu: { fw: 0.66, fd: 0.42, h: 18 },
  osfp: { fw: 0.5, fd: 0.28, h: 12 },
  generic: { fw: 0.76, fd: 0.76, h: 26 },
};

/** Ordered slot centers per band — parts fill them left→right / bankA→bankB. */
const SLOTS: Record<Band, Pt[]> = {
  cpu: [
    [1.7, 0.35],
    [3.3, 0.35],
    [2.5, 0.35],
    [0.9, 0.35],
    [4.1, 0.35],
  ],
  gpu: [
    [1, 1.55],
    [2, 1.55],
    [3, 1.55],
    [4, 1.55],
    [1, 3.55],
    [2, 3.55],
    [3, 3.55],
    [4, 3.55],
  ],
  nvswitch: [
    [1, 2.55],
    [2, 2.55],
    [3, 2.55],
    [4, 2.55],
    [1.5, 2.2],
    [2.5, 2.2],
    [3.5, 2.2],
    [4.5, 2.2],
  ],
  nic: Array.from({ length: 8 }, (_, i): Pt => [0.8 + (i * 3.8) / 7, 4.85]),
  memory: Array.from({ length: 16 }, (_, i): Pt => [0.7 + (i * 3.6) / 15, 4.45]),
  dpu: [
    [1.7, 5.45],
    [3.3, 5.45],
    [2.5, 5.45],
    [0.9, 5.45],
  ],
  osfp: Array.from({ length: 8 }, (_, i): Pt => [0.8 + (i * 3.8) / 7, 6.05]),
  generic: [
    [4.7, 0.7],
    [4.7, 1.7],
    [4.7, 2.7],
    [4.7, 3.7],
    [4.7, 4.7],
    [4.7, 5.6],
  ],
};

/** Categorical accent per comp kind (off the reserved status hues). */
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
 * Cuboid geometry.
 * ----------------------------------------------------------------------- */
interface Cell {
  bx: number;
  by: number;
  fw: number;
  fd: number;
  h: number;
}

interface Faces {
  top: string;
  left: string;
  right: string;
  ground: string;
  ridge: string;
}

function faces(c: Cell): Faces {
  const x0 = c.bx - c.fw / 2;
  const x1 = c.bx + c.fw / 2;
  const y0 = c.by - c.fd / 2;
  const y1 = c.by + c.fd / 2;
  const A = iso(x0, y0);
  const B = iso(x1, y0);
  const C = iso(x1, y1);
  const D = iso(x0, y1);
  const up = ([x, y]: Pt): Pt => [x, y - c.h];
  const At = up(A);
  const Bt = up(B);
  const Ct = up(C);
  const Dt = up(D);
  return {
    top: poly([At, Bt, Ct, Dt]),
    left: poly([Dt, Ct, C, D]),
    right: poly([Bt, Ct, C, B]),
    ground: poly([A, B, C, D]),
    ridge: poly([Dt, Ct, Bt]),
  };
}

/* ----------------------------------------------------------------------- *
 * Layout — allocate slots to parts and collect cuboids, labels, link nodes.
 * ----------------------------------------------------------------------- */
interface Placed {
  part: HwTreeNode;
  cell: Cell;
  band: Band;
}
interface Label {
  part: HwTreeNode;
  x: number;
  y: number;
}

function layout(parts: HwTreeNode[]): {
  placed: Placed[];
  labels: Label[];
  byBand: Record<Band, Cell[]>;
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
  const byBand: Record<Band, Cell[]> = {
    cpu: [],
    gpu: [],
    nvswitch: [],
    nic: [],
    memory: [],
    dpu: [],
    osfp: [],
    generic: [],
  };

  const take = (band: Band, foot: { fw: number; fd: number; h: number }): Cell | null => {
    const idx = cursor[band];
    if (idx >= SLOTS[band].length) return null;
    cursor[band] = idx + 1;
    const [bx, by] = SLOTS[band][idx];
    const cell: Cell = { bx, by, ...foot };
    byBand[band].push(cell);
    return cell;
  };

  for (const part of parts) {
    const band = bandOf(part.comp);
    const want = Math.max(1, part.count ?? 1);
    const made: Cell[] = [];
    for (let k = 0; k < want; k++) {
      const cell = take(band, FOOT[band]);
      if (!cell) break;
      made.push(cell);
      placed.push({ part, cell, band });
    }
    // band exhausted before placing anything → spill one block into generic.
    if (made.length === 0) {
      const cell = take("generic", FOOT.generic);
      if (cell) {
        made.push(cell);
        placed.push({ part, cell, band: "generic" });
      }
    }
    if (made.length > 0) {
      const f = made[0];
      const [cx, cy] = iso(f.bx, f.by);
      labels.push({ part, x: cx, y: cy - f.h - 7 });
    }
  }

  return { placed, labels, byBand };
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
  const { placed, labels, byBand } = layout(parts);

  // Back-to-front paint order for correct 2.5D occlusion.
  const order = [...placed].sort(
    (a, b) => a.cell.bx + a.cell.by - (b.cell.bx + b.cell.by) || a.cell.bx - b.cell.bx,
  );

  // Board slab (fixed HGX-sized baseboard).
  const B = { x0: 0.25, y0: -0.12, x1: 5.15, y1: 6.5, h: 10 };
  const bl = iso(B.x0, B.y1);
  const fr = iso(B.x1, B.y1);
  const br = iso(B.x1, B.y0);
  const boardTop = poly([
    iso(B.x0, B.y0),
    br,
    fr,
    bl,
  ]);
  const boardFront = poly([bl, fr, [fr[0], fr[1] + B.h], [bl[0], bl[1] + B.h]]);
  const boardSide = poly([fr, br, [br[0], br[1] + B.h], [fr[0], fr[1] + B.h]]);

  // PCB traces (board surface, beneath the blocks).
  const c = (cell: Cell): Pt => iso(cell.bx, cell.by);
  const gpuA = byBand.gpu.filter((g) => g.by < 2.5);
  const links: { key: string; a: Pt; b: Pt; stroke: string; opacity: number; dash?: string }[] =
    [];
  // NVLink fabric: each GPU to the NVSwitches roughly above/below it.
  byBand.gpu.forEach((g, gi) =>
    byBand.nvswitch.forEach((s, si) => {
      if (Math.abs(g.bx - s.bx) <= 1.1)
        links.push({ key: `nv-${gi}-${si}`, a: c(g), b: c(s), stroke: "var(--cat-llm)", opacity: 0.22 });
    }),
  );
  // PCIe: each CPU to the near GPU bank.
  byBand.cpu.forEach((cpu, ci) =>
    gpuA.forEach((g, gi) =>
      links.push({
        key: `pci-${ci}-${gi}`,
        a: c(cpu),
        b: c(g),
        stroke: "var(--cat-router)",
        opacity: 0.18,
        dash: "3 3",
      }),
    ),
  );
  // Rail: each NIC to its nearest OSFP cage.
  byBand.nic.forEach((n, ni) => {
    let best: Cell | null = null;
    let bestD = Infinity;
    byBand.osfp.forEach((o) => {
      const d = Math.abs(o.bx - n.bx);
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    });
    if (best) links.push({ key: `rail-${ni}`, a: c(n), b: c(best), stroke: "var(--cat-io)", opacity: 0.24 });
  });

  return (
    <svg
      viewBox="86 74 532 288"
      className="h-full w-full"
      preserveAspectRatio="xMidYMid meet"
      width="100%"
      height="100%"
    >
      {/* board slab */}
      <polygon points={boardSide} fill="#10161d" stroke="#0b0f14" strokeWidth={1} />
      <polygon points={boardFront} fill="#141b23" stroke="#0b0f14" strokeWidth={1} />
      <polygon points={boardTop} fill="#181f28" stroke="#0b0f14" strokeWidth={1} />

      {/* title */}
      <text
        x={96}
        y={88}
        className="font-readout"
        fontSize={11}
        fill="var(--canvas-text-muted)"
        style={{ paintOrder: "stroke" }}
        stroke="#0e1116"
        strokeWidth={3}
      >
        {container.name}
      </text>
      <text x={96} y={101} className="font-readout" fontSize={8} fill="var(--canvas-text-dim)">
        {container.level} · tray topology
      </text>

      {/* PCB traces (under blocks) */}
      <g>
        {links.map((l) => (
          <line
            key={l.key}
            x1={r(l.a[0])}
            y1={r(l.a[1])}
            x2={r(l.b[0])}
            y2={r(l.b[1])}
            stroke={l.stroke}
            strokeWidth={0.9}
            strokeDasharray={l.dash}
            opacity={l.opacity}
          />
        ))}
      </g>

      {/* cuboids, back-to-front */}
      {order.map(({ part, cell }, i) => {
        const f = faces(cell);
        const selected = part.partId === selectedId;
        const accent = selected
          ? "var(--accent)"
          : (COMP_ACCENT[part.comp ?? ""] ?? "var(--canvas-text-muted)");
        return (
          <g
            key={`${part.partId}-${i}`}
            className="group/c cursor-pointer"
            onClick={(e) => onPick(part.partId, e.ctrlKey || e.metaKey)}
          >
            {selected && (
              <polygon points={f.ground} fill="none" stroke="var(--accent)" strokeWidth={1.4} opacity={0.55} />
            )}
            <polygon points={f.right} fill="#19212b" stroke="#11161d" strokeWidth={0.75} />
            <polygon points={f.left} fill="#232d38" stroke="#11161d" strokeWidth={0.75} />
            <polygon points={f.top} fill="#313c49" stroke="#11161d" strokeWidth={0.75} />
            {/* categorical / selection ridge along the front-top edges */}
            <polyline
              points={f.ridge}
              fill="none"
              stroke={accent}
              strokeWidth={selected ? 2 : 1.4}
              opacity={0.95}
            />
            {/* selection glow */}
            {selected && (
              <>
                <polygon points={f.top} fill="none" stroke="var(--accent)" strokeWidth={3.5} opacity={0.3} />
                <polygon points={f.top} fill="none" stroke="var(--accent)" strokeWidth={1.6} />
              </>
            )}
            {/* hover wash on the top face */}
            <polygon
              points={f.top}
              className="fill-[var(--canvas-text)] opacity-0 transition-opacity group-hover/c:opacity-[0.12]"
            />
          </g>
        );
      })}

      {/* labels (on top), clickable too */}
      {labels.map(({ part, x, y }) => {
        const selected = part.partId === selectedId;
        const nm = part.name.length > 26 ? `${part.name.slice(0, 25)}…` : part.name;
        const badge = part.count && part.count > 1 ? ` ×${part.count}` : "";
        return (
          <g
            key={`lbl-${part.partId}`}
            className="cursor-pointer"
            onClick={(e) => onPick(part.partId, e.ctrlKey || e.metaKey)}
          >
            <text
              x={r(x)}
              y={r(y)}
              textAnchor="middle"
              className="font-readout"
              fontSize={9}
              fill={selected ? "var(--accent)" : "var(--canvas-text)"}
              style={{ paintOrder: "stroke" }}
              stroke="#0e1116"
              strokeWidth={3}
            >
              {nm}
              {badge}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
