# Import/Export Boundaries

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md), [../01-decisions/](../01-decisions/) (ADR: import/export contracts — TODO), [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This doc decides the **concrete file/API contracts** by which CAW-02 (independent Knowledge Repository) exchanges
data with three other independent products: it **imports** simulation projections/evidence from **CAW-01** (a
separate product), **imports** radar/related-work signals from **CAW-05** (a separate product), and **exports**
cited claim+evidence bundles to **CAW-03** (a separate product). It proposes the boundary schemas and the
**confidentiality checks** applied on each crossing. It does NOT define CAW-02's internal storage (see storage
ADR — TODO), the full data model (see data-model ADR — TODO), or the internals of CAW-01/03/05.

## Non-negotiable boundary principles
1. **No shared substrate.** Every exchange is a versioned **file artifact** (preferred) or a **pull API** call.
   There is no shared DB, registry, queue, or runtime. CAW-02 never reaches into another product's store and vice
   versa. This keeps each product independently deployable and independently failure-isolated.
2. **Boundary is a copy, not a reference into a live system.** Imported artifacts are catalogued as `Evidence`
   pointing to a **content-addressed copy or stable URI** that CAW-02 controls; we never depend on a foreign
   system being up to reconstruct provenance.
3. **Confidentiality is enforced at the crossing, in both directions.** Every record carries `boundary`
   (`public | internal | confidential`) and an `audience` (`team | jimmy-private`). Imports may *downgrade* trust
   but never silently *upgrade* boundary. Exports apply an allow-list filter and **fail closed**.
4. **Generated text is never imported as evidence.** Summaries/projections are catalogued with `kind` that marks
   whether the artifact is a raw measurement, a model projection, or a generated summary — preserving the brief's
   invariant that summaries are not evidence.
5. **Contracts are versioned.** Each envelope carries `contract_version` (semver). CAW-02 rejects unknown major
   versions rather than guessing.

## Common envelope
All three boundaries share an outer envelope so the same validator, signature check, and audit log apply
everywhere. Modeled on attestation-style envelopes (subject + predicate + provenance), in the spirit of in-toto /
W3C PROV bundles but deliberately minimal and self-contained.

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
  "redaction_applied": ["field paths or rule ids stripped before emit"],
  "payload": { "...boundary-specific..." }
}
```

- `producer_run_id` is **opaque**: it lets a human trace back inside the origin product but is not a live handle.
- `payload_sha256` makes the artifact content-addressable so CAW-02 stores one copy and dedupes re-imports.
- `redaction_applied` is the producer's declaration of what it already stripped; CAW-02 still re-checks (defense
  in depth — never trust the producer's redaction alone).

---

## Boundary A — IMPORT: CAW-01 simulation projections/evidence

**Direction:** CAW-01 (separate product) → CAW-02. **Transport:** file drop (`*.caw01.json` + optional large
artifact by path/URI) or authenticated pull from a CAW-01 export endpoint. **Maps to:** `Evidence` (+ referenced
`SimulationRun` / `Experiment` catalog entries), attachable to an existing or new `Claim`.

### Payload schema
```json
{
  "projection": {
    "artifact_id": "caw01:<opaque>",
    "kind": "raw-measurement | model-projection | generated-summary",
    "title": "string",
    "metric": "string",            // e.g. "throughput@p95"
    "value": { "point": 0.0, "ci_low": 0.0, "ci_high": 0.0, "unit": "string" },
    "method_ref": "caw01:<sim-config-id, opaque>",
    "artifact_uri": "file:///… | s3://… | caw02-vault://<sha>",
    "artifact_sha256": "…",
    "boundary": "public | internal | confidential",
    "confidential_fields": ["fab params", "customer ids"],  // declared sensitive
    "public_safe_view": { "metric": "…", "value": {…} }      // optional pre-redacted projection
  }
}
```

### Import rules
- A projection becomes **`Evidence`**, never a `Claim`. The importer/curator writes the `Claim` text; the
  projection is what the claim *points at* (preserves claim→evidence invariant).
- `kind: generated-summary` is catalogued with `trust=low` and flagged "not evidence-grade"; it cannot be the sole
  evidence for a `Claim` (UI/skill warns).
- Large artifacts are **copied into CAW-02's vault** (content-addressed) or referenced by stable URI; we store the
  hash so a later fetch can be integrity-checked.

### Confidentiality checks (the "without leaking confidential data" requirement)
| Check | Rule | On failure |
|---|---|---|
| Boundary floor | imported item inherits `boundary >= declared_boundary`; never downgraded on import | clamp to stricter |
| Confidential field scrub | if `confidential_fields` non-empty and no `public_safe_view`, store **only** at `confidential` boundary | quarantine, require curator |
| Re-redaction | CAW-02 re-runs its own redaction ruleset over payload regardless of `redaction_applied` | strip + log delta |
| Free-text leak scan | scan `title`/`metric` strings for internal markers (project codenames, fab/customer regex) | flag for review |
| Audience | `jimmy-private` projections never auto-shared to team views | route to private partition |

---

## Boundary B — IMPORT: CAW-05 radar / related-work signals

**Direction:** CAW-05 (separate product) → CAW-02. **Transport:** file drop (`*.caw05.jsonl`, one signal per line)
or pull. **Maps to:** `Source` (the cited paper/post), and depending on classification → `RelatedWork`,
`Claim`, and/or `OpenQuestion`. Never a loose summary.

### Payload schema (per signal)
```json
{
  "signal": {
    "signal_id": "caw05:<opaque>",
    "signal_type": "paper | preprint | patent | blog | release",
    "source": {
      "title": "string", "authors": ["…"], "venue": "string",
      "year": 2026, "doi": "string|null", "url": "https://…",
      "external_ids": { "arxiv": "…", "s2": "…" }   // for dedup against existing Sources
    },
    "classification": "threat | support | neutral | unknown",
    "relevance": { "score": 0.0, "rationale": "string" },
    "related_to": ["caw02-concept:<id>", "caw02-claim:<id>"],  // optional hints
    "extracted_claims": [
      { "text": "what the source asserts", "evidence_locator": "p.4 §3.2 / fig 2" }
    ],
    "raw_summary": "generated abstract — NOT evidence"
  }
}
```

### Import rules
- The external work becomes a **`Source`**; dedupe by `external_ids`/`doi` (Levenshtein title fallback) so radar
  re-runs don't create duplicate Sources.
- `classification: threat|support` is attached as a typed **`RelatedWork`** link to the targeted `Claim`/`Concept`
  (not free text), so "what threatens claim X" is queryable.
- Each `extracted_claims[*]` becomes a candidate **`Claim`** whose `Evidence` is the `Source` + `evidence_locator`
  (a concrete pointer into the artifact, never the `raw_summary`).
- If a signal raises an unresolved tension, the curator/skill records an **`OpenQuestion`** linked to the Source.
- `raw_summary` is stored on the `Source` as context with `kind=generated-summary`, **excluded** from evidence.

### Confidentiality checks
| Check | Rule | On failure |
|---|---|---|
| Provenance separation | external/public sources tagged `boundary=public`; **must not** be merged into internal Samsung/SAIT claims (brief guardrail) | block cross-tag link |
| Conflation guard | a `Claim` cannot cite both a public `Source` and a `confidential` projection as a single fused evidence item | force separate evidence rows |
| URL/PII sanity | reject signals whose `url` resolves to an internal host; strip tracking params | drop field, log |
| Classification trust | `classification=unknown` → `RelatedWork` stored unverified, not auto-linked to claims | curator review |

---

## Boundary C — EXPORT: cited claim+evidence bundles to CAW-03

**Direction:** CAW-02 → CAW-03 (separate product, paper/patent drafting). **Transport:** CAW-02 *emits* a signed
bundle file (`*.caw03-bundle.json`) on explicit curator action; CAW-03 pulls/ingests it. CAW-02 never writes into
CAW-03. **Maps from:** a selected set of `Claim`s with their `Evidence` chains, resolved to a self-contained,
**public-safe** package.

### Bundle schema
```json
{
  "bundle": {
    "bundle_id": "caw02:<uuid>",
    "purpose": "paper | patent | internal-memo",
    "target_audience": "public | internal",          // gates the redaction profile
    "claims": [
      {
        "claim_id": "caw02:<id>",
        "text": "the assertion (resolved, no internal codenames if public)",
        "trust": "high | medium | low",
        "boundary": "public | internal",
        "evidence": [
          {
            "evidence_id": "caw02:<id>",
            "kind": "raw-measurement | model-projection | external-source",
            "locator": "p.4 §3.2 / metric throughput@p95",
            "citation": { "title": "…", "authors": ["…"], "year": 2026, "doi": "…", "url": "…" },
            "artifact_ref": "caw02-vault://<sha>|null",   // included only if audience permits
            "value": { "point": 0.0, "ci_low": 0.0, "ci_high": 0.0, "unit": "…" }
          }
        ]
      }
    ],
    "bibliography": [ /* deduped citation list for CAW-03 to emit BibTeX */ ],
    "provenance_digest": "sha256 over claims+evidence (tamper-evident)"
  }
}
```

### Export rules
- **Invariant carried across:** every exported `Claim` ships with ≥1 concrete `Evidence`; a claim with no
  evidence (or only `generated-summary` evidence) is **refused** for export.
- Citations are resolved into a `bibliography` so CAW-03 can build references without calling back into CAW-02.
- `model-projection` evidence keeps its CI/unit so CAW-03 cannot silently present a projection as a measurement.
- The bundle is **self-contained**: CAW-03 needs nothing else from CAW-02 to draft + cite.

### Confidentiality checks (fail-closed allow-list)
| Check | Rule | On failure |
|---|---|---|
| Audience gate | `target_audience=public` → drop every `Claim`/`Evidence` whose `boundary != public` | exclude + report dropped ids |
| Private partition | `jimmy-private` items are **never** exported regardless of audience | hard refuse bundle if selected |
| Artifact disclosure | `artifact_ref` (raw projection blob) included only when `target_audience=internal` | strip ref, keep value |
| Redaction sweep | run public-safe redaction over all `text`/`locator`/`citation` strings (codenames, fab/customer regex) | abort export on any hit |
| Conflation guard | no exported claim may fuse public-source + confidential evidence | abort export |
| Sign + digest | compute `provenance_digest`, sign envelope; empty bundle (all dropped) is refused | error, nothing emitted |

**Fail-closed default:** if any check is indeterminate, the item is excluded; if the resulting bundle is empty or
a `jimmy-private`/`confidential` item was explicitly requested for a public bundle, the **whole export aborts**
with a report — never a partial silent leak.

---

## Cross-cutting design choices

| Decision | Choice | Rationale | Alternative (rejected) |
|---|---|---|---|
| Transport | **File artifact first**, optional pull API | Diffable, replayable, no live coupling; matches md-first store | Shared DB/queue (violates independence) |
| Format | **JSON envelope + JSONL for signals** | Ubiquitous, schema-validatable, human-inspectable | XML/PROV-XML (heavier, less ergonomic) |
| Integrity | **sha256 content-addressing + signed export** | Dedup re-imports; tamper-evident exports | Trust producer metadata (unsafe) |
| Redaction trust | **Re-redact on import & export** | Defense in depth; never trust foreign redaction | Trust `redaction_applied` (single point of failure) |
| Versioning | **semver `contract_version`, reject unknown major** | Independent products evolve separately | Implicit/unversioned (silent breakage) |
| Schema home | **CAW-02 owns + validates its boundary schemas** | We control what we ingest/emit | Shared schema registry (shared substrate) |

## Open Questions
- TODO(open-question: signature scheme for export bundles — minisign/cosign/DSSE envelope vs simple detached sig?)
- TODO(open-question: do CAW-01/05 emit our envelope natively, or does CAW-02 ship thin adapters that wrap their
  native exports? Adapters keep us decoupled but add a maintained translation layer.)
- TODO(open-question: pull-API auth model between independent products — static token, mTLS, or signed-URL drop?)
- TODO(open-question: canonical redaction ruleset — where do the codename/fab/customer regexes live, and how are
  they kept in sync without becoming a shared dependency?)
- TODO(open-question: dedup authority for Sources imported from CAW-05 — DOI vs arXiv vs S2 id precedence?)
- TODO(open-question: how is `producer_run_id` traceability honored without a live handle into the origin product
  — is an opaque human-readable breadcrumb enough for audit?)
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks
- **RB (import-CAW01):** build the projection importer — envelope validation, content-addressed vault copy,
  re-redaction pass, `Evidence`/`SimulationRun` cataloguing, `kind`-based trust assignment.
- **RB (import-CAW05):** build the signal intake — JSONL reader, Source dedup, classification→`RelatedWork`/
  `Claim`/`OpenQuestion` mapping, `raw_summary` excluded from evidence.
- **RB (export-CAW03):** build the bundle exporter — claim/evidence resolution, fail-closed audience allow-list,
  redaction sweep, bibliography assembly, digest + signature, empty-bundle refusal.
- **RB (boundary-validation lib):** shared (in-product) envelope validator, semver gate, redaction ruleset, and an
  **audit log** entry per crossing (in/out, ids, dropped items, redaction deltas).
- Each importer/exporter must be a **vetted skill-interface action** so agents use the same checks as humans
  (no raw path that bypasses confidentiality enforcement).
