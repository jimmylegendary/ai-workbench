# Running / Serving CAW-01

How to run the web app — for a quick preview, for real (with Supabase auth), and
to deploy. (This is the web app only; the Python simulation engine is a separate
sibling service and is currently stubbed — see `design/`.)

## Prereqs

- **Node 20+** and **pnpm 9** (`npm i -g pnpm@9` if missing — corepack also works).
- From the monorepo root `caw01-workbench/`: `pnpm install`.

## 1. Quick preview (no Supabase, no login)

The fastest way to look at the UI. `PREVIEW_NO_AUTH=1` bypasses the auth gate so
you don't need a Supabase project; dummy public env satisfies the client.

```bash
cd caw01-workbench/apps/web
export NEXT_PUBLIC_SUPABASE_URL="https://example.supabase.co"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="dummy"
export SUPABASE_SERVICE_ROLE_KEY="dummy"
export PREVIEW_NO_AUTH=1            # dev-only escape hatch (OFF by default)
pnpm exec next dev -H 0.0.0.0 -p 3100
```

Open `http://localhost:3100` (or, on this host, the tailscale IP
`http://100.103.147.31:3100`). `-H 0.0.0.0` makes it reachable over the network/
tailscale; drop it for localhost-only. **Never set `PREVIEW_NO_AUTH` in a real
deploy.**

## 2. Real run (Supabase auth + persisted data)

1. Create a **Supabase** project → copy its URL + anon key + service-role key.
2. `cp apps/web/.env.example apps/web/.env.local` and fill:
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...        # browser, RLS-guarded
   SUPABASE_SERVICE_ROLE_KEY=...            # server only — never exposed
   ENGINE_BASE_URL=http://localhost:8000    # Python engine (optional; stubbed)
   ```
3. Apply the schema + RLS (Supabase CLI, linked to your project):
   ```bash
   cd packages/db && supabase db push       # applies migrations/0001_init.sql + 0002_results.sql
   ```
4. Run it: `pnpm --filter @caw/web dev` → `http://localhost:3000`. Sign in with the
   magic link (email OTP). Without `PREVIEW_NO_AUTH`, the middleware gates all
   `(app)` routes to `/login`.

## 3. AI report (Sim Result page)

The "Generate report" button picks a backend by env (server-side only). Pick one:

```
# OpenAI-compatible (OpenAI, Azure, local vLLM, OpenRouter, …)
AI_BACKEND=openai
OPENAI_API_KEY=...
OPENAI_BASEURL=https://api.openai.com/v1     # or your gateway
OPENAI_MODEL=gpt-5.5                          # optional

# or a local CLI on the server's PATH:
AI_BACKEND=claude-cli        # spawns `claude -p <prompt>`
AI_BACKEND=openclaw-cli      # spawns `openclaw ...`
```

If none is configured it falls back to a deterministic templated report, so the
page always works.

## 4. Build / serve for production

```bash
pnpm --filter @caw/web build
pnpm --filter @caw/web start     # next start, default :3000
```

**Deploy:** the web app is a standard Next.js 15 app → deploy `apps/web` to
**Vercel** (or any Node host); set the env vars above in the host. Use **Supabase
(hosted)** for Postgres + Auth (run the migrations against it). The simulation
**engine** is a separate Python service reached via `ENGINE_BASE_URL` (a port/
adapter; not required for the UI to run — runs/results are synthesized until it's
wired).

## Notes

- Dev hot-reload may warn `ENOSPC ... file watchers` on some hosts — that only
  affects auto-reload, not serving; raise `fs.inotify.max_user_watches` to fix, or
  just restart `next dev` after edits.
- `@caw/core` is consumed as TS source; `next.config.ts` maps its `.js` ESM
  specifiers to `.ts` (`extensionAlias`) — no build step needed for it.
