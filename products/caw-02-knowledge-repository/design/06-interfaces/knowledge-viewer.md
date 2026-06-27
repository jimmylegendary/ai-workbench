# Knowledge Viewer — Optional Read-Only Browser

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: review date)
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md)
  - [../01-decisions/ADR-0001-product-surface-and-skill-interface.md](../01-decisions/ADR-0001-product-surface-and-skill-interface.md)
  - [./api-and-mcp.md](./api-and-mcp.md)
  - [./cli.md](./cli.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This doc specifies the **optional, secondary, read-only knowledge viewer** (brief §4, ADR-0001 §2). It lets Jimmy
and the team **browse** Source/Claim/Evidence/Note and their provenance edges, with **trust and boundary badges**.
It fixes what the viewer shows, what it must NOT do, and how it stays a non-leak surface by reusing the same
boundary-filtered read path as every other reader. It is **explicitly minimal**: rich editing is a non-goal (brief
§9). The viewer has **no write path** — all writes go through API/MCP/CLI ([api-and-mcp.md](./api-and-mcp.md),
[cli.md](./cli.md)).

## 1. Stance & non-goals
The viewer is the **last** surface to build (ADR-0001 build-order) and the lowest priority. It is a thin reader over
the core's read ops (`kr.search`, `kr.get`) — it issues no SQL, holds no business logic, and stores no state.

| In scope (v0) | Out of scope (non-goal) |
|---|---|
| Browse/search Source, Claim, Evidence, Note, Concept, Decision, OpenQuestion, signals | Creating/editing/deleting any entity |
| Render the provenance chain Source→Claim→Evidence→Note | A WYSIWYG note editor / rich text authoring |
| Trust badge (T0–T3 + contested) and boundary/visibility badges | Trust/boundary overrides from the UI |
| Filter by type, boundary, visibility, trust, concept | Approving agent submissions (review queue is a separate concern) |
| Show audit/provenance for an entity (read-only) | Triggering imports/exports |
| Deep-link to an entity by id | Bulk operations, dashboards, analytics |

Why read-only: the product's value is provenance integrity (brief §10). A write-capable UI would be a fourth surface
that could drift from the core guardrails; ADR-0001 keeps writes to the three generated adapters. The viewer staying
read-only means it **cannot** become a leak or a corruption path. TODO(open-question: should the viewer ever gain a
thin "propose" path for humans, or stay strictly read-only in v1? Brief §9 says read-only for now.)

## 2. Data source: the boundary-filtered read path
The viewer calls **only** `kr.search` and `kr.get` (via the API, [api-and-mcp.md §2](./api-and-mcp.md)). This is
load-bearing: the core applies **boundary and visibility filters before ranking** (ADR-0006), so the viewer can
only ever display what the viewing actor is cleared to see. The viewer does **not** read the markdown files, the
SQLite index, or `_events/` directly — that would bypass the filter and risk leaking confidential items
(ADR-0001 consequences).

```
viewer ──GET /v1/search, GET /v1/entities/{id}──▶ core (boundary+visibility filter) ──▶ derived index
         (read-only, actor-scoped, no other access)
```

The viewer authenticates as the **viewing actor** and inherits that actor's `kr:read` scope and clearance
(see [api-and-mcp.md §6](./api-and-mcp.md)). No special viewer privilege exists.

## 3. Views (minimal set)

| View | Shows | Backed by |
|---|---|---|
| **Search** | query box + first-class filters (type, boundary, visibility, trust, concept); result rows with badges | `kr.search` |
| **Entity detail** | one entity's frontmatter fields + rendered markdown body + its edges | `kr.get` |
| **Provenance chain** | the Source→Claim→Evidence→Note graph for the focused entity, edges typed | `kr.get` (hydrated chain) |
| **Audit (read-only)** | the entity's append-only history + `supersedes` lineage; "chain ok/tampered" from `verify_audit` | `kr.get`, `kr.verify_audit` |

The provenance chain view is the heart of the viewer: it makes the brief's invariant **visible** — a Claim shows its
attached Evidence (with the concrete artifact ref), and a Note shows the Claims it cites, **clearly marked as
generated and not evidence**.

## 4. Badges (the trust/boundary surface)
Badges are the one piece of UI semantics the viewer must get exactly right, or it misrepresents trust.

| Badge | Values | Source field | Rendering rule |
|---|---|---|---|
| Trust | T0 / T1 / T2 / T3 / **contested** | derived trust ladder (ADR-0004) | color ladder; `contested` always visually distinct |
| Boundary | public / internal / confidential | `boundary` (ADR-0004) | confidential = strongest visual marker |
| Visibility | team / private | `visibility` (ADR-0004) | private items marked distinctly |
| Authoring | human / agent | actor kind | agent-authored shows the T2 cap note (ADR-0004) |
| Evidence flag | "Evidence" vs "Generated note (not evidence)" | entity type + `generated` | a Note is NEVER badged as evidence |

The viewer renders trust/boundary **only from the fields the core returns**; it never computes or overrides them. If
the core marks an item `contested` or AI-capped at T2, the viewer shows exactly that.

## 5. What the viewer must NOT do (guardrails as UI constraints)
- **No write controls.** No create/edit/delete/approve buttons. Corrections happen via CLI/MCP/API `supersedes`.
- **No direct store access.** Never read markdown/SQLite/`_events/` directly; always go through the filtered read
  path so boundary/visibility hold (§2).
- **No badge overrides.** Trust and boundary are display-only.
- **No de-redaction.** The viewer shows only what `kr.search`/`kr.get` return for the actor; it adds no field.
- **No cross-product calls.** CAW-01/05/03 are separate products reached only via import/export through the core,
  never by the viewer.

## 6. Tech posture (minimal)
A small read-only web app (TODO(open-question: framework — keep deliberately minimal; SSR over the read API vs a tiny
SPA)). No database of its own, no auth system of its own beyond carrying the actor's API credential. It should be
deletable without affecting the product — it is genuinely optional (brief §4 "secondary surface").

## Open Questions
- TODO(open-question: strictly read-only forever vs a future thin human "propose" path; brief §9 says read-only).
- TODO(open-question: viewer framework / deployment — keep minimal; SSR vs tiny SPA).
- TODO(open-question: how the audit view presents hash-chain verification to a non-technical reader).
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks
- **RB (viewer):** build last; read-only browse over `kr.search`/`kr.get` only; render Source/Claim/Evidence/Note
  distinctly with trust + boundary + visibility badges; provenance-chain view; no write path, no direct store
  access; deletable without affecting the core.
- **RB (negative tests):** assert the viewer cannot surface a confidential item to an under-cleared actor (it uses
  the same boundary-filtered read path), and that a Note is never displayed as Evidence.
