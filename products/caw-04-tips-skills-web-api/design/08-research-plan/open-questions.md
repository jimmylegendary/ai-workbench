# Open Questions — aggregated tracker

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:** [./research-plan.md](./research-plan.md), [./validation-and-tests.md](./validation-and-tests.md), [../01-decisions/](../01-decisions/), [../02-research/](../02-research/)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

This is the **single aggregated tracker** for every open question raised across CAW-04's research notes
(`02-research/`) and decision records (`01-decisions/`). Each row is deduped (the same question appearing in a
research doc and its ADR is merged into one row, citing both). It does NOT resolve the questions — it gives each a
stable `OQ-id`, an owner doc, a resolve-by **phase** (build phases per [research-plan.md](./research-plan.md);
no dates invented), and a status. When a question is answered, update its ADR/research doc, set status `resolved`,
and link the resolving artifact.

Status values: `open` · `in-research` (has a track in research-plan.md) · `resolved` · `deferred`.
Phases: `P0`–`P5` (see research-plan.md). Resolve-by uses phases, not dates — per DOC-CONVENTIONS, do not invent dates.

## Tracker

| id | question | owning ADR / doc | research track | resolve-by | status |
|----|----------|------------------|----------------|-----------|--------|
| OQ-01 | Do CAW-02/CAW-03 expose a stable, versioned `origin_ref` to pin, or only mutable handles? | ADR-0002; research/content-model-and-metadata | T1 | P2 | in-research |
| OQ-02 | Is JSON Schema the family-wide contract language for `inputs/outputs`, or align to MCP tool schema? | ADR-0002; research/content-model-and-metadata | — | P1 | open |
| OQ-03 | Minimum viable `SafetyBoundary.classification` enum — is a 3-level scale enough, or per-field sensitivity labels? | ADR-0002; research/content-model-and-metadata | — | P1 | open |
| OQ-04 | Does `content_hash`/`Version.content_hash` cover sidecar/audit fields, or only the public projection? | ADR-0002, ADR-0005; research/content-model-and-metadata, research/versioning-and-immutability | T9 | P1 | in-research |
| OQ-05 | License policy — single default SPDX vs per-artifact, and inheritance from upstream `Source`? | ADR-0002, ADR-0007; research/content-model-and-metadata, research/skills-distribution-and-api-resources | — | P3 | open |
| OQ-06 | Exact public-safe re-check rule set + where thresholds live in `profiles.recheck`; alignment with upstream boundary policy without shared substrate? | ADR-0003, ADR-0004; research/import-and-ports, research/publishing-policy-and-public-safe | T2 | P2 | in-research |
| OQ-07 | Redaction engine — Microsoft Presidio (NLP recall) vs lighter regex+denylist core? | ADR-0003; research/publishing-policy-and-public-safe | T2 | P2 | in-research |
| OQ-08 | Where does CAW-04's codename/fab/customer pattern list live and how is it kept doctrinally aligned? | ADR-0003; research/publishing-policy-and-public-safe | T2 | P2 | in-research |
| OQ-09 | Does the import bundle ship the full provenance ancestor graph for local `boundary_eff` recompute? | ADR-0003; research/publishing-policy-and-public-safe | T1 | P2 | in-research |
| OQ-10 | Signature/attestation scheme on imported bundles — DSSE / in-toto / minisign? | ADR-0003, ADR-0004; research/publishing-policy-and-public-safe, research/import-and-ports | T5 | P2 | in-research |
| OQ-11 | Re-validation cadence — when upstream reclassifies a source to confidential, how does CAW-04 learn and re-run the gate? | ADR-0003, ADR-0004; research/publishing-policy-and-public-safe, research/import-and-ports | T3 | P4 | in-research |
| OQ-12 | Cache/CDN purge guarantee on unpublish/redact — bound on time-to-purge after the action? | ADR-0003, ADR-0006; research/publishing-policy-and-public-safe, research/web-and-api-stack | T4 | P4 | in-research |
| OQ-13 | Distinct provenance kinds for already-public external sources (cited papers) vs internal-origin public-safe? | ADR-0003; research/publishing-policy-and-public-safe | T1 | P2 | open |
| OQ-14 | Dedup/precedence + provenance-preserving merge when both source adapters surface the same logical item (fan-in)? | ADR-0004; research/import-and-ports | T8 | P2 | in-research |
| OQ-15 | Import direction — pull (CAW-04 polls `discover()`) vs push (upstream notifies)? | ADR-0004; research/import-and-ports | T3 | P2 | open |
| OQ-16 | Adapter discovery mechanism — built-in registry only vs entry-point/manifest plugin — and adapter↔port SemVer/compat policy? | ADR-0004; research/import-and-ports | — | P5 | open |
| OQ-17 | `unpublish` semantics for immutable addressable versions — tombstone vs hard-removal; how the API answers a withdrawn version? | ADR-0004, ADR-0005; research/import-and-ports, research/versioning-and-immutability | T4 | P4 | open |
| OQ-18 | Exact canonical serialization spec — which metadata fields are inside the hashed envelope vs sidecar? | ADR-0005; research/versioning-and-immutability | T9 | P1 | in-research |
| OQ-19 | Who/what assigns the semver bump — curator only vs diff-assisted proposal Jimmy approves? | ADR-0005; research/versioning-and-immutability | — | P1 | open |
| OQ-20 | On redact, purge public bytes immediately vs retain encrypted internally for audit (legal/retention)? | ADR-0005; research/versioning-and-immutability | T4 | P4 | open |
| OQ-21 | Digest algorithm + prefix convention (`sha256:` vs multihash); expose a digest-pin URL alias? | ADR-0005; research/versioning-and-immutability | T9 | P1 | in-research |
| OQ-22 | Does an item slug ever change (rename) — 301 from old slug vs new item + provenance link? | ADR-0005; research/versioning-and-immutability | — | P4 | open |
| OQ-23 | Sitemap/index behaviour for deprecated-but-served versions — listed, hidden, or flagged? | ADR-0005; research/versioning-and-immutability | — | P4 | open |
| OQ-24 | Content negotiation — `Accept` header (canonical) + `.md`/`.json` suffix; CDN `Vary: Accept` behaviour? | ADR-0001, ADR-0007; research/web-and-api-stack, research/versioning-and-immutability | T6 | P3 | in-research |
| OQ-25 | Search — prebuilt client-side index (Pagefind) sufficient for v1, or server-side search needed? | ADR-0001, ADR-0006; research/web-and-api-stack | T7 | P5 | deferred |
| OQ-26 | Rebuild+deploy trigger mechanism for the `PublishSinkAdapter` (webhook vs CI-on-git-push vs other)? | ADR-0001, ADR-0006; research/web-and-api-stack | — | P3 | open |
| OQ-27 | Does Starlight's doc-centric layout/versioning fit the Tip/Skill/Workflow/Playbook entity model? | ADR-0006; research/web-and-api-stack | — | P3 | open |
| OQ-28 | Adopt the open Agent Skills `SKILL.md` spec verbatim vs a CAW-04 superset profile (drift risk)? | ADR-0007; research/skills-distribution-and-api-resources | — | P3 | open |
| OQ-29 | `published_at`/`updated_at` timestamp + timezone policy (do not invent)? | ADR-0007; research/skills-distribution-and-api-resources | — | P3 | open |
| OQ-30 | Does `total_count` stay cheap as the catalog grows, or drop it for pure cursor pagination? | ADR-0007; research/skills-distribution-and-api-resources | — | P3 | open |
| OQ-31 | MCP Registry listing — in v1 scope vs a later PublishSinkAdapter stub only? | ADR-0007; research/skills-distribution-and-api-resources | — | P5 | deferred |
| OQ-32 | `references/`/`assets/` size limits + secret/virus scan before bundling (public-safe)? | ADR-0007; research/skills-distribution-and-api-resources | T2 | P2 | open |
| OQ-33 | Workflow step refs across versions — pin exact `id@version` vs allow range/`latest`? | ADR-0007; research/skills-distribution-and-api-resources | — | P3 | open |
| OQ-34 | Publish an OpenAPI/JSON-Schema description of the read API at a static path? | ADR-0007; research/web-and-api-stack | — | P3 | open |
| OQ-35 | API path-prefix deprecation policy when `/api/v1` is superseded? | ADR-0001; research/web-and-api-stack | — | P5 | open |

## Notes on dedup

- The provenance/`origin_ref` question appears in both ADR-0002 and the content-model research note → **OQ-01**.
- Redaction-engine, codename pattern-list, ancestor-graph, signature, re-validation, and CDN-purge questions each
  appear in both ADR-0003 and the publishing-policy research note (some also in import-and-ports) → merged to
  **OQ-06..OQ-13** with all owning docs cited.
- Canonical-serialization, semver-bump authority, redact-retention, digest-algo, slug-rename, and
  deprecated-index questions appear in both ADR-0005 and the versioning research note → **OQ-18..OQ-23**.
- Content-negotiation, search, and rebuild-trigger appear across ADR-0001/0006/0007 and the web/api research note
  → **OQ-24..OQ-26**.

## Load-bearing subset (public-safe critical)

These must be resolved before the public path goes live; they directly back the tests in
[validation-and-tests.md](./validation-and-tests.md): **OQ-06, OQ-07, OQ-08, OQ-09, OQ-10, OQ-11, OQ-12, OQ-13,
OQ-14, OQ-17, OQ-20, OQ-32**. The rest are quality/ergonomics and may resolve in their phase.
