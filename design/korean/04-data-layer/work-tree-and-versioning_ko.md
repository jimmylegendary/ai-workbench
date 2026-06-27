# Work-Tree & 버전 관리 (저장 모델) — CAW-01

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [data-model.md](./data-model_ko.md), [../05-caw01-simulation-control-plane/change-management-worktree.md](../05-caw01-simulation-control-plane/change-management-worktree_ko.md), [../01-decisions/ADR-0007-change-management-worktree.md](../01-decisions/ADR-0007-change-management-worktree_ko.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## 목적

work-tree의 **저장(storage)** 모델: git 유사 객체 테이블, intent 이벤트 로그, 해싱, 그리고
항목별/전체 저장과 브랜칭이 커밋으로 어떻게 매핑되는지를 다룬다. **UX** 관점(트리/diff/브랜치 패널)은
[../05-caw01-simulation-control-plane/change-management-worktree.md](../05-caw01-simulation-control-plane/change-management-worktree_ko.md)에 있으며 — 본 문서는 UI를 다시 명세하지 않는다.

## 객체 모델 (git 유사, Postgres 내)

```sql
change_blob(
  hash        TEXT PRIMARY KEY,         -- content address (sha256 of canonical JSON)
  kind        TEXT,                     -- 'c1_node' | 'c2_wiring' | 'c3_part' | ...
  content     JSONB                     -- immutable snapshot of ONE versioned thing
)

change_tree(
  hash        TEXT PRIMARY KEY,         -- content address of the entry map
  entries     JSONB                     -- [{name, type:'blob'|'tree', hash}]  (mirrors workload/serving/hardware subtrees)
)

change_commit(
  id          UUID PRIMARY KEY,
  root_tree   TEXT REFERENCES change_tree(hash),
  parents     TEXT[],                   -- parent commit ids (append-only DAG)
  author      TEXT, surface TEXT, message TEXT, created_at TIMESTAMPTZ
)

ref(
  experiment_id UUID, name TEXT,        -- 'main' + user branch names
  commit_id   UUID REFERENCES change_commit(id),
  PRIMARY KEY (experiment_id, name)
)

intent_event(                            -- append-only log feeding the object model
  id UUID, experiment_id UUID, surface TEXT, actor TEXT,
  op TEXT, payload JSONB, created_at TIMESTAMPTZ
)
```

## 저장 의미론(save semantics)

| 동작 | 효과 |
| --- | --- |
| **항목별 저장(Per-item save)** | 편집된 대상을 해싱 → `change_blob`; 영향받는 `change_tree` 경로를 재구축; 변경되지 않은 서브트리를 공유하는 `root_tree`를 가진 새 `change_commit` 생성(구조적 공유, structural sharing) |
| **전체 저장(Full save)** | 현재 전체 root_tree를 메시지와 함께 커밋 |
| **브랜치(what-if)** | 어떤 커밋을 가리키는 새 `ref` 생성; 이후 저장은 그 ref를 전진시킴 |
| **Diff** | `WorkTreeService.diff(refA, refB)`가 두 root_tree를 순회하며 blob 해시를 비교 |

## content-addressing을 쓰는 이유

- 저렴한 중복 제거(dedup) + 구조적 공유: 하드웨어만 편집하면 workload/serving 서브트리는 변경 없이 재사용된다.
- 본질적 출처(provenance): 커밋은 곧 누가/언제/어느 surface에서/왜에 대한 정보 그 자체다([ADR-0007](../01-decisions/ADR-0007-change-management-worktree_ko.md)).
- 완전한 VCS 없이도 결정론적 diff/merge 프리미티브 제공.

## intent 이벤트 로그

모든 변경(mutation)은 먼저 `intent_event`에 추가된다("사용자가 무엇을 의도했는가"의 단일 출처). 객체 모델은
이로부터 파생된다. 이는 감사 추적(audit trail)을 제공하고, 객체 테이블이 유실되더라도 재구축 경로를 제공한다.

## 동시성

v1에서는 단일 작성자(single-writer) 가정(전문가 1인). CRDT/실시간 다중 작성자는 **연기됨**
([ADR-0007](../01-decisions/ADR-0007-change-management-worktree_ko.md)); 이벤트 로그가 이를 위한 여지를 남겨둔다.

## 미해결 질문

v1에서 merge(3-way)를 노출할지, 아니면 branch+diff만 둘지 — branch+diff만 두는 쪽으로 기울고 있음; TODO(open-question).

## 런북에 대한 함의

phase-0이 이 테이블들을 생성한다. phase-2 work-tree 런북이 이 테이블들에 대해 `WorkTreeService.saveItem/saveAll/branch/diff`를
구현하며, 캔버스는 편집 시 `intent_event`를 방출(emit)한다.
