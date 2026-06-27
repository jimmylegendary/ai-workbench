# Knowledge Core — Overview

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./entity-and-edge-model_ko.md](./entity-and-edge-model_ko.md)
  - [./claim-evidence-and-evidence-gate_ko.md](./claim-evidence-and-evidence-gate_ko.md)
  - [../01-decisions/ADR-0001-product-surface-and-skill-interface_ko.md](../01-decisions/ADR-0001-product-surface-and-skill-interface_ko.md)
  - [../01-decisions/ADR-0002-storage_ko.md](../01-decisions/ADR-0002-storage_ko.md)
  - [../01-decisions/ADR-0003-knowledge-data-model_ko.md](../01-decisions/ADR-0003-knowledge-data-model_ko.md)
  - [../01-decisions/ADR-0004-provenance-and-trust_ko.md](../01-decisions/ADR-0004-provenance-and-trust_ko.md)
  - [../01-decisions/ADR-0005-ingestion-pipeline_ko.md](../01-decisions/ADR-0005-ingestion-pipeline_ko.md)
  - [../01-decisions/ADR-0006-retrieval_ko.md](../01-decisions/ADR-0006-retrieval_ko.md)
  - [../01-decisions/ADR-0007-import-export-contracts_ko.md](../01-decisions/ADR-0007-import-export-contracts_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF_ko.md

## Purpose
이 문서는 CAW-02에서 **knowledge core가 *무엇인가*** — 제품의 모든 쓰기 규칙을 소유하는 단일 트랜잭션 컴포넌트 — 와 **그 조각들이 어떻게 관계 맺는지**를 기술한다. 이것은 `05-knowledge-core/` 폴더의 지도이다: 이 문서는 entity/edge 어휘를 다시 도출하지 않으며(see [entity-and-edge-model_ko.md](./entity-and-edge-model_ko.md)) 불변식 강제 세부도 다시 도출하지 않고(see [claim-evidence-and-evidence-gate_ko.md](./claim-evidence-and-evidence-gate_ko.md)), 저장 레이아웃(ADR-0002), retrieval(ADR-0006), import/export wire 포맷(ADR-0007)도 결정하지 않는다. 그것들은 core가 *사용하거나* core에 의해 *소비되는* 형제 문서들이다.

## 1. core가 무엇인가 (한 문장)
knowledge core는 모든 로직 — validation, evidence gate, trust 재계산, boundary 전파, append-only audit — 을 소유하는 **단일 트랜잭션 제품 core**([ADR-0001](../01-decisions/ADR-0001-product-surface-and-skill-interface_ko.md)에 따름)이며, 따라서 API, MCP server, CLI는 자체 규칙을 전혀 추가하지 않는 **얇은 어댑터(thin adapters)**가 될 수 있다.

```
              ┌──────────── thin adapters (codegen'd from one op manifest) ────────────┐
   humans →   │   CLI            API (typed)            MCP server         (read-only viewer)
   agents →   └───────────────────────────────┬──────────────────────────────────────────┘
                                               │  one op manifest (the only way in)
                                  ┌────────────▼─────────────┐
                                  │      KNOWLEDGE CORE       │   ← everything below lives here
                                  │  • op manifest + skill-wrap│
                                  │  • input schemas (gate L1) │
                                  │  • transaction validator   │  (gate L2)
                                  │  • trust recompute          │
                                  │  • boundary propagation     │
                                  │  • append-only audit emit   │
                                  └────────────┬─────────────┘
                                               │ append-only writes (+ supersedes)
                       ┌───────────────────────┼───────────────────────────┐
            knowledge/**/*.md (SOT)   knowledge/_events/*.jsonl     git history (signed)
                       │  reindex (idempotent, gate L3 re-check)
                  SQLite index (derived, disposable: nodes, edges, FTS5)
```

## 2. 조각들과 그 관계
| Piece | Responsibility | Owned by | Lives in |
|---|---|---|---|
| **Op manifest** | 쓰기/읽기 연산(`add_source`, `extract_claim`, `attach_evidence`, `synthesize_note`, `classify_signal`, `retrieve`, …)의 단일 선언적 목록. 어댑터는 이로부터 codegen되며; 어댑터에는 아무것도 추가되지 않는다. | ADR-0001 | core |
| **Skill-wrap** | 안전한 agent 인터페이스: 각 op은 검증된 트랜잭션이며; agent 쓰기에 대해 기본 확인(confirmation-by-default). | ADR-0001, brief §5 | core |
| **Input schemas (gate layer 1)** | op별 typed 입력; 산문을 evidence로 쓰는 것을 구조적으로 차단(`attach_evidence`에 산문 필드 없음). | [evidence-gate 문서](./claim-evidence-and-evidence-gate_ko.md) | core |
| **Entity + edge model** | typed 노드와 typed relation 어휘. | [entity-and-edge-model_ko.md](./entity-and-edge-model_ko.md), ADR-0003 | core + frontmatter |
| **Transaction validator (gate layer 2)** | 커밋 전 검사: Claim→Evidence 불변식, Note-as-evidence 금지, edge endpoint 적법성; 실패 시 트랜잭션 전체 중단. | [evidence-gate 문서](./claim-evidence-and-evidence-gate_ko.md) | core |
| **Trust recompute** | 모든 edge 변경 시 edge 그래프로부터 `trust`(T0–T3 / contested)를 도출; 호출자 값은 무시됨. | ADR-0004 | core |
| **Boundary propagation** | provenance 조상에 대해 monotone한 `boundary` + `visibility`를 계산; synthesis는 결코 낮추지 않음. | ADR-0004 | core |
| **Audit emit** | 모든 skill-wrap 쓰기를 `knowledge/_events/<ts>-<op>.jsonl` + 하나의 `provenance_event`로 미러링; git commit이 변조 방지(tamper-evident) 기록. | ADR-0002, ADR-0004 | core |
| **Reindex (gate layer 3)** | `knowledge/**`로부터 도출 인덱스를 결정적·idempotent하게 재구축; 불변식을 다시 실행하고 요란하게 실패. | ADR-0002 | core (batch) |

핵심 줄기: **쓰기는 정확히 하나의 op로 진입하고; core가 검증하고, 전파하고, trust를 도출하고, .md + 이벤트를 쓰며, 그제서야 변경이 실재가 된다.** 어떤 surface도 어떤 DB 제약도 core를 대체하지 않는다.

## 3. 폴더 인덱스 / 지도 (`05-knowledge-core/`)
| File | What it covers | Read it when… |
|---|---|---|
| [overview_ko.md](./overview_ko.md) (이 문서) | core가 무엇인가; 조각들의 관계; 폴더 지도. | 온보딩; 적절한 deep-dive 찾기. |
| [entity-and-edge-model_ko.md](./entity-and-edge-model_ko.md) | typed entity 집합과 typed edge 어휘(`evidence_for`, `challenges`, `extracted_from`, `cites`, `derived_from`, `about_concept`, `addresses`, `relates_to`, `supports`, `refutes`, `supersedes`, `attributed_to`); graph-upgrade 준비도. | 새 entity/relation 모델링; 그래프 업그레이드 계획. |
| [claim-evidence-and-evidence-gate_ko.md](./claim-evidence-and-evidence-gate_ko.md) | 핵심 Claim→Evidence 불변식과 구조적 evidence gate; 3계층 강제; error taxonomy; negative test. | gate 구현/감사; 불변식 runbook 작성. |

## 4. core가 의도적으로 하지 않는 것
| Not in the core | Where it lives | Why |
|---|---|---|
| 물리적 파일 레이아웃, SQLite 스키마 DDL, FTS/vector 마이그레이션 | [ADR-0002](../01-decisions/ADR-0002-storage_ko.md), `04-data-layer/` | 저장은 도출/일회용; core는 엔진 비의존적. |
| 어댑터 사용성(CLI 플래그, MCP tool 설명, HTTP 라우트) | [ADR-0001](../01-decisions/ADR-0001-product-surface-and-skill-interface_ko.md), `06-interfaces/`, `07-backend-api/` | 어댑터는 얇고 codegen됨; 규칙을 추가하지 않음. |
| ingestion 단계 메커니즘(parse → extract → attach → synthesize → classify) | [ADR-0005](../01-decisions/ADR-0005-ingestion-pipeline_ko.md) | 파이프라인은 core op을 *호출*함; core는 호출마다 불변식을 강제. |
| 랭킹/RAG | [ADR-0006](../01-decisions/ADR-0006-retrieval_ko.md) | retrieval은 인덱스를 읽음; 쓰기는 결코 거기에 의존하지 않음. |
| 제품 간 wire 스키마 + redaction | [ADR-0007](../01-decisions/ADR-0007-import-export-contracts_ko.md) | 독립 제품 간 File/API 경계; 공유 store 없음. |
| simulation 실행 / radar 수집 | CAW-01 / CAW-05 (별개 제품) | CAW-02는 그들의 export를 참조로 *카탈로그*만 함. |

## 5. core의 불변식 (양보 불가, core가 강제하는 것)
1. **Claim→Evidence.** 승격 가능한 모든 `Claim`은 자신이 구체적 artifact를 `extracted_from`하는 `Evidence`로부터 오는 `evidence_for` edge를 ≥1개 가진다 — 결코 산문이 아니고, 결코 `Note`가 아니다. (전체 세부: [claim-evidence-and-evidence-gate_ko.md](./claim-evidence-and-evidence-gate_ko.md).)
2. **생성된 synthesis ≠ evidence.** `Note`는 `generated=true`를 지니며 evidence edge의 출발점이 되는 것이 구조적으로 차단된다.
3. **Append-only + supersedes.** update/delete 없음; 수정은 `supersedes`로 연결된 새 버전이다.
4. **도출되는 trust & boundary.** `trust`와 `boundary`/`visibility`는 계산되며 결코 호출자가 설정하지 않는다; synthesis는 결코 민감도를 낮추지 않는다([ADR-0004](../01-decisions/ADR-0004-provenance-and-trust_ko.md)에 따름).
5. **모든 쓰기는 감사된다.** 트랜잭션당 하나의 `provenance_event` + 하나의 `_events` 라인 + 하나의 git commit.
6. **하나의 강제, 여러 엔진.** 동일한 검사가 CLI/API/MCP 전반과 SQLite/(미래) Postgres 전반에서 동일하게 실행된다 — 그것들은 DB 제약이 아니라 core에 산다.

## 6. 재구성 가능성(Reconstructability) (core가 보장하는 속성)
임의의 `Note`가 주어지면, core는 그것이 어떻게 도달되었는지를 고정된 순회(traversal)로 재현할 수 있다 — 아래 체인 — 더하여 *누가/무엇을/언제*를 기록하는 hop별 `provenance_event`:
```
note --cites--> claim --evidence_for(in)-- evidence --extracted_from--> source | trace | simulation_run | experiment
```
하류의 어떤 것도 한 계층 아래를 가리키지 않고는 존재할 수 없다. 이것이 v0을 신뢰할 수 있는 *append + retrieve* store로 만들고, 데이터 재작성 없이 이후의 그래프 / continual-learning 업그레이드로 가는 문을 열어둔다.

## Open Questions
- TODO(open-question: whether the read-only viewer is in-scope for v0 or deferred — see brief §4 "optional").
- See [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md).

## Implications for runbooks
- **RB (core skeleton):** op manifest + skill-wrap을 scaffold한다; 어댑터는 손으로 작성하는 규칙 지점이 아니라 codegen 타깃이다.
- **RB (gate + trust + boundary):** validator, trust 재계산, boundary 전파를 모든 쓰기 op이 호출하는 core 서비스로 구현한다; 정확한 검사는 형제 deep-dive를 보라.
- **RB (audit):** 모든 op은 동일 트랜잭션 내에서 하나의 `provenance_event` + 하나의 `_events/*.jsonl` 라인을 방출한다.
- **RB (model docs):** [entity-and-edge-model_ko.md](./entity-and-edge-model_ko.md)로부터 `GLOSSARY.md`를 생성하여 용어가 일치하도록 한다.
