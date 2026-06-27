# ADR-0005: Ingestion pipeline and signal intake

- **Status:** proposed
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md) (source of truth)
  - [ADR-0001-product-surface-and-skill-interface.md](ADR-0001-product-surface-and-skill-interface.md)
  - [ADR-0002-storage.md](ADR-0002-storage.md) (planned)
  - [ADR-0003-knowledge-data-model.md](ADR-0003-knowledge-data-model.md)
  - [ADR-0004-provenance-and-trust.md](ADR-0004-provenance-and-trust.md) (planned)
  - [ADR-0006-import-export-contracts.md](ADR-0006-import-export-contracts.md) (planned)
  - [../02-research/ingestion-and-extraction.md](../02-research/ingestion-and-extraction.md)
  - [../02-research/provenance-and-trust-models.md](../02-research/provenance-and-trust-models.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
Decide the **ingestion pipeline**: the staged flow for use case 1
(`add-source → extract-claims → synthesize-note`, cited) and use case 2
(`add-related-work-signal → classify threat/support → link-to-claim`), the **provenance attached at each stage**,
and the hard **generated-summary-is-not-evidence** rule as a pipeline gate. It does NOT decide storage (ADR-0002),
the entity/edge model (ADR-0003 — consumed here), trust recomputation (ADR-0004), the surface/skill catalog
(ADR-0001), or import wire formats (ADR-0006 — consumed here); it fixes how those compose into a transaction.

## Context
- The brief's **unit of value** (§2) is one provenance-preserving transaction: `add source → extract claim(s) →
  attach evidence → synthesize note (cited)` that stays reconstructable and reusable.
- The dangerous failure mode (§2, §10): an LLM-produced claim/note/summary mistaken for **evidence**. Extraction
  is LLM-assisted, so every generated artifact starts as a **proposal**, not a fact.
- v0 = **append + retrieve + skill-wrap** (§2). The pipeline writes through the same core/skill-wrap and guardrails
  as every other surface (ADR-0001) — there is no raw write path that bypasses the invariant.
- Storage (ADR-0002) is md-first SoT + rebuildable index, written **file-first, then index, then `_events`**, with
  the invariant validated before commit; a failed validation **aborts the whole transaction**.
- Signal intake (use case 2) consumes CAW-05 exports across the import boundary (ADR-0006); signals are **never**
  stored as loose summaries.

## Decision — Pipeline A: add-source → extract-claims → synthesize-note
Six stages, each a step inside one or more skill-wrap transactions. Each stage **attaches provenance** and writes
nothing that violates the `Claim→Evidence` invariant (ADR-0003).

| # | Stage | In → out | Provenance attached |
|---|---|---|---|
| A0 | **Register source** | file/URI/DOI → `Source{type, locator, content_hash, boundary, visibility, created_by, created_at}` | `sha256` content hash (dedup key, idempotency), original locator, `boundary` captured **at intake** (default-deny: `internal`), actor (human or named agent skill) |
| A1 | **Parse / normalize** | `Source` → `ParsedDoc{blocks[{block_id, kind, text, page, char_span}], refs[]}` | per-block locator `{source_id, block_id, char_span}` — **the anchor** every later span resolves to; parser version stored for deterministic re-parse |
| A2 | **Extract candidate claims** | `ParsedDoc` → `ClaimCandidate[]{text, claim_type, polarity, supporting_block_ids[], model_id, prompt_hash, tool_version, confidence}` | extractor identity (`model_id` + `prompt_hash` + `tool_version`); `generated=true`; `status=proposed`. A candidate with **no** `supporting_block_ids` is rejected here. |
| A3 | **Attach evidence (invariant gate)** | `ClaimCandidate` → `Evidence[]{evidence_for→claim, extracted_from→artifact, locator, stance, rationale}` | the `evidence_for` link + a concrete `artifact_ref`; **the gate**: no resolvable artifact ⇒ Claim stays `needs_evidence`, never auto-promotes. Prose can never be an `artifact_ref`. |
| A4 | **Dedup / link** | new `Claim`+`Evidence` → merged with existing; `about_concept`/`addresses` links | (1) exact **source dedup** by `content_hash`; (2) **claim dedup** by embedding cosine within a `Concept` neighborhood (~0.9, domain-tuned), **merge by union** (no evidence/source dropped), logged `{similarity, merged_into, decided_by}`; near-threshold → human review |
| A5 | **Synthesize note (cited)** | accepted `Claim[]` → `Note{generated=true, cites:[claim_id…], evidence_rollup}` | inline `cites` to claim ids + an evidence rollup so a reader walks note→claim→evidence→source without re-running the LLM. **A Note may never be evidence.** |
| A6 | **Review gate** | proposed `Claim`/`Note` → `accepted` / `needs_evidence` / `rejected` | reviewer identity + decision + reason + timestamp; on accept, **trust assigned** (recomputed per ADR-0004, not caller-set) |

**Concrete choices (from the ingestion research):**
- **Parsing:** GROBID (PDF→TEI, structured/deterministic) **primary**, LLM fallback for garbled PDFs; articles via
  readability/markdown; notes already structured. Parsing must be re-runnable so locators survive re-parse.
- **Extraction:** **schema-constrained** LLM (emit JSON; required `claim_type ∈ {empirical, methodological,
  definitional, comparative, normative}`, `polarity`, `supporting_block_ids`). Mandatory block refs block the
  no-provenance case at the schema layer.
- **Evidence stance:** 3-way **SUPPORT / REFUTE / NEI** + one-line rationale (SciFact pattern), aligning with the
  radar threat/support/neutral labels.
- **Acceptance policy (v0):** agent-skill submissions land as `proposed`; **Jimmy is the reviewer for strategic
  acceptance** (brief §10). Confidence-gated agent auto-accept is deferred (open question).

## Decision — Pipeline B: add-related-work-signal → classify → link-to-claim
Intake of CAW-05 radar/related-work signals (use case 2). Signals become **typed entities linked to our claims**,
never loose summaries. Reuses A0–A2 provenance.

| # | Stage | In → out | Provenance attached |
|---|---|---|---|
| B0 | **Ingest signal** | CAW-05 export (ADR-0006 envelope) → `RadarSignal`/`RelatedWork{source_ref, boundary, received_at, origin:"CAW-05"}` | origin product, original signal id, declared boundary (re-checked, never upgraded), receipt time |
| B1 | **Resolve to Source/Claim** | signal → `Source` (the external work, deduped by DOI/arXiv/S2) + `ClaimCandidate[]` (what it asserts) | reuses A0–A2 (hash, locator, extractor id); `raw_summary` stored as context `generated=true`, **excluded from evidence** |
| B2 | **Find target claim(s)** | candidate → matched internal `Claim[]` via keyword/FTS (+ later embeddings) retrieval | match scores + retrieval method recorded |
| B3 | **Classify stance** | (external claim, internal claim) → `{stance ∈ supports / refutes(threat) / neutral(NEI), rationale, confidence}` | classifier `model_id` + `prompt_hash`, rationale span, confidence; `generated=true` |
| B4 | **Link to claim** | stance → typed edge `supports`/`refutes` : `RelatedWork`→`Claim`, with `extracted_from` evidence pointing at the **external work's artifact** (not the CAW-05 summary) | the directed stanced link + evidence pointer; review status |
| B5 | **Review / escalate** | proposed link → accepted; **a `refutes` stance on an accepted Claim auto-raises an `OpenQuestion`** + notifies the reviewer | reviewer; escalation lineage |

**Classification semantics:** *threat* = credible external result that **refutes/undercuts** an accepted claim
(REFUTE); *support* = corroborates (SUPPORT); *neutral* = related-but-no-direct-bearing (NEI). The auto-raised
`OpenQuestion` on a threat is the radar's whole point. CAW-05's own classification is **re-validated on intake**,
not trusted blindly (open question on how much to re-classify).

## The non-negotiable rule (gate, not advice)
**Generated summaries are NOT evidence** (brief §5/§10). Encoded as hard pipeline gates, identical to the
ADR-0003 invariant and ADR-0001 guardrails:
1. Everything an LLM emits (A2 candidates, A5 notes, B1/B3 outputs) is `generated=true` and starts `proposed`.
2. A `Claim` cannot reach `accepted` / `trust > T0` without **≥1 `Evidence` whose `extracted_from` resolves to a
   real artifact** (A3/B4 gate). Free text and `Note`s are structurally barred as `artifact_ref` (ADR-0001
   schema: `kr.attach_evidence` has no prose field).
3. A `Note` carries `generated=true`, `cites` its claims, and **may never** be the source of an
   `evidence_for`/`extracted_from` edge.
4. **Transactionality (ADR-0002):** write file → mirror index → append `_events`, with the invariant validated
   **before** commit; a failed validation aborts the whole transaction (no orphan files/rows).

## Cumulative provenance (what points back to what)
```
Source        ── content_hash, locator/URI, boundary, actor, time        (A0/B0)
  └ Block      ── {source_id, block_id, char_span, page}                 (A1)   ← the anchor
      └ Claim  ── model_id+prompt_hash, generated=true, status, trust    (A2/B1)
      └ Evidence ── extracted_from → artifact + locator, stance, rationale (A3/B4) ← invariant target
          └ Note  ── generated=true, cites[claim_id], rollup             (A5)   ← never evidence
Review events ── actor, decision, reason, time on every promotion         (A6/B5)
Merge events  ── similarity, merged_into, decided_by                      (A4)
```
Rules: every artifact reference is a **locator, never prose**; extractor identity travels with generated content
so a bad model/prompt can be quarantined without losing sources; **boundary is monotonic on merge**
(internal+confidential → confidential, ADR-0004); re-ingestion is **idempotent** via source hash and re-parse
remaps spans rather than orphaning claims.

## Decision (summary)
1. Two staged pipelines (A: source→claims→note; B: signal→classify→link), both flowing through the **skill-wrap +
   core** (ADR-0001) — no bypass path.
2. **GROBID-primary parsing**, **schema-constrained LLM extraction** with mandatory block refs, **3-way stance +
   rationale**, **exact-hash source dedup + union-merge semantic claim dedup**.
3. The **generated-summary-is-not-evidence rule as a hard gate** at A3/B4, enforced transactionally and re-checked
   on reindex.
4. **Human review (Jimmy) is the v0 acceptance gate** for strategic claims; agent output lands `proposed`.
5. A **`refutes` stance on an accepted Claim auto-raises an `OpenQuestion`** and notifies the reviewer.

## Consequences
**Easy:** every accepted Claim is reconstructable to source spans; agents contribute at volume without corrupting
provenance; re-ingestion is safe/idempotent; threats surface as OpenQuestions automatically.

**Hard / follow-on:** needs a deterministic, version-pinned parser and span-remap strategy; semantic dedup
threshold + embedding model need domain tuning; a review queue is required because v0 forbids agent auto-accept;
B3 re-classification cost vs trusting CAW-05 labels is unresolved.

## Open questions / revisit triggers
- `TODO(open-question: semantic dedup cosine threshold + embedding model — domain-tune on real claims; aligns with ADR-0007.)`
- `TODO(open-question: may agents auto-accept any class of claim (e.g. high-confidence public), or is human review mandatory for all in v0?)`
- `TODO(open-question: claim_type taxonomy adequacy — owned with ADR-0003.)`
- `TODO(open-question: span stability on re-parse by a newer parser version — remap vs re-extract.)`
- `TODO(open-question: how much of CAW-05's classification to trust as-is vs re-classify at B3.)`
- `TODO(open-question: persist rejected ClaimCandidates for audit/training, and under what boundary?)`
- **Revisit** when embeddings land (ADR-0007) — B2 retrieval and A4 dedup both upgrade.
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks
- **RB (intake & parse):** `Source` registration with hashing + boundary capture; type-routed parser (GROBID +
  LLM fallback) producing addressable blocks with stable `block_id`/`char_span`. Verify: re-ingesting an identical
  file is idempotent; every block has a resolvable locator.
- **RB (claim extraction):** schema-constrained extractor emitting `ClaimCandidate` JSON with mandatory
  `supporting_block_ids`; persist `model_id`+`prompt_hash`. Verify: no candidate exists without a block pointer.
- **RB (evidence & invariant gate):** `Evidence` writer + the `Claim→Evidence` gate (no promote without resolvable
  `artifact_ref`). Verify: accepting a claim whose only "evidence" is generated text fails.
- **RB (dedup & link):** exact source-hash dedup + embedding/ANN claim dedup with union-merge + merge logging.
  Verify: merging two claims preserves all evidence and source pointers.
- **RB (synthesize note):** cited `Note` generator with `generated=true`, inline citations, evidence rollup, and a
  guard barring notes from being evidence. Verify: every note resolves to source spans.
- **RB (signal intake):** CAW-05 signal → Source/Claim resolution, target-claim retrieval, 3-way stance
  classifier, stanced link writer, **`refutes`→OpenQuestion** escalation. Verify: a refuting signal on an accepted
  claim auto-creates an OpenQuestion + reviewer notification.
- **RB (review gate):** state machine `proposed → accepted/needs_evidence/rejected` with actor+reason+timestamp on
  every transition, for human and agent actors. Verify: all transitions audited and reversible-by-record.
