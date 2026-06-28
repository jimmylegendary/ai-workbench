# Provenance & Boundaries — origin/date/retrieval, public/internal, trust, generated-summary-not-evidence

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./data-model.md](./data-model.md) (the `provenance` block + per-entity fields)
  - [./storage-and-scheduling.md](./storage-and-scheduling.md) (where provenance is persisted)
  - [../01-decisions/ADR-0004-classification-and-triage.md](../01-decisions/ADR-0004-classification-and-triage.md) (rationale_note.evidence=false)
  - [../01-decisions/ADR-0005-related-work-ledger.md](../01-decisions/ADR-0005-related-work-ledger.md) (evidence_locator vs generated_summary)
  - [../01-decisions/ADR-0007-export-boundaries.md](../01-decisions/ADR-0007-export-boundaries.md) (how exports carry provenance)
  - [../02-research/related-work-ledger.md](../02-research/related-work-ledger.md) (export envelope detail)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This doc fixes the **rules** over the provenance/boundary/trust fields defined in [data-model](./data-model.md):
what each provenance field means and when it is required, the public/internal boundary contract, how per-source
trust is assigned and carried (never re-derived), the **generated-summary-is-not-evidence** invariant and exactly
how it is marked, and **how an ExportBundle carries provenance across a product boundary**. It does NOT define the
record schemas (data-model) or storage paths (storage-and-scheduling) — it governs the meaning and enforcement.

## 1. The three non-negotiables (from the brief)
1. **Provenance-complete.** Every record carries WHERE (origin), WHEN (published + retrieved), and HOW (adapter +
   run) — enough to re-locate and re-verify it independently (brief §7).
2. **Public/internal separation.** Findings are `boundary=public`; the radar never fuses a public finding with an
   internal Samsung/SAIT claim. Internal targets are *referenced* by opaque URI, never copied as text (brief §12).
3. **Generated summaries are never evidence.** An LLM abstract/digest/rationale may *prompt* or *explain*, never
   *back*, a link or claim. The backing is always a verified source + a concrete locator (brief §5/§12).

## 2. Provenance field contract
The shared `provenance` block (data-model §2) is required on every produced record. Field rules:

| Field | Meaning | Required | Rule |
|---|---|---|---|
| `origin` | source family it came from | yes | from a registered `SourceAdapter`; no free-text |
| `origin_ref` | canonical locator at origin | yes | re-fetchable (DOI/arXiv/URL/repo@sha) |
| `retrieved_at` | when CAW-05 fetched it | yes | RFC3339; set by the collect stage clock |
| `published_at` | source-asserted publish/update date | when present | `null` if source gives none — **never invented** |
| `run_id` | the producing Run | yes | ties record to a receipt (audit trail) |
| `adapter` | stage/adapter + version | yes | for reproducibility across adapter changes |
| `boundary` | public \| internal | yes | v1 ingests public only; gate at every emit |
| `trust_prior` | high \| medium \| low | yes | per-source prior (§4), carried not re-derived |

**Date discipline:** `retrieved_at ≠ published_at`. Cursors (storage §5) advance on `retrieved_at`; recall/recency
reasoning uses `published_at`. A missing date is `null` and flows through as `unknown` — no fabricated dates
(DOC-CONVENTIONS §3).

## 3. Boundary contract (public vs internal)
| boundary | Source of record | Allowed in store | Allowed in ExportBundle |
|---|---|---|---|
| `public` | public ToS-safe ingestion (brief §12) | yes | yes (the only exportable boundary) |
| `internal` | a referenced WatchedTarget's meaning (never ingested content) | only as `foreign_ref` + label | **never** as text — only the opaque ref |

The seam: a `WatchedTarget` may *point at* an internal CAW-03 claim via `foreign_ref` (`caw03://claim/CLM-2031`),
but the radar stores only the opaque ref + a human `label`, not the internal claim text. A LedgerLink therefore
joins a `public` finding to an internal *reference* without ever fusing internal text into a public record. Export
projects the `foreign_ref` so the consumer resolves it in its own namespace — independence preserved (brief §8).

**Fail-closed:** the export redaction sweep aborts a bundle if any non-`public` payload field is present
(defense-in-depth; consumers also re-redact). An empty bundle is refused, never written as a silent empty file.

## 4. Trust model
`trust_prior` is a **per-source prior**, assigned once by the source registry and **carried, not re-derived** by
the classifier (ADR-0004). It seeds the signal-vs-hype axis but never overrides the recall floor.

| trust_prior | Source families (ADR-0003) | Effect |
|---|---|---|
| high | arXiv / conference / Semantic Scholar | seeds signal axis high; still human-gated for novelty-threat |
| medium | lab blog RSS / GitHub | neutral seed; signal axis adjusted by cheap features (has-code/numbers) |
| low | HN / Reddit (stub) / newsletters (stub) | seeds signal low; never auto-discards a watch-list hit |

Trust is an *input to triage*, not a gate: a low-trust HN post that hits a tier-1 watch term still surfaces
(recall floor, ADR-0002/0004). Trust is provenance, not evidence — it never backs a claim.

## 5. Generated-summary-is-not-evidence — exact marking
Generated text is **physically separated** from evidence at every layer:

| Layer | Evidence field (backing) | Generated field (never backing) |
|---|---|---|
| Classification | source `abstract` (raw) | `rationale_note { evidence: false, model }` (ADR-0004) |
| LedgerLink | `verified_source_ref` + `evidence_locator` (pointer INTO source) | `generated_summary_ref` → `kind=generated-summary` (ADR-0005) |
| Digest | finding/link refs with locators | rendered prose body (clearly marked generated) |
| ExportBundle | `source` + `extracted_claims[].evidence_locator` | `raw_summary: "generated — NOT evidence"` |

Enforcement rules (no profile may relax — ADR-0004 §6):
- Any record's generated field carries `evidence:false` or `kind=generated-summary`; a schema validator rejects a
  generated string in an evidence field.
- `evidence_locator` must be a concrete pointer *into the source* (page/section/figure/abstract), never the
  summary text.
- A generated summary offered as a link's backing → **refused** (negative test N1, ADR-0005).

## 6. How exports carry provenance across the boundary
The `ExportBundle` (ADR-0007) is the only thing that crosses a product line; it carries provenance at two levels
so a consumer can audit without reaching into CAW-05's store (no shared substrate).

```json
{
  "boundary_kind": "caw05-signal",
  "source_product": "CAW-05",
  "producer_run_id": "caw05:run-2026-26",   // ties back to a CAW-05 run receipt
  "produced_at": "<RFC3339>",
  "declared_boundary": "public",            // bundle-level boundary assertion
  "idempotency_key": "hash(finding_id + target + classification_version)",
  "payload_sha256": "<hash>",               // content-addressed; consumer dedups re-imports
  "signature": "<scheme TBD>",              // signed; align across family
  "payload": { "signals": [ {
    "signal_id": "caw05:lnk-7f3a",
    "source": { "title": "…", "doi": "…", "url": "https://…", "external_ids": { "arxiv": "…", "s2": "…" } },
    "verification": { "status": "verified|ambiguous|unverified", "match_ratio": 0.0, "canonical_key": "doi:…" },
    "extracted_claims": [ { "text": "…", "evidence_locator": "p.4 §3.2" } ],
    "related_to": ["caw03-claim:<id>"],     // WatchedTarget foreign_ref, in the CONSUMER's namespace
    "raw_summary": "generated abstract — NOT evidence"   // kind=generated-summary, excluded from evidence
  } ] }
}
```

What the consumer can verify from the bundle alone:
- **Origin & re-locatability** — `source.url`/`doi`/`external_ids` + `verification.canonical_key` re-find the work.
- **Verification degree** — `verification.status`/`match_ratio` say how trusted the bibliographic identity is.
- **Evidence vs generation** — `extracted_claims[].evidence_locator` is backing; `raw_summary` is tagged
  generated and excluded from evidence (consumers re-enforce on import).
- **Boundary & integrity** — `declared_boundary=public`, `payload_sha256`, and signature; a non-public field
  aborts the bundle before emit.
- **Idempotency** — `idempotency_key` + `payload_sha256` let a consumer dedup weekly re-imports; a re-emit is a
  no-op (no double-routed novelty-threat to CAW-03).

CAW-05 emits a file; consumers **pull**. CAW-05 never writes into CAW-02/03/01/06 stores (brief §8).

## Negative tests (must hold)
- A generated summary offered as a link/claim backing → refused (N1).
- A non-`public` field in an export payload → bundle aborts (N3).
- A `published_at` absent at source → stored `null`, never a guessed date.
- A consumer re-importing the same `idempotency_key`/`payload_sha256` → dedup, no twin.

## Open Questions
- TODO(open-question: signature scheme for the export envelope — align with CAW-02 (minisign/cosign/DSSE) so one
  verifier works family-wide. — ADR-0007/research §4.)
- TODO(open-question: who maintains `WatchedTarget.foreign_ref` and how a stale ref is detected on a CAW-02/03
  rename — handshake vs accept drift. — ADR-0005.)
- TODO(open-question: do we export `ambiguous`/`unverified` links flagged `unknown` to CAW-02 for curator review,
  or hold them? Never to CAW-03's gate. — research §4/ADR-0005.)
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md) (to be created).

## Implications for runbooks
- **RB (provenance validator):** reject any record missing a required provenance field; reject a generated string
  in an evidence field; assert `boundary=public` on every ingested record.
- **RB (boundary/redaction sweep):** pre-emit fail-closed check (non-public → abort; empty → refuse); verify
  internal references are opaque `foreign_ref` only.
- **RB (export provenance):** populate envelope + per-signal provenance/verification/evidence-locator; tag
  `raw_summary` generated; sign + content-address; negative tests N1/N3 above.
