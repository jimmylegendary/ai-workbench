# Import / Export Flows — boundaries between independent products

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md) (source of truth)
  - [../01-decisions/ADR-0007-import-export-contracts.md](../01-decisions/ADR-0007-import-export-contracts.md)
  - [../01-decisions/ADR-0004-provenance-and-trust.md](../01-decisions/ADR-0004-provenance-and-trust.md)
  - [../01-decisions/ADR-0002-storage.md](../01-decisions/ADR-0002-storage.md)
  - [../01-decisions/ADR-0003-knowledge-data-model.md](../01-decisions/ADR-0003-knowledge-data-model.md)
  - [../02-research/import-export-boundaries.md](../02-research/import-export-boundaries.md)
  - [./skill-wrap-interface.md](./skill-wrap-interface.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This doc gives the **concrete, runnable flows** for moving knowledge across the boundaries between CAW-02 and three
other **independent products**: importing CAW-01 simulation projections, importing CAW-05 radar/related-work
signals, and exporting cited Claim+Evidence bundles to CAW-03. It shows the step-by-step pipelines
(quarantine → confidentiality check → map to nodes for imports; select → re-redact → sign → versioned envelope for
export) and how each step preserves the Claim→Evidence invariant and the boundary model. It does NOT re-decide the
contract format or the option tradeoffs — those are fixed by
[ADR-0007](../01-decisions/ADR-0007-import-export-contracts.md). Both flows run **only** as vetted skill-wrap
actions ([skill-wrap-interface.md](./skill-wrap-interface.md)); there is no raw path that bypasses the checks, and
**no shared store, registry, queue, or runtime** with any other product.

## 1. Boundary principles (carried from ADR-0007)
1. **No shared substrate.** Every crossing is a versioned **file artifact** (preferred) or a pull-API call.
2. **Copy, not live reference.** Imported artifacts become `Evidence` pointing at a content-addressed copy / stable
   URI **CAW-02 controls** — reconstruction never depends on a foreign system being up.
3. **Confidentiality enforced at the crossing, both directions.** Imports may downgrade *trust* but never silently
   upgrade *boundary*; exports apply a fail-closed allow-list.
4. **Generated text is never imported as evidence** and never exported as evidence (`kind=generated-summary` is
   flagged, not evidence-grade).
5. **Re-redact at every crossing**, regardless of the producer's `redaction_applied` claim (defense in depth).
6. **Versioned contracts.** `contract_version` is semver; an unknown MAJOR is **rejected**, never guessed.

## 2. The shared envelope
All three crossings share one outer envelope so one validator, one signature check, and one per-crossing audit
entry apply everywhere (full field notes in [ADR-0007](../01-decisions/ADR-0007-import-export-contracts.md) §1):

```json
{
  "contract_version": "1.0.0",
  "boundary_kind": "caw01-projection | caw05-signal | caw03-bundle",
  "source_product": "CAW-01",
  "produced_at": "<RFC3339>",
  "producer_run_id": "<opaque id in the SOURCE product>",
  "declared_boundary": "public | internal | confidential",
  "declared_audience": "team | jimmy-private",
  "payload_sha256": "<hash of canonicalized payload>",
  "redaction_applied": ["rule ids the producer claims it stripped"],
  "payload": { "...boundary-specific..." }
}
```

## 3. IMPORT A — CAW-01 simulation projections → `Evidence`
**Direction:** CAW-01 (separate product) → CAW-02. **Transport:** `*.caw01.json` file drop (+ optional large
artifact by path/URI) or authenticated pull. **Skill-wrap op:** `kr.import_projection` (idempotent on
`(source_product, export_id)`). **Maps to:** `Evidence` (+ catalog `SimulationRun`/`Experiment` refs), attachable
to an existing or new `Claim`.

### Flow
```
[1] receive envelope ─▶ [2] semver gate (reject unknown MAJOR)
        │
        ▼
[3] QUARANTINE: stage in an isolated partition; nothing is queryable yet
        │
        ▼
[4] verify payload_sha256; copy large artifact into the content-addressed vault (caw02-vault://<sha>)
        │
        ▼
[5] CONFIDENTIALITY CHECKS (table below) ── any fail ─▶ keep quarantined, raise to curator
        │ pass
        ▼
[6] MAP TO NODES: create Evidence(kind, value, locator, boundary) + SimulationRun/Experiment refs
        │                 (curator/skill writes the Claim text; projection is what it POINTS AT)
        ▼
[7] commit via core txn ─▶ markdown file(s) + hash-chained event + per-crossing audit entry
```

A projection becomes **`Evidence`, never a `Claim`** — this preserves the Claim→Evidence invariant
([ADR-0003](../01-decisions/ADR-0003-knowledge-data-model.md)): the human/skill authors the claim, the projection
is the artifact it cites. `kind=generated-summary` is cataloged at low trust, flagged "not evidence-grade", and
**cannot be the sole evidence** for a claim. `model-projection` evidence keeps its CI/unit so it can never later be
presented as a measurement.

### Confidentiality checks (the "without leaking confidential data" requirement)
| Check | Rule | On failure |
|---|---|---|
| Boundary floor | imported `boundary >= declared_boundary`; never downgraded — clamp stricter | clamp |
| Confidential-field scrub | if `confidential_fields` set and no `public_safe_view`, store **only** at `confidential` | quarantine, curator |
| Re-redaction | re-run CAW-02's own ruleset regardless of `redaction_applied` | strip + log delta |
| Free-text leak scan | scan `title`/`metric` for codename/fab/customer markers | flag for review |
| Audience | `jimmy-private` projections never auto-shared to team views | route to private partition |

## 4. IMPORT B — CAW-05 radar/related-work signals → typed nodes
**Direction:** CAW-05 (separate product) → CAW-02. **Transport:** `*.caw05.jsonl` (one signal per line) or pull.
**Skill-wrap op:** signal intake → `kr.classify_signal` / `kr.extract_claims` / `kr.record_decision`. **Maps to:**
`Source`, plus `RelatedWork` / `Claim` / `OpenQuestion` per classification — **never a loose summary**.

### Flow
```
[1] read JSONL line ─▶ [2] envelope semver gate
        │
        ▼
[3] QUARANTINE the signal (unverified, not yet linked)
        │
        ▼
[4] DEDUP: match existing Source by external_ids/doi (Levenshtein-title fallback)
        │
        ▼
[5] CONFIDENTIALITY CHECKS (table below) ── fail ─▶ curator review
        │ pass
        ▼
[6] MAP TO NODES:
      • Source (boundary=public for external work)
      • classification threat|support  ─▶ typed RelatedWork link to targeted Claim/Concept
      • each extracted_claims[*]        ─▶ candidate Claim, Evidence = Source + evidence_locator
      • raw_summary                     ─▶ stored on Source as kind=generated-summary (EXCLUDED from evidence)
      • tension / threat-on-accepted    ─▶ OpenQuestion (auto-raised; reviewer notified)
        │
        ▼
[7] commit via core txn ─▶ markdown + hash-chained event + per-crossing audit
```

The candidate `Claim`'s `Evidence` is always the `Source` + a concrete `evidence_locator` (e.g. `p.4 §3.2 / fig 2`),
**never** the `raw_summary`. Agent-submitted candidates are reviewed by default (no silent auto-accept in v0,
[ADR-0005](../01-decisions/ADR-0005-ingestion-pipeline.md)); `classification=unknown` stays unverified (T0) and is
not auto-linked.

### Confidentiality checks
| Check | Rule | On failure |
|---|---|---|
| Provenance separation | public sources tagged `boundary=public`; **never** merged into internal Samsung/SAIT claims | block cross-tag link |
| Conflation guard | a Claim may not fuse a public `Source` and a `confidential` projection as one evidence item | force separate evidence rows |
| URL/PII sanity | reject signals whose `url` is an internal host; strip tracking params | drop field, log |
| Classification trust | `unknown` → stored unverified (T0), not auto-linked | curator review |

## 5. EXPORT — cited `Claim`+`Evidence` bundle → CAW-03 (fail-closed)
**Direction:** CAW-02 → CAW-03 (separate product, paper/patent drafting). **Transport:** CAW-02 **emits** a signed
`*.caw03-bundle.json`; CAW-03 pulls it. CAW-02 **never** writes into CAW-03. **Skill-wrap op:** `kr.export_bundle`
(read-only, but boundary-filtered and signed).

### Flow
```
[1] SELECT claims (explicit curator action) ─▶ resolve each Claim's Evidence chain
        │
        ▼
[2] INVARIANT GATE: every Claim must ship ≥1 concrete Evidence;
        a claim with no evidence OR only generated-summary evidence is REFUSED
        │
        ▼
[3] EFFECTIVE-BOUNDARY propagation (monotone, ADR-0004) per entity — not just the row's own flag
        │
        ▼
[4] AUDIENCE GATE (fail-closed allow-list, table below) ── indeterminate ─▶ EXCLUDE item
        │
        ▼
[5] RE-REDACT sweep over text/locator/citation strings (codename/fab/customer) ── any hit ─▶ ABORT
        │
        ▼
[6] resolve citations into a self-contained `bibliography`; tag Notes kind=synthesis, evidence=false
        │
        ▼
[7] compute provenance_digest ─▶ SIGN ─▶ wrap in the versioned envelope (boundary_kind=caw03-bundle)
        │
        ▼
[8] emit file + per-crossing audit entry (selected ids, dropped ids, redaction deltas)
```

### Confidentiality checks (fail-closed allow-list)
| Check | Rule | On failure |
|---|---|---|
| Audience gate | `target_audience=public` drops every entity whose **effective** `boundary != public` | exclude + report ids |
| Private partition | `jimmy-private` items are **never** exported, any audience | hard refuse bundle |
| Artifact disclosure | raw `artifact_ref` blob included only when `target_audience=internal` | strip ref, keep value |
| Redaction sweep | public-safe redaction over all strings | abort export on any hit |
| Conflation guard | no exported claim may fuse public-source + confidential evidence | abort export |
| Sign + digest | compute `provenance_digest`, sign; **empty bundle (all dropped) is refused** | error, nothing emitted |

**Fail-closed default:** if any check is indeterminate the item is excluded; if the resulting bundle is empty, or a
`jimmy-private`/`confidential` item was explicitly requested for a public bundle, the **whole export aborts** with a
report listing offending ids — never a partial silent leak.

### Bundle payload (excerpt)
```json
{
  "bundle_id": "caw02:<uuid>",
  "purpose": "paper | patent | internal-memo",
  "target_audience": "public | internal",
  "claims": [
    { "claim_id": "caw02:<id>", "text": "the assertion (no internal codenames if public)",
      "trust": "T0|T1|T2|T3", "boundary": "public | internal",
      "evidence": [
        { "evidence_id": "caw02:<id>", "kind": "raw-measurement | model-projection | external-source",
          "locator": "p.4 §3.2 / metric throughput@p95",
          "citation": { "title": "…", "authors": ["…"], "year": 0, "doi": "…", "url": "…" },
          "artifact_ref": "caw02-vault://<sha>|null",
          "value": { "point": 0.0, "ci_low": 0.0, "ci_high": 0.0, "unit": "…" } } ] }
  ],
  "bibliography": [ /* deduped citations for CAW-03 to emit BibTeX */ ],
  "provenance_digest": "sha256 over claims+evidence"
}
```

## 6. Direction & node-mapping summary

| Crossing | Counterparty | Transport | Skill-wrap op | Maps to | Default posture |
|---|---|---|---|---|---|
| Import A | CAW-01 (separate) | `*.caw01.json` + vault | `kr.import_projection` | Evidence (+SimulationRun/Experiment) | quarantine → re-redact |
| Import B | CAW-05 (separate) | `*.caw05.jsonl` | signal intake + `kr.classify_signal` | Source, RelatedWork, Claim, OpenQuestion | quarantine → review |
| Export | CAW-03 (separate) | emitted `*.caw03-bundle.json` | `kr.export_bundle` | signed bundle of Claim+Evidence | fail-closed |

## 7. Why this stays independent
Each crossing is a **file or pull-API call CAW-02 owns and validates**; CAW-02 maintains its own boundary schemas
(no shared registry), copies foreign artifacts into its own vault (no live reference), and re-redacts on both sides
(no trust in foreign redaction). Products evolve and fail independently; re-imports dedup by `payload_sha256`; every
crossing is auditable and replayable. Over-sharing requires deliberate action and is caught at the boundary.

## Open Questions
- `TODO(open-question: signature scheme for export bundles — minisign/cosign/DSSE vs detached sig?)`
- `TODO(open-question: do CAW-01/05 emit our envelope natively, or does CAW-02 ship thin wrapping adapters?)`
- `TODO(open-question: pull-API auth between independent products — static token, mTLS, or signed-URL drop?)`
- `TODO(open-question: where the codename/fab/customer redaction regexes live, kept in sync without a shared dependency.)`
- `TODO(open-question: dedup authority for CAW-05 Sources — DOI vs arXiv vs S2 id precedence?)`
- `TODO(open-question: honoring producer_run_id traceability without a live handle — is an opaque breadcrumb enough?)`
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks
- **RB (import-CAW01):** projection importer — envelope + semver validation, content-addressed vault copy,
  re-redaction, `Evidence`/`SimulationRun` cataloging, kind-based trust, quarantine partition.
- **RB (import-CAW05):** signal intake — JSONL reader, Source dedup, classification→`RelatedWork`/`Claim`/
  `OpenQuestion`, `raw_summary` excluded from evidence, threat→OpenQuestion escalation, review-by-default.
- **RB (export-CAW03):** fail-closed bundle exporter — effective-boundary propagation, redaction sweep,
  bibliography assembly, `provenance_digest` + signature, empty-bundle refusal.
- **RB (boundary-validation lib):** in-product envelope validator, semver gate, redaction ruleset, per-crossing
  audit log entry (in/out, ids, dropped items, redaction deltas).
- All importers/exporters are vetted skill-wrap actions — no raw path bypasses confidentiality enforcement
  ([skill-wrap-interface.md](./skill-wrap-interface.md)).
