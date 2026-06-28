# Backend API Surface — 핵심 운영 계약

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./ingestion-service_ko.md](./ingestion-service_ko.md)
  - [./synthesis-service_ko.md](./synthesis-service_ko.md)
  - [./scheduler-and-persistence_ko.md](./scheduler-and-persistence_ko.md)
  - [../01-decisions/ADR-0001-product-surface-and-outputs_ko.md](../01-decisions/ADR-0001-product-surface-and-outputs_ko.md)
  - [../01-decisions/ADR-0003-source-adapters-and-ingestion_ko.md](../01-decisions/ADR-0003-source-adapters-and-ingestion_ko.md)
  - [../01-decisions/ADR-0004-classification-and-triage_ko.md](../01-decisions/ADR-0004-classification-and-triage_ko.md)
  - [../01-decisions/ADR-0005-related-work-ledger_ko.md](../01-decisions/ADR-0005-related-work-ledger_ko.md)
  - [../01-decisions/ADR-0007-export-boundaries_ko.md](../01-decisions/ADR-0007-export-boundaries_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적
CAW-05 파이프라인 코어의 **타입이 지정된 운영 계약(typed operation contract)** 을 정의한다 — 세 개의 얇은
surface(cron으로 스케줄링되는 파이프라인, CLI, MCP)가 모두 구동하는, 검증된 단일 운영 집합이다(ADR-0001 §D).
이는 "surface"와 "core" 사이의 API 이음새(seam)다. 모든 불변식(recall floor, dedup, review gate, provenance,
`evidence:false` 표시, export 멱등성)은 surface가 아니라 이 op들 **뒤에** 존재한다. 이 문서는 운영 집합, 그들의
타입이 지정된 입출력, 그리고 오류 분류 체계(error taxonomy)를 확정한다. 개별 surface의 wire/transport(CLI 플래그,
MCP tool JSON), SourceAdapter/ExportAdapter/FormatRenderer 포트 내부, 저장소 레이아웃은 정의하지 **않는다** —
그것들은 형제 service 문서들과 그들이 인용하는 ADR에 있다.

## Operation map
op들은 파이프라인 단계별로 묶인다. 하나의 `Run`은 단계 op들을 연쇄(chain)한다. CLI/MCP는 read/feedback op를 직접
호출할 수도 있다.

| Op | Kind | Stage | Mutates | Surface exposure | Invariant enforced |
|---|---|---|---|---|---|
| `run` | command | whole pipeline | yes | cron, CLI, MCP | single-flight lock, resumable, heartbeat |
| `backfill` | command | collect (cursor-ignoring) | yes | CLI | 일회성 과거 sweep; cursor 미전진 |
| `ingest` | stage | collect+dedup | yes | internal (run), CLI debug | provenance 완전성, recall-first |
| `relevance` | stage | score | no (annotates) | internal, CLI debug | 가산적(additive), 설명가능, recall floor |
| `classify` | stage | classify+route | yes | internal, CLI debug | recall 편향, abstain→human, rationale≠evidence |
| `ledger` | command/stage | verify+append | append-only | internal, CLI | provenance-complete LedgerLink, S2 verify |
| `synthesize` | stage | render | yes (artifacts) | internal, CLI, MCP | `evidence:false` banner, noise는 절대 렌더링 안 함 |
| `export` | command/stage | emit bundle | append-only | CLI; **MCP proposal-only** | 서명됨, 멱등, novelty-threat은 human-gated |
| `status` | query | — | no | cron, CLI, MCP | 마지막 receipt / run 상태 보고 |
| `list_findings` | query | — | no | CLI, MCP | redaction은 서버 측에서 |
| `show_finding` | query | — | no | CLI, MCP | 전체 provenance manifest |
| `render` | query/command | synthesize one | yes (artifact) | CLI, MCP | finding 하나 → format 하나 |
| `mark_feedback` | command | interest update | append-only | CLI, MCP | 버전 관리됨, human-gated (ADR-0002) |
| `confirm` | command | review gate | state change | CLI; **MCP proposal-only** | 종단(terminal) route는 human 필요 (ADR-0004 §5) |

**Proposal-only 규칙 (ADR-0001 §4):** MCP에서 `novelty-threat`의 `confirm` 및 `export`는 *pending
human-gate event*를 생성한다. 에이전트는 종단 route를 절대 실행하지 않는다. Jimmy가 실행하는 CLI는 `confirm` 후에
실행할 수 있다.

## Shared types
모든 op는 이 핵심 값 객체(value object)들로 소통한다(전체 스키마는 인용된 ADR/service 문서에 있다).

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

## Operation contracts (타입 지정)
입출력은 펜스로 감싼 의사 시그니처(pseudo-signature)로 표기한다. `Result<T>` = `{ok:T} | {error: ErrorCode, detail, retryable:bool}`.

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
`run`은 멱등이다. 동일 window에 대해 `done` 상태인 Run을 재실행하면 `new=0, dup=all`이 나온다. 크래시는 마지막
완료된 단계에서 재개된다. [./scheduler-and-persistence_ko.md](./scheduler-and-persistence_ko.md)를 참고하라.

### ingest (collect + dedup)
```text
ingest(window, sources?: string[]) -> Result<IngestReport>
IngestReport = { raw_count, deduped_count, per_source:{fetched,new,dup}, cursors_advanced: string[] }
```
어댑터는 fetch+normalize만 한다. cursor와 multi-layer dedup은 코어에 있다(ADR-0003 §4–5). 상세:
[./ingestion-service_ko.md](./ingestion-service_ko.md).

### relevance
```text
relevance(finding_ids?: FindingId[]) -> Result<RelevanceScore[]>
RelevanceScore = {
  finding_id, score: float, floor_hit: bool,     # watch-list hit ⇒ never silently dropped
  contributions: { keyword:[...], topic:[...], entity:[...], author:[...], venue:[...] },
  model: "bm25-additive" | "embedding-alpha", interest_version: string,
}
```
가산적 + 설명가능(ADR-0002). `floor_hit=true`는 점수와 무관하게 finding을 recall floor 너머로 고정(pin)한다.

### classify (classify + route)
```text
classify(finding_ids: FindingId[]) -> Result<ClassifyReport>
ClassifyReport = { decided: Classification[], abstained: FindingId[], routed: {finding_id, route}[] }
```
LF→LLM→human 캐스케이드. 낮은 confidence ⇒ `abstain` → human review 큐(selective-review gate, ADR-0004). 라우팅은
결정론적이며 config로 구동된다. 상세: [./synthesis-service_ko.md](./synthesis-service_ko.md).

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
Append-only. provenance-complete한 `LedgerLink`이 감사 가능한 유일한 기록이다.

### synthesize / render
```text
synthesize(run_id) -> Result<{rendered: ArtifactRef[]}>          # all non-noise findings
render(finding_id | run_id, format: Format) -> Result<ArtifactRef>
Format = "memo" | "digest" | "slide-outline" | "paper-card" | "action-brief"
ArtifactRef = { path, format, finding_ids[], evidence:false, provenance_manifest_path }
```
`noise`는 절대 synthesize되지 않는다. 모든 artifact는 *"generated summary — not evidence"* 배너를 달고 있다.

### export
```text
export(finding_id | run_id, target: Target, mode:"emit"|"propose") -> Result<ExportRef>
Target = "CAW-02" | "CAW-03" | "CAW-01" | "CAW-06"
ExportRef = { bundle_path, target, idempotency_key, signature, status }
idempotency_key = hash(finding_id + target + classification_version)
```
`ExportAdapter` 포트가 **유일한** export 이음새(seam)다(ADR-0007). 동일 key 재발행(re-emit)은 no-op이다. MCP에서
`novelty-threat` export는 반드시 `mode:"propose"`여야 한다(pending human gate 생성). 직접 `emit`은 절대 안 된다.

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
| `LOCK_HELD` | 다른 Run이 진행 중 | no | 거부, 로깅, 쌓이지(stack) 않음 |
| `SOURCE_TRANSIENT` | rate-limit / network / 5xx | yes | backoff+jitter, cursor 미전진 |
| `SOURCE_TERMINAL` | auth/ToS/4xx config 오류 | no | 어댑터 격리(quarantine); preflight가 active stub 거부 |
| `ABSTAIN` | classifier confidence 낮음 | n/a | finding을 human 큐에 적재, 폐기 안 함 |
| `GATE_PENDING` | 종단 route가 human confirm 필요 | n/a | pending event 생성 (MCP) |
| `VERIFY_AMBIGUOUS` | S2 매치가 gate 미만 | no | LedgerLink을 `unverified`로 저장 |
| `IDEMPOTENT_NOOP` | export key 이미 발행됨 | n/a | 성공, 새 bundle 없음 |

**Recall-safe 기본값:** `SOURCE_TRANSIENT`은 cursor를 절대 전진시키지 않는다(다음 run에서 재fetch + dedup).
`ABSTAIN`은 절대 폐기하지 않는다. ingestion 오류는 watch-list hit을 절대 조용히 누락시키지 않는다.

## Open Questions
- TODO(open-question: is a Run one synchronous process or resumable stage-jobs with a handle? affects `status`
  contract — see ADR-0001/ADR-0006 open questions.)
- TODO(open-question: does `list_findings` paginate / what default filter for the MCP agent surface?)
- [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md)를 참고하라.

## 런북에 대한 함의
- 단계별로 op-module 하나씩, 각각 자신의 단일 불변식을 강제한다. surface는 op-set을 import하고 로직을 추가하지 않는다.
- `Result`/error taxonomy는 공유 인프라다. CLI는 코드를 exit code로, MCP는 tool error로 매핑한다.
- Proposal-only 종단(MCP의 `confirm`/`export`)은 MCP 출시 전에 pending-gate event store가 연결되어 있어야 한다.
