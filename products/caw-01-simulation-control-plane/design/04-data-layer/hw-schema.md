# Hardware Schema — CAW-01

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [data-model.md](./data-model.md), [../05-caw01-simulation-control-plane/canvas-3-hw-design.md](../05-caw01-simulation-control-plane/canvas-3-hw-design.md)
- **Schema:** `caw01-workbench/packages/core/src/schemas/hardware.ts`
- **Instance (UI projection):** `caw01-workbench/apps/web/features/simulation/model/fixtures/c3.ts`

## Purpose

A single, recursive, level-agnostic schema for expressing an **arbitrary hardware hierarchy as a digital twin** —
from a ~100 MW data-center room down to a tensor core inside a GPU SM. It is the validation contract behind
Canvas-3's fractal hardware schematic and the substrate simulators reason over. It is grounded in shipping
NVIDIA-class systems (GB200 NVL72, HGX/DGX H100, Hopper GH100), not invented.

The schema (`HwTwinNode`) is a **superset** of the lean persisted `HwNode` row in
[data-model.md](./data-model.md): the DB stores `id / experiment_id / parent_id / level / name / spec / part_id`;
the twin projection adds the denormalised composition (counts, roles, typed interconnects, nested children) the
renderers and simulators consume. The DB stays the source of truth.

## Level model

`HwTwinLevel` is a superset of `@caw/core` `HwLevel`. The core row enum stays the **narrow persisted contract**
(`data_center … component`); twins may be richer. Levels, top → bottom:

| Group | Levels | Notes |
| --- | --- | --- |
| Twin roots | `data_center`, `client` | server entry == data center; client entry == device |
| Room / floor | `zone`, `cluster`, `pod`, `row` | a `zone`/`cluster` is one power/cooling/network domain by cluster type; a `pod` is a Scalable Unit (8-9 NVL72 racks ≈ 576 GPUs, or an H100 SuperPOD SU = 256 GPUs) |
| Rack-scale | `rack`, `tray`, `node` | `tray` = 1RU compute / NVLink-switch / power / network tray |
| Package → silicon | `package`, `die`, `chip` | |
| Accelerators / host | `gpu`, `cpu`, `switch`, `nic`, `dpu`, `memory` | leaf-ish silicon |
| GPU internals | `gpc`, `sm`, `tensor_core`, `cache` | SM array, register file, L1/L2 |
| Generic | `component`, `interconnect` | |

> The web fixture keeps `level` within the **core** `HwLevel` enum (so it round-trips to `HwNode` rows) and uses
> two extra optional fields — `trayKind` (`compute|nvlink-switch|power|network`) and `comp`
> (`gpu|cpu|nvswitch|nic|dpu|osfp|hbm|sm|tensor|l2|cache|…`) — to carry the finer twin type that `HwTwinLevel`
> expresses natively in the core schema.

## Node model

```ts
HwTwinNode = {
  id: string;
  name: string;
  level: HwTwinLevel;
  role?: string;        // free-form function ("primary AI training fabric")
  count?: number;       // # identical instances this node stands for (e.g. 18 trays)
  clusterType?: ClusterType; // gpu|cpu|cxl|storage|cxmt|special|custom
  spec: Record<string, string | number | boolean>; // scalar readouts
  ports?: HwPort[];     // typed interconnect endpoints
  links?: HwLink[];     // explicit edges between parts
  children?: HwTwinNode[];
}
```

`count` is the key density trick: instead of enumerating all 132 SMs or all 18 compute trays, a node carries a
representative subtree plus `count`. The whole twin is `HwTwin = { version: 1, root: HwTwinNode }`.

## Component taxonomy

Captured faithfully from the research:

- **GB200 NVL72 rack** — 18 compute trays + 9 NVLink-switch trays + 8 power shelves; 72 Blackwell + 36 Grace;
  18 NVSwitch chips; 120 kW; 13.4 TB HBM3e; 130 TB/s all-to-all NVLink; passive copper spine (~5,000 cables).
- **GB200 compute tray** — 2× GB200 Superchip = 2 Grace + 4 Blackwell B200; **no NVSwitch in the tray** (NVLink
  exits via blind-mate connectors to the switch trays); 4× ConnectX-7, 2× BlueField-3.
- **HGX/DGX H100 node** (the web fixture's compute tray) — 8× H100 SXM5 + 4× 3rd-gen NVSwitch + 2× Xeon 8480C +
  8× ConnectX-7 400G + 2× BlueField-3 + OSFP cages; ~10.2 kW.
- **GPU internals (GH100, H100 SXM5)** — 132 SMs / 8 GPCs; each SM = 4 processing blocks (4 tensor cores, 128
  FP32, 256 KiB L1/shared, 256 KiB register file); 50 MiB L2 (2 partitions); 5× HBM3 stacks (80 GiB, 3.35 TB/s);
  18 NVLink-4 links (900 GB/s); PCIe Gen5 x16.
- **Alt zones** — `cpu` head/orchestration, `cxl` pooled memory (CMM-B + CXL switch), `storage` NVMe-oF/GPUDirect,
  `cxmt` PIM/PNM near-memory (flagged internal/custom), `special` network spine + OOB management.

## Interconnect model

`HwPort` (an endpoint a node exposes) and `HwLink` (an explicit edge between two `id`s) share `InterconnectKind`:

| Kind | Use | Example bw |
| --- | --- | --- |
| `nvlink` | scale-up GPU↔GPU / GPU↔NVSwitch | 1.8 TB/s (NVLink5) / 900 GB/s (NVLink4) |
| `nvlink-c2c` | coherent Grace↔Blackwell | 900 GB/s |
| `pcie` | host link | 128 GB/s (Gen5 x16) |
| `cxl` | disaggregated/pooled memory | PCIe 6.0 PHY, ~150-400 ns |
| `osfp` | optical cage (carries IB/Ethernet) | twin-port 400G / 800G |
| `ib` | InfiniBand (NDR/XDR) | 400/800 Gb/s |
| `ethernet` / `roce` | Spectrum-X lossless AI fabric | 800GbE |
| `nvme-of` | storage fabric (GPUDirect) | 200-400G |
| `busbar` | DC power distribution | ~50 V DC |
| `coolant` | liquid cooling loop | 80 lpm/rack |
| `hbm` | on-package memory bus | 3.35-8 TB/s |

```ts
HwPort = { id; kind; bw?; count?; gen?; role? }
HwLink = { id; from; to; kind; bw?; count?; note? }
```

A port is "this GPU has 18 NVLink links"; a link is "this compute tray → that NVSwitch tray over the copper
spine (130 TB/s, ~5,000 cables)".

## Example instance (YAML)

A small data center → GPU cluster → GB200-style rack → compute tray → H100 GPU → internals:

```yaml
version: 1
root:
  id: dc/room-a
  name: Data center (room A)
  level: data_center
  role: ~100 MW AI room organised into zones by cluster type
  spec: { it_power_mw: 91, pue: 1.1, cooling: "70% liquid / 30% air" }
  children:
    - id: dc/zone/gpu
      name: gpu-compute-zone
      level: cluster
      clusterType: gpu
      role: primary AI training/inference fabric
      spec: { racks: "~500-650", gpus: "~40,000-47,000", rack_unit: GB200 NVL72 }
      children:
        - id: gpu/rack-0
          name: GB200 NVL72
          level: rack
          spec: { compute_trays: 18, nvlink_switch_trays: 9, gpus: 72, power_kw: 120 }
          links:
            - { id: spine, from: gpu/rack-0/tray/compute-*, to: gpu/rack-0/tray/nvswitch-*,
                kind: nvlink, bw: 130 TB/s, count: 5184,
                note: passive copper NVLink spine, saves ~20 kW vs optics }
          children:
            - id: gpu/rack-0/tray/compute-0
              name: compute-tray-0
              level: tray            # trayKind: compute
              role: HGX 8-GPU baseboard node
              spec: { gpus: 8, power_w: 10200, system_memory: 2 TB DDR5 }
              ports:
                - { id: cx7, kind: osfp, count: 8, bw: 400 Gb/s, role: scale-out }
              children:
                - id: gpu/rack-0/tray/compute-0/gpu-0
                  name: h100-sxm5-0
                  level: gpu          # comp: gpu
                  spec: { memory: 80 GiB HBM3, mem_bw: 3.35 TB/s, tdp_w: 700 }
                  ports:
                    - { id: nvlink, kind: nvlink, gen: "4", count: 18, bw: 900 GB/s }
                    - { id: pcie, kind: pcie, gen: Gen5, count: 16, bw: 128 GB/s }
                  children:
                    - id: .../gpu-0/die
                      name: gh100-die
                      level: die
                      spec: { process: TSMC 4N, area_mm2: 814, transistors: 80 B, enabled_sms: 132 }
                      children:
                        - id: .../gpu-0/sm-array
                          name: sm-array
                          level: sm
                          count: 132
                          spec: { fp32_cores: 16896, tensor_cores: 528, fp16_tc: 989 TFLOPS }
                          children:
                            - id: .../sm-0
                              name: sm (representative)
                              level: sm
                              spec: { fp32: 128, tensor_cores: 4, l1_shared: 256 KiB }
                              children:
                                - { id: .../sm-0/tc, name: tensor-core, level: tensor_core,
                                    count: 4, spec: { dtypes: FP8/FP16/BF16/TF32/FP64 } }
                                - { id: .../sm-0/rf, name: register-file, level: cache,
                                    spec: { size: 256 KiB } }
                        - { id: .../gpu-0/l2, name: l2-cache, level: cache,
                            spec: { size: 50 MiB, partitions: 2 } }
                        - { id: .../gpu-0/hbm, name: hbm3-stack, level: memory,
                            count: 5, spec: { capacity: 80 GiB, bandwidth: 3.35 TB/s } }
            - id: gpu/rack-0/tray/nvswitch-0
              name: nvlink-switch-tray-0
              level: tray            # trayKind: nvlink-switch
              count: 9
              spec: { nvswitch_chips: 2, tray_bw: 14.4 TB/s }
```

## What the renderers must read

The web fixture (`HwTreeNode`) keeps these exports unchanged in name/signature — `HwTreeNode`, `HwSpec`,
`c3Root`, `c3PartsById`, `resolveC3Level`, `C3Crumb`, `C3Level` — and adds optional fields renderers/inspectors
read: **`role?`**, **`count?`**, **`trayKind?`** (`compute|nvlink-switch|power|network`), **`comp?`** (component
kind). `partId` remains the picking identity; `level` + `clusterType` drive glyph selection; `count` lets a node
stand for N siblings without enumeration.

## Sources

- NVIDIA GB200 NVL72 — <https://www.nvidia.com/en-us/data-center/gb200-nvl72/>
- DGX GB200 hardware guide — <https://docs.nvidia.com/dgx/dgxgb200-user-guide/hardware.html>
- GB200 OCP contribution (ORv3/MGX) — <https://developer.nvidia.com/blog/nvidia-contributes-nvidia-gb200-nvl72-designs-to-open-compute-project/>
- SemiAnalysis GB200 architecture — <https://newsletter.semianalysis.com/p/gb200-hardware-architecture-and-component>
- HGX H100 platform — <https://developer.nvidia.com/blog/introducing-nvidia-hgx-h100-an-accelerated-server-platform-for-ai-and-high-performance-computing/>
- DGX H100 hardware guide — <https://docs.nvidia.com/dgx/dgxh100-user-guide/introduction-to-dgxh100.html>
- Hopper architecture in depth (GH100) — <https://developer.nvidia.com/blog/nvidia-hopper-architecture-in-depth/>
- Quantum-X800 InfiniBand — <https://www.nvidia.com/en-us/networking/products/infiniband/quantum-x800/>
- Spectrum-X / xAI Colossus — <https://nvidianews.nvidia.com/news/spectrum-x-ethernet-networking-xai-colossus>
- CXL memory pooling 2025 — <https://introl.com/blog/cxl-4-0-infrastructure-planning-guide-memory-pooling-2025>
- NVMe / GPUDirect storage — <https://introl.com/blog/ai-optimized-storage-nvme-gpudirect-parallel-file-systems-2025>
- Samsung near-memory (HBM-PIM / CXL-PNM / CMM-B) — <https://semiconductor.samsung.com/news-events/tech-blog/near-memory-solutions-for-the-ai-era/>
- 100 MW hyperscale AI blueprint — <https://www.nvent.com/en-us/data-solutions/100-mw-hyperscale-ai-data-center-blueprint>
- ChangXin Memory Technologies (CXMT) — <https://en.wikipedia.org/wiki/ChangXin_Memory_Technologies>
