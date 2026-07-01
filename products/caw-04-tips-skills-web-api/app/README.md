# CAW-04 — AI Tips & Skills (internal platform)

Internal, full-stack, interactive knowledge + community platform for AI **Skills / Tips / News**.
Members log in and post via the web UI or an authenticated agent-skill **write API**; content has
engagement (likes/favorites/views) and per-user personalization; AI-curated digests are delivered by
subscription newsletter. See `../design/03-architecture/v2-interactive-platform-decision.md`.

## Stack

- **Next.js 16 + Payload 3.85** (Payload embedded in the Next app; admin at `/admin`, auto REST/GraphQL/Local API)
- **PostgreSQL** in production; **SQLite** for local dev (zero infra) — selected automatically from `DATABASE_URI`
- **Tailwind v4 + shadcn/ui + Radix** frontend, themed from `DESIGN.md` via a **DTCG token pipeline**
- Auth: Payload email/password, **invite-only** (no external IdP); roles `admin` / `curator` / `member`

## Quick start (local)

```bash
cp .env.example .env      # defaults to SQLite; set a postgres:// URL for prod
pnpm install
pnpm seed                 # creates admin@caw04.local (pw: changeme123) + sample skills
pnpm dev                  # http://localhost:3000  (admin: /admin)
```

`pnpm dev`/`pnpm build` run `build:tokens` first (a `predev`/`prebuild` hook).

## Design tokens (Open Design pipeline)

`DESIGN.md` → `design-tokens/caw04.tokens.json` (DTCG) → `scripts/build-tokens.mjs` →
`src/styles/theme.css` (Tailwind v4 `@theme`) → shadcn/ui components.
Edit the DTCG file and run `pnpm build:tokens` to re-theme. `src/styles/theme.css` is generated — do not edit by hand.

## Content model (Payload collections)

`Skills` (rich meta: inputs/outputs/preconditions/provenance) · `Tips` · `News` · `Articles` (AI-curated) ·
`Reactions` · `Favorites` · `Views` · `Users` (roles). Skills/Tips/News/Articles have drafts+versions
(edit history; no semver/immutable versions).

## Database

`DATABASE_URI=file:./caw04.db` → SQLite (local). `DATABASE_URI=postgres://…` → Postgres (prod).
Both adapters are installed; `src/payload.config.ts` picks by URI scheme. A `docker-compose.yml` is
included if you prefer a local Postgres.

## Layout

```
design-tokens/        DTCG tokens (source of truth for the brand)
scripts/              build-tokens.mjs (token pipeline), seed.ts
src/
  access/roles.ts     role-based access helpers
  collections/        Payload collections
  components/ui/       shadcn-style Button/Badge/Card
  app/(frontend)/     branded member UI (Tailwind v4)
  app/(payload)/      Payload admin + REST/GraphQL routes
  payload.config.ts   Payload config (env-driven db adapter)
```

## Status (scaffold)

Working: content model, admin, auto APIs, DTCG→Tailwind theming, one branded Skills screen.
Next: engagement endpoints (like/favorite/view), per-user dashboard, search API, agent write-API auth,
listmonk newsletter + AI-curation jobs. See the architecture decision doc for the roadmap.
