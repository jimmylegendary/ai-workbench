# Personas & Use Cases — CAW-04

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [vision.md](./vision.md)
  - [scope-and-non-goals.md](./scope-and-non-goals.md)
  - [../01-decisions/ADR-0001-product-surface-and-delivery.md](../01-decisions/ADR-0001-product-surface-and-delivery.md)
  - [../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md)
  - [../01-decisions/ADR-0007-api-design.md](../01-decisions/ADR-0007-api-design.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

This doc names CAW-04's **personas** and the **use cases** they drive end-to-end. It frames *who* the product serves
and *what flows* it must support; it does not specify the mechanics (those live in the ADRs it links). Every use case
is constrained by the one guardrail: **public outputs from public-safe sources only.**

## Personas

| Persona | Surface(s) | Goal | Trust level | Can write? |
|---|---|---|---|---|
| **External reader** | Public WEBSITE (HTML) | Browse and read validated tips/skills/workflows/playbooks. | Untrusted public. | No (read-only). |
| **AI / API consumer** | Read-only REST API, raw markdown, `SKILL.md` + `manifest.json`, MCP resources view | Programmatically fetch a skill/workflow to reuse in an agent. | Untrusted public. | No (read-only). |
| **Internal curator (Jimmy)** | Internal PREVIEW/ADMIN | Review candidates, approve/reject publish, unpublish/redact, audit. | Trusted, authenticated. | Yes — the **only** write path (approval). |

Notes:

- External reader and AI/API consumer see the **same canonical artifact** from one source (web/API parity,
  [ADR-0007](../01-decisions/ADR-0007-api-design.md)); they differ only in representation (HTML vs JSON/markdown).
- The curator is the human in the loop the gate requires: the gate can auto-**reject** but never auto-**approve**
  ([ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md)).
- **Not a persona:** content authors. CAW-04 imports validated content; authoring lives in CAW-02 / CAW-03
  (separate products). See [scope-and-non-goals.md](./scope-and-non-goals.md) N1.

## Use cases

### UC1 — Import → public-safe gate → publish (the spine)

The core flow that produces the unit of value. Maps to brief §3 uc1.

```
curator triggers import
  └▶ ContentSourceAdapter.discover()/fetch()         [ADR-0004]  (boundary = upstream CLAIM)
       └▶ CORE public-safe re-check (deny-by-default) [ADR-0003/0004]
            • provenance present?  • boundary_eff == public (re-derived)?
            • visibility not private-derived?  • redaction/leak scan clean?
            • claim/source separation?  • schema conforms?
            └▶ emit CandidateItem + findings report (NEVER a published item)
                 └▶ curator reviews in PREVIEW/ADMIN  [ADR-0001]
                      └▶ approve (G8) → version (semver + digest) [ADR-0005]
                           └▶ write to CAW-04 git store (audit→sidecar) [ADR-0002/0005]
                                └▶ static build → SiteAndApiSinkAdapter [ADR-0006/0007]
                                     └▶ append-only audit ledger entry  [ADR-0003]
```

- **Actors:** internal curator (drives), AI source adapter (fetches).
- **Precondition:** a *validated* upstream entry exists (brief §10 — no go-live before then).
- **Fail-closed:** any indeterminate/unresolvable check ⇒ REJECT; an empty post-gate result is a no-op, not a
  degraded publish. A leak marker ⇒ **reject + escalate**, not auto-strip.
- **Done:** `(slug, semver)` frozen, live on web + API, traceable in the ledger.

### UC2 — Web browse + API fetch (parity)

A reader and an agent consume the same artifact. Maps to brief §3 uc2.

| Actor | Action | Representation | Anchor |
|---|---|---|---|
| External reader | Browses the site, opens an artifact page. | HTML | [ADR-0006](../01-decisions/ADR-0006-web-stack.md) |
| AI / API consumer | `GET` the artifact + `index.json` manifest. | JSON + raw markdown | [ADR-0007](../01-decisions/ADR-0007-api-design.md) |
| AI / API consumer | Fetch `SKILL.md` + `manifest.json`, or via MCP resources view. | distribution format / MCP | [ADR-0007](../01-decisions/ADR-0007-api-design.md) |

- **Invariant:** one canonical resource per artifact across HTML/markdown/JSON; no representation exposes any
  audit-only/sidecar field (public-projection split, test-enforced).
- **Deferred:** runtime search and Accept-header negotiation (see [scope-and-non-goals.md](./scope-and-non-goals.md) N10).

### UC3 — Publish a new version

A published artifact is updated. Maps to brief §3 uc3.

- Edits never mutate a frozen version. A change ⇒ a **new** `(slug, semver)`; the prior version stays addressable and
  immutable ([ADR-0005](../01-decisions/ADR-0005-storage-and-versioning.md)).
- The new version re-runs the full UC1 spine (re-check + curator approval) — versioning does not bypass the gate.
- **Done:** both old and new versions are addressable; consumers can pin a semver.

### UC4 — Unpublish / redact (boundary change)

An artifact's safety boundary changes, or it must be withdrawn. Maps to brief §3 uc4.

- Triggered by the curator (e.g., upstream reclassifies a source to `confidential`).
- The published **version stays immutable**, but is **withdrawn from serving** via an HTTP **410 tombstone**
  ([ADR-0005](../01-decisions/ADR-0005-storage-and-versioning.md)); unpublish/redact are **events, not deletes**
  ([ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md)).
- Redaction is **detection + rejection, never transformation/laundering** — no downgrade path inside CAW-04.
- **Open:** cache/CDN purge bound after a withdraw (TODO(open-question), [ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md)).
- **Done:** the resource returns 410; the ledger records the withdraw event.

### UC5 — Audit a published artifact

Prove why anything public is publishable and who approved it. Maps to brief §3 uc5.

- Every artifact traces to its validated internal `source_ref` (+ `producer_run_id`) and safety review via the
  **append-only, hash-chained** ledger ([ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md)).
- Guarantees: **traceability** (back upstream without a live handle), **tamper-evidence** (`verify_audit()` →
  `broken_at`), **reconstructable decisions** (the per-check gate result + approver is replayable).
- **Actor:** curator (and, for spot checks, an auditor reading the ledger + git history as a second witness).

### UC6 — Onboard a new source or sink (seam extension)

Extend the catalogue's reach without a core edit. Maps to brief §8 / [ADR-0004](../01-decisions/ADR-0004-import-and-ports.md).

- A developer implements one adapter (e.g., `CuratedBundleSourceAdapter` or `PackageRegistrySinkAdapter`) + one
  config block; preflight validates wiring and **refuses an `active` stub**.
- The re-check, human gate, and boundary policy stay in the core — an adapter can never override them
  (`requiresPublicSafe: true`).
- **Done:** the new integration touches only one adapter file + one config block (the seam regression test).

## Use-case → ADR traceability

| UC | Primary ADRs |
|---|---|
| UC1 | [ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md), [ADR-0004](../01-decisions/ADR-0004-import-and-ports.md), [ADR-0005](../01-decisions/ADR-0005-storage-and-versioning.md) |
| UC2 | [ADR-0006](../01-decisions/ADR-0006-web-stack.md), [ADR-0007](../01-decisions/ADR-0007-api-design.md), [ADR-0002](../01-decisions/ADR-0002-content-model.md) |
| UC3 | [ADR-0005](../01-decisions/ADR-0005-storage-and-versioning.md), [ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md) |
| UC4 | [ADR-0005](../01-decisions/ADR-0005-storage-and-versioning.md), [ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md) |
| UC5 | [ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md) |
| UC6 | [ADR-0004](../01-decisions/ADR-0004-import-and-ports.md) |

## Open Questions

- TODO(open-question: does the curator need a diff/preview of the *rendered public view* vs. raw candidate in the
  admin surface for faster G8 review?)
- TODO(open-question: authn for the internal preview/admin surface — out of scope for content but needed for the
  curator persona.)
- TODO(open-question: how the AI/API consumer pins/discovers versions — `index.json` shape; see
  [ADR-0007](../01-decisions/ADR-0007-api-design.md).)
- Consolidated in `../08-research-plan/open-questions.md` (TODO: create).

## Implications for runbooks

- UC1 is the runbook spine; UC3/UC4 reuse it (version + withdraw paths).
- A runbook builds the curator preview/admin review flow surfacing the re-check findings report for G8.
- A runbook implements the 410 tombstone path and ties it to the ledger withdraw event (UC4).
- The UC6 seam regression test (new integration = one adapter + one config block) is an acceptance criterion.
