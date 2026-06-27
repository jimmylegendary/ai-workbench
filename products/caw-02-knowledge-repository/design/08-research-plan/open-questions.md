# Open Questions — Tracked Register

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: review date — do not invent)
- **Related:**
  - [research-plan.md](research-plan.md)
  - [validation-and-tests.md](validation-and-tests.md)
  - all ADRs in [../01-decisions/](../01-decisions/)
  - all research notes in [../02-research/](../02-research/)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

This is the **single aggregated register** of every open question raised in the CAW-02 design set
(all seven ADRs + all six research notes), de-duplicated and tracked. Each row has a stable `OQ-id`,
the question, the owning ADR/doc(s), a **resolve-by** target (phase or the research track that owns
it), and a status. ADRs and research notes link *here* rather than maintaining divergent lists; this
doc is the source of truth for "what is still undecided." It does NOT re-argue decisions — see the
owning ADR for context. Phases (P0/P1/P2) and research tracks (R1–R8) are defined in
[research-plan.md](research-plan.md).

## Status legend

| Status | Meaning |
| --- | --- |
| `open` | Unresolved; needs a decision or measurement. |
| `deferred` | Intentionally postponed behind a named revisit trigger (not blocking now). |
| `partial` | Direction fixed by an ADR; a sub-detail remains open. |
| `resolved` | Closed; owning ADR updated (strike here when done). |

## Register

| OQ-id | Question | Owning ADR / doc(s) | Resolve-by | Track | Status |
| --- | --- | --- | --- | --- | --- |
| OQ-01 | **ID scheme** — content-addressed hash vs sequential/typed slug (stable links vs dedup vs tamper-evidence). | ADR-0002, ADR-0003, [storage-options](../02-research/knowledge-store-storage-options.md) | P0 | R1 | open |
| OQ-02 | **claim_type taxonomy** — is `{empirical, methodological, definitional, comparative, normative}` sufficient? | ADR-0003, ADR-0005, [ingestion](../02-research/ingestion-and-extraction.md) | P0 | — | open |
| OQ-03 | **Persist rejected ClaimCandidates** as nodes for audit/training, and under what boundary? | ADR-0003, ADR-0005, [ingestion](../02-research/ingestion-and-extraction.md) | P0 | — | open |
| OQ-04 | Is **"independent source" for T2 corroboration** machine-decidable, or heuristic/human-judged (risk: shared-upstream false corroboration)? | ADR-0003, ADR-0004, [provenance](../02-research/provenance-and-trust-models.md) | P1 | — | open |
| OQ-05 | **Team write-concurrency** — git PR/merge vs serializing write-through API; the exact metric that forces the Postgres port. | ADR-0002, [storage-options](../02-research/knowledge-store-storage-options.md) | P0 (model) / P2 (port) | R3, R4 | open |
| OQ-06 | How do **`_events` JSONL and git history reconcile** if files are edited outside the skill interface? | ADR-0002, [storage-options](../02-research/knowledge-store-storage-options.md) | P0 | R1 | open |
| OQ-07 | **Semantic dedup cosine threshold + embedding model** — domain-tune on real claims. | ADR-0005, [ingestion](../02-research/ingestion-and-extraction.md) | P2 | R2 | deferred |
| OQ-08 | May agents **auto-accept any class of claim** (e.g. high-confidence public), or is human review mandatory for all in v0? | ADR-0005, [skill-interface](../02-research/agent-skill-interface-and-mcp.md), [ingestion](../02-research/ingestion-and-extraction.md) | P0 | — | open |
| OQ-09 | **Span stability** when a source is re-parsed by a newer parser — remap vs re-extract. | ADR-0005, [ingestion](../02-research/ingestion-and-extraction.md) | P1 | — | open |
| OQ-10 | How much of **CAW-05's classification** to trust as-is vs re-classify on intake (stage B3)? | ADR-0005, [ingestion](../02-research/ingestion-and-extraction.md), [import-export](../02-research/import-export-boundaries.md) | P1 | R6 | open |
| OQ-11 | **Confirmation-policy granularity** for agent writes — per-tool vs per-boundary vs per-actor allow-lists. | ADR-0001, ADR-0004, [skill-interface](../02-research/agent-skill-interface-and-mcp.md) | P0 | — | open |
| OQ-12 | **Inter-product API auth** — static token vs mTLS vs signed-URL drop. | ADR-0001, ADR-0007, [import-export](../02-research/import-export-boundaries.md) | P1 | R8 | open |
| OQ-13 | Should the **viewer** ever gain a thin human "propose" path, or stay strictly read-only in v1 (brief §9 = read-only)? | ADR-0001 | P2 | — | deferred |
| OQ-14 | **Reclassification / declassification workflow** — who beyond Jimmy may downgrade, and what audit is required? | ADR-0004, [provenance](../02-research/provenance-and-trust-models.md) | P1 | — | open |
| OQ-15 | **Tamper-evidence on provenance events** — hash chain / content addressing in v0, or later upgrade? | ADR-0004, [provenance](../02-research/provenance-and-trust-models.md) | P0 (light) / P2 (full) | R7 | open |
| OQ-16 | Exact **provenance-manifest fields** shared across the CAW-01/05/03 boundary. | ADR-0004, ADR-0007, [provenance](../02-research/provenance-and-trust-models.md) | P1 | R6 | open |
| OQ-17 | **Signature scheme** for export bundles — minisign vs cosign vs DSSE vs detached sig. | ADR-0007, [import-export](../02-research/import-export-boundaries.md) | P1 | R6 | open |
| OQ-18 | Do **CAW-01/05 emit our envelope natively**, or does CAW-02 ship thin wrapping adapters? | ADR-0007, [import-export](../02-research/import-export-boundaries.md) | P1 | R6 | open |
| OQ-19 | Where the **codename/fab/customer redaction regexes** live and how they stay in sync **without a shared dependency**. | ADR-0007, ADR-0004, [import-export](../02-research/import-export-boundaries.md) | P1 | R5 | open |
| OQ-20 | **Dedup authority** for Sources imported from CAW-05 — DOI vs arXiv vs S2 id precedence. | ADR-0007, [import-export](../02-research/import-export-boundaries.md) | P1 | R6 | open |
| OQ-21 | Honoring **`producer_run_id` traceability** without a live handle — is an opaque breadcrumb enough for audit? | ADR-0007, [import-export](../02-research/import-export-boundaries.md) | P1 | — | open |
| OQ-22 | **Embedding model & locality** — local vs API; does API embedding violate the confidential boundary (likely local-only for confidential)? | ADR-0006, [retrieval](../02-research/retrieval-and-rag.md) | P2 | R2 | deferred |
| OQ-23 | **Re-embedding policy** on model upgrades / edited items without stale vectors or broken provenance. | ADR-0006, [retrieval](../02-research/retrieval-and-rag.md) | P2 | R2 | deferred |
| OQ-24 | **Grounding-check engine** — automated claim-entailment in v0 or v1; LLM cost/boundary implications. | ADR-0006, [retrieval](../02-research/retrieval-and-rag.md) | P1 | — | open |
| OQ-25 | **Chunking unit** — whole `Claim`/`Note` rows vs sub-chunking long sources; how anchors/locators are stored. | ADR-0006, [retrieval](../02-research/retrieval-and-rag.md) | P1 | — | open |
| OQ-26 | **Synonym/concept tagging** investment ("poor-man's semantics") to delay embeddings. | ADR-0006, [retrieval](../02-research/retrieval-and-rag.md) | P1 | — | open |
| OQ-27 | **When to introduce vectors** vs FTS-only — the measured trigger (recall/precision A–D). | ADR-0006 | P2 | R2 | deferred |
| OQ-28 | Exact **trust-ladder values + evidence-count thresholds** for T0–T3/contested transitions. | ADR-0004, [skill-interface](../02-research/agent-skill-interface-and-mcp.md) | P0 | — | partial |
| OQ-29 | Should `synthesize_note` be allowed to **propose new Claims**, or only cite existing ones (proposal queue keeps Jimmy as reviewer)? | [skill-interface](../02-research/agent-skill-interface-and-mcp.md), ADR-0005 | P0 | — | open |
| OQ-30 | **Audit retention + confidential-field encryption/erasure** model. | [skill-interface](../02-research/agent-skill-interface-and-mcp.md), ADR-0002 | P1 | — | open |
| OQ-31 | How `import_projection` **verifies a CAW-01 export is genuinely artifact-backed** (not a pre-summarized blob) without a shared substrate. | [skill-interface](../02-research/agent-skill-interface-and-mcp.md), ADR-0007 | P1 | R6 | open |
| OQ-32 | **Idempotency-key retention window** (30d placeholder is unverified). | [skill-interface](../02-research/agent-skill-interface-and-mcp.md) | P0 | — | open |
| OQ-33 | **Edge storage** — adjacency rows in SQLite vs links embedded in md frontmatter (affects how the evidence gate + propagation are computed). | ADR-0002, ADR-0003, [provenance](../02-research/provenance-and-trust-models.md) | P0 | R1 | partial |
| OQ-34 | How **confidential CAW-01 projections are referenced** when the artifact store is unreachable from a public deployment — URI scheme + access mediation. | ADR-0004, [provenance](../02-research/provenance-and-trust-models.md) | P1 | R5 | open |
| OQ-35 | **Where the Claim→Evidence "≥1" invariant is enforced** beyond the three lockstep layers — also a DB trigger once on Postgres? | ADR-0003, [storage-options](../02-research/knowledge-store-storage-options.md) | P0 / P2 | R4 | partial |

## Notes on de-duplication

- **OQ-01 / OQ-33** are distinct but coupled (R1): the ID scheme and edge-storage choice are decided
  together because edges reference IDs.
- **OQ-05** absorbs the storage and write-path framings of "team concurrency"; it is the **named
  Postgres-port trigger** (R3 chooses the v0 model, R4 owns the port threshold).
- **OQ-07 / OQ-22 / OQ-23 / OQ-27** are all the *embedding* question seen from ingestion (dedup) and
  retrieval (recall, re-embedding, locality); all are `deferred` behind ADR-0006's measured triggers
  and tracked under R2. None ship a hard-coded number before measurement.
- **OQ-16 / OQ-17 / OQ-18 / OQ-20** are the *boundary-envelope* cluster, owned by ADR-0007 and
  research R6.
- **OQ-28** is `partial`: ADR-0004 fixes the ladder shape (T0–T3 + contested, AI capped at T2); only
  the exact evidence-count thresholds remain open.
- **OQ-35** is `partial`: ADR-0003 already fixes three lockstep enforcement layers; the only open part
  is whether a Postgres DB trigger is added as a *fourth* belt-and-braces check after the port.

## Implications for runbooks

- A runbook may not silently resolve an `open`/`partial` OQ by picking a value in code; it must either
  reference a now-`resolved` row here (with the owning ADR updated) or carry the `TODO(open-question)`
  marker forward.
- `deferred` rows must remain trigger-gated — no runbook implements them on speculation (DOC-CONVENTIONS
  + ADR-0006 measured-trigger discipline).
- When a question closes, strike its row to `resolved` here **and** update the owning ADR's
  Open-Questions section in the same change.
