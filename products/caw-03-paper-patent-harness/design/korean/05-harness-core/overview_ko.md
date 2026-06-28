# Harness Core 개요 (폴더 맵) — CAW-03

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** 이 폴더의 모든 문서; [../00-overview/vision_ko.md](../00-overview/vision_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF_ko.md

## 목적

harness core를 위한 색인 + 멘탈 모델. core는 모든 통제 대상 로직(governed logic)을 소유하며, adapter는 port 뒤에서 데이터/엔진을 공급한다. 이 폴더는 각 core 관심사를 상세히 다룬다.

## core를 한 장의 그림으로

```
import → ledger → GATE → assemble → draft(engine) → review → publish
                   │                    │                        │
            (P1/P2/P3, fail-closed)  (engine-neutral)   (confidentiality + patent-first interlock)
   novelty/ladder feeds the gate/flagging; patent path branches after the shared gated front
```

## 문서 맵

| 관심사 | 문서 |
| --- | --- |
| Evidence gate + claim ledger | [evidence-gate-and-claim-ledger_ko.md](./evidence-gate-and-claim-ledger_ko.md) |
| engine-neutral 입력 조립 | [input-assembly_ko.md](./input-assembly_ko.md) |
| WritingEngine port + PaperOrchestra adapter | [writing-engine-adapter-paperorchestra_ko.md](./writing-engine-adapter-paperorchestra_ko.md) |
| Patent 경로 + interlock | [patent-drafting-module_ko.md](./patent-drafting-module_ko.md) |
| Ports & adapters (개방형 seam) | [ports-and-adapters_ko.md](./ports-and-adapters_ko.md) |
| Paper ladder + novelty | [paper-ladder-and-novelty_ko.md](./paper-ladder-and-novelty_ko.md) |
| Artifact lifecycle | [artifact-lifecycle_ko.md](./artifact-lifecycle_ko.md) |

## core가 보장하는 불변식(invariant)

- gate를 거치지 않은(ungated) claim은 절대 draft되지 않는다 (조립 전에 gate).
- 생성된(generated) 텍스트는 결코 evidence가 아니다.
- adapter는 gate, interlock, confidentiality를 약화시킬 수 없다.
- 모든 artifact의 콘텐츠는 CAW-02의 claim+evidence와 CAW-01의 결과로 추적된다.

## 미해결 질문

[../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md)를 참고하라.

## runbook에 대한 함의

이 폴더는 phase-1 (core/gate/assembly), phase-2 (engine/patent), phase-3 (novelty/ladder), phase-4 (publish/lifecycle) runbook에 대응된다.
