# RB-025: Work-tree UI (tree / diff / branch)

- Status: ready
- Phase: phase-2-canvases
- Depends on: [RB-021, RB-022, RB-012]   # 캔버스가 change_blob을 방출함; RB-024는 준비되면 통합됨
- Implements design: [change-management-worktree.md](../../05-caw01-simulation-control-plane/change-management-worktree_ko.md), [../../04-data-layer/work-tree-and-versioning.md](../../04-data-layer/work-tree-and-versioning_ko.md)
- Produces: `WorkTreeView`, `DiffView`, `BranchBar`, `HistoryList`

## 목표

세 개의 캔버스에 걸친 사용자 대면 work-tree: dirty 마커가 있는 트리 뷰, ref/branch 간 diff,
branch 생성/전환, 그리고 history — 모두 `WorkTreeService` 위에서 동작한다.

## 사전 조건

- [ ] RB-021 + RB-022가 change_blob을 방출함; RB-012 저장 컨트롤이 동작함. (Canvas 3은 RB-024가 완료되면 통합된다.)

## 단계

1. **Do:** 마지막 commit 이후의 dirty 마커와 함께 세 개의 서브트리(workload/serving/hardware)를 보여주는 `WorkTreeView`를 구축한다.
   **Verify:** `view:` C1/C2에서 편집하면 올바른 서브트리가 dirty로 표시된다.
2. **Do:** `WorkTreeService.diff(refA, refB)`(current-vs-ref 및 ref-vs-ref)를 사용하는 `DiffView`를 구축한다.
   **Verify:** `test:` 알려진 변경이 예상되는 blob-hash diff를 보여준다.
3. **Do:** `BranchBar`(branch 생성/전환) + `HistoryList`(author/surface/message/time을 가진 commit)를 구축한다.
   **Verify:** `test:` branch가 ref를 생성한다; commit이 history에 나타난다.
4. **Do:** 항목별 저장과 전체 저장을 트리와 통합한다(항목별은 선택된 서브트리만 commit; 구조적 공유(structural sharing)).
   **Verify:** `test:` 하드웨어 전용 항목별 저장이 변경되지 않은 workload/serving 서브트리를 재사용한다.

## 수용 기준

- [ ] 트리 뷰가 서브트리별 dirty 상태를 반영한다.
- [ ] diff와 branch/history가 `WorkTreeService` 위에서 동작한다.
- [ ] 항목별 저장이 선택된 서브트리만 commit한다(구조적 공유 검증됨).

## 롤백 / 안전성

모든 작업은 append-only commit이므로 파괴적인 것이 없다. 구축을 롤백하려면 UI를 되돌린다.

## 인계(Hand-off)

what-if 워크플로우(UC-3)가 이제 가능하다: branch → change → 양쪽 모두 run → 비교. Canvas 3 편집은 RB-024가 완료되면 합류한다.
