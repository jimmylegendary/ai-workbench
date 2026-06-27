# Retrieval (knowledge-core)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [../_meta/PRODUCT-BRIEF_ko.md](../_meta/PRODUCT-BRIEF_ko.md) (단일 진실 공급원)
  - [../01-decisions/ADR-0006-retrieval_ko.md](../01-decisions/ADR-0006-retrieval_ko.md) (이 문서가 구체화하는 결정)
  - [../01-decisions/ADR-0002-storage_ko.md](../01-decisions/ADR-0002-storage_ko.md) (md SoT + SQLite index + 폐기 가능한 FTS migration)
  - [../01-decisions/ADR-0004-provenance-and-trust_ko.md](../01-decisions/ADR-0004-provenance-and-trust_ko.md) (여기서 강제되는 boundary/visibility/trust)
  - [../01-decisions/ADR-0003-knowledge-data-model_ko.md](../01-decisions/ADR-0003-knowledge-data-model_ko.md) (hydration을 위해 순회되는 edges)
  - [../01-decisions/ADR-0001-product-surface-and-skill-interface_ko.md](../01-decisions/ADR-0001-product-surface-and-skill-interface_ko.md) (단일 core; 얇은 어댑터)
  - [../01-decisions/ADR-0007-import-export-contracts_ko.md](../01-decisions/ADR-0007-import-export-contracts_ko.md) (fail-closed export allow-list)
  - [../02-research/retrieval-and-rag_ko.md](../02-research/retrieval-and-rag_ko.md) (연구 근거)
  - [./ingestion-pipeline_ko.md](./ingestion-pipeline_ko.md) (이 문서가 검색하는 것을 생산; B2가 `search()` 호출)
  - [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적
이 문서는 [ADR-0006](../01-decisions/ADR-0006-retrieval_ko.md)에서 결정된 CAW-02의 **v0 retrieval**을 빌드 가능한 수준의 깊이로 명세한다: **SQLite FTS5 (BM25)** 텍스트 검색, **랭킹 이전에 적용되는 일급 구조적 필터**, 모든 hit의 **provenance-chain hydration**, **citation-constrained RAG**, 그리고 임베딩을 추가하는 측정된 트리거를 갖춘 **예약된 vector sidecar**다. 스토리지 기질
([ADR-0002](../01-decisions/ADR-0002-storage_ko.md)), trust/boundary 모델
([ADR-0004](../01-decisions/ADR-0004-provenance-and-trust_ko.md)), 또는 import/export 계약
([ADR-0007](../01-decisions/ADR-0007-import-export-contracts_ko.md))을 다시 결정하지는 않는다 — 이들은 소비된다.

## retrieval을 형성하는 제약 (brief로부터)
- **Provenance가 곧 제품이다.** hit는 그 체인(`Source → Claim → Evidence → Note`)을 지녀야 한다; provenance 없는 결과는 결함이다(brief §2, §5).
- **생성된 요약은 evidence가 아니다**(brief §10). 모든 synthesis는 생성된 텍스트를 cited `Evidence`와 구조적으로 분리하여 유지하고 인용을 강제한다.
- **Boundary-aware.** 무언가가 저장소를 떠나기 **전에** `boundary` + `visibility`(team/private)를 필터링한다
  (brief §6, §10; [ADR-0004](../01-decisions/ADR-0004-provenance-and-trust_ko.md)).
- **단일 큐레이터 규모.** 수백→낮은 수천 개의 항목 — 이것이 "임베딩이 가치 있는가?" 질문을 좌우한다.
- **독립적, in-process, 이식 가능.** 하나의 배포 단위; SQLite↔Postgres를 열어둔다
  ([ADR-0002](../01-decisions/ADR-0002-storage_ko.md)).

## 엔진 결정 (v0)
1. **텍스트 검색 = SQLite FTS5 (BM25)**, 관계형 index와 함께 배치
   ([ADR-0002](../01-decisions/ADR-0002-storage_ko.md)); 스토리지가 Postgres로 이식되면 Postgres `tsvector`/GIN.
   FTS는 **별도의 폐기 가능한 migration**에 존재하여 이식성을 결코 위협하지 않으며 결정론적 reindex로 재빌드될 수 있다.
2. **구조적 필터는 일급이며 랭킹 이전에 적용된다** — 순수 SQL `WHERE`.
3. **그래프/링크 순회는 항상 켜져 있다** — hit를 답으로 만드는 provenance 체인을 hydrate한다.
4. **임베딩은 보류된다** — nullable `node_vec` sidecar가 예약되어 있다(추가적, rewrite 없음).

| Family | Verdict | Why |
|---|---|---|
| **FTS5 / BM25** | **v0 선택** | 임베딩 비용 0; 정확한 식별자/전문용어 recall; 결정론적, 검사 가능; SQL에서 손쉽게 boundary 필터 가능; index와 같은 파일 |
| Vector (`sqlite-vec` / pgvector) | 보류, 추가적 | paraphrase를 찾음; 그러나 모델 의존성, 불투명한 랭킹, 편집 시 재임베딩, 식별자에 약함 |
| Hybrid (FTS + vector via RRF) | v1 목표 | 최고의 recall, 임베딩이 존재한 후 |
| Graph traversal | 항상 켜진 동반자 | 체인을 hydrate함; 단독으로는 발견의 씨앗이 아님 |
| `sqlite-vss` (Faiss) / LanceDB | 회피 / 재고 | deprecated; 또는 v0 규모에 과함 |

## 랭킹 이전의 구조적 필터
boundary/scope 필터는 결과가 조립되기 **전에** 실행되므로, confidential 또는 private 항목이 새어 나갈 수 없다 —
boundary 강제는 생성 후 단계가 아니라 순수 SQL에 있다. md frontmatter에서 index로 미러링된 일급 필터 컬럼:

| Filter | Type | Source | Purpose |
|---|---|---|---|
| `boundary` | `public \| internal \| confidential` | frontmatter | **유출 방지** — 반환 전 강제 |
| `visibility` | `team \| private` | frontmatter | team 대 Jimmy-private 분리 |
| `kind` | entity type | frontmatter | `Source/Claim/Evidence/Note/Concept/...` |
| `trust` | `T0..T3 \| contested` | derived ([ADR-0004](../01-decisions/ADR-0004-provenance-and-trust_ko.md)) | 품질 하한; 쿼리 시 추론하지 않고 carry됨 |
| `concept` / `interest` | tag/edge | edges | 주제적 범위("poor-man's semantics") |
| `status` | `proposed \| accepted \| ...` | frontmatter | 기본적으로 미리뷰 candidate 제외 |

```sql
-- shape (illustrative): filters constrain the candidate set BEFORE BM25 ranks it
SELECT n.id, n.kind, bm25(fts) AS fts_rank, n.trust, n.boundary, n.visibility
FROM fts
JOIN nodes n ON n.rowid = fts.rowid
WHERE fts MATCH :query
  AND n.boundary IN (:allowed_boundaries)   -- leak prevention, pre-rank
  AND n.visibility IN (:allowed_scopes)
  AND (:kind     IS NULL OR n.kind   = :kind)
  AND (:min_trust IS NULL OR n.trust >= :min_trust)
ORDER BY fts_rank
LIMIT :k;
```

## Provenance-chain hydration
텍스트 검색은 **씨앗**을 찾는다; edge 순회([ADR-0003](../01-decisions/ADR-0003-knowledge-data-model_ko.md)
의 제네릭 타입 edge 테이블)가 `trust`와 `boundary`가 부착된 `Source→Claim→Evidence→Note` 체인을 **hydrate**한다.
모든 결과는 문자열이 아니라 구조화된 봉투다:

```text
RetrievalHit {
  item:     { id, kind: Source|Claim|Evidence|Note|..., text/title }
  chain:    [ Source -> Claim -> Evidence -> Note ]   # hydrated via edge traversal
  trust:    <T0..T3 | contested>                       # carried from the item, not inferred at query time
  boundary: public | internal | confidential           # enforced pre-return
  scope:    team | private
  locator:  { source_uri, location }                   # where evidence physically lives (path/URI)
  score:    { fts_rank, (vector_sim), (rerank) }        # ranking is inspectable
}
```
Hydration은 `evidence_for` / `extracted_from` / `cites` / `about_concept` edge를 순회한다. **boundary는 hydrate된 모든 노드에서 재검사된다** — 씨앗이 허용되었더라도 체인은 `confidential` evidence 노드를 `public`-scope 쿼리로 노출할 수 없다.

## Citation-constrained RAG (chat-over-docs가 아님)
여기서 RAG = **provenance 검색 + citation-constrained synthesis**. 기본 응답은 **생성을 건너뛰고** 랭킹된 claim+evidence를 반환할 수 있다; 생성은 이미 신뢰할 만한 결과 집합 위에 선택적으로 더하는 편의다.

생성이 선택되었을 때:
1. **Boundary 필터 먼저** — 결코 생성 후가 아니다.
2. 불투명한 chunk가 아니라 **provenance를 지닌 단위를 검색**한다(부모 ID + `boundary` + `trust` + `locator`를 지닌 `Claim`/`Evidence`/`Note` 행).
3. **합성된 모든 문장/claim은 ID로 검색된 단위를 ≥1개 인용해야 한다.** 인용 없는 claim은 **거부되거나 `unsupported`로 표시**되며, 결코 사실로 반환되지 않는다.
4. prose-only가 아니라 **구조화된 출력**:
   ```text
   {
     answer_claims: [ { text, cites: [evidence_id, ...] } ],
     evidence:      [ { id, source, boundary, trust, locator } ],
     unsupported:   [ { text } ]   # surfaced, never asserted as fact
   }
   ```
5. **Grounding check**(v0 선택, v1 권장): 답을 원자적 claim으로 분해하고 각각이 인용된 evidence에 의해 entail되는지 검증; grounding score를 노출
   (`TODO(open-question: grounding-check engine — v0 vs v1; LLM cost/boundary)`).
6. **보존된 synthesis는 cited `Note`로 저장된다**(`generated: true`), **결코** `Evidence`로 저장되지 않는다
   ([ADR-0004](../01-decisions/ADR-0004-provenance-and-trust_ko.md) evidence gate;
   [./ingestion-pipeline_ko.md](./ingestion-pipeline_ko.md) A5).

CAW-03(별개 제품)로의 cited 번들 export는 **fail-closed export allow-list**를 통과한다
([ADR-0007](../01-decisions/ADR-0007-import-export-contracts_ko.md)) — retrieval의 boundary 필터가 첫 번째 gate, export allow-list가 두 번째다.

## 예약된 vector sidecar + 임베딩 추가 트리거
스키마는 **nullable `node_vec` sidecar**(FTS처럼 별도의 폐기 가능한 migration)를 예약하여 `sqlite-vec`(SQLite) 또는 `pgvector`(Postgres) 추가가 **rewrite가 아니라 추가적**이게 한다(brief §6). v0 규모에서는 brute-force 유사도로 충분하다 — **ANN 튜닝 없음**. 임베딩은 **측정된** 트리거가 발화할 때만 채택된다:

| Trigger | Signal (measured, not speculative) |
|---|---|
| **A — recall gap** | FTS가 큐레이터가 존재함을 아는 항목을 반복적으로 놓침(어휘/동의어 불일치) |
| **B — corpus diversity** | source가 충분히 많은 하위 도메인에 걸쳐 공유 어휘가 무너짐 |
| **C — agent/NL queries** | 에이전트가 개념적 질문("X와 관련된 evidence")을 하는데 FTS가 under-recall함 |
| **D — cross-lingual / heavy synonymy** | 그러한 콘텐츠가 나타남 |

트리거가 발화하기 전까지는 FTS 품질에 투자한다(토큰화, 동의어 목록, "poor-man's semantics"로서의 `Concept`/`Interest` 태그, 구조적 필터). 임베딩이 도착하면:
**Hybrid(RRF로 융합된 FTS + vector) → 융합된 top-N에 대한 선택적 cross-encoder reranker**가 **v1**이며, 동일한 `search()` 인터페이스 뒤에서 측정된 recall/precision이 필요할 때만 적용된다. `node_vec`은 nullable로 유지되어 미임베딩 항목이 migration 내내 FTS로 검색 가능하다.

## Open Questions
[../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md)와
[ADR-0006](../01-decisions/ADR-0006-retrieval_ko.md)를 참조:
- `TODO(open-question: embedding model & locality — local vs API; does API embedding violate confidential-boundary rules?)`
- `TODO(open-question: re-embedding policy on model upgrades / edited items without stale vectors)`
- `TODO(open-question: grounding-check engine — automated claim-entailment in v0 or v1)`
- `TODO(open-question: chunking unit — whole Claim/Note rows vs sub-chunk long sources; anchor storage)`
- `TODO(open-question: synonym/concept tagging investment to delay embeddings)`

## runbook에 대한 함의
- **RB (data-layer):** `boundary`, `visibility`, `kind`, `trust`, `status`, entity-link 컬럼을 갖춘 FTS5 가상 테이블(또는 `tsvector` + GIN); nullable `node_vec` sidecar 예약(v0에서 미사용); 둘 다 결정론적 reindex로 재빌드되는 폐기 가능한 migration.
- **RB (retrieval service):** `search()` → `RetrievalHit` 봉투; 조립 **이전** boundary/scope 필터; 노드별 boundary 재검사를 갖춘 edge 순회 체인 hydration.
- **RB (RAG/synthesis):** citation-constrained `{answer_claims[], evidence[], unsupported[]}`; 인용 없는 claim 거부/표시; 보존된 synthesis를 cited `Note`로 영속화, 결코 `Evidence`로는 안 함; export 경로는 fail-closed allow-list 통과.
- **RB (interfaces):** API/MCP/CLI(얇은 어댑터)가 봉투를 반환; 뷰어가 claim↔evidence 링크 + trust를 렌더링; 기본 응답은 retrieval-only(생성 없음)일 수 있음.
- **RB (v1 upgrade):** 동일한 `search()` 뒤에 임베딩 추가; RRF 융합 + 선택적 rerank; 측정된 트리거 A–D에 gate.
