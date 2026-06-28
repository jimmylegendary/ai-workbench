# Radar Core — Interest Model & Relevance(관심 모델 및 연관성)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [overview.md](overview_ko.md) — score 단계가 Run에서 위치하는 곳
  - [source-ingestion-and-dedup.md](source-ingestion-and-dedup_ko.md) — entity lane이 필요로 하는 구조화 메타데이터를 공급
  - [../01-decisions/ADR-0002-interest-model.md](../01-decisions/ADR-0002-interest-model_ko.md) — 이 문서가 구체화하는 결정
  - [../02-research/interest-modeling.md](../02-research/interest-modeling_ko.md) — 스키마, 공식, update 채널 (research)
  - [../01-decisions/ADR-0004-classification-and-triage.md](../01-decisions/ADR-0004-classification-and-triage_ko.md) — `relevance`를 소비하고 recall floor를 상속
  - [../01-decisions/ADR-0006-storage-and-scheduling.md](../01-decisions/ADR-0006-storage-and-scheduling_ko.md) — finding에 대한 SQLite FTS5; cron 실행 시 decay
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적(Purpose)
이 문서는 CAW-05의 load-bearing core(brief §10, ADR-0002)에 대한 **빌드 지향 구체화**다: **typed interest artifact**,
**BM25-first additive explainable relevance 점수**, **recall-first floor**, **optional embedding lane**,
**human-gated versioned update**, 그리고 brief §6에서의 **watch-list seeding**. 스키마, 점수화 계약, score 단계의 출력을
확정한다. 이 문서는 ingestion을 결정하지 않으며(dedup된 finding을 소비함 —
[source-ingestion-and-dedup.md](source-ingestion-and-dedup_ko.md) 참고) 점수를 *소비하는* classify taxonomy도 결정하지
않는다(ADR-0004). brief §11/§12에 따라, v1은 **단순하고, 설명 가능하며, 높은 recall — 무거운 ML relevance 모델 없음**을
유지한다.

## 왜 이것이 load-bearing인가
Relevance 랭킹은 triage를 위해 무엇이 노출되는지를 결정한다. 이를 잘못하면 **가까운 논문을 조용히 잃는다** — 존재론적
novelty 위험이다(brief §1, §19). 그래서 설계는 **filtering보다 surfacing에 편향**되고 모든 점수가 **명명된 신호로
분해**되도록 만든다. watch list는 jargon이 많은 고유명사다(*MemOS, Chakra, DeepStack, Minsoo Rhu, MC-DLA, SECDA-DSE,
TTT writeback*) — 정확히 exact/BM25 lexical 매칭이 대부분의 true positive를 잡고 불투명한 embedding이 noise를 과도하게
노출할 위험이 있는 지점이다.

## 1. typed interest artifact
Interest는 **작고, 손으로 큐레이션되며, 버전 관리되는** typed 항목의 집합이다: 하나의 `interests.yaml`(Jimmy의 control
surface)을 `interests.json`(기계 소비용)으로 컴파일한다. 한 화면에 들어가며 완전히 git-감사 가능하다.

```yaml
# interests.yaml — CAW-05 interest model (illustrative; seeded from brief §6)
version: 1                      # bump on every accepted edit → diff/rollback
updated: TODO                   # do not invent dates
watch_lists:
  - id: memory-centric-dse      # the narrow weekly radar (brief §6)
    label: "Memory-centric DSE & LLM memory wall"
    default_weight: 1.0
    recall_priority: high       # high ⇒ surface-not-drop floor (never silently drop)

interests:
  - id: int-memos
    type: topic                 # enum: keyword | topic | entity | author | venue
    terms: ["MemOS", "memory operating system for LLM"]
    aliases: ["Mem-OS"]
    weight: 1.0                 # base contribution to relevance
    watch_list: memory-centric-dse
    polarity: positive          # positive | negative (negative = de-rank / hype hint)
    decay: none                 # none | slow | fast — relevance half-life of the interest
    canonical_id: null          # author/venue disambiguation id (S2 authorId / ORCID / arXiv cat)
    provenance: seed-brief-§6    # auditable origin: seed | jimmy | feedback | suggested
  - id: int-rhu
    type: author
    terms: ["Minsoo Rhu"]
    canonical_id: "TODO(open-question: Semantic Scholar authorId / ORCID for disambiguation)"
    weight: 1.2                 # a named-person hit is a strong signal on this list
    watch_list: memory-centric-dse
    polarity: positive
    provenance: seed-brief-§6
  - id: int-generic-llm-noise
    type: keyword
    terms: ["prompt engineering", "chatbot UX"]
    weight: 0.5
    polarity: negative          # down-weight generic LLM hype off the watch list
    provenance: seed-jimmy
```

### 필드 역할 (각 필드가 설명 가능성을 정당화함)
| Field | 존재 이유 | 점수 분해에서의 역할 |
|---|---|---|
| `type` | 저자와 키워드는 다르게 매칭+가중됨 | 발화된 type을 명명 |
| `terms` / `aliases` | lexical/BM25 매칭을 위한 표면형(약어 변형 포함) | "matched alias *Mem-OS*" |
| `canonical_id` | 외부 ID로 저자/venue를 disambiguate | 잘못된 저자 hit 방지 |
| `weight` | interest별 조정 가능한 기여; feedback으로 미세 조정 | 분해에 표시되는 multiplier |
| `polarity` | negative interest는 generic hype를 demote → signal-vs-hype | "de-ranked: matched negative *prompt engineering*" |
| `decay` | 일부 interest는 시의성이 있고, 일부는 상시적 | 오래된 interest가 사라진 이유를 설명 |
| `provenance` | 모든 interest는 seed/Jimmy/feedback으로 감사 가능 | finding처럼 interest를 추적 가능하게 유지(brief §12) |

## 2. BM25-first additive explainable relevance
Finding의 relevance는 **interest별 lane 기여의 투명한 합**이며, 절대 블랙박스가 아니다. 척추는 lexical/BM25다. embedding은
플래그 뒤의 **선택적 additive lane**이며 기본값은 off다.

### 신호 lane
| Lane | 하는 일 | v1 상태 | 설명 가능? |
|---|---|---|---|
| **Exact/alias match** | title/abstract에서 `terms`/`aliases`에 직접 hit — 최고 confidence, 최저 비용 | **core** | Yes — 용어를 명명 |
| **BM25 lexical** (SQLite **FTS5** `bm25()`) | positive term의 OR-expansion 대비 자유 텍스트를 랭킹; 컬럼 가중치 title>abstract>body | **core** | Yes — term별 tf/idf |
| **Entity/author/venue** | adapter가 메타데이터를 공급할 때 `canonical_id`에 대한 구조화 매칭 | **core** | Yes — entity를 명명 |
| **Embedding similarity** | interest centroid 대비 cosine; BM25가 놓치는 paraphrase를 잡음 | **optional / flagged** | 부분적 — 가장 가까운 interest를 "semantic"으로 라벨링하여 보고 |

### 점수화 계약 (구조적으로 설명 가능)
```
relevance(finding) =
    Σ_matched_positive [ interest.weight × lane_score × decay_factor ]
  − Σ_matched_negative [ interest.weight × lane_score ]
  + α × embedding_lane            # α = 0 default in v1; raise only after a labeled eval

# lane_score normalized to [0,1] per lane. FTS5 bm25() is NEGATIVE (more relevant = more
# negative) ⇒ negate + per-batch min-max normalize before combining, so contributions stay
# comparable across lanes.

# Emitted PER finding (metadata over the immutable finding — never rewrites source text):
relevance        : float
relevance_explain: [ {interest_id, type, lane, raw, contribution}, ... ]  # ordered by contribution
matched_watch_list: [ watch_list_id, ... ]
```

Triage(ADR-0004)와 digest(ADR-0001)는 `relevance_explain[]`를 **그대로(verbatim)** 렌더링하므로, 독자는 항상 무언가가
노출된 *이유*를 본다. scorer는 순수한 annotation 계층이다 — raw source 콘텐츠를 절대 변형하지 않는다(brief §12).

### 왜 BM25-first, embeddings-optional인가
| 옵션 | 장점 | 단점 | v1 적합성 |
|---|---|---|---|
| 키워드/alias만 | 사소함, 완전히 설명 가능, infra 없음 | paraphrase 놓침; 새 표현에 취약 → recall 위험 | 필요하지만 단독으로는 불충분 |
| **BM25 (FTS5)** | SQLite 내(서비스 없음); 검사 가능한 tf-idf; 컬럼 가중치; boolean/phrase 쿼리 | lexical만 — semantic 없음 | **선택된 척추** |
| Embedding(dense)만 | 최고의 paraphrase recall | 불투명; 모델 + vector store 필요; 느슨하게 관련된 것을 과노출 → noise | primary로는 기각 |
| Hybrid (BM25 + embeddings) | 최고의 recall+precision | 움직이는 부품이 더 많음; α 튜닝에 labeled eval set 필요 | **v1 이후 목표; α-flag는 지금 배선, 기본 off** |

## 3. Recall-first floor (surface-not-drop 계약)
이것은 ADR-0004의 `noise` route가 반드시 따라야 하는 floor다.

- **임의의** `recall_priority: high` watch-list interest에 매칭되는 finding은 triage를 위해 **항상 노출**된다 —
  절대 auto-discard되지 않는다 — **낮은 점수여도**. 점수는 **순서**를 지배하지 생존을 지배하지 않는다.
- **Negative-polarity** 매칭은 digest 내에서 **demote**하되 절대 삭제하지 않는다(Jimmy가 리뷰함 — brief §89).
  `TODO(open-question: recall-first를 감안할 때, negative interest가 hard-suppress할 수 있는가, 아니면 항상 demote만 하는가?)`
- **Tie-break:** recency, 그 다음 매칭된 distinct interest 수(breadth = 더 강한 신호).

## 4. Optional embedding lane (alpha, gated)
hybrid 이음새는 지금 존재하므로 semantics를 **재설계 없이** 추가할 수 있다 — `α`를 올리는 것은 재작성이 아니라 config
변경이다. labeled eval set에 대해 입증될 때까지 **off**로 남는다. lexical이 이미 대부분의 true positive를 잡는 list에서
불투명성은 실제 비용이기 때문이다.

| 측면 | v1 결정 |
|---|---|
| Flag | `enable_embeddings: false` (기본); `α: 0.0` |
| 활성화 시점 | labeled eval이 lexical-only가 watch-list-인접 작업을 **측정 가능하게 놓친다**고 보일 때만 |
| 설명 가능성 | 가장 가까운 interest + cosine을 "semantic"으로 라벨링하여 보고 — 절대 맨숫자 아님 |
| Model | `TODO(open-question: 법률/ToS + 자체 저장소 제약을 감안할 때 local sentence-transformer vs API)` |
| Eval | `TODO(open-question: "high recall"을 정의하는 labeled set + 그것이 산출하는 기본 α — 숫자 주장 없음)` |

## 5. Human-gated versioned update
Interest는 세 채널을 통해 진화하며, **모두 human-gated이고 versioned다**(brief §36 use case, §89 "Jimmy가 리뷰어다").
v1에 학습된 profile은 없다.

| 채널 | 트리거 | 효과 | 가드레일 |
|---|---|---|---|
| **Direct edit** | Jimmy가 `interests.yaml`을 편집 | `interests.json`으로 재컴파일; `version` bump; backlog 재랭킹 | Git diff = 완전한 audit; version으로 rollback |
| **Feedback nudge** | digest 항목에 대한 `mark-feedback` op(ADR-0001) | 매칭된 interest의 `weight`를 작고 bounded clamped step으로 조정; `interest-feedback.jsonl`에 로깅 | interest를 절대 생성/삭제 안 함; `terms`를 절대 편집 안 함 |
| **Suggestion queue** | accepted finding과 동시 출현하는 반복적인 high-relevance 토큰/저자 | 후보 interest(`provenance: suggested`)를 review queue로 제안 | Jimmy가 promote할 때까지 **비활성** — watch-list가 조용히 자라지 않음(brief §88) |

- **스케줄에 따른 decay:** cron Run이 `decay`를 적용하여 시의성 있는 interest가 수동 가지치기 없이 사라지게 한다.
  floor까지 decay된 interest는 제거를 위해 suggestion queue에 노출된다.
- **재우선순위화는 저렴하다:** 점수화는 작은 집합에 대한 투명한 합이므로, 편집은 현재 backlog에 대해 점수화를 다시 실행할
  뿐이다 — 재학습 없음.
- `TODO(open-question: feedback nudge step 크기 + clamp; tier별 decay 함수 모양/half-life — 숫자 주장 없음.)`

## 6. Watch-list seeding (brief §6)
v1 artifact는 brief §6에서 `recall_priority: high`를 가진 `memory-centric-dse` watch list로 시드된다:
memory-centric DSE; memory device for LLM; DeepStack; Minsoo Rhu / MC-DLA / memory-wall line; MemOS; SECDA-DSE;
TTT writeback / test-time compute memory traffic; Chakra / trace-based workload modeling; LLM-serving &
memory-hierarchy simulation. Seeding 항목은 `provenance: seed-brief-§6`을 담는다. 일회성 `caw05 run --since
<date>` backfill(ADR-0006)이 첫 주간 실행 전에 인덱스를 채우기 위해 이력을 sweep한다.
`TODO(open-question: seed 항목의 canonical author/venue id 확인 — 예: Minsoo Rhu authorId.)`

## Open Questions
[../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) 참고. ADR-0002에서 이어짐:
author/venue disambiguation; embedding 모델 선택; labeled eval set + 기본 α; feedback step/clamp;
decay 모양; negative interest가 hard-suppress할 수 있는지 여부.

## 런북에 대한 함의
- **RB (interest store):** brief §6에서 시드된 `interests.yaml` scaffold; compiler → 스키마 검증을 포함한
  `interests.json`; 변경마다 `version` bump + git commit.
- **RB (FTS5 index):** 컬럼 가중치를 가진 finding title/abstract/body에 대한 SQLite FTS5; positive term을
  OR-expansion하는 `bm25()` 쿼리; negate + per-batch min-max normalize.
- **RB (scorer):** `relevance` + `relevance_explain[]` + `matched_watch_list`를 방출하는 additive 공식;
  embedding lane은 `enable_embeddings`/`α` 뒤에(기본 off/0).
- **RB (recall gate):** classify 전에 `recall_priority: high` 매칭에 대해 surface-not-drop을 강제.
- **RB (feedback):** `mark-feedback` → `interest-feedback.jsonl`; bounded clamped nudge; 비활성 suggestion queue.
- **RB (decay/re-rank):** cron 단계가 decay를 적용하고 `version` 변경 후 점수화를 다시 실행.
- 점수/설명은 **metadata만** — raw source 콘텐츠를 절대 변형하지 않음(brief §12).
