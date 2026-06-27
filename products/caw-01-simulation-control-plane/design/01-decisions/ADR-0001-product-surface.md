# ADR-0001: Product surface — one product core, three thin surfaces (web + MCP + CLI)

- **Status:** proposed
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [SOURCE-BRIEF](../_meta/SOURCE-BRIEF.md) (§2, §7, §8, §9)
  - [Product Surface & Stack (research)](../02-research/product-surface-and-stack.md)
  - [ADR-0003 Frontend stack](./ADR-0003-frontend-stack.md)
  - [ADR-0006 Design system / open design](./ADR-0006-design-system-open-design.md)
  - [ADR-0002 Data layer](./ADR-0002-data-layer.md)
  - [ADR-0005 Trace pipeline boundaries](./ADR-0005-trace-pipeline.md)
  - [ADR-0007 Work-tree change-management model](./ADR-0007-change-management-worktree.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## Purpose

This ADR fixes **how many product surfaces CAW-01 exposes and how they relate**: a Next.js web app as the
primary human surface, plus an MCP server and a CLI as automation surfaces, all sitting on **one product
core** (`@caw/core`, CAW-01's own TypeScript core). CAW-01 is an **independent, standalone product** — one
of a family of six separate products (CAW-01..06), each separately implemented and deployed, with **no
shared runtime substrate** between them. This ADR also defines what a **"skill"** is in this product. It
does **not** decide the
Next.js internals (ADR-0003), the design system (ADR-0006), the data store (ADR-0002), the canvas
renderers (ADR-0004), or the trace-pipeline mechanics (ADR-0005). It elaborates SOURCE-BRIEF §2; it does
not redefine the 3-canvas / 1:9 / nav-bar / work-tree UI.

## Context

Forces and constraints we must satisfy:

- **Brief §2 is already directional:** "Next.js web app = primary human surface; MCP/CLI = automation
  surfaces; 'skill' = packaging of workflows." The job here is to make that real **without building three
  backends** that drift apart.
- **Brief §1 control-plane bias:** the surfaces must expose run status, evidence completeness, open
  questions, blockers, artifact readiness, and the next honest action — the same honesty contract on every
  surface, not just the web UI.
- **Brief §8 reality:** a `SimulationRun` is a heavy, Python-native job
  (`input feeder → LLMServingSim → syntorch → ASTRA-sim (+ SST)`). No surface should reimplement engine
  logic; surfaces orchestrate and observe.
- **Brief inherited goal:** CAW-01 is a standalone product with no shared runtime, but it must still be
  drivable by external agents and tools so they can operate **this** product — that is the MCP server's
  reason to exist.
- **Guardrail (brief §11):** keep sources/claims/evidence/generated-conclusions separate, and prefer small
  vertical slices that prove workflow semantics. A single core with one validation contract is what keeps
  that invariant enforceable across surfaces.

The trap to avoid: each surface growing its own domain logic and validation, so a run composed via MCP
behaves differently from one composed in the UI.

## Options considered

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **A. One shared `@caw/core`; web/MCP/CLI are thin adapters** | No logic drift; one Zod contract reused everywhere; new capability added once and projected; matches brief §2 exactly | Core must stay framework-agnostic (no `next` imports); some discipline to keep surfaces thin | **Chosen** |
| B. Web app first; MCP/CLI added later as separate apps calling the web HTTP API | Fast to ship the UI | Surfaces couple to one another's transport; the web layer becomes a de-facto backend; agents inherit UI-shaped APIs | Rejected |
| C. Three independent apps, each with its own logic | Teams move independently | Triple validation, guaranteed drift, violates "one product"; impossible to keep the evidence contract consistent | Rejected |
| D. MCP-only (agent-native), web as a thin MCP client | Maximal agent-first | Brief makes the **web app primary** for a human domain expert; a control-plane UI over MCP alone is poor UX | Rejected |

## Decision

**Adopt Option A: one shared TypeScript core (`@caw/core`) with three thin surfaces.**

1. **Layering (arrows point down only):** `surfaces → core services → engine-adapter ports → data layer`.
   Surfaces depend on the core; the core depends on adapter **ports** (interfaces), not concrete engines;
   the data layer is reached through repository interfaces (ADR-0002).
2. **The core owns all domain logic and the one contract.** `@caw/core` holds the application services —
   `ExperimentService` (compose workload × serving × hardware), `RunService` (start/stop/status state
   machine), `RegistryService` (models, serving frameworks, HW catalog, strategy-ids), `WorkTreeService`
   (per-item / full save — semantics from ADR-0007), `EvidenceService` (trace artifacts, metrics,
   trust-ladder status, projections) — and the **Zod schemas** that are the single validation contract.
   `@caw/core` has **zero `next` dependencies** (enforced by a package-boundary lint rule).
3. **Web app = primary human surface.** It is allowed extra *presentation* concerns (the three canvases,
   cross-canvas coordination, work-tree review) but **never extra domain logic**. UI mutations go through
   server actions → core services (ADR-0003).
4. **MCP server = automation surface for agents.** A TypeScript MCP server that imports `@caw/core` and
   maps:
   - core **verbs → MCP tools** (`compose_experiment`, `start_run`, `stop_run`, `save_worktree`,
     `ingest_otel_trace`),
   - core **nouns → MCP resources** addressable by URI (`caw://registry/serving-frameworks`,
     `caw://runs/{id}/status`, `caw://runs/{id}/metrics`, `caw://traces/{id}`, `caw://ir/{id}` for
     L0/L1/L2),
   - packaged **skills → MCP prompts**.
   Transports: stdio for local agents, Streamable HTTP for remote. Every tool is a one-line wrapper over a
   core service using the **same Zod schema**, so an agent gets exactly the validation a human gets.
5. **CLI = automation surface for humans/CI.** A TypeScript binary importing `@caw/core` (never the web
   HTTP layer). Human text by default, `--json` for pipelines, `--watch` for streaming run status. It is a
   **strict subset** of the core: it must never grow logic the UI/MCP lack.
6. **Surfaces never call each other.** MCP and CLI **do not** use Next.js server actions or route handlers;
   they import the core directly. This keeps the core the single home of domain logic.

### What a "skill" is in CAW-01

A **skill** is a **packaged, named, declarative workflow over this product's own operations** — a reusable
recipe that composes core services into a higher-order operation, with declared inputs/outputs and an
**evidence contract** (trust-ladder honesty per brief §1). A skill is **not** a new engine and **not** a
new API; it is choreography over CAW-01's own core. The same skill is projected onto every surface:

- **Web app:** a guided multi-step action in the left Control Panel, with progress + evidence readouts.
- **MCP:** a `prompt` template that drives the same skill tools.
- **CLI:** `caw skill run <skill-id> --input ...`.

Declarative shape (lives in the core; surfaced everywhere):

```ts
interface Skill {
  id: string;                       // e.g. "project-workload-to-memory-requirement"
  title: string;
  inputs: ZodSchema;                // validated identically on every surface
  steps: SkillStep[];               // calls to core services only (compose → run → read IR → derive metric)
  produces: string[];               // entity/artifact kinds, e.g. ["MemoryAnnotatedIR","MemoryProductRequirement"]
  evidenceContract: {               // brief §1 trust ladder
    requires: ("OTel" | "Chakra" | "syntorch")[];
    validatesAgainst?: "A100/OTel";
  };
}
```

The **unit of automation is a skill**, and a skill is just a named path through the one core. This is what
makes "MCP/CLI = automation surfaces" concrete and keeps them from diverging into separate products.

### Capability → surface asymmetry (deliberate)

Visual, free-form authoring (canvas graph editing + micro-level HW edits) is **web-primary**; everything
that is a **verb or a fact** (run, save, read trace/metric, ingest OTel, project, browse registry, read
trust-ladder status, run a skill) is **equal on all three surfaces** because it is core logic. MCP/CLI
accept structured patches for HW/workload authoring rather than free-form canvas interaction. See the full
matrix in [product-surface-and-stack.md §5](../02-research/product-surface-and-stack.md).

## Consequences

**Becomes easy:**
- Adding a capability once in the core makes it available to all three surfaces with one validation rule.
- The honesty/evidence contract (brief §1) is uniform because `EvidenceService` is the only source of
  trust-ladder status.
- Agents (MCP) and CI (CLI) reproduce exactly what a human does in the UI — same composition, same runs.
- The heavy Python engine stays behind adapter ports (ADR-0005); surfaces are unaffected by how the engine
  is invoked.

**Becomes harder / costs:**
- The core must stay framework-agnostic; this needs an enforced package boundary (`@caw/core` cannot import
  `next`).
- Server Actions (UI) are not reusable by MCP/CLI — intended: those surfaces bypass actions and import the
  core. The cost is that the "verb" must always live in the core, never in an action body.
- MCP transport-specific affordances (elicitation, streaming) need design as *presentation*, keeping verbs
  in the core.
- Skills add one governed abstraction; mitigated by keeping `Skill` declarative (steps = core-service calls
  only).

**Follow-on work (runbooks):**
- Monorepo + `@caw/core` scaffold (`apps/web`, `apps/mcp`, `apps/cli`, `packages/core`, `packages/schemas`).
- MCP server runbook (tools/resources/prompts mapping; stdio + Streamable HTTP).
- CLI runbook (arg-parser over the core; `--json`, `--watch`).
- Skill packaging runbook (`Skill` definition, registry, per-surface projection).
- Engine-adapter ports + TS⇆Python boundary are decided in ADR-0005 (the boundary itself is summarized in
  [product-surface-and-stack.md §6](../02-research/product-surface-and-stack.md)).

## Open questions / revisit triggers

- `TODO(open-question: ps-mcp-auth)` Does the MCP server need auth/multi-tenant scoping when CAW-01 is
  exposed beyond the local host, or is it single-trust local? (Revisit when CAW-01 is exposed beyond the
  local host.)
- `TODO(open-question: ps-skill-versioning)` Are skills versioned artifacts in the data layer (with their
  own work-tree), or code-defined only? Interacts with ADR-0007.
- `TODO(open-question: ps-cli-distribution)` CLI distribution — bundled Node binary vs npx vs container —
  for reproducible CI.
- **Revisit trigger:** if any surface needs a behavior the others cannot have, that is a signal the
  capability is mis-placed — push it into the core, do not special-case the surface.
