# Patent Drafting Module — CAW-03

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [evidence-gate-and-claim-ledger.md](./evidence-gate-and-claim-ledger_ko.md), [ports-and-adapters.md](./ports-and-adapters_ko.md), [../02-research/patent-drafting.md](../02-research/patent-drafting_ko.md), [../01-decisions/ADR-0004-patent-drafting.md](../01-decisions/ADR-0004-patent-drafting_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적

patent 경로: 별도의 `PatentEngine` port(PaperOrchestra는 결코 patent를 작성하지 않음)로, 논문과 front
(GatedClaimSet)를 공유하지만 drafting과 gates에서 차이가 있으며, 여기에 **patent-first interlock**이 더해집니다.

## 논문 vs 특허 (핵심 차이)

| 측면 | 논문 | 특허 |
| --- | --- | --- |
| Engine | PaperOrchestra | `PatentEngine` adapter (v1 baseline LLM-assisted) |
| 구조 | sections + figures + bib | claims (independent/dependent) + specification + prior-art |
| Prior-art | Semantic-Scholar citation_pool | patent + non-patent prior-art (live search = stub adapter) |
| 공개 | 게재(publish)가 목표 | **공개 전에 출원(file before disclose)** (patent-first) |
| Gate | venue thresholds | enablement/written-description 관련 evidence (플래그 표시, 결정은 counsel) |
| Confidentiality | public-safe | counsel / pre-filing tier |
| 최종 gate | reviewer | **human + counsel** 출원 gate (자율 출원 없음) |

## port

```ts
interface PatentEngineAdapter { capabilities(): EngineDescriptor; draft(inputs: PatentInputs, workspace): PatentDraft }
```
WritingEngine과 동일한 registry에 등록되며, config로 선택됩니다 ([ports-and-adapters.md](./ports-and-adapters_ko.md)).

## Patent-first interlock (adapter-local이 아닌 harness-core 로직)

- **patent-sensitive**로 플래그된 claim ([paper-ladder-and-novelty.md](./paper-ladder-and-novelty_ko.md))은
  `InterlockState=held`로 설정됩니다.
- held claim을 포함하는 `GatedClaimSet`을 가진 임의의 논문 artifact의 `publish`는 **기본적으로 거부(default-denied)**됩니다.
- interlock은 patent gate가 통과될 때(출원 완료 / counsel 승인)에만 해제됩니다.

## Human/counsel gate

CAW-03은 **출원 준비 완료 초안(ready-for-filing draft)**을 만들 뿐, 결코 출원하지 않습니다. 내부 IP 팀 / 외부
counsel로의 hand-off 형식 + SLA는 TODO(open-question)입니다. 관할권(Jurisdiction)이 grace-period 대 absolute-novelty 기본값을 결정합니다 (TODO).

## 미해결 질문(Open questions)

관할권(Jurisdiction); provisional-first 전략; §112 enablement 검사를 누가 담당하는가; 101/적격성(eligibility) 플래그 표시 —
[../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) 참조.

## 런북에 대한 함의

patent 런북은 PatentEngine port + v1 adapter + interlock(core 내) + counsel hand-off를 구현합니다.
publish 런북은 interlock의 default-deny를 강제합니다.
