# RB-031: provenance chain을 RetrievalHit으로 hydrate하고 citation-constrained RAG 구축

- Status: ready
- Phase: phase-3-retrieval
- Depends on: [RB-030 (FTS5/BM25 + structured filters → `searchCandidates()`), RB-020 (core op manifest + `synthesize_note` + structural evidence gate), RB-011 (generic `edge` table)]
- Implements design:
  - [../../01-decisions/ADR-0006-retrieval_ko.md](../../01-decisions/ADR-0006-retrieval_ko.md) §3, §4, §5
  - [../../05-knowledge-core/retrieval_ko.md](../../05-knowledge-core/retrieval_ko.md) ("Provenance-chain hydration", "Citation-constrained RAG")
  - [../../07-backend-api/retrieval-service_ko.md](../../07-backend-api/retrieval-service_ko.md) Stages 4–6 + "Boundary & failure guarantees"
  - [../../01-decisions/ADR-0004-provenance-and-trust_ko.md](../../01-decisions/ADR-0004-provenance-and-trust_ko.md) (evidence gate; summary ≠ evidence)
  - [../../05-knowledge-core/ingestion-pipeline_ko.md](../../05-knowledge-core/ingestion-pipeline_ko.md) (A5 synthesize cited note)
- Produces:
  - `RetrievalHit` envelope를 반환하는 `search()`/`get()`: item + hydrate된 `Source→Claim→Evidence→Note` chain + trust + effective boundary + scope + locator + score.
  - **node마다 viewer gate를 재적용**하는 재귀 edge-traversal hydrator(viewer가 볼 수 없는 node로의 dangling reference 없음).
  - `answer()`: citation-constrained RAG로 `{ answer_claims[], evidence[], unsupported[] }`를 반환 — claim+evidence 단위이며 절대 불투명한 blob이 아님. 모든 claim은 retrieve된 단위를 ID로 ≥1개 인용한다.
  - **유지(kept)**된 synthesis가 core `synthesize_note` op를 통해 cited `Note`(`generated=true`)로 기록되는 persist 경로 — **절대** `Evidence`로 기록되지 않음.

## Objective
"완료"의 의미: RB-030의 search seed가 `RetrievalHit`으로 hydrate되며, 그 `chain`은 타입 지정 `edge` table(`evidence_for`/`extracted_from`/`cites`/`about_concept`)을 따라 `Source→Claim→Evidence→Note`를 조립하되, viewer boundary/scope gate가 **모든 hydrate된 node에서 재적용**되어 seed가 허용 가능했더라도 chain이 절대 confidential/private node를 표면화할 수 없다. 기본 응답은 retrieval-only이다(provenance를 가진 순위 claim+evidence). opt-in `answer()`는 citation-constrained synthesis를 수행한다: boundary filter 먼저, 모든 synthesize된 claim은 retrieve된 단위를 ID로 ≥1개 인용하고, 미인용 claim은 거부되거나 `unsupported`로 flag되며(절대 fact로 주장되지 않음), 출력은 구조화되고, **유지**된 synthesis는 core evidence gate를 통해 cited `Note`(`generated=true`)로 영속화된다 — `Evidence`로 저장하는 것이 구조적으로 불가능하다.

## Preconditions
- [ ] RB-030 acceptance 충족: `searchCandidates()`가 `score`, `trust`, `boundary`, `visibility`를 가진 boundary-safe한 filter-before-rank seed를 반환한다.
- [ ] RB-020 acceptance 충족: core `synthesize_note` op이 존재하며 구조적 evidence gate를 경유한다(`attach_evidence`에 prose 없음, `artifact_ref`가 반드시 resolve됨, `generated=true`인 Note는 절대 Evidence node가 될 수 없음).
- [ ] generic `edge` table이 provenance relation(`evidence_for`, `extracted_from`, `cites`, `about_concept`/`about`)을 `src_id`, `dst_id`, `rel`과 함께 지닌다(ADR-0003).
- [ ] `node`가 row마다 effective(monotone-propagated) `boundary`와 `content_hash`를 지닌다(ADR-0002/0004).
- [ ] RB-030의 fixture corpus에 더해, boundary가 섞인 완전한 `Source→Claim→Evidence→Note` chain이 최소 하나 존재한다(예: 허용 가능한 Claim이되 Evidence가 `confidential`인 경우).

## Steps

1. **node마다 viewer gate를 두는 재귀 chain hydrator를 구현한다.**
   - Do: 각 seed에 대해 recursive CTE로 `edge` table을 따라 `Source→Claim→Evidence→Note` chain을 구축하고, 각 link에 `trust`와 `boundary`를 실으며 `:max_depth`로 제한한다. traversal 내부에서 viewer gate를 재적용하여, viewer가 볼 수 없는 link는 **dangling reference로 반환하지 않고 drop**한다:
     ```sql
     WITH RECURSIVE chain(id, kind, rel, depth) AS (
       SELECT :seed_id, kind, NULL, 0 FROM node WHERE id = :seed_id
       UNION ALL
       SELECT e.dst_id, n.kind, e.rel, c.depth+1
       FROM chain c
       JOIN edge e ON e.src_id = c.id
       JOIN node n ON n.id = e.dst_id
       WHERE c.depth < :max_depth
         AND n.boundary <= :viewer_max_boundary
         AND (n.visibility = 'team' OR n.owner = :viewer)
     )
     SELECT * FROM chain;
     ```
   - Verify: boundary가 섞인 fixture chain에서, Evidence의 boundary보다 낮은 viewer는 Claim을 얻되 confidential Evidence link는 **부재**한다(placeholder 아님). 완전히 권한이 있는 viewer는 완전한 chain을 얻는다.

2. **`RetrievalHit` envelope를 조립한다(절대 단순 문자열 아님).**
   - Do: [retrieval-service_ko.md](../../07-backend-api/retrieval-service_ko.md) Stage 5에 따라 `RetrievalHit { item{id,kind,title?,text?}, chain[{id,kind,rel?}], trust, boundary (effective), scope, locator{source_uri,location?}, score{fts_rank, vector_sim?, rerank?} }`를 구축한다. `locator`는 Evidence가 물리적으로 존재하는 곳(path/URI)으로 resolve되며, 추론이 아니라 실려 온다.
   - Verify: `search()`는 envelope 목록을 반환한다. `get(id)`는 완전히 hydrate된 envelope 하나를 반환한다. 어떤 코드 경로도 평범한 문자열을 반환하지 않는다. schema 테스트로 필수 필드 존재를 assert한다.

3. **stale-index guard를 추가한다.**
   - Do: hydrate된 row에서 `content_hash`를 md-git source와 비교한다. 불일치 시 인덱스를 stale로 취급하여 → rebuild(reindex)를 신호한다. 절대 조용히 신뢰하지 않는다(design "Boundary & failure guarantees").
   - Verify: row의 `content_hash`를 손상시키면 hit이 authoritative로 반환되는 대신 stale로 flag되거나 rebuild를 트리거한다.

4. **retrieval-only를 기본 응답으로 만든다.**
   - Do: 기본 `search()`가 provenance를 가진 순위 claim+evidence를 반환하고 **어떤** 생성도 수행하지 않도록 보장한다. 생성은 오직 명시적 `answer()` 진입점을 통해서만 도달 가능하다.
   - Verify: `search()` 호출이 어떤 LLM/synthesis 코드 경로도 호출하지 않는다(no-generation 테스트/spy로 assert).

5. **`answer()` citation-constrained synthesis를 구현한다.**
   - Do: [retrieval-service_ko.md](../../07-backend-api/retrieval-service_ko.md) Stage 6 / ADR-0006 §5에 따라:
     1. boundary/scope gate를 **먼저** 실행한다(RB-030 filter + 1단계 hydration 재사용, 절대 생성 후 filter하지 않음);
     2. synthesizer에 **provenance를 지닌 단위**(parent ID + `boundary` + `trust` + `locator`를 가진 `Claim`/`Evidence`/`Note` row)만 공급한다, 절대 불투명한 chunk가 아님;
     3. 모든 synthesize된 claim이 retrieve된 단위를 `Id`로 ≥1개 `cites`하도록 요구한다. 미인용 claim은 **거부되거나 `unsupported`로 라우팅**되며 절대 fact로 반환되지 않는다;
     4. 구조화된 출력을 반환한다:
        ```ts
        type AnswerResult = {
          answer_claims: { text: string; cites: Id[] }[]
          evidence:      { id: Id; source: string; boundary: Boundary; trust: Trust; locator: string }[]
          unsupported:   { text: string }[]
          note_id?: Id   // present only if persist_as_note:true
        }
        ```
   - Verify: 유효한 `cites`가 없는 synthesize된 claim은 `answer_claims`가 아니라 `unsupported`에 안착한다. 모든 `cites` ID는 `evidence[]`의 단위로 resolve된다. 어떤 `evidence[]` 항목도 viewer의 boundary를 초과하지 않는다.

6. **유지된 synthesis를 evidence gate를 통해 cited Note로 영속화한다 — 절대 Evidence로 하지 않는다.**
   - Do: `persist_as_note:true`일 때, 유지된 synthesis를 core `synthesize_note` op(RB-020)을 통해 기록하여 사용한 Claim/Evidence로의 citation을 지닌 `Note`(`generated=true`)를 생성하고 `note_id`를 설정한다. 오직 ingest evidence gate를 경유한다 — 이것이 retrieval 경로가 일으킬 수 있는 유일한 쓰기이다.
   - Verify: 영속화된 item은 `knowledge/notes/` 아래의 `Note`(`generated=true`)이다. 이를 `Evidence`로 영속화하려는 시도는 모든 layer에서 gate에 의해 거부된다. reindex가 이를 집어 들며 citation chain과 함께 retrieve된다. `generated`/`evidence=false` Note가 절대 Evidence로 반환되지 않음을 테스트로 assert한다.

7. **Boundary & failure guarantee 테스트.**
   - Do: design guarantee table을 커버한다: confidential leak 없음(WHERE의 gate + hydration에서 재적용), private-to-team leak 없음, summary≠evidence(유지된 synthesis는 오직 Note만), stale-index safety(`content_hash` 불일치 ⇒ rebuild), 검사 가능한 ranking(모든 hit에 `score`).
   - Verify: 모든 guarantee 테스트 통과. hydration gate를 약화하면 confidential-chain 테스트가 실패한다(실재함을 증명).

8. **export hand-off를 명시한다(여기서 export를 구축하지 않음).**
   - Do: CAW-03(별개 제품)으로 export되는 cited bundle이 **첫 번째** gate로 retrieval의 boundary filter를, **두 번째** gate로 fail-closed export allow-list(ADR-0007, phase-5)를 통과함을 문서화한다 — export 자체는 phase-3 범위 밖이다.
   - Verify: 이 runbook에 export 코드가 추가되지 않는다. ADR-0007 / phase-5로의 cross-link이 존재한다.

## Acceptance criteria
- [ ] `search()`/`get()`이 hydrate된 `Source→Claim→Evidence→Note` chain을 가진 `RetrievalHit` envelope를 반환한다. 절대 단순 문자열 아님.
- [ ] viewer boundary/scope gate가 **모든 hydrate된 node에서 재적용**된다. confidential/private chain link는 seed가 허용 가능할 때조차 절대 표면화되지 않는다. drop된 link는 부재한다(dangling reference 없음).
- [ ] 기본 응답은 retrieval-only이다. 생성은 오직 명시적 `answer()`를 통해서만 발생한다.
- [ ] `answer()`는 `{ answer_claims, evidence, unsupported }`를 반환한다. 모든 `answer_claims[].cites`가 resolve된다. 미인용 claim은 `unsupported`로 flag되며 절대 주장되지 않는다. 출력은 claim+evidence 단위이며 절대 불투명한 blob이 아니다.
- [ ] 유지된 synthesis는 오직 core evidence gate를 통해 cited `Note`(`generated=true`)로만 영속화된다. 이를 `Evidence`로 저장하는 것은 모든 layer에서 거부된다.
- [ ] stale-index guard(`content_hash` 불일치)는 stale row 반환 대신 rebuild를 트리거한다. 모든 hit에 `score`가 존재한다.
- [ ] 이 checkpoint에서 Tree가 green이다(build + lint + 테스트).

## Rollback / safety
- Hydration과 `search()`/`get()`은 폐기 가능한 SQLite 인덱스에 대한 read-only이다. 실패가 md-git을 손상시킬 수 없다. 인덱스를 drop하고 reindex하여 복구한다.
- 유일한 쓰기 경로(`answer(persist_as_note:true)`)는 core `synthesize_note` evidence gate를 경유한다. synthesis 동작이 의심스러우면, 저장된 knowledge를 건드리지 않고 `persist_as_note`를 비활성화한다(retrieval-only는 여전히 동작).
- Fail closed: node별 hydration gate나 citation 검사를 검증할 수 없으면, boundary leak이나 미인용 claim의 fact 주장 위험을 무릅쓰기보다 retrieval-only를 반환하거나 검증 불가능한 link를 drop한다.

## Hand-off
- Phase-4(surfaces)는 다음을 가정할 수 있다: 얇은 API/MCP/CLI adapter가 `RetrievalHit` envelope와 `AnswerResult`를 그대로 반환한다. read-only viewer가 envelope로부터 Claim↔Evidence link + trust/boundary 배지를 렌더링한다.
- Phase-5(import/export)는 다음을 가정할 수 있다: retrieval의 boundary filter가 첫 번째 export gate이다. CAW-03으로의 cited bundle은 hydrate된 claim+evidence 결과이며, 그다음 fail-closed allow-list(ADR-0007)를 통과한다.
- v1 upgrade는 다음을 가정할 수 있다: embedding이 동일한 `search()`/`answer()` 뒤로 끼워진다(RRF fusion + 선택적 rerank, 측정된 trigger A–D에 게이트됨). `node_vec`(RB-030에서 예약)는 nullable로 유지되어 embedding되지 않은 item도 retrieve 가능하게 남는다.
