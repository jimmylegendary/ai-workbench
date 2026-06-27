# CAW-02 Runbooks — 인덱스

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [runbook-conventions.md](runbook-conventions_ko.md)
  - [../09-roadmap/milestones-and-phases.md](../09-roadmap/milestones-and-phases_ko.md)
  - [../09-roadmap/dependency-graph.md](../09-roadmap/dependency-graph_ko.md)
  - [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적

이 문서는 CAW-02 runbook의 **실행 인덱스(execution index)** 입니다. 즉, **AI builder**가 Team/Personal Knowledge Repository
(CAW-02) — CAW-01/05/03과 공유 substrate가 없는 독립적이고 단독으로 동작하는 제품으로, 자체 core, data, surface를 가짐 — 를
구축하기 위해 따르는 빌드 계획입니다. 이 문서는 builder에게 *runbook이 무엇인지, 어떤 순서로 실행해야 하는지, 그리고 언제 한
phase를 시작해도 되는지*를 알려줍니다.
ADR의 근거를 다시 서술하지 않으며(see `../01-decisions/`), 단계별 빌드 지침도 다루지 않습니다(그것들은 각 `RB-*.md` 내부에
존재). 엄격한 runbook 계약은
[runbook-conventions.md](runbook-conventions_ko.md)이고, 포맷의 권위 있는 출처는
[DOC-CONVENTIONS §6](../_meta/DOC-CONVENTIONS_ko.md)입니다.

## runbook이란 무엇인가

runbook(`RB-XXX-*.md`)은 AI builder가 실행하는 하나의 응집된, **재개 가능(resumable)** 한 빌드 단위입니다. 설계 문서는
*무엇을 & 왜*를 말하고, runbook은 *어떻게*를 말합니다. 각 runbook은 자기완결적이며, 자신의 의존성을 선언하고, Acceptance
checkpoint에서 트리를 **green** 상태(컴파일됨, lint 통과, schema 검증 통과)로 남겨 중단된 빌드가 깔끔하게 재개되도록 합니다.
runbook 안의 코드는 **빌드 가이드(build guidance)** (skeleton / signature / config)이며, 실제 코드는 builder가 작성합니다.

## 실행 방법

1. **`Depends on:`을 존중하라** — 의존성이 `accepted`/green이 아닌 runbook은 절대 시작하지 마라. `Depends on:`
   그래프는 [dependency-graph.md](../09-roadmap/dependency-graph_ko.md)의 edge 목록을 반영한다.
2. **phase를 순서대로 실행하라.** phase는 대체로 순차적이다. 허용되는 유일한 중첩은 P2(core)와 P3
   (provenance/trust)가 안정화된 이후의 P5(surface)와 P6(retrieval)이다 — 아래 milestone gate 참조.
3. **각 phase 종료를 gate로 취급하라.** 한 phase의 runbook은 그 phase의
   [milestones-and-phases.md](../09-roadmap/milestones-and-phases_ko.md)에 있는 milestone 종료 기준이 모두 충족될 때에만
   완료된다. P2/P3/P5 acceptance가 충족되기 전까지 어떤 P6 runbook도 스스로를 `ready`로 선언할 수 없다.
4. **모든 checkpoint에서 트리를 green으로 남겨라.** 각 Acceptance checklist는 재개 지점이다.
5. **core를 절대 우회하지 마라.** 모든 write는 하나의 transactional core(validator + evidence gate +
   append-only audit)를 거친다. surface는 얇은 adapter일 뿐이다.

## phase 표

폴더 번호 `10-runbooks/0X-*`는 로드맵 phase P0–P7과 1:1로 매핑된다.

| Phase | Runbook folder | Theme | Milestone | Key design |
|-------|----------------|-------|-----------|------------|
| **P0 Foundations** | `00-foundations/` | repo, CI, `knowledge/` 트리 레이아웃, frontmatter schema, 하나의 generic typed-edge 데이터 모델 | M0 | [ADR-0002](../01-decisions/ADR-0002-storage_ko.md), [ADR-0003 data model](../01-decisions/), [05-knowledge-core](../05-knowledge-core/) |
| **P1 Storage & reindex** | `01-storage-and-index/` | md-in-git = 단일 source of truth; append-only `_events/*.jsonl`; deterministic idempotent reindex → SQLite (FTS/vector는 droppable migration 내) | M1 가능케 함 | [ADR-0002](../01-decisions/ADR-0002-storage_ko.md), [04-data-layer](../04-data-layer/) |
| **P2 Core & skill-wrap** | `02-core-and-skillwrap/` | 하나의 transactional core: validator, 3-layer Claim→Evidence invariant, **structural evidence gate**, append-only + supersedes, op manifest, ingestion round-trip | **M1** | [ADR-0004 evidence gate](../01-decisions/), [ADR-0005 ingestion](../01-decisions/ADR-0005-ingestion-pipeline_ko.md), [05-knowledge-core](../05-knowledge-core/) |
| **P3 Provenance & trust** | `03-provenance-trust/` | boundary {public/internal/confidential} × visibility {team/private} monotone propagation; trust ladder T0–T3 + contested (AI는 T2로 cap); audit/events | M2 | [ADR provenance/trust](../01-decisions/) |
| **P4 Surfaces** | `04-surfaces/` | op manifest로부터 codegen된 API + MCP + CLI 얇은 adapter; agent write에 대한 기본 confirmation | M3 | [ADR-0001 surface & skill interface](../01-decisions/ADR-0001-product-surface-and-skill-interface_ko.md) |
| **P5 Retrieval** | `05-retrieval/` | SQLite FTS5/BM25 + ranking 이전의 일급 structured filter; citation 제약 RAG hydration; v0에서 embedding 없음 | M4 | [ADR-0006 retrieval](../01-decisions/) |
| **P6 Import / export** | `06-import-export/` | quarantine import + confidentiality 검사; fail-closed export allow-list; 모든 경계 교차 시 재-redaction; signed bundle | M5 | [ADR-0007 import/export](../01-decisions/ADR-0007-import-export-contracts_ko.md) |
| **P7 Viewer & hardening** | `07-viewer-and-hardening/` | 선택적 read-only viewer; dedup 품질; resumability hardening | — | [PRODUCT-BRIEF §4](../_meta/PRODUCT-BRIEF_ko.md) |

> 작업 프레이밍 노트: 거친 "0 foundations / 1 core / 2 ingestion /
> 3 retrieval / 4 interfaces / 5 import-export" 그룹화는 P0–P1을 foundations로 합치고,
> ingestion을 P2 core로 접어 넣으며, surface와 retrieval의 순서를 바꾼다.
> **권위 있는** 순서는 위의 P0–P7 표이며(출처:
> [milestones-and-phases.md](../09-roadmap/milestones-and-phases_ko.md)), 이를 따르라.

## Milestone gate

| Milestone | Gate (통과하려면 모두 true여야 함) |
|-----------|---------------------------------|
| **M0** | 트리가 compile/lint됨; 빈 트리에서 CI green; `knowledge/` + `_events/`가 초기화되고 버전 관리됨 |
| **M1** | `add-source → extract-claim → attach-evidence → synthesize-cited-note`가 유효한 md-in-git을 쓰고, SQLite로 reindex되며, hydrate된 provenance와 함께 retrieval 가능 — ad-hoc 편집이 아니라 skill interface를 통해 |
| **M2** | boundary/visibility monotone propagation + T0–T3 ladder가 deterministic하게 계산됨; evidence gate가 structural함 |
| **M3** | 세 surface가 하나의 manifest로부터 codegen되고 의미가 동일함; confirmation 없는 agent write는 차단됨 |
| **M4** | filter가 ranking 이전에 적용됨(confidential/private 누출 없음); RAG는 claim+evidence를 반환하고 불투명한 blob을 절대 반환하지 않음 |
| **M5** | import가 quarantine되고 confidentiality 검사됨; export가 fail-closed allow-list; bundle이 signed됨; 공유 store 없음 |

## Milestone-1 체인(critical path)

M1은 **critical milestone**이다 — 실제 storage substrate 위에서 provenance round-trip이 end to end로
존재하기 전까지는 그 이후의 어떤 것도 의미가 없다. M1 체인은 dependency-graph의 critical path
`A → B → E → F → G`를 따른다:

```
RB-00x (P0: data model + knowledge/ tree + frontmatter schemas + CI)   [A,C,D]
   ↓
RB-01x (P1: md-git writer + append-only _events)                       [B]
   ↓
RB-01x (P1: deterministic idempotent reindex → SQLite)                 [E]
   ↓
RB-02x (P2: core validator + 3-layer Claim→Evidence invariant + gate + op manifest)  [F]
   ↓
RB-02x (P2: 6-stage ingestion round-trip via skill interface)         [G]  ===> M1
   ↓
RB-05x (P5: FTS5 retrieval returns the Note with hydrated provenance) [I]  (closes M1 retrieval criterion)
```

H(provenance/trust), J(surface), K/L(import/export)에 있는 모든 것은
**M1 이후**이다. M1 runbook은 critical path `A → B → E → F → G`에만 의존한다.

## 예산 규율(budget discipline)

- **작고 재개 가능한 runbook.** 몇 개의 비대한 runbook보다 좁은 runbook 여러 개를 선호하라. 각각은 하나의
  builder 세션 안에서 완료하고 검증할 수 있어야 한다.
- **모든 checkpoint에서 green.** 각 Acceptance checklist는 저장 지점이다. 트리를 green으로 남길 수 없는
  runbook은 너무 크다 — 쪼개라.
- **runbook당 하나의 관심사.** storage, reindex, validator, gate, 그리고 각 surface는 별도 단위이므로
  실패가 깔끔하게 롤백된다(각 runbook의 Rollback / safety 섹션 참조).
- **추측성 범위 금지.** v0는 **append + retrieve + skill-wrap**이며 — 지속 학습도, graph DB도, 풍부한 UI도
  아니다(PRODUCT-BRIEF §9). runbook은 자기 phase의 milestone을 넘어 빌드해서는 안 된다.
