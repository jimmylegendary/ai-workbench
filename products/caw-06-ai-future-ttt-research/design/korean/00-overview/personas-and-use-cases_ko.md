# 페르소나 및 활용 사례 — CAW-06

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [vision_ko.md](vision_ko.md)
  - [scope-and-non-goals_ko.md](scope-and-non-goals_ko.md)
  - [../01-decisions/ADR-0001-product-surface-and-scout_ko.md](../01-decisions/ADR-0001-product-surface-and-scout_ko.md)
  - [../01-decisions/ADR-0002-hypothesis-representation_ko.md](../01-decisions/ADR-0002-hypothesis-representation_ko.md)
  - [../01-decisions/ADR-0003-experiment-ledger_ko.md](../01-decisions/ADR-0003-experiment-ledger_ko.md)
  - [../01-decisions/ADR-0008-export-boundaries_ko.md](../01-decisions/ADR-0008-export-boundaries_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적
CAW-06가 누구를 위한 것인지, 그리고 각 표면(surface)이 지원해야 하는 구체적인 활용 사례를 명시한다. 각 활용 사례를 파이프라인
단계, 그것을 규율하는 ADR, 그리고 과장 금지(no-overclaim) / 실패도 유용(failures-useful) 불변 조건에 연결한다. 표면 API
(see [ADR-0001](../01-decisions/ADR-0001-product-surface-and-scout_ko.md))나 스키마(주제별 ADR 참조)는 명시하지 않는다.

## 페르소나
| 페르소나 | 누구 | 목표 | 권한 / 제약 |
|---|---|---|---|
| **Jimmy** | 연구자 / 리뷰어 | 떠들썩한 TTT 주장을 검증 가능한 스레드로 전환하고, 무엇이 CAW-01/02에 도달할지 결정 | **인간 판정자(adjudicator)**: `→ supported` 승격(promotion)을 확정하고 모든 `supported` export를 승인하는 것은 오직 Jimmy뿐 (brief §12, ADR-0002) |
| **The team** | 협업자 | 스레드 검사, 실험 재현, implication map 열람 | store + CLI/MCP를 소비; scout를 실행할 수 있으나 게이트는 우회할 수 없음 |
| **ExperimentScout agent** | 자동화된 파이프라인 | discover → extract → generate → plan → log → map | **제안할 뿐, 절대 결정하지 않음**: `status=hypothesis`, `confidence=very-low`로 가설을 생성; `generated` 증거로는 승격 불가; 실패한 게이트를 건너뛰는 export 불가 |

**권한의 분리:** 에이전트는 *제안*하고(가설, 실험 계획, 모델링된 추정치, implication 초안), Jimmy는 *판정*한다(승격,
전략적 export). 표현(representation)은 판정되지 않은 상태를 구조적 기본값으로 만든다 (ADR-0002).

## 표면(코어 하나, 얇은 표면 셋)
하나의 ExperimentScout 파이프라인 코어; **예약/트리거 기반 파이프라인 + CLI + MCP**가 이를 구동하며; 다섯 가지 출력 아티팩트
종류가 하나의 스레드 store에서 파생된다 (ADR-0001). 아래 활용 사례는 별도 명시가 없는 한 표면에 무관하다.

## 활용 사례
### UC-1 — Scout: 소스 → 주장 → 가설
- **Actor:** ExperimentScout (예약/트리거) · **Jimmy**가 검토.
- **Flow:** TTT 소스를 discover → `Claim`을 추출(`asserted_by` 출처 포함) → `Hypothesis` 레코드를 생성,
  각각 `status=hypothesis`, `confidence=very-low`, 나중에 승격 가능하려면 **`falsifiability` 필수**.
- **단계 / ADR:** S1–S5 ingestion ([ADR-0005](../01-decisions/ADR-0005-source-and-claim-ingestion_ko.md));
  가설 형태 ([ADR-0002](../01-decisions/ADR-0002-hypothesis-representation_ko.md)).
- **과장 금지 점검:** `Claim`은 "<source>가 주장하기를 …"으로 렌더링되며, 결코 "…는 사실이다"로 렌더링되지 않음; 생성된
  가설은 status 없이 직렬화되지 않음.
- **Done:** 출처와 falsifiability(또는 `TODO`)를 갖춘 새 스레드가 `store/{claims,hypotheses}`에 존재.

### UC-2 — 토이 실험 + 로그(실패 포함)
- **Actor:** ExperimentScout / 팀이 로컬 runner로 · **Jimmy**가 verdict 검토.
- **Flow:** 검증 가능한 주장 하나에 대해 **사전 등록된 결정 규칙(pre-registered decision rule)**이 있는 최소 재현을 계획 → 실행 →
  config+seed+env를 담은 **단 하나의 append-only 원장(ledger) 항목**(`EXP-XXXX`)을 작성(**reproducibility gate**) → verdict가
  `Evidence` 레코드가 되고 `StatusEvent`를 제안.
- **단계 / ADR:** [ADR-0003](../01-decisions/ADR-0003-experiment-ledger_ko.md); status 전이
  [ADR-0002](../01-decisions/ADR-0002-hypothesis-representation_ko.md).
- **실패도 유용 점검:** 음성/실패한 run은 **기본적으로 보존되고, 분류되며, 표면화됨**; 그것은
  `refuted` 또는 `inconclusive`로 매핑됨(절대 버려지지 않고, 절대 조용히 재시도해 양성으로 둔갑시키지 않음).

```
verdict ∈ {supports, refutes, inconclusive, invalid}   # four-value, gated by the pre-registered rule
  supports     → Evidence(experiment) → StatusEvent(hypothesis → supported*)   *human-confirmed
  refutes      → Evidence(experiment) → StatusEvent(hypothesis → refuted)      first-class negative
  inconclusive → Evidence(experiment) → StatusEvent(→ inconclusive)            kept, exportable
  invalid      → reproducibility gate failed → no status change; logged
```

### UC-3 — 발견에 대한 implication map
- **Actor:** ExperimentScout가 초안 작성 · **Jimmy**가 검토.
- **Flow:** 각 발견마다 도메인 전반(AI 서비스, 교육, 개발 플랫폼, 모델, 하드웨어, 메모리 중심 시스템)에 걸쳐 하나의
  `ImplicationMap`을 구축하며, 요약은 **명시적으로 generated(증거 아님)로 표시**.
- **ADR:** [ADR-0006](../01-decisions/ADR-0006-implication-mapping_ko.md).
- **과장 금지 점검:** 생성된 산문은 `generated` 마커를 지니며 오직 `inconclusive`에만 정보를 제공할 수 있음 — status를
  결코 승격시킬 수 없음.

### UC-4 — Writeback-traffic 스키마 → CAW-01 (가교)
- **Actor:** ExperimentScout가 생산 · **Jimmy**가 export 승인.
- **Flow:** TTT 변형(variant)에 대해 하나의 `wbtraffic.v0` **분석적 L0 추정치**를 방출(수치는 명시된 가정과 함께 모델링되거나
  토이 run에서 측정되지 않는 한 `null`) → `ExportAdapter` → `Caw01WritebackAdapter`가 자기 기술적(self-describing) 번들
  (스키마 필드 **및** open question)을 CAW-01의 기존 L0 객체로 내려보냄(lower).
- **ADR:** [ADR-0004](../01-decisions/ADR-0004-writeback-traffic-schema_ko.md),
  [ADR-0008](../01-decisions/ADR-0008-export-boundaries_ko.md).
- **경계 점검:** export는 **공유 store가 아니라 파일 경계를 가로질러** 이루어짐; 모델링됨(modeled) ≠ 측정됨(measured)(별도로
  플래그됨); `hypothesis` status 항목은 **open question으로만** export되며, 결코 확정된 워크로드 요구사항으로 export되지 않음;
  CAW-01은 자신의 IR 이름을 소유함(경계에서 재검증).

### UC-5 — CAW-05 레이더 신호 import → 스레드 개시
- **Actor:** ExperimentScout가 `SourceAdapter`를 통해.
- **Flow:** **CAW-05(별도 제품)**에서 TTT 신호를 import → `status=hypothesis`, `confidence=very-low`로 `Hypothesis`를 개시;
  신호는 `external` 증거로 저장됨 — **절대 자동 승격되지 않고**, 우리 자신의 판단과 결코 혼동되지 않음.
- **ADR:** [ADR-0005](../01-decisions/ADR-0005-source-and-claim-ingestion_ko.md),
  [ADR-0002](../01-decisions/ADR-0002-hypothesis-representation_ko.md).

### UC-6 — 주장+증거 export → CAW-02
- **Actor:** ExperimentScout가 제안 · **Jimmy**가 승인.
- **Flow:** 스레드가 ≥1개의 해결 증거(resolving evidence)와 출처를 갖춘 채 `status ∈ {supported, refuted, inconclusive}`에
  도달하면 → `ExportAdapter` → `Caw02ClaimAdapter`가 주장 + 증거 + `confidence` + 명시적 `not_evidence[]` 목록 +
  불확실성 메모를 발송.
- **ADR:** [ADR-0008](../01-decisions/ADR-0008-export-boundaries_ko.md).
- **게이트 점검:** **맨 `hypothesis`는 경계에서 거부됨**; `refuted`/`inconclusive`는 export **가능**(음성 결과도 지식임);
  실패한 export는 로그되고 발견은 계속 export 가능 상태로 남음.

## 활용 사례 → 단계 → 불변 조건 매트릭스
| UC | 파이프라인 단계 | 주요 ADR | 핵심 불변 조건 |
|---|---|---|---|
| UC-1 | discover → extract → generate | ADR-0005 / 0002 | 가설은 `very-low`가 기본값, `falsifiability` 필요 |
| UC-2 | plan → run → log | ADR-0003 | 한 run = 한 append-only 항목; reproducibility gate; 실패 보존 |
| UC-3 | implication mapping | ADR-0006 | 생성된 요약은 증거가 아님 |
| UC-4 | writeback 추정 → export | ADR-0004 / 0008 | 공유 store가 아닌 export; modeled ≠ measured |
| UC-5 | import (CAW-05) | ADR-0005 / 0002 | import된 신호 = `external` 증거, 절대 자동 승격 안 됨 |
| UC-6 | export (CAW-02) | ADR-0008 | 맨 hypothesis 거부; 음성 결과는 export 가능 |

## 미해결 질문
- 인간 게이트가 적용된 승격 단계의 표면 사용성(CLI 프롬프트 vs MCP 리뷰 큐) —
  [ADR-0001](../01-decisions/ADR-0001-product-surface-and-scout_ko.md) 및
  [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md) 참조.

## 런북에 대한 함의
- 모든 표면은 모든 가설 카드에 **`status` + `confidence` + 증거를 표시**해야 함(축약 렌더링 금지).
- `supported`로의 승격과 전략적 export 단계는 세 표면 모두에서 **인간 게이트**가 적용되어야 함.
