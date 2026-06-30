-- CAW-01 Flow Module library + RLS (Module Design / Workload + Serving composers).
-- Companion to 0001_init.sql and 0003_modules.sql. A `flow_module` is a SAVED,
-- reusable FLOW graph composed in the Workload or Serving Module Design editors —
-- the agent-turn HARNESS graph (io/router/llm/tool/memory) or the serving stack
-- (serving → representation → simulator). It lets a user save a composed graph
-- once and load it back into the composer to reuse / extend it.
--
-- Like `hw_module` (0003) — and unlike the per-experiment `hw_node` instances —
-- `flow_module` is a standalone LIBRARY entry owned directly by a user, not
-- scoped through an experiment/project. The whole graph (nodes + edges) is stored
-- as one JSONB document (the editor round-trips it wholesale via
-- graphModuleRepository), so there is no adjacency table here.

create type flow_module_kind as enum ('workload', 'serving');

create table flow_module (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  kind        flow_module_kind not null,       -- which composer authored it
  graph       jsonb not null default '{"nodes": [], "edges": []}'::jsonb,  -- { nodes, edges } document
  created_at  timestamptz not null default now(),
  created_by  uuid not null default auth.uid() references auth.users(id) on delete cascade
);
create index on flow_module(created_by);
create index on flow_module(kind);

-- ── RLS — owner-only (mirrors `project` in 0001 / `hw_module` in 0003) ──────────
alter table flow_module enable row level security;

create policy flow_module_owner on flow_module
  for all using (created_by = auth.uid()) with check (created_by = auth.uid());
