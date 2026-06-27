# Retrieval & RAG

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [../_meta/PRODUCT-BRIEF_ko.md](../_meta/PRODUCT-BRIEF_ko.md), [../01-decisions/](../01-decisions/), [../04-data-layer/](../04-data-layer/), [../05-knowledge-core/](../05-knowledge-core/), [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF_ko.md

## 목적
이 문서는 CAW-02의 provenance 보존 knowledge store를 위한 **retrieval**을 연구하고 v0 접근을 권고한다.
다루는 범위: 키워드/전문(FTS) 대 의미/벡터 검색; 구체적 엔진 옵션(SQLite FTS5, `sqlite-vec`, pgvector, LanceDB);
단일 큐레이터 규모에서 embedding이 실제로 가치 있는 시점; 하이브리드 검색; 그리고 — 이 제품에 가장 중요하게 —
**불투명하게 생성된 blob이 아니라 citation(claim + evidence)을 반환하는 RAG 패턴**. 저장 substrate는 결정하지 않는다
(그것은 별도 storage ADR; 이 문서는 브리프 §6의 md-first + 관계형 인덱스 방향을 가정하고 SQLite/Postgres 사이에서 portable하게
유지). ingestion/extraction(별도 파이프라인 ADR)이나 CAW-01/05/03와의 import/export 계약도 다루지 않는다.

## retrieval을 형성하는 설계 제약 (브리프에서)
- **Provenance가 곧 제품이다.** retrieval은 *체인을 동반한 항목*(`Source → Claim → Evidence → Note`)을 반환해야 하며,
  결코 떼어낸 text span을 반환하지 않는다. provenance 없는 결과는 편의가 아니라 결함이다.
- **생성된 요약은 evidence가 아니다**(guardrail §10). 모든 RAG/synthesis 계층은 생성된 텍스트를 인용된 `Evidence`와
  눈에 띄게 분리해야 하며, 모든 synthesize된 claim이 citation을 동반하도록 강제해야 한다.
- **Boundary 인지.** 모든 항목은 `boundary`(public/internal/confidential) + team-vs-private를 지닌다. retrieval은
  무엇이든 store를 떠나기 *전에* boundary로 필터해야 한다; public export는 public-safe 항목만 반환한다.
- **단일 큐레이터 규모(v0).** Jimmy + 소규모 팀 + 소수 에이전트. 코퍼스는 수백→낮은 수천 개의 source/claim이지
  수백만이 아니다. 이것이 "embedding이 가치 있는가?" 질문을 지배한다.
- **독립 제품.** 자체 store/deploy; 공유 substrate 없음. 전체 제품이 하나의 배포 단위로 출하되도록 in-process로 임베드되는
  엔진을 선호.
- **이식성.** storage ADR은 SQLite↔Postgres를 열어 둠; retrieval 선택이 그 문을 잠그면 안 됨.

## retrieval 계열 비교

| 계열 | 무엇인가 | 강점 | 약점 | CAW-02 v0 적합성 |
|---|---|---|---|---|
| **Keyword / FTS** (SQLite FTS5, Postgres `tsvector`, BM25) | 토큰 위 어휘 인덱스; term frequency로 랭킹 | embedding 비용 0; 정확 term + 식별자/전문용어 recall; 운영 저렴; 결정론적·검사 가능; SQL로 손쉽게 boundary 필터 가능 | 동의어/패러프레이즈 놓침; 의미적 "근접" 매치 없음; 쿼리가 어휘를 공유해야 함 | **강력한 기본값.** 작고 전문용어 많은 기술 코퍼스와 검사 가능성 요구에 부합 |
| **Semantic / vector** (`sqlite-vec`, pgvector, LanceDB) | 텍스트 임베드 → 벡터 위 ANN/brute-force 최근접 이웃 | 패러프레이즈/개념 매치 발견; "X에 대해 무엇을 아는가" 같은 모호한 의도에 좋음 | embedding 모델 의존성 + 비용; 불투명한 랭킹; 모델 변경 시 drift; 정확 식별자에 약함; 편집 시 재임베드 필요 | **부가적이며 우선이 아님.** FTS recall이 명백히 실패할 때 가치 |
| **Hybrid** (FTS + vector, RRF로 융합) | 둘 다 실행, 랭크 목록 병합 | 최고 recall; 어휘는 정확 term, 벡터는 패러프레이즈 포착 | 유지할 인덱스 2개; 움직이는 부품 증가 | embedding이 존재하면 **v1 목표** |
| **Graph traversal** (`Claim→Evidence→Note` 링크 추적) | provenance edge 순회 | 도메인에 네이티브; "체인 보여주기" 구동; ML 없음 | 그 자체로 discovery 메커니즘 아님; seed 필요 | 어떤 텍스트 retrieval을 쓰든 **항상 켜진 동반자** |

핵심 통찰: 이 제품에서 **graph/link traversal은 텍스트 retrieval 선택과 무관하게 선택사항이 아니다** — 그것이 hit을
*provenance를 동반한* 답으로 바꾸는 방법이다. 텍스트 retrieval이 seed 항목을 찾고, edge traversal이 체인과 trust level을
hydrate한다.

## 엔진 옵션 (embedded-first, portable)

| 엔진 | 모드 | 비고 (근거) | v0 판정 |
|---|---|---|---|
| **SQLite FTS5** | In-process, SQLite 내장 | 성숙하고 보편적인 BM25 스타일 랭킹; 추가 의존성 없음; 관계형 인덱스와 같은 파일 | **권고 v0 텍스트 retrieval** |
| **Postgres FTS (`tsvector`/`ts_rank`)** | Server | Postgres-portable로 갈 때 네이티브; GIN 인덱스 | storage ADR이 Postgres를 고르면 사용 |
| **`sqlite-vec`** | In-process SQLite 확장(순수 C, 의존성 없음) | **deprecated된 `sqlite-vss`**(Faiss 빌드/training 고통이 있던)의 활성 후속; virtual table 통한 brute-force ANN; SQLite가 도는 곳 어디든 실행 | **embedding 추가 시 권고 경로**(single-file, in-process 유지) |
| **`sqlite-vss`** | SQLite 확장(Faiss) | 저자가 `sqlite-vec` 선호로 **deprecated**; 느린 인덱스 training 보고됨 | 회피 |
| **pgvector** | Postgres 확장 | 가장 production-성숙; 벡터가 관계형 데이터 옆에 위치; 이미 Postgres면 좋음 | 이미 Postgres인 경우에만 사용 |
| **LanceDB** | Embedded, in-process, columnar (Lance 포맷) | 디스크 기반 ANN, larger-than-memory, zero-copy, 서버 없음; 더 새롭고 작은 커뮤니티, 동시 쓰기 제한 | v0 규모에 과함; 코퍼스가 커지거나 멀티모달이 되면 재고 |

우리 규모(낮은 수천 개 벡터)에서는 **brute-force 유사도로 충분**하다 — ANN 인덱스 튜닝은 불필요하며, 이는 저장 substrate에
맞는 가장 단순한 in-process 옵션(SQLite엔 `sqlite-vec`, Postgres엔 pgvector)을 한층 선호하게 만든다.

## embedding이 실제로 가치 있는 시점은?
embedding은 모델 의존성, 쓰기/편집 시 임베드 비용, 모델 업그레이드 시 재임베드 위험, 불투명한 랭킹 표면을 추가한다 —
모두 브리프가 요구하는 검사 가능성과 싸운다. 단일 큐레이터 규모에서 기본 답은 **"아직 아니다."** 추측이 아니라 *측정된*
트리거가 발동할 때 embedding을 채택한다:

- **Trigger A — recall 격차:** 어휘 불일치(동의어/패러프레이즈) 때문에 FTS가 큐레이터가 존재를 아는 항목을 놓치며, 실제
  쿼리에서 반복적으로 관찰됨.
- **Trigger B — 코퍼스 크기/다양성:** source가 충분히 많은 하위 도메인에 걸쳐 공유 어휘가 무너짐.
- **Trigger C — 에이전트/NL 쿼리:** 에이전트가 키워드 조회가 아니라 개념적 질문("X와 관련된 evidence")을 하고, FTS가
  under-recall함.
- **Trigger D — cross-lingual / 강한 동의어** 콘텐츠가 등장.

그때까지는: embedding 스택 대신 FTS 품질에 투자한다(좋은 tokenization, 동의어 목록, `Concept`/`Interest` 태그라는 저렴한
"가난한 자의 의미론", boundary/entity-type 구조적 필터). embedding이 **재작성이 아니라 부가 업그레이드**가 되도록 스키마를
준비해 둔다(nullable `embedding` 컬럼 / sidecar 벡터 테이블) — 브리프 §6의 "재작성 없음" 요구와 일관됨.

## blob이 아니라 citation(claim + evidence)을 반환하는 RAG
이 제품의 위험한 실패 모드는 유창하게 생성된 문단이 evidence로 오인되는 것이다. 따라서 RAG 계층은 현재의 citation-aware /
claim-grounding RAG 관행에 기반하여 **attribution을 강한 출력 계약**으로 두고 설계된다:

1. **raw chunk가 아니라 provenance를 동반한 단위를 retrieve.** retrieve 가능한 단위는 `Claim`/`Evidence`/`Note` row이다
   (또는 parent ID + `boundary` + `trust`를 메타데이터로 *동반하는* chunk). 공간/source anchor(source URI, location/offset)가
   인덱싱부터 synthesis까지 chunk와 함께 이동하여 드러낼 수 있게 한다.
2. **boundary 필터 먼저.** 무엇이든 모델이나 응답에 도달하기 전에 SQL/retrieval 계층에서 `boundary` + team/private 필터를
   적용 — 결코 생성 후에 필터하지 않는다.
3. **필수 inline citation과 함께 synthesize.** 생성된 모든 문장/claim은 ID로 retrieve된 단위를 ≥1개 인용해야 한다
   (claim → 인용된 evidence ID, start/end 구분과 함께). citation 없는 synthesize된 진술은 거부되거나 "unsupported"로
   플래그되며, 결코 사실로 반환되지 않는다.
4. **prose-only가 아니라 구조화하여 반환.** 응답은 `{answer_claims:[{text, cites:[evidence_id...]}],
   evidence:[{id, source, boundary, trust, locator}], unsupported:[...]}`. viewer/CLI가 citation을 렌더링하고,
   생성 계층은 `Evidence`와 시각적·구조적으로 구별된다(guardrail §10).
5. **Grounding check (v0 선택, v1 권고).** 답을 atomic claim으로 분해하고 각각이 인용된 evidence에 의해 entail되는지
   검증; grounding/trust 점수를 드러냄. 텍스트가 인용된 span과 일치하지 않는 "가짜 citation"을 잡아냄.
6. **synthesis를 `Evidence`가 아니라 `Note`로 저장.** 보관할 가치가 있는 생성된 답은 evidence에 연결된 인용된 `Note`가 됨
   — 재구성 가능성 보존(source→claim→evidence→note).

이로써 여기의 RAG는 일반적 "chat-over-docs"가 아니라 **provenance retrieval + citation 제약 synthesis** 계층이 된다.
기본 retrieval 응답은 생성을 완전히 건너뛰고 랭킹된 claim+evidence를 반환할 수도 있다 — 생성은 이미 신뢰할 수 있는
결과 집합 위의 opt-in 편의이다.

## Hybrid 검색 & 랭킹 (v1 경로)
embedding이 존재하면 FTS와 벡터 결과를 **Reciprocal Rank Fusion (RRF)** 로 결합한다 — 랭크 위치로 병합하므로 호환되지 않는
BM25와 cosine 스케일 사이의 점수 보정이 필요 없으며, 현재 관행의 견고한 기본값이다. 선택적 2단계: synthesis 전에 정밀도를
복원하기 위해 융합된 top-N 위의 **cross-encoder reranker**(RRF로 넓게 retrieve → top ~10 rerank → cite). v0 규모에서는
reranker가 불필요할 가능성이 높다; 결과 목록이 길어지거나 noisy해질 때 재고.

## 권고 v0 retrieval
- **텍스트 retrieval:** 관계형 knowledge 인덱스와 함께 배치된 **SQLite FTS5**(BM25 랭킹)를 주 인덱스로. (storage ADR이
  Postgres를 선택하면 Postgres `tsvector`.)
- **구조적 필터를 first-class로:** boundary, team/private, entity-type, `Concept`/`Interest`, trust level — 모두 SQL `WHERE`,
  랭킹 전에 적용.
- **Provenance hydration:** 모든 hit은 link traversal로 `Source→Claim→Evidence→Note` 체인으로 확장되며 `trust`와
  `boundary`가 붙는다. 이것이 실제 "결과"이다.
- **RAG/synthesis:** citation 제약, 구조화된 출력(claim + 인용된 evidence ID + unsupported 목록); 생성은 신뢰할 수 있는
  결과 집합 위의 선택; 보관할 synthesis는 인용된 `Note`로 저장.
- **Embedding:** **연기.** 스키마는 nullable 벡터 sidecar를 예약하여 `sqlite-vec`(또는 pgvector) 추가가 부가적이게 함.
  Trigger A–D 발동 시 채택.
- **Hybrid + RRF + 선택적 reranker:** **v1**, embedding 이후, 측정된 recall/precision이 필요로 할 때만.

## 결과가 provenance & trust를 어떻게 동반하는가
모든 retrieval 결과는 문자열이 아니라 구조화된 envelope이다:

```
RetrievalHit {
  item:      { id, type: Source|Claim|Evidence|Note|..., text/title }
  chain:     [ Source -> Claim -> Evidence -> Note ]   # hydrated via link traversal
  trust:     <level>                                   # carried from the item, see provenance/trust ADR
  boundary:  public | internal | confidential          # enforced pre-return
  scope:     team | private
  locator:   { source_uri, location }                  # where evidence physically lives (path/URI per brief §6)
  score:     { fts_rank, (vector_sim), (rerank) }      # ranking is inspectable
}
```
- **Trust는 데이터이지 쿼리 시점에 추론되지 않음** — retrieval은 각 항목의 저장된 trust/boundary를 드러낸다.
- **blob 답 없음:** synthesize된 RAG 응답조차 `claim → 인용된 evidence ID`로 분해된다.
- **Boundary는 retrieval 경계에서 강제됨**으로 confidential 항목이 public-facing export로 유출될 수 없다(브리프 §6/§10).

## Open Questions
- `TODO(open-question: storage substrate)` — SQLite 대 Postgres 대 둘 다가 텍스트 retrieval이 FTS5 대 `tsvector`인지,
  벡터가 `sqlite-vec` 대 pgvector인지를 결정. storage ADR에서 추적.
- `TODO(open-question: embedding model & locality)` — embedding이 도입되면 어떤 모델(local 대 API), 그리고 API embedding
  단계가 `confidential` 항목의 confidential-boundary 규칙을 위반하는가? confidential 콘텐츠는 local-only일 가능성 높음.
- `TODO(open-question: re-embedding policy)` — provenance나 stale 벡터를 깨뜨리지 않고 모델 업그레이드 / 편집된 항목을
  어떻게 처리할 것인가.
- `TODO(open-question: grounding-check engine)` — 자동 claim-entailment 검증이 v0인가 v1인가, 그리고 LLM 호출이 필요한가
  (비용/boundary 함의)?
- `TODO(open-question: chunking unit)` — 전체 `Claim`/`Note` row를 retrieve 대 긴 source를 sub-chunk; 긴 import된
  artifact의 anchor/locator를 어떻게 저장하는가.
- `TODO(open-question: synonym/concept tagging)` — embedding을 늦추기 위해 "가난한 자의 의미론"(Concept/Interest 태그,
  동의어 목록)에 얼마나 투자하는가.

## 런북에 대한 함의
- **RB (data-layer):** 인덱싱된 텍스트 위에 FTS5 virtual table(또는 `tsvector` + GIN) 생성; 필터링이 순수 SQL이도록
  `boundary`, `scope`, `type`, `trust`, entity-link 컬럼 포함. nullable 벡터 sidecar 테이블/컬럼(v0에서 미사용)을 예약하여
  embedding이 부가적이게 함.
- **RB (retrieval service):** 위 `RetrievalHit` envelope를 반환하는 `search()` 구현 — FTS rank + 구조적 필터 +
  provenance 체인의 link-traversal hydration. boundary/scope 필터는 결과 조립 *전에* 적용.
- **RB (RAG/synthesis):** 구조화된 `{answer_claims[], evidence[], unsupported[]}`를 생산하는 citation 제약 synthesis;
  인용 없는 claim은 거부/플래그; 보관된 synthesis를 인용된 `Note`로 영속화, 결코 `Evidence`로가 아님.
- **RB (interfaces):** API/MCP/CLI는 구조화된 envelope 반환; viewer는 claim↔evidence 링크와 trust를 렌더링; 기본 응답은
  retrieval-only(생성 없음)일 수 있음.
- **RB (upgrade path / v1):** 같은 `search()` 인터페이스 뒤에 embedding(`sqlite-vec`/pgvector) 추가; RRF 융합과 선택적
  cross-encoder rerank 추가; 채택은 측정된 Trigger A–D 기준으로 gate.

## Sources
- [sqlite-vec (GitHub)](https://github.com/asg017/sqlite-vec) / [sqlite-vss deprecation (GitHub)](https://github.com/asg017/sqlite-vss) / [State of Vector Search in SQLite](https://marcobambini.substack.com/p/the-state-of-vector-search-in-sqlite)
- [pgvector vs LanceDB comparison (Zilliz)](https://zilliz.com/comparison/pgvector-vs-lancedb) / [Best Vector Databases 2026 (Encore)](https://encore.dev/articles/best-vector-databases)
- [Citation-Aware RAG (Tensorlake)](https://www.tensorlake.ai/blog/rag-citations) / [Explicit Evidence Grounding via Structured Inline Citation (arXiv)](https://arxiv.org/html/2606.07130) / [eTracer: claim-level grounding (arXiv)](https://arxiv.org/pdf/2601.03669) / [Trustworthy RAG with in-text citations](https://haruiz.github.io/blog/improve-rag-systems-reliability-with-citations)
- [RRF for hybrid search (OpenSearch)](https://opensearch.org/blog/introducing-reciprocal-rank-fusion-hybrid-search/) / [Hybrid search + reranking playbook](https://optyxstack.com/rag-reliability/hybrid-search-reranking-playbook) / [Hybrid search ranking (Azure AI Search)](https://learn.microsoft.com/en-us/azure/search/hybrid-search-ranking)
