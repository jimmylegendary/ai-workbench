# Import Service (ContentSource + Core Re-check + Curator Queue)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(set on review)
- **Related:**
  - [./api-surface.md](./api-surface.md) (Import + ReCheckGate operation contract)
  - [./persistence.md](./persistence.md) (where re-checked, approved items land)
  - [./build-and-publish-service.md](./build-and-publish-service.md) (what runs after approval)
  - [../01-decisions/ADR-0004-import-and-ports.md](../01-decisions/ADR-0004-import-and-ports.md)
  - [../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md)
  - [../01-decisions/ADR-0002-content-model.md](../01-decisions/ADR-0002-content-model.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

This doc describes the **import service**: how `ContentSourceAdapter`s pull candidate content from sibling products
across explicit boundaries, how the **core public-safe re-check** pipeline runs on every import, and how the
**curator approval queue** gates promotion to the published corpus. It does NOT redefine the gate *policy* (that is
[ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md)), the storage layout
([./persistence.md](./persistence.md)), nor the build ([./build-and-publish-service.md](./build-and-publish-service.md)).

## Pipeline overview

```
discover() ── fetch() ──> [STAGING]  ── runRecheck() ──> verdict
   (source adapters)        (quarantine,                    │
                             never served)                  ├─ publish    -> curator QUEUE
                                                            ├─ quarantine -> curator QUEUE (blocked)
                                                            └─ reject     -> discarded + audited
                                                                              │
                                          curator approve(semver) ───────────┘
                                                            │
                                          assignVersion -> write md-in-git -> trigger build
```

Pipeline order (load-bearing, [ADR-0004](../01-decisions/ADR-0004-import-and-ports.md) §2):
`import → re-check → curator gate → version → publish`. There is **no raw import path** that skips the re-check —
agents and humans use the same checks. CAW-04 keeps its OWN copy of what it publishes; it references upstream only by
id/URI/version, never via a shared store ([ADR-0004](../01-decisions/ADR-0004-import-and-ports.md)).

## ContentSource port

```ts
interface ContentSourceAdapter {
  capabilities(): AdapterCapabilities;        // port, id, version, provides, requiresPublicSafe:true, maturity
  discover(query: DiscoverQuery): CandidateRef[];
  fetch(ref: CandidateRef): CandidateItem;    // payload + upstream_boundary_claim + source_ref + upstream_metadata
  health(): HealthStatus;
}
```

- **Read-only.** Adapters reference upstream by id/URI/version and never write back.
- An adapter **never knows the re-check exists** ([ADR-0004](../01-decisions/ADR-0004-import-and-ports.md) §1) — it
  cannot influence or bypass it. `upstream_boundary_claim` is **evidence only**, never a verdict.

### v1 sources + documented stubs

| Adapter | Maturity | Provides |
|---|---|---|
| `Caw02KnowledgeSourceAdapter` | concrete (v1) | validated knowledge / cited tips from CAW-02 (a separate product) |
| `Caw03SkillsRegistrySourceAdapter` | concrete (v1) | validated Skills/Workflows/Playbooks from CAW-03 / a skills registry (a separate product) |
| `InternalWikiSourceAdapter` | stub | future internal wiki import |
| `CuratedBundleSourceAdapter` | stub | future arbitrary curated bundle |

Stubs ship as: real interface, `NotImplemented` body, descriptor `maturity="stub"`, config example — registered,
discoverable, **config-disabled by default**; preflight refuses an `active` stub
([ADR-0004](../01-decisions/ADR-0004-import-and-ports.md) §5). Sources support **fan-in** (multiple active at once).

## Import: discover + fetch

- v1 is **pull**: the import service (curator-triggered or scheduled) calls `discover()` across active sources, then
  `fetch()` per selected ref. (Push from upstream is TODO(open-question), [ADR-0004](../01-decisions/ADR-0004-import-and-ports.md).)
- `fetch()` lands the `CandidateItem` in **staging** — a quarantine area that is never served and never built.
- Import is idempotent per `(source_ref.product, source_ref.id, origin_version)`; an unchanged upstream version does
  not create a duplicate staged record.
- **Fan-in collisions** (CAW-02 and CAW-03 both surface the same logical item) need dedup/precedence + provenance
  merge rules — TODO(open-question, [ADR-0004](../01-decisions/ADR-0004-import-and-ports.md)).

## The core re-check (public-safe gate at the trust boundary)

The re-check is a **core stage, never in an adapter** ([ADR-0004](../01-decisions/ADR-0004-import-and-ports.md) §2) — it
is the import-time enforcement of the [ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md)
gate. **Deny-by-default:** anything not positively confirmed public-safe does not publish. A failed re-check blocks the
item **even when upstream marked it public-safe**.

```ts
function runRecheck(staged: StagedCandidate): RecheckVerdict;
interface RecheckVerdict {
  decision: "publish" | "quarantine" | "reject";
  boundary_eff: Boundary;            // RE-COMPUTED locally; NOT the upstream claim
  findings: Finding[];
  evidence_ref: string;              // pointer into the hash-chained audit ledger
}
```

| # | Check | Rule | Failure ⇒ |
|---|---|---|---|
| 1 | Provenance present | a validated internal `source_ref` exists | reject |
| 2 | Boundary recompute | recompute `boundary_eff`; **fail-closed**: unresolvable ancestor ⇒ `confidential` | quarantine |
| 3 | `boundary_eff == public` | only public may proceed | quarantine |
| 4 | Visibility not private-derived | not derived from a private/internal-only item | quarantine |
| 5 | Redaction / leak scan | scan the **rendered public view** for confidential patterns | quarantine |
| 6 | Claim/source separation | no conflation of internal Samsung/SAIT claims with public research (brief §11) | quarantine/warn |
| 7 | Schema conformance | matches the content model ([ADR-0002](../01-decisions/ADR-0002-content-model.md)) | reject |

- Thresholds + pattern lists live in `profiles.recheck` **in the core**, never in an adapter; the registry can never
  let an adapter override the re-check, human gate, or boundary policy ([ADR-0004](../01-decisions/ADR-0004-import-and-ports.md) §4).
- CAW-04 re-implements boundary logic **locally** (independence over reuse) — its own copy, kept doctrinally aligned
  with CAW-02 *without* a shared dependency ([ADR-0004](../01-decisions/ADR-0004-import-and-ports.md) Consequences).
- Every verdict appends an audit event (`recheck`) referenced by `evidence_ref` ([./api-surface.md](./api-surface.md) Audit ops).

## Curator approval queue

The internal preview/admin surface ([ADR-0001](../01-decisions/ADR-0001-product-surface-and-delivery.md) §3) is the
**only** path that promotes a candidate to live. **Jimmy approves every publish** (brief §11); automatic generation is
proposal-only.

```ts
function listQueue(filter?: QueueFilter): QueueEntry[];
function approve(entryId: string, d: { semver: string; notes?: string }): PublishableItem;
function reject(entryId: string, reason: string): void;

interface QueueEntry {
  id: string; kind: Kind; slug: string;
  verdict: RecheckVerdict;            // findings + recomputed boundary shown to curator
  source_ref: OriginRef;             // shown in admin ONLY; never reaches public projection
  proposed_semver?: string;          // diff-assisted bump proposal (TODO open-question)
}
```

| Verdict | Queue state | Curator action |
|---|---|---|
| `publish` | ready | review findings + provenance → assign semver → `approve` (re-runs re-check at promotion) |
| `quarantine` | blocked | cannot approve until findings resolved (re-import or audited explicit override) |
| `reject` | not queued | discarded from staging with an audit record |

- `approve` **re-runs `runRecheck`** at promotion time (no stale verdict), assigns the semver bump, then triggers
  `assignVersion` → write to md-in-git ([./persistence.md](./persistence.md)) → rebuild
  ([./build-and-publish-service.md](./build-and-publish-service.md)).
- The PR diff into the content repo IS a redundant second curator gate
  ([ADR-0005](../01-decisions/ADR-0005-storage-and-versioning.md)).

## Retraction / liveness

When upstream re-validates or **retracts** a source item, CAW-04 must learn and re-run the gate (the unpublish/redact
counterpart). Mechanism is TODO(open-question): does the provenance ref carry a liveness/revocation check
([ADR-0004](../01-decisions/ADR-0004-import-and-ports.md), [ADR-0005](../01-decisions/ADR-0005-storage-and-versioning.md)).

## Failure modes

| Code | Stage | Behavior |
|---|---|---|
| `SOURCE_UNAVAILABLE` | discover/fetch | skip source; preflight/health surfaces it; no partial publish |
| `SCHEMA_NONCONFORMANT` | fetch/re-check #7 | reject; audited |
| `RECHECK_BLOCKED` | re-check | quarantine; finding logged; never auto-promoted |
| `BOUNDARY_NOT_PUBLIC` | re-check #2/3 | fail-closed quarantine |
| `DUPLICATE_PRECEDENCE` | fan-in | hold for curator; TODO(open-question) |

## Open Questions

- TODO(open-question: pull vs push import; [ADR-0004](../01-decisions/ADR-0004-import-and-ports.md)).
- TODO(open-question: fan-in dedup/precedence + provenance merge; [ADR-0004](../01-decisions/ADR-0004-import-and-ports.md)).
- TODO(open-question: exact re-check rule set + where thresholds live in `profiles.recheck`; alignment with CAW-02 without a shared substrate; [ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md)/[ADR-0004](../01-decisions/ADR-0004-import-and-ports.md)).
- TODO(open-question: semver bump — curator-only vs diff-assisted proposal; [ADR-0005](../01-decisions/ADR-0005-storage-and-versioning.md)).
- TODO(open-question: upstream retraction/liveness detection; [ADR-0004](../01-decisions/ADR-0004-import-and-ports.md)).
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks

- A runbook defines the `ContentSourceAdapter` interface + the config-driven registry block, with `Caw02KnowledgeSourceAdapter` + `Caw03SkillsRegistrySourceAdapter` concrete and the wiki/bundle stubs config-disabled.
- A runbook implements the **core re-check as a non-bypassable stage** with `profiles.recheck` in core, plus a **negative-heavy test suite** (upstream-public item carrying a confidential pattern MUST quarantine + log a finding).
- A runbook builds the curator queue surface (internal-only) showing findings + provenance, with `approve` re-running the re-check and assigning semver before any write.
- A runbook implements idempotent staging keyed by `(product,id,origin_version)` that is never served or built.
