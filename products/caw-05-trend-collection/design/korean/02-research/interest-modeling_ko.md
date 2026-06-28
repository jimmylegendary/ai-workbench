# Interest 모델링 및 관련성(Interest Modeling & Relevance)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF_ko.md), [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

이 문서는 CAW-05가 **interest를 어떻게 표현하고 갱신하는지**(키워드, 토픽, 엔티티, 저자, venue)와,
들어오는 finding을 좁은 watch list(Brief §6)에 대비해 랭킹/우선순위화하는 **설명 가능한 관련성 점수**를
어떻게 생성하는지를 결정한다. 세 가지를 제공한다: **Interest 스키마**, **관련성 랭킹 접근법**, **갱신
메커니즘**. 이는 Brief §10에서 지목한, 하중을 지탱하는 핵심(load-bearing core)이다.

이 문서는 다음을 다루지 **않는다**: source adapter/ingestion 메커니즘, classify 단계
(novelty-threat/support/adjacent/noise — 관련성 점수를 소비하지만 별개의 결정), related-work ledger,
저장/스케줄링, export 경계. 이들은 별개의 문서/ADR다. Brief §11/§12에 따라, v1은 **단순하고 설명 가능하며
좁은 리스트에 대해 high-recall**을 유지한다 — 무거운 ML 관련성 모델은 없다.

## 설계 힘(Design forces)

| Force | 이 문서에 대한 함의 |
|---|---|
| **좁은 watch list에 대한 high recall** (Brief §1, §19) | 관련성은 *필터링*보다 *노출*로 기울어야 함; threshold는 recall로 편향. interest는 학습된 프로필이 아니라 작은 큐레이션 집합. |
| **설명 가능** (Brief §11, §92) | 모든 점수는 명명된 기여 신호로 분해되어야 함("matched entity *MemOS*, author *Minsoo Rhu*"). 불투명한 단일 숫자 금지. |
| **v1 단순, 무거운 ML 없음** | Lexical/BM25 먼저; 임베딩은 의존성이 아니라 *선택적, 가산적* 신호. |
| **finding은 제안, Jimmy가 리뷰** (Brief §89, §99) | 갱신 메커니즘은 human-in-the-loop: Jimmy가 interest를 편집; 피드백은 가중치를 살짝 미는 것이지, watch list를 자동으로 재작성하지 않음. |
| **자체 저장소, markdown/JSON + 경량 인덱스** (Brief §7) | interest model은 CAW-05 자체 repo의 버전 관리된 JSON/YAML 파일; 인덱스는 SQLite FTS5(외부 서비스 불필요). |
| **생성된 요약은 증거가 아님** (Brief §97) | 관련성 점수는 *원시 finding*을 랭킹함; 점수는 메타데이터이지 결코 재작성된 소스 콘텐츠가 아님. |

## 1. Interest 스키마

interest는 작고, 손으로 큐레이션되며, **버전 관리되는** 타입된 항목 집합이다. 각 항목은 독립적으로 설명
가능하고 독립적으로 가중된다. 표현: 하나의 `interests.yaml`(사람이 편집)을 `interests.json`(기계가 소비)으로
컴파일. 읽기 쉽게 유지할 것 — 이것이 Jimmy의 제어 표면(control surface)이다.

```yaml
# interests.yaml — CAW-05 interest model (v1)
version: 3                      # 수락된 편집마다 증가; diff/rollback 가능
updated: TODO                   # 날짜를 만들어내지 말 것
watch_lists:
  - id: memory-centric-dse      # 좁은 레이더 (Brief §6). 추후 다중 리스트 허용.
    label: "Memory-centric DSE & LLM memory wall"
    default_weight: 1.0
    recall_priority: high       # high => 낮은 노출 threshold; 결코 소리 없이 버리지 않음

interests:
  - id: int-memos
    type: topic                 # enum: keyword | topic | entity | author | venue
    terms: ["MemOS", "memory operating system for LLM"]
    aliases: ["Mem-OS"]
    weight: 1.0                 # 관련성에 대한 기본 기여
    watch_list: memory-centric-dse
    polarity: positive          # positive | negative (negative = de-rank / noise 힌트)
    provenance: seed-brief-§6    # 이 interest의 출처 (감사 가능)
    decay: none                 # none | slow | fast — interest의 관련성 half-life
    notes: "novelty-threat candidate cluster"

  - id: int-rhu
    type: author
    terms: ["Minsoo Rhu"]
    canonical_id: "TODO(open-question: Semantic Scholar authorId / ORCID for disambiguation)"
    weight: 1.2                 # 지명된 인물 hit은 이 watch list에서 강한 신호
    watch_list: memory-centric-dse
    polarity: positive
    provenance: seed-brief-§6

  - id: int-ttt-writeback
    type: keyword
    terms: ["TTT writeback", "test-time training memory traffic", "test-time compute memory"]
    weight: 0.9
    watch_list: memory-centric-dse
    polarity: positive
    provenance: seed-brief-§6

  - id: int-llm-serving-sim
    type: topic
    terms: ["LLM serving simulation", "memory-hierarchy simulation", "Chakra trace workload"]
    weight: 0.8
    watch_list: memory-centric-dse
    polarity: positive
    provenance: seed-brief-§6

  - id: int-generic-llm-noise
    type: keyword
    terms: ["prompt engineering", "chatbot UX"]
    weight: 0.5
    polarity: negative          # watch list 밖의 일반적 LLM hype를 down-weight
    provenance: seed-jimmy
```

### 필드 근거

| Field | 존재 이유 | 설명가능성 역할 |
|---|---|---|
| `type` | 서로 다른 신호(저자 vs 키워드)는 다르게 매칭되고 가중됨. | 점수 분해가 발화한 type를 명명. |
| `terms` / `aliases` | lexical/BM25 매칭을 위한 표면형(surface form), 약어 변형 포함. | "matched alias *Mem-OS*". |
| `canonical_id` | 외부 ID(Semantic Scholar authorId, ORCID, arXiv 카테고리)로 저자/venue 명확화. | 잘못된 저자 hit 방지. |
| `weight` | interest별 튜닝 가능한 기여; 피드백으로 갱신됨. | 분해에서 배수(multiplier)로 표시됨. |
| `polarity` | negative interest는 일반적 hype를 강등 → signal-vs-hype를 지원(Brief §51). | "de-ranked: matched negative *prompt engineering*". |
| `decay` | 일부 interest는 시의성 있음(hot thread), 다른 것은 상시(memory wall). | 오래된 interest가 왜 사라졌는지 설명. |
| `provenance` | 모든 interest는 seed/Jimmy/피드백으로 감사 가능. | finding처럼 interest도 추적 가능하게 유지(Brief §97). |

## 2. 관련성 랭킹 접근법

finding의 관련성 = **interest별 신호 기여의 투명한 합**, 블랙박스가 아님.
v1은 **lexical/BM25를 척추(spine)로** 사용하고, 임베딩은 플래그 뒤의 **선택적 가산 레인(additive lane)**으로 둔다.

### 신호 레인(Signal lanes)

| Lane | 하는 일 | v1 상태 | 설명 가능? |
|---|---|---|---|
| **Exact/alias match** | title/abstract의 `terms`/`aliases` 직접 hit. 최고 신뢰도, 최저 비용. | **core** | Yes — 용어를 명명. |
| **BM25 lexical** (SQLite **FTS5** `bm25()`) | 모든 positive interest 용어의 OR-확장에 대해 자유 텍스트 finding을 랭킹; 컬럼 가중치가 title>abstract>body를 부스트. | **core** | Yes — FTS5를 통한 용어별 tf/idf. |
| **Entity/author/venue match** | adapter가 구조화 메타데이터(arXiv 저자 목록, S2 authorId)를 제공할 때 `canonical_id`에 대한 구조적 매치. | **core** | Yes — 엔티티를 명명. |
| **Embedding similarity** | finding 텍스트와 interest centroid 간 코사인 유사도; BM25가 놓치는 paraphrase/동의어를 잡음(예: "memory wall" ≈ "bandwidth bottleneck"). | **optional / flagged** | 부분적 — 최근접 interest + 점수를 보고, "semantic"으로 라벨. |

### 스코어링 공식 (구조적으로 설명 가능)

```
relevance(finding) =
    Σ_over_matched_positive_interests [ interest.weight × lane_score × decay_factor ]
  − Σ_over_matched_negative_interests [ interest.weight × lane_score ]
  + α × embedding_lane            # α는 v1에서 기본 0; eval 후에만 상향

# lane_score는 레인별 [0,1]로 정규화. FTS5 bm25()는 음수(더 관련 있을수록 더
# 음수) → 결합 전에 배치별로 부호 반전 + min-max 정규화.

explanation(finding) = ordered list of {interest.id, type, lane, raw, contribution}
```

finding별 출력: `relevance` float **그리고** `relevance_explain[]` 배열(기여 목록)과
`matched_watch_list`. classify 단계와 digest 모두 이 설명을 그대로(verbatim) 렌더링하므로, 독자는 항상
무언가가 *왜* 노출됐는지 보게 된다.

### 왜 BM25 먼저, 임베딩은 선택적인가

| 옵션 | 장점 | 단점 | v1 적합성 |
|---|---|---|---|
| **Keyword/alias만** | 사소하고 완전히 설명 가능, infra 0. | paraphrase 놓침; 새 표현에 취약 → 좁은 리스트에서 recall 위험. | 필요하지만 단독으로는 불충분. |
| **BM25 (FTS5)** | SQLite 내장(서비스 불필요), tf-idf 검사 가능, 컬럼 가중치, prefix/phrase/boolean 쿼리. | 여전히 lexical — 의미론 없음. | **선택된 척추.** |
| **Embeddings (dense)만** | 최고의 paraphrase recall. | 불투명, 모델 + 벡터 저장소 필요, 설명 어려움, 느슨하게 관련된 것을 과노출 → noise. | primary로는 거부. |
| **Hybrid (BM25 + embeddings, weighted/RRF)** | 최고의 recall+precision; 2025 프로덕션 증거는 hybrid를 선호하지만 BM25도 여전히 많은 실제 쿼리에서 승리. | 부품이 많음; weight/α 튜닝. | **v1 eval 후 목표; α-플래그를 지금 내장.** |

좁고 전문용어가 많은 watch list(*MemOS*, *Chakra*, *DeepStack*, *Minsoo Rhu* 같은 고유명사)에 대해서는
**exact/BM25 매칭이 이미 대부분의 true positive를 포착**한다 — 이들은 드물고 독특한 토큰으로, lexical이
뛰어난 바로 그 지점이다. 임베딩은 주로 알려진 어휘를 피해 가는 *새로운* 연구를 잡는 데 도움이 되며, 그것이
실제 recall 격차이므로, 레인은 배선해 두되 라벨된 집합에 대해 측정할 수 있을 때까지 비활성화한다.

### Recall-우선 threshold

- **어떤** `recall_priority: high` watch-list interest와 매칭되는 finding은 낮은 점수여도 트리아지를 위해
  **항상 노출**된다(결코 자동 discard 안 됨). 점수는 생존이 아니라 순서를 지배한다.
- negative-polarity 매치는 digest 내에서 **강등**하되 삭제하지 않음(Jimmy가 리뷰 — Brief §89).
- 동점은 recency로, 그 다음 매칭된 distinct interest 수로 깬다(폭(breadth) = 더 강한 신호).

## 3. 갱신 메커니즘

interest는 세 채널로 진화하며, 모두 **사람이 게이팅**하고 **버전 관리**된다(Brief §36 use case "update
interests → radar re-prioritizes"; §89 "Jimmy가 리뷰어").

| Channel | Trigger | Effect | Guardrail |
|---|---|---|---|
| **Direct edit** | Jimmy가 `interests.yaml` 편집(추가/삭제/재가중). | `interests.json`으로 재컴파일; `version` 증가; backlog 재랭킹. | Git diff = 완전한 감사 추적; version으로 rollback. |
| **Feedback nudge** | Jimmy가 digest 항목을 useful / not-useful / "more like this"로 표시. | 매칭된 interest의 `weight`를 작고 경계된 step(예: ±0.1, [0.1, 2.0]로 clamp)으로 조정; `interest-feedback.jsonl`에 로그. | interest를 결코 생성/삭제하지 않음; `terms`를 결코 편집하지 않음. 경계되어 클릭 한 번이 지배 불가. |
| **Suggestion queue** | 수락된 finding과 공출현(co-occurring)하는 반복적 high-relevance 토큰/저자. | *후보* interest(`provenance: suggested`)를 리뷰 큐로 제안. | Jimmy가 승격하기 전까지 비활성 — 소리 없는 watch-list 증식 없음(Brief §88 non-goal). |

### 갱신 속성

- **설명 가능 & 가역적:** 모든 가중치 변경은 그것을 유발한 finding/피드백과 함께 로그됨;
  `version` + git이 어떤 상태든 재현 및 되돌리기 가능하게 함.
- **decay는 스케줄에 적용:** cron run이 시의성 있는 interest에 `decay`를 적용하여 수동 정리 없이 오래된
  것이 사라지게 함; 바닥까지 decay된 interest는 제거를 위해 suggestion queue에 노출됨.
- **v1에 학습된 프로필 없음:** 우리는 암묵적 ML user-model을 의도적으로 피한다. interest 집합은 사람이 한
  화면에서 읽을 수 있는 작은 아티팩트로 유지된다 — 레이더를 감사 가능하고 high-trust하게 유지하는 데 핵심.
- **재우선순위화는 저렴:** 스코어링이 작은 interest 집합에 대한 투명한 합이므로, interest 편집은 현재
  backlog에 대해 스코어링을 다시 실행하기만 하면 됨; 재학습 없음.

## Tradeoffs 요약

| Decision | 선택 | 거부된 대안 | 이유 |
|---|---|---|---|
| Interest 표현 | 큐레이션된 타입 YAML/JSON, 버전 관리 | 학습된 user embedding/profile | 설명가능성 + recall 제어 + Brief "무거운 ML 없음". |
| 랭킹 척추 | SQLite FTS5를 통한 BM25 + exact match | dense 임베딩 primary | 독특한 고유명사 watch list; infra 없음; 검사 가능. |
| 의미론 | 선택적 임베딩 레인(α-플래그, 기본 off) | 없음 / 항상 on | 이음새를 지금 배선(ports & adapters), 활성화 전 가치 입증. |
| 필터링 | Recall-우선: watch-list hit에서 노출-안버림(surface-not-drop) | precision threshold 게이트 | 놓친 근접 논문 = 실존적 novelty 위험(Brief §19). |
| 갱신 | 사람이 게이팅하는 편집 + 경계된 피드백 nudge | 자동 학습 가중치/자동 리스트 증식 | Jimmy가 리뷰어; 표류/자동 scope-creep 회피. |

## Open Questions

[../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) 참조 (TODO: create).

- TODO(open-question: author/venue disambiguation — Semantic Scholar `authorId` vs ORCID vs name-string for `Minsoo Rhu`; how to handle homonyms and unaffiliated reposts?)
- TODO(open-question: which embedding model for the optional lane — local (e.g. small sentence-transformer) vs API — given the legal/ToS + own-store constraints, and is the added recall worth the opacity?)
- TODO(open-question: what labeled eval set defines "high recall" for the narrow list, and what default α/threshold values come out of it? No benchmark numbers asserted here.)
- TODO(open-question: feedback nudge step size and clamps (±0.1? [0.1,2.0]?) — tune against real digest interaction.)
- TODO(open-question: decay function shape/half-life per `decay` tier — none/slow/fast mapped to what concretely?)
- TODO(open-question: should negative-polarity interests ever hard-suppress, or always only demote, given recall-first stance?)

## 런북(runbook)에 대한 함의

- **RB (interest store):** Brief §6 watch list로 시드된 `interests.yaml` 스캐폴드; 스키마 검증과 함께
  `interests.json`으로 컴파일; 모든 변경마다 `version` 증가 + git-commit.
- **RB (index):** finding title/abstract/body에 대해 컬럼 가중치를 가진 SQLite **FTS5** 가상 테이블 구축;
  positive interest 용어를 OR-확장하는 `bm25()` 쿼리 노출; 점수 부호 반전+정규화.
- **RB (scorer):** `relevance` + `relevance_explain[]` + `matched_watch_list`를 내보내는 가산 스코어링
  공식 구현; 임베딩 레인은 `enable_embeddings` 플래그 뒤에 `α` config(기본 0)로.
- **RB (recall gate):** classify 전에 `recall_priority: high` 매치에 대해 노출-안버림 강제.
- **RB (feedback):** digest 항목을 표시하는 CLI/MCP 액션; `interest-feedback.jsonl`에 append; 경계되고
  clamp된 가중치 nudge 작업; 후보 interest를 위한 suggestion queue(승격 전까지 비활성).
- **RB (decay/re-rank):** cron 단계가 decay를 적용하고 interest `version` 변경 후 backlog에 대해 스코어링을
  다시 실행; 재우선순위화된 digest 순서를 내보냄.
- 점수/설명은 메타데이터일 뿐 — 원시 소스 콘텐츠를 결코 변형하지 않음(Brief §97).

## Sources

- [SQLite FTS5 BM25 in practice](https://thelinuxcode.com/sqlite-full-text-search-fts5-in-practice-fast-search-ranking-and-real-world-patterns/)
- [Hybrid search in production: why BM25 still wins on queries that matter](https://tianpan.co/blog/2026-04-12-hybrid-search-production-bm25-dense-embeddings)
- [Hybrid search (BM25 + vector embeddings)](https://medium.com/@mahima_agarwal/hybrid-search-bm25-vector-embeddings-the-best-of-both-worlds-in-information-retrieval-0d1075fc2828)
- [Implementing hybrid semantic + lexical search](https://kentcdodds.com/blog/implementing-hybrid-semantic-lexical-search)
