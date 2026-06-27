# Work-Tree 변경 관리 (UX) — CAW-01

- **Status:** 초안(draft)
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [../04-data-layer/work-tree-and-versioning.md](../04-data-layer/work-tree-and-versioning_ko.md), [control-panel-and-run-lifecycle.md](./control-panel-and-run-lifecycle_ko.md), [../01-decisions/ADR-0007-change-management-worktree.md](../01-decisions/ADR-0007-change-management-worktree_ko.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## 목적

세 개의 캔버스 전반에 걸친 **사용자 대면** work-tree를 규정한다: 선택/편집이 어떻게 버전 관리되는 변경으로 안착하는지, 그리고 항목별 저장과 전체 저장을 갖춘 tree/diff/branch UX. **저장(storage)** 모델(테이블/해싱)은 [../04-data-layer/work-tree-and-versioning.md](../04-data-layer/work-tree-and-versioning_ko.md)에 있으며 여기서 반복하지 않는다.

## 멘탈 모델

실험의 구성은 캔버스들을 반영하는 세 개의 서브트리를 가진 하나의 **work tree**이다:

```
experiment/
├─ workload/     (Canvas 1 edits → c1_node blobs)
├─ serving/      (Canvas 2 edits → c2_wiring blobs)
└─ hardware/     (Canvas 3 edits → c3_part blobs)
```

## 사용자가 보는 것

| 패널 | 표시 내용 |
| --- | --- |
| **Tree view** | 마지막 커밋 이후 dirty/변경 마커가 붙은 세 개의 서브트리 |
| **Diff view** | 현재 상태와 ref 사이, 또는 두 ref/branch 사이의 변경 |
| **Branch view** | branch DAG; what-if config를 위한 branch 생성/전환 |
| **History** | author/surface/message/time이 있는 커밋들 |

## 저장 의미론 (UX)

| 버튼 | 의미 |
| --- | --- |
| **항목별 저장(Per-item save)** | 선택된 서브트리/항목만 커밋(예: `hardware/`만) |
| **전체 저장(Full save)** | 전체 실험 트리를 커밋 |
| **Branch** | 현재 ref를 이름 붙은 what-if 라인으로 분기 |
| **Diff** | 두 ref/branch를 비교 |

이들은 `WorkTreeService`를 호출한다([../07-backend-api/api-surface.md](../07-backend-api/api-surface_ko.md)); 구조적 공유(structural sharing) 덕분에 하드웨어만 저장하면 변경되지 않은 workload/serving 서브트리를 재사용한다.

## 편집 → 변경 캡처

모든 캔버스 편집은 `intent_event`를 방출하고 콘텐츠 주소 지정(content-addressed) `change_blob`을 생성한다; 커밋되지 않은 편집은 저장 전까지 "dirty"로 표시된다([../04-data-layer/work-tree-and-versioning.md](../04-data-layer/work-tree-and-versioning_ko.md)).

## What-if 워크플로 (UC-3)

Branch → serving 선택 또는 strategy_id 변경 → 두 branch를 모두 실행 → diff/projection 뷰에서 projection 비교 ([../00-overview/personas-and-use-cases.md](../00-overview/personas-and-use-cases_ko.md)).

## 미해결 질문

v1에서 3-way merge를 보여줄지 여부(보여주지 않는 쪽으로 기울어짐 — branch+diff만) — TODO(open-question).

## 런북에 대한 함의

Phase-2 work-tree 런북은 `WorkTreeService`에 연결된 tree/diff/branch 패널 + 항목별/전체 저장을 구축하고, 세 캔버스가 편집 시 intent event + change_blob을 방출하도록 만든다.
