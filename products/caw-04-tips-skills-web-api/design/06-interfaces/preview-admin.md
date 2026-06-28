# Preview / Admin — internal curator publish-gate surface (no public write)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(set on review)
- **Related:**
  - [./website.md](./website.md) (the public site this surface promotes content to)
  - [./rest-api.md](./rest-api.md) (the public API co-published on approve)
  - [../01-decisions/ADR-0001-product-surface-and-delivery.md](../01-decisions/ADR-0001-product-surface-and-delivery.md) (three surfaces; this is surface #3)
  - [../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md) (the gate this surface drives)
  - [../01-decisions/ADR-0004-import-and-ports.md](../01-decisions/ADR-0004-import-and-ports.md) (ContentSource ports; core re-check)
  - [../01-decisions/ADR-0005-storage-and-versioning.md](../01-decisions/ADR-0005-storage-and-versioning.md) (writes to git on approve; tombstones)
  - [../01-decisions/ADR-0002-content-model.md](../01-decisions/ADR-0002-content-model.md) (public projection vs audit sidecar)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

Describes the **internal preview/admin** surface: the curator-only (Jimmy) workspace where imported candidate
artifacts are reviewed against gate findings, redacted if needed, and **approved** — the *only* path that promotes a
gate-passing candidate to the public website ([website.md](./website.md)) and API ([rest-api.md](./rest-api.md)). It
elaborates [ADR-0001](../01-decisions/ADR-0001-product-surface-and-delivery.md) surface #3 and the human step of
[ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md). It does NOT re-decide the gate policy
([ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md)) or import mechanics
([ADR-0004](../01-decisions/ADR-0004-import-and-ports.md)).

## Hard boundaries of this surface

- **Internal only.** Never public; never on the public CDN/host. TODO(open-question: hosting + auth mechanism — e.g.
  local-only tool vs internally-authenticated app; do not invent).
- **No public write path.** This surface writes to CAW-04's git repo and triggers a rebuild; the public surfaces
  remain read-only static artifacts. There is no runtime write endpoint reachable from the public internet.
- **Sees more, publishes less.** It may display **audit-only** fields (`origin_ref`/`origin_version` sidecar,
  full provenance, raw gate findings) for the curator's decision — but those fields are stripped by the **public
  projection** ([ADR-0002](../01-decisions/ADR-0002-content-model.md)) and **never** reach the website/API. The
  preview render and the public render are deliberately different projections of the same candidate.
- **Approval is mandatory and per-artifact.** Automatic generation/import is *proposal* generation only; nothing goes
  live without an explicit human approve (brief §11, [ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md)).
  Deny-by-default: absence of approval = not published.

## Where it sits in the pipeline

```
ContentSource adapters (CAW-02, CAW-03, …)        [ADR-0004]
        │  import candidate
        ▼
CORE public-safe RE-CHECK  (NOT in adapters; deny-by-default; upstream claims = evidence only)  [ADR-0004/0003]
        │  candidate + gate findings (pass / fail / needs-redaction)
        ▼
┌──────────────  PREVIEW / ADMIN  (this surface, internal)  ──────────────┐
│  review · diff · redact · decide                                         │
│         approve ─┐            reject / hold ──► stays in queue (not live)│
└──────────────────┼──────────────────────────────────────────────────── ┘
                   ▼
   write to git (ADR-0005): src/content/{type}/<slug>/<semver>.md(x) + sidecar
                   ▼
   SiteAndApiSinkAdapter → astro build (boundary===public assert) → CDN   [ADR-0006/0007]
```

The re-check is a **core stage**, upstream of this surface — the curator reviews its *findings*, never re-runs trust
on upstream boundary claims (those are evidence only, [ADR-0004](../01-decisions/ADR-0004-import-and-ports.md)).

## Review queue

| Column | Meaning |
|---|---|
| candidate | `{type}/{slug}` proposed version (semver to be assigned/confirmed) |
| source | `source_product` + `source_ref` (provenance reference) |
| gate result | `pass` / `fail` / `needs-redaction` from the core re-check |
| diff | vs currently-published latest (new artifact / new version / boundary change) |
| status | `pending` / `held` / `approved` / `rejected` / `redacted` |

States are deny-by-default: only an artifact in `approved` is ever written to git and published.

## Candidate detail view

For one candidate the curator sees, side by side:

1. **Public preview** — exactly what the website/API would emit (the public projection; runs the same
   `boundary===public` assertion and the no-sidecar test as the real build, so the preview cannot show more than the
   public surface would). This is the "what readers/agents get" pane.
2. **Audit pane (internal only)** — full provenance incl. sidecar `origin_ref`/`origin_version`, the raw gate
   findings, and any flagged spans the re-check wants redacted. Never serialized to a public projection.
3. **Diff pane** — against the current published latest: changed fields, body diff, and whether this is a new
   artifact, a new version, or a **boundary change** (which routes to deprecate/unpublish/redact, not edit).

## Curator actions

| Action | Effect | Downstream |
|---|---|---|
| **Approve & publish** | assign/confirm `semver`; write `<slug>/<semver>.md(x)` + sidecar to git | triggers rebuild → live on website + API |
| **Redact then approve** | apply redactions to the public projection; re-run re-check; then approve | as above; raw stays internal only |
| **Hold** | keep in queue with a note; not published | no git write |
| **Reject** | mark rejected with reason | no git write; deny-by-default holds |
| **Unpublish / redact (live item)** | write a **tombstone** ([ADR-0005](../01-decisions/ADR-0005-storage-and-versioning.md)) | rebuild → 410 Gone on website + API; excluded from index/sitemap/search |

Every action is **append-only audited**: who (curator), what (candidate + version + digest), when (timestamp), why
(reason / gate findings snapshot). Published `(slug, semver)` is frozen forever — corrections are a **new version**,
never an in-place edit ([ADR-0005](../01-decisions/ADR-0005-storage-and-versioning.md)).

## Gate enforcement is layered (this surface is one of four)

The curator approval is the **human** gate. It does not replace the machine gates; the public-safe property holds even
if the human errs:

| Layer | Enforced where | ADR |
|---|---|---|
| Import re-check (core, deny-by-default) | core stage before preview | [ADR-0004](../01-decisions/ADR-0004-import-and-ports.md) |
| **Curator approval (this surface)** | preview/admin | [ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md) |
| Build-time `boundary===public` assertion | astro build | [ADR-0006](../01-decisions/ADR-0006-web-stack.md) |
| Emit-time validator + no-sidecar test | every API/page emit | [ADR-0007](../01-decisions/ADR-0007-api-design.md) / [ADR-0002](../01-decisions/ADR-0002-content-model.md) |

If an approved candidate somehow carries a non-public boundary or leaks a sidecar field, the build/emit layers **fail
closed** — the public surface stays public-safe by construction.

## Rebuild / deploy trigger

Approve/unpublish/redact emit a **publish event** consumed by the `SiteAndApiSinkAdapter` to rebuild + redeploy the
static artifact. TODO(open-question: trigger mechanism — webhook vs CI-on-git-push vs scheduled; shared with
[ADR-0006](../01-decisions/ADR-0006-web-stack.md)). TODO(open-question: CDN purge time-to-purge bound on
unpublish/redact — shared with [website.md](./website.md)/[rest-api.md](./rest-api.md)).

## Open Questions

See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md):
- TODO(open-question: preview/admin hosting + authentication model — internal-only; do not invent).
- TODO(open-question: rebuild+deploy trigger mechanism on approve/update/unpublish).
- TODO(open-question: audit log storage + retention for curator actions).
- TODO(open-question: who may act as curator beyond Jimmy; single vs multi-approver workflow).
- TODO(open-question: redaction UX — span-level edits vs whole-field; how re-check re-runs post-redaction).

## Implications for runbooks

- Build an internal-only review app/tool over the candidate queue; never deploy it to the public host.
- Render two projections per candidate: public preview (same assertions as the real build) + internal audit pane.
- Implement approve → assign semver → write `<slug>/<semver>.md(x)` + sidecar → emit publish event.
- Implement unpublish/redact → tombstone write → rebuild → 410 on both public surfaces.
- Append-only audit log of every curator action (who/what/when/why); deny-by-default for everything not approved.
