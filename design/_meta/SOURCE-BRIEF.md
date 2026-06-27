# SOURCE BRIEF — Single Source of Truth (CAW-01 Workbench)

> This file is the **canonical product vision** for the CAW-01 Simulation Control Plane.
> Every design document and runbook in `design/` MUST stay consistent with this brief.
> If a document contradicts this brief, the brief wins. Do not invent facts about
> `syntorch`, `LLMServingSim`, `ASTRA-sim`, or internal hardware beyond what is written
> here or what public research confirms. When unsure, record it in `08-research-plan/open-questions.md`.

---

## 0. The one hard constraint

**We are NOT building the product. We are writing the design + build instructions that an AI builder will execute.**

- All build-facing instructions live as **runbooks** in `design/10-runbooks/` in a structured,
  step-by-step format (see `_meta/DOC-CONVENTIONS.md`).
- Design documents describe *what* and *why*; runbooks describe *how an AI agent builds it*, step by step.
- No production code is written by the design authors. Runbooks may contain code *skeletons/snippets*
  as build guidance, but the actual implementation is performed later by the AI builder following the runbook.

---

## 1. Program context (inherited, do not contradict)

This product is **CAW-01** of the *Company AI Workbench* (working name: *Memory-Centric AI Workbench*).
The existing program docs (`architecture.md`, `items/01-simulation-control-plane.md`, `TODO.md`) already established:

- The workbench is an **instrument, not a solver**. It helps a domain expert *move/add/test design-space axes*
  cheaply and preserve the evidence chain from workload hypothesis → memory-device implication.
- Three **evidence axes** feed the simulation layer:
  - **real measurement**: real service infra → **OTel trace**
  - **synthetic execution**: **syntorch → Chakra trace**
  - **simulation**: **LLMServingSim + ASTRA-sim** (+ SST)
- The canonical simulation flow: `input feeder -> LLMServingSim -> syntorch -> AstraSim + SST`.
- The unit of value is **one reproducible experiment**:
  `(workload, hardware config, simulation config) -> trace -> metric -> DB row -> comparable projection`.
- A **memory-annotated IR** is the critical design surface, with progressive **fill levels**:
  - `L0`: op-level graph + tensor size/lifetime → capacity peak + rough traffic
  - `L1`: memory-tier residency + per-tier movement bytes
  - `L2`: kernel-level tiling schedule, intra-kernel reuse, hardware-optimal runtime logic
  - L0/L1/L2 are the **same schema at different completeness**, NOT separate schemas.
- A **trust ladder** governs credibility: syntorch traces must be validated against A100/OTel evidence;
  tiling/partitioning assumptions must be explicit code/strategy-ids, not prose.
- Design bias: **feel like a control plane, not a chatbot** (run status, evidence completeness,
  open questions, blockers, artifact readiness, next honest action).

CAW-01 is the first visible product and the heart of the system. This brief specifies its UI/UX and engine in detail.

---

## 2. Product surface (target)

- **Primary product: a web application built with Next.js.**
- The design system / UI is produced using **"open design"** (open-source design tooling — exact tool TBD
  in `01-decisions/ADR-0006`; research candidates such as Penpot, shadcn/ui + Radix, OpenUI etc.).
- The same backend/engine should ALSO be reachable as a **CLI** and an **MCP server** so the
  workbench can be driven by other agents and by the broader Company AI Workbench substrate.
  (Web app = primary human surface; MCP/CLI = automation surfaces; "skill" = packaging of workflows.)
  The product-surface tradeoff is decided in `01-decisions/ADR-0001`.

---

## 3. CAW-01 UI: top-level shell

A system-wide **top navigation bar** (nav bar) spans the top of every screen with the main menu, e.g.:

- **Simulation** (the focus of this brief)
- **Module Design**
- **User**
- **Setting**
- (other standard app-level menus as needed)

The **Simulation** menu opens the main working screen described below.

---

## 4. CAW-01 UI: the Simulation screen

Layout: a **left:right split at a 1:9 ratio**.

- **Left (1) — Control Panel**: run the simulation, save, and manage run lifecycle.
  - start/stop/configure a simulation run
  - per-item save and full save (see Work Tree, §6)
  - run status, progress, evidence/projection readouts
- **Right (9) — Workspace**: three coordinated **canvas panels** (see §5).

---

## 5. CAW-01 UI: the three canvases (the right "9" workspace)

The right workspace lets the user choose, for a given LLM model, **which serving framework** and
**which representation layer** to attach and run, and to design the hardware it runs on. It is organized as
three coordinated canvas panels:

### Canvas 1 — AI Workload Flow (agent-turn visualization)
- Visualizes the **flow of a single AI workload = one agent turn** on a canvas.
- Shows the turn as an inspectable graph/flow (the steps/ops/data movement that make up one turn).
- This is the "what is the workload" view that ultimately maps into the memory-annotated **L0 IR**.

### Canvas 2 — Serving & Representation Layer selection
- For the chosen LLM model, the user selects **which serving framework** and **which representation layer**
  to run with. Candidates / building blocks:
  - **vLLM** (LLM serving framework)
  - **LLMServingSim** (serving simulator)
  - **ASTRA-sim** (distributed ML system simulator; consumes Chakra ET)
  - **syntorch** (synthetic torch — see §7)
- The user composes the run: e.g. "serve with vLLM, but swap torch → syntorch to capture sub-torch traces,"
  or "run through LLMServingSim + ASTRA-sim for a pure simulation projection."

### Canvas 3 — Hardware Design (physical hierarchy)
- A hardware design layer where the user designs the full physical hierarchy and sees it **visualized like real hardware** on a canvas:
  - **chip** (individual chip spec)
  - **die** structure
  - **package** structure
  - **tray** structure
  - **rack** structure
  - **cluster** structure
- The user can **select** a specific cluster → rack → tray, then drill into a specific package / die / chip,
  and select a specific **component/part** of it.
- On a selected part the user can **make changes, add components, and apply micro-level changes** (component add/edit at fine granularity).

### Cross-canvas behavior
- All three panels are **coordinated** (a selection/change in one is reflected where relevant).
- The right "9" workspace is where the user composes a complete runnable experiment:
  *workload (Canvas 1) × serving/representation (Canvas 2) × hardware (Canvas 3)*.

---

## 6. Work Tree — change management across all three canvases

- Every selection and change made in any of the three panels is tracked as a **work tree** of changes.
- Supports **per-item save** (save an individual change/subtree) and **full save** (save the whole tree).
- The work tree is the versioning/branching model for an experiment's configuration. (Concrete model is
  designed in `04-data-layer/work-tree-and-versioning.md` and
  `05-caw01-simulation-control-plane/change-management-worktree.md`.)

---

## 7. syntorch — exact description (do NOT invent beyond this)

`syntorch` ("synthetic torch") is a **Python package** with the following properties as stated by the product owner:

1. **Drop-in torch frontend.** It exposes a frontend that can be used **identically to vLLM's torch layer**
   — i.e. code that uses torch under vLLM can use syntorch the same way.
2. **Custom everything below torch.** Everything below the torch frontend — **kernels, hardware logic, etc.** —
   is **custom-designed**. It lets you express, in code, the runtime **algorithms** (including
   **partitioning / tiling**) tailored to a **custom HW chip / structure / architecture** you are designing.
   I.e. unbuilt-device assumptions become *executable* and tiling/partitioning are *explicit code/strategy ids*, not prose.
3. **Trace capture via torch replacement.** The intended future workflow: **install syntorch instead of torch inside vLLM**,
   so that **all traces below torch are captured**.
4. **Chakra exporter layer.** Captured traces are converted by an **exporter layer** into **Chakra traces**
   (Chakra execution trace / ET — the MLCommons standard consumed by ASTRA-sim).
5. **Hardware design layer.** syntorch (or its surrounding tooling) includes a **HW design layer** capable of
   designing: individual **chip spec, die structure, package structure, tray structure, rack structure, cluster structure** —
   which is what Canvas 3 visualizes and edits.

> syntorch is treated as an internal/owned package. Public research (vLLM, ASTRA-sim, Chakra, LLMServingSim)
> may be cited; syntorch internals beyond the above must NOT be fabricated. Capture unknowns as open questions.

---

## 8. Trace & simulation pipeline (how it all connects)

```
                 ┌─────────────── real measurement axis ───────────────┐
                 │  real service infra  ─────────────────►  OTel trace  │
                 └──────────────────────────────────────────────────────┘
                 ┌─────────────── synthetic execution axis ─────────────┐
   LLM model ──► │  vLLM (torch → syntorch)  ──►  sub-torch trace        │
                 │                            ──►  Chakra exporter ──► Chakra trace
                 └──────────────────────────────────────────────────────┘
                 ┌─────────────── simulation axis ──────────────────────┐
                 │  input feeder ─► LLMServingSim ─► (syntorch) ─► ASTRA-sim (+ SST)
                 └──────────────────────────────────────────────────────┘
                                          │
                                          ▼
              memory-annotated IR (L0 → L1 → L2)  ─►  metrics  ─►  comparable projection
```

- Chakra traces are the interchange format into ASTRA-sim.
- All three axes are normalized into the **same memory-annotated IR** for comparable projection.
- The control plane's job is to make these axes composable, runnable, inspectable, and preservable as evidence.

---

## 9. Data needs (decide the storage stack in research/ADRs)

The system must store and relate, at minimum:
- **Knowledge substrate**: `Source, Claim, Evidence, Note, Concept, Interest, OpenQuestion, Decision, Assumption`
  (invariant: claims point to evidence; generated summaries are not evidence).
- **Simulation substrate**: `WorkloadModel, InputTrace, SimulationConfig, SimulationRun, TraceArtifact,
  Metric, ResultSet, ArchitectureProposal, MemoryProductRequirement, MemoryAnnotatedIR, TensorNode,
  DataMovementEdge, FillLevel`.
- **HW design substrate**: chip/die/package/tray/rack/cluster hierarchy + components + edits.
- **Work tree substrate**: versioned change trees across the three canvases, with per-item and full save.

Candidate storage technologies to research and decide between (see `02-research/data-layer-options.md`
and `01-decisions/ADR-0002`): **relational SQL** (e.g. Postgres/SQLite), **vector DB** (embeddings/retrieval),
**graph DB** (Neo4j) for the knowledge/HW/IR graphs, and a **markdown-first / file-first DB** (git-tracked
md/json as source of truth). A hybrid/polyglot answer is allowed and likely; the ADR must justify the choice
and the boundaries between stores.

---

## 10. Decisions to be made by the design (not assumed)

Research and decide (each gets an ADR in `01-decisions/`):
- ADR-0001 Product surface (web app primary + MCP + CLI; what is a "skill" here)
- ADR-0002 Data layer (SQL / vector / Neo4j / md-first / hybrid)
- ADR-0003 Frontend stack (Next.js specifics: app router, server/client split, etc.)
- ADR-0004 Canvas rendering tech (node-graph + 3D HW hierarchy: React Flow/xyflow, Konva, react-three-fiber/three.js, etc.)
- ADR-0005 Trace pipeline (syntorch capture → Chakra exporter → ASTRA-sim integration boundaries)
- ADR-0006 Design system / "open design" tool choice
- ADR-0007 Work-tree change-management model (CRDT? event log? git-like object model?)

---

## 11. Guardrails (inherited)

- Do not store confidential company data in public-facing outputs.
- Do not conflate public-source research with internal Samsung/SAIT claims.
- Keep sources, claims, evidence, and generated conclusions separate.
- Prefer small vertical slices that prove workflow semantics over broad platform scaffolding.
- Treat automatic research as proposal/update generation; Jimmy remains the reviewer for strategic decisions.
