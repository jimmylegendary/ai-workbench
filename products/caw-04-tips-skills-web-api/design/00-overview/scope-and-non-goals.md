# Scope & Non-Goals — CAW-04

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [vision.md](./vision.md)
  - [personas-and-use-cases.md](./personas-and-use-cases.md)
  - [../01-decisions/ADR-0001-product-surface-and-delivery.md](../01-decisions/ADR-0001-product-surface-and-delivery.md)
  - [../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md)
  - [../01-decisions/ADR-0004-import-and-ports.md](../01-decisions/ADR-0004-import-and-ports.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

This doc draws the **boundary of CAW-04 v1**: what is in scope, what is explicitly a non-goal, and where the
import/export seams sit. It is the contract that keeps the product from sprawling into the internal products it
publishes from. It does **not** specify *how* each piece is built — those are the ADRs and runbooks it links.

## In scope (v1)

| # | In scope | Why it belongs here | Anchor |
|---|---|---|---|
| S1 | A **public website** (browse/read HTML) of published artifacts. | Brief §4 primary surface. | [ADR-0001](../01-decisions/ADR-0001-product-surface-and-delivery.md), [ADR-0006](../01-decisions/ADR-0006-web-stack.md) |
| S2 | A **read-only public REST API** (JSON + raw markdown) with web/API parity from one source. | Brief §4; agents fetch the same content readers see. | [ADR-0007](../01-decisions/ADR-0007-api-design.md) |
| S3 | An **internal preview/admin** surface for the curator publish gate. | Brief §4 secondary; where G8 approval happens. | [ADR-0001](../01-decisions/ADR-0001-product-surface-and-delivery.md), [ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md) |
| S4 | **Import** of already-validated content via `ContentSourceAdapter` (v1: CAW-02, CAW-03/skills registry). | Brief §7; CAW-04 imports, never authors. | [ADR-0004](../01-decisions/ADR-0004-import-and-ports.md) |
| S5 | The **core public-safe re-check + deny-by-default publish gate** (re-derives boundary; fail-closed). | Brief §5/§11 load-bearing. | [ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md), [ADR-0004](../01-decisions/ADR-0004-import-and-ports.md) |
| S6 | CAW-04's **own md/MDX + frontmatter git content store** as source of truth, with a sidecar for audit-only fields. | Brief §6; independence. | [ADR-0005](../01-decisions/ADR-0005-storage-and-versioning.md), [ADR-0002](../01-decisions/ADR-0002-content-model.md) |
| S7 | **Semver versioning + content-digest immutability**; published `(slug, semver)` frozen forever. | Brief §5. | [ADR-0005](../01-decisions/ADR-0005-storage-and-versioning.md) |
| S8 | **Unpublish / redact** via HTTP 410 tombstone (withdraw from serving; version stays immutable). | Brief §3 uc4. | [ADR-0005](../01-decisions/ADR-0005-storage-and-versioning.md), [ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md) |
| S9 | An **append-only, hash-chained audit ledger** tracing each publish to its validated source + approval. | Brief §3 uc5. | [ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md) |
| S10 | A **SKILL.md + manifest.json** distribution format, an **MCP resources view**, and an **index.json** manifest. | Brief §4 delivery; agent consumption. | [ADR-0007](../01-decisions/ADR-0007-api-design.md) |
| S11 | **Ports & adapters with documented stubs** for future sources/sinks (config-driven registry). | Brief §8 design the seams. | [ADR-0004](../01-decisions/ADR-0004-import-and-ports.md) |

## Non-goals (v1)

| # | Non-goal | Why excluded | Where it actually lives |
|---|---|---|---|
| N1 | **Authoring content from scratch.** | CAW-04 publishes validated upstream content, not original know-how. | CAW-02 / CAW-03 (separate products). |
| N2 | **Publishing anything unverified or above `public`.** | Brief §10/§11 — the one hard guardrail. `internal`/`confidential` are publishable-never. | Stays internal; only re-enters as a new public-safe import. |
| N3 | **Reclassify / downgrade inside CAW-04** (confidential→public). | The public surface must never be where confidential becomes public. | Happens upstream only; re-imported. |
| N4 | **User accounts or a public write API.** | Read-only public surface; curator-only publish. | Curator approval is the only write path (internal). |
| N5 | **Being the knowledge repo.** | That is CAW-02, a separate product. | CAW-02. |
| N6 | **Being the skills harness / registry.** | That is CAW-03, a separate product. | CAW-03 / a skills registry. |
| N7 | **Auto-approval / auto-publish.** | Gate may auto-reject only; Jimmy approves every publish. | Curator gate G8. |
| N8 | **Shared runtime substrate** (shared store/registry/library with siblings). | Brief §1 independence contract. | Adapters over explicit import boundaries. |
| N9 | **Going live before validated upstream entries exist.** | Design now; publish later. | Slice ships when real validated entries exist. |
| N10 | **Runtime search + Accept-header content negotiation.** | Deferred to keep the static, frozen-artifact property. | Deferred ([ADR-0007](../01-decisions/ADR-0007-api-design.md)); revisit post-v1. |
| N11 | **Serializing audit-only provenance to web/API.** | `origin_ref`/`origin_version` are audit-only; public-projection split is test-enforced. | Sidecar only ([ADR-0002](../01-decisions/ADR-0002-content-model.md)). |

## Import / export boundaries

CAW-04 touches the rest of the family **only** across explicit, typed boundaries — references by id/URI/version,
never a shared store. Inbound content is **a claim, not a verdict**; the core re-checks it.

```
IMPORT (ContentSourceAdapter, read-only)            EXPORT (PublishSinkAdapter)
  CAW-02 knowledge  ─────────┐                       ┌─────▶ public WEBSITE (HTML)         [v1]
  CAW-03 / skills registry ──┼──▶ CAW-04 core ──────▶┼─────▶ read-only REST API (JSON+md)  [v1]
  internal wiki        (stub)│   re-check + gate     ├─────▶ MCP resources view            [v1]
  curated bundle       (stub)┘   + version + audit   ├─────▶ external docs host       (stub)
                                                     ├─────▶ package registry         (stub)
                                                     └─────▶ syndication              (stub)
```

| Direction | v1 concrete | v1 documented stubs (config-disabled) |
|---|---|---|
| **Import** (`ContentSourceAdapter`) | `Caw02KnowledgeSourceAdapter`, `Caw03SkillsRegistrySourceAdapter` | `InternalWikiSourceAdapter`, `CuratedBundleSourceAdapter` |
| **Export** (`PublishSinkAdapter`) | `SiteAndApiSinkAdapter` (+ MCP view as a sink) | `ExternalDocsHostSinkAdapter`, `PackageRegistrySinkAdapter`, `SyndicationSinkAdapter` |

Boundary rules (from [ADR-0004](../01-decisions/ADR-0004-import-and-ports.md)):

- **Pull, not push (v1).** CAW-04 polls `discover()`/`fetch()`; upstream does not write into CAW-04.
  (TODO(open-question: push notification on upstream change).)
- **Re-check in core, never in an adapter.** A source adapter "never knows the re-check exists"; it cannot
  self-disable the public-safe enforcement (`requiresPublicSafe: true`).
- **Stubs are real interfaces with `NotImplemented` bodies + `maturity="stub"`**; preflight refuses to run a `stub`
  marked `active`. Adding a real source/sink = one adapter file + one config block, no core edit.
- **Export is the only outward flow** and it is read-only for the world; the sole inbound write is curator approval.

## What "done" excludes (slice discipline)

The first slice (see [vision.md](./vision.md)) deliberately ships **one** artifact end-to-end and leaves N10 and all
stub adapters unimplemented. Broad catalogue growth, multi-source fan-in dedup, and search are **post-slice** and do
not block the slice's done-criterion.

## Open Questions

- TODO(open-question: whether CAW-02 ships the full provenance ancestor graph or only the leaf — affects fail-closed
  scope; see [ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md).)
- TODO(open-question: dedup/precedence + provenance merge for multi-source fan-in; see
  [ADR-0004](../01-decisions/ADR-0004-import-and-ports.md).)
- TODO(open-question: revocation/unpublish cadence when upstream reclassifies a source to confidential.)
- Consolidated in `../08-research-plan/open-questions.md` (TODO: create).

## Implications for runbooks

- Each stub adapter gets a runbook that produces interface + `NotImplemented` body + descriptor + config example
  (config-disabled), with a preflight test that refuses an `active` stub.
- A runbook adds the public-projection serialization test (N11) as an acceptance gate.
- No runbook may introduce a write path to the public surface other than the curator gate (enforces N4/N7).
