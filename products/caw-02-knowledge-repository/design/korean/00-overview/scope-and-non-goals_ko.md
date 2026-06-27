# 범위 & 비목표(Scope & Non-Goals) — CAW-02

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set review date)
- **Related:**
  - [vision.md](./vision_ko.md)
  - [personas-and-use-cases.md](./personas-and-use-cases_ko.md)
  - [ADR-0001 Product surface](../01-decisions/ADR-0001-product-surface-and-skill-interface_ko.md)
  - [ADR-0002 Storage](../01-decisions/ADR-0002-storage_ko.md)
  - [ADR-0006 Retrieval](../01-decisions/ADR-0006-retrieval_ko.md)
  - [ADR-0007 Import/export contracts](../01-decisions/ADR-0007-import-export-contracts_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF_ko.md

## 목적
이 문서는 v1을 둘러싼 경계선을 긋는다: CAW-02가 **무엇을 만드는지**, 무엇을 **의도적으로 만들지 않는지**, 그리고
그 책임이 어디에서 형제 제품(CAW-01/05/03/04)으로 **인계되는지**. 아키텍처를 정당화하지 않으며(see the ADRs)
비전을 다시 진술하지 않는다(see [vision.md](./vision_ko.md)). 의심스러울 때는 [PRODUCT-BRIEF](../_meta/PRODUCT-BRIEF_ko.md)가 우선한다.

## 1. 범위 내(In scope, v1)

| Area | v1 범위 내 | Reference |
|------|-----------------|-----------|
| Knowledge transaction | core 루프 `add-source → extract-claim → attach-evidence → synthesize-note (cited)` | [ADR-0005](../01-decisions/ADR-0005-ingestion-pipeline_ko.md) |
| Entity set | `Source, Claim, Evidence, Note, Concept, Interest, OpenQuestion, Decision, Assumption` + imported refs `Trace, SimulationRun, Experiment` + intake `RelatedWork, RadarSignal` | [ADR-0003](../01-decisions/ADR-0003-knowledge-data-model_ko.md) |
| Invariant | `Claim → ≥1 Evidence`, 세 개의 보조를 맞춘 계층에서 강제(schema, core validator, reindex re-check) | [ADR-0003](../01-decisions/ADR-0003-knowledge-data-model_ko.md) |
| Writes | Append-only + *supersedes*; agent 쓰기는 기본적으로 확인(confirmation-by-default); append-only 이벤트 로그 + git audit | [ADR-0002](../01-decisions/ADR-0002-storage_ko.md) |
| Surfaces | 타입이 지정된 **API**, **MCP** 서버, **CLI** — 하나의 op manifest에서 codegen된 얇은 어댑터 | [ADR-0001](../01-decisions/ADR-0001-product-surface-and-skill-interface_ko.md) |
| Skill-wrap | 구조적 **evidence gate**를 갖춘 안전한 agent 인터페이스 | [ADR-0001](../01-decisions/ADR-0001-product-surface-and-skill-interface_ko.md) |
| Provenance & trust | PROV 형태의 2계층 모델; trust ladder T0–T3 + contested; AI 작성은 T2 상한 | [ADR-0004](../01-decisions/ADR-0004-provenance-and-trust_ko.md) |
| Boundaries | 두 개의 직교 축 — `boundary {public,internal,confidential}` + `visibility {team,private}` — 단조 전파 포함 | [ADR-0004](../01-decisions/ADR-0004-provenance-and-trust_ko.md) |
| Retrieval | SQLite **FTS5 (BM25)**; 일급 구조화 필터(boundary, visibility, type, trust, concept)를 랭킹 이전에 적용; 인용 제약 RAG | [ADR-0006](../01-decisions/ADR-0006-retrieval_ko.md) |
| Signal intake | CAW-05 radar / related-work 신호 import → 타입 노드(분류됨, 느슨한 요약 아님) | [ADR-0007](../01-decisions/ADR-0007-import-export-contracts_ko.md) |
| Evidence import | CAW-01 시뮬레이션 projection/evidence import → `Evidence`(격리 + 기밀성 검사) | [ADR-0007](../01-decisions/ADR-0007-import-export-contracts_ko.md) |
| Bundle export | 인용된 `Claim`+`Evidence` 번들을 CAW-03으로 export(서명됨, fail-closed allow-list) | [ADR-0007](../01-decisions/ADR-0007-import-export-contracts_ko.md) |
| Decisions/questions | `Decision` / `OpenQuestion` / `Assumption`을 evidence에 연결하여 기록 | [ADR-0003](../01-decisions/ADR-0003-knowledge-data-model_ko.md) |
| Optional viewer | 최소한의 **읽기 전용** 지식 viewer(탐색 + 사슬 추적) | [ADR-0001](../01-decisions/ADR-0001-product-surface-and-skill-interface_ko.md) |

## 2. 비목표(Non-goals, v1)
이것들은 의도적인 제외다. 각각 *왜* 제외되는지와 *대신 그 기능이 어디에 있는지*를 명시한다.

| Non-goal | v1에서 제외된 이유 | 그것이 있는 곳 / 재검토 시점 |
|----------|----------------------|--------------------------|
| 지식의 **지속 학습(continual learning) / 자율적 자기 편집** | v0는 append + retrieve + skill-wrap; 무결성이 먼저 | 미래 단계; 스키마를 업그레이드 준비 상태로 유지([ADR-0002](../01-decisions/ADR-0002-storage_ko.md)) |
| **무거운 그래프 데이터베이스**(Neo4j 등) | 범용 typed-edge 테이블이 그것 없이도 그래프 업그레이드 준비 상태 | 미래 Postgres/Apache-AGE 교체 = 엔진/쿼리 변경, 데이터 재작성 아님([ADR-0002](../01-decisions/ADR-0002-storage_ko.md), [ADR-0003](../01-decisions/ADR-0003-knowledge-data-model_ko.md)) |
| **임베딩(Embeddings) / 벡터 검색** | 아직 측정된 recall/precision 트리거 없음; FTS5 먼저 | 벡터 사이드카 스키마는 *예약됨*; 트리거 시 sqlite-vec/pgvector 추가([ADR-0006](../01-decisions/ADR-0006-retrieval_ko.md)) |
| **풍부한 편집 UI** | 편집은 surface/skill-wrap을 통해 일어나며 GUI가 아님 | 범위 밖; v1에는 읽기 전용 viewer만([ADR-0001](../01-decisions/ADR-0001-product-surface-and-skill-interface_ko.md)) |
| **공개 지식 웹사이트** | 별개의 제품 | **CAW-04**, 별개의 제품 |
| **시뮬레이션 실행** | CAW-02는 그 export만 카탈로그화 | **CAW-01**, 별개의 제품(import 경계) |
| **radar / 신호 수집 실행** | CAW-02는 분류된 신호만 인입 | **CAW-05**, 별개의 제품(import 경계) |
| **논문/특허 드래프팅** | CAW-02는 인용 번들만 export | **CAW-03**, 별개의 제품(export 경계) |
| **멀티테넌트 / 조직 규모 접근 제어** | team-vs-private을 넘는 것은 v1에 불필요 | v1에는 `visibility {team,private}`만 |
| **제자리 갱신 / 삭제** | 재구성 가능성을 깨뜨림 | append-only + *supersedes*만([ADR-0002](../01-decisions/ADR-0002-storage_ko.md)) |
| **조용한 agent 자동 수락** | 출처 손상 위험 | 기본 검토(reviewed-by-default); 거부된 후보는 audit용으로 보존([ADR-0005](../01-decisions/ADR-0005-ingestion-pipeline_ko.md)) |
| 형제 제품과의 **공유 기반(shared substrate)** | 독립성 계약 | 각 제품이 자체 core/data/deploy를 소유; file/API 경계만 |

## 3. Import/export 경계(독립 제품들)
모든 제품 간 상호작용은 명시적인 **file/API 경계**다 — **공유 저장소, registry, 기반(substrate)이 없다**. 모든 건너감은
**재편집(re-redaction)**과 경계 재검사를 수행한다; 번들은 **서명된다**; 출처 매니페스트가 양방향으로 이동한다. Export는
**fail-closed**(allow-list)이고; import는 **도착 시 격리(quarantine-on-arrival)**다.

```
              ┌─────────────┐   simulation projections / evidence (import)
   CAW-01 ───►│             │   → Evidence (quarantine + confidentiality check)
   (sims)     │             │
              │   CAW-02    │   radar / related-work signals (import)
   CAW-05 ───►│  knowledge  │   → Source / Claim / OpenQuestion / RelatedWork / RadarSignal
   (radar)    │  repository │
              │             │   cited Claim + Evidence bundle (export, signed, allow-list)
              │             ├──► CAW-03 (paper / patent drafting)
              └─────────────┘
```

| Peer product | 방향 | Payload | 경계에서의 무결성 규칙 |
|--------------|-----------|---------|--------------------------------|
| CAW-01 (sims) | import | 시뮬레이션 projection/evidence | 격리; 기밀성 검사; `Evidence`로 매핑(여기서 결코 실행되지 않음) |
| CAW-05 (radar) | import | radar / related-work 신호 | 위협/지지(threat/support) 분류; 타입 노드로 매핑; 결코 느슨한 요약이 아님 |
| CAW-03 (drafting) | export | 인용된 `Claim`+`Evidence` 번들 | fail-closed allow-list; 재편집; 서명; 출처 매니페스트 |
| CAW-04 (website) | v1에서 없음 | — | CAW-04는 별개의 제품; CAW-02의 surface가 아님 |

세부 사항 및 envelope 형식: [ADR-0007](../01-decisions/ADR-0007-import-export-contracts_ko.md) 및
[02-research/import-export-boundaries.md](../02-research/import-export-boundaries_ko.md).

## 4. 경계 사례(생략이 아니라 결정)
- **evidence로서의 생성된 요약** — *구조적으로 금지됨.* `attach_evidence`에는 산문 필드가 없다; Note는 결코
  Evidence가 될 수 없다([ADR-0004](../01-decisions/ADR-0004-provenance-and-trust_ko.md)).
- **공개 export 안의 기밀** — *발생할 수 없음.* Fail-closed allow-list + 단조 boundary 전파.
- **AI가 높은 trust를 주장** — *상한 적용.* AI가 작성한 콘텐츠는 trust ladder에서 T2로 상한이 정해진다.
- **과거 지식 편집** — *편집이 아니라 supersede.* History는 audit용으로 온전히 유지된다.

## 미해결 질문
[08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md)(TODO: create)를 참고하라. 여기서 열린 것:
임베딩 추가를 위한 구체적 트리거 임계값; 읽기 전용 viewer가 v1 컷에 포함되는지 아니면 연기되는지.

## 런북에 대한 함의
- 런북은 v1에서 어떤 비목표(벡터 저장소, 그래프 DB, 편집 UI 없음)도 스캐폴딩해서는 안 된다.
- Import/export 런북은 어떤 데이터 매핑보다 먼저 격리(in)와 fail-closed allow-list(out)를 구현해야 한다.
- viewer는, 만들어진다면, 읽기 전용이며 파생 인덱스를 소비한다 — 아무것도 쓰지 않는다.
