-- ============================================================================
-- CAW-01 — example seed data (Supabase). Apply AFTER the migrations (0001-0004).
--
--   psql "<your SUPABASE_DB_URL>" -f packages/db/seed.sql
--   # or copy to packages/db/supabase/seed.sql and run `supabase db reset`
--
-- OWNERSHIP + RLS: every table is owner-only (created_by = auth.uid()). This
-- seed attaches all rows to the FIRST auth.users row, so:
--   1) start the app + sign in once (creates your auth user),
--   2) run this file → the example data shows up under YOUR account.
-- Idempotent: re-running inserts nothing new (fixed ids / existence guards).
--
-- Mirrors the in-app fallback (apps/web/features/sim-result/model/example.ts):
-- 3 runs (A/B/C) × per-(axis,metric) time series, plus example HW + flow modules.
-- ============================================================================

do $$
declare
  owner uuid;
  proj  uuid := '0d0d0d0d-0000-4000-8000-000000000001';
  exp   uuid := '0e0e0e0e-0000-4000-8000-000000000001';
  cfg   uuid := '0c0c0c0c-0000-4000-8000-000000000001';
  run_a uuid := 'a1a1a1a1-0000-4000-8000-000000000001';
  run_b uuid := 'b2b2b2b2-0000-4000-8000-000000000002';
  run_c uuid := 'c3c3c3c3-0000-4000-8000-000000000003';
  t0    timestamptz := '2026-06-29T09:00:00Z';
begin
  select id into owner from auth.users order by created_at asc limit 1;
  if owner is null then
    raise notice 'CAW-01 seed skipped: no auth.users yet. Sign in once, then re-run this file.';
    return;
  end if;

  -- ── project / experiment / config ────────────────────────────────────────
  insert into project (id, name, description, created_by)
    values (proj, 'Demo project', 'CAW-01 example data', owner)
    on conflict (id) do nothing;
  insert into experiment (id, project_id, name, created_by)
    values (exp, proj, 'Demo experiment', owner)
    on conflict (id) do nothing;
  insert into simulation_config (id, experiment_id, serving_choice, representation, backend, created_by)
    values (cfg, exp, 'vLLM', 'torch', 'analytical', owner)
    on conflict (id) do nothing;

  -- ── three finished runs (label lives in projection for when the view/repo
  --    grows a real label column; the UI currently derives one from the id) ──
  insert into simulation_run (id, experiment_id, config_id, status, started_at, finished_at, projection, created_by)
  values
    (run_a, exp, cfg, 'succeeded', t0,                          t0 + interval '8 min',           '{"label":"baseline · A100x8 · vLLM"}',  owner),
    (run_b, exp, cfg, 'succeeded', t0 + interval '2 hours',     t0 + interval '2 hours 8 min',   '{"label":"cxl-pool · A100x8 · vLLM"}',  owner),
    (run_c, exp, cfg, 'succeeded', t0 + interval '17 hours',    t0 + interval '17 hours 8 min',  '{"label":"h100-scaleout · H100x16"}',   owner)
  on conflict (id) do nothing;

  -- ── result metric series (8 samples/series, drift + sine wobble) ─────────
  if not exists (select 1 from sim_result_metric where run_id in (run_a, run_b, run_c)) then
    insert into sim_result_metric (run_id, axis, name, value, unit, ts, created_by)
    select s.run_id,
           s.axis::result_axis,
           s.name,
           round((s.start + s.drift * i + sin(i * 1.3) * abs(s.drift) * 0.4)::numeric, 2)::double precision,
           s.unit,
           t0 + make_interval(mins => i),
           owner
    from (values
      -- RUN A — modest baseline
      (run_a, 'sim',       'ttft_ms',          'ms',    240,  -6.0),
      (run_a, 'real',      'ttft_ms',          'ms',    262,  -5.0),
      (run_a, 'synthetic', 'ttft_ms',          'ms',    250,  -5.5),
      (run_a, 'sim',       'throughput_tok_s', 'tok/s', 1850, 22.0),
      (run_a, 'real',      'throughput_tok_s', 'tok/s', 1790, 18.0),
      (run_a, 'sim',       'gpu_util_pct',     '%',     71,   1.2),
      -- RUN B — CXL pool: better TTFT, similar throughput
      (run_b, 'sim',       'ttft_ms',          'ms',    198,  -5.0),
      (run_b, 'real',      'ttft_ms',          'ms',    210,  -4.5),
      (run_b, 'synthetic', 'ttft_ms',          'ms',    205,  -4.7),
      (run_b, 'sim',       'throughput_tok_s', 'tok/s', 1920, 25.0),
      (run_b, 'real',      'throughput_tok_s', 'tok/s', 1880, 20.0),
      (run_b, 'sim',       'gpu_util_pct',     '%',     76,   1.0),
      -- RUN C — H100 scale-out: best throughput, lowest TTFT
      (run_c, 'sim',       'ttft_ms',          'ms',    132,  -3.0),
      (run_c, 'real',      'ttft_ms',          'ms',    141,  -2.8),
      (run_c, 'synthetic', 'ttft_ms',          'ms',    137,  -2.9),
      (run_c, 'sim',       'throughput_tok_s', 'tok/s', 4120, 60.0),
      (run_c, 'real',      'throughput_tok_s', 'tok/s', 4010, 52.0),
      (run_c, 'sim',       'gpu_util_pct',     '%',     83,   0.8)
    ) as s(run_id, axis, name, unit, start, drift)
    cross join generate_series(0, 7) as i;
  end if;

  -- ── example HW module (a GB200 compute tray, reusable in Module Design) ──
  insert into hw_module (id, name, root_level, spec_tree, created_by)
  values (
    '0a0a0a0a-0000-4000-8000-000000000001',
    'GB200 compute tray (example)',
    'tray',
    '{"partId":"tray:example","name":"gb200-compute-tray","level":"tray","trayKind":"compute",
      "spec":{"gpus":"4","cpus":"2 Grace"},
      "children":[
        {"partId":"pkg:ex-b0","name":"b200-0","level":"package","comp":"gpu","spec":{"memory":"192 GiB HBM3e"}},
        {"partId":"pkg:ex-b1","name":"b200-1","level":"package","comp":"gpu","count":3,"spec":{"memory":"192 GiB HBM3e"}},
        {"partId":"pkg:ex-grace","name":"grace-cpu","level":"package","comp":"cpu","count":2,"spec":{"cores":"72"}},
        {"partId":"pkg:ex-cx8","name":"connectx-8","level":"package","comp":"nic","count":4,"spec":{"speed":"800 Gb/s"}}
      ]}'::jsonb,
    owner
  ) on conflict (id) do nothing;

  -- ── example flow modules (a workload turn + a serving stack) ─────────────
  insert into flow_module (id, name, kind, graph, created_by)
  values
    ('0f0f0f0f-0000-4000-8000-000000000001', 'Agent turn (example)', 'workload',
     '{"nodes":[
        {"id":"io-1","kind":"io","label":"user input","x":0,"y":120},
        {"id":"router-2","kind":"router","label":"router","x":200,"y":120},
        {"id":"llm-3","kind":"llm","label":"LLM call","x":400,"y":120},
        {"id":"tool-4","kind":"tool","label":"search","x":620,"y":40},
        {"id":"memory-5","kind":"memory","label":"memory write","x":620,"y":200},
        {"id":"io-6","kind":"io","label":"final output","x":840,"y":120}
      ],"edges":[
        {"id":"e-1","from":"io-1","to":"router-2"},
        {"id":"e-2","from":"router-2","to":"llm-3"},
        {"id":"e-3","from":"llm-3","to":"tool-4"},
        {"id":"e-4","from":"llm-3","to":"memory-5"},
        {"id":"e-5","from":"tool-4","to":"io-6"}
      ]}'::jsonb,
     owner),
    ('0f0f0f0f-0000-4000-8000-000000000002', 'Serving stack (example)', 'serving',
     '{"nodes":[
        {"id":"serving-1","kind":"serving","label":"vLLM","x":0,"y":80},
        {"id":"representation-2","kind":"representation","label":"torch","x":240,"y":80},
        {"id":"simulator-3","kind":"simulator","label":"ASTRA-sim","x":480,"y":80}
      ],"edges":[
        {"id":"e-1","from":"serving-1","to":"representation-2"},
        {"id":"e-2","from":"representation-2","to":"simulator-3"}
      ]}'::jsonb,
     owner)
  on conflict (id) do nothing;

  raise notice 'CAW-01 seed applied for owner %', owner;
end $$;
