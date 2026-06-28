# RB-021: Draft 오케스트레이션 + artifact lifecycle

- Status: ready
- Phase: phase-2-engine-and-patent
- Depends on: [RB-020, RB-003]
- Implements design: [../../07-backend-api/orchestration-service_ko.md](../../07-backend-api/orchestration-service_ko.md), [../../05-harness-core/artifact-lifecycle_ko.md](../../05-harness-core/artifact-lifecycle_ko.md)
- Produces: `draft_paper` 오케스트레이션 + Artifact 상태 머신

## 목표

논문 draft를 처음부터 끝까지 실행하고 Artifact lifecycle(`assembled → drafting → drafted`)을 구동하며,
EngineRun + FigureTableManifest를 영속화하고 실패/재시도를 처리한다.

## 사전 조건
- [ ] RB-020 (engine 어댑터), RB-003 (store).

## 단계
1. **Do:** `draft_paper(artifactId)`를 구현한다: `assembled`를 요구하고, 어댑터를 해석하며(preflight), 입력을 `workspace/<run>/`에 구체화하고, `adapter.draft`를 호출한다.
   **Verify:** `test:` assembled가 아닌 artifact는 거부하고, assembled인 것은 실행한다.
2. **Do:** `DraftResult` + provenance를 포착하고, `EngineRun` + manifest를 영속화하며, Artifact를 `drafted`로 진행시킨다.
   **Verify:** `test:` 완료된 실행은 `drafted` + 영속화된 출력을 남긴다.
3. **Do:** 실패 처리: subprocess 실패 → `failed`; 재시도는 새로운 `EngineRun`을 생성한다 (출력은 immutable); 성공 시 `workspace/<run>/`를 정리한다.
   **Verify:** `test:` 강제 실패 → `failed`; 재시도는 새로운 run id를 생성한다.
4. **Do:** lifecycle 상태 머신 + 전이별 불변식을 구현한다 (assemble 이전 gate는 이미 상류에서 강제됨).
   **Verify:** `test:` 불법 전이는 거부된다.

## 수용 기준
- [ ] `draft_paper`가 처음부터 끝까지 실행되고, lifecycle이 올바르게 진행되며, 실패/재시도가 처리된다.
- [ ] EngineRun + manifest가 영속화되고, 출력은 run별로 immutable하다.

## 롤백 / 안전성
workspace는 scratch이고 artifact는 immutable하다. 오케스트레이션을 revert하여 롤백한다.

## 인계(Hand-off)
RB-040이 `drafted`/`reviewed` artifact를 publish하고, RB-022가 patent 경로를 추가한다.
