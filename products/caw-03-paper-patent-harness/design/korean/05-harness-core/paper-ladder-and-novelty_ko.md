# Paper Ladder & Novelty — CAW-03

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [evidence-gate-and-claim-ledger.md](./evidence-gate-and-claim-ledger_ko.md), [patent-drafting-module.md](./patent-drafting-module_ko.md), [../02-research/novelty-priorart-and-venue.md](../02-research/novelty-priorart-and-venue_ko.md), [../01-decisions/ADR-0006-paper-ladder-and-novelty.md](../01-decisions/ADR-0006-paper-ladder-and-novelty_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적

CAW-03이 novelty/claim-boundary를 어떻게 통치하고 P1/P2/P3 paper ladder를 어떻게 계획하는가. **harness가
결정하며, engine과 radar는 공급만 합니다.**

## Novelty 입력 (공급만)

| Source | 제공 내용 |
| --- | --- |
| PaperOrchestra `citation_pool` | Semantic-Scholar 검증 **paper prior-art** (재조회하지 않고 재사용) |
| `Novelty/RadarAdapter` ← CAW-05 | related-work + **threat/support signals** (boundary를 가로질러 import) |
| (stub) live prior-art/patent search | patent prior-art (향후 adapter) |

harness는 이들을 결합하여 각 claim에 플래그를 표시합니다.

## Claim 플래그

- **novel** — 차단하는 prior-art가 발견되지 않음.
- **threatened** — prior-art/radar가 겹침; drafting 전에 차별화가 필요함.
- **patent-sensitive** — patent-first여야 함; interlock을 설정함 ([patent-drafting-module.md](./patent-drafting-module_ko.md)).

## P1/P2/P3 ladder

계획된 프로그램 논문 시퀀스(items/03 출처)로, 각각 claim refs, readiness, threats를 가진 `PaperLadderEntry`입니다:

1. **P1** — 미구축 AI hardware의 memory-centric DSE를 위한 실행 가능한 synthetic frontend로서의 syntorch.
2. **P2** — 진화하는 AI workload에서 이동하는 memory-demand 축을 추적하기 위한 control-plane method.
3. **P3** — 새로운 architectural memory 축으로서의 TTT-class inference writeback traffic. *(future-device → 더 엄격한 gate, 종종 patent-first)*

Readiness = 해당 claim들의 gate 상태 + novelty 플래그 + (P3의 경우) patent-first clearance.

## Prior-art 쿼리의 기밀성

내부 claim 텍스트로 제3자 prior-art API를 쿼리하면 아이디어가 유출될 수 있습니다. 쿼리를 **public-boundary
claim 텍스트로만** 제한하고, 쿼리 문자열이 외부로 나가기 전에 redact하십시오 (정확한 규칙은 TODO(open-question)).

## 미해결 질문(Open questions)

CAW-05의 scorer에 대한 공유 의존성 없이 overlap threshold + embedding model을 정하는 문제; CAW-05 signals를
CAW-03 claim id로 keying할지 CAW-02 id로 할지(re-map); 제출 전 novelty freshness SLA —
[../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) 참조.

## 런북에 대한 함의

novelty/ladder 런북은 Novelty/Radar port import + citation_pool 재사용 + claim 플래그 표시 + ladder
추적을, public-only prior-art 쿼리 가드와 함께 구현합니다.
