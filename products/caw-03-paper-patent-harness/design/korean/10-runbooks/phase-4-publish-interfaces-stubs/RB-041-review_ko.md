# RB-041: Review checklist + scores

- Status: ready
- Phase: phase-4-publish-interfaces-stubs
- Depends on: [RB-021]
- Implements design: [../../05-harness-core/artifact-lifecycle_ko.md](../../05-harness-core/artifact-lifecycle_ko.md), [../../02-research/paperorchestra-integration_ko.md](../../02-research/paperorchestra-integration_ko.md)
- Produces: `review` — submission-ready 이전의 checklist + autorater 점수 gate

## Objective

review 단계(`drafted → reviewed`)를 구현한다: review checklist + PaperOrchestra autorater 점수로,
publish/filing 이전에 artifact를 gate한다.

## Preconditions
- [ ] RB-021 (작성된 artifact).

## Steps
1. **Do:** `review(artifactId)`를 구현한다: `ReviewResult`(checklist 항목 + engine 실행에서 수집한 autorater 점수)를 영속화한다.
   **Verify:** `test:` 작성된 artifact에 대한 review가 checklist + 점수를 기록한다; `reviewed`로 진행시킨다.
2. **Do:** Gate: artifact는 publish/filing 이전에 반드시 `reviewed` 상태(통과 판정 포함)여야 한다.
   **Verify:** `test:` publish는 reviewed가 아닌 artifact를 거부한다.

## Acceptance criteria
- [ ] Review는 checklist + 점수를 기록한다; publish/filing은 통과한 review를 요구한다.

## Rollback / safety
데이터 + gate; 되돌려 롤백한다.

## Hand-off
RB-040 publish(papers)와 RB-022 filing-gate(patents)가 review 판정을 소비한다.
