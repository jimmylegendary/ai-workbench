# Ingestion & Claim Extraction

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** ../_meta/PRODUCT-BRIEF.md, ../01-decisions/ (ADR: ingestion pipeline — to be written), ../08-research-plan/open-questions.md (to be created)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This doc researches and specifies the **ingestion pipeline** for CAW-02: the
`add-source → extract-claims → synthesize-note` loop (use case 1) and the
`add-related-work-signal → classify threat/support → link-to-claim` loop (use case 2). It defines a
**stage-by-stage pipeline**, the **data each stage carries**, and **where provenance is attached** at every hop so
the source→claim→evidence→note chain stays reconstructable (Brief §2, §5).

It does **NOT** decide storage format (md-first vs SQLite — separate ADR), the full data-model schema (separate
ADR), retrieval/embedding strategy, or the import/export wire contracts with CAW-01/05/03 (separate ADRs). It
treats those as boundaries and names the fields ingestion must populate for them.

## Grounding (real tools/patterns this design borrows from)
- **Structured parsing of papers:** GROBID converts PDF → TEI/XML with title, abstract, sectioned full text,
  figures/tables, and parsed references (~0.87 F1 on references). Good baseline for paper parsing; pair with an LLM
  fallback for messy PDFs ([GROBID docs](https://grobid.readthedocs.io/en/latest/Introduction/),
  [CORE+GROBID](https://blog.core.ac.uk/2023/07/17/core-grobid-structured-text-from-34-million-scientific-documents-and-counting/)).
- **Claim ↔ evidence as first-class:** PaperTrail uses a multi-stage extraction (offline paper-level claim/evidence
  extraction, real-time answer-level extraction, claim–evidence matching) and computes *source provenance* per
  claim — the same separation CAW-02 enforces ([PaperTrail](https://arxiv.org/html/2602.21045v1)).
- **Classification labels:** SciFact-style **SUPPORT / REFUTE / NEI (NoInfo)** with sentence-level *rationales* is
  the standard for "does this evidence support the claim?" — maps directly to our threat/support/neutral signal
  classification ([SciFact](https://ui.adsabs.harvard.edu/abs/2020arXiv200414974W/abstract),
  [SciClaimHunt](https://arxiv.org/html/2502.10003v1)).
- **Dedup:** embedding + ANN near-duplicate clustering with a cosine threshold (~0.9 typical, domain-tuned) for
  collapsing restated claims ([SemHash](https://medium.com/@sreeprad99/how-semhash-simplifies-semantic-deduplication-for-llm-data-a0b1a53e84fe),
  [BigCode dedup](https://huggingface.co/blog/dedup)).
- **Schema-constrained extraction:** forcing the LLM to emit JSON against a schema with mandatory span offsets is
  the auditability pattern for evidence extraction ([schema-constrained biomedical extraction](https://arxiv.org/pdf/2601.14267)).

## The non-negotiable rule (Brief §5, §10)
**Generated summaries are NOT evidence.** An LLM-produced claim, note, or summary is a *proposal* until it is
linked to `Evidence` that references a concrete artifact/source span — never free text. The pipeline encodes this
as a hard invariant: a `Claim` cannot reach `accepted` state without ≥1 `Evidence` row whose `locator` resolves to
a real artifact. Synthesized `Note` text is stored with a `generated: true` flag and may never be cited as
evidence for another claim.

---

## Pipeline A — add-source → extract-claims → synthesize-note

Six stages. Each row below lists the **input → output payload** and the **provenance attached at that stage**.

| # | Stage | Carries in → out | Provenance attached here |
|---|-------|------------------|--------------------------|
| A0 | **Intake / register source** | raw file or URI/DOI → `Source{id, type, locator, hash, boundary, added_by, added_at}` | content hash (`sha256`), original locator/URI, `boundary` (public/internal/confidential), actor (human or agent skill id) |
| A1 | **Parse / normalize** | `Source` → `ParsedDoc{sections[], blocks[ {block_id, kind, text, page, char_span} ], refs[]}` | per-block locator: `{source_id, section, page, char_span}` — the addressable anchor every later span points to |
| A2 | **Extract candidate claims** | `ParsedDoc` → `ClaimCandidate[]{text, polarity, claim_type, supporting_block_ids[], extractor, model_id, prompt_hash, confidence}` | extractor identity (`model_id`, `prompt_hash`, `tool_version`), pointers to source blocks, `generated:true` |
| A3 | **Attach evidence** | `ClaimCandidate` → `Evidence[]{claim_ref, artifact_ref, locator, snippet, stance, rationale}` | the claim→evidence link itself + the **artifact reference** (block span, imported trace path, dataset URI). Enforces the invariant. |
| A4 | **Dedup / link** | new `Claim`+`Evidence` → merged into existing `Claim`s; `Concept`/`OpenQuestion` links | merge decisions logged (`merged_into`, `similarity`, `decided_by`); no source/evidence is discarded on merge |
| A5 | **Synthesize note (cited)** | accepted `Claim[]` → `Note{text, generated:true, cites:[claim_id…], evidence_rollup}` | inline citations to claim ids; note carries the full chain back to sources; flagged non-evidence |
| A6 | **Review (human/agent gate)** | proposed `Claim`/`Note` → `accepted` / `needs-evidence` / `rejected` | reviewer identity, decision, timestamp, trust-level assignment |

### Stage detail

**A0 — Register source.** Compute a content hash *before* anything else; it is the dedup key for sources and makes
re-ingestion idempotent. Capture `boundary` at intake (cannot be inferred later safely). The actor is either a
human or a named **agent skill** (Brief §5 skill-wrap) — both recorded identically so agent contributions are
auditable. Source types: `paper` (PDF/arXiv/DOI), `article` (web/markdown), `note` (Jimmy's own), and
import-references `trace`/`simulation_run`/`experiment` (CAW-01 exports, cataloged not executed — Brief §7).

**A1 — Parse / normalize.** Route by type: papers → GROBID (TEI) with an LLM fallback for failed/garbled PDFs;
articles → readability/markdown extraction; notes → already structured. Output a flat list of **addressable
blocks** each with a stable `block_id` and `char_span`. *This is the single most important provenance artifact:*
every downstream claim, evidence snippet, and citation resolves to a `{source_id, block_id, char_span}` locator.
Parsing must be deterministic/re-runnable so locators survive re-parse (store the parser version; re-parse only on
version bump, and remap spans).

**A2 — Extract candidate claims.** LLM-assisted, **schema-constrained** (emit JSON; required fields: claim text,
`claim_type` ∈ {empirical, methodological, definitional, comparative, normative}, `polarity`, and the
`supporting_block_ids` the claim was drawn from). The extractor is forced to cite the block(s) it read — a claim
with no block pointer is rejected at this stage. Everything A2 emits is a **candidate** (`status: proposed`,
`generated: true`). Store `model_id` + `prompt_hash` so an extraction run is reproducible and a bad prompt's output
can be quarantined later.

**A3 — Attach evidence.** Convert "the block this claim came from" into a first-class `Evidence` row pointing at a
concrete artifact, plus any *additional* corroborating artifacts (other source spans, an imported CAW-01
projection by path, a dataset). Each evidence carries a `stance` (supports/refutes/neutral) and a one-line
`rationale` (SciFact pattern). **Invariant gate:** if no evidence resolves to a real artifact, the claim stays
`needs-evidence` and can never auto-promote. Generated summary text is structurally barred from being an
`artifact_ref`.

**A4 — Dedup / link.** Two layers: (1) **source dedup** by content hash (exact); (2) **claim dedup** by embedding
cosine similarity over claim text within the same `Concept` neighborhood, ANN-retrieved, threshold ~0.9 (tune per
domain — open question). On match, **merge by union**: the surviving canonical claim accumulates *all* evidence and
*all* source pointers from both — nothing is dropped, and the merge is logged with `similarity` and `decided_by`.
Above-threshold matches near the boundary go to human review rather than auto-merge. Also link claim → `Concept`,
and spin off `OpenQuestion`/`Assumption`/`Decision` rows where the extractor flagged them.

**A5 — Synthesize note (cited).** Compose a `Note` over **accepted** claims only. The note is `generated:true`,
must carry inline citations to the claim ids it rests on, and stores an `evidence_rollup` (the distinct artifacts
behind those claims) so a reader can walk note → claim → evidence → source span without re-running the LLM. A note
may never be used as evidence (Brief §10).

**A6 — Review gate (human/agent).** Default policy: agent-skill submissions land as `proposed`; **Jimmy is the
reviewer for strategic acceptance** (Brief §10). Review actions: `accept` (assign trust level), `needs-evidence`
(bounce to A3), `reject` (keep for audit, mark superseded). Low-risk, high-confidence, public-boundary claims *may*
be eligible for agent auto-accept under a documented policy — open question. Every transition records actor +
timestamp + reason.

---

## Pipeline B — add-related-work-signal → classify threat/support → link-to-claim

Intake of CAW-05 radar / related-work signals (Brief §3 use case 2, §7). Signals are **never** stored as loose
summaries — they become typed entities linked to our existing claims.

| # | Stage | Carries in → out | Provenance attached here |
|---|-------|------------------|--------------------------|
| B0 | **Ingest signal** | CAW-05 export → `RelatedWork`/`RadarSignal{id, source_ref, boundary, received_at, origin:"CAW-05"}` | origin product, original signal id, boundary, receipt time |
| B1 | **Resolve to Source/Claim** | signal → `Source` (the cited external work) + `ClaimCandidate[]` (what it asserts) | reuses A0–A2 provenance (hash, locator, extractor id) |
| B2 | **Find target claim(s)** | candidate → matched internal `Claim[]` via embedding/keyword retrieval | match scores + retrieval method recorded |
| B3 | **Classify stance** | (external claim, internal claim) → `{stance ∈ supports / threatens(refutes) / neutral(NEI), rationale, confidence}` | classifier `model_id`, `prompt_hash`, rationale span, confidence; `generated:true` |
| B4 | **Link to claim** | stance → `Link{from:RelatedWork, to:Claim, stance, evidence_ref}` | the directed, stanced link + evidence pointer; review status |
| B5 | **Review / escalate** | proposed link → accepted; **threat → OpenQuestion/Decision** | reviewer; escalation creates an `OpenQuestion` when a credible threat refutes an accepted claim |

**Classification semantics.** "Threat" = a credible external result that **refutes/undercuts** one of our
accepted claims (SciFact REFUTE). "Support" = corroborates (SUPPORT). "Neutral" = related-but-no-direct-bearing
(NEI). A **threat that targets an accepted claim** must auto-raise an `OpenQuestion` and notify the reviewer — this
is the radar's whole point. The external signal becomes durable `Evidence` for the stance link (it references the
external work's artifact, not the CAW-05 summary text).

---

## Provenance model — what is attached and where (summary)

Provenance is **layered and cumulative**; nothing downstream can exist without pointing back one layer:

```
Source        ── hash, locator/URI, boundary, actor, time          (A0/B0)
  └ Block      ── {source_id, block_id, char_span, page}           (A1)   ← the anchor
      └ Claim  ── extractor model_id+prompt_hash, generated:true,   (A2)
      │          supporting_block_ids, status, trust_level
      └ Evidence ── artifact_ref + locator, stance, rationale       (A3/B4) ← invariant target
          └ Note  ── generated:true, cites[claim_id], rollup        (A5)    ← never evidence
Review events  ── actor, decision, reason, time on every promotion  (A6/B5)
Merge events   ── similarity, merged_into, decided_by               (A4)
```

Key rules:
- **Every artifact reference is a locator, never prose.** Free text can't be evidence (Brief §5 invariant).
- **Extractor identity travels with generated content** (`model_id`, `prompt_hash`, `tool_version`) so a bad model
  or prompt can be traced and its output quarantined without losing the underlying sources.
- **Boundary is set at intake and is monotonic on merge** (a merge of internal+confidential → confidential).
  Exports (to CAW-03) filter to public-safe only (Brief §7).
- **Re-ingestion is idempotent** via source hash; re-parse remaps spans, never orphans claims.

## Tradeoffs / decision points

| Decision | Option A | Option B | Lean |
|----------|----------|----------|------|
| Paper parsing | GROBID (structured, deterministic) | LLM end-to-end (handles messy PDFs) | GROBID primary + LLM fallback |
| Claim extraction control | schema-constrained JSON w/ required block refs | free-form then post-validate | schema-constrained (auditable, blocks the no-provenance case) |
| Dedup trigger | auto-merge above threshold | always human-confirm | auto exact-hash; semantic merge auto only well above threshold, else review |
| Agent acceptance | all agent output → human review | confidence-gated auto-accept | human review v0; revisit auto-accept policy |
| Evidence stance labels | binary support/refute | SUPPORT/REFUTE/NEI + rationale | 3-way + rationale (matches radar threat/support/neutral) |

## Open Questions
TODO(open-question: semantic dedup cosine threshold and which embedding model — domain-tune on real claims).
TODO(open-question: may agents auto-accept any class of claim, or is human review mandatory for all in v0?).
TODO(open-question: claim_type taxonomy — is the 5-way {empirical/methodological/definitional/comparative/normative} sufficient?).
TODO(open-question: span-stability strategy when a source is re-parsed by a newer parser version — remap vs re-extract).
TODO(open-question: how much of CAW-05's classification can we trust as-is vs re-classify on intake at B3?).
TODO(open-question: do we persist rejected ClaimCandidates for audit/training, and under what boundary?).

## Implications for runbooks
- **RB (intake & parse):** build `Source` registration with hashing + boundary capture, and the type-routed parser
  (GROBID service + LLM fallback) producing addressable blocks with stable `block_id`/`char_span`. Verify: a
  re-ingested identical file is idempotent; every block has a resolvable locator.
- **RB (claim extraction):** schema-constrained LLM extractor emitting `ClaimCandidate` JSON with mandatory
  `supporting_block_ids`; reject any candidate lacking block refs. Persist `model_id`+`prompt_hash`. Verify: no
  candidate exists without a source-block pointer.
- **RB (evidence & invariant):** `Evidence` writer + the **claim→evidence invariant gate** (no promote without a
  resolvable artifact_ref). Verify: attempting to accept a claim with only generated text as "evidence" fails.
- **RB (dedup & link):** exact source-hash dedup + embedding/ANN claim dedup with union-merge and merge logging.
  Verify: merging two claims preserves all evidence and source pointers.
- **RB (synthesize note):** cited `Note` generator with `generated:true`, inline claim citations, evidence rollup,
  and a guard that bars notes from being used as evidence. Verify: every note resolves to source spans.
- **RB (signal intake):** CAW-05 signal → Source/Claim resolution, target-claim retrieval, 3-way stance
  classifier, stanced link writer, and threat→OpenQuestion escalation. Verify: a refuting signal on an accepted
  claim auto-creates an OpenQuestion and a reviewer notification.
- **RB (review gate):** state machine `proposed → accepted/needs-evidence/rejected` with actor+reason+timestamp on
  every transition, for both human and agent actors. Verify: all transitions are audited and reversible-by-record.
