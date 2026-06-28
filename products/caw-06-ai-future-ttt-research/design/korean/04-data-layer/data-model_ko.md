# 데이터 모델 — 엔티티, 스키마, status/uncertainty, provenance

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [storage-and-scheduling_ko.md](storage-and-scheduling_ko.md) (이 레코드들이 어디에 사는지; append-only 원장; 스케줄링)
  - [provenance-and-uncertainty_ko.md](provenance-and-uncertainty_ko.md) (status 생애주기, evidence cap, export 전달)
  - [../01-decisions/ADR-0002-hypothesis-representation.md](../01-decisions/ADR-0002-hypothesis-representation_ko.md) (Source/Claim/Hypothesis 분리, status, cap)
  - [../01-decisions/ADR-0003-experiment-ledger.md](../01-decisions/ADR-0003-experiment-ledger_ko.md) (ExperimentEntry + Result, verdict, repro gate)
  - [../01-decisions/ADR-0004-writeback-traffic-schema.md](../01-decisions/ADR-0004-writeback-traffic-schema_ko.md) (`wbtraffic.v0`)
  - [../01-decisions/ADR-0005-source-and-claim-ingestion.md](../01-decisions/ADR-0005-source-and-claim-ingestion_ko.md) (`Source`/`CandidateClaim` 생산자)
  - [../01-decisions/ADR-0006-implication-mapping.md](../01-decisions/ADR-0006-implication-mapping_ko.md) (`ImplicationMap`)
  - [../01-decisions/ADR-0008-export-boundaries.md](../01-decisions/ADR-0008-export-boundaries_ko.md) (`ExportBundle`)
  - [../02-research/experiment-ledger.md](../02-research/experiment-ledger_ko.md) (권위 있는 원장 YAML — 여기서 중복하지 않음)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적
이 문서는 CAW-06 자체 파일 저장소의 **정규 엔티티 집합(canonical entity set)**과 모든 레코드가 지니는 **공유 필드 형태(shared field shape)**를 고정한다 — 가치 단위 `source → claim → hypothesis → small experiment → result → implication` 뒤에 있는 여덟 개 엔티티 더하기 두 개의 export 산출물이다. 각 엔티티의 정체성, 핵심 필드, 상호참조와, 모든 레코드가 공유하는 세 가지 불변식(`provenance`, `status`/`uncertainty`, `boundary`)을 정의한다. 표현 규칙(ADR-0002), 원장 규율(ADR-0003), 저장 레이아웃/스케줄링(see [storage-and-scheduling_ko.md](storage-and-scheduling_ko.md))을 다시 결정하지는 **않는다**. 레코드별 완전한 서술형 스키마는 `02-research/*` 문서와 위의 ADR들에 있다. 이 문서는 그것들을 재유도하기보다 상호 링크하는 **지도(map)**다.

## 1. 엔티티 개요

| Entity | 무엇인가 | 출처(단계) | Truth status | Append-only? |
|---|---|---|---|---|
| `Source` | 공개 연구 항목(논문, 게시글) 또는 가져온 CAW-05 신호 | S1/S2 ingestion | *무엇이 존재하는지*에 대한 사실 기록 | 재발견 시 병합(merge-on-rediscover) |
| `Claim` | *source가 주장하는 것*("<source>가 X를 주장") | S4 추출 | `unverified` — 결코 우리의 결론이 아님 | append (supersede) |
| `Hypothesis` | *우리가 확인하려고 제안하는 것* — 항상 잠정적 | hypothesis 단계 | `hypothesis` (기본값 + 하한) | append (`status_log`) |
| `ExperimentEntry` | 하나의 toy/최소-재현 **run** | Run 단계 | `planned`→`done`/`aborted` | 예 (run 하나 = entry 하나) |
| `Result` | run의 verdict + 메트릭 블록 | Run 단계 | `verdict`(4-value) | 예 (해당 entry 내부) |
| `ImplicationMap` | 하나의 발견이 도메인 전반으로 펼쳐진 것 | implication 단계 | implication별 `status` | append (supersede) |
| `WritebackTrafficSchema` | variant별 `wbtraffic.v0` 산출물(CAW-01 브리지) | Run 출력 | `Hypothesis` status를 운반 | append (supersede) |
| `ExportBundle` | CAW-01/CAW-02로의 자기서술적 단방향 push | export seam | source 항목 status를 반영 | append (receipts) |

> 분리는 구조적이며 미관상의 것이 아니다(brief §12). `Source`/`Claim`/`Hypothesis`/`Evidence`는 결코 하나의 "fact" 레코드로 **병합되지 않는다** — 이것이 ADR-0002의 하중을 받치는(load-bearing) 불변식이다. 시행 규칙은 [provenance-and-uncertainty_ko.md](provenance-and-uncertainty_ko.md)를 보라.

## 2. 공유 envelope (모든 레코드)
종류와 무관하게 모든 레코드는 공통 front-matter envelope를 지닌다. 생산자는 이를 반드시 채워야 하며, 검증기는 이것이 없는 레코드를 거부한다(brief §7).

```yaml
# shared envelope (front-matter on every md/JSON record)
id: <PREFIX>-NNNN              # stable, monotonic; prefix per entity (SRC/CLAIM/HYP/EXP/IMAP/WBT/EXB)
kind: source|claim|hypothesis|experiment|implication-map|wbtraffic|export-bundle
created: TODO(open-question: do not invent dates)
provenance:                   # where it came from — always present
  source_ids: [SRC-0001]      # upstream sources (may be empty for pure-generated artifacts)
  origin: arxiv|semantic-scholar|caw05|generated|experiment
  retrieved_at: TODO
boundary: internal|export:caw-01|export:caw-02   # scope/destination tag (brief §7, §12)
status: <entity-specific>     # see each entity below; NEVER omitted on Hypothesis-bearing records
lineage:
  supersedes: null            # id this record corrects/refines (append-only model)
  derived_from: null
```

`generated` 콘텐츠(LLM 패러프레이즈, 요약)는 어디에 나타나든 항상 `evidence:false`로 태그되며, 결코 `Source`/`Claim`/`Result` 참조를 대체하지 않는다(ADR-0002, ADR-0005).

## 3. 엔티티 스키마

### 3.1 Source
공개 항목 또는 CAW-05 import. 다중 출처 재발견은 여러 `provenance` 항목을 가진 **하나의** `Source`로 병합된다(dedup: DOI ▸ arXiv id ▸ normalized(title+first-author+year), ADR-0005 §4).

```yaml
id: SRC-0001
kind: source
title: "..."
authors: [...]
canonical_id: "doi:..." | "arxiv:2411.07279"
versions: ["v1","v2"]                 # arXiv versions kept distinct-but-linked
provenance:
  - {origin: arxiv, url: "...", retrieved_at: TODO, native_id: "2411.07279"}
  - {origin: caw05, bundle_id: "...", evidence: false}   # CAW-05 prose is non-evidential
boundary: internal
```

### 3.2 Claim
source가 주장하는 것 — 추출적이며 귀속 가능(verbatim span + locator). `status`는 항상 `unverified`이고, 추출은 결코 `supported`를 내보내지 않는다(ADR-0005 §5).

```yaml
id: CLAIM-0011
kind: claim
source_id: SRC-0001
statement: "<source> reports per-instance LoRA TTT lifts ARC accuracy over a frozen base"
evidence_span: "<verbatim quote>"     # required — traceable to source text
source_locator: "p4, §3.2"
claim_type: mechanism|quantitative-result|capability|efficiency|memory-traffic|reproducibility
writes_back: true|false|unknown       # default unknown (brief §6)
asserted_by: SRC-0001                 # provenance: it is the SOURCE that asserts this, not us
status: unverified
```

### 3.3 Hypothesis
우리가 확인하려고 제안하는 것. **`status` 없이는 결코 직렬화되지 않으며**, 기본값이자 하한은 `hypothesis`다(ADR-0002 §2). Confidence/uncertainty 필드와 append-only `status_log`은 [provenance-and-uncertainty_ko.md](provenance-and-uncertainty_ko.md)에 자세히 있다.

```yaml
id: HYP-0003
kind: hypothesis
statement: "Per-instance TTT writes back enough state to register on a memory-traffic axis"
from_claims: [CLAIM-0011]
status: hypothesis|supported|refuted|inconclusive     # default+floor: hypothesis
confidence: very-low|low|moderate|high|very-high       # default very-low; capped by evidence (ADR-0002 §4)
evidence_strength: none|weak|moderate|strong
agreement: conflicting|mixed|consistent
likelihood: null                      # optional; omit unless quantified — empty != "50/50"
falsifiability: "observation that would refute"        # REQUIRED to leave `hypothesis`; else a TODO
reproducibility: unrun|single-run|replicated|failed-to-reproduce
evidence_ids: [EVID-...]              # Evidence records (experiment|external|generated)
status_log: [ ... ]                   # append-only StatusEvents (see provenance doc)
```

> 여기서의 `confidence`는 ADR-0002의 5-value 척도다. `ImplicationMap`은 3-value 척도를 쓴다. 둘은 경계에서 조용히가 아니라 명시적으로 조정된다 — `TODO(open-question: unify or map confidence scales — ADR-0002 vs ADR-0006)`.

### 3.4 ExperimentEntry + 3.5 Result
run 하나 = append-only entry 하나(ADR-0003). **권위 있는 완전한 YAML**은 [../02-research/experiment-ledger.md](../02-research/experiment-ledger_ko.md) §"ledger entry model"에 있다 — 여기서는 상호참조와 임베드된 `Result` + writeback 훅을 보여주기 위한 골격만 재현한다.

```yaml
id: EXP-0007
kind: experiment
hypothesis_id: HYP-0003               # ← Hypothesis
claim_ref: CLAIM-0011                 # ← Claim
status: planned|running|done|aborted
prediction: {metric, baseline, expected_direction, decision_rule}   # pre-registered (anti-HARK, R6)
repro: {config_path, seeds:[0,1,2], code_rev, data_ref, env_lock, hardware, budget}  # MUST gate
result:                               # the Result sub-record (verdict is the payload)
  verdict: supported|refuted|inconclusive|invalid     # invalid = setup broken, NOT refuted
  metrics_path: "artifacts/EXP-0007/metrics.json"
  observed_effect: "TODO until run"
  negative_result: false
  failure_mode: null|oom|budget-exceeded|nonconvergence|no-effect|flaky|setup-error
writeback_observed:                   # OPTIONAL hook → WritebackTrafficSchema (ADR-0004); a MEASURED number
  weights_updated: true
  state_lifecycle: "per-request, discarded on completion"
  bytes_per_update: null              # null until measured — never invented
```

| Verdict | 의미 | ~가 아님 |
|---|---|---|
| `supported` | decision rule 하에서 toy 결과가 예측된 방향과 일치 | "스케일에서도 참" / 확정된 주장 |
| `refuted` | rule 하에서 toy 결과가 예측과 모순 | "이 아이디어는 가치 없음" |
| `inconclusive` | 깨끗이 실행됐으나 rule 미충족(효과가 노이즈 내) | 로깅 실패가 아님 |
| `invalid` | setup 망가짐(OOM, 버그, leak) | `refuted` |

`Result`는 `Evidence` 레코드(`evidence_kind=experiment`) + 그 `Hypothesis`에 대한 *제안된* `StatusEvent`가 된다. **실패는 보존되고 분류되며, 결코 버려지지 않는다**(brief §5; provenance doc §evidence 참조).

### 3.6 ImplicationMap
발견마다 하나씩. 고정된 6-도메인 enum 전반에 걸쳐 유형화되고 uncertainty 태그가 붙은 `implications[]`로 펼쳐진다(ADR-0006). `summary`는 **명시적으로 generated로 표시되며 — evidence가 아니다**.

```yaml
id: IMAP-0002
kind: implication-map
finding_ref: {thread_id, kind: result|hypothesis|claim, ref_id: EXP-0007}
summary: "..."                        # GENERATED — evidence:false (never an evidence_ref)
implications:
  - impl_id: IMP-1
    domain: ai-services|education|dev-platforms|models|hardware|memory-centric-systems
    statement: "claim-about-consequences"
    status: hypothesis|supported|refuted|inconclusive   # independent of confidence
    confidence: low|medium|high
    evidence_refs: [EXP-0007]         # MUST resolve to a Result or Claim — never the summary
    writeback_payload_ref: WBT-0001   # only for CAW-01-bound implications
    export_targets: [caw-01]          # routing hint only; ADR-0008 owns the real gate
```

### 3.7 WritebackTrafficSchema (`wbtraffic.v0`)
CAW-06의 자체 variant별 산출물 — CAW-01로의 하중을 받치는(load-bearing) 브리지로, export된다(결코 공유 저장소가 아님). `provenance` + `uncertainty`(ADR-0002 status)는 필수다. **모든 수치는 `null`이 기본값**이며, 중요한 `null`은 발명된 숫자가 아니라 `TODO(open-question: …)`다. 전체 필드 집합 + L0/L1 lowering 테이블: ADR-0004 §1/§3.

```yaml
id: WBT-0001
kind: wbtraffic
schema_version: "wbtraffic.v0"
ttt_variant: "per-instance-LoRA-TTT"
provenance: {claim_id: CLAIM-0011, source_url: "..."}
uncertainty: {status: hypothesis, confidence: very-low}   # mandatory (ADR-0002)
basis: modeled|measured               # MODELED (analytic L0 estimate) flagged distinctly from MEASURED (ledger)
fast_weights: {param_count: null, dtype: null, fraction_of_model: null}
update: {granularity: token|chunk|sequence, updates_per_1k_tokens: null, writes_optimizer_state: null}
writeback: {bytes_per_update: null, write_bw_bytes_per_s: null,
            updated_state_residency: device|near_mem|host, endurance_writes_per_run: null}
ratio_curve: null                     # read/write bytes + capacity peak vs context × update-freq
assumptions: ["..."]                  # every modeled number lists its assumptions
open_questions: ["wbq-001", "..."]    # first-class — CAW-01 receives questions, not assertions
```

### 3.8 ExportBundle
제품 경계를 넘는 유일한 것. 단방향 push; 자기서술적(공유 레지스트리 없음). target별 페이로드 + gate는 ADR-0008가 소유한다. receipt는 로컬에 저장된다(`store/exports/`).

```yaml
id: EXB-0005
kind: export-bundle
target: caw-01|caw-02
schema_version: "1.0.0"               # semver, in-band
producer: "caw-06"
content_hash: "sha256:..."            # idempotency: re-emit = upsert by id+hash
provenance: {thread_id, source_ids: [SRC-0001], boundary: export:caw-01}
payload:                              # target-specific (ADR-0008 §4/§5)
  # CAW-01: kind: writeback-traffic-schema  → fields + open_questions[]  (modeled vs measured flagged)
  # CAW-02: kind: claim-with-evidence       → claim + status + confidence + evidence[] + not_evidence[]
receipt: {emitted_at: TODO, result: ok|rejected, reason: null}   # failed export stays exportable
```

## 4. 상호참조 그래프

```
Source ──asserts──▶ Claim ──seeds──▶ Hypothesis ◀──status events── Result
                                        │                              ▲
                                        │                              │ verdict
                          probed-by ────┴──────────────▶ ExperimentEntry
                                        │
   Hypothesis/Result/Claim ──finding──▶ ImplicationMap ──routes──▶ ExportBundle ──push──▶ CAW-01/CAW-02
                                        │                              ▲
   ExperimentEntry.writeback_observed ──grounds──▶ WritebackTrafficSchema (CAW-01 payload)
```

## 5. 불변식 (검증기로 시행; provenance doc 참조)
- `Hypothesis`를 운반하는 레코드는 `status` + `confidence` 없이 직렬화되지 않는다.
- `generated` 콘텐츠는 `evidence:false`이며, status를 승격시키거나 `evidence_ref`를 대신할 수 없다.
- `Claim`은 `asserted_by`를 운반한다. 그것을 우리의 결론으로 재진술하는 것은 금지된다.
- `WritebackTrafficSchema`의 모든 수치는 `null`이거나 출처가 있다(modeled-with-assumptions / measured). 결코 발명되지 않는다.
- 어떤 것도 `status`/`uncertainty`가 벗겨진 채 `boundary`를 넘지 않는다(ADR-0002 §5, ADR-0008 §5).

## Open Questions
- `TODO(open-question: unify confidence scales — ADR-0002 5-value vs ADR-0006 3-value — or map at boundary?)`
- `TODO(open-question: should `Evidence` be a first-class top-level entity dir, or stay embedded under Hypothesis/Result?)` — see [provenance-and-uncertainty_ko.md](provenance-and-uncertainty_ko.md).
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md).

## 런북에 대한 함의
- **RB (스키마 + 검증기):** 위의 공유 envelope + 여덟 개 엔티티 스키마를 구현하고 §5 불변식을 시행한다.
- **RB (resolver):** "현재 status"(Hypothesis `status_log`)와 "현재 verdict"(ExperimentEntry `supersedes`) resolver 뷰를 [storage-and-scheduling_ko.md](storage-and-scheduling_ko.md)에 따라 제공한다.
- 제품 간 참조(CAW-01/02/05)는 **import/export 경계**다 — 공유 저장소 없음(ADR-0008).
