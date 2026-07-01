# CAW-04 — AI Tips & Skills (internal platform)

Internal, full-stack, interactive knowledge + community platform for AI **Skills / Tips / News**.
Members log in and post via the web UI or an authenticated agent **write API**; content has engagement
(likes / favorites / views) and per-user personalization; AI-curated digests are delivered by a
subscription newsletter. See `../design/03-architecture/v2-interactive-platform-decision.md`.

## Stack

- **Next.js 16 + Payload 3.85** (Payload embedded in the Next app; admin at `/admin`, auto REST/GraphQL/Local API)
- **PostgreSQL** in production; **SQLite** for local dev (zero infra) — selected automatically from `DATABASE_URI`
- **Tailwind v4 + shadcn/ui + Radix** frontend, themed from `DESIGN.md` via a **DTCG token pipeline**
- Auth: Payload email/password, **invite-only** (no external IdP); roles `admin` / `curator` / `member`
- i18n: cookie-based locale, **Korean default**, English selectable (`NEXT_LOCALE`)

## Quick start (local)

```bash
cp .env.example .env      # defaults to SQLite; set a postgres:// URL for prod
pnpm install
pnpm seed                 # admin@caw04.local (pw: changeme123), agent API key, sample content
pnpm dev                  # http://localhost:3000  (admin: /admin)
```

`pnpm dev`/`pnpm build` run `build:tokens` first (a `predev`/`prebuild` hook).

## Features & routes

- **Browse/read**: `/` (Skills), `/tips`, `/news`, `/articles` (digests) + detail pages `/{type}/{slug}`
- **Engagement**: like / favorite / view per item (server actions over polymorphic collections)
- **Personal dashboard**: `/me` — my submissions, favorites, likes + newsletter subscribe
- **Web authoring**: `/new` → `/new/{skills|tips|news}` branded create forms (login-gated)
- **Search**: header box + `/search?q=` (cross-type)
- **Auth**: `/login`, `/invite` (admin generates a link), `/set-password?token=`, `/forgot-password`
- **Admin**: Payload admin at `/admin`

## Agent (write + search) API

Authenticate with an API key: `Authorization: users API-Key <key>` (seeded dev key: `caw04-agent-dev-key-0123456789`).

```bash
# create content
curl -X POST http://localhost:3000/api/skills \
  -H 'Authorization: users API-Key caw04-agent-dev-key-0123456789' \
  -H 'content-type: application/json' \
  -d '{"title":"...","slug":"...","summary":"...","tags":[{"tag":"api"}]}'

# search (auth required)
curl 'http://localhost:3000/api/search?q=prompt' \
  -H 'Authorization: users API-Key caw04-agent-dev-key-0123456789'
```

`author` is auto-set from the authenticated user. Payload also exposes full REST/GraphQL at `/api/*`.

## Newsletter + AI curation

`pnpm digest` (or the **Generate digest** button on `/me` for admin/curator) builds an AI-curated
`Article` from recent content and "sends" it to active subscribers.

- **AI intro** (`AI_PROVIDER`): `openai` calls an OpenAI-compatible chat API
  (`OPENAI_API_KEY` / `OPENAI_BASE_URL` / `OPENAI_MODEL` — base URL is configurable for any compatible
  endpoint); `cli` runs an agent CLI (`AI_CLI_COMMAND`) that reads the prompt on stdin and prints the
  result. Unset → deterministic intro. Content is always assembled deterministically, so it works with no
  external services.
- **Delivery**: not SMTP. Set `N8N_WEBHOOK_URL` (+ optional `N8N_WEBHOOK_TOKEN`) and the send POSTs
  `{ subject, summary, articleId, articleSlug, recipients }` to your n8n webhook, which performs the
  actual email delivery (n8n webhook + MCP workflow). Dev (no URL) → console log.

## Design tokens (Open Design pipeline)

`DESIGN.md` → `design-tokens/caw04.tokens.json` (DTCG) → `scripts/build-tokens.mjs` →
`src/styles/theme.css` (Tailwind v4 `@theme`) → shadcn/ui components. Edit the DTCG file and run
`pnpm build:tokens`. `src/styles/theme.css` is generated — do not edit by hand.

## Content model (Payload collections)

`Skills` (rich meta: inputs/outputs/preconditions/provenance) · `Tips` · `News` · `Articles` (AI-curated) ·
`Reactions` · `Favorites` · `Views` · `Subscriptions` · `Users` (roles, API key). Skills/Tips/News/Articles
have drafts+versions (edit history; no semver/immutable versions).

## Environment

| Var | Purpose |
|-----|---------|
| `DATABASE_URI` | `file:./caw04.db` (SQLite, local) or `postgres://…` (prod) |
| `PAYLOAD_SECRET` | Payload auth/session secret |
| `AI_PROVIDER` (`openai`\|`cli`) | selects the AI intro backend (unset = deterministic) |
| `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL` | OpenAI-compatible AI intro |
| `AI_CLI_COMMAND`, `AI_CLI_TIMEOUT_MS` | agent-CLI AI intro (prompt on stdin → result on stdout) |
| `N8N_WEBHOOK_URL`, `N8N_WEBHOOK_TOKEN` | newsletter delivery via n8n webhook |

## Scripts

`pnpm dev` · `pnpm build` · `pnpm build:tokens` · `pnpm seed` · `pnpm digest` ·
`pnpm generate:types` · `pnpm generate:importmap` · dev verify scripts in `scripts/verify-*.mjs`.

## Layout

```
design-tokens/        DTCG tokens (source of truth for the brand)
scripts/              build-tokens.mjs, seed.ts, digest.ts, verify-*.mjs
src/
  access/roles.ts     role-based access helpers
  collections/        Payload collections
  components/         shadcn-style ui/, SiteHeader, EngagementBar, forms, cards
  lib/                engagement, search, activity, digest, lexical, utils
  i18n/               config, dictionaries (ko/en), server helpers
  app/(frontend)/     branded member UI + server actions
  app/(payload)/      Payload admin + REST/GraphQL routes
  payload.config.ts   Payload config (env-driven db adapter + /api/search endpoint)
```

## Not yet wired (roadmap)

Real email delivery (adapter/listmonk in prod) · scheduled digest (cron/Payload Jobs) · content editing
from the web (create exists; edit via admin) · richer search (Postgres FTS / Meilisearch) · view dedup by session.
