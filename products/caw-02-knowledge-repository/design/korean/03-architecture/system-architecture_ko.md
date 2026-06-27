# System Architecture — 컨테이너와 단방향 의존성

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./component-boundaries_ko.md](./component-boundaries_ko.md)
  - [../01-decisions/ADR-0001-product-surface-and-skill-interface_ko.md](../01-decisions/ADR-0001-product-surface-and-skill-interface_ko.md)
  - [../01-decisions/ADR-0002-storage_ko.md](../01-decisions/ADR-0002-storage_ko.md)
  - [../01-decisions/ADR-0003-knowledge-data-model_ko.md](../01-decisions/ADR-0003-knowledge-data-model_ko.md)
  - [../01-decisions/ADR-0004-provenance-and-trust_ko.md](../01-decisions/ADR-0004-provenance-and-trust_ko.md)
  - [../01-decisions/ADR-0006-retrieval_ko.md](../01-decisions/ADR-0006-retrieval_ko.md)
  - [../01-decisions/ADR-0007-import-export-contracts_ko.md](../01-decisions/ADR-0007-import-export-contracts_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF_ko.md

## Purpose
CAW-02 — 독립형 Team/Personal Knowledge Repository — 의 **런타임 컨테이너(runtime containers)** 들이 어떻게
서로 맞물리는지, 그리고 모든 provenance/trust/boundary 로직을 정확히 한 곳에 모아 두는 **단방향 의존성 규칙
(one-way dependency rule)** 을 설명한다. 이는 C4의 "container" 뷰에 해당한다: 어떤 프로세스/모듈이 존재하고
데이터가 어떻게 흐르는지를 다룬다. 모듈 시그니처(see [component-boundaries_ko.md](./component-boundaries_ko.md)),
스토리지 레이아웃(see [ADR-0002](../01-decisions/ADR-0002-storage_ko.md)), 데이터 모델(see
[ADR-0003](../01-decisions/ADR-0003-knowledge-data-model_ko.md)), 와이어 포맷(see
[ADR-0007](../01-decisions/ADR-0007-import-export-contracts_ko.md))은 여기서 정의하지 않는다. CAW-01/03/05는
오직 별개의 독립 제품들에 대한 **import/export boundary** 로만 등장하며 — 결코 공유 substrate로 등장하지 않는다.

## 한눈에 보는 컨테이너
| # | Container | 책임 | 로직을 소유하는가? | 통신 대상 |
|---|---|---|---|---|
| C1 | **Thin adapters** (API / MCP / CLI) | transport ↔ core typed ops 변환; 그 외에는 없음 | 아니오 (codegen됨) | C2만 |
| C2 | **Product core** (transactional) | 검증, evidence gate, trust 재계산, boundary 전파, append-only 감사; 단일 chokepoint | **예 — 전부** | C3, C4 |
| C3 | **md-git store** | Markdown 파일 = 단일 source of truth; `_events` JSONL; git history | 아니오 (수동 데이터) | — |
| C4 | **Derived SQLite index** | 폐기 가능한 query/FTS index; reindex로 C3에서 재구축 | 아니오 (파생) | C3에서 재구축 |
| C5 | **Reindex** | C3로부터 C4를 결정론적·idempotent하게 재구축 + 불변식 재검사 | 재검사함 (저작하지 않음) | C3 읽고 C4 씀 |
| C6 | **Importers / Exporters** | re-redaction + allow-list를 동반한 제품 간 경계 횡단 | 아니오 — C2 ops 호출 | C2만; CAW-0x로/에서 파일 |
| C7 | **Read-only viewer** (선택) | 노드/링크 + trust/boundary 배지 탐색; 쓰기 경로 없음 | 아니오 | C2 읽기 경로만 |

이 제품은 **하나의 배포 단위(one deployable unit)** (바이너리 + git repo)로 출하된다: v0에서는 서버가 필요 없다
(ADR-0002 "v0 choice").

## 컨테이너 다이어그램 (ASCII)
```
                        WRITERS                                  READERS
        agent ─MCP─┐    human ─CLI─┐   CAW-0x ─API─┐        human ─▶ C7 viewer (read-only)
                   │              │                │                       │
                   ▼              ▼                ▼                       │ (boundary-filtered
              ┌─────────────────────────────────────────┐                 │  read path only)
   C6 import ▶│  C1  THIN ADAPTERS  (API · MCP · CLI)    │◀────────────────┘
   /export ──▶│  codegen'd from ONE op manifest          │
   (files     └───────────────────┬─────────────────────┘
    to/from                       │  typed ops {op, payload, idempotency_key}
    CAW-01/                       ▼
    03/05)            ┌──────────────────────────────────────────────┐
                      │  C2  PRODUCT CORE  (single transactional      │
                      │      chokepoint — owns ALL logic)             │
                      │  ┌────────┬─────────┬───────────┬──────────┐  │
                      │  │ Ingest │Provenance│ Boundary  │  Audit   │  │
                      │  │        │ /Trust   │           │(append-  │  │
                      │  │Retrieve│ (gate)   │ImportExp. │ only)    │  │
                      │  └────────┴─────────┴───────────┴──────────┘  │
                      └───────┬───────────────────────────┬──────────┘
                              │ file-first write           │ query / hydrate
                              ▼                            ▼
                ┌───────────────────────────┐   ┌──────────────────────────┐
                │  C3  md-git STORE (SoT)    │   │  C4  SQLite INDEX        │
                │  knowledge/<kind>/*.md     │   │  node · edge · event     │
                │  knowledge/_events/*.jsonl │   │  + FTS (droppable)       │
                │  git history (signed)      │◀──│  + vector (reserved)     │
                └───────────────────────────┘   └──────────────────────────┘
                              ▲   rebuild (drop & recreate)   ▲
                              └──────────── C5  REINDEX ──────┘
                                   (deterministic, idempotent,
                                    re-runs Claim→Evidence invariant)
```

## 단방향 의존성 규칙
**의존성은 core를 향해 안쪽으로 향한다; core는 오직 store에만 의존한다. 어떤 것도 adapter에 의존하지 않는다.**

```
C1 adapters ─▶ C2 core ─▶ C3 store (SoT)
C6 imp/exp  ─▶ C2 core            ▲
C7 viewer   ─▶ C2 core (reads)    │ C4 index is DERIVED from C3 (one-way, via C5)
```

구체적 제약(각각이 runbook의 인수 검사 항목이다):
1. **Adapter는 아무것도 더하지 않는다.** C1은 transport 매핑만 포함한다; 모든 guardrail(evidence gate,
   append-only, boundary-no-downgrade)은 C2에 산다. 새 surface는 모든 규칙을 공짜로 물려받는다(ADR-0001 §1, §3).
2. **모든 쓰기는 C2를 거친다.** Importer/exporter(C6)와 CLI는 C3/C4를 **직접** 건드리지 **않는다**; 이들은 C2
   typed ops를 호출한다. C4의 유일하게 정당한 비-core 작성자는 **reindex(C5)** 이며, 이는 아무것도 저작하지
   않고 — 재파생한다(ADR-0002 §2).
3. **C3가 정본이고 C4는 폐기 가능하다.** C4는 데이터 손실 없이 언제든 삭제·재구축할 수 있다. 읽기 시
   `content_hash` 불일치는 C4가 오래되었음을 뜻한다 ⇒ 재구축; 결코 행(row)을 조용히 신뢰하지 말라(ADR-0002 §2).
4. **사이클 없음.** core는 adapter를 호출하지 않고; store는 core를 호출하지 않으며; viewer는 쓰지 않는다.
5. **공유 substrate 없음.** C6는 다른 제품이 참조되는 *유일한* 장소이며, 오직 파일/typed-API 경계로만
   참조된다(ADR-0007). CAW-01/03/05와 공유하는 DB/registry/runtime은 없다(brief §1, §7).

## 데이터 흐름 — core 쓰기 트랜잭션
모든 skill-wrap 쓰기(예: `attach_evidence`)는 고정된 순서로 C2를 거치는 **하나의 트랜잭션**이다(ADR-0002 §6):
```
1. adapter (C1) decodes transport → {op, payload, idempotency_key}
2. core (C2) validates payload schema (codegen'd from op manifest)
3. core runs guardrails:  evidence gate · boundary propagation (monotone) · trust recompute
4. write FILE first        → C3  knowledge/<kind>/<id>.md   (frontmatter + body)
5. mirror to index         → C4  node/edge/event rows
6. append event            → C3  knowledge/_events/<ts>-<op>.jsonl  + hash-chained audit
7. re-check Claim→Evidence invariant (validator layer 2, ADR-0003)
8. commit (git) ; on ANY failure → ABORT whole txn, no orphan file/row
9. return typed envelope { ok, result?, error?, txn_id, audit_id }
```

## 데이터 흐름 — read / retrieve
```
caller ─▶ C1 (kr.search/get) ─▶ C2 Retrieve
   apply STRUCTURED FILTERS first (boundary, visibility, type, trust, concept)  [ADR-0006]
   ─▶ rank via C4 FTS5 (BM25)
   ─▶ hydrate provenance chain from C4 edges (Source→Claim→Evidence→Note)
   ─▶ boundary/visibility filter on the hydrated result
   ─▶ return RetrievalHit envelope (item + chain + trust + boundary), never an opaque blob
```
RAG/생성은 이미 신뢰할 수 있는 결과 집합 위에 얹는 opt-in 레이어다; 보존되는 합성물은 cited `Note`로 저장되며,
결코 `Evidence`로 저장되지 않는다(ADR-0001 §7, ADR-0006).

## 제품 간 경계 (C6만 해당)
| 방향 | 다른 제품 (독립) | 횡단 형태 | 안착 형태 | Guardrail |
|---|---|---|---|---|
| Import | **CAW-01** simulation projections/traces | versioned envelope (files) | `Evidence`/`Source`/`Trace`/`SimulationRun` | import 시 quarantine + 기밀성 검사 |
| Import | **CAW-05** radar / related-work signals | versioned envelope (files) | `Source`/`Claim`/`OpenQuestion`/`RelatedWork`/`RadarSignal` | quarantine; 분류하되 결코 느슨한 요약 금지 |
| Export | **CAW-03** paper/patent drafting | signed cited bundle | cited `Claim`+`Evidence` 번들 | **fail-closed allow-list** + re-redaction |

모든 횡단은 **provenance manifest** 를 동반하며 **모든 경계에서 다시 redaction(re-redact)** 한다(ADR-0007). 큰
아티팩트는 `artifact_uri`로 참조되며 결코 인라인되지 않는다(ADR-0002 §7).

## 배포 뷰 (v0)
| 측면 | v0 | 업그레이드 트리거 (ADR-0002) |
|---|---|---|
| 프로세스 | 바이너리 1개 + 로컬 git repo | — |
| Index | 로컬 SQLite 파일 1개 | 동시 팀 writer / index 경합 → Postgres |
| Retrieval | SQLite FTS5 (BM25) | 측정된 recall/precision이 발화 → sqlite-vec 사이드카 |
| Graph | `edge`에 대한 recursive CTE | 순회 깊이/성능 → Postgres 상의 Apache AGE |
| Concurrency | single-writer index lock + git PR/merge | → Postgres 포트 상의 직렬화 write-through API |

파일은 모든 업그레이드 단계에서 정본으로 유지된다; 각 새 엔진(Postgres, FTS, vector, AGE)은 C2 뒤의 **또 하나의
파생 index일 뿐** — 데이터 재작성이 아니다(ADR-0002 consequences).

## Open Questions
- `TODO(open-question: API auth model between independent products — static token vs mTLS vs signed-URL drop; owned with ADR-0007.)`
- `TODO(open-question: team write-concurrency — git PR/merge vs serialized write-through; this is the Postgres-port trigger, ADR-0002.)`
- See [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md).

## runbook에 대한 함의
- **C2 core + audit + guardrail을 먼저** 구축하고, 그다음 **C5 reindex**, 그다음 C1의 **op manifest + codegen**,
  그다음 C6 importer/exporter, 마지막에 C7 viewer(read-only) 순으로 — ADR-0001의 빌드 순서와 일치.
- **어떤 adapter, importer, viewer도 C3/C4를 직접 쓰지 않는다**는 인수 검사를 추가한다(단방향 규칙).
- **C4를 삭제하고 C5를 재실행하면 바이트 단위로 동일한 쿼리 결과가 나온다**는 인수 검사를 추가한다.
