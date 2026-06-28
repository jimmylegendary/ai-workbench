# ADR-0007: Export boundaries to CAW-02 / CAW-03 / CAW-01 / CAW-06

- Status: proposed
- Owner: Jimmy
- Last-reviewed: TODO(open-question: set on review)
- Related:
  - Source of truth: [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md) (§1, §5, §8, §9, §11, §12)
  - Conventions: [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS.md) (§4 cross-linking = import/export boundaries)
  - Research: [../02-research/related-work-ledger.md](../02-research/related-work-ledger.md) (export bundle shape), [../02-research/scheduling-and-ports.md](../02-research/scheduling-and-ports.md) (ExportAdapter port), [../02-research/synthesis-and-formats.md](../02-research/synthesis-and-formats.md) (paper-card / action-brief, `evidence:false`)
  - ADR-0004 classification & triage — [./ADR-0004-classification-and-triage.md](./ADR-0004-classification-and-triage.md) (relation → target; review gate)
  - ADR-0005 related-work ledger — [./ADR-0005-related-work-ledger.md](./ADR-0005-related-work-ledger.md) (the single producer; WatchedTarget → foreign_ref)
  - ADR-0006 storage & scheduling — [./ADR-0006-storage-and-scheduling.md](./ADR-0006-storage-and-scheduling.md) (export idempotency key; file-drop transport)
  - CAW-02 (a separate product) — imports our `caw05-signal` as Source/Claim/RelatedWork (Boundary B)
  - CAW-03 (a separate product) — `import_radar(bundle_uri)` pulls our novelty signals
  - CAW-01 / CAW-06 (separate products) — import open-question bundles

## Context

A triaged finding only becomes valuable when it crosses to the products that act on it: **novelty signals →
CAW-03**, **Source/Claim/RelatedWork → CAW-02**, **open questions → CAW-01 and CAW-06** (brief §8). All four are
**independent products with no shared store**: CAW-05 emits file artifacts across explicit boundaries; consumers
**pull**. The hard constraints: never write into a sibling's database; never let a generated summary cross as
evidence; never route an unreviewed proposal to the novelty gate; never leak a non-public item; let weekly
re-runs be deduped by the consumer.

Forces:
- **One producer, many consumers** — the ledger (ADR-0005) is the only thing that emits; exports are
  projections of confirmed links, not a second source of truth.
- **Decoupling** — consumers must not depend on CAW-05's internal ids; CAW-05 must not import a consumer's
  schema. The seam is a port + a versioned bundle, not a function call.
- **Fail-closed safety** — non-public, empty, or summary-as-evidence bundles must abort, with defense-in-depth
  (consumers re-redact / re-enforce on import).
- **Idempotent boundary** — retries (ADR-0006) must not double-route.
- **Ship seams, build v1** — v1 = CAW-01/02/03/06 adapters; other targets are documented stubs (brief §9).

## Options considered

### A. Bundle schema across consumers

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Reuse one `caw05-signal` envelope (the contract CAW-02 already models) for all consumers; map relation → each consumer's vocabulary inside the bundle** | one schema all consumers model; zero new coupling; one redaction/sign path | the envelope must carry the union of consumer needs | **chosen** |
| Per-consumer bespoke schema | tailored | N schemas to maintain/version; N× drift | rejected |

### B. Id projection

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **CAW-05 projects WatchedTarget → `foreign_ref` in `related_to` (consumer sees its own namespace)** | consumers stay decoupled from our ids | CAW-05 maintains the mapping | **chosen** |
| Ship our internal ids; consumers re-map | less work for us | couples every consumer to CAW-05 ids | rejected (violates independence) |

### C. Transport

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **File drop; consumer pulls (`*.caw05.jsonl`, content-addressed)** | no shared substrate; replayable/diffable; idempotent | consumers must poll/pull | **chosen** (brief §1, §8) |
| Push/live API into consumer store | immediate | writes into a sibling's store — violates independence | rejected |

### D. Default gate to CAW-03

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Confirmed-only to CAW-03's novelty gate** (proposals stay proposals) | the gate never runs on unreviewed auto-links | needs human-in-the-loop before export | **chosen** (brief §11) |
| Auto-export everything | zero latency | false-threat noise into the novelty gate | rejected |

## Decision

**1. The `ExportAdapter` port is the only export seam** (brief §9). The pipeline depends on the port, never on a
concrete consumer:
```python
class ExportAdapter(Protocol):
    capabilities: AdapterCapabilities   # target, accepts=[SOURCE_CLAIM|NOVELTY_SIGNAL|OPEN_QUESTION], bundle_format
    def can_accept(self, signal: RoutedSignal) -> Acceptance: ...   # type/boundary/format preflight
    def export(self, signal: RoutedSignal, ctx: ExportContext) -> ExportReceipt: ...  # write a boundary bundle (idempotent)
```
v1 adapters: `Caw02SourceClaimExportAdapter`, `Caw03NoveltySignalExportAdapter`,
`Caw01OpenQuestionExportAdapter`, `Caw06OpenQuestionExportAdapter`. Stubs: other downstream targets.

**2. One envelope for all consumers** — reuse `boundary_kind=caw05-signal` (the contract CAW-02 already
consumes; the same bundle URI CAW-03's `import_radar(bundle_uri)` pulls). Outer envelope carries
`contract_version` (semver; consumers reject unknown major), `source_product`, `produced_at`,
`producer_run_id`, `declared_boundary`, `declared_audience`, `payload_sha256`, `redaction_applied[]`, and a
`payload.signals[]` — one per exported LedgerLink (full shape in research §4). Per-signal payload carries
`source{title,authors,venue,year,doi,url,external_ids}`, `classification`, `relevance{score,rationale}`,
`related_to[]`, `extracted_claims[{text, evidence_locator}]`, `verification{status,match_ratio,canonical_key}`,
and `raw_summary` tagged `kind=generated-summary`.

**3. Relation → consumer classification is a deterministic projection:**

| Ledger `relation` | CAW-03 (novelty) | CAW-02 (knowledge) | CAW-01 / CAW-06 | Routed? |
|---|---|---|---|---|
| `novelty-threat` | `threat` → NoveltyVerdict input | `threat` RelatedWork link | open-question (action brief) | **all routed targets** |
| `support` | `support` (corroboration) | `support` RelatedWork link | — | CAW-03 + CAW-02 |
| `adjacent` | `neutral` | `neutral` RelatedWork (context) | — | CAW-02 primarily |
| *(unverified link)* | `unknown` (never to the gate) | `unknown` (curator review) | — | flagged, not gated |
| `noise` | — | — | — | **never exported** |

`related_to` carries the **WatchedTarget's `foreign_ref`** (`caw03-claim:…` / `caw02-concept:…`) so each
consumer sees ids in *its* namespace. **CAW-05 does the projection; consumers never re-map our ids** (ADR-0005).

**4. Export rules (fail-closed):**
- **Confirmed-only by default** (findings are proposals; Jimmy confirms — brief §11). A `propose-only` profile
  may emit `proposed` links flagged `auto` to a low-stakes digest **— never to CAW-03's gate.**
- **`raw_summary` is `kind=generated-summary`, excluded from every evidence field**; the backing is always
  `source` + `evidence_locator` (the ADR-0005 / synthesis invariant). Consumers re-enforce on import.
- **`boundary=public` only**; the redaction sweep runs before emit; a non-public item **aborts the bundle**
  (defense-in-depth; consumers also re-redact).
- **Content-addressed + idempotent** — `payload_sha256` lets consumers dedup re-imports of weekly runs;
  `canonical_key` lets CAW-02 dedup our Source against an existing one; the per-bundle `idempotency_key`
  (ADR-0006) makes a retry a no-op so a novelty-threat is never double-routed.
- **Empty bundle is refused** (nothing to export → error + report, never a silent empty file).

**5. Transport = file drop, consumer pulls.** `*.caw05.jsonl` (one signal per line) written to a boundary
location; the **same** bundle URI is what every consumer pulls. CAW-05 never writes into a sibling's store.

**6. Synthesis surfaces map to bundles** (from synthesis-and-formats): the **paper-card** feeds CAW-02
(Source/RelatedWork) + CAW-03 (novelty); the **action brief** feeds CAW-01/CAW-06 open questions. Both carry
the synthesis manifest with `evidence:false`; receiving products re-classify and never store the prose as
evidence. Export is shipped as a **vetted skill action** so agents and humans hit the same
redaction/confidentiality checks (no raw bypass).

## Consequences

**Easy:** one schema both CAW-02 and CAW-03 already model — adding CAW-01/CAW-06 is two more adapters, no new
contract; consumers dedup weekly re-imports via `payload_sha256`/`canonical_key`; retries are no-ops; the
novelty gate only ever sees confirmed, public, verified-or-flagged links; a new downstream consumer is one
adapter file + one config flag (the seam test).

**Hard / follow-on:** the single envelope must carry the union of consumer needs and evolve via semver without
breaking any consumer; `WatchedTarget → foreign_ref` mappings must stay fresh against CAW-02/CAW-03 renames
(shared open question with ADR-0005); a bundle signature scheme must be agreed family-wide so one verifier
works everywhere; whether `ambiguous`/`unverified` links export at all (lean: to CAW-02 for curator review,
never to CAW-03's gate).

**Negative tests (must hold):** (N1) a generated summary in an evidence field → refused; (N2) a non-public link
in a public bundle → bundle aborts; (N3) an unreviewed (`proposed`) link to CAW-03's gate → refused; (N4) a
retry of the same bundle → no-op (no double-route); (N5) a `noise`-classified finding in any bundle → must not
happen; (N6) an empty bundle → error, never a silent empty file.

**Implications for runbooks:** **RB (export adapter — CAW-02 + CAW-03)** projects confirmed links into the
`caw05-signal` envelope; maps `relation → classification`; puts foreign refs in `related_to`; excludes
`raw_summary` from evidence; fails closed on non-public/empty; content-addresses with `payload_sha256` +
`canonical_key`; idempotency key from ADR-0006. **RB (export adapter — CAW-01/CAW-06)** open-question bundles
from action briefs. **RB (ports)** `ExportAdapter` registry with v1 adapters + documented CAW-stub pattern;
core depends only on the port. **RB (negative tests)** N1–N6 above.

## Open questions / revisit triggers

- TODO(open-question: do we key `related_to` to CAW-03 claim ids directly, or only to CAW-02 concept/claim ids
  CAW-03 re-maps? resolve jointly with CAW-03 + ADR-0005.)
- TODO(open-question: do we export `ambiguous`/`unverified` links at all? lean: to CAW-02 for curator review,
  never to CAW-03's gate.)
- TODO(open-question: do `task` / `experiment` routes (ADR-0004) export anywhere in v1, or stay in the digest
  until CAW-01/CAW-06 contracts firm up?)
- TODO(open-question: signature scheme for the export envelope — align family-wide with CAW-02's choice
  (minisign/cosign/DSSE) so one verifier works across products.)
- TODO(open-question: staleness handshake for `foreign_ref` when a consumer renames/merges a claim/concept.)
- **Revisit trigger:** any consumer needing a field the `caw05-signal` envelope lacks → bump `contract_version`
  (minor if additive) and reopen this ADR before shipping a bespoke per-consumer schema.
- See `../08-research-plan/open-questions.md` (to be created).
