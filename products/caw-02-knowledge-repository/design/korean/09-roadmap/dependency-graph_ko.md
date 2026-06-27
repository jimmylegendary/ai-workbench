# Dependency Graph

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [milestones-and-phases.md](milestones-and-phases_ko.md)
  - [risks-and-mitigations.md](risks-and-mitigations_ko.md)
  - [../01-decisions/ADR-0002-storage.md](../01-decisions/ADR-0002-storage_ko.md)
  - [../01-decisions/ADR-0005-ingestion-pipeline.md](../01-decisions/ADR-0005-ingestion-pipeline_ko.md)
  - [../01-decisions/ADR-0007-import-export-contracts.md](../01-decisions/ADR-0007-import-export-contracts_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF_ko.md

## Purpose

이 문서는 역량(capability)의 방향성 비순환 그래프(DAG)로서 **빌드 순서**를
고정하고, 각 edge가 존재하는 이유를 보여준다. 다음의 엄격한 순서 제약을
강제한다: **데이터 모델이 모든 것에 선행**, **storage + reindex가 ingestion에
선행**, **evidence gate가 agent 쓰기에 선행**, **import/export는 core 이후**.
이 문서는 단계별 진입/종료 기준을 다시 서술하지 않으며(see
[milestones-and-phases.md](milestones-and-phases_ko.md)) ADR의 근거도 다루지
않는다.

## Hard ordering rules (must hold)

| Rule | Why |
|------|-----|
| 데이터 모델(ADR-0003)이 모든 빌드 작업에 선행 | 모든 entity/edge/validator가 타입화된 노드 + 하나의 generic edge 계약을 참조한다 |
| Storage(md-git) + 결정론적 reindex가 ingestion에 선행 | ingestion이 쓰는 entity는 md-git → SQLite로 round-trip이 가능해야 한다(ADR-0002) |
| Evidence gate가 agent 쓰기에 선행 | `attach_evidence`는 구조적이며, agent는 gate가 존재하기 전에 쓰면 안 된다(ADR-0004) |
| Core(validator + op manifest)가 surface에 선행 | API/MCP/CLI는 manifest에서 codegen된 얇은 adapter이며 어떤 것도 추가하지 않는다(ADR-0001) |
| Provenance/trust + boundary가 import/export에 선행 | 경계 횡단(crossing)은 boundary/visibility/trust 기준으로 재-redaction 및 필터링한다(ADR-0007) |
| Retrieval이 export bundle에 선행 | export된 bundle은 hydrate된 claim+evidence retrieval 결과다(ADR-0006/0007) |

## DAG (ASCII)

```
                         ┌───────────────────────────┐
                         │  A. DATA MODEL (ADR-0003)  │  ← root: everything depends on this
                         │  typed nodes + 1 edge tbl  │
                         └─────────────┬─────────────┘
                                       │
                ┌──────────────────────┼───────────────────────┐
                v                      v                        v
   ┌────────────────────┐  ┌────────────────────────┐  ┌──────────────────────┐
   │ B. STORAGE md-git   │  │ C. FRONTMATTER SCHEMAS │  │ D. AUDIT/_events log │
   │ (ADR-0002, P1)      │  │ (layer 1 of invariant) │  │ (append-only, P1)    │
   └─────────┬───────────┘  └───────────┬────────────┘  └──────────┬───────────┘
             │                          │                          │
             v                          │                          │
   ┌────────────────────┐               │                          │
   │ E. DETERMINISTIC   │               │                          │
   │ REINDEX → SQLite   │◄──────────────┘                          │
   │ (idempotent, P1)   │   (layer 3 re-check of invariant)        │
   └─────────┬──────────┘                                          │
             │                                                     │
             v                                                     │
   ┌─────────────────────────────────────────────┐                │
   │ F. CORE: validator + Claim→Evidence invariant │◄──────────────┘
   │    + STRUCTURAL EVIDENCE GATE (ADR-0004)      │  (layer 2 of invariant)
   │    + op manifest (P2)                          │
   └───────────────────────┬───────────────────────┘
                            │
        ┌───────────────────┼─────────────────────────┐
        v                   v                          v
┌───────────────┐  ┌──────────────────────┐  ┌────────────────────────┐
│ G. INGESTION   │  │ H. PROVENANCE/TRUST  │  │ I. RETRIEVAL FTS5 +    │
│ 6-stage pipe   │  │ boundary+visibility  │  │ structured filters     │
│ ===> M1 (P2)   │  │ monotone, T0–T3 (P3) │  │ (ADR-0006, P5)         │
└──────┬─────────┘  └──────────┬───────────┘  └───────────┬────────────┘
       │                       │                           │
       │                       v                           │
       │            ┌────────────────────────┐             │
       │            │ J. AGENT WRITES via     │             │
       │            │ skill-wrap, confirm-by- │             │
       │            │ default (needs gate F + │             │
       │            │ trust H) — surfaces P4  │             │
       │            └──────────┬─────────────┘             │
       │                       │                           │
       └───────────┬───────────┴─────────────┬─────────────┘
                   v                          v
        ┌────────────────────────┐  ┌────────────────────────┐
        │ K. IMPORT: quarantine + │  │ L. EXPORT: fail-closed │
        │ confidentiality check   │  │ allow-list + signed    │
        │ (CAW-01/05) (P6)        │  │ bundle (CAW-03) (P6)   │
        └────────────────────────┘  └────────────────────────┘
```

## Edge list (dependency → dependent, with reason)

| From | To | Reason |
|------|----|--------|
| A data model | B,C,D | 모든 storage/schema/audit가 node+edge 계약을 참조한다 |
| B md-git | E reindex | reindex는 md를 단일 진실 공급원으로 읽는다 |
| C frontmatter schemas | E reindex | layer-1 invariant가 layer-3 재확인에 입력된다 |
| B,C,D | F core | validator가 세 layer 전체에 걸쳐 invariant를 강제한다 |
| E reindex | F core | reindex 재확인이 세 번째 invariant layer다 |
| F core | G ingestion | 6-stage 파이프라인이 core op을 호출하고, gate가 잘못된 evidence를 차단한다 |
| F core (gate) | J agent writes | agent는 구조적 gate가 존재하기 전에 쓸 수 없다 |
| F core (manifest) | J surfaces | API/MCP/CLI는 op manifest에서 codegen된다 |
| G ingestion | (M1) | 최초 provenance round-trip = F를 통해 B+E 위에서의 ingestion |
| H trust/boundary | J agent writes | AI 작성물은 T2로 상한; confirmation-by-default |
| H trust/boundary | K,L import/export | 재-redaction + 필터링이 라벨에 의존한다 |
| I retrieval | L export | export bundle은 hydrate된 retrieval 결과다 |
| F,G,H,I,J | K,L | import/export는 core가 안정된 **이후**에 온다 |

## Critical path

```
A → B → E → F → G  ===>  M1 (first provenance round-trip + retrieval)
```

`H, I, J, K, L`에 있는 모든 것은 **M1 이후**다. Import/export(`K, L`)는 가장
깊은 leaf이며 core + provenance + retrieval이 안정되기 전에는 시작해서는 안
된다.

## Parallelizable once F (core) is stable

- `H`(provenance/trust)와 `I`(retrieval)는 병렬로 진행할 수 있다.
- `J`(surfaces)는 `F`(manifest)와 `H`(trust)가 모두 필요하므로 그 이후에 합류한다.
- `K`(import)와 `L`(export)는 서로 독립적이지만 둘 다 `H`가 필요하다.

## Open Questions

- Provenance `H`가 완료되기 전에 retrieval `I`를 시작할 수 있는지(필터는 라벨이 필요하다). TODO(open-question).
- See `../08-research-plan/open-questions.md`.

## Implications for runbooks

- 런북의 `Depends on:` 필드는 위의 edge list를 반영해야 한다.
- P6의 어떤 런북도 P2/P3/P5 acceptance가 충족되기 전에는 스스로를 `ready`로 선언할 수 없다.
- M1 런북은 critical path `A → B → E → F → G`에만 의존한다.
