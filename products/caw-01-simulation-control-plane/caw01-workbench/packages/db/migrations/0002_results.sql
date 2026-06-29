-- CAW-01 simulation RESULTS schema + RLS (B5 / ADR-0008).
-- Companion to 0001_init.sql. Where 0001's `metric` table holds a flat
-- per-run readout, this migration adds a viz-shaped, time-indexed result
-- table so the Sim Result page can draw run/axis comparisons AND
-- metric-over-time series, plus a per-run rollup VIEW for the run picker.
--
-- INTERFACE — "results accumulate in Supabase":
--   The engine (or any RLS-authenticated writer) appends rows to
--   sim_result_metric as a run progresses; one row per (run, axis, metric,
--   timestamp) sample. The page never mutates results — it only reads. Heavy
--   IR/trace bytes still live behind ir_uri/artifact_uri pointers (ADR-0008);
--   only the small comparable numbers land here.

-- ── axis: which evidence lane the sample belongs to (mirrors EvidenceAxis) ──
create type result_axis as enum ('real', 'synthetic', 'sim');

-- ── time-indexed result samples (the viz-shaped fact table) ────────────────
create table sim_result_metric (
  id         uuid primary key default gen_random_uuid(),
  run_id     uuid not null references simulation_run(id) on delete cascade,
  axis       result_axis not null,
  name       text not null,                 -- e.g. 'ttft_ms', 'throughput_tok_s'
  value      double precision not null,
  unit       text,                          -- 'ms', 'tok/s', '%', 'GB' …
  ts         timestamptz not null default now(),  -- sample time (series x-axis)
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id)
);
-- read paths: by run (page load), by (run,name) (series), newest first.
create index on sim_result_metric(run_id);
create index on sim_result_metric(run_id, name, ts);
create index on sim_result_metric(axis);

-- ── per-run rollup for the run picker + bar chart (latest value per series) ─
-- distinct on (run, axis, name) ordered by ts desc = the most recent sample of
-- each metric series, which is what the comparison bar chart plots.
create view sim_run_summary
  with (security_invoker = on) as          -- caller's RLS applies (PG15+/Supabase)
select
  r.id                                   as run_id,
  r.experiment_id                        as experiment_id,
  r.status                               as status,
  r.created_at                           as created_at,
  count(distinct (m.axis, m.name))       as series_count,
  count(m.*)                             as sample_count,
  max(m.ts)                              as last_sample_at
from simulation_run r
left join sim_result_metric m on m.run_id = r.id
group by r.id, r.experiment_id, r.status, r.created_at;

-- ── latest-sample-per-series helper view (powers the comparison bars) ──────
create view sim_result_latest
  with (security_invoker = on) as
select distinct on (run_id, axis, name)
  run_id, axis, name, value, unit, ts
from sim_result_metric
order by run_id, axis, name, ts desc;

-- ── RLS — owner-only, scoped through run → experiment → project (as 0001) ───
alter table sim_result_metric enable row level security;

create policy result_metric_owner on sim_result_metric
  for all using (exists (
    select 1 from simulation_run r
    join experiment e on e.id = r.experiment_id
    join project p on p.id = e.project_id
    where r.id = sim_result_metric.run_id and p.created_by = auth.uid()
  ))
  with check (exists (
    select 1 from simulation_run r
    join experiment e on e.id = r.experiment_id
    join project p on p.id = e.project_id
    where r.id = sim_result_metric.run_id and p.created_by = auth.uid()
  ));
-- Views inherit RLS from sim_result_metric / simulation_run via security_invoker.
