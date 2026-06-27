# ADR-0002: 데이터 계층 — Postgres를 척추로 하는 폴리글랏과 SQLite "여기서 시작" 스택

- Status: proposed
- Owner: Jimmy
- Last-reviewed: TODO
- Related:
  - Research: [data-layer-options](../02-research/data-layer-options_ko.md)
  - [ADR-0005 Trace pipeline](./ADR-0005-trace-pipeline_ko.md) (이 계층이 저장하는 산출물/IR을 생성)
  - [ADR-0007 Work-tree change management](./ADR-0007-change-management-worktree_ko.md) (여기에 저장되는 버전 관리 객체 모델)
  - [ADR-0001 Product surface](./ADR-0001-product-surface_ko.md) (하나의 코어가 리포지토리를 통해 이 계층에 도달)
  - [work-tree-and-versioning](../04-data-layer/work-tree-and-versioning_ko.md), [change-management-worktree](../05-caw01-simulation-control-plane/change-management-worktree_ko.md)
  - [open-questions](../08-research-plan/open-questions_ko.md)
- Source of truth: [../_meta/SOURCE-BRIEF.md](../_meta/SOURCE-BRIEF_ko.md)

## 목적(Purpose)

CAW-01의 데이터 요구(SOURCE-BRIEF §9)를 위한 **저장 기반(substrate)**을 결정한다: 어떤 저장소가
각 엔티티 클래스를 보유하는지, 저장소 간 경계, 그리고 첫 수직 슬라이스를 위한 최소한의 **"여기서 시작"**
스택. CAW-01은 **독립적이고 단독으로 동작하는 제품**이다 — **공유 런타임 기반(substrate)이 없는** 6개 독립
제품 가족(CAW-01..06) 중 하나다; 따라서 이 저장소들은 다른 제품이 끼워 넣는 공유 데이터 계층이 아니라
**CAW-01 자체의 것**이다. 이 ADR은 work-tree의 *객체
모델*([ADR-0007](./ADR-0007-change-management-worktree_ko.md)),
트레이스 파이프라인 경계([ADR-0005](./ADR-0005-trace-pipeline_ko.md)), API/ORM 표면([ADR-0001](./ADR-0001-product-surface_ko.md)의
코어)은 **결정하지 않는다**. *바이트가 어디에 사는지*를 확정한다.

## 맥락(Context)

- 데이터는 **서로 다른 형태를 가진 네 개의 기반**이다(SOURCE-BRIEF §9): 테이블형 **시뮬레이션**
  기반(+ 큰 트레이스 blob), 밀집 그래프인 **memory-annotated
  IR**(`MemoryAnnotatedIR/TensorNode/DataMovementEdge/FillLevel`), 포함 트리(containment-tree)인 **HW
  설계** 기반(chip→…→cluster), 그리고 버전 관리되는 **work-tree** 기반. 이들과 더불어 CAW-01은 **자체
  run에 대해서만** **린(lean)한 run-evidence / 출처(provenance)** 기록을 유지한다(run에 부착된 Evidence,
  trust-ladder 상태, public/internal/confidential 경계, 그리고 CAW-01 **자체** 생성 결론에 대한
  claim→evidence).
- **지식 범위(여기서는 범위 밖):** 외부 `Source/Claim/Note/Concept/Interest/OpenQuestion`을 수집하는
  일반 지식 저장소는 **별개의 제품(CAW-02)**이며 CAW-01의 데이터 계층에서 **모델링되지 않는다**. CAW-01은
  CAW-02(또는 paper/patent 제품인 CAW-03 같은 다른 독립 제품)가 소비할 수 있는
  증거/투영/요구사항을 **export**할 수 있다; 이는 공유 저장소/registry/DB가 결코 아니라 엄격히 **독립 제품
  간의 export 경계**다.
- 데이터는 **그래프 형태이지만 작고 유계**이다(단일 전문가 규모: 수천에서 저-수백만 노드). 따라서
  그래프-*형태*가 그래프-*데이터베이스*를 의미하지는 않는다.
- **출처(provenance)와 증거 사슬이 일급(first-class)**이다(SOURCE-BRIEF §1, §9 불변식, §11 가드레일):
  CAW-01 자체 생성 결론은 증거를 가리키고; 생성된 요약은 증거가 **아니다**. 이는 append-only, 참조적으로
  강하고, 감사 가능한 저장 — 관계형의 강점 — 을 선호하게 한다.
- brief는 **웹 앱 + CLI + MCP**에서 도달 가능한 하나의 엔진을 요구한다([ADR-0001](./ADR-0001-product-surface_ko.md));
  저장소는 표면 집합이 저장소 비종속이 되도록 리포지토리 인터페이스 뒤에서 실행되어야 하며, CLI/MCP와 첫
  슬라이스를 위해 **무운영(zero-ops) 로컬** 모드를 지원해야 한다(SOURCE-BRIEF §11: 넓은 스캐폴딩보다 작은
  수직 슬라이스).
- 데이터의 *일부*만이 의미적 회상("유사한 run/IR 찾기", CAW-01 자체 evidence/decision 노트의 텍스트)을
  원한다; 메트릭과 HW 계층은 퍼지 회상이 아니라 정확한 필터와 정확한 트리 순회를 원한다.

## 검토한 선택지(Options considered)

| 선택지 | 장점 | 단점 | 적합성 |
|---|---|---|---|
| **단일 관계형 SQL(Postgres; 개발용 SQLite)** | 테이블형 sim 기반이 네이티브; FK가 claim→evidence를 강제; append-only 감사가 자명; JSONB가 L0/L1/L2를 흡수(동일 스키마, 완전성만 가변); adjacency+recursive CTE가 유계 HW 트리와 얕은 IR를 처리; 운영할 저장소 하나; `pgvector`가 나중에 의미 검색을 흡수 | 깊은(>3–4 hop) IR 순회는 네이티브 그래프 대비 저하; blob은 행에 살면 안 됨 | **척추(Spine)** |
| 기록 시스템으로서의 벡터 DB(Qdrant/Chroma/LanceDB) | 훌륭한 ANN 회상 | 무결성·집계·감사 없음; 두 번째 저장소 + 동기화 | 검색 보조용만 |
| 그래프 DB(Neo4j) | 깊은 멀티홉/중심성이 ~2 자릿수 빠름 | 두 번째 데이터스토어, JVM 운영, Cypher, SQL 기록 시스템과의 split-brain 동기화; 우리 규모에서는 비용이 지배적 | 지금은 기각; Apache AGE를 먼저 거쳐 재검토 |
| md-우선 / git만 | 사람이 diff 가능, 브랜치 가능, 무료 출처 | 무결성/집계/색인 질의 없음; 메트릭 루프와 밀집 IR에 부적합 | 저작 서사 + blob에만 유지 |
| "데이터용 Git"(Dolt/Doltgres) | 버전 관리 + 관계형을 하나로 | 더 무겁고, 덜 표준적인 엔진 | 보류; 테이블 수준 branch/merge가 지배적일 때만 재검토 |

## 결정(Decision)

**명시적 저장소 경계를 가진 Postgres-척추 폴리글랏 설계를 채택하고, 첫 슬라이스는 Postgres 이식성을 유지한
SQLite에서 시작한다.**

1. **Postgres가 기록 시스템 / 척추다.** 질의 가능한 모든 것은 거기 산다; 특수한 관심사는 별도 시스템이
   아니라 **데이터베이스 내 확장 또는 사이드카**로 붙는다.
2. **큰 blob은 절대 행에 살지 않는다.** `TraceArtifact` 바이트, Chakra ET, OTel 트레이스, 원시
   sub-torch 덤프, 원시 `InputTrace`는 **파일시스템 / 오브젝트 스토어**로 가며, PG 행으로부터 path/URI로
   주소 지정된다.
   (이것이 [ADR-0005](./ADR-0005-trace-pipeline_ko.md)와 [ADR-0001](./ADR-0001-product-surface_ko.md)이
   TS⇆Python 봉합선에 걸쳐 path를 주고받는 산출물 스토어다.)
3. **의미 검색은 동일 Postgres 내부의 `pgvector`다** — "유사한 run/IR 찾기"가 실제 사용자
   요구가 될 때만 추가된다. 단일 전문가 규모에서는 두 번째 벡터 스토어 없음.
4. **그래프는 Postgres에 남는다**(adjacency/edge 테이블 + recursive CTE) — 유계 HW 트리(~6 레벨)와 얕은
   IR 이웃을 위해. 깊은 순회가 측정된 핫패스 문제가 되면, **Neo4j**를 세우기 전에 **Apache AGE**(PG *내부*의
   openCypher)를 채택한다.
5. **git markdown/json은 저작 서사의 source of truth로 남는다**(`Decision`, `OpenQuestion`,
   `Assumption`, `Note`, `ArchitectureProposal`) 그리고 질의 가능한 색인/파생물로 **Postgres에 투영된다**
   (frontmatter → upsert). PG는 색인이고; 산문의 진실은 git이다.
6. **생성됨 ≠ 증거는 가정이 아니라 모델링된다.** 행은 `evidence_kind` / `is_generated`를 지닌다;
   claim→evidence FK는 생성되지-않은 행으로만 해소될 수 있다(SOURCE-BRIEF §9 불변식, §11 가드레일).

### 저장소 경계 표(load-bearing)

| 엔티티 / 관심사 | 어디에 사는가 | 이유 |
|---|---|---|
| `SimulationRun, SimulationConfig, Metric, ResultSet, WorkloadModel, InputTrace(meta), MemoryProductRequirement` | **Postgres 관계형** | 테이블형; 비교/집계됨; 무결성 중요 |
| `TraceArtifact` 바이트, Chakra/OTel/sub-torch 트레이스 파일, 원시 `InputTrace` | **FS/오브젝트 스토어**, PG에 path | blob은 행 저장소를 죽임; 주소 지정 가능하게 유지 |
| `Evidence, Claim (CAW-01 자체 생성 결론), Decision, OpenQuestion, Assumption` | **Postgres 행**(+ claim→evidence FK, `is_generated`) | CAW-01 자체 run에 대한 증거 불변식 강제 |
| 일반 지식 엔티티(`Source, Note, Concept, Interest`, 광범위 수집) | **여기 아님 — CAW-02(별개의 제품)** | 범위 밖; export 경계를 통해서만 소비/생산됨 |
| `Decision/OpenQuestion/Assumption/Note/ArchitectureProposal`의 저작 서사 | **git md/json**, PG로 투영 | 사람이 diff 가능한 진실; PG는 색인 |
| 임베딩(run/IR 특징 벡터 + CAW-01 자체 evidence/decision 텍스트) | 동일 PG 내 **pgvector**(유예) | 두 번째 스토어 없이 의미 회상 |
| `MemoryAnnotatedIR, TensorNode, DataMovementEdge, FillLevel (L0/L1/L2)` | **Postgres**: IR 헤더 행 + node/edge 테이블, JSONB attrs | fill 레벨에 걸쳐 동일 스키마; SQL의 얕은 그래프 연산 |
| HW `chip/die/package/tray/rack/cluster` + 컴포넌트 + 편집 | **Postgres** adjacency 테이블 + recursive CTE | 유계 깊이; path로 드릴다운 |
| Work-tree commit/tree/blob/ref + 변경 이벤트 로그 | **Postgres** 테이블(모델 = [ADR-0007](./ADR-0007-change-management-worktree_ko.md)) | 질의 가능한 이력; 버전 관리 엔티티와의 무결성 |

### "여기서 시작" 최소 스택(첫 수직 슬라이스)

1. **SQLite**(둘 다를 타깃으로 하는 ORM/마이그레이션 도구로 Postgres 이식 가능하게 스키마 저작)가
   관계형 코어 + run-evidence/provenance 행 + IR node/edge 테이블 + HW adjacency 테이블 + work-tree
   테이블을 보유.
2. **파일시스템**이 모든 blob을 보유하고 path로 참조됨.
3. **git**이 저작된 decision/open-question/assumption을 보유하며, frontmatter를 DB로 upsert하는 작은
   프로젝터 포함.
4. **아직 벡터 DB도 그래프 엔진도 없음.** 웹 앱, CLI, MCP 서버를 단일 파일에서 인프라 비용 0으로
   구동하며, 스키마가 첫날부터 이식 가능하므로 깔끔한 마이그레이션 경로를 가진다.

## 결과(Consequences)

- **쉬움:** 추론할 저장소 하나; 메트릭 비교 가치 루프("비교 가능한 투영")와 claim→evidence 불변식이
  네이티브; 세 표면 모두에 무운영 로컬 개발; 의미 검색(in-place `pgvector`)과 Cypher(in-place Apache
  AGE)로의 저렴한 경로.
- **어려움 / 수용됨:** AGE가 추가될 때까지는 깊은 IR 분석이 SQL에서 어색하다; L1/L2 IR 확장과 트레이스
  사이드채널([ADR-0005](./ADR-0005-trace-pipeline_ko.md))은 맞춤형 그래프 스키마가 아니라 JSONB/edge
  attrs로 얹힌다; git→DB 프로젝터를 만들어야 하고 기본은 단방향으로 유지해야 한다.
- **에스컬레이션 트리거:** 동시 다중 작성자 접근, pgvector 필요, CTE/JSONB 부담, 또는 단일 로컬 프로세스
  너머 배포 시 **SQLite→Postgres**. 첫 실제 의미 검색 필요 시 **pgvector 추가**. 다음이 *모두* 일 때만
  **Apache AGE 추가**: 핫패스 순회가 일상적으로 ~3–4 hop을 초과; recursive-CTE 지연이 UX를 해친다고
  *측정됨*; 그래프 알고리즘이 제품 기능이 됨. AGE가 불충분하다고 입증될 때만 **Neo4j**. 테이블 수준
  branch/merge가 지배적 요구가 될 때만 **Doltgres**([ADR-0007](./ADR-0007-change-management-worktree_ko.md)와
  조율).
- 후속: 이식 가능 스키마 세우기, blob-on-FS path 규약, git→DB 프로젝터(runbook의 함의 참조).

## 미해결 질문 / 재검토 트리거

- `TODO(open-question: confirm single-expert scale ceiling — node/row counts keeping SQLite/PG-CTE viable)`
- `TODO(open-question: measured latency threshold for IR traversal that triggers Apache AGE)`
- `TODO(open-question: Doltgres vs git-projection vs PG-temporal for work-tree — coordinate with ADR-0007)`
- `TODO(open-question: embedding model + dim for pgvector, and which entities get embedded first)`
- `TODO(open-question: object-store choice for TraceArtifact blobs — local FS vs S3-compatible — retention/audit policy)`
- `TODO(open-question: does syntorch HW-design layer persist its own format we must mirror, or is PG the only HW store? — do not assume beyond SOURCE-BRIEF §7)`
- `TODO(open-question: git→DB projection direction — is git always source of truth, or can the app write back?)`

## runbook에 대한 함의

- **phase-0-foundations** — SQLite(Postgres 이식 가능) 스키마를 세우는 RB: 관계형 코어, claim→evidence
  FK + `is_generated`를 가진 run-evidence/provenance 행, IR 헤더 + node/edge 테이블, HW adjacency 테이블,
  work-tree 테이블; 더불어 blob-on-FS path 규약.
- **phase-0 / phase-5** — git→DB 프로젝터를 위한 RB(md/json frontmatter → upsert).
- **phase-5-persistence-and-api** — SQLite→Postgres 전환 + 보호된 `pgvector` 활성화 RB; 코어/MCP를 통해
  노출되는 recursive-CTE 드릴다운 질의(HW 계층 + IR 이웃)를 위한 RB.
- 버전 관리 *객체 모델*은 [ADR-0007](./ADR-0007-change-management-worktree_ko.md)로, IR fill 메커니즘은
  [ADR-0005](./ADR-0005-trace-pipeline_ko.md)로 유예한다.
