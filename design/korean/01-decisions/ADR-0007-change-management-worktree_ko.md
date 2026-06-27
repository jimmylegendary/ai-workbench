# ADR-0007: Work-tree 변경 관리 — git 유사 객체 모델 + 의도 이벤트 로그 (CRDT는 연기)

- Status: proposed
- Owner: Jimmy
- Last-reviewed: TODO
- Related:
  - Research: [canvas-and-visualization-tech](../02-research/canvas-and-visualization-tech_ko.md), [data-layer-options](../02-research/data-layer-options_ko.md)
  - [ADR-0002 데이터 계층(Data layer)](./ADR-0002-data-layer_ko.md) (객체 모델은 Postgres에 저장됨)
  - [ADR-0004 캔버스 렌더링(Canvas rendering)](./ADR-0004-canvas-rendering_ko.md) (클라이언트 `ExperimentStore.workTree` + 의도(intent)가 여기로 매핑됨)
  - [ADR-0001 제품 표면(Product surface)](./ADR-0001-product-surface_ko.md) (하나의 `WorkTreeService`; web/MCP/CLI에서 동일한 시맨틱)
  - [work-tree-and-versioning](../04-data-layer/work-tree-and-versioning_ko.md), [change-management-worktree](../05-caw01-simulation-control-plane/change-management-worktree_ko.md)
  - [open-questions](../08-research-plan/open-questions_ko.md)
- Source of truth: [../_meta/SOURCE-BRIEF.md](../_meta/SOURCE-BRIEF_ko.md)

## 목적

**work-tree 변경 관리 객체 모델**(SOURCE-BRIEF §6)을 결정한다: 세 캔버스에 걸친 **모든 선택과 변경을 추적**하고,
**항목별 저장(per-item save)**(개별 변경/서브트리)과 **전체 저장(full save)**(트리 전체)을 지원하며, 실험 구성의
**버전 관리/브랜칭 모델** 역할을 하는 구조. 이 ADR은 *객체 모델과 그 시맨틱*을 고정한다; **저장 기반(storage
substrate)**은 [ADR-0002](./ADR-0002-data-layer_ko.md), **클라이언트 형태**(`ExperimentStore`, intent)는
[ADR-0004](./ADR-0004-canvas-rendering_ko.md), **서비스 표면**(web/MCP/CLI의 `WorkTreeService`)은
[ADR-0001](./ADR-0001-product-surface_ko.md)이다.

## 배경

- 세 캔버스(C1 워크로드, C2 서빙 구성, C3 HW 계층) 중 어느 것에서든 모든 변경은 **항목별** 및 **전체** 저장을
  갖춘 하나의 **추적된 변경 트리**여야 한다(SOURCE-BRIEF §5–§6).
- brief는 work-tree를 실험 구성의 **버전 관리/브랜칭 모델**로 규정하고, 그것이 CRDT여야 하는지, 이벤트 로그여야
  하는지, git 유사 객체 모델이어야 하는지 묻는다(SOURCE-BRIEF §10).
- **출처(Provenance)는 일급이다**(SOURCE-BRIEF §1, §11): 각 변경은 그것이 온 캔버스 + 엔티티로 거슬러 추적되어
  증거 사슬을 보존해야 한다; 이력은 **감사 가능 / 추가 전용(append-only)**이어야 한다.
- 가치의 단위는 **하나의 재현 가능한 실험**이다(SOURCE-BRIEF §1) — 구성 브랜칭/비교("what-if")와 정확한
  `(workload, hw config, sim config)` 재현이 핵심이다.
- **v1의 동시성 현실:** CAW-01은 **단일 전문가 규모**다([data-layer-options](../02-research/data-layer-options_ko.md));
  지배적 패턴은 실시간 다중 커서 공동 편집이 아니라 한 작성자가 하나의 실험을 편집하는 것이다.
- 클라이언트는 이미 `workTree`에 추가되는 **순서가 있는 편집 의도 스트림**을 생성한다
  ([ADR-0004](./ADR-0004-canvas-rendering_ko.md)); 영속 모델은 그 스트림을 소비해야 한다.
- 저장소는 **Postgres 주축**이다([ADR-0002](./ADR-0002-data-layer_ko.md)); 우리가 선택하는 모델이 무엇이든
  버전 관리 대상 엔티티에 대한 강한 참조 무결성을 갖는 PG 테이블로 표현 가능해야 한다.

## 검토한 선택지

| 옵션 | 장점 | 단점 | 적합성 |
|---|---|---|---|
| **git 유사 콘텐츠 주소(content-addressed) 객체 모델** (blob/tree/commit/ref) **+ 의도 이벤트 로그** | 브랜치/머지/diff/재현이 네이티브; commit = 출처(누가/언제/왜); 콘텐츠 주소화가 구성 서브트리를 중복 제거; 항목별 저장 = 서브트리 commit, 전체 저장 = dirty set commit; 감사 가능 & 추가 전용; 캔버스 브랜치-DAG UI에 깔끔히 매핑; 평범한 PG 테이블로 저장 가능 | commit/tree/diff 로직을 우리가 구현(공짜 아님); 브랜치 간 머지가 비자명(연기) | **채택** |
| **순수 이벤트 로그 / 이벤트 소싱** (의도 추가, 상태로 fold) | 완벽한 감사; 의도 스트림이 이미 존재; 자명한 추가 | 일급 브랜치/버전 식별성 부재; "서브트리 저장"과 "두 구성 비교"는 어차피 투영 계층 필요; 재생 비용 증가 | **객체 모델에 공급하는 입력 계층으로 채택**, 전부의 답은 아님 |
| **CRDT** (예: Yjs/Automerge) | 실시간 다중 작성자 수렴, 오프라인 머지 | v1에 없는 문제(단일 작성자)를 해결; 명시적 명명 버전/브랜치 + 인간 검토 가능 diff/출처 시맨틱이 약함; 추가 런타임 + 저장 복잡성 | 실시간 다중 작성자 협업이 제품 요구가 될 때까지 **연기** |
| **관계형 시간/클로저 테이블만** | SQL에 머묾 | 브랜칭이 어색; 자연스러운 commit/diff/출처 객체 없음; git을 어설프게 재발명 | 모델로는 거부(선택된 모델의 *저장소*로는 여전히 사용) |
| **"git for data" 엔진(Dolt/Doltgres)** | 브랜치/머지 내장 | 더 무겁고 덜 표준적인 엔진; 버전 관리를 특정 DB에 결합 | 연기; 테이블 수준 브랜치/머지가 지배적일 때만 재검토(참조 [ADR-0002](./ADR-0002-data-layer_ko.md)) |

## 결정

**추가 전용 의도 이벤트 로그가 공급하는 git 유사 콘텐츠 주소 객체 모델을 채택하고, Postgres 테이블로 저장한다.
실시간 다중 작성자 협업이 실제 요구가 될 때까지 CRDT는 연기한다.**

1. **객체 모델(git 유사):**
   - **`change_blob`** — 단일 버전 관리 대상의 상태에 대한 불변, 콘텐츠 주소(해시) 스냅샷: C1 노드 파라미터
     세트, C2 배선(wiring), C3 part/component 구성.
   - **`change_tree`** — 명명된 항목 → blob 또는 서브트리의 순서/타입이 있는 맵으로, 세 캔버스에 걸친 실험 구조
     (workload / serving / hardware 서브트리)를 반영한다. 이것이 문자 그대로의 **"work tree"**다.
   - **`change_commit`** — `{root_tree, parents[], author, surface, message, created_at}`; 출처가 내재적이다
     (누가, 언제, 어느 surface/canvas에서, 왜). 추가 전용.
   - **`ref`** — commit을 가리키는 명명된 이동 가능 포인터: 실험별 기본 라인과 what-if 구성을 위한 사용자
     **브랜치**([ADR-0004](./ADR-0004-canvas-rendering_ko.md)의 브랜치 DAG).
2. **의도 이벤트 로그(입력 계층):** 클라이언트의 순서 있는 편집 의도
   (`addComponent`/`editPart`/`wireStage`/`setNodeParam`, [ADR-0004](./ADR-0004-canvas-rendering_ko.md))가
   **추가 전용 `change_event` 로그**에 추가되며, 각 이벤트는 출처를 위한 기원
   `{panel, entityKind, entityId, partPath}`를 담는다. 현재 *dirty* 작업 상태는 마지막 commit 위에 미커밋
   이벤트를 fold한 것이다. **저장은 이벤트를 blob/tree/commit으로 구체화(materialize)한다.** 이벤트는 절대
   변경되거나 삭제되지 않는다(감사), 증거 사슬 가드레일을 충족한다.
3. **항목별 저장 = 서브트리 commit.** 개별 변경/서브트리를 저장하면 영향받은 blob + 루트까지의 트리 경로만 쓰고
   ref를 전진시킨다 — 트리의 나머지는 콘텐츠 주소로 공유된다(복사 없음). **전체 저장 = dirty set 전체를 하나의
   commit으로.**
4. **브랜치 / diff / 재현은 객체 모델 연산이다.** 브랜치 = commit에서 분기한 새 ref; diff = 두 트리의 구조적
   비교(work-tree diff 창을 구동); 재현 = commit의 트리를 체크아웃하여 `SimulationRun`을 위한 정확한
   `(workload, hw config, sim config)`를 재구성. run은 그것이 실행한 **commit id**를 기록하여 증거를 정확한
   구성에 묶는다(SOURCE-BRIEF §1).
5. **머지는 v1에서 의도적으로 최소다:** 브랜치는 비교/what-if를 위해 존재한다; **fast-forward와 수동 pick은
   지원하되, 분기된 브랜치 간 자동 3-way 머지는 연기한다**(이것이 CRDT나 Dolt가 사주는 주된 것이며, 아직 필요
   없다).
6. **하나의 `WorkTreeService`**([ADR-0001](./ADR-0001-product-surface_ko.md))가 이 시맨틱을 한 번 구현한다;
   web/MCP/CLI가 동일한 항목별/전체 저장, 브랜치, diff, 재현 동작을 받는다.
7. **저장소**는 blob/tree/commit/ref/event를 위한 평범한 Postgres 테이블이며
   ([ADR-0002](./ADR-0002-data-layer_ko.md)), 버전 관리 대상 엔티티에 대한 FK를 갖는다; 콘텐츠 주소는 해시이고;
   큰 임베디드 페이로드(있다면)는 blob-on-FS 규칙을 따른다.

## 결과(Consequences)

- **쉬운 것:** 브랜치/diff/재현과 인간 검토 가능하고 출처가 풍부한 이력이 네이티브다; 항목별 대 전체 저장은
  구조적 공유를 통한 서브트리-대-루트 commit에서 자연히 도출된다; 브랜치 DAG는 React Flow 스택을 재사용한다
  ([ADR-0004](./ADR-0004-canvas-rendering_ko.md)); run은 재현 가능하게 commit id에 고정된다; 시맨틱은 하나의
  서비스를 통해 모든 surface에서 동일하다.
- **어려운 것 / 수용하는 것:** commit/tree/diff 로직과 콘텐츠 주소화를 우리가 직접 구현한다; CRDT가 추가되기
  전까지 **실시간 다중 작성자 공동 편집 없음**(실험당 단일 작성자가 v1 가정); 자동 브랜치 간 머지는 연기; 이벤트
  로그 fold가 올바르고 유한하게 유지되어야 한다(commit을 통한 압축).
- **재검토 트리거:** 하나의 실험에 대한 동시 실시간 다중 작성자 편집이 제품 요구가 될 때 **CRDT 추가**; 브랜치
  조정이 지배적 워크플로가 될 때 **자동 3-way 머지 추가**(또는 **Doltgres** 재고,
  [ADR-0002](./ADR-0002-data-layer_ko.md)와 조율).

## 미해결 질문 / 재검토 트리거

- `TODO(open-question: worktree-granularity)` — 캔버스별 `change_tree`의 정확한 항목 입도(C1 노드당 blob 하나?
  C3 component당? micro-edit당?) — 캔버스 팀과의 제품 정의가 필요하다.
- `TODO(open-question: event-log-compaction)` — 재생 비용을 제한하기 위해 의도 이벤트 로그를 언제/어떻게
  commit으로 압축하는가.
- `TODO(open-question: crdt-trigger)` — v1 단일 작성자 → CRDT 다중 작성자를 뒤집는 구체적 조건.
- `TODO(open-question: skills-as-versioned)` — 패키징된 skill이 이 동일한 work-tree에서 버전 관리되는가?
  ([ADR-0001](./ADR-0001-product-surface_ko.md) / OQ-PS-5와 조율)
- `TODO(open-question: doltgres-vs-handrolled)` — 테이블 수준 브랜치/머지가 지배적이라면 Doltgres 대 직접 제작
  객체 모델을 재검토([ADR-0002](./ADR-0002-data-layer_ko.md)와 조율).
- `TODO(open-question: run-commit-binding)` — 축들이 조합될 때 `SimulationRun`이 단일 commit을 고정하는가,
  아니면 다중 캔버스 commit 세트를 고정하는가?

## runbook에 대한 함의

- **phase-0/phase-5-persistence** — 콘텐츠 주소화 + 버전 관리 대상 엔티티에 대한 FK와 함께
  `change_blob/change_tree/change_commit/ref/change_event` 테이블을 생성하는 RB(Postgres 이식 가능,
  [ADR-0002](./ADR-0002-data-layer_ko.md)를 따름).
- **phase-1 / core** — `WorkTreeService`를 위한 RB: 의도 이벤트 추가, dirty 상태 fold, 항목별 commit(서브트리)
  + 전체 commit, 브랜치, 구조적 diff, 체크아웃/재현; web/MCP/CLI에 동일하게 노출
  ([ADR-0001](./ADR-0001-product-surface_ko.md)).
- **phase-1 app shell** — work-tree UI(가상화된 변경 트리, 항목별/전체 저장, diff 창, 브랜치 DAG)를 클라이언트
  `ExperimentStore`에 연결하는 RB([ADR-0004](./ADR-0004-canvas-rendering_ko.md)).
- **simulation** — 각 `SimulationRun`이 그것이 실행한 commit id를 기록하도록 보장하는 RB(증거 결속).
