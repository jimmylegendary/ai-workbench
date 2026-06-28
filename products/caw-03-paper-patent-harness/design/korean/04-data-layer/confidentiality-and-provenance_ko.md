# 기밀성 및 출처(Confidentiality & Provenance) — CAW-03

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [data-model.md](./data-model_ko.md), [../05-harness-core/artifact-lifecycle.md](../05-harness-core/artifact-lifecycle_ko.md), [../01-decisions/ADR-0007-confidentiality-and-boundary.md](../01-decisions/ADR-0007-confidentiality-and-boundary_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적

CAW-03이 CAW-02의 기밀성 모델을 어떻게 상속하며, import/export boundary를 가로질러 출처(provenance)를 어떻게 보존하는지를 다룬다.

## 상속된 boundary 모델 (CAW-02에서, 원문 그대로)

import된 모든 항목과 모든 artifact에 따라다니는 두 개의 축:

| 축 | 값 | 의미 |
| --- | --- | --- |
| `boundary` | public / internal / confidential | 무엇을 노출할 수 있는가 |
| `visibility` | team / private | 누가 볼 수 있는가 |

CAW-03은 특허 비밀(patent secrets)을 위해 `internal` 위에 더 엄격한 **counsel / pre-filing tier(법무/출원 전 등급)** 를 추가하는 것을 제안한다
([ADR-0007](../01-decisions/ADR-0007-confidentiality-and-boundary_ko.md)) — TODO(open-question: exact tier).

## 시행 지점(Enforcement points)

| 지점 | 규칙 |
| --- | --- |
| **Import** | bundle은 자신의 boundary를 지닌다. boundary를 넘어서는 콘텐츠는 격리/거부된다 |
| **Gate/assembly** | engine은 artifact의 confidentiality track 위에 있는 콘텐츠를 절대 받지 않는다 |
| **Publish/export** | **fail-closed**: sink가 허용하는 boundary로 redact한다. public sink → public-safe만; 과다 공유 시 중단 |
| **Patent path** | patent-first interlock + counsel tier; 자율적 출원(filing) 없음 |

## 출처 체인(Provenance chain)

```
Artifact → GatedClaimSet → ClaimRef(CAW-02 claim) → evidence_refs(CAW-02 evidence) → result_id(CAW-01)
DraftResult → FigureTableManifest(figure_id ↔ result_id)
```

작성된(drafted) 모든 주장은 CAW-02의 claim+evidence와 CAW-01의 result로 거슬러 올라가 재구성될 수 있다. 생성된 텍스트가
evidence로 승격되는 일은 결코 없다 ([ADR-0003](../01-decisions/ADR-0003-evidence-gate-and-claim-ledger_ko.md)).

## Redaction 규칙 집합(ruleset)

CAW-02의 redaction 의미론을 재사용한다. 규칙 집합의 거처(vendoring+pin된 사본 vs import envelope에 pin)는
열린 질문이다 — 공유 런타임 의존성(no shared substrate)을 반드시 피해야 한다.

## 열린 질문(Open questions)

Counsel tier 정의; redaction-ruleset의 거처; 재분류 권한(local clearance vs CAW-02 re-import) —
[../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md).

## 런북(runbook)에 대한 함의

publish + import 런북은 fail-closed redaction + boundary 검사를 구현하고, patent 런북은 counsel tier + interlock을 구현한다.
