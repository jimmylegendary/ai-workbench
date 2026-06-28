# PRODUCT BRIEF — Periodic Trend Collection & Synthesis / Early-Warning Radar (CAW-05)

> Single source of truth for **CAW-05**. Every design doc + runbook must stay consistent with this brief.
> If a doc contradicts the brief, the brief wins. Capture unknowns in `08-research-plan/open-questions.md`.

## 0. The one hard constraint
We are NOT building the product here. We write the detailed design + build instructions (runbooks) an AI builder
executes — concrete features, methodology, named tools, tool-specific runbooks. The builder writes the code.

## 1. Identity & independence
- **Product:** Periodic Trend Collection & Synthesis (CAW-05) — an **early-warning radar**.
- **One-liner:** automatically collects AI papers/articles/securities-reports/community trends per Jimmy's & the
  team's interests, **classifies** each finding, and **synthesizes** it into readable outputs — acting as a
  novelty / related-work / future-workload-axis early-warning radar.
- **Independent, standalone product** in the `ai-workbench` family of 6. Own core, data, deploy. **No shared
  runtime substrate.** It ingests **public sources** and **exports** signals across explicit boundaries to other
  products.
- **Role (not just support):** it is the **radar that protects novelty**. Missing one close paper/system can erase
  the novelty of the whole control-plane / paper strategy. High recall on the narrow watch list matters.

## 2. Problem & value
- **Problem:** relevant work (papers, repos, reports, threads) is scattered and easy to miss; a missed close
  result is an existential novelty risk; loose summaries are not actionable or auditable.
- **Unit of value:** one **triaged, synthesized finding** — `source → signal → classification → routed output`
  with provenance — that becomes either knowledge, a task, an experiment, an open question, or a discard.
- **Why separate:** continuous multi-source ingestion + scheduling + triage + multi-format synthesis is its own
  product with its own legal/source concerns.

## 3. Users & top use cases
- **Personas:** Jimmy (defines interests, reviews the digest), the team (readers), AI agents (consume signals).
- **Top use cases:**
  1. Run the weekly **narrow radar** → collect → classify → produce a **weekly digest**.
  2. A finding is classified **novelty-threat** → routed to CAW-03 (paper novelty) + flagged.
  3. A finding becomes a **Source/Claim** exported to CAW-02 (knowledge).
  4. A finding raises an **open question** routed to CAW-01 and/or CAW-06.
  5. Update **interests**; the radar re-prioritizes.
  6. Emit a finding in multiple formats: memo, digest, slide outline, paper-card, action brief.

## 4. Product surface(s)
- **Primary:** a **scheduled automation pipeline** (cron-driven) + a **CLI** and **MCP** to run/inspect it.
- **Outputs:** multi-format synthesis — **memo, digest, slide outline, paper-card, action brief** (markdown-first).
- **Secondary:** an optional read view of the related-work ledger + digests.
- One product core behind all surfaces; no shared substrate.

## 5. Core domain (the heart)
- **Interest model:** how Jimmy's/team interests are represented + updated; drives relevance ranking. Seeded with
  the **narrow radar watch list** (§ below).
- **Source ingestion:** pluggable adapters per **source family** (arXiv/conf papers, lab blogs, GitHub, HN/Reddit/
  forums, securities reports, newsletters/media). Only legally/ToS-safe ingestion.
- **Classification / triage:** each finding classified as **novelty-threat / support / adjacent / noise**, and
  **signal vs hype**; then **routed** to knowledge / task / experiment / open-question / discard.
- **Related-work ledger:** an auditable ledger linking findings to the claims/strategy they threaten or support.
- **Synthesis:** turn findings into the multiple output formats; generated summaries are clearly marked (not evidence).

## 6. Narrow radar watch list (seed; verify in first research run)
memory-centric DSE; memory device for LLM; DeepStack; Minsoo Rhu / MC-DLA / memory-wall line; MemOS; SECDA-DSE;
TTT writeback / test-time compute memory traffic; Chakra / trace-based workload modeling; LLM serving simulation &
memory-hierarchy simulation. *(Start narrow + weekly before broad collection.)*

## 7. Data
- CAW-05's OWN store. Direction: markdown/JSON + a lightweight index/ledger (consistent with the family); large
  fetched artifacts by path. Every item carries provenance (source origin/date/retrieval), `boundary`
  (public/internal), trust, and classification. Decide specifics in ADR.

## 8. Import / export boundaries (to other independent products)
- **Ingests:** public sources (read-only external).
- **Exports:** **signals → CAW-02** (as Source/Claim/RelatedWork), **novelty signals → CAW-03**, **open questions →
  CAW-01 and CAW-06**. All explicit file/API boundaries between independent products — no shared store.

## 9. Open integration interfaces (design the seams; build only v1)
Ports & adapters so source families + export targets + schedulers plug in without redesign:
- **SourceAdapter** (per source family): v1 = arXiv/Semantic Scholar + RSS/blogs + GitHub; stubs = HN/Reddit,
  securities reports, newsletters, internal feeds.
- **ExportAdapter:** v1 = CAW-02/CAW-03/CAW-01/CAW-06 export bundles; stubs = others.
- **SchedulerAdapter:** v1 = cron; stubs = other schedulers.
- Config-driven registry + documented stubs (same pattern as CAW-03/04).

## 10. Decisions to make (each gets an ADR)
- Product surface (pipeline + CLI + MCP + scheduled) and output formats.
- **Interest model** (representation + update + relevance ranking). ← load-bearing
- **Source adapters & ingestion** (source families; legal/ToS-safe; dedup) + ports.
- **Classification / triage** (threat/support/adjacent/noise; signal vs hype; routing).
- Related-work ledger + provenance.
- Storage + scheduling/automation.
- Export boundaries to CAW-01/02/03/06.

## 11. Non-goals (v1)
- Broad/whole-internet trend collection (start with the narrow weekly radar).
- Autonomous decisions — findings are proposals; Jimmy reviews and routes.
- Ingesting paywalled/ToS-violating sources.
- Becoming the knowledge repo (CAW-02) or the paper harness (CAW-03) — it exports to them.
- Heavy ML relevance models in v1 (start with simple, explainable ranking).

## 12. Guardrails (inherited, all products)
- No confidential company data in public-facing outputs; only legally/ToS-safe sources ingested.
- Never conflate public-source research with internal Samsung/SAIT claims.
- Keep sources, claims, evidence, and generated conclusions separate; generated summaries are not evidence.
- Prefer small vertical slices (the narrow weekly radar) over broad scaffolding.
- Automatic collection is proposal/update generation; Jimmy is the reviewer for strategic decisions.
