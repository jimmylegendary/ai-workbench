# 리스크 & 완화책(Risks & Mitigations) — CAW-03

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [milestones-and-phases.md](./milestones-and-phases_ko.md), [dependency-graph.md](./dependency-graph_ko.md), [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적

CAW-03의 주요 리스크와 그 완화책을, harness의 무결성(integrity) 목표와 일관되게 정리한다.

## 리스크 레지스터(Risk register)

| ID | 리스크 | 가능성 | 영향 | 완화책 |
| --- | --- | --- | --- | --- |
| RK-1 | **Gate bypass** — un-gated claim 또는 generated-text-as-evidence가 draft에 도달 | med | high | Gate가 core에서, assembly 이전에 실행됨; 모든 surface에 걸친 T1/T2 테스트; assembly가 un-gated claim을 거부 |
| RK-2 | **Export 시 confidentiality 누출** | med | high | CAW-02 boundary 상속; publish 시 fail-closed redaction; T7; public-only prior-art 질의 |
| RK-3 | **Patent-first miss** — 특허 가능한 아이디어를 filing하기 전에 paper가 published됨 | med | high | patent-sensitive 플래그 → interlock default-deny publish; counsel gate; T3 |
| RK-4 | **PaperOrchestra 결합 / 버전 드리프트** | high | med | EngineDescriptor 버전 핀 + preflight; engine을 교체 가능한 port 뒤에 둠; PO를 블랙박스로 취급(fork하지 않음) |
| RK-5 | **PO 비대화형(non-interactive) 호출 방식 불명** (OQ-01) | high | med | phase-2 spike에서 해결; 폴백: CAW-03가 agent runner를 호스팅; port를 engine-neutral로 유지 |
| RK-6 | **CAW-01/02에 대한 과결합** | med | med | id/URI로만 참조; import/export adapter; 공유 store 없음 |
| RK-7 | **engine 재구축으로의 스코프 크리프** | med | high | 하드 non-goal; PO가 engine임; CAW-03 = 거버넌스 전용 |
| RK-8 | **법적 월권(Legal overreach)** — harness가 특허성/적격성 판단을 내림 | low | high | 플래그 전용; 인간/counsel이 결정; 자율 filing 없음 |
| RK-9 | **빌드 예산 / rate-limit 중단** | high | med | 작고 재개 가능한 runbook; 대규모 fan-out 대신 순차 저작; runbook별 깔끔한 hand-off |
| RK-10 | **adapter가 거버넌스를 약화시킴** | low | high | adapter 호출 주변의 core 거버넌스; capability preflight; T4(오작동 fake adapter 테스트) |

## 횡단(Cross-cutting) 원칙

**무결성 불변식(integrity invariant)**을 보호한다: published된 모든 주장은 gated evidence로 추적되며,
patent-sensitive한 어떤 것도 filing 전에 누출되지 않는다. 모든 설계 선택(core 내 gate, interlock,
fail-closed confidentiality, provenance)이 이를 위해 복무한다.

## 이 설계 작업에 대한 노트 (실제로 적용된 RK-9)

이 설계 세트는 반복되는 rate-limit 중단 하에서 생산되었다. runbook은 의도적으로 작고 재개 가능하며,
병렬 fan-out이 막혔을 때 저작은 순차적 main-loop 작성으로 폴백되었다.

## 열린 질문(Open questions)

제품군 전반에 걸친 빌드 예산 순서화 — [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) 참고.

## runbook에 대한 함의

각 runbook의 Rollback/safety + Hand-off가 RK-9를 운영화한다; RK-1/2/3/10은 gate/publish/patent/registry
runbook에서 수락 테스트로 강제된다.
