# ADR-0001: Product surface — harness control plane (API + MCP + CLI + minimal review/status UI)

- **Status:** proposed
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md) (source of truth)
  - [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS.md)
  - [ADR-0002-writing-engine-integration.md](ADR-0002-writing-engine-integration.md)
  - [ADR-0003-evidence-gate-and-claim-ledger.md](ADR-0003-evidence-gate-and-claim-ledger.md)
  - [ADR-0005-ports-and-adapters.md](ADR-0005-ports-and-adapters.md) (load-bearing)
  - [../02-research/ports-and-adapters-architecture.md](../02-research/ports-and-adapters-architecture.md) (§2 driving vs driven)
  - [../02-research/confidentiality-and-artifact-lifecycle.md](../02-research/confidentiality-and-artifact-lifecycle.md) (§3 lifecycle, human gate)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
Decide the **surfaces** through which humans, AI agents, and scripts drive the CAW-03 harness, and the rule that
all surfaces are thin **driving adapters** over **one harness core**. It fixes which surfaces exist in v1 (API,
MCP, CLI, a minimal review/status UI), and the invariant that governance (evidence gate, confidentiality egress,
human publish/file gate) lives in the core where no surface can bypass it. It does NOT decide the writing-engine
wrap (ADR-0002), the evidence gate logic (ADR-0003), the driven ports/registry (ADR-0005), patent drafting, or
storage — it consumes those as a stable core boundary.

## Context
- The brief (§8) names the surface as "harness control: API + MCP + CLI + minimal review/status UI". CAW-03 is a
  **harness, not a chatbot** (§1): the surface exposes typed governed operations, never a free-form "write a paper"
  prompt.
- The whole value-add is **governance the engine does not provide** (§3): the claim ledger, evidence gate,
  novelty/patent-first interlock, confidentiality filter, human publish/file gate. If each surface re-implemented
  these, they would drift and the weakest surface would become the leak (mirrors CAW-02 ADR-0001's "one core" rule).
- Personas: **Jimmy** (curator + the sole authority for strategic/publish/file decisions, §10), **AI agents**
  (assemble inputs, run the engine, propose drafts — highest-risk writers), and **scripts/CI** (headless builds).
- The architecture research (ports-and-adapters §2) splits ports into **driven** (Source/Engine/Patent/Sink/
  Novelty — the core calls out) and **driving** (the surfaces — they call *into* the core). This ADR owns the
  driving side; ADR-0005 owns the driven side.
- Independence (§1): CAW-03 has its own core, data, deploy; no shared runtime substrate. Surfaces are local to
  CAW-03; cross-product data only ever arrives via SourceAdapters (ADR-0005), never via a shared API.

## Options considered

### A. Surface architecture
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **One harness core; API/MCP/CLI/UI are thin driving adapters over a shared operation set** | Single chokepoint enforces gate + human-gate + confidentiality; surfaces provably equal; agents = humans = scripts | Requires an op-manifest discipline | **Chosen** |
| Independent logic per surface | Each ships fast alone | Guaranteed governance drift; weakest surface leaks; violates brief §3/§10 | Rejected |
| API only in v1 | Minimal | Brief §8 explicitly wants MCP (agents) + CLI (humans/CI) + review UI at v1 | Rejected |

### B. Agent/automation interface style
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Vetted typed operations** (`import_bundle`, `type_claim`, `run_gate`, `assemble_inputs`, `draft`, `screen_patent`, `review`, `request_publish`, `request_file`) | Each op carries one invariant; gate runs server-side; no "draft an ungated claim" path | More ops to define | **Chosen** |
| Generic CRUD over artifacts | Few ops | Leaks invariants to caller; an agent could mark `approved` or publish directly | Rejected |
| Free-form "write me a paper" tool | Easy | Destroys the harness premise (§1); bypasses gate | Rejected |

### C. The minimal UI
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Read-mostly review/status UI** — artifact lifecycle board, gate/novelty/confidentiality reports, diff/score view, and the **human approve/publish/file action** | Surfaces the one thing that must be human (§10); low build cost; no editing engine to maintain | Needs a thin server | **Chosen** |
| Full authoring/editing UI | Rich | Re-creates the engine's job; huge scope; brief non-goal | Rejected |
| No UI (CLI only) | Cheapest | Human gate + lifecycle review are the product's core human touchpoints; a board is worth it | Rejected |

### D. MCP exposure
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **MCP server exposing the same vetted ops as tools** (mutating publish/file tools are gated, not auto-runnable) | Agents drive the harness through the same governed ops; PaperOrchestra is itself a skill suite so an agent host is natural | MCP surface to maintain | **Chosen** |
| No MCP | Simpler | Agents are a primary persona (§3, brief §8); they would bypass to raw scripts | Rejected |

## Decision
**One harness core; four thin surfaces over a single set of vetted, typed operations.**

1. **Core operation set (the op-manifest).** The harness exposes a finite catalogue of governed operations, each
   the *only* way to perform its action and each enforcing its invariant in the core: `import_bundle`,
   `list/type_claim`, `run_gate`, `check_novelty`, `assemble_inputs`, `draft` (WritingEngine), `screen_patent` /
   `draft_patent` (PatentEngine), `run_review` (checklist + autoraters), `request_publish`, `request_file`,
   `get_artifact`/`get_lifecycle`. API, MCP, CLI, and UI are generated/wired from this one manifest so they cannot
   diverge.
2. **API (typed, primary).** The machine boundary for scripts/CI and the substrate the other surfaces call. Carries
   the artifact lifecycle (ADR-0007/confidentiality doc §3) and returns provenance-carrying value objects.
3. **MCP server.** The same ops as MCP tools for AI-agent hosts. Read/assemble/draft/review tools are agent-callable;
   `request_publish`/`request_file` and any boundary downgrade are **proposal-only** — they create a pending
   human-gate event, they never execute the terminal transition (brief §10; confidentiality doc §3.2).
4. **CLI.** Thin wrapper over the API for humans and headless builds; the default surface for subprocess-mode engine
   runs (ADR-0002) and CI.
5. **Minimal review/status UI.** Read-mostly: an artifact **lifecycle board** (`selected → gated → drafting →
   drafted → in_review → approved → published_paper|filed_patent`), the gate/novelty/confidentiality/score reports,
   a draft + diff/score viewer, and the **human approve → publish/file action** — the one privileged, non-bypassable
   control. It also lists registered adapters + capability descriptors from the registry (ADR-0005 §5) so wiring is
   visible. No authoring/editing engine.

**Governance lives in the core, never the surface.** The evidence gate (ADR-0003), confidentiality egress
`decide()` + redaction re-sweep, novelty/patent-first interlock, and the human-only publish/file/downgrade
transitions are core logic. A surface can *request* a transition; only the core (after gates) performs it. This is
the surface-side restatement of "an adapter cannot opt itself out of the human gate" (ports-and-adapters §3.4).

## Consequences
- **Easy:** add a surface or an agent without touching governance; one op-manifest keeps API/MCP/CLI/UI in lockstep;
  agents, humans, and CI are provably equal callers; the human publish/file gate is structurally enforced.
- **Easy:** the UI is cheap because it renders state the core already owns (lifecycle events, reports) and triggers
  the same vetted ops.
- **Hard / cost:** must maintain op-manifest discipline (every new capability is an op, not a surface-local hack);
  the MCP server must mark mutating-terminal ops as proposal-only and resist "just let the agent publish" pressure.
- **Follow-on:** ADR-0005 defines the **driven** ports the ops call; ADR-0002/0003 define what `draft`/`run_gate`
  do; the storage/lifecycle ADR persists the artifact state the UI reads. Runbooks: (1) op-manifest + API core;
  (2) MCP server over the manifest (proposal-only terminals); (3) CLI; (4) read-mostly review/status UI with the
  human approve/publish/file action.

## Open questions / revisit triggers
- TODO(open-question: does the review/status UI ship in v1 or is a CLI status command enough for the first slice?
  lean: ship the board because the human gate needs a real surface.) See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).
- TODO(open-question: auth/identity model for the surfaces — how is `human:jimmy` vs `agent:<id>` attributed on a
  lifecycle event across API/MCP/CLI/UII, given no shared substrate? owned with storage/lifecycle ADR.)
- TODO(open-question: are long-running engine runs (PaperOrchestra is multi-stage, minutes) modeled as sync API
  calls or a job-handle/poll op? mirrors the engine-port async question in ports-and-adapters §Open.)
- **Revisit trigger:** if any surface needs logic the op-manifest does not express, the manifest (not the surface)
  is extended — a surface-local rule is a contract leak.
