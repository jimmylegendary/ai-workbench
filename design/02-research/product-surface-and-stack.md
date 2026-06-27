# Product Surface & Stack

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [SOURCE-BRIEF](../_meta/SOURCE-BRIEF.md)
  - [ADR-0001 Product surface](../01-decisions/ADR-0001-product-surface.md)
  - [ADR-0003 Frontend stack](../01-decisions/ADR-0003-frontend-stack.md)
  - [ADR-0005 Trace pipeline boundaries](../01-decisions/ADR-0005-trace-pipeline.md)
  - [Data layer options](./data-layer-options.md)
  - [Trace pipeline & syntorch boundary](./trace-capture-and-chakra.md)
  - [L0 IR schema](../05-caw01-simulation-control-plane/l0-ir-schema.md)
  - [Change management / work tree](../05-caw01-simulation-control-plane/change-management-worktree.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## Purpose

This document decides **how many product surfaces CAW-01 exposes, what each is for, and how they all sit on one
shared core** so that the web UI, an MCP server, and a CLI never drift into three different products. It defines
the layered architecture (UI surfaces → shared core/services → engine adapters → data layer), a capability→surface
matrix, and — critically — the **boundary between the TypeScript/Next.js side and the Python simulation/trace side**
(syntorch, LLMServingSim, ASTRA-sim, Chakra).

It does **NOT** decide the data-store technology (that is [data-layer-options.md](./data-layer-options.md) /
ADR-0002), the canvas rendering tech (ADR-0004), or the internal trace-capture mechanics of syntorch (ADR-0005 /
[trace-capture-and-chakra.md](./trace-capture-and-chakra.md)). It elaborates, but does not redefine, the
3-canvas / 1:9 / nav-bar / work-tree UI fixed by the SOURCE-BRIEF.

---

## 1. The surfaces, and why three

The brief fixes the answer at the top level: **Next.js web app = primary human surface; MCP server + CLI =
automation surfaces; "skill" = packaged workflow.** The job of this doc is to make that real without building three
backends.

| Surface | Primary user | What it is good at | What it must NOT become |
|---|---|---|---|
| **Web app (Next.js)** | Domain expert (Jimmy + reviewers) | The 3-canvas authoring surface, run lifecycle, evidence/projection readouts, work-tree review | A thin client that re-implements engine logic in the browser |
| **MCP server** | Other agents (the Company AI Workbench substrate, Claude, etc.) | Letting an agent compose/run experiments, read traces/metrics, query the registry as **tools + resources** | A second, divergent API with its own validation rules |
| **CLI** | Humans in a terminal + CI/scripts | Reproducible batch runs, scripted experiment sweeps, smoke tests, fixture generation | A "real" product feature set that outgrows the core |

**Design rule (the whole point):** all three are **thin adapters over one shared core**. A new capability is added
**once** in the core and then *projected* onto whichever surfaces should expose it. The web app is allowed extra
*presentation* concerns (canvases, coordination), but never extra *domain* logic.

---

## 2. Layered architecture

```
┌──────────────────────────── UI / ENTRY SURFACES (thin) ─────────────────────────────┐
│  Next.js web app            MCP server (TS)            CLI (TS)                       │
│  - app-router pages         - tools (actions)          - commands                     │
│  - server actions           - resources (read)         - flags → core calls           │
│  - route handlers           - prompts (skill templates)- text/JSON output             │
└───────────────┬──────────────────────┬────────────────────────┬──────────────────────┘
                │  all call the SAME functions (no surface owns domain logic)            │
                ▼                       ▼                        ▼
┌──────────────────────── SHARED CORE / SERVICES (TypeScript) ────────────────────────┐
│  @caw/core  — pure-ish application services + domain types                            │
│   • ExperimentService  (compose workload × serving × hardware → runnable spec)        │
│   • RunService         (start/stop/status lifecycle, run state machine)               │
│   • RegistryService    (models, serving frameworks, HW catalog, strategy-ids)         │
│   • WorkTreeService    (per-item / full save, versioning — see ADR-0007)              │
│   • EvidenceService    (trace artifacts, metrics, trust-ladder status, projections)   │
│   • Zod schemas = the ONE contract reused by UI, MCP, CLI                             │
└───────────────┬──────────────────────────────────────────────────────────────────────┘
                │  typed adapter interfaces (engine-agnostic ports)                      │
                ▼
┌──────────────────────── ENGINE ADAPTERS (TS ports → Python) ────────────────────────┐
│  SimEnginePort        → drives LLMServingSim → syntorch → ASTRA-sim (+ SST)           │
│  TraceCapturePort     → vLLM(torch→syntorch) sub-torch trace + Chakra exporter        │
│  HwDesignPort         → syntorch HW design layer (chip/die/package/tray/rack/cluster) │
│  IngestPort           → OTel trace ingest (real-measurement axis)                     │
│  --- process boundary (TS ⇆ Python) lives HERE; see §6 ---                            │
└───────────────┬──────────────────────────────────────────────────────────────────────┘
                ▼
┌──────────────────────────────── DATA LAYER ─────────────────────────────────────────┐
│  Knowledge substrate · Simulation substrate · HW design substrate · Work-tree         │
│  (relational / vector / graph / md-first — decided in ADR-0002)  +  artifact store     │
│  for large trace files (Chakra ET, OTel, raw sub-torch dumps)                         │
└───────────────────────────────────────────────────────────────────────────────────┘
```

The invariant: **arrows point downward only.** Surfaces depend on the core; the core depends on adapter *ports*
(interfaces), not concrete engines; adapters own the messy TS⇆Python boundary; the data layer is reached through
repository interfaces so storage tech (ADR-0002) can change without touching surfaces.

---

## 3. Next.js app-router architecture (the human surface)

Grounded in current Next.js (App Router is the default and recommended router; React Server Components are the
default, Server Actions and Route Handlers are first-class).

### 3.1 Server vs Client components — the split for the 3 canvases

| Piece | Component kind | Rationale |
|---|---|---|
| Nav bar, page shell, run-history lists, evidence/projection readouts | **Server Components** | Data-fetch on the server, zero JS shipped, direct repository access via the core |
| Left **Control Panel** (start/stop/save buttons, status) | **Client** islands inside a server shell | Needs interactivity + live status; calls server actions |
| **Canvas 1** AI Workload Flow (node graph → L0 IR) | **Client** (node-graph lib, ADR-0004) | Highly interactive; hydrated with server-fetched spec |
| **Canvas 2** Serving & Representation selection | **Client** with server-fetched registry | Selection state + cross-canvas coordination |
| **Canvas 3** Hardware Design (chip→cluster hierarchy) | **Client** (likely 3D/canvas, ADR-0004) | Heavy interactive editing of HW tree |
| Cross-canvas coordination state | **Client** store (e.g. Zustand/Jotai), persisted via server actions | Selections in one canvas reflect in others (brief §5) |

Pattern: **server shell, client islands.** Each page is a Server Component that fetches the experiment + work-tree
snapshot through the core and passes it as props into client canvas islands. The canvases are interactive and own
ephemeral UI state; **every durable mutation goes back through a server action → core service** (so the same
WorkTreeService rule applies whether the change came from the UI, MCP, or CLI).

### 3.2 Server Actions vs Route Handlers — when to use which

The brief's UX is a control plane, not a REST API, so mutations should *feel* local. We use both, deliberately:

| Mechanism | Use it for | Examples in CAW-01 |
|---|---|---|
| **Server Actions** (`'use server'` async fns) | Human-initiated mutations from the UI; form-shaped, progressive-enhancement, no hand-written fetch/JSON | save work-tree item / full save, start/stop a run, edit a HW component, compose an experiment |
| **Route Handlers** (`app/api/**/route.ts`) | Anything needing a stable HTTP contract: streaming run status (SSE), webhooks from long Python jobs, large artifact download, health checks | `GET /api/runs/:id/stream`, `POST /api/internal/run-callback`, `GET /api/artifacts/:id` |

Rule of thumb: **Server Actions for "the human clicked a button in the app"; Route Handlers for "a machine/stream
needs a URL."** Both are thin — they validate with the shared Zod schema and delegate to a core service. The
**MCP server and CLI never use server actions or route handlers**; they import the core services directly. This keeps
the core the single place domain logic lives, and avoids one surface calling another surface's HTTP layer.

### 3.3 Where the Python simulation engine fits relative to Next.js

Next.js (Node runtime) **does not run the simulation in-process.** A SimulationRun is a long, heavy, Python-native
job (LLMServingSim → syntorch → ASTRA-sim + SST). Node's role is to *orchestrate and observe*, not compute. The
engine sits behind an **engine-adapter port** (§5) and runs as Python (§6). The web app starts a run via
RunService, then streams status through a Route Handler (SSE) while the Python job reports progress.

---

## 4. The automation surfaces

### 4.1 MCP server — the same engine/registry for other agents

The MCP TypeScript SDK exposes three context types; we map CAW-01 onto them directly:

| MCP primitive | CAW-01 mapping | Examples |
|---|---|---|
| **Tools** (actions / side effects) | The verbs of the core — compose, run, save, ingest | `compose_experiment`, `start_run`, `stop_run`, `save_worktree`, `ingest_otel_trace` |
| **Resources** (read-only data) | The nouns — registry + evidence, addressable by URI | `caw://registry/serving-frameworks`, `caw://runs/{id}/status`, `caw://runs/{id}/metrics`, `caw://traces/{id}`, `caw://ir/{id}` (L0/L1/L2) |
| **Prompts** (reusable templates) | Packaged **skills** (§5.x) surfaced as prompt templates | `skill: project-workload-to-memory-requirement`, `skill: compare-two-hardware-configs` |

Because every MCP tool is a one-line wrapper over a core service using the **same Zod schema**, an agent gets exactly
the validation and behavior a human gets in the UI. The MCP server runs as its own process (stdio for local agents,
Streamable HTTP for remote), importing `@caw/core`. It exposes the **registry and engine** the brief asks for: an
agent can list serving frameworks, compose a run ("serve with vLLM, swap torch→syntorch"), launch it, and read back
Chakra traces / metrics / the memory-annotated IR as resources.

### 4.2 CLI — shares the core, scripts the workflow

The CLI is a TypeScript binary (e.g. built on a standard arg parser) that imports `@caw/core` exactly like the MCP
server does. It exists for reproducibility and CI: scripted sweeps, fixture generation, deterministic smoke tests.

```
caw experiment compose --workload turn.json --serving vllm+syntorch --hw cluster-a.json
caw run start --experiment exp_123 --watch         # streams status, exits on terminal state
caw run status exp_123 --json                       # machine-readable for CI
caw trace export exp_123 --format chakra -o out/    # pull Chakra ET artifact
caw ir show exp_123 --fill-level L1                  # inspect memory-annotated IR
```

The CLI emits human text by default and `--json` for pipelines. It is intentionally a **subset** of the core: it must
never grow logic the UI/MCP don't have. If a command needs new behavior, that behavior is added to the core service
and then *also* becomes available to UI and MCP.

### 4.3 What a "skill" means in the Company AI Workbench context

A **skill** here is a **packaged, named workflow** — a reusable recipe that composes core services into a
higher-order operation, with declared inputs/outputs and an evidence contract. It is *not* a new engine and *not* a
new API; it is choreography over the existing core.

A skill definition (lives in the core, surfaced on every surface):

```ts
interface Skill {
  id: string;                       // e.g. "project-workload-to-memory-requirement"
  title: string;
  inputs: ZodSchema;                // validated identically everywhere
  steps: SkillStep[];               // calls to core services (compose → run → read IR → derive metric)
  produces: string[];               // artifact/entity kinds, e.g. ["MemoryAnnotatedIR","MemoryProductRequirement"]
  evidenceContract: {               // trust-ladder honesty (brief §1)
    requires: ("OTel"|"Chakra"|"syntorch")[];
    validatesAgainst?: "A100/OTel";
  };
}
```

Surface projection of one skill:
- **Web app:** a guided action in the Control Panel (a multi-step run with progress + evidence readouts).
- **MCP:** a `prompt` template (the agent-facing entry) that drives the same skill tools.
- **CLI:** `caw skill run project-workload-to-memory-requirement --input ...`.

This is what makes "MCP/CLI = automation surfaces" concrete: the *unit of automation* is a skill, and a skill is just
a named path through the one core.

---

## 5. Capability → surface matrix

| Capability | Web app | MCP | CLI | Notes |
|---|---|---|---|---|
| Compose experiment (workload × serving × hardware) | ✅ (3 canvases) | ✅ tool | ✅ cmd | Canvases are a UI-only authoring affordance over the same spec |
| Edit HW hierarchy (chip→cluster, micro-level) | ✅ (Canvas 3) | ✅ tool (structured edits) | ✅ (from file) | Fine-grained visual edit is UI-primary; MCP/CLI take structured patches |
| Author workload flow / L0 IR | ✅ (Canvas 1) | ◑ tool (structured) | ◑ (from file) | Free-form graph authoring is UI-strong; agents submit structured graphs |
| Start / stop / status of a run | ✅ | ✅ | ✅ | Core RunService; UI/Route-Handler stream, CLI `--watch`, MCP status resource |
| Work-tree per-item / full save | ✅ | ✅ | ✅ | One WorkTreeService (ADR-0007); identical semantics |
| Read trace artifacts (OTel / Chakra / sub-torch) | ✅ (viewer) | ✅ resource | ✅ export | Large artifacts via artifact store + signed URL / file path |
| Read metrics / projections | ✅ readouts | ✅ resource | ✅ `--json` | Comparable projection is core-computed, not surface-computed |
| Inspect memory-annotated IR (L0/L1/L2) | ✅ | ✅ resource | ✅ | Same schema, different fill level (brief §1) |
| Ingest real-measurement OTel trace | ◑ (upload) | ✅ tool | ✅ cmd | Automation-leaning; UI offers upload |
| Run a packaged **skill** | ✅ guided | ✅ prompt+tools | ✅ `skill run` | The unit of automation |
| Registry browse (models/frameworks/HW catalog/strategy-ids) | ✅ | ✅ resource | ✅ list | RegistryService |
| Trust-ladder / evidence-completeness status | ✅ (control-plane feel) | ✅ resource | ✅ `--json` | Honesty surface required by brief §1 |

Legend: ✅ first-class · ◑ supported but secondary/structured-only.

The matrix encodes a deliberate asymmetry: **visual authoring (free-form canvas graph + micro-level HW edits) is
web-primary**; **everything that is a verb or a fact (run, save, read, ingest, project) is equal on all three
surfaces** because it is core logic.

---

## 6. The TypeScript ⇆ Python boundary (the load-bearing decision)

This is the most consequential boundary in the stack. **TS owns orchestration, UI, contracts, persistence, and the
agent/automation surfaces. Python owns the simulation and trace world** — that is where syntorch (drop-in torch
frontend with custom kernels/HW logic), the Chakra exporter, LLMServingSim, ASTRA-sim, and SST live, and where the
HW-design layer executes. The line is drawn at the **engine-adapter ports** in §2.

### 6.1 What lives on each side

| Concern | Side | Why |
|---|---|---|
| Web UI, server actions, route handlers | **TS** | Next.js |
| Core services, domain types, Zod contracts | **TS** | One contract for all surfaces |
| MCP server, CLI | **TS** | Same core import |
| Persistence / repositories | **TS** | Data layer ADR-0002 reached from core |
| syntorch (torch→syntorch swap inside vLLM, custom kernels/HW logic, tiling/partitioning strategy-ids) | **Python** | It IS a Python package (brief §7); cannot be reimplemented in TS |
| Chakra exporter (sub-torch trace → Chakra ET) | **Python** | Lives with syntorch; produces MLCommons ET |
| LLMServingSim / ASTRA-sim / SST drivers | **Python** | Native Python/C++ simulators |
| HW-design *execution/validation* (chip→cluster) | **Python** | syntorch HW design layer is the source of truth; UI Canvas 3 is its editor/visualizer |
| HW-design *authoring state / work-tree* | **TS** | Versioned in the data layer; handed to Python as a config |

### 6.2 How the two sides talk — options

| Option | How | Pros | Cons | Fit |
|---|---|---|---|---|
| **A. Separate Python service (FastAPI sidecar)** | TS core calls a long-running Python HTTP/gRPC service that wraps the engines; long runs report back via callback Route Handler + SSE | Clean process isolation; Python deps (torch/syntorch/CUDA) stay out of Node; horizontally scalable; survives Node restarts; matches long-job reality | Two deployables; needs a job/queue + status contract; serialization at the seam | **Recommended default** for SimulationRun + trace capture |
| **B. Subprocess (Node spawns Python per run)** | `child_process` runs a Python CLI entry; stream stdout/JSON-lines; artifacts to shared store | Simplest to start; no service to host; great for CLI/CI and local dev | Node lifecycle coupled to job; weak backpressure; messy for concurrent/long runs; harder to scale | Good for **local dev, CLI, and short HW-design validation calls**; acceptable bootstrap before A exists |
| **C. Message queue / job runner** | Core enqueues a run; Python workers consume; results land in data layer; surfaces poll/subscribe | Best for batch sweeps, retries, many concurrent runs; decouples surfaces from workers | Most infra; eventual-consistency UX; overkill early | **Phase-2** scale path once sweep volume grows |
| **D. In-process bridge (PyodideMcp / node-calls-python)** | Embed Python in Node | No network seam | Fragile with native/CUDA deps; blocks event loop; not viable for heavy sim | **Rejected** for the engine |

**Recommendation:** start with **B (subprocess)** to bootstrap and to power the CLI/local-dev path, but design the
**SimEnginePort/TraceCapturePort/HwDesignPort interfaces so that swapping in A (FastAPI/gRPC sidecar) is a config
change, not a refactor.** Migrate the heavy SimulationRun path to A as soon as runs become long/concurrent; keep B
for short, synchronous HW-design validation calls. Reserve C for when experiment sweeps demand a queue. Because all
three sit behind the same port, the core and all surfaces are unaffected by the choice.

### 6.3 The contract at the seam

- **Interchange formats are explicit and versioned:** experiment spec + HW config go **TS→Python as JSON**; the
  engine returns **Chakra ET** (MLCommons standard, consumed by ASTRA-sim), **metrics JSON**, and the
  **memory-annotated IR** (L0/L1/L2 — same schema, varying fill level). OTel traces enter from the real-measurement
  axis. Large artifacts go to the **artifact store** (paths/URIs cross the seam, not bytes).
- **The TS side never parses sub-torch internals.** It treats Chakra ET / IR / metrics as opaque-but-typed artifacts
  and stores relationships (per brief §9). Deep trace semantics stay Python-side.
- **Strategy-ids cross the seam as identifiers, not prose** (brief: tiling/partitioning are explicit code/strategy
  ids). The registry stores the id; syntorch executes it.

---

## 7. Tradeoffs of the "one core, three surfaces" approach

| Decision | Pro | Con / cost | Mitigation |
|---|---|---|---|
| Shared TS core imported by UI/MCP/CLI | No logic drift; one validation contract (Zod) | Core must stay framework-agnostic (no Next.js imports leaking in) | Lint rule / package boundary: `@caw/core` has zero `next` deps |
| Server Actions for UI mutations | Less boilerplate, progressive enhancement | Not reusable by MCP/CLI | MCP/CLI bypass actions and import core directly (intended) |
| Python behind adapter ports | Engine tech can change; TS stays clean | Serialization + process-mgmt overhead | Versioned JSON contract; start subprocess, grow to sidecar |
| MCP = thin wrapper over core | Agents get exact human behavior | MCP-specific affordances (elicitation, streaming) need design | Treat MCP transport features as presentation, keep verbs in core |
| Skills as packaged workflows | Automation unit reused on all surfaces | Another abstraction to govern | Keep `Skill` declarative; steps = core-service calls only |

---

## 8. Open Questions

Mirror these into [open-questions.md](../08-research-plan/open-questions.md).

- **OQ-PS-1:** TS⇆Python transport for the *recommended* steady state — FastAPI HTTP vs gRPC for the sidecar (A)?
  gRPC gives typed streaming for run progress; HTTP+SSE is simpler. `TODO(open-question)`.
- **OQ-PS-2:** Does syntorch's HW-design layer expose a *programmatic* API (importable) or only a CLI/file interface?
  This decides whether HwDesignPort is in-process subprocess (B) or service (A). Cannot be assumed — syntorch
  internals beyond SOURCE-BRIEF §7 are unknown. `TODO(open-question)`.
- **OQ-PS-3:** Run execution location — same host as Node, or a dedicated sim host/cluster (CUDA, SST)? Affects
  whether B is ever viable in prod or A/C is mandatory. `TODO(open-question)`.
- **OQ-PS-4:** Does the MCP server need auth/multi-tenant scoping for the broader Company AI Workbench substrate, or
  is it single-trust local? (MCP SDK has OAuth/URL-elicitation helpers if needed.) `TODO(open-question)`.
- **OQ-PS-5:** Are skills versioned artifacts in the data layer (with their own work-tree), or code-defined only?
  Interacts with ADR-0007. `TODO(open-question)`.
- **OQ-PS-6:** CLI distribution — bundled Node binary, npx, or container? Matters for CI reproducibility.
  `TODO(open-question)`.
- **OQ-PS-7:** Where exactly does the OTel real-measurement ingest run relative to Node (collector vs direct)?
  Coordinate with [trace-capture-and-chakra.md](./trace-capture-and-chakra.md). `TODO(open-question)`.

---

## 9. Implications for runbooks

This doc drives the following runbooks (`design/10-runbooks/`):

- **RB-0XX — Monorepo & `@caw/core` scaffold:** workspace layout (`apps/web`, `apps/mcp`, `apps/cli`,
  `packages/core`, `packages/schemas`), the framework-agnostic core boundary, shared Zod schemas. Implements §2, §7.
- **RB-0XX — Next.js app-router skeleton:** server shell + client canvas islands, server actions for mutations, Route
  Handlers for run-status SSE + artifact download + Python callback. Implements §3. (Canvas internals → ADR-0004 RB.)
- **RB-0XX — Engine-adapter ports & subprocess bridge:** define SimEnginePort/TraceCapturePort/HwDesignPort/IngestPort
  and a child-process (B) implementation with JSON-lines streaming + artifact-store handoff. Implements §6.2/§6.3.
- **RB-0XX — Python sim sidecar (A) migration:** FastAPI/gRPC service wrapping LLMServingSim→syntorch→ASTRA-sim, run
  callback contract, status streaming. Implements §6.2 option A. (Gated by OQ-PS-1/2/3.)
- **RB-0XX — MCP server:** map core services → tools, registry/evidence → resources, skills → prompts; stdio +
  Streamable HTTP transports. Implements §4.1.
- **RB-0XX — CLI:** arg-parser binary over `@caw/core`, `--json` mode, `--watch` run streaming. Implements §4.2.
- **RB-0XX — Skill packaging:** `Skill` definition, registry, and per-surface projection. Implements §4.3.

---

## 10. Sources (public grounding)

- [Next.js Docs: App Router](https://nextjs.org/docs/app)
- [Route Handlers vs Server Actions (Next.js)](https://medium.com/@nuwan.thuduwage/route-handlers-vs-server-actions-the-old-way-vs-the-modern-way-in-next-js-a78d2300bb48)
- [MCP TypeScript SDK (GitHub)](https://github.com/modelcontextprotocol/typescript-sdk)
- [MCP TypeScript SDK server docs](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md)
- [Model Context Protocol primer (2026)](https://www.developersdigest.tech/blog/what-is-model-context-protocol-2026-primer)

> Internal package `syntorch` is described only per SOURCE-BRIEF §7; no internals beyond that are asserted here.
> Items depending on syntorch's real API surface are flagged as open questions, not assumed.
