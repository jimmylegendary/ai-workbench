# Publishing Core — Overview

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./publish-gate-and-public-safe.md](./publish-gate-and-public-safe.md)
  - [./import-and-recheck.md](./import-and-recheck.md)
  - [../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md)
  - [../01-decisions/ADR-0004-import-and-ports.md](../01-decisions/ADR-0004-import-and-ports.md)
  - [../01-decisions/ADR-0002-content-model.md](../01-decisions/ADR-0002-content-model.md)
  - [../01-decisions/ADR-0005-storage-and-versioning.md](../01-decisions/ADR-0005-storage-and-versioning.md)
  - [../06-interfaces/](../06-interfaces/) (port contracts — adapter detail)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This doc describes **what the publishing core is** — the hexagonal heart of CAW-04 that turns a validated,
upstream-imported candidate into a published, versioned, public-safe artifact — and gives the **folder map** for
`05-publishing-core/` and the core source tree the runbooks will build. It does NOT re-decide the gate policy
(see [publish-gate-and-public-safe.md](./publish-gate-and-public-safe.md)), the import/re-check mechanics
(see [import-and-recheck.md](./import-and-recheck.md)), the content model (ADR-0002), storage/versioning
(ADR-0005), or the web/API stack (ADR-0006/0007). It is the map that ties those together.

## What the core is
The publishing core is the **product-owned, framework-agnostic** domain that sits behind all three surfaces
(public website, public REST API, internal preview/admin — ADR-0001) and between the two ports
(`ContentSourceAdapter` in, `PublishSinkAdapter` out — ADR-0004). It authors nothing (brief §10). It **imports**
already-validated content across explicit boundaries, **re-checks** it for public-safety, holds it for **curator
approval**, **versions + freezes** it, and hands a `PublishableItem` to a sink.

The core embodies CAW-04's one defining property: **public-safe by construction.** The two leak-prevention
controls — the public-safe re-check and the publish gate — live *inside the core*, never in an adapter, so no
source or sink can self-bypass them (ADR-0004 §2/§3). The static-artifact deploy model (ADR-0006) means the
published output has **no live path back to any internal store**: by the time bytes are servable, they have already
passed the gate and been frozen.

### The pipeline (one direction, deny-by-default)
```
ContentSourceAdapter.fetch()           # adapter: read-only, returns a CandidateItem (untrusted)
        │
        ▼
[CORE] import re-check  ── reject/quarantine ─▶  audit + stop   # public-safe re-check (defense in depth)
        │  (CandidateItem → candidate, findings attached)
        ▼
[CORE] preview/admin hold              # candidate visible ONLY on internal surface, never public
        │
        ▼
[CORE] publish gate G1..G8             # total, side-effect-free decision; default branch = REJECT
        │  (G8 = explicit human approve event)
        ▼
[CORE] version + freeze                # semver identity + content-digest immutability (ADR-0005)
        │  (PublishableItem: boundary=public, provenance attached, approved)
        ▼
PublishSinkAdapter.publish()           # adapter: SiteAndApi (HTML + JSON + raw md), MCP view
```
Every arrow is **fail-closed**: anything indeterminate, unverified, or unparseable stops and is excluded
(ADR-0003 principle 2). An empty result after gating is a no-op, not a degraded publish.

## Core responsibilities vs. what lives elsewhere
| Concern | Owner | Where |
|---|---|---|
| Read upstream content (CAW-02/CAW-03), reference by id/URI/version | Adapter (driven) | `ContentSourceAdapter` — ADR-0004; [../06-interfaces/](../06-interfaces/) |
| Public-safe re-check at the trust boundary | **Core** | [import-and-recheck.md](./import-and-recheck.md) |
| `publish_decision()` gate G1–G8 | **Core** | [publish-gate-and-public-safe.md](./publish-gate-and-public-safe.md) |
| Curator approval (G8) on the internal surface | **Core** + preview/admin surface | ADR-0001; gate doc |
| Versioning, freeze, content-digest, tombstones | **Core** + store | ADR-0005 |
| Append-only hash-chained audit ledger | **Core** | gate doc §Audit |
| Emit HTML / JSON / raw md / SKILL.md / MCP | Adapter (driven) | `SiteAndApiSinkAdapter` — ADR-0006/0007 |
| Boundary/visibility vocabulary | **Core (own copy)** | reused-as-semantics from CAW-02, not shared — ADR-0003 |

The two ports are the **only** seams to the outside; the registry that wires them is config-driven and can never
let an adapter override the re-check, human gate, or boundary policy (ADR-0004 §4).

## The `pub.safe` library — the one gate
All leak-prevention logic is concentrated in a single in-product library, `pub.safe` (the CAW-04 analogue of
CAW-02's `kr.boundary`, an **independent copy**, not a shared dependency). It exposes:

```
pub.safe
├── envelope.parse(bytes) -> Envelope            # parse + semver-gate the import envelope
├── boundary.eff(graph)   -> Boundary            # lattice-max over provenance ancestors (fail-closed unknown)
├── visibility.eff(graph) -> Visibility          # private-derived check
├── redact.scan(view)     -> Hit[]               # ruleset over the RENDERED public view
├── gate.decide(item)     -> PUBLISH_OK | REJECT{reasons[]}   # total, side-effect-free; default REJECT
└── audit.append(event)   -> seq                 # hash-chained _events line
```
There is **no raw import path** around `pub.safe` — agents and humans traverse the same checks (ADR-0004 §2).
The gate can only ever auto-**reject**; it can never auto-**approve** (ADR-0003 principle 6).

## Folder map — `design/05-publishing-core/`
| File | Decides / describes |
|---|---|
| `overview.md` (this file) | What the core is; folder + source map; the pipeline at a glance |
| `publish-gate-and-public-safe.md` | The load-bearing gate: deny-by-default, validated-source + public-safe required, redaction, curator approval, generated/unverified never published |
| `import-and-recheck.md` | `ContentSourceAdapter` import + the CORE public-safe re-check; upstream boundary = evidence only; fan-in dedup/precedence; pull (v1) vs push |

## Source tree the runbooks will build (build guidance, not final code)
```
src/
├── core/
│   ├── pub_safe/            # the one gate library (envelope, boundary, visibility, redact, gate, audit)
│   │   ├── envelope.*       # parse + semver-gate
│   │   ├── boundary.*       # boundary_eff / visibility_eff (fail-closed)
│   │   ├── redact.*         # scan() over rendered public view + pattern lists
│   │   ├── gate.*           # publish_decision() G1..G8
│   │   └── audit.*          # hash-chained _events writer + verify_audit()
│   ├── import/              # re-check pipeline orchestration (calls pub_safe; NOT an adapter)
│   ├── pipeline/            # import → re-check → hold → gate → version → publish wiring
│   ├── model/               # CandidateItem / candidate / PublishableItem (ADR-0002 shapes)
│   └── registry/            # config-driven adapter registry + preflight (ADR-0004 §3/§4)
├── ports/
│   ├── content_source.*     # ContentSourceAdapter interface
│   └── publish_sink.*       # PublishSinkAdapter interface
├── adapters/
│   ├── source/              # Caw02Knowledge*, Caw03SkillsRegistry*, + stubs (wiki, curated bundle)
│   └── sink/                # SiteAndApi*, + stubs (docs host, package registry, syndication)
└── content/                 # CAW-04's OWN git store (written AFTER the re-check) — ADR-0005
    └── {tips,skills,workflows,playbooks}/<slug>/<semver>.md(x)
```
The store under `src/content/` is the **source of truth** (ADR-0005). The core writes to it **only after** the
re-check passes; the sink builds the static artifact **from** it. There is no live read path from the public
artifact back into any internal store.

## Core invariants (test-enforced)
| # | Invariant | Enforced by |
|---|---|---|
| I1 | No `internal`/`confidential`/`private`-derived item ever reaches a sink | gate G2/G3; negative-heavy + mutation tests (ADR-0003) |
| I2 | No raw import path bypasses `pub.safe` | single import entrypoint; registry preflight (ADR-0004 §3) |
| I3 | Audit-only provenance (`origin_ref`/`origin_version`) never serializes to web/API | sidecar split (ADR-0002); serialization test |
| I4 | Published `(slug, semver)` is frozen forever; edits = new version | content-digest immutability (ADR-0005) |
| I5 | Every publish has an explicit human approve event (G8) | gate; audit `approved_by` |
| I6 | An `active` adapter is never a `stub` | registry preflight (ADR-0004 §3) |

## Open Questions
- TODO(open-question: does the import bundle ship the full provenance ancestor graph for local `boundary_eff`
  recomputation, or only the leaf + declared boundary? — ADR-0003/0004; affects I1.)
- TODO(open-question: re-validation/revocation cadence — how the core learns an upstream source was reclassified
  to confidential and must unpublish — ADR-0003.)
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks
- **RB (pub.safe library):** build the single gate library with a negative-heavy, mutation-tested suite — weakening
  the default branch to `PUBLISH_OK` must break the suite.
- **RB (core pipeline):** wire `import → re-check → hold → gate → version → publish`; no step is skippable.
- **RB (registry + preflight):** config-driven wiring; refuse an `active` `stub`; secrets as env refs only.
- **RB (sidecar split test):** assert audit-only provenance never appears in any web/API serialization (I3).
