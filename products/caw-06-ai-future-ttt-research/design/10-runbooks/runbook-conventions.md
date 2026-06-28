# Runbook Conventions — CAW-06

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [./README.md](./README.md), [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS.md), [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md), [../09-roadmap/milestones-and-phases.md](../09-roadmap/milestones-and-phases.md), [../09-roadmap/dependency-graph.md](../09-roadmap/dependency-graph.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
The **operational contract** for every CAW-06 runbook: the STRICT format (a CAW-06-specific restatement of [DOC-CONVENTIONS §6](../_meta/DOC-CONVENTIONS.md)) plus the product's load-bearing builder rules. It does NOT decide design (ADRs in `../01-decisions/`) or list runbooks (see [README.md](./README.md)). If this file and DOC-CONVENTIONS / PRODUCT-BRIEF disagree, the brief wins.

## 1. Strict runbook format
Every runbook file is `RB-XXX-topic.md` in its phase folder, numbered by phase (`RB-0XX` P0 … `RB-4XX` P4), and starts with this header then the six fixed sections **in order**:

```
# RB-XXX: <imperative title>
- Status: ready | blocked
- Phase: <phase folder name>
- Depends on: [RB-###, ...]        # only upstream nodes in the DAG
- Implements design: [relative links to ADRs / design docs]
- Produces: <artifacts / components>

## Objective          — one paragraph; what "done" looks like
## Preconditions      — checklist true before starting
## Steps              — numbered atomic steps, each with **Do:** and **Verify:**
## Acceptance criteria — objectively checkable checklist (reference the phase exit gate)
## Rollback / safety  — how to undo a mid-way failure
## Hand-off           — what the next runbook may assume
```

Rules:
- **Steps are atomic + verifiable.** Each step has a concrete **Do:** (one action) and a **Verify:** (an observable check — a command, a file existing, a test passing). No step without a Verify.
- **Code is build guidance only** — skeletons, signatures, schemas, config. The builder writes the real code; do not paste full implementations.
- **Acceptance criteria** must restate the matching phase exit gate from [milestones-and-phases.md](../09-roadmap/milestones-and-phases.md) and be objectively checkable.
- **Cross-link** every ADR/design doc a runbook implements; link upstream runbooks in `Depends on:`.
- Use entity names from `PRODUCT-BRIEF.md` / `GLOSSARY.md` exactly (Source, Claim, Hypothesis, ExperimentScout, ledger, `wbtraffic.v0`, ImplicationMap, ExportAdapter).
- Mark unknowns `TODO(open-question: ...)`; never invent dates, numerics, or benchmark values.

## 2. CAW-06 builder rules (load-bearing — enforce in every relevant runbook)

### No overclaim — status lifecycle
A Hypothesis carries a **4-state reversible status** (`hypothesis` default → `supported` | `refuted` | `inconclusive`) with **calibrated qualitative uncertainty**. A hypothesis is **never** presented as a settled claim. No record may cross a function/module boundary stripped of its status/uncertainty. Runbooks that touch hypotheses must Verify the status field is present and defaulted correctly (ADR-0002).

### Evidence cap (HARD)
**Generated evidence can NEVER promote a hypothesis's status.** Toy-experiment output, model summaries, and pipeline-derived signals raise/lower uncertainty notes but cannot move status to `supported`. Any runbook writing evidence must Verify the cap holds: a generated-evidence write that attempts a status promotion is rejected. Keep sources, claims, evidence, and generated conclusions separate (brief §12).

### Failures useful — negative results retained
A toy experiment that **refutes** or **errors** is a valid outcome. Negative results are **recorded, classified, and surfaced by default** — never discarded or hidden. The 4-value verdict is `{supported, refuted, inconclusive, error}`. Runbooks must include a deliberately-failing-run path and Verify it is persisted and surfaced (ADR-0003).

### Reproducibility gate (HARD)
**No ledger entry without config + seed + env captured.** One run = ONE append-only `ledger/EXP-XXXX` entry recording a **pre-registered decision rule** (recorded BEFORE the run) → verdict. Runbooks must Verify the gate blocks an entry missing config/seed/env and that entries are append-only (no in-place mutation) (ADR-0003).

### Writeback is an export onto CAW-01 — no shared store
The `wbtraffic.v0` bundle is **self-describing** and **lowered onto CAW-01's L0 objects + open questions**, exported as a **one-way push to a configured boundary path**. CAW-06 never reads or writes a sibling product's internal store. **CAW-01 IR object names are owned by CAW-01 — re-verify them, do not assume.** v1 bundle = **analytic L0 estimate**: all ADR-0004 fields present, numerics default `null`/`TODO(open-question)`, basis marked `analytic-L0` vs `toy-grounded-L0`, modeled-vs-measured marked. Exports are **human-gated** (Jimmy reviews strategic decisions) (ADR-0004, ADR-0008).

### Generated summaries are not evidence
Any generated summary (implication-map prose, hypothesis narration, run digests) carries an explicit **generated** flag and never counts as evidence. Runbooks emitting summaries must Verify the flag is set (brief §12, ADR-0006).

### Stubs are NotImplemented
Ports (`SourceAdapter`, `ExperimentRunnerAdapter`, `ExportAdapter`) ship **before** adapters. Non-v1 adapters are **documented, registered, and inert** — they raise a `NotImplemented`-style guard. Runbooks must Verify a stub is registered in the config-driven registry yet raises when invoked (ADR-0001, ADR-0008).

### Leave the tree green
At every Acceptance checkpoint the tree must **compile and pass lint**, so an interrupted build resumes cleanly. The store and pipeline must be **idempotent + resumable**: re-running a runbook's steps does not duplicate records (dedup at S3) and does not corrupt append-only ledgers (ADR-0007).

## 3. Verification vocabulary
Prefer Verify steps that are machine-checkable: a CLI exit code, a created file path under `store/...`, a passing unit test, a schema-validator pass, a registry lookup, an idempotency re-run producing zero new records. Avoid Verify steps that rely on human judgment except where the brief mandates human gating (export review).

## 4. Boundary & safety defaults (all runbooks)
- No confidential company data in outputs; only ToS-safe sources ingested.
- Never conflate public-source research with internal claims.
- Cross-product references are **import/export boundaries** — name the other product (e.g. "CAW-01, a separate product"); never imply a shared store/registry/substrate.
- Automatic scouting is **proposal/hypothesis generation**; Jimmy is the reviewer for strategic decisions and the gate on exports.
