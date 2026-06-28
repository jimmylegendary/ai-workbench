# System Architecture — Containers & the Public-Safe-by-Construction Boundary

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./component-boundaries.md](./component-boundaries.md)
  - [../01-decisions/ADR-0001-product-surface-and-delivery.md](../01-decisions/ADR-0001-product-surface-and-delivery.md)
  - [../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md)
  - [../01-decisions/ADR-0004-import-and-ports.md](../01-decisions/ADR-0004-import-and-ports.md)
  - [../01-decisions/ADR-0005-storage-and-versioning.md](../01-decisions/ADR-0005-storage-and-versioning.md)
  - [../01-decisions/ADR-0006-web-stack.md](../01-decisions/ADR-0006-web-stack.md)
  - [../01-decisions/ADR-0007-api-design.md](../01-decisions/ADR-0007-api-design.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

This document fixes the **container-level architecture** of CAW-04: which runtime/build units exist, how they
depend on each other, and the structural invariant that makes the public surface **public-safe by construction**.
It elaborates ADR-0001/0004/0006 — it does **not** redefine the content model (ADR-0002), the gate rules
(ADR-0003), the storage/versioning identity (ADR-0005), or the API resource scheme (ADR-0007). Module-level
ownership and service signatures live in the sibling [component-boundaries.md](./component-boundaries.md).

CAW-04 is an **independent product**: its own core, its own git content store, its own deploy. It shares **no
runtime substrate** with sibling products; every cross-product link is an import boundary crossed by an adapter
(brief §1, §7). It authors nothing — it publishes what an internal substrate already validated, after a local
re-check.

## Containers

| # | Container | Kind | Responsibility | Reads | Writes |
|---|---|---|---|---|---|
| C1 | **Product Core** | library / batch process | Orchestrates `import → re-check → curator gate → version → publish`. Owns the re-check + gate + versioning. Adapter-agnostic. | source adapters, config, git store | git content store, audit log |
| C2 | **ContentSource adapters** | driven adapter | Read-only pull from upstream by id/URI/version; return provenance-tagged `CandidateItem`. v1: `Caw02Knowledge`, `Caw03SkillsRegistry`. Stubs: wiki, curated bundle. | upstream products (over a boundary) | — (returns to core) |
| C3 | **Git Content Store** | data (files) | Source of truth: markdown/MDX + YAML frontmatter; audit-only fields in a sidecar. Written by core **after** the re-check. Immutable published `(slug,semver)`. | — | by core only |
| C4 | **PublishSink adapter — Astro SSG Build** | build pipeline | The `SiteAndApiSinkAdapter`: turns the git store into a frozen static artifact (HTML + JSON + raw `.md` + manifest). Runs the build-time `boundary === "public"` assertion. | git content store | static artifact |
| C5 | **Static Artifact** | deployed files (CDN) | The public website **and** REST API as prebuilt files. The world's only view. No code path back inward. | — | served read-only |
| C6 | **Preview/Admin surface** | internal-only app | Shows re-check findings + diffs to the curator; the **only** path that promotes a gate-passing candidate to live (triggers C4). Never public. | git store (candidate/staging), audit log | approval events → core |
| C7 | **Audit log** | append-only data | Records every import, re-check verdict, approval, publish/unpublish with provenance. | — | by core only |

C2–C7 are realized by the adapters and stacks fixed in ADR-0004/0006/0007. Future sinks (external docs host,
package registry, syndication) are additional C4-class adapters over the same core (ADR-0004 §5).

## Container diagram

```
        UPSTREAM (separate products — import boundary, no shared substrate)
        ┌──────────────────────┐   ┌──────────────────────────────┐
        │ CAW-02 knowledge     │   │ CAW-03 / skills registry     │
        └──────────┬───────────┘   └──────────────┬───────────────┘
   pull by id/URI/version (read-only)             │
        ┌──────────▼───────────────────────────────▼──────────────┐
        │  C2  ContentSource adapters   (provide CandidateItem +   │
        │      upstream_boundary_claim = EVIDENCE ONLY)            │
        └──────────────────────────┬──────────────────────────────┘
                                   │ CandidateItem
   ╔═══════════════════════════════▼══════════════════════════════╗
   ║  C1  PRODUCT CORE   (hexagonal; adapters cannot bypass it)    ║
   ║                                                              ║
   ║   Import → ┌───────────────┐ → Curator → Versioning →        ║
   ║            │ Re-check/Gate │   gate (C6)  (semver+digest)     ║
   ║            │ DENY-BY-DFLT  │                                  ║
   ║            └───────────────┘                                  ║
   ║   public-safe RE-CHECK is a CORE stage — NOT in any adapter   ║
   ╚════════════════╤═══════════════════════════╤═════════════════╝
                    │ write AFTER re-check       │ approval events
            ┌───────▼────────┐          ┌────────▼─────────┐
            │ C3 Git Content │          │ C6 Preview/Admin │  (internal only)
            │    Store (SoT) │◄─────────│   curator review │
            │  md/MDX+sidecar│  staging └──────────────────┘
            └───────┬────────┘
                    │ getCollection() — typed corpus
            ┌───────▼─────────────────────────────────────┐
            │ C4 PublishSink: Astro 5 SSG build            │
            │   build-time assert boundary==="public"      │
            │   strip audit-only fields (sidecar) before   │
            │   ANY serialization                          │
            └───────┬─────────────────────────────────────┘
                    │ frozen vetted files (HTML + .json + .md + index.json)
            ┌───────▼─────────────────────────────────────┐
            │ C5 Static Artifact on CDN                    │
            │   Website (HTML) + REST API (JSON/.md) + MCP │
            └───────┬─────────────────────────────────────┘
                    │ read-only
        ┌───────────▼───────────┐
        │ Readers / Agents / MCP│   (NO path back to C1/C2/C3 — see invariant)
        └───────────────────────┘
```

## The one-way dependency rule

Dependencies point **inward then outward along the pipeline only**; nothing downstream calls back upstream at
request time.

```
upstream ──► C2 source ──► C1 core ──► C3 git store ──► C4 build ──► C5 static artifact ──► public
                                          ▲
                                   C6 admin approves
```

Rules (enforced as architecture fitness, not convention):

1. **Adapters depend on the core's port interfaces; the core never depends on a concrete adapter** (hexagonal,
   ADR-0004). Wiring is config-driven (`caw04.config.yaml`).
2. **The re-check and gate live in C1.** No adapter — source or sink — may publish around them. `requiresPublicSafe:
   true` in every adapter descriptor cannot be self-disabled (ADR-0004 §3).
3. **C3 is written only by C1, only after the re-check.** The build (C4) is a pure read of C3.
4. **C5 has no outbound dependency.** It is data, not code; it cannot query C1/C2/C3.

## Public-safe by construction

The most critical guardrail (brief §11): no confidential data on the public surface. The architecture makes a leak
**structurally hard** with layered, independent backstops — defense in depth, deny-by-default at each layer.

| Layer | Where | Property |
|---|---|---|
| L0 Upstream claim is evidence only | C2 | `upstream_boundary_claim` is recorded, never trusted as a verdict (ADR-0004). |
| L1 Core re-check | C1 | Re-computes `boundary_eff`; fail-closed (unresolvable ancestor ⇒ confidential); redaction/leak scan over the rendered public view; deny-by-default. Outcome `RecheckVerdict` (ADR-0003/0004). |
| L2 Human gate | C6 | Curator approval mandatory; the only promote-to-live path (brief §11). |
| L3 Public projection split | C3→C4 | Audit-only provenance (`origin_ref`/`origin_version`) lives in a **sidecar** that **never serializes** to web/API; a test asserts it never appears in output (ADR-0002/0006). |
| L4 Build-time invariant | C4 | `boundary === "public"` asserted for **every** emitted page/JSON/`.md`; **fails the build** otherwise (ADR-0006). |
| L5 Frozen static artifact | C5 | The deployed set is files only — **no live code path from a public request back into any internal/upstream store** (ADR-0001/0006). |

The load-bearing structural claim: even if every earlier layer were misconfigured, **C5 cannot reach inward** — it
is a frozen vetted file set on a CDN. The public surface is safe *by the shape of the system*, not only by checks.

## Build & deploy flow

1. Core imports candidates (pull), runs the re-check, presents findings to the curator in C6.
2. On approval, core assigns the immutable `(slug, semver)` + content-digest and writes the public projection into
   C3 (ADR-0005). Audit-only fields go to the sidecar.
3. The `SiteAndApiSinkAdapter` (C4) triggers `astro build` → `dist/` (HTML + `.json` + `.md` + `index.json`).
   The build runs L4 and the public-projection test; a failure aborts the deploy.
4. `dist/` is deployed to the CDN as C5. Unpublish/redact re-runs the build to emit **410 Gone** tombstones and
   purge edge caches.

Rebuild trigger mechanism and CDN purge bound are open: TODO(open-question: rebuild-trigger), TODO(open-question:
cdn-purge-bound) — see [../01-decisions/ADR-0006-web-stack.md](../01-decisions/ADR-0006-web-stack.md).

## Independence & cross-product boundaries

- CAW-02 and CAW-03 are **separate products**; CAW-04 reaches them only through C2 source adapters, by
  id/URI/version reference — never a shared store/registry/runtime (brief §1).
- CAW-04 keeps its **own copy** of everything it publishes (C3); upstream retraction is handled via the
  unpublish/tombstone path, not a live link (ADR-0004 open question on revocation).

## Open questions

- TODO(open-question: rebuild-trigger) — how C4 is triggered on approve/update/unpublish.
- TODO(open-question: cdn-purge-bound) — time-to-purge guarantee for edge-cached public artifacts on unpublish/redact.
- TODO(open-question: import-pull-vs-push) — pull-only vs upstream push (affects C2).
- TODO(open-question: fan-in-dedup) — dedup/precedence when CAW-02 and CAW-03 surface the same logical item.
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks

- Scaffold the hexagonal core (C1) with the two ports before any concrete adapter.
- Wire L3 (sidecar split), L4 (`boundary === "public"` assert), and the public-projection test into CI as
  blocking gates — these are the structural backstops, not optional lint.
- Keep C5 a pure static deploy target; any proposal to add a runtime endpoint reopens ADR-0001 Option C.
- Module ownership and service signatures: see [component-boundaries.md](./component-boundaries.md).
