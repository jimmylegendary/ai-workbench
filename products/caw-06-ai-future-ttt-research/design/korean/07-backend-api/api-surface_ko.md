# Backend API Surface — 핵심 op 계약 (타입 지정)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [./scout-service_ko.md](./scout-service_ko.md)
  - [./experiment-runner-service_ko.md](./experiment-runner-service_ko.md)
  - [./persistence_ko.md](./persistence_ko.md)
  - [../01-decisions/ADR-0001-product-surface-and-scout_ko.md](../01-decisions/ADR-0001-product-surface-and-scout_ko.md)
  - [../01-decisions/ADR-0002-hypothesis-representation_ko.md](../01-decisions/ADR-0002-hypothesis-representation_ko.md)
  - [../01-decisions/ADR-0003-experiment-ledger_ko.md](../01-decisions/ADR-0003-experiment-ledger_ko.md)
  - [../01-decisions/ADR-0004-writeback-traffic-schema_ko.md](../01-decisions/ADR-0004-writeback-traffic-schema_ko.md)
  - [../01-decisions/ADR-0008-export-boundaries_ko.md](../01-decisions/ADR-0008-export-boundaries_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적
ADR-0001에 따라 모든 surface(스케줄/트리거 기반 파이프라인, CLI, MCP)가 구동하는 **검증된 타입 op의 단일 집합**을
정의한다. 이곳은 과대주장 방지 불변식, provenance 스탬핑, 그리고 사람 검토 게이트가 강제되는 단일 경계이며 —
surface는 얇다(thin). 이 문서는 파이프라인 오케스트레이션([scout-service_ko.md](./scout-service_ko.md)),
runner 내부 구조([experiment-runner-service_ko.md](./experiment-runner-service_ko.md)), 디스크 레이아웃
([persistence_ko.md](./persistence_ko.md))을 정의하지 않는다. 이것들은 안정적인 경계로서 소비된다. **거버넌스는
surface가 아니라 항상 core에 존재한다** — surface는 경로를 *요청*할 수 있을 뿐이며, 검토 게이트를 거친 후 promotion이나
export를 수행하는 것은 오직 core뿐이다.

## 모든 op에 대한 규약
- **전송 방식 비의존(Transport-agnostic).** 각 op는 타입이 지정된 함수다. CLI 서브커맨드와 MCP 도구는 1:1 래퍼다.
  어떤 surface도 op 집합이 표현하지 않는 로직을 담지 않는다(surface 로컬 규칙은 계약 누수다 — ADR-0001).
- **결과 봉투(Result envelope).** 모든 op는 `{ ok, value?, error?, warnings[], proposed_events[] }`를 반환한다.
  변경을 일으키는 종단(mutating-terminal) op는 절대 직접 적용하지 않는다. 검토 큐에 `proposed_event`를 추가한다
  (ADR-0007 §6).
- **Provenance + 불확실성은 제거 불가능.** `status` + `uncertainty` 없이는 어떤 것도 op 경계를 넘지 못한다
  (ADR-0002). 생성된 텍스트는 항상 `generated:true`로 태깅되며 **증거(evidence)가 아니다**(brief §12).
- **멱등성 키(Idempotency key).** Write op는 선택적 `idem_key`를 받는다. 같은 키로 재실행하면 이전 결과를 반환하는
  no-op이 된다(재개 가능한 Run을 지원함, ADR-0001 / ADR-0007).

```
type OpResult<T> = {
  ok: boolean
  value?: T
  error?: { code: string; message: string; retryable: boolean }
  warnings: string[]
  proposed_events: ProposedEvent[]   // review-queue items; never auto-applied
}
type ProposedEvent =
  | { kind: "status_promotion"; hypothesis_id: string; to: HypothesisStatus }
  | { kind: "export"; target: "caw-01" | "caw-02"; ref: string }
type Boundary = "internal" | "import:caw-05" | "export:caw-01" | "export:caw-02"
type Confidence = "very-low" | "low" | "medium" | "high"   // calibrated, qualitative (ADR-0002)
```

## Op 패밀리

| Family | Op | Mutates | Terminal-gated | Notes |
|---|---|---|---|---|
| Ingest | `ingest.discover` | yes | no | SourceAdapter 실행; `Source` 영속화 (ADR-0005) |
| Ingest | `ingest.import_caw05` | yes | no | CAW-05 신호 번들 가져오기(별도 제품) |
| Ingest | `ingest.extract_claims` | yes | no | `Source → CandidateClaim`; 절대 자동 `Claim` 아님 |
| Hypothesis | `hyp.create` | yes | no | 기본값 `status=hypothesis`, `confidence=very-low` |
| Hypothesis | `hyp.attach_evidence` | yes | no | Evidence 연결; evidence cap 준수 |
| Hypothesis | `hyp.propose_status` | proposal | **yes** | promotion → 검토 큐, 절대 적용되지 않음 |
| Hypothesis | `hyp.get` / `hyp.list` | no | no | 읽기; 카드 렌더에 status+confidence+이력 표시 |
| Experiment | `exp.plan` | yes | no | prediction + decision_rule 사전 등록 |
| Experiment | `exp.run` | yes | no | runner로 디스패치; 매 실행마다 항목 생성 |
| Experiment | `exp.log_result` | yes | no | verdict + 재현 블록 추가 |
| Experiment | `exp.negative_results` | no | no | 실패 우선(failures-first) 표출 뷰 (ADR-0003) |
| Writeback | `wb.estimate` | yes | no | 분석적 L0 `wbtraffic.v0` (ADR-0004) |
| Writeback | `wb.get` | no | no | 산출물 읽기(status/uncertainty 인라인) |
| Implication | `impl.map` | yes | no | finding에 대한 ImplicationMap 구축 (ADR-0006) |
| Export | `export.stage` | yes | no | 번들 구축 + `validate()` 게이트 실행 |
| Export | `export.commit` | proposal | **yes** | `supported` export → 검토 큐 |
| Schedule | `sched.register` / `sched.fire` / `sched.status` | yes/no | no | cron + 트리거 (ADR-0007) |

### Ingest
```
ingest.discover(family: string, since?: FetchCursor) -> OpResult<{ sources: SourceRef[]; cursor: FetchCursor }>
ingest.import_caw05(bundle_path: string) -> OpResult<{ source: SourceRef }>   // boundary=import:caw-05
ingest.extract_claims(source_id: string) -> OpResult<{ candidates: CandidateClaimRef[] }>
```
추출은 `CandidateClaim`(제안됨, `generated:true`)을 내보내며, 확정된 `Claim`은 절대 내보내지 않는다.
`(source_id, content_hash)`에 대해 멱등적이다 — 재추출은 중복을 만들지 않는다.

### Hypothesis
```
hyp.create(claim_ref: string, statement: string) -> OpResult<HypothesisRef>
  // status defaults to "hypothesis"; confidence="very-low"; a hypothesis is NEVER a settled claim
hyp.attach_evidence(hypothesis_id, ev: { kind: "experiment"|"citation"|"generated"; ref: string }) -> OpResult<void>
  // HARD CAP: generated evidence cannot raise confidence or propose a promotion (ADR-0002)
hyp.propose_status(hypothesis_id, to: HypothesisStatus, rationale_ref: string) -> OpResult<void>
  // appends proposed_events[{status_promotion}]; the four states are reversible; never auto-applied
```
`HypothesisStatus = "hypothesis" | "supported" | "refuted" | "inconclusive"`(되돌릴 수 있음; 기본값 `hypothesis`).
`confidence ≤ evidence_strength`는 core 측에서 강제된다. 어떤 op도 generated 증거만으로 `supported`를 설정할 수 없다.

### Experiment
```
exp.plan(hypothesis_id, prediction: Prediction) -> OpResult<ExpPlanRef>
  // Prediction = { metric, baseline, expected_direction, decision_rule }  pre-registered (ADR-0003 R6)
exp.run(plan_id, runner: string) -> OpResult<{ exp_id: string }>           // entry created on EVERY launch
exp.log_result(exp_id, results, verdict: Verdict) -> OpResult<{ evidence_ref: string }>
exp.negative_results(filter?: { failure_mode?, hypothesis_id? }) -> OpResult<LedgerEntryRef[]>
```
`Verdict = "supported" | "refuted" | "inconclusive" | "invalid"`. verdict는 reproducibility gate를 통과한
후에만 채택 가능하다(아니면 강제로 `invalid`). 토이(toy) 규모에서의 `supported`는 `Evidence` 레코드와 **제안된**
`StatusEvent`를 생성한다 — 확정된 claim은 절대 아니다(ADR-0003 §2).

### Writeback (CAW-01 브리지 — 공유 저장소가 아니라 export)
```
wb.estimate(variant_id, assumptions: WbAssumptions) -> OpResult<WbTrafficV0>   // analytic L0 (ADR-0004)
wb.get(artifact_id) -> OpResult<WbTrafficV0>
```
모든 수치는 기본값이 `null`이다. 중요한 미지값은 `TODO(open-question: …)`가 되며, 절대 지어낸 숫자가 아니다.
모델링된 숫자는 측정된 `writeback_observed`와 구별되도록 명확히 표시된다(ADR-0003). CAW-01의 L0 객체 + open question으로
내리는(lowering) 작업은 export 시점에 일어나며, 여기서가 아니다. CAW-01 IR 객체 이름은 CAW-01이 소유한다 — 재검증할 것.

### Implication
```
impl.map(finding_id) -> OpResult<ImplicationMap>   // domains: AI services, education, dev platforms,
                                                   //          models, hardware, memory-centric (ADR-0006)
```
맵의 `summary`는 명시적으로 `generated:true`이며 **증거가 아니다**. implication별 불확실성은 인라인으로 함께 이동한다.

### Export
```
export.stage(target: "caw-01"|"caw-02", ref: string) -> OpResult<{ bundle: ExportBundle; gate: GateResult }>
export.commit(bundle_id) -> OpResult<void>   // proposal-only when payload status=supported (human gate)
```
`ExportAdapter`는 유일한 export 이음새(seam)다(ADR-0008). 번들은 자기 기술적(self-describing)이다
(`schema_version`, `producer`, `content_hash`, `provenance`, `boundary`). `validate()`는 어떤 쓰기보다 먼저
타깃별 게이트를 실행한다. 실패한 export는 로깅되며 finding은 계속 export 가능한 상태로 남는다(실패가 일급 시민).
CAW-06는 절대 다른 제품의 저장소에 쓰지 않는다.

### Schedule
```
sched.register(family, schedule: CronExpr) -> OpResult<void>
sched.fire(family|thread_id, now?: boolean) -> OpResult<{ run_id: string }>
sched.status() -> OpResult<{ runs: RunReceipt[]; cursors: Record<string, FetchCursor> }>
```
스케줄러는 **발화(fire)**만 한다. 따라잡기(catch-up)/중첩/하트비트는 Run 래퍼에 존재한다
([scout-service_ko.md](./scout-service_ko.md)).

## 과대주장 방지 불변식 (여기서 강제, 어떤 surface에서도 아님)
| 불변식 | Op 강제 방식 |
|---|---|
| Hypothesis ≠ 확정된 claim | `hyp.create`는 `status=hypothesis`를 기본값으로; promotion은 proposal 전용 |
| Generated ≠ 증거 | `hyp.attach_evidence(kind=generated)`는 confidence를 올리거나 promotion을 제안할 수 없음 |
| Evidence cap | `confidence ≤ evidence_strength`, 모든 write에서 core 측 검사 |
| 실패는 유용함 | `exp.run`은 크래시를 포함해 매 실행마다 ledger 항목을 강제함 |
| 공유 저장소 없음 | export op는 파일/API 경계를 넘는 번들을 내보냄; 외부 쓰기 없음 |
| 사람 검토자 | 종단 op(`hyp.propose_status`, `export.commit`)는 proposed_events를 큐에 넣을 뿐 |

## 미해결 질문(Open Questions)
- TODO(open-question: is a Run synchronous or resumable stage-jobs with a handle — affects `sched.status`/`exp.run` return shape; ADR-0001.)
- TODO(open-question: does `ingest.import_caw05` trigger an immediate single-thread Run or enqueue for next pass; ADR-0001.)
- [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md) 참고.

## 런북에 대한 함의
- core를 감싸는 op 패밀리당 하나의 런북. CLI와 MCP는 op 매니페스트로부터 1:1로 생성됨.
- 적합성(conformance) 테스트가 CLI ↔ MCP ↔ 파이프라인이 동일한 op를 호출함을 단언함(surface 로컬 로직 없음).
- 종단 op는 적용이 아니라 큐잉(enqueue)함을 증명하도록 단위 테스트되어야 함.
