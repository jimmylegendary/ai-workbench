# Data Flow — the Run pipeline (fetch → dedup → rank → classify → route → ledger → synthesize → export)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./tech-stack.md](./tech-stack.md), [./repo-structure.md](./repo-structure.md)
  - [../01-decisions/ADR-0001-product-surface-and-outputs.md](../01-decisions/ADR-0001-product-surface-and-outputs.md) (Run + surfaces + formats)
  - [../01-decisions/ADR-0002-interest-model.md](../01-decisions/ADR-0002-interest-model.md) (relevance rank)
  - [../01-decisions/ADR-0003-source-adapters-and-ingestion.md](../01-decisions/ADR-0003-source-adapters-and-ingestion.md) (fetch + dedup)
  - [../01-decisions/ADR-0004-classification-and-triage.md](../01-decisions/ADR-0004-classification-and-triage.md) (classify + route)
  - [../01-decisions/ADR-0005-related-work-ledger.md](../01-decisions/ADR-0005-related-work-ledger.md) (ledger + verification)
  - [../01-decisions/ADR-0006-storage-and-scheduling.md](../01-decisions/ADR-0006-storage-and-scheduling.md) (Run wrapper, cursors, dedup, idempotency)
  - [../01-decisions/ADR-0007-export-boundaries.md](../01-decisions/ADR-0007-export-boundaries.md) (export bundles)
  - [../02-research/scheduling-and-ports.md](../02-research/scheduling-and-ports.md) (ports + lifecycle)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This doc describes **how data moves through a single Run** of the radar: the ordered stages, the value object that
crosses each stage boundary, where state is read/written, and the recall/idempotency invariants each stage must
hold. It is the runtime companion to the static layout in [repo-structure.md](./repo-structure.md) and the tool
choices in [tech-stack.md](./tech-stack.md). It does NOT re-decide the interest model, classification rubric,
ledger schema, or export contracts — those are their ADRs; this doc shows how they compose. The pipeline is the
ONE core behind all three surfaces (scheduled cron / CLI / MCP — ADR-0001); the surface only *starts* a Run.

## 1. The Run at a glance (ASCII)

```
                         caw05 run --window weekly         (cron | CLI | MCP — ADR-0001)
                                    │
                       ┌────────────▼─────────────┐
                       │  RUN WRAPPER (ADR-0006)   │  single-flight lock · preflight · checkpoints
                       │  acquire run.lock         │  refuse if held · resume at last stage
                       └────────────┬─────────────┘
                                    │
   interests.yaml (ADR-0002) ─────► │ ◄───── sources.yaml / caw05.config.toml (registry, ADR-0003)
                                    │
   ┌────────────────────────────────────────────────────────────────────────────────────────┐
   │ STAGE 1  COLLECT  (SourceAdapter.discover/fetch — driven port)                           │
   │   arXiv+S2 │ GitHub │ blog RSS │ HN-light        stubs: Reddit · EDGAR · newsletters      │
   │   read state/<source>.cursor ──► fetch only new ──► advance cursor ON SUCCESS only        │
   │   emits RawFinding[]  (provenance: origin · retrieved_at · native_id · boundary=public)   │
   └───────────────────────────────────────────┬────────────────────────────────────────────┘
                                                ▼  RawFinding[]
   ┌────────────────────────────────────────────────────────────────────────────────────────┐
   │ STAGE 2  DEDUP  (core — ADR-0003 §5 / ADR-0006 §4)                                        │
   │   L1 canonical id (DOI▸arXiv▸url-norm▸repo+sha)  L2 SHA-256(title+body)  L3 SimHash(flag) │
   │   merge same item across sources → ONE finding, MANY provenance entries                   │
   │   read/write state/seen.idx          recall-safe default: when unsure, KEEP BOTH          │
   └───────────────────────────────────────────┬────────────────────────────────────────────┘
                                                ▼  Finding[] (deduped, multi-provenance)
   ┌────────────────────────────────────────────────────────────────────────────────────────┐
   │ STAGE 3  RANK / RELEVANCE  (ADR-0002)                                                     │
   │   BM25 over FTS5 index + ADDITIVE EXPLAINABLE score (keyword/topic/entity/author/venue)   │
   │   tiers + polarity from interests.yaml      RECALL-FIRST floor: low score ≠ dropped       │
   │   optional embedding lane (alpha, gated)    attaches score + per-term contribution        │
   └───────────────────────────────────────────┬────────────────────────────────────────────┘
                                                ▼  ScoredFinding[] (score + explanation)
   ┌────────────────────────────────────────────────────────────────────────────────────────┐
   │ STAGE 4  CLASSIFY  (cascade — ADR-0004)                                                   │
   │   LF (labeling functions) ─► LLM ─► HUMAN     two axes: relevance × signal/hype           │
   │   recall-biased SELECTIVE-REVIEW gate: low confidence ⇒ abstain ⇒ queue for human         │
   │   writes generated rationale, marked kind=generated  (NEVER evidence — brief §5/§12)      │
   └───────────────────────────────────────────┬────────────────────────────────────────────┘
                                                ▼  ClassifiedFinding[] (label + confidence + rationale)
   ┌────────────────────────────────────────────────────────────────────────────────────────┐
   │ STAGE 5  ROUTE  (deterministic config-driven — ADR-0004)                                  │
   │   knowledge · task · experiment · open-question · discard                                 │
   │   route is a pure function of (label, confidence, config) → RoutedSignal[]                │
   └───────────────────────────────────────────┬────────────────────────────────────────────┘
                                                ▼  RoutedSignal[]
   ┌────────────────────────────────────────────────────────────────────────────────────────┐
   │ STAGE 6  LEDGER  (append-only — ADR-0005)                                                 │
   │   WatchedTarget ◄─link─ Finding/Signal      Semantic Scholar verification                 │
   │   (Levenshtein title gate + year±1 + multi-key dedup) → verification record               │
   │   append LedgerLink to ledger/*.jsonl       provenance-complete = single auditable record │
   └───────────────────────────────────────────┬────────────────────────────────────────────┘
                                                ▼  LedgerLink[] (verified, provenance-complete)
   ┌────────────────────────────────────────────────────────────────────────────────────────┐
   │ STAGE 7  SYNTHESIZE  (FormatRenderer port — ADR-0001)                                     │
   │   memo · digest · slide-outline · paper-card · action-brief   (markdown-first)            │
   │   every generated block marked kind=generated (not evidence); links back to LedgerLink    │
   └───────────────────────────────────────────┬────────────────────────────────────────────┘
                                                ▼  rendered artifacts (out/*.md)
   ┌────────────────────────────────────────────────────────────────────────────────────────┐
   │ STAGE 8  EXPORT  (ExportAdapter port — ADR-0007, ONLY export seam)                        │
   │   CAW-02 Source/Claim/RelatedWork · CAW-03 novelty RadarSignal · CAW-01/06 open-questions │
   │   idempotency_key = hash(finding_id + target + classification_version) → re-emit = no-op   │
   │   signed bundle written across boundary — NO shared store                                  │
   └───────────────────────────────────────────┬────────────────────────────────────────────┘
                                                ▼
                       ┌────────────────────────────────────────────┐
                       │ DONE → write runs/<run_id>.receipt.json     │  heartbeat / dead-man's-switch
                       │ {window, per_source:{fetched,new,dup},      │  missing receipt > cadence+grace
                       │  classified_counts, exports[], status}      │  ⇒ ALERT "radar went dark"
                       └────────────────────────────────────────────┘
```

## 2. Stage contract table

| # | Stage | Owner / port | Reads | Writes | Output value object | Key invariant |
|---|---|---|---|---|---|---|
| 1 | Collect | `SourceAdapter` (ADR-0003) | `state/<src>.cursor`, config | advances cursor on success | `RawFinding` | provenance complete; advance cursor **only on full success** |
| 2 | Dedup | core (ADR-0003/0006) | `state/seen.idx` | updates `seen.idx` | `Finding` (multi-provenance) | recall-safe: when unsure keep both; arXiv versions stay distinct-but-linked |
| 3 | Rank | interest model (ADR-0002) | `interests.yaml`, FTS5 index | score cache | `ScoredFinding` | additive + explainable; **recall-first floor — low score never drops** |
| 4 | Classify | cascade (ADR-0004) | model/LF config | review queue, rationale | `ClassifiedFinding` | abstain→human on low confidence; rationale `kind=generated` ≠ evidence |
| 5 | Route | router (ADR-0004) | routing config | — | `RoutedSignal` | deterministic pure function of (label, conf, config) |
| 6 | Ledger | ledger (ADR-0005) | `ledger/*.jsonl`, S2 | append `LedgerLink` | `LedgerLink` | append-only; Levenshtein+year±1 verification; provenance-complete |
| 7 | Synthesize | `FormatRenderer` (ADR-0001) | findings + ledger | `out/*.md` | rendered artifact | markdown-first; generated blocks marked non-evidence |
| 8 | Export | `ExportAdapter` (ADR-0007) | routed signals | boundary bundles | `ExportReceipt` | idempotency key → no double-emit; signed; no shared store |

## 3. The value object as it thickens
Each stage **adds** to one carrier object and never silently drops it (recall posture). The object accumulates:

```
RawFinding         = canonical_id · provenance[] · title · authors · body/summary · body_is_full_text
  └► Finding       + merged provenance[] (cross-source) · dedup_keys{id, sha256, simhash?}
      └► ScoredFinding   + relevance{score, floor_hit, contributions[{term, tier, polarity, weight}]}
          └► ClassifiedFinding + label{relevance_axis, signal_hype_axis} · confidence · review_state · rationale(kind=generated)
              └► RoutedSignal      + route ∈ {knowledge,task,experiment,open-question,discard} · target[]
                  └► LedgerLink        + watched_target_ref · verification{method, score, matched_paper_id} · run_id
```

A `discard` route still produces a record (tombstone in the ledger / `seen` memory) so a re-run does not
re-surface it — discard is *audited*, not forgotten (ADR-0006 retention is an open question).

## 4. State touched per Run (files-as-truth + SQLite cache — ADR-0006)

| Artifact | Role | Stage |
|---|---|---|
| `interests.yaml` | typed interest artifact, tiers + polarity (versioned) | 3 |
| `sources.yaml` / `caw05.config.toml` | adapter registry + wiring | 1, 8 (preflight) |
| `state/<source>.cursor` | per-source incremental watermark | 1 |
| `state/seen.idx` | content-addressed dedup index | 2 |
| `index.sqlite` (FTS5 + seen + ledger projection) | **rebuildable** cache for BM25 + lookups | 2, 3, 6 |
| `findings/*.json` | one record per finding (truth) | 2–6 |
| `ledger/*.jsonl` | append-only LedgerLinks (truth) | 6 |
| `out/<run_id>/*.md` | rendered formats | 7 |
| `exports/<target>/*.bundle` | signed cross-boundary bundles | 8 |
| `runs/<run_id>.receipt.json` | heartbeat + per-stage counts | done |

Contract (ADR-0006): **files are truth, `index.sqlite` is a disposable cache.** Deleting the DB and replaying
files reproduces FTS5, the `seen` set, and the ledger projection.

## 5. Failure, resume, and idempotency
- **Crash mid-stage** → the wrapper keeps the last completed checkpoint; the next trigger re-enters at that stage
  (ADR-0006 §2.3). Stages are ordered so re-entry is safe: dedup absorbs the overlapping re-fetch.
- **Re-run of the same window** → cursors unchanged ⇒ collect yields `new=0`; dedup reports `dup=all`; export
  idempotency keys make re-emission a no-op. Negative test (must hold): re-running a `done` Run changes nothing.
- **Missed week** → next Run's window simply spans more time (catch-up via watermark, not clock). A skipped week
  with no receipt raises an alert, never a silent no-op.
- **Single-flight** → a second trigger while a Run holds `run.lock` is refused (logged), not stacked.

## 6. Recall & evidence discipline across the flow
- **Never drop at the source** (Stage 1) and **never drop on low relevance** (Stage 3 floor): filtering is a
  *human-reviewable* later act, not a silent early one. The only programmatic drop is `discard` *after* classify,
  and it is recorded.
- **Generated ≠ evidence end-to-end:** the LLM rationale (Stage 4), synthesized prose (Stage 7), and any summary
  in an export bundle (Stage 8) are all marked `kind=generated`. The auditable evidence is the provenance-complete
  `LedgerLink` (Stage 6), never the generated text (brief §5, §12; ADR-0004, ADR-0005).
- **No shared substrate:** Stage 8 writes *bundles across boundaries*; the radar proposes, it never writes into a
  sibling product's store (brief §1, §8; ADR-0007).

## Open Questions
Track in `../08-research-plan/open-questions.md`:
- TODO(open-question: is a Run one synchronous process or resumable stage-jobs with a job handle? — affects the
  crash-resume model above and the CLI/MCP `status` contract.)
- TODO(open-question: discard-tombstone retention/TTL — how long must dedup remember a discard?)
- TODO(open-question: when two sources surface the same item, which provenance is canonical on merge, and is the
  non-canonical source still recorded for audit?)
- TODO(open-question: does Stage 6 verification run inline or as a deferred batch when S2 is rate-limited?)

## Implications for runbooks
- **RB (core/Run-wrapper):** wire the eight-stage pipeline with per-stage checkpoints; emit the run-receipt.
- **RB (stages 2–3):** dedup core + relevance rank reading `interests.yaml` and the FTS5 index.
- **RB (stages 4–5):** the LF→LLM→human cascade + deterministic router; mark rationale non-evidence.
- **RB (stages 6–8):** ledger append + S2 verification; FormatRenderer set; ExportAdapter bundles with idempotency.
- Keep the carrier value objects (`RawFinding`→`LedgerLink`) typed and additive so no stage can silently drop a finding.
