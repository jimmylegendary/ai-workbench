# Backend API Surface — the core operation contract

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./ingestion-service.md](./ingestion-service.md)
  - [./synthesis-service.md](./synthesis-service.md)
  - [./scheduler-and-persistence.md](./scheduler-and-persistence.md)
  - [../01-decisions/ADR-0001-product-surface-and-outputs.md](../01-decisions/ADR-0001-product-surface-and-outputs.md)
  - [../01-decisions/ADR-0003-source-adapters-and-ingestion.md](../01-decisions/ADR-0003-source-adapters-and-ingestion.md)
  - [../01-decisions/ADR-0004-classification-and-triage.md](../01-decisions/ADR-0004-classification-and-triage.md)
  - [../01-decisions/ADR-0005-related-work-ledger.md](../01-decisions/ADR-0005-related-work-ledger.md)
  - [../01-decisions/ADR-0007-export-boundaries.md](../01-decisions/ADR-0007-export-boundaries.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
Defines the **typed operation contract** of the CAW-05 pipeline core — the single set of vetted operations that the
three thin surfaces (cron-scheduled pipeline, CLI, MCP) all drive (ADR-0001 §D). It is the API seam between
"surface" and "core": every invariant (recall floor, dedup, review gate, provenance, `evidence:false` marking,
export idempotency) lives **behind** these ops, never in a surface. This doc fixes the operation set, their typed
inputs/outputs, and error taxonomy. It does NOT define the wire/transport of any one surface (CLI flags, MCP tool
JSON), the SourceAdapter/ExportAdapter/FormatRenderer port internals, or the storage layout — those are in the
sibling service docs and the ADRs they cite.

## Operation map
Ops group by pipeline stage. A `Run` chains the stage ops; CLI/MCP can also call read/feedback ops directly.

| Op | Kind | Stage | Mutates | Surface exposure | Invariant enforced |
|---|---|---|---|---|---|
| `run` | command | whole pipeline | yes | cron, CLI, MCP | single-flight lock, resumable, heartbeat |
| `backfill` | command | collect (cursor-ignoring) | yes | CLI | one-off historical sweep; no cursor advance |
| `ingest` | stage | collect+dedup | yes | internal (run), CLI debug | provenance complete, recall-first |
| `relevance` | stage | score | no (annotates) | internal, CLI debug | additive, explainable, recall floor |
| `classify` | stage | classify+route | yes | internal, CLI debug | recall-biased, abstain→human, rationale≠evidence |
| `ledger` | command/stage | verify+append | append-only | internal, CLI | provenance-complete LedgerLink, S2 verify |
| `synthesize` | stage | render | yes (artifacts) | internal, CLI, MCP | `evidence:false` banner, noise never rendered |
| `export` | command/stage | emit bundle | append-only | CLI; **MCP proposal-only** | signed, idempotent, human-gated for novelty-threat |
| `status` | query | — | no | cron, CLI, MCP | reports last receipt / run state |
| `list_findings` | query | — | no | CLI, MCP | redaction server-side |
| `show_finding` | query | — | no | CLI, MCP | full provenance manifest |
| `render` | query/command | synthesize one | yes (artifact) | CLI, MCP | one finding → one format |
| `mark_feedback` | command | interest update | append-only | CLI, MCP | versioned, human-gated (ADR-0002) |
| `confirm` | command | review gate | state change | CLI; **MCP proposal-only** | terminal route needs human (ADR-0004 §5) |

**Proposal-only rule (ADR-0001 §4):** on MCP, `confirm` and `export` of a `novelty-threat` create a *pending
human-gate event*; an agent never executes the terminal route. CLI run by Jimmy may execute after `confirm`.

## Shared types
All ops speak these core value objects (full schemas in the cited ADRs/service docs).

```text
RunId         = string  # e.g. "run_2026W26"  (ISO week-anchored)
FindingId     = string  # stable content-addressed id (canonical_id hash)
Window        = "weekly" | {since: date, until?: date}
Classification = {
  novelty_axis: "novelty-threat" | "support" | "adjacent" | "noise",
  signal_axis:  "signal" | "hype",
  confidence:   float,            # 0..1
  decided_by:   "LF" | "LLM" | "human",   # cascade stage (ADR-0004)
  version:      string,           # classification_version (idempotency input)
  rationale:    string,          # generated; evidence:false ALWAYS
}
Provenance    = {origin, retrieved_at, source_native_id, boundary:"public", trust}
Route         = "knowledge" | "task" | "experiment" | "open-question" | "discard"
```

```text
Finding = {
  id: FindingId,
  canonical_id: string,            # DOI ▸ arXiv id ▸ normalized title+author
  title, url, authors[], published_at, updated_at,
  summary_or_body, body_is_full_text: bool,
  provenance: Provenance[],        # MANY entries when seen across sources
  relevance: RelevanceScore | null,
  classification: Classification | null,
  route: Route | null,
  ledger_links: LedgerLinkRef[],
  evidence: false,                 # generated synthesis is never evidence
}
```

## Operation contracts (typed)
Inputs/outputs as fenced pseudo-signatures. `Result<T>` = `{ok:T} | {error: ErrorCode, detail, retryable:bool}`.

### run / backfill
```text
run(window: Window = "weekly", resume: bool = true) -> Result<RunReceipt>
backfill(since: date, until?: date) -> Result<RunReceipt>   # ignores cursors
RunReceipt = {
  run_id, window, started_at, ended_at, status,
  per_source: { <source>: {fetched, new, dup, errors} },
  classified_counts: { <novelty_axis>x<signal_axis>: int },
  exports: ExportRef[], alerts: string[],
}
```
`run` is idempotent: re-running a `done` Run over the same window yields `new=0, dup=all`. A crash resumes at the
last completed stage. See [./scheduler-and-persistence.md](./scheduler-and-persistence.md).

### ingest (collect + dedup)
```text
ingest(window, sources?: string[]) -> Result<IngestReport>
IngestReport = { raw_count, deduped_count, per_source:{fetched,new,dup}, cursors_advanced: string[] }
```
Adapters fetch+normalize only; cursors + multi-layer dedup live in the core (ADR-0003 §4–5). Detail:
[./ingestion-service.md](./ingestion-service.md).

### relevance
```text
relevance(finding_ids?: FindingId[]) -> Result<RelevanceScore[]>
RelevanceScore = {
  finding_id, score: float, floor_hit: bool,     # watch-list hit ⇒ never silently dropped
  contributions: { keyword:[...], topic:[...], entity:[...], author:[...], venue:[...] },
  model: "bm25-additive" | "embedding-alpha", interest_version: string,
}
```
Additive + explainable (ADR-0002). `floor_hit=true` pins a finding past the recall floor regardless of score.

### classify (classify + route)
```text
classify(finding_ids: FindingId[]) -> Result<ClassifyReport>
ClassifyReport = { decided: Classification[], abstained: FindingId[], routed: {finding_id, route}[] }
```
LF→LLM→human cascade; low confidence ⇒ `abstain` → human review queue (selective-review gate, ADR-0004). Routing
is deterministic config-driven. Detail: [./synthesis-service.md](./synthesis-service.md).

### ledger (verify + append)
```text
ledger_append(finding_id, target_ref) -> Result<LedgerLink>
ledger_verify(finding_id) -> Result<VerificationRecord>
LedgerLink = {
  link_id, finding_id, watched_target_id, relation,
  verification: VerificationRecord, provenance: Provenance[], superseded_by?: link_id,
}
VerificationRecord = {                       # Semantic Scholar gate (ADR-0005)
  method:"semantic-scholar", title_levenshtein: float, year_delta: int,
  matched_paper_id?: string, verdict:"verified"|"unverified"|"ambiguous",
}
```
Append-only; a provenance-complete `LedgerLink` is the single auditable record.

### synthesize / render
```text
synthesize(run_id) -> Result<{rendered: ArtifactRef[]}>          # all non-noise findings
render(finding_id | run_id, format: Format) -> Result<ArtifactRef>
Format = "memo" | "digest" | "slide-outline" | "paper-card" | "action-brief"
ArtifactRef = { path, format, finding_ids[], evidence:false, provenance_manifest_path }
```
`noise` is never synthesized. Every artifact carries the *"generated summary — not evidence"* banner.

### export
```text
export(finding_id | run_id, target: Target, mode:"emit"|"propose") -> Result<ExportRef>
Target = "CAW-02" | "CAW-03" | "CAW-01" | "CAW-06"
ExportRef = { bundle_path, target, idempotency_key, signature, status }
idempotency_key = hash(finding_id + target + classification_version)
```
The `ExportAdapter` port is the **only** export seam (ADR-0007). Re-emitting the same key is a no-op. On MCP a
`novelty-threat` export must be `mode:"propose"` (creates a pending human gate); never a direct `emit`.

### queries & feedback
```text
status(run_id?) -> Result<RunStatus>           # state machine pos + last receipt + heartbeat age
list_findings(window?, filter?) -> Result<FindingSummary[]>
show_finding(finding_id) -> Result<Finding>     # full provenance manifest
mark_feedback(finding_id, label) -> Result<FeedbackReceipt>   # versioned interest signal (ADR-0002)
confirm(finding_id, route) -> Result<ConfirmReceipt>          # human review gate
```

## Error taxonomy
| ErrorCode | Meaning | Retryable | Surface behavior |
|---|---|---|---|
| `LOCK_HELD` | another Run in flight | no | refused, logged, not stacked |
| `SOURCE_TRANSIENT` | rate-limit / network / 5xx | yes | backoff+jitter, cursor NOT advanced |
| `SOURCE_TERMINAL` | auth/ToS/4xx config error | no | adapter quarantined; preflight refuses active stub |
| `ABSTAIN` | classifier low confidence | n/a | finding queued for human, not dropped |
| `GATE_PENDING` | terminal route needs human confirm | n/a | pending event created (MCP) |
| `VERIFY_AMBIGUOUS` | S2 match below gate | no | LedgerLink stored `unverified` |
| `IDEMPOTENT_NOOP` | export key already emitted | n/a | success, no new bundle |

**Recall-safe defaults:** a `SOURCE_TRANSIENT` never advances the cursor (re-fetch + dedup next run); an `ABSTAIN`
never discards; an ingestion error never silently drops a watch-list hit.

## Open Questions
- TODO(open-question: is a Run one synchronous process or resumable stage-jobs with a handle? affects `status`
  contract — see ADR-0001/ADR-0006 open questions.)
- TODO(open-question: does `list_findings` paginate / what default filter for the MCP agent surface?)
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks
- One op-module per stage, each enforcing its single invariant; surfaces import the op-set, add no logic.
- `Result`/error taxonomy is shared infrastructure; CLI maps codes to exit codes, MCP to tool errors.
- Proposal-only terminals (`confirm`/`export` on MCP) need a pending-gate event store wired before MCP ships.
