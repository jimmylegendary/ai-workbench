# 검증 및 골든 테스트(Validation & Golden Tests) — CAW-01

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [research-plan_ko.md](./research-plan_ko.md), [../05-caw01-simulation-control-plane/l0-ir-schema_ko.md](../05-caw01-simulation-control-plane/l0-ir-schema_ko.md), [../04-data-layer/knowledge-substrate_ko.md](../04-data-layer/knowledge-substrate_ko.md), [../01-decisions/ADR-0005-trace-pipeline_ko.md](../01-decisions/ADR-0005-trace-pipeline_ko.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF_ko.md

## 목적

신뢰 사다리(trust-ladder) 검증 계획이다. 트레이스 신뢰성과 L0 round-trip을 방어하는 골든 테스트를 수용 게이트(acceptance gate)와 함께 제시한다. 수치 임계값은 측정될 때까지 TODO(open-question)로 둔다.

## 골든 테스트가 필요한 이유

가장 약한 고리는 **트레이스 신뢰성** — 특히 아직 만들어지지 않은 디바이스에 대한 syntorch 트레이스다. 신뢰 사다리([../04-data-layer/knowledge-substrate_ko.md](../04-data-layer/knowledge-substrate_ko.md))는 각 단(rung)마다 객관적인 테스트가 있을 때에만 신뢰할 수 있다.

## 테스트 스위트

### T1 — Chakra → ASTRA-sim reference round-trip
- **목표:** syntorch를 연결하기 전에, 고정된 reference `.et`가 ASTRA-sim에 입력되어 안정적인 메트릭을 생성한다.
- **통과:** ASTRA-sim이 reference ET를 수집(ingest)하고 여러 실행에 걸쳐 결정적(deterministic) 타이밍을 산출한다.
- **게이트 대상:** phase-4 syntorch 연결.

### T2 — L0 round-trip (하나의 스키마, 두 개의 축)
- **목표:** ServingSim 스타일 출력과 syntorch 스타일 출력이 모두 스키마 충돌 없이 **동일한** L0로 lower된다.
- **통과:** 둘 다 유효한 L0를 생성한다. 각각에 대해 capacity-peak + traffic 롤업이 계산되고, 하나의 행(row)으로 비교 가능하다.
- **게이트 대상:** Milestone 1 수용([../09-roadmap/milestones-and-phases_ko.md](../09-roadmap/milestones-and-phases_ko.md)).

### T3 — syntorch 트레이스 vs A100/OTel 골든
- **목표:** 알려진 워크로드에 대해 syntorch의 트레이스를 실제 A100/OTel 증거와 대조 검증한다.
- **통과:** capacity peak + traffic + iteration time에서 허용 오차 `TODO(open-question: %)` 이내로 일치한다.
- **게이트 대상:** 실행(run)을 신뢰 단 "validated trace"로 승격.

### T4 — 교차 축 일치(Cross-axis agreement)
- **목표:** synthetic 축과 simulation 축이 동일한 L0에 대해 허용 오차 이내로 일치한다.
- **통과:** 투영(projection) 내 `delta`가 `TODO(open-question: %)` 이내.
- **게이트 대상:** 신뢰 단 "cross-axis agreement".

### T5 — 출처/증거 무결성(Provenance/evidence integrity)
- **목표:** 증거 없는 공개 가능 주장(publishable claim)은 없다. 경계(boundary)/신뢰 태그가 강제된다.
- **통과:** DB 제약이 Evidence 행이 없는 공개 가능 주장을 거부한다. confidential 경계는 public 출력에 절대 나타나지 않는다.

## 수용 게이트 요약

| 단(Rung) | 테스트 | 임계값 |
| --- | --- | --- |
| executable assumption | builds + runs | n/a |
| explicit runtime | strategy_id present on ops/tensors | n/a |
| validated trace | T3 | TODO(open-question) |
| cross-axis agreement | T4 | TODO(open-question) |

## 미해결 질문(open questions)

모든 수치 임계값(T3/T4)은 미설정 상태다 — 측정된 A100/OTel 기준선(baseline)이 필요하며, [open-questions_ko.md](./open-questions_ko.md)에서 추적된다.

## 런북에 대한 함의

T1은 첫 phase-4 런북(게이트)이다. T2는 phase-3 수용이다. T3/T4는 실제 기준선이 존재할 때 부착된다. T5는 phase-0 스키마 제약으로 강제된다.
