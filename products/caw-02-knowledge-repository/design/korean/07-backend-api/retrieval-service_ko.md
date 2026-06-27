# Retrieval Service — FTS + Filters + Provenance Hydration + Citation Assembly

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [./api-surface_ko.md](./api-surface_ko.md)
  - [./persistence-and-index_ko.md](./persistence-and-index_ko.md)
  - [./ingestion-service_ko.md](./ingestion-service_ko.md)
  - [../01-decisions/ADR-0006-retrieval_ko.md](../01-decisions/ADR-0006-retrieval_ko.md)
  - [../01-decisions/ADR-0004-provenance-and-trust_ko.md](../01-decisions/ADR-0004-provenance-and-trust_ko.md)
  - [../01-decisions/ADR-0002-storage_ko.md](../01-decisions/ADR-0002-storage_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF_ko.md

## Purpose
**`RetrieveService` 뒤의 서비스**([api-surface.md](./api-surface_ko.md))를 기술한다: 쿼리가 어떻게
boundary-safe하고 provenance를 담은 결과가 되는지. ADR-0006을 부연한다 — FTS5/BM25 텍스트 retrieval, 랭킹
**이전에** 적용되는 일급(first-class) 구조화 필터, edge-traversal chain hydration, 그리고 citation-constrained
synthesis. 저장 substrate(ADR-0002 / [persistence-and-index.md](./persistence-and-index_ko.md))나 trust/boundary
어휘(ADR-0004)는 결정하지 **않는다**. **v0에는 embedding 없음** — vector 경로는 예약되어 있을 뿐 구축되지 않는다.

## Pipeline overview

```
query ──▶ (1) parse + filter plan
       ──▶ (2) BOUNDARY/SCOPE gate  ── pre-ranking, in SQL WHERE  (never after)
       ──▶ (3) FTS5 BM25 rank over the filtered candidate set
       ──▶ (4) chain hydration via edge traversal (Source→Claim→Evidence→Note)
       ──▶ (5) RetrievalHit envelope (item + chain + trust + boundary + locator + score)
       ──▶ (6 opt) citation-constrained synthesis (answer)  → cited Note if persisted
```

순서가 load-bearing(필수적)이다: **boundary/scope 필터가 랭킹과 조립 이전에 실행되므로** confidential이나
`private` 항목은 그것을 볼 수 없는 viewer에 대해 점수조차 매겨지지 않는다(ADR-0006 §2, brief §6/§10).

## Stage 1 — query + filter plan

```ts
type SearchInput = {
  q: string
  filters?: {
    boundary?: Boundary[]; scope?: Scope[]
    kind?: Kind[]; trust?: Trust[]; concept?: Id[]; interest?: Id[]
  }
  limit?: number                     // default TODO(open-question: page size)
  viewer: { actor: Actor; max_boundary: Boundary; scope: Scope }
}
```

`viewer.max_boundary`/`viewer.scope`는 선호가 아니라 **권한(authority)**이다: gate가 반환할 것을 제한하며,
`filters`와 무관하다(filters는 viewer가 이미 볼 수 있는 것 안에서만 좁힐 뿐이다).

## Stage 2 — boundary/scope gate (랭킹 이전)

모든 필터는 관계형 index 컬럼(ADR-0002 코어 `node` 테이블: `boundary`, `visibility`, `kind`, `trust`)에 대한 단일
SQL `WHERE`로 컴파일된다. viewer gate는 **항상** AND로 결합되며 호출자가 넓힐 수 없다:

```sql
WHERE node.boundary <= :viewer_max_boundary          -- public<internal<confidential ordering
  AND (node.visibility = 'team' OR node.owner = :viewer)   -- private only to owner
  AND (:kind IS NULL OR node.kind IN (:kind))
  AND (:trust IS NULL OR node.trust IN (:trust))
  -- concept/interest via edge join (rel='about')
```

여기서의 boundary는 행 자체의 플래그가 아니라 `BoundaryService`가 계산한 **effective** boundary다(단조 전파,
ADR-0004) — Note는 자신이 인용하는 것의 가장 엄격한 boundary를 상속한다. `jimmy-private` 항목은 team viewer에게
절대 나타나지 않는다.

## Stage 3 — FTS5 BM25 ranking

텍스트 retrieval은 관계형 index와 함께 위치한 별도의 drop 가능한 migration 내의 **SQLite FTS5 (BM25)**다
(ADR-0006 §1, ADR-0002 §3). 랭킹은 이미 필터링된 후보 집합에 대해 이뤄진다:

```sql
SELECT node.id, bm25(fts) AS fts_rank
FROM fts JOIN node ON node.rowid = fts.rowid
WHERE fts MATCH :q AND <boundary/scope/filter predicate>
ORDER BY fts_rank
LIMIT :limit;
```

랭킹은 **결정론적이고 검사 가능(inspectable)**하다 — `score`가 모든 hit에 반환된다. FTS 품질 투자(tokenization,
synonym 리스트, "poor-man's semantics"로서의 `Concept`/`Interest` 태그)는 측정된 trigger가 발화하기 전까지
embedding을 대체한다(ADR-0006 trigger A–D). 예약된 `node_vec` sidecar는 v0에서 미사용이다; 나중에
`sqlite-vec`/`pgvector`를 추가하는 것은 동일한 `search()` 뒤에서 가산적(additive)이다(재작성 없음).

## Stage 4 — provenance/chain hydration (항상 켜짐)

텍스트 retrieval은 **seed(씨앗)**를 찾는다; edge traversal이 그것을 answer로 만든다. 살아남은 각 hit에 대해
서비스는 타입이 지정된 `edge` 테이블을 순회한다(SQLite에서는 recursive CTE; Apache AGE 이식 후에는 openCypher
— 동일한 edge, ADR-0002). 이로써 `Source → Claim → Evidence → Note` chain을 hydrate하며 각 링크에 `trust`와
`boundary`를 실어 나른다. Hydration은 **viewer gate를 재적용**한다: viewer가 볼 수 없는 chain 링크는 버려지며,
절대 dangling reference로 반환되지 않는다.

```sql
WITH RECURSIVE chain(id, kind, rel, depth) AS (
  SELECT :seed_id, kind, NULL, 0 FROM node WHERE id = :seed_id
  UNION ALL
  SELECT e.dst_id, n.kind, e.rel, c.depth+1
  FROM chain c JOIN edge e ON e.src_id = c.id JOIN node n ON n.id = e.dst_id
  WHERE c.depth < :max_depth AND n.boundary <= :viewer_max_boundary
)
SELECT * FROM chain;
```

## Stage 5 — RetrievalHit envelope

결과는 ADR-0006 §4의 구조화된 envelope이다 — **절대 맨 문자열(bare string)이 아니다**:

```ts
type RetrievalHit = {
  item:     { id: Id; kind: Kind; title?: string; text?: string }
  chain:    { id: Id; kind: Kind; rel?: Rel }[]   // hydrated Source→Claim→Evidence→Note
  trust:    Trust                                  // carried from index, not inferred at query time
  boundary: Boundary                               // effective; enforced pre-return
  scope:    Scope
  locator:  { source_uri: string; location?: string }   // where evidence physically lives
  score:    { fts_rank: number; vector_sim?: number; rerank?: number }
}
```

`get(id)`는 완전히 hydrate된 단일 hit를 반환한다. viewer(read-only surface)는 이 envelope로부터 Claim↔Evidence
링크와 trust/boundary 배지를 렌더링한다(ADR-0001 §7).

## Stage 6 — citation-constrained synthesis (`answer`, opt-in)

기본 동작은 **retrieval-only**(랭킹된 claim+evidence 반환, 생성 없음)이다. 생성이 opt-in되면
(`RetrieveService.answer`), RAG는 provenance retrieval + citation-constrained synthesis다(ADR-0006 §5):

1. boundary/scope gate가 먼저 실행된다(절대 생성 이후가 아니다);
2. synthesize된 모든 claim은 `Id`로 retrieve된 단위를 ≥1개 `cites`해야 한다; **인용되지 않은 claim은 거부되거나
   `unsupported`로 표시**되며, 절대 사실로 반환되지 않는다;
3. 출력은 prose가 아니라 구조화되어 있다:

```ts
type AnswerResult = {
  answer_claims: { text: string; cites: Id[] }[]
  evidence:      { id: Id; source: string; boundary: Boundary; trust: Trust; locator: string }[]
  unsupported:   { text: string }[]
  note_id?: Id   // present only if persist_as_note:true
}
```

4. **유지된(kept)** synthesis는 `IngestService.synthesize_note`를 통해 `generated=true`인 cited `Note`로
   저장된다([ingestion-service.md](./ingestion-service_ko.md)) — **절대 `Evidence`로는 아니다**(evidence gate).
   이것이 retrieval 경로가 유발할 수 있는 유일한 write이며, 다른 모든 write처럼 ingest evidence gate를 거친다.

## Boundary & failure guarantees

| 보장 | 메커니즘 |
|---|---|
| confidential leak 없음 | SQL `WHERE`의 viewer gate, 랭킹 이전 + hydration에서 재적용 |
| team으로의 private leak 없음 | `owner == viewer`가 아니면 `visibility='private'` 행 제외 |
| Summary ≠ evidence | `generated`/`evidence=false` Note는 절대 Evidence로 반환되지 않음; `answer`는 유지물을 Note로만 저장 |
| Stale index 안전성 | hydrate된 행의 `content_hash` 불일치 ⇒ index를 stale로 간주 ⇒ rebuild(ADR-0002 §2); 절대 무조건 신뢰 안 함 |
| 검사 가능한 랭킹 | 모든 hit에 `score` 반환 |

## Open Questions
- `TODO(open-question: default/max page size and pagination cursor shape)`
- `TODO(open-question: chunking unit — whole Claim/Note rows vs sub-chunked long Sources; anchor storage — ADR-0006)`
- `TODO(open-question: grounding/entailment check engine for synthesis claims in v0 vs v1 — ADR-0006)`
- `TODO(open-question: embedding model & locality when triggers A–D fire — ADR-0006)`
- [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) 참조.

## Implications for runbooks
- **RB (data-layer):** FTS5 가상 테이블 + 필터 컬럼 + 예약된 nullable `node_vec` sidecar(v0 미사용).
- **RB (retrieval service):** `RetrievalHit`을 반환하는 `search()`/`get()`; 조립 이전 boundary/scope 필터;
  viewer gate를 재적용하는 recursive-CTE chain hydration.
- **RB (RAG/synthesis):** `answer()`의 citation-constrained `{answer_claims, evidence, unsupported}`; 인용되지
  않은 claim은 거부/표시; 유지물은 ingest evidence gate를 거쳐 cited `Note`로 저장, 절대 `Evidence`로는 아님.
- **RB (interfaces):** API/MCP/CLI는 envelope를 반환; viewer는 claim↔evidence + trust/boundary 배지를 렌더링.
