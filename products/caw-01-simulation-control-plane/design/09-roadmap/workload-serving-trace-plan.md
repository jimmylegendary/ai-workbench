# Plan — Workload trace viz · Serving tool pipeline · Simulation granularity

> Category: Roadmap / implementation plan
> Split into **[ME]** = what Claude builds in the web app now, and **[AI]** = runbook work for the in-company
> AI (real trace data + real tools + engine internals). Consistent with
> [ADR-0005 trace pipeline](../01-decisions/ADR-0005-trace-pipeline.md) and
> [ADR-0009 abstracted tiling IR](../01-decisions/ADR-0009-abstracted-tiling-ir.md).

## Interview decisions (2026-07)

1. **Trace format** = JSON/JSONL, structure shareable → build a canonical model + JSON/JSONL loader + **adapter
   interface** + example fixtures now; the real field mapping is **[AI]**.
2. **Session→turn** = one **session file contains many turns** → `loadSession → turns[] → turn list → select →
   visualize that turn`.
3. **Serving REST tools** (vLLM / LLMServingSim / syntorch / ASTRA-sim) = **all TBD** → build `ToolPort`
   interfaces + **mock stubs** + an orchestrator now; the real REST clients are **[AI]**.
4. **Abstracted tiling IR** = write an **ADR draft** now ([ADR-0009](../01-decisions/ADR-0009-abstracted-tiling-ir.md)); the engine implementation is **[AI]**.

## How it all fits (one picture)

```
Workload (C1) — REAL axis                Serving (C2) — SYNTHETIC + SIM axes
┌───────────────────────────┐          ┌───────────────────────────────────────────────┐
│ session file (JSON/JSONL) │          │ for each server/LLM call in the turn:           │
│  → turns[]  → turn list   │  select  │  orchestrator(HW cfg, granularity):             │
│  → pick a turn            │ ───────▶ │   vLLM│LLMServingSim → syntorch → Chakra ET      │
│  → visualize turn trace   │  server  │   → ASTRA-sim (network only)                    │
│    (harness graph +       │  call    │  all tools are HW-schema-aware (Canvas 3)       │
│     timings/tokens/args)  │          └───────────────┬───────────────────────────────┘
└───────────────────────────┘                          │ Chakra → L0 lowering (ADR-0005 §5)
        HW twin (C3) ────────────────────────────┐     ▼
        parameterizes every tool + the sim       └▶ Sim Result: real / synthetic / sim axes
```

The company **agent trace = the REAL axis** (ADR-0005 §6: one agent turn = Canvas-1 unit, validation anchor).
Its **server/LLM calls** are what drive the **synthetic/sim** serving pipeline. The three axes already exist in
`sim_result_metric` (`real|synthetic|sim`) → results converge on the existing **Sim Result** page.

## Simulation granularity — L0 / L1 / L2 (the UI selector)

The requirement's `lev0/1/2` = **run granularity presets**. They select *capture altitude + which IR
annotations get filled ([l0-ir-schema](../05-caw01-simulation-control-plane/l0-ir-schema.md) fill-levels) +
which simulators run*. (Note the name clash: ADR-0005's L0/L1/L2 are IR-*fill* levels; these are *run*
granularities. Mapping below; the UI labels them **Level 0/1/2** with subtitles.)

| UI granularity | Capture altitude (syntorch) | Chakra fill | Compute/memory | Network | Speed |
|---|---|---|---|---|---|
| **L0** torch·analytical | torch level | op DAG (IR L0) | **syntorch analytical** from HW schema | — (no ASTRA-sim) | fastest |
| **L1** torch → ASTRA-sim | torch level | op DAG (IR L0) | analytical | **ASTRA-sim** | medium |
| **L2** os·kernel+memory | os level (kernel tiling, mem mgmt) | + tiling/residency **side-channel** (IR L1/L2) | **kernel+memory model** ([AbstractTilingPlan](../01-decisions/ADR-0009-abstracted-tiling-ir.md), syntorch/external TBD) | **ASTRA-sim** | slowest |

The UI exposes this as a 3-way selector (fidelity ↔ time trade-off, with a one-line "why" each), wired to which
pipeline path the orchestrator runs.

---

## Part A — Workload trace visualization

### [ME] — build now (web app)
- **Canonical model** in `@caw/core` (`schemas/agent-trace.ts`, Zod): `AgentSession → Turn[] → Step[]` where a
  Step has `{ id, kind (io|router|llm|tool|memory|server), name, startedAt, endedAt, durationMs?, tokens?{in,out},
  cost?, args?, result?, execLocation (client|server), parentId?, status }`. Session/turn carry summaries
  (total latency, tokens, #tool calls, #server calls).
- **Adapter seam**: `TraceAdapter { detect(raw): boolean; parseSession(raw): AgentSession }` + a **JSON/JSONL
  loader** (file upload + `JSON.parse` / line-split) that runs the active adapter. Ship a **`genericAdapter`**
  (best-effort) + **example fixtures** (`fixtures/agent-trace.example.json[l]`).
- **Workload screen**: upload/pick a session → **turn list** panel (index, latency, tokens, #calls, status) →
  select → **turn trace viz**: extend the existing C1 React-Flow harness graph to render real steps (typed
  nodes, control/data edges, exec-location badge), a **step inspector** (timings/tokens/args/result), and a
  **turn summary** header. Add a **step timeline / gantt** as a second view mode.
- Store (`features/workload/`) + wiring: upload → adapter → state → render; selected turn ↔ existing
  cross-canvas selection where it makes sense.
- Persistence (metadata-only, later): a `trace_session` table (name, source, turn_count, uri-pointer to the
  blob) — the raw session blob is an artifact by URI, per [ADR-0002](../01-decisions/ADR-0002-data-layer.md)/[ADR-0008](../01-decisions/ADR-0008-auth-and-data-supabase.md).

### [AI] — runbook
- **Real `TraceAdapter`**: map the actual company trace format → `AgentSession` (using real trace files);
  confirm turn delimitation, step kinds, timing/token/arg field names, server-call identification.
- Decide any format-version handling + large-session streaming/perf.

---

## Part B — Serving tool pipeline

### [ME] — build now (web app)
- **Tool contracts** (`@caw/core`): a typed **Chakra-ET subset** (`ChakraNode {id, type: COMP|COMM|MEM,
  name, data_deps[], num_ops?, tensor_size?, comm_type?, comm_size?}`) + `SimResult` + `HwConfigRef`.
- **`ToolPort` interfaces**, one per tool, all taking a HW config: `VllmPort` / `LlmServingSimPort` /
  `SyntorchPort` (`captureChakra(call, hw, granularity) → ChakraTrace`) / `AstraSimPort`
  (`simulate(chakra, hw) → SimResult`). REST-shaped (base URL from env), but behind the port so the app
  doesn't hard-depend on any wire format yet.
- **Mock stubs** implementing every port (plausible Chakra + SimResult synthesized from the HW schema, reusing
  `hwCapability`), so the **full pipeline runs end-to-end locally** with no real tools.
- **Orchestrator** (`features/serving/model/pipeline.ts`): `(serverCall, hwConfig, granularity) → runs the
  L0/L1/L2 path → ChakraTrace (+ tiling sidecar at L2) → SimResult`, streaming step logs into the existing
  SimLog and results into `sim_result_metric` (synthetic + sim axes).
- **Granularity selector** UI (L0/L1/L2) + **HW-schema binding** (reads current Canvas-3 selection →
  `hwCapability` → passed to every port). Extend the C2 serving canvas to show the tool pipeline + which tools
  run per granularity + a Run button.
- **Config/env**: `.env` entries for each tool base URL (commented, filled later), consistent with the existing
  `.env.example` pattern.

### [AI] — runbook
- **Real REST clients** for vLLM / LLMServingSim / syntorch / ASTRA-sim against their actual contracts (replace
  stubs); pin versions per [ADR-0005](../01-decisions/ADR-0005-trace-pipeline.md) §8.
- **Real Chakra export** (syntorch below-torch capture; os-level for L2) + **ASTRA-sim** invocation (analytical
  default) + the **Chakra → L0 lowering** (ADR-0005 §5) — much of this already scoped in
  `10-runbooks/phase-4-trace-pipeline`.
- Wire the orchestrator's HW config to syntorch HW logic **and** ASTRA-sim system/network config (one HW model,
  two consumers).

---

## Part C — Abstracted tiling IR (L2)

- **[ME]** — [ADR-0009](../01-decisions/ADR-0009-abstracted-tiling-ir.md) draft (done, this change); web app
  shows the tiling plan **read-only** in a per-op inspector at granularity L2.
- **[AI]** — implement the `AbstractTilingPlan` sidecar producer + the L2 kernel/memory cost model; extend the
  HW schema with the required L2 parameters (ADR-0009 open-Q 4).

---

## Persistence (metadata-only, per ADR-0008)

New tables (a later migration `0005_workload_serving.sql`): `trace_session` (uploaded sessions; blob by URI),
`serving_run` (a pipeline execution: granularity, hw ref, tool versions, chakra/ir/result URIs) — heavy Chakra
/ IR / tiling blobs stay in the artifact store, referenced by URI. Results still land in `sim_result_metric`.

## Phasing (build order — [ME])

1. **Canonical models + fixtures** (`@caw/core` agent-trace + chakra/simresult types) — no UI risk, unlocks all.
2. **Workload viewer** (loader + adapter + turn list + turn viz) — highest user value, self-contained.
3. **Serving ports + mock stubs + orchestrator + granularity selector** — end-to-end demoable on mocks.
4. **Wire results → SimLog + sim_result_metric**; L2 tiling read-only inspector.
5. **Persistence tables** + metadata wiring.
6. **Runbooks** for [AI] (adapter, REST clients, chakra/astra/lowering, tiling model) under `10-runbooks/`.

Each phase: `tsc` + `next build` clean → dev verify → commit+push (standing rule).

## Assumptions baked in (correct me)

- Workload viewer reuses the C1 harness-graph visual language (typed nodes) rather than a brand-new viz.
- Granularity selector lives in the Simulation control column next to the existing Serving Options.
- Mock stubs are acceptable as the local default until [AI] wires real tools (mirrors current engine stub).
- Terminology: UI "Level 0/1/2" = run granularity; keep ADR-0005 "L0/L1/L2" for IR fill-levels (mapped above).

## TODO (corpus invariant)
- Korean mirror for [ADR-0009] + this plan (EN↔KO pairing) — after plan is approved.
