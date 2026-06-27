# ADR-0007: Import/export contracts with CAW-01 / CAW-05 / CAW-03

- **Status:** proposed
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md)
  - [../02-research/import-export-boundaries.md](../02-research/import-export-boundaries.md)
  - [./ADR-0002-storage.md](./ADR-0002-storage.md)
  - [./ADR-0004-provenance-and-trust.md](./ADR-0004-provenance-and-trust.md)
  - [./ADR-0006-retrieval.md](./ADR-0006-retrieval.md)
  - [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
Decide the **concrete file/API boundary contracts** by which CAW-02 imports from CAW-01 (simulation projections) and
CAW-05 (radar/related-work signals), and exports to CAW-03 (paper/patent drafting) — plus the **confidentiality checks**
on each crossing. It consumes the trust/boundary model of [ADR-0004](./ADR-0004-provenance-and-trust.md) and the
storage model of [ADR-0002](./ADR-0002-storage.md). It does NOT define CAW-02 internals or the internals of
CAW-01/03/05 (separate, independent products).

## Context
- CAW-01, CAW-03, CAW-05 are **separate, independently deployable products**. CAW-02 interacts only via import/export
  boundaries — **no shared DB, registry, queue, or runtime** (brief §1, §7).
- Imports must catalog foreign artifacts **without leaking confidential data** (brief §7); confidentiality is enforced
  **at the crossing, in both directions** (brief §6, §10).
- Generated summaries are never imported as evidence (brief §5, §10).
- Public-facing exports must be public-safe only (brief §6, §10).

## Options considered
| Decision | Option | Pros | Cons | Fit |
|---|---|---|---|---|
| Transport | **Versioned file artifact first, optional pull API** | Diffable, replayable, no live coupling; matches md-first store | Producer must emit a file | **Chosen** |
| Transport | Shared DB / queue / registry | "Live" data | Violates independence (brief §1, §7) | Rejected |
| Format | **JSON envelope + JSONL for signals** | Ubiquitous, schema-validatable, inspectable | Verbose | **Chosen** |
| Format | PROV-XML | Standard | Heavy, less ergonomic | Rejected |
| Boundary copy | **Content-addressed copy / stable URI CAW-02 controls** | Survives foreign system being down; dedups | Storage cost | **Chosen** |
| Boundary copy | Live reference into foreign store | No copy | Breaks failure-isolation; reconstructability depends on a foreign system | Rejected |
| Redaction trust | **Re-redact on both import and export** | Defense in depth | Duplicate work | **Chosen** |
| Redaction trust | Trust producer's `redaction_applied` | Cheap | Single point of failure | Rejected |
| Schema home | **CAW-02 owns + validates its boundary schemas** | We control what we ingest/emit | We maintain adapters | **Chosen** |
| Schema home | Shared schema registry | DRY | Shared substrate (rejected by brief §7) | Rejected |

## Decision

### 1. No shared store; a common versioned envelope
Every crossing is a versioned file artifact (preferred) or a pull-API call. All three share one outer envelope so the
same validator, signature check, and audit log apply everywhere:
```json
{
  "contract_version": "1.0.0",                       // semver; reject unknown MAJOR
  "boundary_kind": "caw01-projection | caw05-signal | caw03-bundle",
  "source_product": "CAW-01",
  "produced_at": "<RFC3339>",
  "producer_run_id": "<opaque id in the SOURCE product>",  // breadcrumb, not a live handle
  "declared_boundary": "public | internal | confidential",
  "declared_audience": "team | jimmy-private",
  "payload_sha256": "<hash of canonicalized payload>",     // content-addressing + dedup
  "redaction_applied": ["rule ids the producer claims it stripped"],
  "payload": { "...boundary-specific..." }
}
```
- **Boundary is a copy, not a live reference.** Imported artifacts are cataloged as `Evidence` pointing to a
  content-addressed copy / stable URI **CAW-02 controls**; we never depend on a foreign system being up to reconstruct
  provenance.
- **`contract_version` is semver; unknown MAJOR is rejected**, never guessed.
- **CAW-02 owns and validates its own boundary schemas** — no shared registry.

### 2. IMPORT — CAW-01 simulation projections → `Evidence`
A projection becomes **`Evidence`, never a `Claim`** (the curator/skill writes the claim text; the projection is what the
claim points at — preserves the [ADR-0004](./ADR-0004-provenance-and-trust.md) invariant). `kind: generated-summary` is
cataloged with low trust, flagged "not evidence-grade", and **cannot be sole evidence** for a claim. Large artifacts are
copied into CAW-02's content-addressed vault (or referenced by stable URI per [ADR-0002](./ADR-0002-storage.md)), with the
hash stored for later integrity check.

**Confidentiality checks:** boundary floor (`imported >= declared_boundary`, never downgraded — clamp to stricter);
confidential-field scrub (if `confidential_fields` set and no `public_safe_view`, store **only** at `confidential` —
else quarantine for the curator); **re-redaction regardless of `redaction_applied`**; free-text leak scan over
title/metric for codename/fab/customer markers; `jimmy-private` projections never auto-shared to team views.

### 3. IMPORT — CAW-05 radar/related-work signals → typed entities, never loose summaries
Transport is `*.caw05.jsonl` (one signal per line) or pull. The external work becomes a **`Source`** (deduped by
`external_ids`/`doi`, Levenshtein-title fallback). `classification: threat|support` attaches as a typed **`RelatedWork`**
link to the targeted `Claim`/`Concept` (so "what threatens claim X" is queryable). Each `extracted_claims[*]` becomes a
candidate `Claim` whose `Evidence` is the `Source` + `evidence_locator` — **never the `raw_summary`**. The `raw_summary`
is stored on the `Source` as `kind=generated-summary`, excluded from evidence. A signal raising a tension records an
`OpenQuestion`; a credible **threat on an accepted claim** auto-raises an `OpenQuestion` and notifies the reviewer.

**Confidentiality checks:** provenance separation (public sources tagged `boundary=public`, **never** merged into
internal Samsung/SAIT claims); conflation guard (a claim may not fuse a public `Source` and a `confidential` projection
as one evidence item — force separate evidence rows); URL/PII sanity (reject internal-host URLs, strip tracking params);
`classification=unknown` → stored unverified (T0), not auto-linked.

### 4. EXPORT — cited `Claim`+`Evidence` bundles to CAW-03 (fail-closed)
CAW-02 **emits** a signed, self-contained bundle file on explicit curator action; CAW-03 pulls it. CAW-02 never writes
into CAW-03. Every exported `Claim` ships with ≥1 concrete `Evidence`; a claim with no evidence (or only
`generated-summary` evidence) is **refused**. Citations are resolved into a `bibliography` so CAW-03 needs nothing else
from CAW-02. `model-projection` evidence keeps its CI/unit so a projection cannot be presented as a measurement. Exported
Notes are tagged `kind=synthesis, evidence=false` so CAW-03 cannot mistake synthesis for evidence.

**Confidentiality checks (fail-closed allow-list, using [ADR-0004](./ADR-0004-provenance-and-trust.md) propagation):**
audience gate (`target_audience=public` drops every entity whose **effective** `boundary != public` — computed via
monotone propagation, not just the row's own flag); **`jimmy-private` items are never exported** regardless of audience;
artifact disclosure (`artifact_ref` blob only when `target_audience=internal`); redaction sweep over text/locator/citation
strings; conflation guard; sign + `provenance_digest`. **If any check is indeterminate the item is excluded; an empty
bundle, or an explicitly-requested confidential/jimmy-private item in a public bundle, aborts the whole export** with a
report listing offending ids — never a partial silent leak.

### 5. Defaults that prevent leaks
**Default-deny on sensitivity, default-private on scope** (from [ADR-0004](./ADR-0004-provenance-and-trust.md)). Imports
may downgrade *trust* but never silently upgrade *boundary*. Exports **fail closed**.

### 6. Skill-wrap parity
Each importer/exporter is a **vetted skill-interface action** (`kr.import_projection`, signal intake, `kr.export_bundle`)
so agents use the exact same confidentiality checks as humans — there is no raw path that bypasses enforcement.

## Consequences
- **Easy:** each product evolves and fails independently; re-imports dedup by `payload_sha256`; the boundary is auditable
  and replayable; over-sharing requires deliberate effort and is caught at the crossing.
- **Hard:** CAW-02 maintains thin adapters / its own boundary schemas and a redaction ruleset; re-redaction duplicates
  some producer work (accepted as defense in depth); a canonical redaction ruleset must be kept current without becoming
  a shared dependency.
- **Follow-on:** RB import-CAW01 (envelope validate, vault copy, re-redact, `Evidence`/`SimulationRun` catalog,
  kind-based trust); RB import-CAW05 (JSONL reader, Source dedup, classification→`RelatedWork`/`Claim`/`OpenQuestion`,
  `raw_summary` excluded); RB export-CAW03 (claim/evidence resolution, fail-closed audience allow-list, redaction sweep,
  bibliography, digest + signature, empty-bundle refusal); RB boundary-validation lib (envelope validator, semver gate,
  redaction ruleset, per-crossing audit log entry).

## Open questions / revisit triggers
- `TODO(open-question: signature scheme for export bundles — minisign/cosign/DSSE vs detached sig?)`
- `TODO(open-question: do CAW-01/05 emit our envelope natively, or does CAW-02 ship thin wrapping adapters?)`
- `TODO(open-question: pull-API auth between independent products — static token, mTLS, or signed-URL drop?)`
- `TODO(open-question: where the codename/fab/customer redaction regexes live, kept in sync without a shared dependency)`
- `TODO(open-question: dedup authority for CAW-05 Sources — DOI vs arXiv vs S2 id precedence?)`
- `TODO(open-question: honoring producer_run_id traceability without a live handle — is an opaque breadcrumb enough?)`
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks
- **RB (import-CAW01):** projection importer with envelope validation, content-addressed vault copy, re-redaction,
  `Evidence` cataloging, kind-based trust.
- **RB (import-CAW05):** signal intake — Source dedup, classification→typed links, `raw_summary` excluded from evidence,
  threat→OpenQuestion escalation.
- **RB (export-CAW03):** fail-closed bundle exporter — effective-boundary propagation, redaction sweep, bibliography,
  digest + signature, empty-bundle refusal.
- **RB (boundary-validation lib):** in-product envelope validator, semver gate, redaction ruleset, per-crossing audit log.
- All importers/exporters are vetted skill-interface actions — no raw path bypasses confidentiality enforcement.
