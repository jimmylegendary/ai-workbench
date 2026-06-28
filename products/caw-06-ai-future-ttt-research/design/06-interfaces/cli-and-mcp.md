# CLI & MCP — driving and inspecting the ExperimentScout

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md) (§4 surfaces, §12 reviewer guardrail)
  - [./scout-pipeline.md](./scout-pipeline.md) (the Run this CLI/MCP drives)
  - [./outputs.md](./outputs.md) (the artifacts these ops render)
  - [../01-decisions/ADR-0001-product-surface-and-scout.md](../01-decisions/ADR-0001-product-surface-and-scout.md)
  - [../01-decisions/ADR-0002-hypothesis-representation.md](../01-decisions/ADR-0002-hypothesis-representation.md)
  - [../01-decisions/ADR-0003-experiment-ledger.md](../01-decisions/ADR-0003-experiment-ledger.md)
  - [../01-decisions/ADR-0008-export-boundaries.md](../01-decisions/ADR-0008-export-boundaries.md)
  - [../01-decisions/ADR-0007-storage-and-scheduling.md](../01-decisions/ADR-0007-storage-and-scheduling.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
Specify the two **human/agent-facing driving surfaces** over the one `ExperimentScout` pipeline core: the **CLI**
(Jimmy + CI, headless) and the **MCP server** (the agent ExperimentScout). It fixes the shared **typed op-set**,
which ops are **read** vs **mutating**, and that all **terminal/strategic ops are proposal-only and human-gated**
(brief §12; ADR-0001). It does NOT define the scheduled pipeline mechanics ([scout-pipeline.md](./scout-pipeline.md)),
artifact schemas ([outputs.md](./outputs.md)), or the export adapter internals (ADR-0008). Both surfaces are thin
wrappers over the same core op-set — no surface carries its own invariant logic (ADR-0001 §"Governance lives in
the core").

## Design principles
- **One op-set, two surfaces.** CLI subcommands and MCP tools are 1:1 renderings of the same vetted typed ops.
  Adding behaviour means extending the core op-set, never a surface-local rule (ADR-0001 revisit trigger).
- **Read vs mutate is explicit.** Every op is classed `read`, `propose` (append a proposal/draft record), or
  `gated` (a strategic terminal route that only the core executes after Jimmy confirms).
- **No surface can overclaim.** No op prints a hypothesis without `status` + `confidence`; no op promotes a
  hypothesis to `supported`, exports a claim to CAW-02, or commits a writeback schema to CAW-01 without passing
  through the human gate. Generated summaries are stamped `generated` and are never evidence (brief §12).
- **Independence.** Export ops write **bundles across an explicit boundary** (ADR-0008) — never into a shared
  store. CAW-01/CAW-02 are separate products.

## The op-set (shared by CLI + MCP)

| Op | Class | CLI | MCP tool | Effect |
|---|---|---|---|---|
| `run` | propose | `caw06 run [--thread ID] [--stage S] [--now]` | `scout.run` | Advance the Run over the six stages (resumable); see [scout-pipeline.md](./scout-pipeline.md) |
| `status` | read | `caw06 status` | `scout.status` | Run/scheduler state, last receipt, in-flight stage, lock holder |
| `list-threads` | read | `caw06 list-threads [--filter status=…]` | `thread.list` | Threads with current status + confidence |
| `show-thread` | read | `caw06 show-thread ID` | `thread.show` | Full `source→claim→hypothesis→experiment→result→implication` chain + provenance |
| `show-hypothesis` | read | `caw06 show-hypothesis HID` | `hypothesis.show` | Hypothesis card: MUST display `status` + `confidence` + run history (ADR-0002) |
| `extract-claims` | propose | `caw06 extract-claims --source SID` | `claim.extract` | Draft `CandidateClaim`s from a source (S4) |
| `propose-hypothesis` | propose | `caw06 propose-hypothesis --claim CID` | `hypothesis.propose` | New `Hypothesis` at `status=hypothesis`, `confidence=very-low` |
| `plan-experiment` | propose | `caw06 plan-experiment --hyp HID` | `experiment.plan` | Pre-register decision rule + repro config (ADR-0003); no run yet |
| `run-experiment` | propose | `caw06 run-experiment --plan PID` | `experiment.run` | Launch toy repro; **always** writes a ledger entry (incl. crash → `invalid`) |
| `log-result` | propose | `caw06 log-result --exp EXP-XXXX` | `experiment.log` | Append verdict against the pre-registered rule (ADR-0003) |
| `ledger` | read | `caw06 ledger [--verdict …]` | `ledger.list` | Append-only experiment ledger view |
| `negative-results` | read | `caw06 negative-results` | `ledger.negatives` | Failures-first view, surfaced by default (brief §5; ADR-0003) |
| `map-implications` | propose | `caw06 map-implications --finding FID` | `implication.map` | Build/refresh the ImplicationMap (ADR-0006); summary marked `generated` |
| `render` | read | `caw06 render <kind> --id ID` | `artifact.render` | Render one of the five output kinds ([outputs.md](./outputs.md)) |
| `propose-status` | propose | `caw06 propose-status HID --to supported` | `hypothesis.propose_status` | Enqueue a `StatusEvent` from a ledger verdict — **does not apply it** |
| `confirm` | gated | `caw06 confirm <queue-id>` | _(not exposed as agent tool)_ | The human gate: applies a queued promotion/export |
| `export` | gated | `caw06 export <target> --id ID` | `export.stage` | MCP **stages** a bundle (pending); only `caw06 confirm`/`caw06 export --commit` emits it |

### Read vs mutating — the hard line

```text
read      → no record changes; safe for CI, agents, dashboards (status, show-*, ledger, negatives, render, list)
propose   → APPEND a draft/proposal/ledger record at the floor state
             (status=hypothesis, confidence=very-low); never promotes, never exports
gated     → a STRATEGIC TERMINAL route (status→supported, export→CAW-01/02);
             core executes ONLY after Jimmy's `confirm`. The agent can at most STAGE a pending event.
```

## Surface differences

| Aspect | CLI (Jimmy + CI) | MCP (ExperimentScout agent) |
|---|---|---|
| Audience | human operator, headless CI | the autonomous scout agent |
| `read` ops | all | all |
| `propose` ops | all | all (this is the agent's job: discover→claim→hypothesize→draft) |
| `gated` ops | `confirm` + `export --commit` available to the human | **proposal-only**: may `stage`/`propose_status`; the `confirm` tool is NOT registered |
| Output | text/markdown tables; `--json` for CI | structured JSON tool results |
| Auth context | local operator | scoped MCP session; terminal routes physically unreachable |

The MCP server deliberately **does not register `confirm`** (ADR-0001 §"Mutating-terminal ops are proposal-only").
An agent can fill the review queue with well-formed proposals; only a human empties it.

## The human gate (review queue)
A `propose-status --to supported`, an `export`, or a writeback commit creates a **pending event** in
`store/review-queue/` (persisted per ADR-0007). `caw06 review` lists pending items with their evidence and
diff; `caw06 confirm <id>` applies one; `caw06 reject <id> --reason …` discards it (kept for audit). No scheduled
Run and no MCP session can drain this queue. This is the single enforcement point for brief §12 ("automatic
scouting is proposal/hypothesis generation; Jimmy is the reviewer").

## Examples

```bash
# Inspect (read-only)
caw06 list-threads --filter status=hypothesis
caw06 show-hypothesis HYP-0042            # always prints status + confidence + run history
caw06 negative-results                    # failures surfaced by default

# Advance one thread on demand (propose-class; no promotion)
caw06 run --thread THR-0042 --now

# Plan + run a toy reproduction, then log against the pre-registered rule
caw06 plan-experiment --hyp HYP-0042      # pre-registers decision rule (ADR-0003)
caw06 run-experiment --plan PLN-0007      # writes ledger entry even on crash
caw06 log-result --exp EXP-0007 --verdict supports

# Strategic routes are gated — staged, then confirmed by Jimmy
caw06 propose-status HYP-0042 --to supported   # enqueues; does NOT apply
caw06 review                                   # Jimmy inspects evidence + cap
caw06 confirm RQ-0019                           # the gate: core applies the promotion
caw06 export caw01-writeback --id WB-0003       # stages bundle (ADR-0008)
caw06 export caw01-writeback --id WB-0003 --commit
```

## Open Questions
- TODO(open-question: does `scout.run` over MCP return a synchronous result or a Run handle to poll via
  `scout.status`? — mirrors ADR-0001 OQ on Run granularity.)
- TODO(open-question: should CI have a distinct non-interactive profile that can `confirm` only `inconclusive`/
  `refuted` demotions (never promotions)? lean: no — keep one gate.)
- TODO(open-question: rate-limit / quota surfacing for agent `propose` ops to avoid review-queue flooding.)
  See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks
- RB: define the core op-set as one typed module; CLI and MCP are generated/thin wrappers over it.
- RB: MCP server registration list MUST exclude `confirm` and MUST mark `export` as stage-only.
- RB: every `render`/`show-hypothesis` path asserts `status` + `confidence` present before printing.
- RB: review-queue store + `review`/`confirm`/`reject` commands; persisted per [ADR-0007](../01-decisions/ADR-0007-storage-and-scheduling.md).
