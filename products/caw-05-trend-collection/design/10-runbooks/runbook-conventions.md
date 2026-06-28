# CAW-05 Runbook Conventions — strict format + builder rules

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: review date)
- **Related:** [./README.md](./README.md), [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS.md), [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md), [../05-radar-core/overview.md](../05-radar-core/overview.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This doc fixes **how every CAW-05 runbook is written and executed**: the STRICT runbook format (from
[../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS.md) §6) plus the **CAW-05-specific builder rules** that are
load-bearing for an early-warning radar (recall-first; dedup + triage in core; abstain→human; generated rationale
never exported as evidence; legal/ToS sources only; stubs are `NotImplemented`; leave the tree green). It does NOT
sequence the runbooks (see [./README.md](./README.md)) or decide design (see ADRs + `05-radar-core/`).

## 1. Strict runbook format (DOC-CONVENTIONS §6 — mandatory)
Every runbook file is `RB-XXX-<topic>.md` (kebab-case), numbered `RB-0XX` = stage 0 … `RB-4XX` = stage 4, and uses
**exactly** this skeleton:

```
# RB-XXX: <imperative title>
- Status: ready | blocked
- Phase: <phase folder name>
- Depends on: [RB-###, ...]
- Implements design: [relative links to ADRs / 05-radar-core docs]
- Produces: <artifacts/components>

## Objective         — one paragraph; what "done" looks like
## Preconditions      — checklist true before starting
## Steps              — numbered atomic steps, each with **Do:** and **Verify:**
## Acceptance criteria — objectively checkable checklist
## Rollback / safety  — how to undo a mid-way failure
## Hand-off           — what the next runbook can assume
```

Rules for the body:
- **Atomic, verifiable steps.** Every step has a concrete **Do:** action and a **Verify:** check that an
  agent/CI can evaluate without judgement calls. No step combines two unrelated changes.
- **Code is build guidance only** — skeletons, signatures, config samples. The builder writes the real
  implementation; do not paste finished code as if it were the deliverable.
- **Cross-link design.** `Implements design:` links every ADR and `05-radar-core/` doc the runbook realizes; link
  back so design ↔ runbook stays traceable (DOC-CONVENTIONS §4).
- **No invented facts.** Do not invent dates, benchmark numbers, recall targets, or internal facts. Mark unknowns as
  `TODO(open-question: ...)` and link [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).
- **Use exact names** from PRODUCT-BRIEF / GLOSSARY (Run, SourceAdapter, FormatRenderer, ExportAdapter, LedgerLink,
  novelty-threat, etc.). Do not coin synonyms.
- **Status discipline:** a runbook is `blocked` until every `Depends on:` runbook has passed Acceptance; flip to
  `ready` only when its preconditions hold.

## 2. CAW-05 builder rules (apply to every runbook)
These encode the radar's identity. A step that violates one of these is a defect even if it "works".

### R1 — Recall-first, always
Missing one close paper/system can erase novelty (PRODUCT-BRIEF §1). Relevance uses a **recall-first floor**: when
in doubt, **surface, do not drop**. Acceptance checks for ranking/relevance runbooks MUST include a watch-list
spot-check that **no known close item falls below the floor**. Prefer false positives (a human skims them) over
false negatives (a missed result). Heavy ML ranking is out for v1 — keep it BM25-first, additive, and **explainable**
(ADR-0002, [../05-radar-core/interest-model.md](../05-radar-core/interest-model.md)).

### R2 — Dedup and triage live in the CORE, not in adapters
SourceAdapters only fetch + normalize + carry cursors. **Multi-layer dedup** (cross-source, cross-run) and all
**classification/triage/routing** happen in the pipeline core (ADR-0003/0004,
[../05-radar-core/source-ingestion-and-dedup.md](../05-radar-core/source-ingestion-and-dedup.md)). A runbook that
puts dedup or triage logic inside an adapter is wrong. Verify: the same item from two sources, or the same item on a
second Run, collapses to one finding in the core.

### R3 — Classification abstains to a human (selective review)
The cascade is **LF → LLM → human**, recall-biased. On low confidence the classifier **abstains and queues the item
for human review** — it does NOT auto-decide (ADR-0004,
[../05-radar-core/classification-and-triage.md](../05-radar-core/classification-and-triage.md)). Acceptance for
classify/route runbooks MUST verify that low-confidence findings land in the human-review queue, not in an automatic
route. Findings are proposals; Jimmy is the reviewer for strategic decisions (PRODUCT-BRIEF §12).

### R4 — Generated rationale is NEVER evidence, NEVER exported as fact
Generated summaries/rationales are stored **separately and flagged non-evidence** (PRODUCT-BRIEF §5, §12,
[../05-radar-core/synthesis-and-formats.md](../05-radar-core/synthesis-and-formats.md)). Export bundles carry
**source + claim + provenance**, not model prose presented as a finding. Never conflate public-source research with
internal Samsung/SAIT claims. Verify: export payloads contain provenance-backed fields; any generated text is marked
generated and excluded from the evidence fields.

### R5 — Legal / ToS-safe sources only
Only ingest **public, legally/ToS-safe** sources (PRODUCT-BRIEF §12). No paywalled or ToS-violating ingestion, ever.
No confidential company data in public-facing outputs. A source runbook MUST verify the access path respects the
source's ToS/rate limits (e.g. ETag/date cursors, documented API terms). When unsure, leave it a stub (R6).

### R6 — Stubs are documented `NotImplemented`, behind their port
Non-v1 capabilities — sources (Reddit, SEC/EDGAR, newsletters, internal feeds), the four non-digest formats,
non-CAW-03 exports, non-cron schedulers — ship as **documented stubs that raise `NotImplemented`** behind their port,
registered in config and disabled by default (PRODUCT-BRIEF §9, ADR-0001). A stub never silently fakes data. Verify:
the stub is listed in the port registry, raises `NotImplemented` when invoked, and is off by default.

### R7 — Export only through the ExportAdapter port; no shared store
The **ExportAdapter is the ONLY export seam** (ADR-0007,
[../05-radar-core/export-boundaries.md](../05-radar-core/export-boundaries.md)). No direct cross-product writes, no
shared runtime/store with CAW-01/02/03/06. Bundles are file/API boundaries and **signed**. A novelty-threat export
must trace to a provenance-complete LedgerLink (verified for M2; see open question on the M1 minimal case in the DAG
doc). Verify: every export goes through the port and produces a signed bundle.

### R8 — Leave the tree green (resumable from files)
At every Acceptance checkpoint the tree **compiles, lints, and passes tests**, and state lives in files
(`interests.yaml`, `findings/*.json`, `ledger/*.jsonl`) + the SQLite index (FILES-AS-TRUTH, ADR-0006). An interrupted
build or Run resumes from files, not memory. A runbook that leaves the tree red is not done.

## 3. Verify-step quality bar
A **Verify:** is acceptable only if a build agent or CI can run it and get an unambiguous pass/fail — e.g. a command
exit code, a file existing with required fields, a test name, a count, a green lint. Avoid "looks correct" /
"seems reasonable". Each builder rule above (R1–R8) should appear as a concrete Verify wherever it applies.

## 4. Definition of done (per runbook)
- All `Steps` have passed their `Verify:`.
- All `Acceptance criteria` boxes are objectively checked.
- Applicable builder rules R1–R8 are verified, not assumed.
- The tree is green and the `Hand-off` accurately states what the next runbook may assume.

## Hand-off
Builders: read this file, then [./README.md](./README.md) for ordering, then execute the lowest-numbered `ready`
runbook in the current phase folder. If any instruction here conflicts with a runbook, this conventions doc + the
design win; if design conflicts with [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md), the brief wins.
