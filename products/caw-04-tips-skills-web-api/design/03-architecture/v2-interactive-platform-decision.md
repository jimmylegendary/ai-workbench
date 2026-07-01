# CAW-04 v2 — Internal Interactive Platform (architecture decision)

- **Status:** decided (core), open items noted
- **Owner:** Jimmy
- **Last-reviewed:** 2026-07-02
- **Supersedes (scope):** the public-safe **static** framing in [../01-decisions/ADR-0006-web-stack.md](../01-decisions/ADR-0006-web-stack.md),
  [../06-interfaces/website.md](../06-interfaces/website.md), [../06-interfaces/rest-api.md](../06-interfaces/rest-api.md),
  [./tech-stack.md](./tech-stack.md), and the read-only/SSG parts of the top-level DESIGN.md. The DESIGN.md **visual
  system** (DTCG tokens, Tailwind v4, shadcn/ui + Radix) still applies.
- **Related:** [../02-research/oss-tool-survey-and-ui-base.md](../02-research/oss-tool-survey-and-ui-base.md) (v1/static survey — now historical)

## Scope change (2026-07-02)

CAW-04 is redefined from a **public-safe, read-only, static publisher** into an **INTERNAL, full-stack, interactive
knowledge + community platform**. It now requires a runtime + database + auth. The old "public-safe by construction /
SSG / no DB / read-only" property is **dropped**. Audience = internal org members only (auth-gated).

New capabilities (the NR1..NR12 rubric):
- Members log in and post **Skills / AI-usage Tips / AI News** via the web UI AND via an authenticated agent-skill **write API**.
- **Search via API** (server-side) + web search.
- Per-item **engagement**: view counts, likes, favorites/bookmarks.
- **Per-user personalization**: personal dashboard (my submissions, favorites, likes, activity).
- Later: **AI auto-generates** articles / curated "selections", delivered by **subscription email newsletters**.

## Tool survey outcome (24-agent live survey, verified)

No single OSS tool nails both axes at once — (A) typed knowledge base (typed kinds + write/search API) and
(B) community/engagement (likes/views/favorites + dashboards + newsletters):
- **Community platforms** (Discourse 11/12, NodeBB, Forem, HumHub, Flarum, Apache Answer) are strong on axis B but have a **flat post model** (NR4 typed content weak) and are not Tailwind/shadcn (NR11 weak; stack divergence).
- **Headless CMS / frameworks** (Payload, Strapi, Directus, Wagtail, Drupal) are strong on axis A + brand, but the community/engagement/newsletter layer is custom-build.
- **Drupal 11** uniquely covers all 12 natively via contrib, but at the cost of a heavy PHP stack + headless frontend anyway.
- **Discourse** scored highest overall but its core value is its OWN UI — which we must replace with a custom shadcn frontend to hit the brand + typed model, so its advantage evaporates. **Directus** is source-available (not OSS). **Ghost** members can't author (staff-only). **Outline** has no typed model/engagement.

Guiding principle: **the branded shadcn frontend is a constant** on every viable path; therefore adopt commodities
(auth, email send, search index), build the differentiators (typed model + agent API + AI curation), and avoid
two-system hybrids (SSO bridge + duplicated content model + split engagement data + double ops).

## Decision (core, settled)

| Axis | Decision |
|---|---|
| **Backbone** | **Payload 3 (TS-native)** embedded in Next.js — typed collections, auto REST/GraphQL/Local API, admin UI, native Jobs queue. Single JS/TS stack, consistent with the rest of ai-workbench. |
| **Frontend** | Next.js (App Router) + Tailwind v4 + shadcn/ui + Radix. DESIGN.md DTCG tokens -> Style Dictionary/Terrazzo -> `@theme`. Hosts member browse/read/author/dashboard/search. |
| **DB** | PostgreSQL (Payload Drizzle pg adapter). |
| **Auth** | Payload native email/password, **invite-only** signup (no external IdP). Roles: admin / curator / member. |
| **Content model** | **Rich metadata + edit history** (Payload Versions/Drafts). Keep Skill `inputs/outputs/preconditions/provenance`; **drop** semver + immutable pinned versions. |
| **Engagement** | Custom Payload collections + endpoints: `Reaction` (like), `Favorite`, `View`. Small, bounded build. |
| **Search** | Postgres FTS behind a custom API endpoint for v1; upgrade path to Meilisearch/Typesense. |
| **Newsletter** | Adopt **listmonk** (OSS, self-host, Postgres). AI job pushes digest campaigns; SMTP relay for delivery. |
| **AI automation** | Scheduled job (Payload Jobs/BullMQ) -> Claude -> create `Article`/selection + push listmonk campaign. |
| **Agent skill** | Thin client (SKILL.md/MCP or HTTP) authenticating with an API key against the write + search endpoints. |

## Content model (Payload collections)

- `Skill` — title, summary, body(rich text), tags[], inputs[], outputs[], preconditions[], provenance{source, validated, ...}, author(rel User), timestamps; drafts/versions on.
- `Tip` — title, summary, body, tags[], author, timestamps.
- `News` — title, summary, body/link, source, tags[], author, timestamps.
- `Article` — AI-generated curation/selection: title, body, curatedItems[] (rels to Skill/Tip/News), generatedBy, publishedAt, sentAsNewsletter.
- `Reaction` (user, item, kind=like), `Favorite` (user, item), `View` (item, count / event log + aggregate).
- `User` — Payload auth + role. `Subscription` — newsletter opt-in synced to listmonk.

## Layered architecture

```
[agent skill] --write/search-->  Next.js + Tailwind v4 + shadcn/Radix  <-- browse/author/dashboard [member]
                                              |  REST/GraphQL/Local API
                              Payload 3 (typed content + auth + write API + Jobs)
                                              |
                    Postgres(+FTS)   AI job (Claude -> Article)   listmonk (newsletter)
```

## Open items (to pin next)

1. **AI "article/selection" semantics** — cadence + shape (weekly digest of new/top items? topic roundups?). Shapes the Jobs pipeline + newsletter.
2. **Relationship to CAW-02/03** — is content authored only here, or also ingested from the internal substrate (the old "projection" model)?
3. **Search upgrade** — Postgres FTS sufficiency vs Meilisearch/Typesense.
4. **Email infra** — self-host Postal vs an external SMTP relay.

## Open Design pipeline (unchanged)

`DESIGN.md` tokens -> DTCG `*.tokens.json` -> Style Dictionary / Terrazzo -> Tailwind v4 `@theme` -> shadcn/ui + Radix components.
