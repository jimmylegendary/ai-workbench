# Radar Core — Export Boundaries

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - **Source of truth:** [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md) (§1 independence, §8 exports, §11 proposals, §12 generated≠evidence)
  - Conventions: [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS.md) (§4 cross-product = import/export boundaries)
  - ADR-0007 export boundaries — [../01-decisions/ADR-0007-export-boundaries.md](../01-decisions/ADR-0007-export-boundaries.md) (authoritative envelope + relation projection)
  - ADR-0005 related-work ledger — [../01-decisions/ADR-0005-related-work-ledger.md](../01-decisions/ADR-0005-related-work-ledger.md) (the single producer; `LedgerLink`, `foreign_ref`)
  - ADR-0006 storage & scheduling — [../01-decisions/ADR-0006-storage-and-scheduling.md](../01-decisions/ADR-0006-storage-and-scheduling.md) (idempotency key, file-drop)
  - ADR-0004 classification & triage — [../01-decisions/ADR-0004-classification-and-triage.md](../01-decisions/ADR-0004-classification-and-triage.md) (relation → target; review gate)
  - Siblings: [./synthesis-and-formats.md](./synthesis-and-formats.md) (paper-card/action-brief → bundles), [./ports-and-adapters.md](./ports-and-adapters.md)
  - Consumers (separate products): **CAW-02** (Source/Claim/RelatedWork), **CAW-03** (novelty), **CAW-01 / CAW-06** (open questions)

## Purpose
This doc fixes the **core-level** export contract: the `ExportAdapter` as the **only** seam by which a triaged
finding crosses to another product, the bundle each v1 consumer receives, and the fail-closed rules that keep
exports safe. It is the core spec; the option tables and the full per-signal payload schema are authoritative in
ADR-0007 and **cross-linked, not duplicated** here. It does NOT decide the synthesis manifest (see
[./synthesis-and-formats.md](./synthesis-and-formats.md) §4), the ledger schema (ADR-0005), or the registry
mechanics ([./ports-and-adapters.md](./ports-and-adapters.md)).

**Independence (brief §1, §8):** CAW-02/03/01/06 are **separate products with no shared store**. CAW-05 writes
**file artifacts across explicit boundaries**; consumers **pull**. CAW-05 never writes into a sibling's database.

## 1. The export seam
Export is the `export` stage of the `Run` (`collect → dedup → classify → synthesize → export`). The pipeline
depends only on the `ExportAdapter` port, never on a concrete consumer.

```python
class ExportAdapter(Protocol):
    capabilities: AdapterCapabilities   # target, accepts=[SOURCE_CLAIM|NOVELTY_SIGNAL|OPEN_QUESTION], bundle_format
    def can_accept(self, signal: RoutedSignal) -> Acceptance: ...  # type/boundary/format preflight (no I/O)
    def export(self, signal: RoutedSignal, ctx: ExportContext) -> ExportReceipt: ...  # write a boundary bundle (idempotent)
# v1 adapters: Caw02SourceClaimExportAdapter, Caw03NoveltySignalExportAdapter,
#              Caw01OpenQuestionExportAdapter, Caw06OpenQuestionExportAdapter
# stub adapters: other downstream targets (registered, maturity="stub")
```

**One producer, many consumers.** The append-only ledger (ADR-0005) is the *only* thing that emits; an export is a
**projection of confirmed `LedgerLink`s**, not a second source of truth. Adapters cannot bypass triage/routing:
they consume a `RoutedSignal` that the classify stage already produced and the review gate already cleared
(ADR-0004 §5) — there is no path from a raw finding straight to a bundle.

## 2. What goes to whom (relation → consumer projection)
Routing is a **deterministic projection** of the ledger `relation` onto each consumer's vocabulary (ADR-0007 §3).
`related_to` carries the `WatchedTarget`'s `foreign_ref` (`caw03-claim:…` / `caw02-concept:…`) so each consumer
sees ids in *its own* namespace — **CAW-05 does the projection; consumers never re-map our ids** (ADR-0005).

| Ledger `relation` | → CAW-03 (novelty) | → CAW-02 (knowledge) | → CAW-01 / CAW-06 | Routed targets |
|---|---|---|---|---|
| `novelty-threat` | `threat` → NoveltyVerdict input | `threat` RelatedWork link | open-question (action brief) | **all** |
| `support` | `support` (corroboration) | `support` RelatedWork link | — | CAW-03 + CAW-02 |
| `adjacent` | `neutral` | `neutral` RelatedWork (context) | — | CAW-02 primarily |
| *(unverified link)* | `unknown` (**never to the gate**) | `unknown` (curator review) | — | flagged, not gated |
| `noise` | — | — | — | **never exported** |

Synthesis surfaces map to bundles ([./synthesis-and-formats.md](./synthesis-and-formats.md)): the **paper-card**
feeds CAW-02 + CAW-03; the **action-brief** feeds CAW-01 / CAW-06. Both carry the synthesis manifest with
`evidence:false`.

## 3. The bundle — one envelope for all consumers
Reuse a single `boundary_kind=caw05-signal` envelope (the contract CAW-02 already models; the same bundle URI
CAW-03's `import_radar(bundle_uri)` pulls). One schema, one redaction path, one signature path. Full per-signal
payload is in ADR-0007 §2; the envelope shape:

```yaml
caw05_signal_bundle:                 # outer envelope (one file per Run-export)
  contract_version: "1.0.0"          # semver; consumers reject an unknown MAJOR
  source_product: caw-05
  produced_at: <RFC3339>
  producer_run_id: ULID
  declared_boundary: public          # public-only (brief §8)
  declared_audience: <consumer>
  payload_sha256: <hex>              # content address — consumers dedup weekly re-imports
  redaction_applied: [<rule>, ...]
  signature: <scheme>                # TODO(open-question: family-wide scheme — minisign/cosign/DSSE)
  payload:
    signals:                         # one per exported LedgerLink
      - source: {title, authors, venue, year, doi, url, external_ids}
        classification: threat|support|neutral|unknown
        relevance: {score, rationale}         # additive/explainable (ADR-0002)
        related_to: [<foreign_ref>, ...]      # consumer-namespace ids
        extracted_claims: [{text, evidence_locator}]   # backed by source, NOT prose
        verification: {status, match_ratio, canonical_key}   # ADR-0005 S2 verification
        raw_summary: {kind: generated-summary, text: ...}    # excluded from every evidence field
        idempotency_key: <hash(finding_id + target + classification_version)>
```

`raw_summary` is always tagged `kind=generated-summary` and is excluded from every evidence field; the backing is
always `source` + `evidence_locator`. Consumers re-enforce this on import (defense-in-depth).

## 4. Export rules (fail-closed)
| # | Rule | Why |
|---|---|---|
| 1 | **Confirmed-only by default** — findings are proposals; Jimmy confirms (brief §11). A `propose-only` profile may emit `proposed` links flagged `auto` to a low-stakes digest **— never to CAW-03's gate.** | the novelty gate never runs on unreviewed auto-links |
| 2 | **`raw_summary` excluded from every evidence field** (`kind=generated-summary`) | generated ≠ evidence (brief §5, §12) |
| 3 | **`boundary=public` only**; redaction sweep before emit; a non-public item **aborts the bundle** | no confidential leak (brief §8, §12) |
| 4 | **Content-addressed + idempotent** — `payload_sha256` + `canonical_key` + per-bundle `idempotency_key` (ADR-0006) | retries never double-route a novelty-threat |
| 5 | **Empty bundle refused** — nothing to export → error + report, never a silent empty file | observability; recall mission |
| 6 | **Export is a vetted skill action** — agents and humans hit the same redaction/confidentiality checks; no raw bypass | MCP `export` of a `novelty-threat` is proposal-only (ADR-0001 §4) |

### Negative tests (must hold — mirror ADR-0007 N1–N6)
- **N1** a generated summary in an evidence field → refused.
- **N2** a non-public link in a public bundle → bundle aborts.
- **N3** an unreviewed (`proposed`) link to CAW-03's gate → refused.
- **N4** a retry of the same bundle → no-op (no double-route).
- **N5** a `noise`-classified finding in any bundle → must not happen.
- **N6** an empty bundle → error, never a silent empty file.

These re-check what the synthesis citation gate ([./synthesis-and-formats.md](./synthesis-and-formats.md) §5)
already enforced upstream — the gate is the first line, the export adapter is defense-in-depth.

## 5. Transport — file drop, consumer pulls
Bundles are written as `*.caw05.jsonl` (one signal per line) to a boundary location; the **same** bundle URI is
what every consumer pulls. There is no push into a sibling store and no shared registry (brief §1, §8).
Idempotency (rule 4) makes a re-pull of a weekly re-run safe to dedup by `payload_sha256`.

## 6. The seam test
A new downstream consumer is **one adapter file + one config flag** — no new contract, no core edit. If a
consumer needs a field the `caw05-signal` envelope lacks, bump `contract_version` (minor if additive) and reopen
ADR-0007 — never ship a bespoke per-consumer schema. Stub targets beyond CAW-01/02/03/06 ship as documented stubs
([./ports-and-adapters.md](./ports-and-adapters.md) §stubs).

## 7. Open Questions
Tracked in [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md):
- TODO(open-question: key `related_to` to CAW-03 claim ids directly, or only to CAW-02 concept/claim ids CAW-03
  re-maps? Resolve jointly with CAW-03 + ADR-0005.)
- TODO(open-question: export `ambiguous`/`unverified` links at all? Lean: to CAW-02 for curator review, never to
  CAW-03's gate.)
- TODO(open-question: do `task`/`experiment` routes (ADR-0004) export anywhere in v1, or stay in the digest until
  CAW-01/CAW-06 contracts firm up?)
- TODO(open-question: signature scheme for the envelope — align family-wide with CAW-02's choice so one verifier
  works across products.)
- TODO(open-question: staleness handshake for `foreign_ref` when a consumer renames/merges a claim/concept.)

## 8. Implications for runbooks
- **RB (export adapter — CAW-02 + CAW-03):** project confirmed `LedgerLink`s into the `caw05-signal` envelope;
  map `relation → classification`; put `foreign_ref` in `related_to`; exclude `raw_summary` from evidence; fail
  closed on non-public/empty; content-address with `payload_sha256` + `canonical_key`; idempotency key (ADR-0006).
- **RB (export adapter — CAW-01/CAW-06):** open-question bundles from action briefs.
- **RB (negative tests):** N1–N6 above as executable tests.
- **RB (ports):** `ExportAdapter` registry with v1 adapters + the documented CAW-stub pattern; core depends only
  on the port ([./ports-and-adapters.md](./ports-and-adapters.md)).
