# 런북 — CAW-03 빌드 지침

- **Status:** draft
- **Owner:** Jimmy
- **Audience:** AI 빌더
- **Source of truth:** ../_meta/PRODUCT-BRIEF_ko.md · 컨벤션: [runbook-conventions_ko.md](./runbook-conventions_ko.md)

## 이것들은 무엇인가

CAW-03을 위한 실행 가능한 빌드 계획 — PaperOrchestra를 감싸고 거버넌스를 추가하는 paper/patent **harness**.
설계 문서(`design/00..09`)는 *무엇을/왜*를 말하고, 런북은 *어떻게 빌드하는가*를 말한다. 빌더는 코드를 작성하며,
PaperOrchestra를 다시 만들지는 **않는다**.

## 어떻게 실행하는가

1. [runbook-conventions_ko.md](./runbook-conventions_ko.md) + `../_meta/PRODUCT-BRIEF_ko.md`를 읽는다.
2. 단계를 순서대로 실행한다. 각 런북의 `Depends on:`과 [../09-roadmap/dependency-graph_ko.md](../09-roadmap/dependency-graph_ko.md)의 게이트를 준수한다.
3. 다음으로 넘어가기 전에 Acceptance criteria를 확인한다.

## 단계(Phases)

| Phase | Folder | Runbooks |
| --- | --- | --- |
| 0 Foundations | `phase-0-foundations` | RB-000 scaffold · RB-001 tooling+op-manifest · RB-002 ports+registry+preflight · RB-003 governance store |
| 1 Gate & assembly | `phase-1-gate-and-assembly` | RB-010 source adapters + ledger import · RB-011 evidence gate · RB-012 input assembly · RB-013 confidentiality |
| 2 Engine & patent | `phase-2-engine-and-patent` | RB-020 PaperOrchestra WritingEngine adapter · RB-021 orchestration + lifecycle · RB-022 patent module · RB-023 patent-first interlock |
| 3 Novelty & ladder | `phase-3-novelty-and-ladder` | RB-030 novelty/radar + citation_pool · RB-031 paper ladder |
| 4 Publish, interfaces, stubs | `phase-4-publish-interfaces-stubs` | RB-040 publish/sink + confidentiality · RB-041 review · RB-042 API/MCP/CLI · RB-043 documented stubs (wiki/exp-server/venue/filing) |

## Milestone 1 체인

`RB-000 → RB-001 → RB-002 → RB-003 → RB-010 → RB-011 → RB-012 → RB-013 → RB-020 → RB-021 → RB-040 → RB-041`
= PaperOrchestra를 통해 생산된 하나의 evidence-gated 논문(UC-1 / T8). 특허 경로, novelty, 그리고 stub은 그 뒤를 따른다.

## 예산 규율(Budget discipline)

런북은 작고 재개 가능하다. 중단이 발생하면 시작되지 않은 다음 런북에서 재개한다.
