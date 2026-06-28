# GLOSSARY — CAW-03 Ubiquitous Language

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Source of truth:** ./PRODUCT-BRIEF.md

Canonical vocabulary for CAW-03. Use these terms exactly.

## Harness & operations

- **Harness** — the governance layer around a writing engine; not a free-form writer. Enforces gates, provenance, confidentiality, patents, and the paper ladder.
- **Harness core** — the single component that owns all governed logic; surfaces are thin adapters over it.
- **op-manifest** — the finite catalogue of **governed operations** (e.g. `import_bundle`, `build_ledger`, `gate_claims`, `assemble_inputs`, `draft_paper`, `draft_patent`, `run_novelty`, `review`, `publish`/`export`). Each op is the only way to perform its action and enforces its invariant in the core.
- **surface** — a thin entry point onto the core: API, MCP, CLI, or the minimal review/status UI.

## Ports & adapters

- **port** — a typed interface the core depends on (driven port). The core never depends on a concrete adapter.
- **adapter** — a concrete implementation of a port, selected by config and **registered** in the adapter registry.
- **the five ports** — `SourceAdapter` (inputs), `WritingEngineAdapter` (paper drafting), `PatentEngineAdapter` (patent drafting), `Sink`/`PublishAdapter` (outputs), `Novelty`/`RadarAdapter` (related-work + threat signals).
- **capability descriptor** — metadata an adapter advertises (what it can do, version, config schema); checked by **preflight** before use.
- **preflight** — the registry's pre-run check that a selected adapter is compatible and its config valid.
- **documented stub** — a future adapter shipped as interface + not-implemented marker + config example, so the seam is open without the connector being built (e.g. internal wiki, experiment-server).
- **adapter registry** — the config-driven catalogue that discovers, preflights, and selects adapters.

## Engine & inputs

- **PaperOrchestra** — the existing internal writing engine (5 steps: outline → plotting → literature-review (Semantic Scholar) → section-writing → content-refinement; + paper-autoraters + agent-research-aggregator). The v1 `WritingEngineAdapter`, invoked in subprocess mode; swappable.
- **citation_pool** — PaperOrchestra's Semantic-Scholar-verified reference set; reused by CAW-03 as paper prior-art (not re-queried).
- **engine-neutral input bundle** — the normalized inputs CAW-03 assembles from gated claims + CAW-01 result refs (idea, experimental_log, template, conference_guidelines, figures), so any engine can consume them.
- **input assembly** — building that bundle; gate-before-assemble; numbers are result-ref-backed.
- **PaperOrchestra workspace** — a CAW-03-owned working dir the engine subprocess reads/writes.

## Claims, evidence, gate

- **claim ledger** — the authoritative claim list, **imported by reference** from CAW-02 (CAW-03 never re-owns it).
- **claim type** — `P1`/`P2` (method/tool) vs `P3` (future-device); drives gate thresholds and ladder placement.
- **evidence gate** — the type-specific, profile-configurable precondition a claim must pass before it may enter a draft. **Invariant (no profile relaxes it): generated text is never evidence.** Fail-closed: blocks the engine.
- **GatedClaimSet** — the set of claims that passed the gate; the shared front for both paper and patent paths.
- **blocked-claim backlog** — claims that failed the gate, persisted as visible work items.

## Patents, novelty, ladder

- **PatentEngine** — the patent-drafting port/adapter (parallel to WritingEngine); PaperOrchestra never drafts patents.
- **patent-first interlock** — default-deny on publishing a paper containing a patent-sensitive claim until the patent gate clears.
- **novelty / threatened / patent-sensitive** — claim flags the harness assigns from prior-art + radar signals.
- **paper ladder (P1/P2/P3)** — the planned program paper sequence + per-paper readiness gates.

## Confidentiality & lifecycle

- **boundary / visibility** — inherited from CAW-02: boundary {public/internal/confidential} × visibility {team/private}; possibly a stricter counsel/pre-filing tier.
- **redaction** — removing over-boundary content before export (reuse CAW-02 semantics).
- **Artifact** — one paper or one patent draft under governance; binds a claim set → confidentiality track → engine run → review → terminal output. Shared state machine to `drafted`, then branches on **artifact_type**.
- **review checklist** — the gate before "submission-ready".
