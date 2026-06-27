# 데이터 레이어 옵션

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [ADR-0002 데이터 레이어](../01-decisions/ADR-0002-data-layer_ko.md), [work-tree-and-versioning](../04-data-layer/work-tree-and-versioning_ko.md), [change-management-worktree](../05-caw01-simulation-control-plane/change-management-worktree_ko.md), [open-questions](../08-research-plan/open-questions_ko.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF_ko.md

## 목적

이 문서는 **CAW-01 자신의 데이터가 어디에 저장되는지**를 결정한다. CAW-01은 **독립적인 단독 제품(standalone product)**이다 — 6개의 분리된 제품군(CAW-01..06) 중 하나로, 각각 별도로 구현·배포되며 **공유 런타임 기반(shared runtime substrate)이 없다**. 이 결정은 CAW-01에만 국한되며, 다른 어떤 제품을 위한 저장소도 제공하지 않는다. 관계형 SQL, 벡터 DB, 그래프 DB, 그리고 markdown/파일 우선 + git 접근법을 *이 특정* 워크로드(SOURCE-BRIEF §9)에 대해 정직하게 비교한 뒤, 명시적 저장소 경계를 가진 구체적인 **폴리글랏(polyglot) 설계**와 첫 번째 수직 슬라이스를 위한 최소한의 **"여기서 시작" 스택**을 제안한다. 이 내용은 [ADR-0002](../01-decisions/ADR-0002-data-layer_ko.md)의 공식 결정으로 이어진다.

**지식 범위(중요).** CAW-01은 *자신의* 실행에 필요한 **최소한의 실행 증거(run-evidence)와 출처(provenance)**만 보관한다: 실행에 부착된 Evidence, 신뢰 사다리(trust ladder), public/internal/confidential 경계, 그리고 *CAW-01 자신이 생성한 결론*에 대한 claim→evidence 링크. 외부 `Source`/`Claim`/`Note`/`Concept`/`Interest`/`OpenQuestion`을 수집하는 **일반 지식 저장소(general knowledge repository)**는 **별도 제품(CAW-02)**이며 **여기서는 범위 밖이다**. CAW-01은 자신의 증거와 투영(projection)을 제품 경계를 넘어 CAW-02로 *내보낼(export)* 수 있지만, CAW-02의 엔티티를 자신의 데이터 레이어에 모델링하지 않는다.

이 문서는 다음을 결정하지 **않는다**: 작업 트리 변경 관리 객체 모델(CRDT vs event-log vs git 유사 — 그것은 ADR-0007 / [work-tree-and-versioning](../04-data-layer/work-tree-and-versioning_ko.md)), 트레이스 파이프라인 경계(ADR-0005), 또는 API/ORM 표면(07-backend-api). 이 문서는 *저장 기반(들)*과 각 엔티티 클래스가 어디에 사는지만 결정한다.

## 데이터가 실제로 무엇인가 (그리고 왜 순진한 "그냥 하나 고르기"는 실패하는가)

CAW-01이 소유하는 기반들(SOURCE-BRIEF §9)은 매우 다른 형태를 가진다. 광범위한 지식 저장소는 **여기 없음**에 주목하라 — 그것은 CAW-02(별도 제품)에 속하며; CAW-01은 최소한의 실행 증거 + 출처만 보관한다:

| 기반(Substrate) | 엔티티 | 지배적 형태 | 읽기 패턴 |
|---|---|---|---|
| **Run evidence / provenance** | `Evidence, Provenance, GeneratedConclusion` (conclusion→evidence) + trust-ladder + public/internal/confidential 경계 | 작은 그래프(conclusion→evidence) + 일부 텍스트 | *자신의* 실행을 위한 출처 추적 |
| **Simulation** | `WorkloadModel, InputTrace, SimulationConfig, SimulationRun, TraceArtifact, Metric, ResultSet, ArchitectureProposal, MemoryProductRequirement` | 관계형/표 형식(runs, configs, metrics) + 대용량 blob 아티팩트 | 행 필터/집계/비교 |
| **Memory-annotated IR** | `MemoryAnnotatedIR, TensorNode, DataMovementEdge, FillLevel (L0/L1/L2)` | 조밀한 방향성 그래프(텐서/연산 노드, 이동 엣지) | 서브그래프 로드, 이웃(neighborhood), 노드별 속성 |
| **HW design** | chip→die→package→tray→rack→cluster + 컴포넌트 + 편집 | 엄격한 포함(containment) 트리/DAG + 부품 오버라이드 | 경로별 드릴다운, 부품 마이크로 편집 |
| **Work tree** | 3개 캔버스에 걸친 버전화된 변경 트리 | 버전 DAG / 변경 로그 | diff, branch, 항목별 + 전체 저장 |

아래 모든 것을 좌우하는 세 가지 정직한 관찰:

1. **그래프 형태이지만, 그래프들은 작고 한정되어 있다.** conclusion→evidence 사슬, 한 에이전트 턴에 대한 IR, 단일 클러스터 계층. 이것은 초기에는 *단일 전문가 규모*이다 — 수천에서 수백만 노드이지 수십억이 아니다. 그래프-*형태*가 자동으로 그래프-*데이터베이스*를 의미하지는 않는다.
2. **출처/감사 + 버전 관리는 있으면 좋은 것이 아니라 일급(first-class)이다.** 브리프의 전체 논지는 "증거 사슬 보존"이다; CAW-01 *자신이* 생성한 결론은 evidence를 가리켜야 하며 생성된 요약은 evidence가 *아니다*(§9 불변식, §11 가드레일). 이는 **append-only / 감사 가능한** 저장과 강한 참조 무결성으로 기운다 — 벡터 DB의 강점이 아니라 관계형의 강점.
3. **오직 일부 슬라이스만 의미론적 검색이 필요하다.** 임베딩은 "유사한 run/IR 찾기"와 CAW-01 자신의 증거/결론 텍스트 검색에 도움이 된다. 시뮬레이션 메트릭과 HW 계층은 퍼지 회상을 **원하지 않는다**; 그것들은 정확한 필터와 정확한 트리 워크를 원한다.

## 역량 매트릭스 — 필요 × 저장소 클래스

**단일 전문가 규모**에서 **이** 워크로드에 대한 채점. ✓✓ 강함 · ✓ 적절 · ~ 가능하나 어색함 · ✗ 빈약.

| 필요 | 관계형 SQL (Postgres/SQLite) | 벡터 DB (pgvector/Qdrant/LanceDB/Chroma) | 그래프 DB (Neo4j) | md 우선 + git |
|---|---|---|---|---|
| 표 형식 runs/configs/metrics, 필터+집계+비교 | ✓✓ | ✗ | ~ | ~ (grep/parse) |
| 참조 무결성 (conclusion→evidence가 해결되어야 함) | ✓✓ | ✗ | ✓ | ✗ (수동) |
| 출처 / 감사 추적 | ✓✓ (append-only 테이블, 트리거) | ~ | ✓ | ✓✓ (커밋 이력) |
| 설정의 버전 관리 / 분기 (작업 트리) | ~ (closure/temporal 테이블) | ✗ | ~ | ✓✓ (네이티브 git) |
| 포함 계층 (chip→…→cluster) 드릴다운 | ✓ (인접 + recursive CTE, ≤6 레벨) | ✗ | ✓✓ | ~ |
| 조밀한 IR 그래프: 서브그래프 로드, 이웃 | ✓ (엣지 테이블, 얕음) | ✗ | ✓✓ (깊은 multi-hop) | ✗ |
| 깊은 multi-hop 경로/중심성/"얼마나 연결됨" | ~ (CTE, >3–4 hop에서 느려짐) | ✗ | ✓✓ | ✗ |
| 의미론적 검색 (유사 runs/IRs + 자신의 증거 텍스트) | ✓ via **pgvector** | ✓✓ | ~ (플러그인 필요) | ✗ |
| 단일 프로세스, 무운영(zero-ops) 로컬 개발 | ✓✓ (SQLite) | ✓ (LanceDB/Chroma 임베디드) | ✗ (서버/JVM) | ✓✓ |
| 사람이 읽고 diff 가능한 진실의 원천 | ~ | ✗ | ✗ | ✓✓ |
| 운영할 단일 저장소 (운영 부담) | ✓✓ | 하나 추가 | 하나 추가(JVM) | ✓✓ |
| 대용량 blob 아티팩트 (Chakra/OTel 트레이스, GB 단위) | ✗ (오브젝트 스토어 + 경로 사용) | ✗ | ✗ | ~ (git-LFS) |

**매트릭스 해석:** Postgres는 *거의 모든 행에서 적절-이상*인 유일한 열이며, pgvector가 의미론적 열을 그 안으로 접어 넣는다. 그래프 열은 **깊은 multi-hop** 쿼리에서만 결정적으로 이기고; md 우선 열은 **사람이 diff 가능한 버전화된 진실의 원천**에서만 결정적으로 이긴다. blob에서는 아무것도 이기지 못한다 — 그것들은 경로 참조와 함께 파일시스템/오브젝트 스토어에 속한다.

## 옵션별 정직한 견해

### 관계형 SQL — Postgres (prod) / SQLite (dev, 임베디드)
- **왜 적합한가:** 시뮬레이션 기반은 *표 형식이다*; 메트릭 비교/집계가 핵심 가치 루프("비교 가능한 프로젝션")이다. 외래 키가 conclusion→evidence 불변식을 공짜로 강제한다. Append-only 감사가 사소하다. JSONB가 L0/L1/L2의 반정형적 엣지를 스키마 변경 없이 흡수한다(L0/L1/L2는 §1에 따라 *서로 다른 완성도의 동일 스키마*이며 — nullable/JSONB 친화적 사실이지 세 개의 테이블이 아니다).
- **Postgres 내의 그래프:** 인접 리스트 엣지 테이블 + recursive CTE가 HW 계층(한정된 6 레벨)과 얕은 IR 이웃을 잘 처리한다. 벤치마크에 따르면 recursive CTE는 얕은 이웃 확장에서는 경쟁력이 있지만 ~3–4 hop을 넘어서면 네이티브 그래프 엔진 대비 성능이 저하된다.
- **주의점:** 깊은 IR 분석이 어색해진다; 대용량 트레이스 blob은 행에 살아서는 안 된다.
- **임베디드 변형:** SQLite는 첫 슬라이스와 CLI/MCP 표면을 위한 무운영 단일 파일 DB를 제공한다; 스키마를 Postgres 호환으로 유지하여 나중에 마이그레이션할 수 있다.

### 벡터 DB — pgvector / Qdrant / LanceDB / Chroma
- **역할:** *검색 보조*이지 기록 시스템(system of record)이 절대 아니다. "유사 찾기"를 위해 run/IR에 특징 벡터를, CAW-01 자신의 `Evidence`/`GeneratedConclusion`에 텍스트를 임베딩한다.
- **pgvector** (Postgres 확장, HNSW + IVFFlat, 스칼라/이진 양자화)가 실용적 선택인데 *우리가 이미 Postgres를 운영하기 때문이다* — 두 번째 저장소 없음, 임베딩이 그것이 기술하는 행 옆에 위치, 조인이 SQL 안에 머문다. 단일 인스턴스 HNSW가 우리 규모를 무난히 처리한다.
- **Qdrant**는 대규모 순수 벡터 워크로드에서 더 빠르고 잘 확장되지만, 서비스와 동기화 문제를 추가한다; 단일 전문가 규모에서는 정당화되지 않는다.
- **LanceDB / Chroma**는 임베디드/로컬 우선이라 — 개발 슬라이스에 매력적이지만, pgvector 대신 이를 선택하는 것은 Postgres가 있는 한 이득 없이 *두 번째* 저장소와 동기화 작업을 의미한다.
- **판정:** **동일한 Postgres 안의 pgvector**를 사용한다; 벡터 볼륨이나 QPS가 단일 PG 노드를 초과할 때만 Qdrant를 재검토한다.

### 그래프 DB — Neo4j
- **진정으로 이기는 곳:** 깊은 multi-hop 순회, 경로 찾기("conclusion X가 evidence Y에 연결되는 모든 경로 보기"), IR 또는 증거 그래프에 대한 중심성/커뮤니티 — 깊이와 관계 수가 커지면 recursive CTE보다 약 2자릿수 빠르다고 보고됨.
- **비용:** 두 번째 데이터스토어, JVM/서버 운영, 두 번째 쿼리 언어(Cypher), 그리고 그래프와 SQL 기록 시스템 사이의 *분리된 두뇌(split brain)*(저장소 간 동기화 + 트랜잭션 일관성).
- **우리 규모에서는 이 비용이 이득을 압도한다.** 그래프는 작고 핫 쿼리는 사기 조직(fraud-ring) 분석이 아니라 드릴다운 + 얕은 이웃이다.
- **중간 경로:** **Apache AGE** (Postgres *내부*의 openCypher)는 그래프 쿼리가 까다로워질 경우 두 번째 서버 없이 Cypher 편의성을 사들인다 — Neo4j를 세우는 것보다 훨씬 작은 단계이다.

### md 우선 / 파일 우선 + git
- **진정으로 이기는 곳:** 사람이 읽고, diff 가능하고, 분기 가능한 진실의 원천에 공짜 출처(커밋 = 누가/언제/왜)가 따라온다. CAW-01 자신의 저작된 설계 산출물 — `Decision`, `OpenQuestion`, `Assumption`, `ArchitectureProposal` — 사람이 저작하고 검토하며 디자인 저장소(바로 이 폴더)가 이미 이렇게 저장하는 *서사적* 지식 — 에 자연스럽게 맞는다. (일반 외부 지식 저장소는 CAW-02이며 여기서 모델링하지 않는다.)
- **실패하는 곳:** 무결성 없음, 집계 없음, 인덱스 쿼리 없음, 메트릭 비교 루프나 조밀한 IR 그래프에 끔찍함. git-LFS가 트레이스 blob을 담을 수 있지만 주 저장소로는 투박하다.
- **판정:** **저작된 지식 / 결정 레이어와 대용량 아티팩트**에는 이를 유지하되, 쿼리를 위해 Postgres로 *프로젝션*한다 — git은 산문의 진실의 원천으로 남고, Postgres는 인덱스/파생물이다.
- **"데이터용 git" 노트:** Dolt/Doltgres(Prolly-tree 버전화 SQL)는 "버전화 + 관계형"에 대한 솔깃한 단일 답이지만, 더 무겁고 덜 표준적인 엔진이다; 평범한 Postgres + 명시적 작업 트리 모델(ADR-0007)을 선호하고 테이블 수준 branch/merge가 지배적 요구가 될 경우에만 Dolt를 재검토한다. `TODO(open-question: evaluate Doltgres vs git-projection for work-tree)`.

## 권장 폴리글랏 설계 (저장소 경계)

**Postgres가 척추이다.** 쿼리 가능한 모든 것이 거기 살고, 특화된 관심사는 별도 시스템이 아니라 확장이나 사이드카로 부착된다.

```
                         ┌────────────────────────────────────────────┐
   git repo (md/json) ──►│  PROJECTION / INGEST                        │
   (authored knowledge,  │  parse md+frontmatter → upsert rows         │
    decisions, proposals)└───────────────┬────────────────────────────┘
                                          ▼
   ┌──────────────────────────── PostgreSQL (system of record) ───────────────────────────┐
   │  relational core          │  pgvector            │  graph-in-PG (edge tables + CTE,    │
   │  - simulation substrate   │  - embeddings on      │   optional Apache AGE later)        │
   │  - HW hierarchy (adjacency)│   Evidence/Conclusion │  - conclusion→evidence, IR          │
   │  - run-evidence rows (FKs)│   + run/IR feature     │   tensor/edge, chip→…→cluster edges │
   │  - work-tree metadata     │   vectors              │                                     │
   └──────────────┬───────────────────────────────────────────────────────────────────────┘
                  │ path/URI references (never blobs in rows)
                  ▼
   filesystem / object store:  TraceArtifact, Chakra ET, OTel traces, raw InputTrace (large blobs)
```

**경계 규칙 (하중을 견디는 결정들):**

| 엔티티 / 관심사 | 사는 곳 | 이유 |
|---|---|---|
| `SimulationRun, SimulationConfig, Metric, ResultSet, WorkloadModel, InputTrace(meta)` | Postgres 관계형 | 표 형식, 비교/집계됨; 무결성이 중요 |
| `TraceArtifact` 바이트, Chakra/OTel 트레이스 파일 | **파일시스템/오브젝트 스토어**, 경로는 PG에 | blob은 행 저장소를 죽인다; 주소 지정 가능하게 유지 |
| `Evidence, Provenance, GeneratedConclusion` (+ conclusion→evidence FK) | Postgres 행 | "자신의 결론은 evidence를 가리킨다" 불변식 강제; trust ladder + public/internal/confidential 경계 |
| `Decision/OpenQuestion/Assumption/ArchitectureProposal`의 저작된 서사 | **git md/json**, PG로 프로젝션 | 사람이 diff 가능한 진실의 원천; PG는 인덱스 |
| 임베딩 (run/IR 특징 벡터 + 자신의 증거 텍스트) | 동일 PG 내의 **pgvector** | 두 번째 저장소 없는 의미론적 회상 |
| `MemoryAnnotatedIR, TensorNode, DataMovementEdge, FillLevel` | PG: IR 헤더 행 + 노드/엣지 테이블(JSONB 속성) | L0/L1/L2에 걸친 동일 스키마; SQL 내 얕은 그래프 연산 |
| HW `chip/die/package/tray/rack/cluster` + 컴포넌트 + 편집 | PG 인접 테이블 + recursive CTE | 한정된 깊이(~6); 경로별 드릴다운 |
| 작업 트리 변경 트리, 항목별/전체 저장 | 버전 DAG를 모델링하는 PG 테이블(모델 = ADR-0007) | 쿼리 가능한 이력; 버전 관리되는 엔티티와의 무결성 |

**생성물-vs-증거 분리 (가드레일 §11):** `evidence_kind` / `is_generated` 플래그를 모델링하여 요약이 증거로 위장할 수 없게 하고; conclusion→evidence FK는 생성되지 않은 행만 가리킨다. 증거에 public/internal/confidential 경계를 유지하여 confidential 데이터가 public 출력으로 새지 않고, public 연구가 내부 Samsung/SAIT 주장과 혼동되지 않도록 한다.

**공유 저장소가 아니라 내보내기(export) 경계:** CAW-01이 증거/투영/요구사항을 다른 독립 제품(예: CAW-02의 지식 저장소, 또는 논문/특허 제품인 CAW-03)에 전달한다면, 그 횡단은 명시적인 **제품 간 내보내기**이다 — 경계를 넘어 전달되는 직렬화된 아티팩트이지, 공유 테이블/레지스트리/데이터베이스가 결코 아니다.

## "여기서 시작" 최소 스택 (첫 번째 수직 슬라이스)

목표: *하나의 재현 가능한 실험*의 워크플로 의미론을 최소한의 운영으로 종단 간(end to end) 증명하는 것.

1. **SQLite** (Postgres 호환 스키마, 양쪽을 모두 대상으로 하는 ORM/마이그레이션 사용)을 관계형 코어 + 실행 증거/출처 행 + IR 노드/엣지 테이블 + 작업 트리 메타데이터의 단일 저장소로 사용.
2. `TraceArtifact` / Chakra / OTel blob을 위한 **파일시스템**, 경로로 참조.
3. 저작된 결정/열린 질문/가정을 md로 두는 **git**(디자인 저장소가 이미 이렇게 함); 작은 프로젝터가 frontmatter를 DB로 upsert.
4. **아직 벡터 DB 없음, Neo4j 없음.** 의미론적 검색이 실제 사용자 필요가 될 때만 `pgvector`를 추가(그 시점에 SQLite→Postgres로 전환). 그래프 엔진은 아래 트리거에서만 추가.

이 스택은 웹 앱, CLI, MCP 서버를 하나의 파일에서 구동하고, 인프라 비용이 0이며, 첫날부터 스키마를 이식 가능하게 유지하므로 Postgres로의 깔끔한 마이그레이션 경로를 유지한다.

## 결정 트리거 (언제 확대할 것인가)

**(SQLite에서) Postgres 추가** 다음 중 하나일 때: 동시 다중 writer 접근; pgvector 필요; JSONB/CTE 쿼리 볼륨이 SQLite에 부담; 단일 로컬 프로세스를 넘어 웹 앱 배포.

**pgvector 추가** 사용자가 "유사 runs/IRs 찾기"나 CAW-01 자신의 증거에 대한 의미론적 검색이 필요할 때 — 그 전이 아님. 이는 인플레이스 확장이므로 저렴하다.

**그래프 엔진 추가 (Apache AGE 먼저, AGE로 불충분할 때만 Neo4j)** 다음 *모두*일 때: (a) IR 또는 증거 그래프가 핫 경로에서 일상적으로 ~3–4 hop 순회를 초과; (b) recursive-CTE 지연이 UX를 해친다고 (가정이 아니라) 측정됨; (c) 그래프 알고리즘(중심성, 커뮤니티, all-paths)이 제품 기능이 됨. JVM 운영과 저장소 간 동기화를 가진 Neo4j를 세우기 전에 **Apache AGE**(PG 내 Cypher, 두 번째 서버 없음)를 선호한다. `TODO(open-question: define the latency threshold that triggers AGE)`.

**md 우선 git을 진실의 원천으로 유지** 저작된 서사 + 대용량 아티팩트에 대해 무기한; 산문을 DB-as-truth로 마이그레이션하지 말 것. 테이블 수준 branch/merge가 지배적일 때만 **Doltgres**를 재검토.

## 열린 질문

- `TODO(open-question: confirm single-expert scale ceiling — node/row counts that keep SQLite/PG-CTE viable)`
- `TODO(open-question: define measured latency threshold for IR/knowledge traversal that triggers Apache AGE)`
- `TODO(open-question: Doltgres vs git-projection vs PG-temporal for the work-tree versioning substrate — coordinate with ADR-0007)`
- `TODO(open-question: embedding model + dim for pgvector, and which entities get embedded first)`
- `TODO(open-question: object-store choice for TraceArtifact blobs — local FS vs S3-compatible — and retention/audit policy)`
- `TODO(open-question: does syntorch HW-design layer emit its own persisted format we must mirror, or is PG the only HW store? do not assume beyond SOURCE-BRIEF §7)`
- `TODO(open-question: git→DB projection direction — is git always source of truth for authored knowledge, or can the app write back?)`

## 런북에 대한 함의

- **phase-0-foundations** — SQLite(Postgres 이식 가능) 스키마를 세우는 RB: 관계형 코어, conclusion→evidence FK + `is_generated` 플래그 + public/internal/confidential 경계를 가진 실행 증거/출처 행, IR 노드/엣지 테이블, HW 인접 테이블, 작업 트리 메타데이터 테이블; 그리고 blob-on-FS 경로 규약.
- **phase-0/phase-5** — 저작된 결정/제안을 위한 git→DB 프로젝터(md/json frontmatter → upsert) RB.
- **phase-5-persistence-and-api** — SQLite→Postgres 마이그레이션 전환과 pgvector 활성화("add pgvector" 트리거 뒤에 게이트됨) RB; 백엔드 API/MCP로 노출되는 recursive-CTE 드릴다운 쿼리(HW 계층 + IR 이웃) RB.
- 이 런북들은 여기서 설정된 경계를 구현하며 버전 관리 *객체 모델*은 [work-tree-and-versioning](../04-data-layer/work-tree-and-versioning_ko.md) (ADR-0007)로 미룬다.

---

출처: [pgvector vs Qdrant (Tiger Data)](https://www.tigerdata.com/blog/pgvector-vs-qdrant) ·
[Vector DB benchmarks 2026](https://callsphere.ai/blog/vector-database-benchmarks-2026-pgvector-qdrant-weaviate-milvus-lancedb) ·
[Neo4j vs Postgres CTE traversal](https://www.pedroalonso.net/blog/graphrag-vs-vector-postgres/) ·
[SQLite as a graph DB (recursive CTEs)](https://dev.to/rohansx/sqlite-as-a-graph-database-recursive-ctes-semantic-search-and-why-we-ditched-neo4j-1ai) ·
[Apache AGE](https://age.apache.org/) ·
[Dolt — Git for Data](https://github.com/dolthub/dolt)
