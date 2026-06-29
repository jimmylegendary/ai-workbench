-- CAW-01 HW Module library + RLS (Module Design / canvas-3-hw-design.md).
-- Companion to 0001_init.sql. A `hw_module` is a SAVED, reusable hardware
-- subtree (the working HwTreeNode the Module Design editor composes) so a user
-- can stamp an existing module as a child of a higher-level design — e.g. save
-- a tray once, then compose it into many racks ("reuse existing assets to
-- compose a higher level").
--
-- Unlike `hw_node` (0001) — which is the per-experiment, adjacency-modelled
-- INSTANCE of a researched twin — `hw_module` is a standalone LIBRARY entry
-- owned directly by a user, not scoped through an experiment/project. The whole
-- spec tree is stored as one JSONB document (the editor round-trips it wholesale
-- via moduleRepository), so there is no adjacency table here.

create table hw_module (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  root_level  hw_level not null,                 -- the design level of the tree root
  spec_tree   jsonb not null default '{}',       -- the full HwTreeNode document
  surface     text,
  created_at  timestamptz not null default now(),
  created_by  uuid not null default auth.uid() references auth.users(id) on delete cascade
);
create index on hw_module(created_by);
create index on hw_module(root_level);

-- ── RLS — owner-only (mirrors `project` in 0001: direct ownership) ──────────
alter table hw_module enable row level security;

create policy hw_module_owner on hw_module
  for all using (created_by = auth.uid()) with check (created_by = auth.uid());
