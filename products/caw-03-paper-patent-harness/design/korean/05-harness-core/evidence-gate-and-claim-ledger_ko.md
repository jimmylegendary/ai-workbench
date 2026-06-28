# Evidence Gate & Claim Ledger — CAW-03

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [input-assembly_ko.md](./input-assembly_ko.md), [../04-data-layer/data-model_ko.md](../04-data-layer/data-model_ko.md), [../01-decisions/ADR-0003-evidence-gate-and-claim-ledger_ko.md](../01-decisions/ADR-0003-evidence-gate-and-claim-ledger_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF_ko.md

## 목적

핵심을 떠받치는 무결성 메커니즘: claim ledger(소유하지 않고 import함)와, 어떤 claim이 draft에 진입할 수 있는지를 결정하는 evidence gate.

## Claim ledger (참조로 import)

CAW-03은 import된 CAW-02 claim+evidence 번들로부터 `ClaimRef`들의 ledger를 구성한다. 이는 CAW-02의 claim과 evidence를 id/URI로 **참조(reference)** 할 뿐 knowledge repo를 **결코 재소유(re-own)하지 않는다** ([../04-data-layer/data-model_ko.md](../04-data-layer/data-model_ko.md)). 각 `ClaimRef`는 claim_type (P1/P2/P3), evidence_refs, boundary, 그리고 캐시된 gate_status를 담는다.

## gate

**타입별로 다르고, profile로 구성 가능한(profile-configurable)** 정책으로, **input assembly의 사전조건(precondition)** 으로서 적용된다. 이는 하드코딩이 아니라 config 객체(gate profile)다.

| Claim 타입 | 일반적 최소 요건 (구성 가능) |
| --- | --- |
| **P1/P2** (method/tool) | 실제 artifact로 해소되는 evidence ≥1개; trust ≥ profile threshold |
| **P3** (future-device) | 더 엄격: 명시적 가정 provenance + 더 높은 trust; 흔히 patent-sensitive |

**어떤 profile도 완화할 수 없는 단 하나의 불변식:** *생성된 텍스트는 결코 evidence가 아니다.* `evidence_refs`는 반드시 실제 CAW-02 evidence id/artifact로 해소되어야 한다; synthesis/summary는 gate를 통과시킬 수 없다.

## 동작

- **Fail-closed:** 통과하지 못한 claim은 **차단(blocked)** 된다; 엔진에 도달할 수 없다.
- **차단된 claim 백로그:** 차단된 claim은 가시적인 `ClaimRef(gate_status=blocked)` 작업 항목으로 유지된다 (persist 지향, CAW-02의 needs-evidence를 미러링).
- **Paper vs patent overlay:** gate profile은 경로별 요건을 추가할 수 있다 (예: patent 경로는 enablement-relevant evidence를 요구) — 최종 법적 판단은 사람/counsel에게 위임된다.

## 출력

`GatedClaimSet` — [input-assembly_ko.md](./input-assembly_ko.md)(papers)와 [patent-drafting-module_ko.md](./patent-drafting-module_ko.md) 양쪽이 소비하는 공유 front.

## 미해결 질문

claim-typing 자동 vs 사람; venue별 최소 trust; CAW-02 번들이 대체될 때의 re-gating — [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md)를 참고하라.

## runbook에 대한 함의

gate runbook은 profile 엔진 + generated-text-never-evidence 검사 + fail-closed 차단 + 백로그를 구현한다; 어떤 surface/adapter도 이를 우회할 수 없도록 테스트된다.
