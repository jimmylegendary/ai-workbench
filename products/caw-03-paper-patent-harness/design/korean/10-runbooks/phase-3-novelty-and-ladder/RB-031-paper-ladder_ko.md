# RB-031: Paper ladder (P1/P2/P3)

- Status: ready
- Phase: phase-3-novelty-and-ladder
- Depends on: [RB-030]
- Implements design: [../../05-harness-core/paper-ladder-and-novelty_ko.md](../../05-harness-core/paper-ladder-and-novelty_ko.md)
- Produces: `PaperLadderEntry` 관리 + readiness(준비도) 계산

## 목표

프로그램 논문 시퀀스(P1/P2/P3)를 추적하며, 논문별 readiness는 gate 상태 + novelty 플래그
(+ P3에 대한 patent-first 해제)로부터 도출된다.

## 사전 조건
- [ ] RB-030 (novelty 플래그).

## 단계
1. **Do:** `PaperLadderEntry` CRUD(claim_refs, readiness, threats)를 구현하고 brief의 P1/P2/P3로 시드한다.
   **Verify:** `test:` ladder 엔트리가 영속화되고 나열된다.
2. **Do:** readiness = 클레임의 gate 상태 + novelty 플래그 + (P3) patent-first 해제로 계산한다.
   **Verify:** `test:` blocked/threatened/held 클레임이 있는 엔트리는 not-ready를 표시한다.
3. **Do:** op-manifest(`NoveltyLadderService.ladder()`)를 통해 ladder를 노출한다.
   **Verify:** `test:` ladder가 core op로 읽을 수 있다.

## 수용 기준
- [ ] ladder가 P1/P2/P3를 gate + novelty + interlock로부터 올바른 readiness로 추적한다.

## 롤백 / 안전성
데이터 + 계산이므로 revert로 롤백한다.

## 인계(Hand-off)
ladder는 어떤 artifact가 draft/publish 준비가 되었는지 알려주며, UI/CLI가 이를 읽는다.
