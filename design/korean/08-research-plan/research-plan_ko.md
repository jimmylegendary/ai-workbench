# 연구 계획 — CAW-01

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [validation-and-golden-tests_ko.md](./validation-and-golden-tests_ko.md), [open-questions_ko.md](./open-questions_ko.md), [../02-research/](../02-research/)
- **Source of truth:** ../_meta/SOURCE-BRIEF_ko.md

## 목적

빌드 이전 또는 빌드와 병행하여 학습하거나 입증해야 하는 사항을 정리한, 개방형 연구/검증 프로그램이다. 각 항목은 ADR과 런북 단계(phase)에 연결된다. 이는 빌드와 나란히 진행되는 "불확실성 감소" 백로그다.

## 연구 트랙

| # | 트랙 | 질문 | 연결 대상 | 해결 시점 |
| --- | --- | --- | --- | --- |
| R1 | syntorch 캡처 고도(altitude) | syntorch는 어느 고도에서 sub-torch 연산(`__torch_dispatch__` / custom)을 캡처하는가? | [ADR-0005](../01-decisions/ADR-0005-trace-pipeline_ko.md) | phase-4 |
| R2 | Chakra 방언(dialect)/버전 | 어느 `et_def.proto` 리비전인가; syntorch는 표준 `.et`를 방출하는가? | ADR-0005 | phase-4 (reference round-trip) |
| R3 | vLLM 버전 고정(pin) | V0 vs V1; syntorch가 충족해야 하는 정확한 torch API 표면 | ADR-0005 | phase-0/4 |
| R4 | ServingSim/ASTRA-sim 순서 | LLMServingSim은 이미 ASTRA-sim을 내장한다 — 비용 모델을 병렬로 둘 것인가, 대체할 것인가? | ADR-0005 | phase-3/4 |
| R5 | Chakra→L0 충분성 | Chakra가 텐서 크기/수명을 담는가, 아니면 확장(extension)/사이드카가 필요한가? | [ADR-0002](../01-decisions/ADR-0002-data-layer_ko.md)/ADR-0005 | phase-3 |
| R6 | Canvas-3 3D 실현 가능성 | r3f가 상호작용 가능한 클러스터를 감당할 수 있는가, 아니면 Konva 2D로 폴백해야 하는가? | [ADR-0004](../01-decisions/ADR-0004-canvas-rendering_ko.md) | phase-2 (spike) |
| R7 | 데이터 레이어 규모 트리거 | pgvector / Neo4j는 언제 추가하는가? | ADR-0002 | 상시(ongoing) |
| R8 | 엔진 전송(transport) | TS⇆Python 경계(seam)에 stdio vs HTTP vs queue 중 무엇? | [ADR-0003](../01-decisions/ADR-0003-frontend-stack_ko.md) | phase-4 |
| R9 | 신뢰 사다리(trust-ladder) 임계값 | 교차 축 일치 / 트레이스 신뢰성의 허용 오차는 얼마인가? | [knowledge-substrate](../04-data-layer/knowledge-substrate_ko.md) | phase-3 (golden tests) |

## 방법

- 각 트랙은 문서 갱신(결정 기록) 또는 수용 게이트(acceptance gate)를 갖춘 스파이크 런북 중 하나로 해결된다.
- 스파이크는 **시간 제한(time-boxed)** 이 있으며, 실패한 스파이크는 문서화된 폴백을 발동한다(예: R6 → Konva 2D).
- 발견 사항은 해당 ADR을 갱신하고 [open-questions_ko.md](./open-questions_ko.md)의 대응 행을 정리(clear)한다.

## 빌드 대비 순서

```
phase-0  ── R3 (pin), R8 (transport choice), R7 (start small)
phase-2  ── R6 (3D spike) BEFORE building Canvas 3
phase-3  ── R5, R9 (L0 sufficiency + golden thresholds)
phase-4  ── R1, R2 (capture + Chakra), then R4 (ordering)
```

## 미해결 질문(open questions)

모두 [open-questions_ko.md](./open-questions_ko.md)에서 중앙 집중적으로 추적된다.

## 런북에 대한 함의

R6은 phase-2의 게이트 스파이크 런북이다. R2의 reference round-trip은 첫 phase-4 런북이다. 나머지는 해당 phase에 부착된 "해결하고 기록(resolve and record)" 작업이다.
