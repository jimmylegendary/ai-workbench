# ADR-0006: Retrieval — FTS-first, 인용 반환, embedding 보류

- **Status:** proposed
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [../_meta/PRODUCT-BRIEF_ko.md](../_meta/PRODUCT-BRIEF_ko.md)
  - [../02-research/retrieval-and-rag_ko.md](../02-research/retrieval-and-rag_ko.md)
  - [./ADR-0002-storage_ko.md](./ADR-0002-storage_ko.md)
  - [./ADR-0004-provenance-and-trust_ko.md](./ADR-0004-provenance-and-trust_ko.md)
  - [./ADR-0007-import-export-contracts_ko.md](./ADR-0007-import-export-contracts_ko.md)
  - [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적
CAW-02의 **v0 retrieval**을 결정한다: keyword/full-text 대 semantic/vector, embedding을 언제 추가하는지, 그리고
결과가 불투명한 생성 blob이 아니라 인용(claim + evidence)을 어떻게 담는지. 이는
[ADR-0002](./ADR-0002-storage_ko.md)의 md-first + SQLite index와 [ADR-0004](./ADR-0004-provenance-and-trust_ko.md)의
trust/boundary 모델 위에 세워진다. 저장 기반(substrate)이나 import/export 계약은 결정하지 않는다(see
[ADR-0007](./ADR-0007-import-export-contracts_ko.md)).

## 배경
- **Provenance가 제품이다.** retrieval은 *체인이 딸린 항목*(`Source → Claim → Evidence → Note`)을 반환해야 한다.
  provenance 없는 결과는 결함이다(brief §2, §5).
- **생성된 요약은 evidence가 아니다**(brief §10) — 어떤 synthesis 계층이든 생성 텍스트를 cited `Evidence`로부터
  구조적으로 분리하고 인용을 강제해야 한다.
- **Boundary 인지:** 무언가 저장소를 떠나기 *전에* `boundary` + team/private를 필터링(brief §6, §10).
- **단일 큐레이터 규모:** 수백~수천 단위의 항목, 수백만이 아님 — 이것이 "embedding이 가치 있는가?" 질문을
  좌우한다(brief §3).
- **독립적, in-process, 이식 가능:** 하나의 배포 단위로 출하; SQLite↔Postgres를 열어둠([ADR-0002](./ADR-0002-storage_ko.md)).

## 검토한 선택지
| 선택지 | 장점 | 단점 | 적합성 |
|---|---|---|---|
| **Keyword / FTS (SQLite FTS5, BM25)** | embedding 비용 0; 정확한 식별자/전문용어 recall; 결정론적·검사 가능; SQL에서 간단히 boundary 필터링; index와 동일 파일 | 동의어/패러프레이즈를 놓침 | **Chosen v0 default** |
| Semantic / vector (`sqlite-vec`, pgvector) | 패러프레이즈/개념적 매치를 찾음 | 모델 의존성 + embed 비용; 불투명한 랭킹; 편집 시 재임베드; 정확한 식별자에 약함 | **추가적, 보류** — 측정된 트리거에서 채택 |
| Hybrid (FTS + vector, RRF로 융합) | 최고의 recall | 두 개의 index; 더 많은 가동 부품 | **v1 목표**, embedding 존재 이후 |
| Graph/링크 순회 | 도메인에 네이티브; provenance 체인을 hydrate | 그 자체로는 발견 시드가 아님 | **상시 동반자**, 선택사항 아님 |
| `sqlite-vss` (Faiss) | — | 저자에 의해 deprecated; 느린 index 학습 | 회피 |
| LanceDB | 메모리보다 큰 ANN | v0 규모엔 과함; 동시 쓰기 제약 | corpus가 크게/멀티모달로 성장할 때만 재고 |

## 결정
1. **텍스트 retrieval = SQLite FTS5 (BM25)**, 관계형 index와 같은 위치에 배치([ADR-0002](./ADR-0002-storage_ko.md));
   storage ADR이 Postgres로 이식되면 Postgres `tsvector`/GIN. FTS는 **분리되어 drop 가능한 migration**에 두어
   이식성을 결코 위협하지 않게 한다.
2. **구조적 필터는 1급이며 랭킹 전에 적용된다:** `boundary`, `visibility`(team/private),
   entity-`kind`, `Concept`/`Interest`, `trust` — 모두 SQL `WHERE`. boundary/scope 필터는 결과가 조립되기
   **전에** 실행되어 confidential 항목이 누출될 수 없다(brief §6/§10, [ADR-0004](./ADR-0004-provenance-and-trust_ko.md)).
3. **Graph/링크 순회는 상시 켜져 있다.** 텍스트 retrieval이 시드를 찾고, edge 순회가
   `Source→Claim→Evidence→Note` 체인을 `trust`와 `boundary`와 함께 hydrate한다. 이것이 적중을 *provenance를
   담은* 답으로 만든다.
4. **결과는 문자열이 아니라 구조화된 envelope이다:**
   ```
   RetrievalHit {
     item:     { id, kind: Source|Claim|Evidence|Note|..., text/title }
     chain:    [ Source -> Claim -> Evidence -> Note ]   # hydrated via edge traversal
     trust:    <T0..T3 | contested>                       # carried, not inferred at query time
     boundary: public | internal | confidential           # enforced pre-return
     scope:    team | private
     locator:  { source_uri, location }                   # where evidence physically lives (path/URI)
     score:    { fts_rank, (vector_sim), (rerank) }        # ranking is inspectable
   }
   ```
5. **RAG = provenance retrieval + 인용 제약 synthesis이지, chat-over-docs가 아니다.** 기본 응답은 생성을 건너뛰고
   랭킹된 claim+evidence를 반환할 수 있다. 생성을 opt-in할 경우:
   - boundary 필터 먼저(생성 후가 결코 아님);
   - 종합된 모든 문장/claim은 ID로 retrieve된 단위 ≥1개를 인용해야 함; 인용 없는 claim은 거부되거나
     `unsupported`로 플래그되며 결코 사실로 반환되지 않음;
   - 구조화된 출력 `{ answer_claims:[{text, cites:[evidence_id...]}], evidence:[{id, source, boundary, trust,
     locator}], unsupported:[...] }`;
   - 보존된 synthesis는 cited **`Note`**(`generated=true`)로 저장되며, 결코 `Evidence`가 아님
     ([ADR-0004](./ADR-0004-provenance-and-trust_ko.md) evidence gate).
6. **Embedding은 보류된다.** 스키마는 **nullable한 vector sidecar**(`node_vec`)를 예약해 두어 `sqlite-vec`
   (SQLite)나 `pgvector`(Postgres) 추가가 재작성이 아니라 추가적이 되도록 한다(brief §6).

## Embedding 트리거(추측이 아니라 *측정된* 신호에서 채택)
- **A — recall 격차:** 큐레이터가 존재를 아는 항목을 FTS가 어휘/동의어 불일치로 반복해서 놓침.
- **B — corpus 다양성:** source가 충분히 많은 하위 도메인에 걸쳐 공유 어휘가 무너짐.
- **C — agent/NL 쿼리:** 에이전트가 개념적 질문("X와 관련된 evidence")을 하는데 FTS가 under-recall함.
- **D — 교차 언어 / 심한 동의어** 콘텐츠가 등장.

트리거가 발동하기 전까지는 FTS 품질(토크나이징, 동의어 목록, "가난한 자의 semantics"로서의 `Concept`/`Interest`
태그, 구조적 필터)에 투자한다. embedding이 도입되면: v0 규모에선 brute-force 유사도로 충분(ANN 튜닝 불필요).
**Hybrid(FTS + vector RRF 융합), 그 다음 선택적 cross-encoder reranker는 v1** — 측정된 recall/precision이
필요로 할 때만.

## 결과
- **쉬워지는 것:** 전문용어가 많은 작은 기술 corpus에 적합한 결정론적·검사 가능 랭킹; v0에서 모델 의존성 없는
  하나의 in-process 엔진; 무언가 떠나기 전에 순수 SQL에서 강제되는 boundary/trust; "요약이 evidence로 오인됨"을
  구조적으로 어렵게 만드는 인용 반환 결과.
- **어려운 것:** embedding이 추가되기 전까지 FTS는 패러프레이즈를 놓친다; 긴 import artifact는 chunking/앵커
  전략이 필요하다; `confidential` 항목에 대한 향후 embedding 단계는 지역성(locality) 문제를 일으킨다(아마 로컬 전용 모델).
- **후속:** data-layer RB(FTS5 virtual table + 필터 컬럼 + 예약된 nullable vector sidecar); retrieval-service
  RB(랭킹 전 boundary/scope 필터 + 체인 hydration을 갖춘 `RetrievalHit` envelope를 반환하는 `search()`);
  RAG/synthesis RB(인용 제약 구조화 출력; 보존된 것은 cited `Note`로 영속화); v1 업그레이드 RB(동일한 `search()`
  인터페이스 뒤의 embedding, RRF, 선택적 rerank, 트리거 A–D로 게이트).

## 미해결 질문 / 재검토 트리거
- `TODO(open-question: embedding model & locality — local vs API; does API embedding violate confidential-boundary rules?)`
- `TODO(open-question: re-embedding policy on model upgrades / edited items without stale vectors)`
- `TODO(open-question: grounding-check engine — automated claim-entailment in v0 or v1; LLM cost/boundary)`
- `TODO(open-question: chunking unit — whole Claim/Note rows vs sub-chunk long sources; anchor storage)`
- `TODO(open-question: synonym/concept tagging investment to delay embeddings)`
- **재검토 트리거 → embedding:** A–D 중 하나가 측정되어 발동.
- See [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md).

## runbook에 대한 함의
- **RB (data-layer):** `boundary`, `scope`, `kind`, `trust`, entity-link 컬럼을 갖는 FTS5 virtual table(또는
  `tsvector` + GIN); nullable vector sidecar 예약(v0에선 미사용).
- **RB (retrieval service):** `search()` → `RetrievalHit` envelope; 조립 전 boundary/scope 필터; edge 순회
  체인 hydration.
- **RB (RAG/synthesis):** 인용 제약 `{answer_claims[], evidence[], unsupported[]}`; 인용 없는 claim 거부/플래그;
  보존된 synthesis는 cited `Note`로 영속화, 결코 `Evidence` 아님.
- **RB (interfaces):** API/MCP/CLI가 envelope를 반환; viewer는 claim↔evidence 링크 + trust를 렌더링; 기본
  응답은 retrieval 전용일 수 있음(생성 없음).
