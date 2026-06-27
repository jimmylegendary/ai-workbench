# Risks & Mitigations

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [milestones-and-phases.md](milestones-and-phases.md)
  - [dependency-graph.md](dependency-graph.md)
  - [../01-decisions/ADR-0002-storage.md](../01-decisions/ADR-0002-storage.md)
  - [../01-decisions/ADR-0007-import-export-contracts.md](../01-decisions/ADR-0007-import-export-contracts.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

This doc names the **top risks** to building CAW-02 and the concrete mitigations
baked into the design, with detection signals and owners. It does NOT re-specify
the mechanisms (evidence gate, propagation, reindex) — those live in the ADRs;
here we say what can go wrong and how the build defends against it.

## Risk register (ranked)

| # | Risk | Likelihood | Impact | Net | Phase exposed |
|---|------|-----------|--------|-----|---------------|
| R1 | Provenance corruption (claim without resolvable evidence; summary stored as evidence) | Med | **Critical** | High | P2+ |
| R2 | Boundary/confidentiality leak on export | Med | **Critical** | High | P6 |
| R3 | Reindex drift vs hand-edited git md | High | High | High | P1+ |
| R4 | Scope creep into continual learning | High | Med | Med | all |
| R5 | Dedup quality (false merges / missed dups) | Med | Med | Med | P7 |
| R6 | Build-budget interruptions leave a half-built, non-resumable tree | High | Med | Med | all |
| R7 | Trust ladder mislabels AI-authored content as too trusted | Med | High | Med | P3 |
| R8 | Surface divergence (API/MCP/CLI behave differently) | Low | High | Med | P4 |

---

## R1 — Provenance corruption

**What goes wrong:** a Claim ends up with no resolvable Evidence, or a generated
Note/summary gets recorded as Evidence — destroying reconstructability (the unit
of value, brief §2).

**Mitigations (design-enforced):**
- Three-layer Claim→Evidence invariant — frontmatter schema, core validator,
  reindex re-check — so no single bug can let it through (ADR-0003).
- **Structural** evidence gate: `attach_evidence` has **no prose field** and
  `artifact_ref` MUST resolve to a real artifact; a note can never be evidence (ADR-0004).
- Append-only + supersedes (no update/delete) + signed git history = full audit.

**Detection:** reindex fails loud on any unresolvable `artifact_ref`; CI runs the
invariant check over the whole `knowledge/` corpus on every commit.

**Residual:** an artifact that resolves but is the *wrong* artifact. TODO(open-question: evidence-correctness spot-check).

## R2 — Boundary leak on export

**What goes wrong:** a `confidential` or `private` item, or a synthesis derived
from one, appears in a public-facing or CAW-03 bundle.

**Mitigations:**
- **Fail-closed export allow-list** — anything not explicitly allowed is dropped (ADR-0007).
- **Mandatory re-redaction at every crossing** (both import and export).
- Monotone propagation: synthesis never downgrades `boundary`, so derived nodes
  inherit the strictest label (ADR-0004).
- Signed bundles + provenance manifest so a leak is attributable.

**Detection:** export refuses to emit on any item failing the allow-list; a
leak-canary test ships a confidential fixture through export and asserts it is dropped.

**Residual:** redaction rules incomplete for a new artifact type — quarantine-on-import
contains blast radius until rules updated.

## R3 — Reindex drift vs git edits

**What goes wrong:** humans edit md directly in git; the derived SQLite index no
longer matches; queries return stale/incorrect provenance.

**Mitigations:**
- SQLite is **derived and disposable**; the reindex is **deterministic and
  idempotent** — drift is fixed by rebuild, never by patching the DB (ADR-0002).
- FTS/vector live in separate droppable migrations, so a corrupt index is recoverable.
- CI runs `reindex` from clean and asserts idempotency (repeat run = identical output).

**Detection:** a `reindex --check` mode diffs current SQLite vs a fresh rebuild and
fails if they differ; run in CI and as a pre-export gate.

**Residual:** md edit that violates schema slips into git — caught by the layer-1
schema check on commit, not by reindex alone.

## R4 — Scope creep into continual learning

**What goes wrong:** the build drifts toward autonomous self-editing knowledge,
violating the brief (v0 = append + retrieve + skill-wrap; non-goal §9).

**Mitigations:**
- Writes are append-only + supersedes; there is **no update/delete** op in the
  manifest — autonomous self-editing is structurally absent (ADR-0001).
- Agent submissions are **reviewed by default**; no silent auto-accept in v0 (ADR-0005).
- Roadmap milestones (M1–M5) contain no learning/feedback loop; any such work is
  out of phase by definition.

**Detection:** op-manifest review — any proposed mutate/auto-merge op is rejected in
design review; PR template asks "does this add a non-append write path?".

## R5 — Dedup quality

**What goes wrong:** near-duplicate Sources/Claims either get falsely merged
(losing provenance) or missed (bloating the store).

**Mitigations:**
- Append-only + supersedes means a bad merge is reversible (the superseded node persists).
- Dedup is a **P7** concern, kept out of the M1 critical path so it cannot block value.
- Start with conservative exact/near-exact matching; surface candidates for human review
  rather than auto-merging.

**Detection:** dedup precision/recall measured on a labeled fixture set.
TODO(open-question: dedup acceptance metric and corpus).

## R6 — Build-budget interruptions

**What goes wrong:** an AI builder runs out of budget mid-runbook, leaving a
non-compiling, non-resumable tree.

**Mitigations:**
- **Small, resumable runbooks:** each runbook is one cohesive unit with explicit
  Preconditions, atomic Do/Verify steps, Acceptance, and Rollback (DOC-CONVENTIONS §6).
- **Leave the tree green** (compiling, lint-passing) at every Acceptance checkpoint
  so an interrupted build resumes from the last green state.
- Phase boundaries are checkpoints; `_events` + git commits record progress so a
  fresh builder can read where it stopped.

**Detection:** CI gate per runbook; a runbook left `blocked` flags an interrupted unit.

**Mitigation pattern — resumable runbook skeleton:**
```
## Preconditions   — checklist; abort if not all true
## Steps           — each: Do: <atomic> / Verify: <objective check>
## Acceptance      — green tree + objective checks (the resume point)
## Rollback        — undo a mid-way failure to the last green state
```

## R7 — Trust mislabeling

**What goes wrong:** AI-authored content is treated as more trusted than allowed,
or `contested` state is ignored.

**Mitigations:**
- Trust is a **derived** ladder (T0–T3 + contested), recomputed by reindex — not
  hand-set; AI-authored is **capped at T2** (ADR-0004).
- Retrieval surfaces trust + contested as first-class filters (ADR-0006).

**Detection:** reindex assertion that no AI-authored node exceeds T2; test fixture
for contested propagation.

## R8 — Surface divergence

**What goes wrong:** API, MCP, and CLI drift apart and enforce different rules.

**Mitigations:**
- All three are **codegen'd from one op manifest** and add no logic; the core owns
  all validation (ADR-0001).
- Cross-surface conformance test asserts identical behavior for the same op.

**Detection:** conformance suite in CI; codegen diff check.

## Open Questions

- Evidence-correctness spot-check beyond resolvability (R1). TODO(open-question).
- Dedup acceptance metric + labeled corpus (R5). TODO(open-question).
- Redaction rule coverage matrix per imported artifact type (R2). TODO(open-question).
- See `../08-research-plan/open-questions.md`.

## Implications for runbooks

- Every runbook MUST include Rollback + leave a green tree (R6).
- The reindex `--check` idempotency gate (R3) and the export leak-canary (R2) are
  required CI steps, not optional.
- The op manifest review explicitly rejects any non-append write path (R4).
