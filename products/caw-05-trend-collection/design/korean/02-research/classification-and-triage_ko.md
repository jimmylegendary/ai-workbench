# 분류 및 트리아지(Classification & Triage)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF_ko.md)
  - [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS_ko.md)
  - sibling: `./interest-model-and-ranking.md` (관련성 점수가 분류로 흘러 들어감) — TODO(link once written)
  - sibling: `./source-ingestion-and-dedup.md` (SourceAdapter, dedup, boundary) — TODO(link once written)
  - sibling: `./related-work-ledger-and-provenance.md` (이 문서가 기록하는 ledger) — TODO(link once written)
  - sibling: `./synthesis-and-output-formats.md` (라우팅된 finding을 소비) — TODO(link once written)
  - export boundaries: CAW-02 / CAW-03 / CAW-01 / CAW-06 (각각 별개의 제품) — TODO(link export-boundaries doc)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
이 문서는 **CAW-05가 각 finding을 어떻게 분류하고 라우팅하는지**를 결정한다. 즉 **분류 분류체계(taxonomy)**
(`novelty-threat / support / adjacent / noise` 관련성 클래스 **그리고** 이와 직교하는 `signal vs hype` 점수),
분류된 finding을 `knowledge / task / experiment / open-question / discard` 중 하나로 바꾸는 **라우팅 규칙**,
그리고 **리뷰 및 신뢰도 모델**(LLM 보조 분류, 보정된 신뢰도, 기권(abstention), human-in-the-loop)을 다룬다.
이 문서는 interest model / 관련성 랭킹(분류로 흘러 들어감 — 형제 문서), source adapter나 dedup(상류),
related-work ledger 내부 구조나 export 번들 스키마(하류 — 라우팅이 무엇을 내보내는지만 명시함), synthesis/출력
형식은 설계하지 않는다. provenance를 가진 deduped finding이 이미 존재한다고 가정한다.

## 1. 타협 불가능한 단 하나의 규칙
**분류는 제안일 뿐 결코 결정이 아니다. LLM의 라벨과 근거(rationale)는 생성된 텍스트이지 증거가 아니다.**
brief §11/§12에 따라, 자동 수집은 *제안(proposal)*을 생성하며, 전략적 결정의 리뷰어는 Jimmy다. 따라서
분류기는 finding에 클래스, 신뢰도, 근거를 *부착(attach)*할 수 있지만, (1) 그 근거는 `Note`
(`evidence=false`)로 저장되며 하류 주장(claim)을 결코 뒷받침할 수 없고, (2) 라우팅된 모든 출력은 finding의
**provenance**(소스 출처/날짜/검색 URL)를 함께 지녀, 사람과 import하는 제품이 요약이 아닌 원본 아티팩트를
보게 하며, (3) `novelty-threat` 라우트는 CAW-03에 대해 **자문(advisory)**일 뿐이다 — CAW-05는 novelty가
상실되었다고 결코 단언하지 않고, 다만 근접한 결과 후보가 존재한다고만 말한다. 이는 export 경계 전반에서
소스, 주장, 생성된 결론을 분리해 둔다.

## 2. 분류체계 — 두 개의 직교 축
finding은 **두 개의 독립적인 라벨**을 받는다. 둘을 합치면 정보를 잃는다: hype가 많은 블로그 글도 진짜
novelty-threat일 수 있고(실제 논문을 가리키므로), 엄밀한 논문도 순수한 noise일 수 있다(watch list 밖이라면).

### 2.1 축 A — 관련성 클래스 (watch list + interest model 대비)
좁은 레이더 watch list(brief §6: memory-centric DSE, memory device for LLM, DeepStack, Rhu /
MC-DLA / memory-wall 라인, MemOS, SECDA-DSE, TTT writeback, Chakra / trace 기반 워크로드 모델링,
LLM-serving & memory-hierarchy simulation)에 닻을 둔다.

| Class | 정의 | 예시 트리거 | 기본 처리(disposition) |
|---|---|---|---|
| **novelty-threat** | CAW-03 주장 / 우리 전략 축과 그럴듯하게 겹치거나 선점할 수 있음 — novelty를 지울 수 있음 | 우리가 주장하려는 것과 동일한 tiling-for-traffic 아이디어를 제안하는 논문 | route → CAW-03 + open-question; **높은 recall, 낮은 threshold** |
| **support** | 우리 입지를 강화: 인용 가능한 관련 연구, baseline, 입증 결과 | 우리가 인용/비교할 수 있는 벤치마크 | route → knowledge (CAW-02 Source/Claim) |
| **adjacent** | 주제와 관련 있으나 직접적인 위협이나 지지는 아님; 맥락 / 미래 축 | 인접 accelerator 클래스에 대한 survey | route → knowledge (낮은 우선순위) 또는 experiment 아이디어 |
| **noise** | watch list 밖, 중복 관점, 또는 신뢰도 낮은 마케팅 | 기술적 내용 없는 벤더 보도자료 | route → discard (로그됨, 삭제되지 않음) |

### 2.2 축 B — signal vs hype (신뢰성 / 실질)
관련성과 **무관한** 0–1 점수(`hype / mixed / signal`로 버킷화). 이는 finding이 *어떻게* 흐르는지를
게이팅하며, *흐를지 여부*는 아니다. 값싸고 설명 가능한 피처가 먼저(이것이 v1의 약지도(weak-supervision)
labeling function, Snorkel 스타일), LLM 판단이 그 다음.

| Signal 피처 (점수 상승) | Hype 피처 (점수 하락) |
|---|---|
| peer-reviewed / 코드·아티팩트가 있는 arXiv; 재현 가능 | 방법론 없는 보도자료 / 런칭 블로그 |
| 구체적 수치 + 방법론 + baseline | 측정 없는 과장어("revolutionary", "10x") |
| watch-list 라인의 지명된 저자(예: Rhu) | 익명 / 재게시물의 재게시 aggregator |
| 1차 소스(primary source) | N차 요약; 이미 1차 소스를 보유 |

(ingestion에서 온) 소스-패밀리 신뢰도 사전확률이 축 B의 시드가 된다: `arXiv/conf ≈ high`,
`lab blog/GitHub ≈ medium`, `HN/Reddit/newsletter ≈ low` — 위 피처로 조정됨. **신뢰도는 LLM에서
재도출되는 것이 아니라 전달(carried)된다.**

## 3. 분류된 finding 레코드 (provenance-우선)
분류기는 deduped finding을 읽어 related-work ledger에 레코드 하나를 기록한다. LLM이 생성한 모든 필드는
리뷰와 하류 제품이 생성된 내용과 사실을 구분할 수 있도록 표시된다.

```yaml
classified_finding:
  finding_id: caw05-fnd-0001
  provenance:                       # ingestion에서 전달됨; 절대 합성하지 않음
    source_family: arxiv|lab-blog|github|hn|reddit|securities|newsletter
    origin_url: https://arxiv.org/abs/...
    retrieved_at: 2026-..T..Z
    boundary: public                # brief §7; v1 ingest는 public 전용
    source_trust_prior: high|medium|low
    dedup_key: sha256:...           # 상류에서 설정; 분류기는 re-dedup하지 않음
  relevance:
    class: novelty-threat|support|adjacent|noise
    watchlist_hits: [memory-centric-dse, chakra]   # 어떤 interest가 매칭됐는지
    confidence: 0.0-1.0             # 보정됨 (§5)
  signal:
    score: 0.0-1.0
    bucket: hype|mixed|signal
  rationale_note:                   # 생성됨 — evidence=false, 주장을 결코 뒷받침하지 않음
    text: "Matches Chakra trace line; proposes ... overlaps planned claim P1-ladder"
    model: { name: TODO, version: TODO, prompt_hash: sha256:... }
    evidence: false
  method:
    labeler: lf+llm|llm|human        # 라벨 자체의 provenance
    self_consistency: { samples: 3, agreement: 0.67 }   # §4
    abstained: false
  review:
    state: auto-accepted|queued|human-confirmed|human-overridden
    reviewer: jimmy|null
    decided_at: 2026-..T..Z|null
  routing:
    decision: knowledge|task|experiment|open-question|discard
    targets: [caw02, caw03]          # export adapter; 명시적 boundary
    digest_eligible: true
```

핵심 속성: (1) `provenance`와 `dedup_key`는 분류기가 읽을 수는 있으나 만들어낼 수 없는 상류 사실이다.
(2) `rationale_note.evidence=false`는 데이터 모델에 새겨진 §1 불변식이다. (3) `method`/`review`는
**누가/무엇이 라벨을 부여했는지**를 기록하여 ledger가 end-to-end로 감사 가능하게 한다.

## 4. LLM 보조 분류 파이프라인
**3단계 캐스케이드**로, 값싼 것 → 비싼 것 순서이므로 대부분의 finding은 결코 LLM에 도달하지 않고, LLM은
확신이 없을 때만 사람에게 도달한다. 이는 비용을 낮게 유지하면서 레이더가 필요로 하는 recall을 제공한다.

```
finding ──▶ [1] Labeling Functions (rules) ──▶ [2] LLM judge (self-consistent) ──▶ [3] Human review (selective)
              cheap, explainable               only when LFs weak/disagree         only when low-confidence /
              high-precision watchlist regex   classes A+B + rationale              novelty-threat / disagreement
```

1. **Labeling function (LF).** 결정론적이고 설명 가능한 규칙: watch-list 키워드/저자/venue regex →
   `novelty-threat` 후보; 알려진 aggregator 도메인 → `noise`; has-code + 수치 → signal++. LF는 정밀도가
   높고 1차 라벨 + 피처를 생성한다. (Snorkel 스타일 약지도: 노이즈가 있는 LF들을 결합하고, 그들의
   일치/불일치를 피처로 유지.) watch-list recall이 실존적으로 중요하므로, LF의 **누락(miss)은 `noise`로
   기본 처리되지 않고 LLM으로 떨어진다(fall through).**
2. **LLM judge.** LF가 약하거나 충돌하거나 watch-list 용어가 거의 매칭될 때 호출됨. 하나의 프롬프트가
   **두 축 + 근거**를 반환하며, **N=3 self-consistent 샘플**로 실행; **일치율(agreement rate)이 원시
   신뢰도 신호**다(낮은 일치 = 불확실 → 에스컬레이션). LLM-as-judge는 seed 간 self-inconsistent하다고
   알려져 있어 단일 샘플은 결코 신뢰하지 않는다. Token-probability / verbalized confidence는 기록하되
   *2차적*이고 보정되지 않은 신호로 취급한다.
3. **Human review.** §5가 사람에게 라우팅하는 슬라이스만. 사람이 확인/번복하며, 그 번복은 새로운 라벨된
   예제가 되어 LF/threshold 튜닝(active learning)으로 들어간다.

## 5. 리뷰 및 신뢰도 모델 (선택적, recall 편향)
우리는 **selective prediction**을 수행한다: 고신뢰도 라벨은 자동 수락, 저신뢰도는 **기권(abstain) → 사람**.
기권 threshold는 사람의 노력과 정확도를 맞바꾸는 손잡이다. 두 가지 속성이 이를 안전하게 만든다: 보정
(calibration, threshold가 의미를 갖도록)과 **비대칭 비용**(놓친 novelty-threat가 오경보보다 훨씬 나쁨 — brief §1).

| 신뢰도 (보정됨) | Class | 조치 | 근거 |
|---|---|---|---|
| high (≥ τ_high) | support / adjacent / noise | **자동 수락**, 라우팅 | 대량; 틀려도 비용 낮음 |
| any | **novelty-threat** | **항상 사람에게 큐잉**(고신뢰도여도) | 실존적 비용; recall > precision |
| mid (τ_low–τ_high) | any | **사람에게 큐잉** | 모델이 불확실 |
| low (< τ_low) **또는** self-consistency 불일치 | any | **기권 → 큐잉**, 결코 소리 없이 discard하지 않음 | 소리 없는 잘못된 `noise` = 놓친 논문 |

- **Recall-우선 하한선:** watch-list hit이 ≥1개 있는 finding은 **결코 `noise`로 자동 discard되지 않는다**;
  대신 큐잉된다. 오탐(false positive)은 리뷰어의 몇 초를 쓰지만, 미탐(false negative)은 novelty를 지울 수 있다.
- **보정:** 원시 점수(LF 일치 + LLM self-consistency + verbalized confidence)는 Jimmy의 확인/번복 이력에
  대한 작은 로지스틱 피팅을 통해 보정된 확률로 매핑된다(50–100개 라벨이면 쓸 만한 보정에 충분). ECE를
  추적하고, 번복률이 표류하면 재보정한다.
- **신뢰도 입력 (순위):** (1) LF/LLM 일치, (2) N-sample self-consistency, (3) watch-list 매치 특이성,
  (4) 소스 신뢰도 사전확률, (5) verbalized confidence (가장 약함).
- **리뷰 큐 & SLA:** 큐잉된 finding은 주간 digest의 "needs-review" 섹션에 노출됨; `novelty-threat`는
  same-cycle 리뷰를 위해 플래그됨. `review.state ∈ {auto-accepted, human-confirmed, human-overridden}`이
  될 때까지 아무것도 export되지 않는다.

τ_high / τ_low는 **상수가 아니라 config**다(보수적으로 시작해 번복 로그에서 튜닝). 초기값은 open question이다
— 숫자를 하드코딩하지 말 것.

## 6. 라우팅 규칙 (분류 → 목적지 → export)
라우팅은 `(관련성 클래스, signal 버킷, 리뷰 상태)`의 결정론적 함수다. brief §2/§5의 다섯 가지 처리와
brief §8의 export 경계로 매핑된다. CAW-05는 **명시적 파일/API 경계를 가로질러 export 번들을 내보낸다**;
다른 제품의 저장소에 결코 직접 기록하지 않는다.

| Relevance | Signal | Disposition | Export target(s) | Notes |
|---|---|---|---|---|
| novelty-threat | signal/mixed | **open-question** + flag | **CAW-03** (novelty signal), **CAW-01/CAW-06** (open question) | 자문 전용; export 전 human-confirmed |
| novelty-threat | hype | **open-question** (낮은 우선순위) | CAW-03 | 그래도 노출됨 — recall 하한선; low-signal로 표시 |
| support | signal | **knowledge** | **CAW-02** as Source/Claim/RelatedWork | 표준적인 "인용 가능해지는" 경로 |
| support | mixed/hype | **knowledge** (watchlist만) else discard | CAW-02 | hype성 support는 대개 중복 |
| adjacent | signal | **knowledge** (낮은 우선순위) **또는** **experiment** | CAW-02; experiment 아이디어 노트 | future-workload-축 자료 |
| adjacent | mixed/hype | **discard** (로그됨) | — | watch-list hit이 아니면 → 큐잉 |
| noise | any | **discard** (로그됨, 삭제 안 함) | — | 감사 + dedup 메모리를 위해 보존 |
| (actionable, any class) | — | **task** | CAW-06 / digest action-brief | 예: "baseline X에 대해 읽고 비교" |

brief의 다섯 가지 라우트로의 매핑: **knowledge** → CAW-02; **open-question** → CAW-01 + CAW-06;
**task** → CAW-06 / action-brief; **experiment** → experiment-idea 노트(digest; CAW-01 입력 후보);
**discard** → 로그된 tombstone(dedup + 감사를 위해 유지, 결코 hard-delete하지 않음). 하나의 finding이
**여러** 라우트를 만들 수 있다(예: novelty-threat는 CAW-01로의 open-question이면서 *동시에* CAW-03로의
novelty signal).

## 7. 일반화 (이음새, brief §5/§9 기준)
분류는 하드코딩된 로직이 아니라 **포트 뒤의 정책 객체(policy object)**다:
- **Classifier 포트.** v1 = LF + LLM 캐스케이드; 계약은 `finding → {relevance, signal, confidence,
  rationale_note}`. 미래의 fine-tuned 모델이나 다른 LLM adapter도 동일한 형태를 만족해야 한다; 라우팅은
  어떤 분류기가 라벨을 생성했는지 알지 못한다.
- **라우팅 테이블은 config다.** §6 행렬은 명명된 **triage profile**(`profile: narrow-radar-weekly`)이다.
  새 watch-list 라인이나 export target = 코어 변경이 아니라 새 profile 행.
- **ExportAdapter-비종속.** 라우팅은 중립적인 `routed_finding`을 내보낸다; target별 번들 형태(CAW-02 vs
  CAW-03)는 각 ExportAdapter 안에 있다. 분류기는 다른 제품의 스키마를 결코 import하지 않는다.
- **어떤 profile도 완화할 수 없는 불변식:** 생성된 근거는 `evidence=false`이고, `novelty-threat`는 결코
  소리 없이 자동 discard되지 않는다.

## Open Questions
- TODO(open-question: initial τ_high / τ_low and the N for self-consistency — set empirically from the first weeks' override log; do not hard-code.)
- TODO(open-question: is `signal-vs-hype` a single score or per-feature vector surfaced to the reviewer? lean: score + top contributing features.)
- TODO(open-question: which LLM/model + prompt for the judge stage, and is it local or API? cross-cuts cost/latency and the claude-api choice — owned with the classification ADR.)
- TODO(open-question: do `task` and `experiment` routes export anywhere in v1, or only appear in the digest until CAW-01/CAW-06 contracts firm up? cross-boundary.)
- TODO(open-question: retention/TTL for `discard` tombstones — how long do we keep noise for dedup memory + audit?)
- TODO(open-question: multi-label relevance — can one finding be both support AND novelty-threat? lean: yes, store a set, route the union.)
- TODO(open-question: how is calibration data captured without leaking confidential review context into a public-facing model? owned with guardrails.)
- See `../08-research-plan/open-questions.md` (to be created).

## 런북(runbook)에 대한 함의
- **RB (labeling functions):** watch-list LF 구현(키워드/저자/venue regex, aggregator-도메인 noise 규칙,
  has-code/has-numbers signal 피처); watch-list 용어에 대한 LF 누락은 반드시 **LLM으로 떨어져야** 하며
  결코 `noise`로 기본 처리되지 않는다. 신뢰도 모델을 위한 피처 + LF별 투표를 내보낸다.
- **RB (LLM classifier):** 하나의 프롬프트 → 두 축 + 근거; N self-consistent 샘플 실행; 일치율,
  `model.version`, `prompt_hash` 기록; 근거는 `Note(evidence=false)`로 저장. 수락 기준: 단일 샘플 실행은
  결코 최종으로 내보내지 않는다.
- **RB (confidence + review queue):** 보정된 스코어링 구현(번복 로그에 대한 로지스틱 피팅; ECE 추적);
  §5에 따른 선택적 라우팅; **watch-list-hit finding은 결코 자동 discard하지 않음**; `novelty-threat`는 항상
  큐잉. `review.state`를 영속화하고 확인될 때까지 export를 차단.
- **RB (routing engine):** §6을 **config로 선택되는 triage profile**로 구현; multi-route finding 지원;
  ExportAdapter가 소비하는 중립적 `routed_finding`을 내보냄. 수락 테스트: §6 표의 각 행 + 부정 테스트
  (N1: watch-list hit이 있는 high-conf `noise`는 discard가 아니라 큐잉되어야 함; N2: 증거로 전달된 근거는
  거부됨; N3: 리뷰 확인 전 시도된 export는 거부됨).
- **RB (ports/config):** 분류기와 라우팅을 각자의 포트 뒤에; triage profile + threshold는 config에;
  "생성된 근거는 증거가 아님" + "novelty-threat는 결코 소리 없이 discard 안 함" 불변식이 모든 profile에서 유지.

Sources: [Snorkel: Rapid Training Data Creation with Weak Supervision (arXiv:1711.10160)](https://arxiv.org/abs/1711.10160),
[Snorkel AI — Active learning and weak supervision](https://docs.snorkel.ai/docs/25.4/user-guide/intro/active-learning-weak-supervision/),
[Rating Roulette: Self-Inconsistency in LLM-as-a-Judge Frameworks (arXiv:2510.27106)](https://arxiv.org/pdf/2510.27106),
[A survey on LLM-as-a-judge (ScienceDirect)](https://www.sciencedirect.com/science/article/pii/S2666675825004564),
[The Art of Abstention: Selective Prediction and Error Regularization for NLP](https://www.researchgate.net/publication/353492014_The_Art_of_Abstention_Selective_Prediction_and_Error_Regularization_for_Natural_Language_Processing),
[Confidence-Based Abstention (EmergentMind)](https://www.emergentmind.com/topics/confidence-based-abstention),
[Calibration in ML: Confidence, Accuracy & ECE](https://mbrenndoerfer.com/writing/calibration-machine-learning-confidence-accuracy-ece).
