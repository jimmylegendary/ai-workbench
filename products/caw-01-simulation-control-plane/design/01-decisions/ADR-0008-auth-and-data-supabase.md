# ADR-0008: Auth & web-app data backing — Supabase (Auth + Postgres), metadata-only boundary

- **Status:** proposed
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [SOURCE-BRIEF](../_meta/SOURCE-BRIEF.md)
  - [ADR-0001 Product surface](./ADR-0001-product-surface.md)
  - [ADR-0002 Data layer](./ADR-0002-data-layer.md)
  - [ADR-0003 Frontend stack](./ADR-0003-frontend-stack.md)
  - [ADR-0007 Work-tree change-management](./ADR-0007-change-management-worktree.md)
  - [../04-data-layer/data-model.md](../04-data-layer/data-model.md), [../04-data-layer/storage-strategy.md](../04-data-layer/storage-strategy.md)
  - [../06-frontend/auth-and-supabase.md](../06-frontend/auth-and-supabase.md), [../06-frontend/app-architecture-mvvm.md](../06-frontend/app-architecture-mvvm.md)
  - [../07-backend-api/persistence-and-storage-api.md](../07-backend-api/persistence-and-storage-api.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## Purpose

[ADR-0003](./ADR-0003-frontend-stack.md) left an explicit open question — *"Auth/session model for User/Setting
menus in v1"* — and [ADR-0002](./ADR-0002-data-layer.md) chose **Postgres-portable** storage ("SQLite → PG")
without naming the Postgres. This ADR closes both: it fixes **Supabase** as (1) the **authentication / user
management** provider and (2) the **Postgres** that backs the web app's **control-plane metadata**, and it draws
the **metadata-only boundary** — the heavy memory-annotated IR and trace blobs do **not** live in Supabase; they
stay in the engine/artifact store and are referenced by URI. It does **not** change the canvas engines (ADR-0004),
the TS↔Python seam (ADR-0003 §6, ADR-0005), or the work-tree model (ADR-0007).

## Context

Forces:

- The product is **team-internal, initially single-operator** (Jimmy), but must support real **login + user
  management** so it can be shared inside the team without re-architecting. ADR-0001 keeps the web app
  presentation-only; ADR-0003 routes every durable mutation through `@caw/core`.
- ADR-0002 already models the schema as **adjacency tables + recursive CTEs, PG-portable**, no Neo4j. That is a
  literal Supabase-Postgres fit — adopting Supabase is choosing the concrete PG, not redesigning the schema.
- A `SimulationRun` produces **heavy artifacts** — `MemoryAnnotatedIR` (L0/L1/L2), `TraceArtifact` (Chakra/OTel),
  metrics — that are Python-native and large. Putting these in a hosted Postgres is the wrong cost/locality
  trade (ADR-0002 storage-strategy already says "large blobs by path/URI"). The engine owns them.
- We want **fast, RLS-safe reads from the client** for the control-plane lists (experiments, runs, branches,
  evidence) without funneling every read through a Server Action, while keeping **engine-touching mutations**
  on the server (ADR-0003 §2).

## Options considered

### Auth provider

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Supabase Auth** | Postgres + Auth + Storage + RLS in one; `@supabase/ssr` integrates with App Router cookies/middleware; RLS uses `auth.uid()` directly on our tables; self-hostable later | Couples us to one vendor's auth surface (mitigated: standard GoTrue/JWT, exportable) | **Chosen** |
| NextAuth/Auth.js + own PG | Provider-agnostic | We still must run/host Postgres and wire RLS by hand; no Storage; more glue | Rejected for v1 |
| Roll our own (cookie + bcrypt) | No dep | Security surface we should not own for a team tool | Rejected |

### Web-app metadata store

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Supabase Postgres (metadata) + engine store (IR/blobs)** | One managed PG for control-plane rows; RLS at the row; matches ADR-0002 adjacency model; heavy data stays where it is computed | Two stores to reason about (mitigated by the explicit pointer boundary below) | **Chosen** |
| Everything in Supabase (incl. IR rows + Storage blobs) | One backend | Large/structured IR in hosted PG is costly and couples engine output to a web DB; breaks ADR-0002 "blobs by path" | Rejected |
| Keep SQLite, add auth separately | Simplest local dev | No multi-user story; no RLS; re-do at first share | Rejected |

### Where the web app reads metadata from

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **RLS-guarded Supabase reads from ViewModel (TanStack Query) + engine mutations via Server Actions → core** | Fast client reads with row security; mutations still single-pathed through core (ADR-0001) | Two access shapes (read vs mutate) to keep disciplined | **Chosen** |
| All reads + writes through Server Actions → core | One path | Loses client-cache ergonomics; chattier; re-implements what RLS gives free | Rejected as default |

## Decision

**Adopt Supabase as the web app's Auth provider and metadata Postgres, with a hard metadata-only boundary: the
memory-annotated IR and trace blobs stay in the engine/artifact store and are referenced from Supabase rows by
URI.**

### 1. Auth & session
- **Supabase Auth** (email magic-link / OTP for v1; OAuth providers addable later). Session via `@supabase/ssr`
  cookies; an App Router **`middleware.ts`** refreshes the session and gates `(app)` routes; unauthenticated
  users are redirected to `(auth)/login`. The `User` / `Setting` nav items are the account surface.
- **Identity = `auth.users.id` (uuid).** Our existing convention column `created_by` (ADR-0002) maps to
  `auth.uid()`. v1 is effectively single-tenant, but every row is owned, so multi-user is an RLS change, not a
  schema change.

### 2. Metadata in Supabase Postgres
The control-plane metadata from [../04-data-layer/data-model.md](../04-data-layer/data-model.md) lives in
Supabase: `project`, `experiment`, `workload_model`, `simulation_config`, `simulation_run` (status/timing/refs
only), `hw_node` (adjacency), work-tree tables (`branch`, `commit`, `change_event` — ADR-0007), and the
**evidence index** (`claim`, `evidence`). Graphs stay **adjacency + recursive CTE** (ADR-0002). This is the
concrete realization of ADR-0002's "PG", not a new schema.

### 3. The metadata-only boundary (load-bearing)
**Supabase never stores the heavy IR or trace bytes.** `simulation_run` and `memory_annotated_ir` rows hold
**metadata + a pointer** (`ir_uri`, `artifact_uri`) into the engine/artifact store (or Supabase **Storage** as
the blob backend if hosted). `TensorNode` / `DataMovementEdge` rows are **engine-side** (queried there when the
IR is opened), not synced into Supabase. The UI reads the index from Supabase and dereferences blobs lazily via
the core's storage API ([../07-backend-api/persistence-and-storage-api.md](../07-backend-api/persistence-and-storage-api.md)).

### 4. Access pattern (RLS read / core mutate)
- **Reads** of control-plane lists/detail: ViewModel hooks (TanStack Query) call **RLS-guarded Supabase**
  directly (server-component reads use the server client; client islands use the browser client). RLS ensures a
  user only sees their rows.
- **Mutations that touch the engine or the work-tree invariant** (start/stop run, save item/full, branch,
  compose): **Server Actions → `@caw/core`** (ADR-0003 §2), which writes Supabase rows **and** drives the engine
  port. The core is the only writer of work-tree-governed rows, so UI/MCP/CLI keep identical semantics
  (ADR-0001).
- `@caw/core` stays **`next`-free and Supabase-SDK-free at its center**: it depends on **repository ports**
  ([app-architecture-mvvm.md](../06-frontend/app-architecture-mvvm.md)); the Supabase implementation lives in
  `@caw/db`. RLS is defense-in-depth, not the only guard.

### 5. RLS posture
Every metadata table: `enable row level security`, owner = `created_by`, policies `using (created_by =
auth.uid())` for select/insert/update/delete (v1). Team-sharing later = add a `project_member` join + policy
predicate; no table reshape. Service-role key is **server-only** (never shipped to the browser); the engine
callback path uses the service role behind the core.

## Consequences

**Becomes easy:**
- Real login + per-user data isolation with almost no app code (RLS does the row filtering).
- ADR-0002's PG-portable schema lands on a concrete, managed Postgres with Storage + Auth included.
- Heavy IR stays where it is computed; the web DB stays small and cheap; the pointer boundary keeps the UI fast.
- Self-host path preserved (Supabase is OSS; GoTrue JWT + standard Postgres).

**Becomes harder / costs:**
- Two access shapes (RLS read vs core mutate) — governed by §4; mis-reads as "just query Supabase everywhere"
  if undocumented (hence [auth-and-supabase.md](../06-frontend/auth-and-supabase.md)).
- A vendor coupling on the auth surface (mitigated: standard JWT, exportable PG).
- Keeping RLS policies and core authorization in sync is real work; tests must cover both.

**Follow-on (runbooks):** update RB-002 (data-layer) to provision Supabase + migrations + RLS; RB-010/011 add
`@supabase/ssr` middleware, the `(auth)/login` route, and the read/mutate split; RB-012 wires repositories
(Supabase + Server Actions) under the MVVM ViewModel.

## Open questions / revisit triggers
- `TODO(open-question: blob-backend)` Engine/artifact store vs Supabase Storage as the blob backend for
  `ir_uri`/`artifact_uri` in hosted deploys (coordinate with ADR-0002 storage-strategy).
- `TODO(open-question: team-sharing)` Exact `project_member` model + policy when the team grows beyond single
  operator.
- **Revisit trigger:** if IR query needs from the UI grow beyond "open one run's IR," re-examine the
  metadata-only boundary (do not pull TensorNode/DataMovementEdge into Supabase without re-deciding here).
