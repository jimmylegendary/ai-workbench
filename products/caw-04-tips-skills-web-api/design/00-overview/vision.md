# Vision — CAW-04 AI Tips / Skills Website & REST API

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [scope-and-non-goals.md](./scope-and-non-goals.md)
  - [personas-and-use-cases.md](./personas-and-use-cases.md)
  - [../01-decisions/ADR-0001-product-surface-and-delivery.md](../01-decisions/ADR-0001-product-surface-and-delivery.md)
  - [../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md)
  - [../01-decisions/ADR-0004-import-and-ports.md](../01-decisions/ADR-0004-import-and-ports.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

This doc states the **north star** for CAW-04: the public read/API publishing layer for *validated* AI practice.
It defines the unit of value, the one property the whole product is organized around (**public-safe by
construction**), and the first vertical slice. It does **not** decide the content model (see
[ADR-0002](../01-decisions/ADR-0002-content-model.md)), the gate mechanics (see
[ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md)), or the stack
(see [ADR-0006](../01-decisions/ADR-0006-web-stack.md)/[ADR-0007](../01-decisions/ADR-0007-api-design.md)).

## North star

> Validated AI-use practice — tips, skills, workflows, and reusable operating patterns — should be **publicly
> readable by humans and fetchable by agents**, with provenance and a safety boundary attached, **without ever
> leaking unverified or company-confidential know-how**.

CAW-04 is the **final publishing/read layer** of the `ai-workbench` family of six independent products. It does not
author content and does not own the knowledge. It **imports** content that sibling products have already validated
(CAW-02 knowledge; CAW-03 / a skills registry — each a *separate product* with *no shared runtime substrate*), runs
its **own** public-safe re-check, and **publishes** a website plus a read-only REST API. The internal know-how that
is trapped today becomes safely shareable; the ad-hoc sharing that leaks confidential material or ships unverified
snippets is replaced by a gated, audited, versioned pipeline.

The position is deliberately narrow and load-bearing: **publishing has its own concerns** — public-safe gating,
versioning, web/API delivery, audit — that must not live inside the internal products. CAW-04 isolates exactly
those concerns behind one product core.

## Unit of value

The atomic unit CAW-04 produces is **one published, versioned, public-safe artifact**.

| Property | Meaning |
|---|---|
| **Published** | Reachable on the public website AND the read-only REST API, from one canonical source ([ADR-0007](../01-decisions/ADR-0007-api-design.md) web/API parity). |
| **Versioned** | Addressable by `(slug, semver)`; a published version is **frozen forever** (content-digest proves immutability; [ADR-0005](../01-decisions/ADR-0005-storage-and-versioning.md)). |
| **Public-safe** | Carries `boundary == public`, re-derived locally over provenance ancestors — never a trusted upstream flag ([ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md) G2). |
| **Provenanced** | Traces to a validated internal source + safety review; audit-only fields stay in a sidecar that never serializes to web/API ([ADR-0002](../01-decisions/ADR-0002-content-model.md)). |
| **Curator-approved** | Exists only because Jimmy explicitly approved this version; the gate can auto-reject but never auto-approve. |

One artifact is a `Tip`, `Skill`, `Workflow`, or `Playbook` (the four publishable entities). Success is **not**
measured in page views; it is measured in *the count of artifacts that cleared the gate and remain traceable and
withdrawable*. A bigger catalogue that weakens the gate is a regression, not progress.

## The organizing property: public-safe by construction

Everything in CAW-04 is shaped so that an `internal`, `confidential`, or `private`-derived item **cannot** reach the
public surface — not by policy reminder, but by structure. Four reinforcing layers:

1. **Deny-by-default core gate.** The publish decision function defaults to REJECT; the first hard failure rejects;
   anything indeterminate is excluded ([ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md)).
2. **Re-check in the core, not in adapters.** Every import crosses one core-resident public-safe re-check that
   re-derives boundary from provenance (fail-closed: an unresolvable ancestor resolves to `confidential`/`private`).
   No adapter can self-bypass it; there is **no raw import path** ([ADR-0004](../01-decisions/ADR-0004-import-and-ports.md)).
3. **Frozen static artifact at the sink.** The site/API is built as static output with **no live path** to internal
   stores; the public bundle is a vetted, frozen artifact ([ADR-0006](../01-decisions/ADR-0006-web-stack.md)).
4. **Build-time `boundary == public` assertion + public-projection split.** Audit-only provenance fields live in a
   sidecar and are test-enforced never to serialize to web/API ([ADR-0002](../01-decisions/ADR-0002-content-model.md));
   the build refuses to emit a non-public artifact.

```
upstream (CAW-02 / CAW-03)        CAW-04 core (independent)              public surfaces
  validated content   ──import──▶  re-check ─▶ curator gate ─▶ version  ──build──▶  WEBSITE (HTML)
  (boundary = CLAIM)   (port)      (deny-by-default, fail-closed)        (frozen)    REST API (JSON + md)
                                          │                                           MCP resources view
                                          └─ append-only, hash-chained audit ledger
```

The defense is layered on purpose: a single upstream mis-classification is caught by the re-check; a re-check gap is
caught by the build-time assertion; a serialization slip is caught by the projection test. **No single failure ships
a leak.**

## First vertical slice

The brief mandates small vertical slices over broad scaffolding, and that content goes live **only once validated
upstream entries exist**. The first slice proves the *whole spine end-to-end on one artifact*, not a broad catalogue:

| Step | What the slice does | Anchored in |
|---|---|---|
| 1 | Import **one** validated `Skill` (or `Tip`) from a CAW-03 / CAW-02 source adapter via `discover()`/`fetch()`. | [ADR-0004](../01-decisions/ADR-0004-import-and-ports.md) |
| 2 | Run the **core public-safe re-check**; emit a `CandidateItem` with a findings report — never a published item. | [ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md), [ADR-0004](../01-decisions/ADR-0004-import-and-ports.md) |
| 3 | Curator reviews on the **internal preview/admin** surface and approves `(slug, semver)`. | [ADR-0001](../01-decisions/ADR-0001-product-surface-and-delivery.md) |
| 4 | Write the frozen md/MDX + frontmatter into CAW-04's **own git store** (audit fields to sidecar). | [ADR-0005](../01-decisions/ADR-0005-storage-and-versioning.md) |
| 5 | Static build emits the artifact to **website + REST JSON + raw markdown + MCP view** from one source. | [ADR-0006](../01-decisions/ADR-0006-web-stack.md), [ADR-0007](../01-decisions/ADR-0007-api-design.md) |
| 6 | A reader browses the HTML page; an agent fetches the same artifact via API — **web/API parity** verified. | [ADR-0007](../01-decisions/ADR-0007-api-design.md) |

Explicitly *out* of the first slice (kept as documented stubs / deferrals): runtime search, Accept-header
negotiation, multi-source fan-in dedup, and every future source/sink adapter. The slice's done-criterion is: **one
real validated artifact published, audited, and withdrawable, with a test proving no above-public field can reach the
public output.**

## Why CAW-04 is separate (independence contract)

CAW-04 has its own core, its own content store ([ADR-0005](../01-decisions/ADR-0005-storage-and-versioning.md)), and
its own surfaces. It references siblings only by id/URI/version across **import boundaries** — never a shared store,
registry, or library. It keeps its *own copy* of boundary semantics (doctrinally aligned with CAW-02, not a shared
dependency). This is what lets the public surface evolve and be reasoned about as a leak-resistant unit on its own.

## Open Questions

- TODO(open-question: timing of go-live — gated on the existence of validated upstream entries; see brief §10.)
- TODO(open-question: success metric definition beyond "count of audited, withdrawable artifacts".)
- See [ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md) and
  [ADR-0004](../01-decisions/ADR-0004-import-and-ports.md) open questions (redaction engine, provenance bundle
  completeness, pull-vs-push import, revocation/unpublish cadence).
- Consolidated in `../08-research-plan/open-questions.md` (TODO: create).

## Implications for runbooks

- The first-slice spine (import → re-check → gate → version → publish) is the runbook ordering backbone.
- The `pub.safe` re-check library is built with a **negative-heavy, mutation-tested** suite: weakening the default
  branch to `PUBLISH_OK` must break the suite (per [ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md) follow-on).
- A build-time test must assert no sidecar/audit field serializes into web/API output (public-projection split).
