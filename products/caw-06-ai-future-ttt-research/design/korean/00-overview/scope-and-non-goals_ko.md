# 범위 및 비목표 — CAW-06

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [vision_ko.md](vision_ko.md)
  - [personas-and-use-cases_ko.md](personas-and-use-cases_ko.md)
  - [../01-decisions/ADR-0001-product-surface-and-scout_ko.md](../01-decisions/ADR-0001-product-surface-and-scout_ko.md)
  - [../01-decisions/ADR-0004-writeback-traffic-schema_ko.md](../01-decisions/ADR-0004-writeback-traffic-schema_ko.md)
  - [../01-decisions/ADR-0008-export-boundaries_ko.md](../01-decisions/ADR-0008-export-boundaries_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적
v1 경계를 긋는다: CAW-06가 **하는 일**(검증 가능한 TTT 주장 하나 → 토이 실험 → implication; 분석적 L0 writeback 추정치
하나), **하지 않는 일**(대규모 학습 없음, 확정된 주장 없음, CAW-01/02/05가 아님, 전체 syntorch/vLLM 없음), 그리고 이 제품을
독립적으로 유지하는 **export 경계**. brief의 §11 비목표를 구체화하며, 어떤 ADR도 재정의하지 않는다.

## 범위 내 (v1)
| # | 역량 | 근거 |
|---|---|---|
| S-1 | 세 개의 얇은 표면 뒤의 **ExperimentScout 파이프라인**(코어 하나): 예약/트리거 기반 파이프라인 + CLI + MCP | [ADR-0001](../01-decisions/ADR-0001-product-surface-and-scout_ko.md) |
| S-2 | **Ingestion**: discover → CAW-05에서 import → canonicalize+dedup → 주장 추출 → 영속화 (5단계, 멱등적, 재개 가능, `SourceAdapter` 뒤) | [ADR-0005](../01-decisions/ADR-0005-source-and-claim-ingestion_ko.md) |
| S-3 | **Hypothesis 표현**: 분리된 세 가지 레코드 종류 + 가역적 4-state 생명주기 + 상한이 있는 정성적 불확실성 | [ADR-0002](../01-decisions/ADR-0002-hypothesis-representation_ko.md) |
| S-4 | **소규모 실험 원장(ledger)**: 로컬 runner를 통한 최소/토이 재현 하나; 한 run = 한 append-only 항목; 사전 등록된 결정 규칙; reproducibility gate; 실패 보존 | [ADR-0003](../01-decisions/ADR-0003-experiment-ledger_ko.md) |
| S-5 | **Writeback-traffic 스키마** `wbtraffic.v0`: 변형별 **분석적 L0 추정치** 하나 (선택적으로 토이 재현 하나로 근거화) | [ADR-0004](../01-decisions/ADR-0004-writeback-traffic-schema_ko.md) |
| S-6 | **Implication mapping**: 발견별로 도메인 전반에 걸친 `ImplicationMap` 하나; 생성된 요약은 증거 아님으로 표시 | [ADR-0006](../01-decisions/ADR-0006-implication-mapping_ko.md) |
| S-7 | 단일 `ExportAdapter`를 통한 **Export**: `Caw01WritebackAdapter`(wbtraffic + open question → CAW-01) 및 `Caw02ClaimAdapter`(주장+증거 → CAW-02) | [ADR-0008](../01-decisions/ADR-0008-export-boundaries_ko.md) |
| S-8 | **자체 파일 기반 store**: `store/{sources,claims,hypotheses,ledger/EXP-XXXX,implications,exports}` | [ADR-0007](../01-decisions/ADR-0007-storage-and-scheduling_ko.md) |

**수직 슬라이스 규율:** v1 = 시드 테마의 광범위한 커버리지가 아니라 *하나의 TTT 주장에 대한 전체 스레드*를 입증하는 것
(brief §12). 5–10개 테마는 *추적*되지만, v1에서는 오직 하나만 토이 실험과 함께 end-to-end로 구동된다.

## 비목표 (v1) — 그리고 이유
| 비목표 | 제외 이유 | 대신 하는 일 |
|---|---|---|
| **대규모 학습 / 실제 TTT를 대규모로 실행** | 인프라 부담이 큼; 주장을 검증 가능하게 만드는 데 불필요 (brief §11) | 최소 재현 / 토이 실험만 ([ADR-0003](../01-decisions/ADR-0003-experiment-ledger_ko.md)) |
| **미래 AI에 대한 확정된 주장 단언** | 분야가 변동적임; 헤드라인 주장 자체가 미검증 (brief §12) | 모든 것이 명시적 `status` + `confidence`를 지님; 가설은 결코 사실이 아님 ([ADR-0002](../01-decisions/ADR-0002-hypothesis-representation_ko.md)) |
| **시뮬레이터(CAW-01)가 되는 것** | CAW-01은 자신의 IR/store를 소유한 별도 제품 | 우리는 `wbtraffic.v0` 번들 + open question을 파일 경계를 가로질러 **export** ([ADR-0004](../01-decisions/ADR-0004-writeback-traffic-schema_ko.md), [ADR-0008](../01-decisions/ADR-0008-export-boundaries_ko.md)) |
| **지식 저장소(CAW-02)가 되는 것** | CAW-02가 큐레이팅된 지식을 소유 | 우리는 주장+증거를 **export**(`supported/refuted/inconclusive`만) |
| **레이더(CAW-05)가 되는 것** | CAW-05가 신호 발견을 소유 | 우리는 TTT 신호를 `external` 증거로 **import**, 절대 자동 승격 안 함 |
| **전체 syntorch/vLLM 통합** | 부담이 큼; CAW-01의 도메인 (brief §11) | writeback을 **먼저 L0/L1에서 분석적으로** 모델링; 실제 trace는 CAW-01의 추후 Option-C 검증 ([ADR-0004](../01-decisions/ADR-0004-writeback-traffic-schema_ko.md)) |
| **벤치마크 수치 날조** | DOC-CONVENTIONS §3 위반 | 모든 미지의 수치는 `null` + `basis: TODO(open-question)` |
| **기밀 / ToS-안전하지 않은 소스** | 상속된 가드레일 (brief §12, §100-line guardrails) | 법적/ToS-안전한 공개 소스만; 공개 연구를 내부 주장과 결코 혼동하지 않음 |

## Export 경계 (독립성 계약)
CAW-06는 **독립적**이다: 자체 코어, 데이터, 배포; 어떤 형제 제품과도 **공유 런타임 기반(substrate) 없음**. 모든
교차 제품 흐름은 명시적 import/export 경계이며; **`ExportAdapter`가 유일한 export 이음매(seam)**이다.

```
                 ┌─────────────────── CAW-06 (this product, own store) ───────────────────┐
   CAW-05  ─────▶│  SourceAdapter (import)   ExperimentScout core   ExportAdapter (only seam)│
  (radar,        │  arXiv/SemSch + CAW-05    one pipeline           ├─ Caw01WritebackAdapter ─┼──▶ CAW-01 (file drop)
   separate      │  signal import            5 outputs              ├─ Caw02ClaimAdapter ─────┼──▶ CAW-02 (file drop)
   product)      │                                                  └─ Caw03Novelty / Http ⋯  │    (documented stubs)
                 └────────────────────────────────────────────────────────────────────────┘
```

| 경계 | 방향 | 페이로드 | 게이트 |
|---|---|---|---|
| CAW-05 → CAW-06 | import | TTT 레이더 신호 | `status=hypothesis`, `confidence=very-low`로 `Hypothesis`를 개시; 신호는 `external` 증거로 저장; 절대 자동 승격 안 됨 |
| CAW-06 → CAW-01 | export (단방향 push) | `wbtraffic.v0` 스키마 + 타입이 지정된 open question | `domain ∈ {memory-centric-systems, hardware}` AND writeback 페이로드 또는 타입이 지정된 open question 보유 |
| CAW-06 → CAW-02 | export (단방향 push) | 주장 + 증거 + 불확실성 + `not_evidence[]` | `status ∈ {supported, refuted, inconclusive}` AND ≥1개의 해결 증거 AND 출처 — **맨 `hypothesis` 거부됨** |
| CAW-06 → CAW-03 | export (stub) | novelty 단서 | `Caw03NoveltyAdapter`는 문서화됨, 구축 안 됨 |

**하드 경계 규칙** (ADR-0008): 자기 기술적 번들(`schema_version` + `producer` + `content_hash`);
단방향 push(CAW-06는 다른 제품을 위한 store가 아님); `validate()`가 모든 write **이전에** 게이트를 실행; 거부/실패한
export는 로그되고 발견은 **계속 export 가능 상태로 남음**; CAW-06는 **다른 제품의 store에 절대 쓰지 않으며** 공유 스키마
레지스트리를 결코 가정하지 않음. CAW-01의 IR 객체 이름은 CAW-01이 소유함 — 경계에서 재검증.

## 미해결 질문
- 수신 제품별 v1 file-drop 위치/인증이 미정 — ADR-0008 및
  [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md) 참조.
- CAW-01의 IR이 `null`+`basis` 필드와 방향성 있는 read/write 분리를 수용하는지는 `wbq-002`(export 요청이며,
  CAW-01의 결정).

## 런북에 대한 함의
- `ExportAdapter` 레지스트리는 두 개의 v1 어댑터 **및** 문서화된 `Caw03Novelty` / `Http` 스텁과 함께 출시되어야 하며,
  그래야 세 번째 대상이 재설계가 아니라 등록(registration)이 된다.
- 과장 금지 및 실패도 유용 불변 조건이 가정이 아니라 경계에서 기계 검증되도록 게이트를 `validate()` 안에 구축한다.
