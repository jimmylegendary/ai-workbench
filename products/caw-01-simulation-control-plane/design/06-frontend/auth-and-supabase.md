# Auth & Supabase (schema · RLS · data boundary) — CAW-01

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [../01-decisions/ADR-0008-auth-and-data-supabase.md](../01-decisions/ADR-0008-auth-and-data-supabase.md), [app-architecture-mvvm.md](./app-architecture-mvvm.md), [../04-data-layer/data-model.md](../04-data-layer/data-model.md), [../04-data-layer/work-tree-and-versioning.md](../04-data-layer/work-tree-and-versioning.md), [../07-backend-api/persistence-and-storage-api.md](../07-backend-api/persistence-and-storage-api.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## Purpose

The concrete auth flow, the Supabase Postgres schema (realizing [data-model.md](../04-data-layer/data-model.md)),
RLS policies, and the **metadata-only / pointer** data boundary set by [ADR-0008](../01-decisions/ADR-0008-auth-and-data-supabase.md).
This is the contract `@caw/db` migrations and the auth middleware implement.

## 1. Auth flow

```
unauthenticated ─▶ /(auth)/login ──magic-link / OTP (Supabase Auth)──▶ session cookie (@supabase/ssr)
       ▲                                                                      │
       └──────────────── middleware refresh + (app)/* gate ◀─────────────────┘
authenticated  ─▶ /(app)/simulation …                       sign-out ─▶ clears session ─▶ /login
```

- **Provider:** Supabase Auth. v1 = **email magic-link / OTP**; OAuth providers (Google/GitHub) are a config
  add later, no code reshape.
- **Session transport:** `@supabase/ssr` cookie-based session. `middleware.ts` runs on every `(app)` request:
  refreshes the session and redirects unauthenticated users to `/login`. Server Components read the user via the
  **server client**; client islands via the **browser client**.
- **Identity:** `auth.users.id` (uuid) is the principal. Account surface = the `User` and `Setting` nav items.
- **Keys:** `anon` key is public (browser, RLS-guarded). `service_role` key is **server-only** — used by
  `@caw/core` / the engine callback, never shipped to the client.

## 2. Schema (Supabase Postgres)

Realizes [data-model.md](../04-data-layer/data-model.md) on Supabase. Conventions (ADR-0002): every table has
`id uuid default gen_random_uuid()`, `created_at timestamptz default now()`, `created_by uuid default auth.uid()
references auth.users(id)`, `surface text`. Graphs are adjacency + recursive CTE — no Neo4j.

**Control-plane (in Supabase):**

| Table | Key columns | Notes |
|---|---|---|
| `project` | name, description | top-level owner scope; everything FKs up to a project |
| `experiment` | project_id, name, head_ref | the join across the 3 canvases; `head_ref` → work-tree branch |
| `workload_model` | experiment_id, agent_turn_spec jsonb, params jsonb | Canvas 1 |
| `simulation_config` | experiment_id, serving_choice, representation, simulator_path, hw_config_ref, backend | Canvas 2 (+ C3 ref) |
| `hw_node` | experiment_id, parent_id (self-FK, null=root), level enum, name, spec jsonb, part_id | Canvas 3 adjacency tree; `part_id` = picking identity |
| `simulation_run` | experiment_id, config_id, status enum, started_at, finished_at, **ir_uri**, **artifact_uri**, projection jsonb | **metadata + pointers only** |
| `metric` | run_id, name, value, unit | small numeric outputs (queryable) |
| `result_set` | run_id, projection_ref | grouping |
| `branch` | experiment_id, name, head_commit_id | work-tree (ADR-0007) |
| `commit` | branch_id, parent_id, message, author | work-tree history |
| `change_event` | commit_id, target (c1/c2/c3), op, payload jsonb | per-item save granularity |
| `claim` | experiment_id, statement, status, boundary enum | this product's generated conclusion |
| `evidence` | claim_id, kind enum(run/measurement/artifact), ref (run_id or uri), trust_level, boundary | proof — never free text |

**Engine-side (NOT in Supabase — pointer boundary, ADR-0008 §3):** `MemoryAnnotatedIR` bytes, `TensorNode`,
`DataMovementEdge`, `TraceArtifact` blobs. `simulation_run.ir_uri` / `artifact_uri` dereference these via the
core storage API ([persistence-and-storage-api.md](../07-backend-api/persistence-and-storage-api.md)). The UI
reads the index from Supabase; "open IR" lazy-loads the blob through the core, not from a Supabase table.

Enums: `run_status (queued|running|succeeded|failed|cancelled)`, `boundary (public|internal|confidential)`,
`hw_level (cluster|rack|tray|package|die|chip|component)`.

## 3. RLS policies

```sql
alter table project enable row level security;
create policy project_owner on project
  for all using (created_by = auth.uid()) with check (created_by = auth.uid());
-- child tables scope through their parent's ownership, e.g.:
create policy experiment_owner on experiment
  for all using (exists (select 1 from project p
                         where p.id = experiment.project_id and p.created_by = auth.uid()));
```

- v1: **owner-only** (`created_by = auth.uid()`); child tables scope via their parent (project/experiment).
- Team-sharing later = add `project_member(project_id, user_id, role)` and change the predicate to
  `exists (… project_member …)`. **No table reshape** — RLS-only change.
- RLS is **defense in depth**, not the sole guard: `@caw/core` also authorizes work-tree-governed writes.
- The engine callback writes via **service_role** behind the core (bypasses RLS by design; the core enforces
  ownership).

## 4. Read vs mutate (who calls what)

| Operation | Path | Why |
|---|---|---|
| List/detail of projects, experiments, runs, branches, evidence | ViewModel → repository → **Supabase (RLS)** | fast cached reads; row security free |
| Start/stop run, save item/full, branch, compose experiment | ViewModel → **Server Action → `@caw/core`** → engine port + Supabase write | single mutation path = identical UI/MCP/CLI semantics (ADR-0001) |
| Live run status | ViewModel → **SSE Route Handler** | stream, not poll |
| Open a run's IR / download a trace | ViewModel → core storage API (deref `ir_uri`/`artifact_uri`) | heavy bytes never in Supabase |

## 5. Environment & config

```
NEXT_PUBLIC_SUPABASE_URL=…
NEXT_PUBLIC_SUPABASE_ANON_KEY=…        # browser, RLS-guarded
SUPABASE_SERVICE_ROLE_KEY=…            # server only — core + engine callback
ENGINE_BASE_URL=…                      # Python engine service (behind a port)
```

`.env.example` ships these keys (empty); real values are per-deploy. Migrations + RLS live in `packages/db/
migrations/` and are applied via the Supabase CLI (`supabase db push`).

## Open questions

- `TODO(open-question: blob-backend)` Supabase Storage vs engine/artifact store for the `*_uri` blob backend in
  hosted deploys.
- `TODO(open-question: metric-volume)` If `metric` rows per run grow large, move to the engine side behind a
  pointer like the IR.

## Implications for runbooks

RB-002 provisions the Supabase project, applies these migrations + RLS, and seeds enums; RB-010/011 add the
`@supabase/ssr` middleware + `/login`; RB-012 wires the read/mutate split into the ViewModel.
