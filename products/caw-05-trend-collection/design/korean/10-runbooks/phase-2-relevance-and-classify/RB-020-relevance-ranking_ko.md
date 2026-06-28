# RB-020: BM25-first additive explainable relevance + recall-first floor로 finding scoring

- **Status:** ready
- **Phase:** phase-2-relevance-and-classify
- **Depends on:** [RB-010 (interest store + compiler), RB-011 (SourceAdapters + dedup), RB-012 (FILES-AS-TRUTH store + SQLite index)]
- **Implements design:** [../../05-radar-core/interest-model.md](../../05-radar-core/interest-model_ko.md), [../../01-decisions/ADR-0002-interest-model.md](../../01-decisions/ADR-0002-interest-model_ko.md), [../../09-roadmap/milestones-and-phases.md](../../09-roadmap/milestones-and-phases_ko.md) (P2)
- **Produces:** Run의 **score 단계**: 각 deduped `Finding`에 `relevance`, `relevance_explain[]`, `matched_watch_list[]`를 주석하는 `RelevanceScorer`; finding에 대한 SQLite **FTS5** index; **recall-first floor** 게이트; 기본 OFF로 flag된 embedding lane seam.

## Objective
"Done" = Run의 작업 집합에 있는 모든 deduped finding이 `relevance` float와 additive하고 사람이 읽을 수 있는
`relevance_explain[]` (matched interest/lane당 한 행, raw + contribution 포함), 그리고 `matched_watch_list[]`를
지닌다. Score는 **immutable finding에 대한 metadata**다 — scorer는 source text를 절대 다시 쓰지 않는다 (brief
§12). Score는 **survival이 아니라 ordering**을 관장한다: `recall_priority: high` watch list interest에 hit한
finding은 surface-not-drop으로 표시되어 downstream classify/triage 단계가 절대 조용히 폐기할 수 없다. 척추는
exact/alias + BM25 (SQLite FTS5)다; embedding lane은 `enable_embeddings: false` / `α: 0.0` 뒤에 연결되어 v1에서
아무것도 기여하지 않는다. Ranking은 파일로부터 reproducible하다.

## Preconditions
- [ ] P1 exit gate 충족: `interests.yaml`에서 컴파일된 `interests.json` (버전화됨), brief §6에서
      `recall_priority: high`인 `memory-centric-dse` watch list로 시드됨.
- [ ] Deduped finding이 title/abstract/body field와 provenance (origin/date/retrieval)를 갖춘 `findings/*.json`로
      존재; dedup은 CORE에서 실행됨 (RB-011).
- [ ] RB-012의 SQLite index가 build 가능; FTS5가 SQLite build에 컴파일됨 (시작 전 검증).
- [ ] Tree가 green (컴파일됨, lint 통과).

## Steps

1. **finding에 대한 FTS5 index 구축.**
   - **Do:** 가상 테이블 `findings_fts USING fts5(finding_id UNINDEXED, title, abstract, body)`를 column ranking
     weight title>abstract>body로 생성한다 (query 시점에 `bm25(findings_fts, w_title, w_abstract, w_body)`로
     적용, weight는 상수가 아니라 config에). derived cache로서 `findings/*.json`에서 populate한다 (파일로부터
     rebuild 가능 — 절대 source of truth 아님).
   - **Verify:** `SELECT count(*) FROM findings_fts`가 deduped finding 수와 일치; index를 삭제하고
     `findings/*.json`에서 rebuild하면 동일한 행이 산출.

2. **exact/alias match lane 구현 (core).**
   - **Do:** 각 interest에 대해 `terms` + `aliases` (case-insensitive, acronym variant 예: `Mem-OS`/`MemOS`)를
     title/abstract/body에 대해 match한다. 정규화된 `[0,1]` lane score와 설명을 위한 matched surface form을 emit.
   - **Verify:** title에 `MemOS`를 포함한 finding이 matched term을 명명하는 explain 행
     `{interest_id: int-memos, lane: exact, raw, contribution>0}`을 산출.

3. **BM25 lexical lane 구현 (core).**
   - **Do:** **positive** interest term에서 OR-expansion FTS5 query를 구축한다; `bm25()`를 실행한다. FTS5
     `bm25()`는 **negative**다 (더 relevant = 더 negative) → **negate한 뒤 batch별 min-max로 [0,1] 정규화**하여
     contribution이 lane 간 및 batch 간 비교 가능하게 한다. term별 tf/idf 세부사항을 설명으로 carry한다.
   - **Verify:** finding A가 watch list term 3개를, B가 1개를 포함하는 2-finding fixture에서, A의 정규화된
     BM25 lane score > B의 것; 정규화된 값은 [0,1]에 있음.

4. **entity/author/venue lane 구현 (core).**
   - **Do:** adapter가 구조화된 metadata (author/venue id)를 공급했을 때, interest `canonical_id` (예: Minsoo Rhu
     authorId)에 대해 match한다. lane score를 emit하고 entity를 명명한다. `canonical_id`이 TODO/null인 경우,
     name-string match로 fallback하되 더 낮은 confidence로 flag한다.
   - **Verify:** 구성된 Rhu `canonical_id`이 저자인 finding이 explain 행 `{lane: entity, interest_id: int-rhu}`을
     산출; id 없는 동명 저자는 high-confidence entity hit을 산출하지 않음.

5. **additive scoring contract 연결.**
   - **Do:** `relevance = Σ_positive[weight × lane_score × decay_factor] − Σ_negative[weight × lane_score] +
     α × embedding_lane`를 `α = 0` 기본으로 계산한다. `relevance_explain[]`를
     `{interest_id, type, lane, raw, contribution}`로 **contribution 내림차순 정렬**하여 emit하고,
     `matched_watch_list[]`를 emit한다. interest별 `decay`를 적용한다. negative-polarity match는
     **negative contribution (demote)**을 산출하지만 ADR-0002에 따라 절대 삭제하지 않는다.
   - **Verify:** 손수 만든 finding에 대해, `relevance_explain[]`의 `contribution` field를 합산하면 `relevance`와
     같음 (float 허용오차 내); negative-polarity match는 negative contribution을 보이고 finding을 낮추되
     zero/drop하지 않음.

6. **recall-first floor 강제 (surface-not-drop).**
   - **Do:** `recall_priority: high` watch list의 interest를 ≥1개 match하는 모든 finding에 **score와 무관하게**
     (score가 0에 가까워도) `surface_not_drop: true`를 설정한다. 이 flag는 RB-022의 routing/discard가 반드시
     준수해야 할 contract다. tie-break ordering: recency, 그다음 match된 distinct interest 수.
   - **Verify:** 단일 low-weight `memory-centric-dse` hit이 있고 그 외 score가 낮은 finding이 여전히
     `surface_not_drop: true`를 지니고 ranked output에 나타남 (필터링되지 않음).

7. **embedding lane seam 연결 (OFF, gated).**
   - **Do:** config `enable_embeddings: false`, `α: 0.0`을 추가한다. off일 때 lane은 0을 기여하고 dependency를
     추가하지 않는다. explain 형태를 reserve한다: 켜질 경우, nearest interest + `"semantic"`으로 label된 cosine을
     report — 절대 맨숫자 아님. 활성화하려면 label된 eval set이 필요함을 문서화한다 (P7 alpha gate).
   - **Verify:** 기본값에서, embedding code path 존재 여부와 무관하게 score가 동일 (α=0); embedding model 로드
     안 됨; unit test가 `α==0` ⇒ embedding contribution == 0을 assert.

8. **score를 immutable-finding metadata로 영속화.**
   - **Do:** `relevance`, `relevance_explain[]`, `matched_watch_list[]`, `surface_not_drop`를 finding의 annotation
     layer (sidecar field / metadata block)에 쓰며, raw `title/abstract/body`를 절대 변형하지 않는다. scorer
     재실행은 고정된 `interests.json` 버전에 대해 idempotent하다.
   - **Verify:** scoring 전후 raw source field의 byte-diff가 변화 없음을 보임; 같은 입력에 대한 연속 두 scorer
     실행이 동일한 `relevance` 값을 산출.

## Acceptance criteria
- [ ] 모든 deduped finding이 `relevance`를 지니며, interest가 match되면 비어있지 않은 `relevance_explain[]`을
      contribution 순으로 지님.
- [ ] `Σ contribution == relevance`가 fixture에서 성립 (구성상 additive/explainable).
- [ ] FTS5 `bm25()`가 negate + batch별 min-max 정규화됨; lane score ∈ [0,1].
- [ ] Recall floor: 모든 `recall_priority: high` hit ⇒ `surface_not_drop: true`, score와 무관.
- [ ] Embedding lane이 OFF (`enable_embeddings:false`, `α:0`)이고 0 기여를 입증; embedding dependency 로드 안 됨.
- [ ] Scorer는 순수 annotation layer (raw source byte 불변)이며 파일로부터 reproducible.
- [ ] 이 checkpoint에서 tree가 green.

## Rollback / safety
- FTS5 index와 모든 score annotation은 **derived**다; index를 삭제하고 annotation block을 strip하면 pre-RB-020
  state로 복귀 — `findings/*.json` raw content는 건드리지 않음.
- 정규화가 의심스러우면, 설명만 emit하고 영속화하지 않는 `--no-score` dry-run 뒤에 scorer를 게이트하고, 비교한 뒤
  commit한다.
- 여기서 embedding lane을 절대 활성화하지 말 것; P7 label된 eval set 없이 `α`를 올리는 것은 ADR-0002 위반.

## Hand-off
RB-021 (classification cascade)은 각 finding이 `relevance{score, explain[], matched_watch_list,
surface_not_drop}`를 안정적이고 immutable한 metadata로 지니며 downstream에서 verbatim하게 렌더됨을 가정할 수
있다. RB-022의 routing은 `surface_not_drop`를 완화해서는 안 되는 recall-first floor로 상속한다. embedding seam은
재설계 없이 P7을 위해 존재한다.
