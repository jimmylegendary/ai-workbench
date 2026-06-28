-- CAW-01 Supabase schema + RLS (ADR-0008 / design/06-frontend/auth-and-supabase.md)
-- Control-plane METADATA only. Heavy IR (L0/L1/L2) + trace blobs live in the
-- engine/artifact store and are referenced by ir_uri / artifact_uri pointers.
-- Graphs are adjacency + recursive CTE (ADR-0002) — no Neo4j.

-- ── enums ────────────────────────────────────────────────────────────────────
create type run_status as enum ('queued','running','succeeded','failed','cancelled');
create type boundary   as enum ('public','internal','confidential');
create type hw_level   as enum ('cluster','rack','tray','package','die','chip','component');
create type evidence_kind as enum ('run','measurement','artifact');

-- ── helper: ownership-by-project predicate is expressed inline in policies ─────
-- Convention (ADR-0002): every table has id/created_at/created_by/surface.

-- ── project (top-level owner scope) ──────────────────────────────────────────
create table project (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  surface     text,
  created_at  timestamptz not null default now(),
  created_by  uuid not null default auth.uid() references auth.users(id) on delete cascade
);

-- ── experiment (the join across the three canvases) ──────────────────────────
create table experiment (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references project(id) on delete cascade,
  name        text not null,
  head_ref    text,                       -- → work-tree branch (branch.id as text)
  surface     text,
  created_at  timestamptz not null default now(),
  created_by  uuid not null default auth.uid() references auth.users(id)
);
create index on experiment(project_id);

-- ── canvas inputs ────────────────────────────────────────────────────────────
create table workload_model (
  id              uuid primary key default gen_random_uuid(),
  experiment_id   uuid not null references experiment(id) on delete cascade,
  agent_turn_spec jsonb not null default '{}',
  params          jsonb not null default '{}',
  surface         text,
  created_at      timestamptz not null default now(),
  created_by      uuid not null default auth.uid() references auth.users(id)
);

create table simulation_config (
  id             uuid primary key default gen_random_uuid(),
  experiment_id  uuid not null references experiment(id) on delete cascade,
  serving_choice text,
  representation text,                     -- torch | syntorch
  simulator_path text,
  hw_config_ref  text,
  backend        text,                     -- analytical | ns3 | sst
  surface        text,
  created_at     timestamptz not null default now(),
  created_by     uuid not null default auth.uid() references auth.users(id)
);

-- ── hardware hierarchy (Canvas 3) — self-referential adjacency ────────────────
create table hw_node (
  id            uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references experiment(id) on delete cascade,
  parent_id     uuid references hw_node(id) on delete cascade,  -- null = root (cluster)
  level         hw_level not null,
  name          text not null,
  spec          jsonb not null default '{}',
  part_id       text not null,             -- stable picking identity from canvas
  surface       text,
  created_at    timestamptz not null default now(),
  created_by    uuid not null default auth.uid() references auth.users(id)
);
create index on hw_node(experiment_id);
create index on hw_node(parent_id);

-- ── runs (METADATA + POINTERS only) ──────────────────────────────────────────
create table simulation_run (
  id            uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references experiment(id) on delete cascade,
  config_id     uuid references simulation_config(id),
  status        run_status not null default 'queued',
  started_at    timestamptz,
  finished_at   timestamptz,
  ir_uri        text,                      -- pointer → MemoryAnnotatedIR blob (NOT stored here)
  artifact_uri  text,                      -- pointer → trace blobs        (NOT stored here)
  projection    jsonb,                     -- small comparable readout
  surface       text,
  created_at    timestamptz not null default now(),
  created_by    uuid not null default auth.uid() references auth.users(id)
);
create index on simulation_run(experiment_id);
create index on simulation_run(status);

create table metric (
  id         uuid primary key default gen_random_uuid(),
  run_id     uuid not null references simulation_run(id) on delete cascade,
  name       text not null,
  value      double precision not null,
  unit       text
);
create index on metric(run_id);

create table result_set (
  id             uuid primary key default gen_random_uuid(),
  run_id         uuid not null references simulation_run(id) on delete cascade,
  projection_ref text
);

-- ── work-tree (ADR-0007) ─────────────────────────────────────────────────────
create table branch (
  id             uuid primary key default gen_random_uuid(),
  experiment_id  uuid not null references experiment(id) on delete cascade,
  name           text not null,
  head_commit_id uuid,
  created_at     timestamptz not null default now(),
  created_by     uuid not null default auth.uid() references auth.users(id)
);
create table commit (
  id         uuid primary key default gen_random_uuid(),
  branch_id  uuid not null references branch(id) on delete cascade,
  parent_id  uuid references commit(id),
  message    text,
  author     uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
create table change_event (
  id         uuid primary key default gen_random_uuid(),
  commit_id  uuid not null references commit(id) on delete cascade,
  target     text not null,                -- c1 | c2 | c3
  op         text not null,
  payload    jsonb not null default '{}'
);

-- ── evidence index (this product's own conclusions) ──────────────────────────
create table claim (
  id            uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references experiment(id) on delete cascade,
  statement     text not null,
  status        text,
  boundary      boundary not null default 'internal',
  created_at    timestamptz not null default now(),
  created_by    uuid not null default auth.uid() references auth.users(id)
);
create table evidence (
  id          uuid primary key default gen_random_uuid(),
  claim_id    uuid not null references claim(id) on delete cascade,
  kind        evidence_kind not null,
  ref         text not null,               -- run_id or uri — never free text
  trust_level int not null default 0 check (trust_level between 0 and 3),
  boundary    boundary not null default 'internal'
);

-- ── RLS (owner-only v1; team-sharing later = add project_member + change predicate) ──
alter table project           enable row level security;
alter table experiment        enable row level security;
alter table workload_model    enable row level security;
alter table simulation_config enable row level security;
alter table hw_node           enable row level security;
alter table simulation_run    enable row level security;
alter table metric            enable row level security;
alter table result_set        enable row level security;
alter table branch            enable row level security;
alter table commit            enable row level security;
alter table change_event      enable row level security;
alter table claim             enable row level security;
alter table evidence          enable row level security;

-- project: direct ownership
create policy project_owner on project
  for all using (created_by = auth.uid()) with check (created_by = auth.uid());

-- experiment + its direct children scope through the owning project
create policy experiment_owner on experiment
  for all using (exists (select 1 from project p where p.id = experiment.project_id and p.created_by = auth.uid()))
  with check (exists (select 1 from project p where p.id = experiment.project_id and p.created_by = auth.uid()));

-- tables that hang off experiment: owner = the experiment's project owner
create policy workload_owner on workload_model
  for all using (exists (select 1 from experiment e join project p on p.id = e.project_id
                         where e.id = workload_model.experiment_id and p.created_by = auth.uid()));
create policy config_owner on simulation_config
  for all using (exists (select 1 from experiment e join project p on p.id = e.project_id
                         where e.id = simulation_config.experiment_id and p.created_by = auth.uid()));
create policy hwnode_owner on hw_node
  for all using (exists (select 1 from experiment e join project p on p.id = e.project_id
                         where e.id = hw_node.experiment_id and p.created_by = auth.uid()));
create policy run_owner on simulation_run
  for all using (exists (select 1 from experiment e join project p on p.id = e.project_id
                         where e.id = simulation_run.experiment_id and p.created_by = auth.uid()));
create policy branch_owner on branch
  for all using (exists (select 1 from experiment e join project p on p.id = e.project_id
                         where e.id = branch.experiment_id and p.created_by = auth.uid()));
create policy claim_owner on claim
  for all using (exists (select 1 from experiment e join project p on p.id = e.project_id
                         where e.id = claim.experiment_id and p.created_by = auth.uid()));

-- grand-children scope through their parent row
create policy metric_owner on metric
  for all using (exists (select 1 from simulation_run r join experiment e on e.id = r.experiment_id
                         join project p on p.id = e.project_id
                         where r.id = metric.run_id and p.created_by = auth.uid()));
create policy resultset_owner on result_set
  for all using (exists (select 1 from simulation_run r join experiment e on e.id = r.experiment_id
                         join project p on p.id = e.project_id
                         where r.id = result_set.run_id and p.created_by = auth.uid()));
create policy commit_owner on commit
  for all using (exists (select 1 from branch b join experiment e on e.id = b.experiment_id
                         join project p on p.id = e.project_id
                         where b.id = commit.branch_id and p.created_by = auth.uid()));
create policy change_owner on change_event
  for all using (exists (select 1 from commit c join branch b on b.id = c.branch_id
                         join experiment e on e.id = b.experiment_id join project p on p.id = e.project_id
                         where c.id = change_event.commit_id and p.created_by = auth.uid()));
create policy evidence_owner on evidence
  for all using (exists (select 1 from claim cl join experiment e on e.id = cl.experiment_id
                         join project p on p.id = e.project_id
                         where cl.id = evidence.claim_id and p.created_by = auth.uid()));
