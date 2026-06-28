# Open Questions — Register

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./research-plan.md](./research-plan.md), [./validation-and-tests.md](./validation-and-tests.md)
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md), [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS.md)
  - source docs: [../02-research/](../02-research/) · decisions: [../01-decisions/](../01-decisions/)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

This is the **single deduped register** of every open question raised across CAW-06's research docs
([02-research/](../02-research/)) and ADRs ([01-decisions/](../01-decisions/)). It aggregates the per-doc
`TODO(open-question: …)` items and the `wbq-###` writeback questions into one tracked table so nothing is lost
when a source doc closes. It does NOT re-decide anything (ADRs are authoritative) and does NOT invent answers —
an unknown stays `open` until a research track ([research-plan.md](./research-plan.md)) or a logged result closes
it. Per DOC-CONVENTIONS §3, unknowns are never replaced with fabricated numbers or dates.

**ID scheme:** `wbq-` writeback/CAW-01 bridge · `hq-` hypothesis representation · `lq-` experiment ledger ·
`iq-` source/claim ingestion · `eq-` implication mapping & export · `sq-` storage & scheduling · `pq-` product
surface & scout. **resolve-by** is a build phase (P1–P4, see research-plan §1), not a date.

## 1. Writeback / CAW-01 bridge (load-bearing)

| id | question | owning ADR/doc | resolve-by | status |
|---|---|---|---|---|
| wbq-001 | Which TTT variants *actually* write back optimizer state vs only fast-weight deltas (Titans/LaCT/TTT-E2E differ)? | ADR-0004 · [ttt-landscape](../02-research/ttt-landscape.md) OQ-4 | P3 | open |
| wbq-002 | Should CAW-01 split "rough traffic" into directional read/write rollups + an endurance rollup? (export ask to CAW-01 — their decision) | ADR-0004/0008 · [writeback-traffic-modeling](../02-research/writeback-traffic-modeling.md) | P2 | open (export-ask) |
| wbq-003 | Is `near_mem` a residency *tier* or an *op attribute* (compute-at-write) in CAW-01's model? | ADR-0004 | P2 | open |
| wbq-004 | Do real TTT workloads create write-endurance pressure on any plausible tier, or only on non-volatile media? | ADR-0004 · [ttt-landscape](../02-research/ttt-landscape.md) OQ-7 | P3 | open |
| wbq-005 | Can `reuse_distance_tokens` be derived from a DAG walk like CAW-01 tensor lifetime, or does it need update-frequency metadata? | ADR-0004 | P2 | open |
| wbq-006 | Does modeled `write_bw` ever exceed read bandwidth at long context — is the writeback axis ever the bottleneck? (the justifying hypothesis) | ADR-0004 | P3 | open |
| wbq-007 | For each "writes back" variant, what is the *actual* written-byte volume per token/segment/task? (no numbers invented) | [ttt-landscape](../02-research/ttt-landscape.md) OQ-1 · ADR-0003 | P3 | open |
| wbq-008 | Can writeback be modeled at CAW-01's L0/L1 before syntorch/vLLM integration? (decided **yes/analytic** in ADR-0004; this tracks validation) | ADR-0004 · [ttt-landscape](../02-research/ttt-landscape.md) OQ-5 | P2 | decided→validate |
| wbq-009 | Is the KV-binding-TTT ⇄ linear-attention equivalence exact enough that its "write" is just a recurrence (no optimizer state)? | [ttt-landscape](../02-research/ttt-landscape.md) OQ-2 | P3 | open |
| wbq-010 | Do inner-loop fast weights (#2/#3) spill from on-chip to main memory at long context, and at what length? | [ttt-landscape](../02-research/ttt-landscape.md) OQ-3 | P3 | open |
| wbq-011 | Which variants show updated-weight reuse strong enough to matter for caching/residency vs write-then-discard churn (#4)? | [ttt-landscape](../02-research/ttt-landscape.md) OQ-6 | P3 | open |
| wbq-012 | Does CAW-01's L0/L1 IR accept `null`+`basis` fields (modeled, unmeasured)? | ADR-0008 · [implication-mapping-and-export](../02-research/implication-mapping-and-export.md) | P2 | open (export-ask) |

## 2. Hypothesis representation & uncertainty

| id | question | owning ADR/doc | resolve-by | status |
|---|---|---|---|---|
| hq-001 | Add a numeric 0–1 confidence alongside the qualitative enum for ranking, or does that invite false precision? | ADR-0002 | P4 | open (rejected, revisit) |
| hq-002 | Should "supported by N independent experiments" be a structured counter gating confidence, vs reviewer judgement? | ADR-0002 | P3 | open |
| hq-003 | How to represent a *partially* supported hypothesis — split into sub-hypotheses, or add a `scope` qualifier? | ADR-0002 | P3 | open |
| hq-004 | Should confidence decay over time as the fast-moving TTT field shifts, triggering re-test? | ADR-0002 | P4 | open |
| hq-005 | Do CAW-01/CAW-02 require a shared status vocabulary, or do we map at the export-adapter boundary? (incl. CAW-02 uncertainty encoding) | ADR-0002 · ADR-0008 | P2 | open |

## 3. Experiment ledger

| id | question | owning ADR/doc | resolve-by | status |
|---|---|---|---|---|
| lq-001 | Minimum seed count vs budget — is 3 enough for seed-sensitive TTT, or variance-driven adaptive count? | ADR-0003 | P3 | open (default 3) |
| lq-002 | What effect-size *prior* should `prediction.expected_effect` carry before any run, given no invented numbers? | ADR-0003 | P3 | open |
| lq-003 | Can a toy run meaningfully measure write-side behavior (written bytes, optimizer-state residency, volume), or does that need real runner integration beyond v1? | ADR-0003 · [experiment-ledger](../02-research/experiment-ledger.md) | P3 | open |
| lq-004 | Independent verification of public TTT cost claims (latency multiplier, memory O(T·d)) — vendor/blog vs peer-reviewed? | ADR-0003 | P3 | open |
| lq-005 | Retention/GC for large failure artifacts — keep forever by path, or summarize + prune after N days keeping metrics? | ADR-0003 · ADR-0007 | P4 | open |
| lq-006 | Force the `ExperimentRunnerAdapter` to create a ledger entry on every launch (incl. out-of-band manual runs) to de-bias silent drops? | ADR-0003 · ADR-0007 | P3 | open (revisit-trigger) |

## 4. Source & claim ingestion

| id | question | owning ADR/doc | resolve-by | status |
|---|---|---|---|---|
| iq-001 | Confirm CAW-05's `action-brief` wire schema + delivery (file drop vs pull endpoint) against CAW-05's own ADR-0007; reconcile at the boundary | ADR-0005 · [source-and-claim-ingestion](../02-research/source-and-claim-ingestion.md) | P1 | open |
| iq-002 | Claim-extraction method — single extract+attribute pass vs a verify pass re-checking each claim against its span; acceptable false-claim rate before review? | ADR-0005 | P1 | open |
| iq-003 | Is abstract+metadata enough for `memory-traffic` claim extraction, or is arXiv full text/PDF required for v1? | ADR-0005 | P1 | open |
| iq-004 | Semantic Scholar — pursue an API key for >1 RPS, or stay on the shared unauth pool for v1 volume? | ADR-0005 | P1 | open |
| iq-005 | Dedup tie-break when CAW-05's `canonical_id` disagrees with our directly-discovered id — which wins? | ADR-0005 | P1 | open |

## 5. Implication mapping & export

| id | question | owning ADR/doc | resolve-by | status |
|---|---|---|---|---|
| eq-001 | Should refuted implications export to CAW-01 as explicit "axis not observed" signals, or stay only as CAW-02 negative knowledge? | ADR-0006 · ADR-0008 | P3 | open |
| eq-002 | Do we need an implication-level priority/score (e.g. blocks-a-future-workload-assumption) to rank what exports first? | ADR-0006 | P4 | open |
| eq-003 | Can one implication legitimately target both CAW-01 and CAW-02 (hardware domain) — two bundles or one? | ADR-0006 | P3 | open |
| eq-004 | Reconcile confidence: 3-value enum (ADR-0006) vs ADR-0002's 5-value scale — reconcile or map at the boundary? | ADR-0006 · ADR-0002 | P2 | open |
| eq-005 | File-drop or HTTP for v1 transport given CAW-01/CAW-02 deploy independently — and agreed drop location/auth per target? | ADR-0008 | P2 | open |
| eq-006 | Do we need signing/verification on outbound bundles (mirroring CAW-05's signed import) for downstream trust? | ADR-0008 | P3 | open |

## 6. Storage & scheduling

| id | question | owning ADR/doc | resolve-by | status |
|---|---|---|---|---|
| sq-001 | Index backend — SQLite vs a flat JSON index; does v1 query volume justify SQLite? | ADR-0007 | P4 | open |
| sq-002 | Scheduler host — long-running daemon vs OS cron invoking a CLI entrypoint; which fits a single-operator product? | ADR-0007 | P1 | open |
| sq-003 | Concurrency — can two scheduled runs touch the same thread; do we need per-thread file locks? | ADR-0007 | P3 | open |

## 7. Product surface & scout

| id | question | owning ADR/doc | resolve-by | status |
|---|---|---|---|---|
| pq-001 | Is a Run one synchronous process or resumable stage-jobs with a handle? (affects CLI/MCP shape) | ADR-0001 | P1 | open |
| pq-002 | Heartbeat / dead-man's-switch sink given "no shared substrate" — local "no receipt in N days" alarm? | ADR-0001 | P2 | open |
| pq-003 | Does a CAW-05 import trigger an immediate single-thread Run, or just enqueue for the next scheduled Run? | ADR-0001 | P1 | open |

## 8. Cross-references (dedup notes)

These questions recur across docs; the canonical id above absorbs the duplicates:

| Canonical id | Also stated in | As |
|---|---|---|
| wbq-001 | [ttt-landscape](../02-research/ttt-landscape.md) OQ-4; [hypothesis-representation](../02-research/hypothesis-representation.md) | "which variants write back" / optimizer-state dominance |
| wbq-004 | [ttt-landscape](../02-research/ttt-landscape.md) OQ-7 | endurance only on non-volatile media |
| wbq-007 | ADR-0003 write-side measurement; [experiment-ledger](../02-research/experiment-ledger.md) | written-byte volume |
| wbq-008 | [ttt-landscape](../02-research/ttt-landscape.md) OQ-5; PRODUCT-BRIEF §5 | model at L0/L1 pre-syntorch |
| wbq-012 | ADR-0008 minimal-field-set; cross-links wbq-002 | null+basis acceptance |
| hq-005 | ADR-0008 CAW-02 uncertainty encoding | shared status vocab vs adapter-boundary map |
| lq-005 | ADR-0007 retention/GC | failure-artifact retention |
| lq-006 | ADR-0007 force-entry-on-launch | de-bias silent drops |
| eq-001 | ADR-0008 refuted→CAW-01 | "axis not observed" export |

## Implications for runbooks

- Every `TODO(open-question: …)` in a runbook MUST cite an id here; closing a question is a documented event
  (which track/result closed it), not a silent edit.
- `decided→validate` items (wbq-008) are NOT re-opened — their runbooks implement the ADR decision and the
  matching test in [validation-and-tests.md](./validation-and-tests.md) guards it.
- `export-ask` items (wbq-002, wbq-012) ship **inside the CAW-01 bundle as open questions** — CAW-06 never
  changes CAW-01's IR; CAW-01 is a separate product (no shared store).
