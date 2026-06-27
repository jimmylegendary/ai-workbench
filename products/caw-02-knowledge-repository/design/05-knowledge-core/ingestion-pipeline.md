# Ingestion Pipeline (knowledge-core)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md) (source of truth)
  - [../01-decisions/ADR-0005-ingestion-pipeline.md](../01-decisions/ADR-0005-ingestion-pipeline.md) (the decision this elaborates)
  - [../01-decisions/ADR-0003-knowledge-data-model.md](../01-decisions/ADR-0003-knowledge-data-model.md) (entities/edges produced here)
  - [../01-decisions/ADR-0004-provenance-and-trust.md](../01-decisions/ADR-0004-provenance-and-trust.md) (trust/boundary attached here)
  - [../01-decisions/ADR-0001-product-surface-and-skill-interface.md](../01-decisions/ADR-0001-product-surface-and-skill-interface.md) (skill-wrap; one core)
  - [../01-decisions/ADR-0002-storage.md](../01-decisions/ADR-0002-storage.md) (file→index→`_events` transaction)
  - [../01-decisions/ADR-0007-import-export-contracts.md](../01-decisions/ADR-0007-import-export-contracts.md) (CAW-05/01 import envelope)
  - [../02-research/ingestion-and-extraction.md](../02-research/ingestion-and-extraction.md) (research backing)
  - [./retrieval.md](./retrieval.md) (consumes what this produces; B2 reuses `search()`)
  - [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This doc specifies, in build-ready depth, the **two ingestion pipelines** decided in
[ADR-0005](../01-decisions/ADR-0005-ingestion-pipeline.md): Pipeline A
(`add-source → parse → extract claim-candidates → attach evidence → synthesize cited note → classify/link signal`)
and Pipeline B (`add-related-work-signal → classify threat/support → link-to-claim`). It pins the **payload at each
stage**, the **provenance attached per stage**, the **evidence gate**, the **review state machine** (no silent
auto-accept), and **idempotency/transaction** behaviour. It does NOT re-decide the entity/edge schema
([ADR-0003](../01-decisions/ADR-0003-knowledge-data-model.md)), trust math
([ADR-0004](../01-decisions/ADR-0004-provenance-and-trust.md)), the import wire envelope
([ADR-0007](../01-decisions/ADR-0007-import-export-contracts.md)), or retrieval ([./retrieval.md](./retrieval.md)) —
those are consumed, not redefined.

## Where the pipeline runs
Every stage executes **inside the one transactional product core** behind the skill-wrap
([ADR-0001](../01-decisions/ADR-0001-product-surface-and-skill-interface.md)). API, MCP, and CLI are thin adapters
codegen'd from one op manifest; **there is no raw write path that bypasses the invariant or the evidence gate**.
Writes are append-only + supersedes; agent writes are confirmation-by-default. The storage contract
([ADR-0002](../01-decisions/ADR-0002-storage.md)) is **write `.md` file → mirror SQLite index → append
`knowledge/_events/<ts>-<op>.jsonl`**, with the `Claim→Evidence` invariant validated **before commit**; a failed
validation **aborts the whole transaction** (no orphan files/rows/events).

## The non-negotiable gate (structural, not advice)
Encoded identically here, in [ADR-0003](../01-decisions/ADR-0003-knowledge-data-model.md), and in
[ADR-0004](../01-decisions/ADR-0004-provenance-and-trust.md):

1. Everything an LLM emits (A2 candidates, A5 notes, B1/B3 outputs) is `generated: true` and starts `proposed`.
2. A `Claim` cannot reach `accepted` / `trust > T0` without **≥1 `Evidence` whose `extracted_from` resolves to a
   real artifact**. `kr.attach_evidence` has **no prose field** and `artifact_ref` MUST resolve — free text and
   `Note`s are structurally barred as evidence.
3. A `Note` carries `generated: true`, `cites` its claims, and **may never** be the source of an
   `evidence_for`/`extracted_from` edge.
4. AI-authored content is **trust-capped at T2** ([ADR-0004](../01-decisions/ADR-0004-provenance-and-trust.md)).
5. The reindex re-checks the invariant — a derived index that violated it would fail to rebuild, surfacing the bug.

---

## Pipeline A — add-source → … → synthesize cited note

| # | Stage | In → out | Provenance attached |
|---|---|---|---|
| A0 | **Register source** | file/URI/DOI → `Source{type, locator, content_hash, boundary, visibility, created_by, created_at}` | `sha256` content hash (dedup + idempotency key), original locator, `boundary` captured at intake (default-deny `internal`), `visibility`, actor (human or named agent skill) |
| A1 | **Parse / normalize** | `Source` → `ParsedDoc{blocks[{block_id, kind, text, page, char_span}], refs[]}` | per-block locator `{source_id, block_id, char_span, page}` — **the anchor**; `parser_version` for deterministic re-parse |
| A2 | **Extract claim-candidates** | `ParsedDoc` → `ClaimCandidate[]{text, claim_type, polarity, supporting_block_ids[], model_id, prompt_hash, tool_version, confidence}` | extractor identity; `generated: true`; `status: proposed`. A candidate with **no** `supporting_block_ids` is rejected at the schema layer |
| A3 | **Attach evidence (gate)** | `ClaimCandidate` → `Evidence[]{evidence_for→claim, extracted_from→artifact, locator, stance, rationale}` | the `evidence_for` link + a resolvable `artifact_ref`. No resolvable artifact ⇒ Claim stays `needs_evidence`, never auto-promotes |
| A4 | **Dedup / link** | new `Claim`+`Evidence` → merged with existing; `about_concept`/`addresses` edges | (1) exact source dedup by `content_hash`; (2) claim dedup by embedding cosine within a `Concept` neighborhood (~0.9, domain-tuned), **merge by union**, logged `{similarity, merged_into, decided_by}`; near-threshold → review |
| A5 | **Synthesize note (cited)** | accepted `Claim[]` → `Note{generated: true, cites:[claim_id…], evidence_rollup}` | inline `cites` + evidence rollup so a reader walks note→claim→evidence→source without re-running the LLM. **Never evidence** |
| A6 | **Review gate** | proposed `Claim`/`Note` → `accepted` / `needs_evidence` / `rejected` | reviewer identity + decision + reason + timestamp; on accept, **trust recomputed** per [ADR-0004](../01-decisions/ADR-0004-provenance-and-trust.md) (not caller-set) |

### Stage detail & concrete choices

**A0 — Register source.** Hash *first*; the hash is the source dedup key and the idempotency key (re-ingesting an
identical file is a no-op that returns the existing `source_id`). `boundary` is captured at intake (default-deny
`internal`) because it cannot be safely inferred later. Source `type ∈ {paper, article, note}` plus
import-reference types `trace`/`simulation_run`/`experiment` (CAW-01 exports, cataloged not executed) and intake
types `related_work`/`radar_signal` (Pipeline B).

**A1 — Parse / normalize.** Route by type: papers → **GROBID (PDF→TEI) primary**, LLM fallback for garbled PDFs;
articles → readability/markdown; notes → already structured. Emit a flat list of **addressable blocks** with stable
`block_id` and `char_span`. Parsing must be deterministic/re-runnable; store `parser_version` and re-parse only on
version bump, **remapping spans rather than orphaning claims**.

**A2 — Extract claim-candidates.** Schema-constrained LLM (emit JSON). Required:
`claim_type ∈ {empirical, methodological, definitional, comparative, normative}`, `polarity`, and
`supporting_block_ids`. Mandatory block refs **block the no-provenance case at the schema layer**. Persist
`model_id` + `prompt_hash` + `tool_version` so a bad prompt's output can be quarantined without losing sources.

**A3 — Attach evidence (the gate).** Convert "the block this claim came from" into a first-class `Evidence` row
pointing at a concrete artifact, plus any corroborating artifacts (other source spans, an imported CAW-01
projection by path, a dataset URI). Each evidence carries a 3-way `stance ∈ {SUPPORT, REFUTE, NEI}` + a one-line
`rationale` (SciFact pattern). **Invariant gate:** no resolvable `artifact_ref` ⇒ claim stays `needs_evidence`.

**A4 — Dedup / link.** Exact source-hash dedup; semantic claim dedup by cosine within a `Concept` neighborhood.
**Merge by union** — the surviving canonical claim accumulates *all* evidence and source pointers; nothing dropped;
the merge is logged. **Boundary is monotone on merge** (`internal` + `confidential` → `confidential`,
[ADR-0004](../01-decisions/ADR-0004-provenance-and-trust.md)). Near-threshold matches go to review, not auto-merge.

**A5 — Synthesize note (cited).** Compose a `Note` over **accepted claims only**, `generated: true`, with inline
`cites` and an `evidence_rollup`. A `Note` may never be the source of an evidence edge.

**A6 — Review gate.** Default policy: agent-skill submissions land `proposed`; **Jimmy is the reviewer for
strategic acceptance** (brief §10). Confidence-gated agent auto-accept is deferred
(`TODO(open-question: agent auto-accept policy)`).

---

## Pipeline B — add-related-work-signal → classify → link-to-claim

Intake of CAW-05 radar/related-work signals (use case 2). **CAW-05 is a separate, independent product**; signals
arrive across the import boundary as a versioned, signed envelope
([ADR-0007](../01-decisions/ADR-0007-import-export-contracts.md)) — there is no shared store. Signals become typed
entities **linked to our claims**, never loose summaries. Reuses A0–A2 provenance.

| # | Stage | In → out | Provenance attached |
|---|---|---|---|
| B0 | **Ingest signal** | CAW-05 envelope → `RadarSignal`/`RelatedWork{source_ref, boundary, received_at, origin:"CAW-05"}` | origin product, original signal id, declared boundary (**re-checked on intake, never upgraded**; quarantine-on-import), receipt time |
| B1 | **Resolve to Source/Claim** | signal → `Source` (external work, deduped by DOI/arXiv/S2) + `ClaimCandidate[]` | reuses A0–A2 (hash, locator, extractor id); `raw_summary` stored as `generated: true` context, **excluded from evidence** |
| B2 | **Find target claim(s)** | candidate → matched internal `Claim[]` | uses retrieval `search()` ([./retrieval.md](./retrieval.md)): FTS5/BM25 + structured filters (later embeddings); match scores + retrieval method recorded |
| B3 | **Classify stance** | (external claim, internal claim) → `{stance ∈ SUPPORT / REFUTE(threat) / NEI(neutral), rationale, confidence}` | classifier `model_id` + `prompt_hash`, rationale span, confidence; `generated: true` |
| B4 | **Link to claim** | stance → typed edge `supports`/`refutes`: `RelatedWork`→`Claim`, with `extracted_from` evidence pointing at the **external work's artifact** (not the CAW-05 summary) | the directed stanced link + evidence pointer; review status |
| B5 | **Review / escalate** | proposed link → accepted; **a `REFUTE` on an accepted Claim auto-raises an `OpenQuestion`** + notifies reviewer | reviewer; escalation lineage |

**Classification semantics.** *Threat* = a credible external result that **refutes/undercuts** an accepted claim
(`REFUTE`); *support* = corroborates (`SUPPORT`); *neutral* = related-but-no-direct-bearing (`NEI`). The
auto-raised `OpenQuestion` on a threat is the radar's whole point. CAW-05's own classification is **re-validated on
intake**, not trusted blindly (`TODO(open-question: how much of CAW-05's classification to re-classify at B3)`).
The external signal becomes durable `Evidence` for the stance link, referencing the **external work's artifact**,
never the CAW-05 summary text.

---

## Review state machine (no silent auto-accept in v0)

Every generated artifact is `proposed` until a reviewer acts. There is no path from `proposed` to `accepted` that
an agent can take silently in v0 ([ADR-0005](../01-decisions/ADR-0005-ingestion-pipeline.md) decision 4).

```text
            ┌──────────── needs_evidence ◄──────────┐
            │                  ▲                     │ (re-run A3, attach artifact)
 (A2/B1) ── proposed ─────────►│                     │
            │     │   reviewer: needs_evidence       │
            │     │                                  │
   reviewer:│     │ reviewer: accept (gate satisfied)│
   reject   │     ▼                                  │
            └►  rejected        accepted ◄───────────┘
              (retained for      │  trust recomputed (ADR-0004), AI-capped T2
               audit; superseded)│  REFUTE on accepted Claim ⇒ auto OpenQuestion (B5)
```

| Transition | Actor | Precondition | Recorded |
|---|---|---|---|
| `→ proposed` | extractor (A2/B1) | schema-valid candidate w/ block refs | `model_id`, `prompt_hash`, `tool_version`, `generated: true` |
| `proposed → accepted` | reviewer (human v0) | **evidence gate satisfied** (≥1 resolvable `artifact_ref`) | reviewer id, reason, ts; trust recomputed |
| `proposed → needs_evidence` | reviewer or gate | no resolvable artifact | reviewer/system, reason, ts |
| `proposed → rejected` | reviewer | rejected on merit | reviewer id, reason, ts; **retained for audit** |
| `accepted → superseded` | new write | append-only supersede (no update/delete) | superseding entity id, ts |

All transitions are append-only and mirrored to `knowledge/_events`; git history is the audit
([ADR-0002](../01-decisions/ADR-0002-storage.md)). Rejected candidates **may** be retained
(`TODO(open-question: retention boundary for rejected candidates)`).

## The add-related-work-signal → classify → link flow (worked)
1. CAW-05 exports a signal envelope → **B0** quarantine + boundary re-check → `RadarSignal` row.
2. **B1** resolves the cited external work to a `Source` (dedup by DOI/arXiv/S2) and extracts `ClaimCandidate[]`;
   `raw_summary` kept as context only.
3. **B2** retrieves candidate internal `Claim[]` via `search()` ([./retrieval.md](./retrieval.md)).
4. **B3** classifies stance per (external, internal) pair → `SUPPORT | REFUTE | NEI` + rationale + confidence.
5. **B4** writes the stanced edge with `Evidence` pointing at the **external artifact** (gate applies).
6. **B5**: a `REFUTE` on an *accepted* `Claim` auto-raises an `OpenQuestion` (`addresses` edge) and notifies the
   reviewer; everything else lands `proposed` for review.

## Cumulative provenance (what points back to what)
```text
Source         ── content_hash, locator/URI, boundary, visibility, actor, time   (A0/B0)
  └ Block      ── {source_id, block_id, char_span, page}                         (A1)   ← the anchor
      └ Claim  ── model_id+prompt_hash, generated:true, status, trust            (A2/B1)
      └ Evidence ── extracted_from → artifact + locator, stance, rationale       (A3/B4) ← invariant target
          └ Note   ── generated:true, cites[claim_id], rollup                    (A5)    ← never evidence
Review events  ── actor, decision, reason, time on every promotion               (A6/B5)
Merge events   ── similarity, merged_into, decided_by                            (A4)
```
Rules: every artifact reference is a **locator, never prose**; extractor identity travels with generated content;
**boundary is monotone on merge**; re-ingestion is **idempotent** via source hash and re-parse remaps spans.

## Idempotency & transactionality
- **Idempotent** by `content_hash` (A0) and by deterministic re-parse (A1) keyed on `parser_version`.
- **Atomic:** file → index → `_events`, invariant validated **before commit**; failure aborts the whole
  transaction. The reindex is deterministic/idempotent and re-checks the invariant
  ([ADR-0002](../01-decisions/ADR-0002-storage.md)).

## Open Questions
See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md) and
[ADR-0005](../01-decisions/ADR-0005-ingestion-pipeline.md):
- `TODO(open-question: semantic dedup cosine threshold + embedding model — domain-tune)`
- `TODO(open-question: agent auto-accept policy — any class, or human review mandatory in v0?)`
- `TODO(open-question: claim_type taxonomy adequacy)`
- `TODO(open-question: span stability on re-parse by a newer parser version — remap vs re-extract)`
- `TODO(open-question: how much of CAW-05's classification to re-classify at B3)`
- `TODO(open-question: retention boundary for rejected ClaimCandidates)`

## Implications for runbooks
- **RB (intake & parse):** `Source` registration w/ hashing + boundary capture; type-routed parser
  (GROBID + LLM fallback) producing addressable blocks. Verify: identical re-ingest is idempotent; every block has
  a resolvable locator.
- **RB (claim extraction):** schema-constrained extractor; mandatory `supporting_block_ids`; persist
  `model_id`+`prompt_hash`. Verify: no candidate without a block pointer.
- **RB (evidence & gate):** `Evidence` writer + the gate (no promote without resolvable `artifact_ref`). Verify:
  accepting a claim whose only "evidence" is generated text fails.
- **RB (dedup & link):** exact source-hash dedup + union-merge semantic dedup w/ logging. Verify: merge preserves
  all evidence and source pointers.
- **RB (synthesize note):** cited `Note` generator; guard barring notes from being evidence. Verify: every note
  resolves to source spans.
- **RB (signal intake):** CAW-05 envelope → Source/Claim resolution; B2 via `search()`; 3-way stance; stanced link;
  `REFUTE`→`OpenQuestion` escalation. Verify: a refuting signal on an accepted claim auto-creates an OpenQuestion +
  reviewer notification.
- **RB (review gate):** state machine `proposed → accepted/needs_evidence/rejected` w/ actor+reason+timestamp on
  every transition. Verify: all transitions audited and reversible-by-record (supersede, not delete).
