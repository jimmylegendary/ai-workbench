# Radar Core — 분류 및 분류 처리(Classification & Triage)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF_ko.md) (단일 진실 원천 — §5 핵심 도메인, §11 비목표, §12 가드레일)
  - [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS_ko.md)
  - [../01-decisions/ADR-0004-classification-and-triage.md](../01-decisions/ADR-0004-classification-and-triage_ko.md) (이 문서가 구체화하는 결정)
  - [../01-decisions/ADR-0002-interest-model.md](../01-decisions/ADR-0002-interest-model_ko.md) (relevance 점수 + recall floor가 Axis A로 공급됨)
  - [../01-decisions/ADR-0003-source-adapters-and-ingestion.md](../01-decisions/ADR-0003-source-adapters-and-ingestion_ko.md) (dedup된 finding + trust prior)
  - [../02-research/classification-and-triage.md](../02-research/classification-and-triage_ko.md) (taxonomy, cascade, confidence 모델, routing matrix — 전체 인용)
  - sibling: [./related-work-ledger.md](./related-work-ledger_ko.md) (routing이 기록하는 ledger; relation = class에서 noise를 뺀 것)
  - [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) (TODO: create)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적(Purpose)
이 문서는 분류와 triage에 대한 **radar-core 빌드 계약(build contract)**이다. 즉 AI 빌더가 하나의 **Run** 안에서 구현하는
구체적인 컴포넌트 경계, 데이터 형태, cascade 제어 흐름, gate 술어(predicate), routing 엔진을 정의한다. ADR-0004(결정)와
[../02-research/classification-and-triage.md](../02-research/classification-and-triage_ko.md)(근거 + 인용)를 코드로 작성
가능한 형태로 바꾼다. 이 문서는 taxonomy를 다시 논증하거나 문헌을 다시 인용하지 않으며(research 문서 참고), 이 문서가
소비하는 interest/relevance 점수를 정의하지 않고(ADR-0002), ingestion/dedup을 정의하지 않으며(ADR-0003), ledger 스키마 /
export wire format을 정의하지 않는다([./related-work-ledger.md](./related-work-ledger_ko.md) 참고). 이 문서는 **dedup되고
점수가 매겨진, provenance를 가진 `Finding`**이 이미 Run의 working set에 존재한다고 가정한다.

## 1. 이 core가 강제하는 불변식 (완화 금지)
두 가지 규칙이 데이터 모델에 인코딩되어 있고 negative 테스트로 검사된다. **어떤 triage profile도 둘 중 어느 것도 완화할 수 없다:**

1. **생성된 rationale는 절대 evidence가 아니다.** LLM이 생성한 모든 텍스트는 `rationale_note` 아래에 `evidence: false`로
   저장된다. 이는 사람에게 알림을 줄 수 있고, digest에 렌더링될 수 있으며, route를 설명할 수 있다 — 그러나 **절대로**
   downstream claim의 근거가 될 수 없다. 근거는 항상 provenance + (검증 이후의) source locator이다.
2. **`novelty-threat`는 절대 조용히 자동 폐기되지 않는다.** watch list에 1개 이상 hit한 finding은 **절대로** `discard`로
   자동 라우팅되지 않는다. 최악의 경우에도 human review를 위해 큐에 들어간다. 가까운 논문을 놓치는 것은 존재론적 novelty 위험이다(brief §1).

이것들은 brief §12 가드레일("source, claim, evidence, 생성된 결론을 분리해서 유지"; "자동 수집은 proposal 생성이며,
Jimmy가 리뷰어다")을 실행 가능하게 만든 것이다.

## 2. 컴포넌트 맵 (하나의 Run 내부)
```
                 deduped+scored Finding (from ingestion + interest model)
                                   │
                          ┌────────▼─────────┐
                          │  LF stage         │  deterministic, explainable
                          │  (labeling fns)   │  watch-list regex, aggregator rule, signal features
                          └────────┬─────────┘
                  strong+agreeing  │  weak / conflict / near-miss
                ┌──────────────────┴──────────────────┐
                ▼                                      ▼
        (skip LLM, cheap label)            ┌──────────────────┐
                │                          │  LLM judge        │  N self-consistent samples
                │                          │  (Classifier port)│  → both axes + rationale_note
                │                          └────────┬─────────┘
                └───────────────┬───────────────────┘
                                ▼
                       ┌──────────────────┐
                       │  Confidence +     │  calibrate → selective gate
                       │  selective review │  (recall-biased; never silent-discard)
                       └────────┬─────────┘
                  auto-accepted │ queued → human → confirmed/overridden
                                ▼
                       ┌──────────────────┐
                       │  Routing engine   │  config triage profile
                       │  (Routing port)   │  → routed_finding (multi-route)
                       └────────┬─────────┘
                                ▼
            ledger LedgerLink  +  export bundles (see ./related-work-ledger.md)
```
**Classifier**와 **Routing** 단계는 모두 port 뒤에 있는 정책 객체(policy object)다(brief §9). 향후 fine-tuned 모델은
동일한 `finding → {relevance, signal, confidence, rationale_note}` 계약을 충족하면 된다. routing은 하드코딩된 로직이 아니라
명명된, config로 선택되는 profile이다.

## 3. 2축(two-axis) taxonomy
finding당 두 개의 **직교(orthogonal)** 라벨. 둘을 하나로 합치면 정보를 잃는다(과대 선전된 블로그가 실제 위협을 가리킬 수
있고, 엄밀한 논문이 순수한 off-list noise일 수 있다). Axis A는 finding이 *흐를지/어디로* 흐를지를 결정한다. Axis B는 *어떻게*
처리될지를 게이팅한다.

### 3.1 Axis A — relevance class (watch list 대비)
좁은 watch list(brief §6)에 기준을 둔다.

| Class | 정의 | 기본 disposition |
|---|---|---|
| **novelty-threat** | CAW-03 claim 또는 우리 전략 축을 그럴듯하게 겹치거나 선점함 | route → CAW-03 (advisory) + open-question; **항상 queue**; recall 우선 |
| **support** | 인용 가능한 related work, baseline, 입증 결과 | route → knowledge (CAW-02 Source/Claim/RelatedWork) |
| **adjacent** | 주제와 관련된 맥락 / future-axis, 직접적인 threat/support는 아님 | route → knowledge (낮은 우선순위) 또는 experiment idea |
| **noise** | off-list, 중복 관점, 신뢰도 낮은 마케팅 | route → discard (tombstone 기록, 절대 hard-delete 안 함) |

### 3.2 Axis B — signal vs hype (실질성, 0–1, bucket화)
ADR-0003 source-trust prior(`arXiv/conf ≈ high`, `lab blog/GitHub ≈ medium`, `HN/Reddit/newsletter ≈ low`)로 시드되며 —
**LLM이 재도출하는 것이 아니라 그대로 전달됨** — 그 후 저렴하고 설명 가능한 feature로 조정된다.

| 높임 (→ `signal`) | 낮춤 (→ `hype`) |
|---|---|
| arXiv/peer-reviewed + code/artifact; 재현 가능 | 보도자료 / 출시 블로그, 방법론 없음 |
| 구체적 수치 + 방법론 + baseline | 측정 없는 최상급 표현("revolutionary", "10x") |
| 명명된 watch-list 저자 (예: Rhu) | 익명 / aggregator의 재게시의 재게시 |
| primary source | N차 요약; primary를 이미 보유 |

Bucket: `hype | mixed | signal` (cut point은 상수가 아니라 config — TODO(open-question)). Axis B는 단독으로 finding을
`discard`로 보내지 않는다 — `novelty-threat × hype` finding도 여전히 노출된다(recall floor).

## 4. 분류된 finding 레코드
각 finding이 생성하는 단일 레코드이며, ledger에 기록된다. LLM이 생성한 모든 필드는 플래그가 붙어 review와 import하는
제품이 생성된 콘텐츠와 사실을 구분할 수 있게 한다.

```yaml
classified_finding:
  finding_id: caw05-fnd-0001
  provenance:                       # carried from ingestion; NEVER synthesized
    source_family: arxiv|lab-blog|github|hn|reddit|securities|newsletter
    origin_url: https://arxiv.org/abs/...
    retrieved_at: <RFC3339>
    boundary: public                # brief §7; v1 ingest is public-only
    source_trust_prior: high|medium|low
    dedup_key: sha256:...           # set upstream; classifier does not re-dedup
  relevance:
    class: novelty-threat|support|adjacent|noise
    watchlist_hits: [memory-centric-dse, chakra]   # which interests matched
    confidence: 0.0-1.0             # calibrated (§6)
  signal:
    score: 0.0-1.0
    bucket: hype|mixed|signal
  rationale_note:                   # GENERATED — evidence=false, never backs a claim
    text: "Matches Chakra trace line; overlaps planned claim P1-ladder"
    model: { name: TODO, version: TODO, prompt_hash: sha256:... }
    evidence: false
  method:
    labeler: lf|lf+llm|llm|human    # provenance of the LABEL itself
    self_consistency: { samples: 3, agreement: 0.67 }
    abstained: false
  review:
    state: auto-accepted|queued|human-confirmed|human-overridden
    reviewer: jimmy|null
    decided_at: <RFC3339>|null
  routing:
    decision: knowledge|task|experiment|open-question|discard
    targets: [caw02, caw03]         # export adapters; explicit boundaries
    digest_eligible: true
```
형태의 불변식: `provenance`/`dedup_key`는 upstream에서 온 읽기 전용 사실이다. `rationale_note.evidence=false`는 §1 규칙을
데이터로 표현한 것이다. `method`/`review`는 라벨의 작성 주체를 end-to-end로 감사 가능하게 만든다.

## 5. LF→LLM→human cascade
저렴 → 비싼 순서로, 대부분의 finding은 규칙에서 정리되고, LLM은 불확실성에만 사용되며, human은 §6이 선택한 일부에만 쓰인다.

| 단계 | 실행 트리거 | 출력 | 비용 자세 |
|---|---|---|---|
| **1. Labeling functions** | 항상 | first-pass class + LF별 표 + signal features | 저렴, deterministic |
| **2. LLM judge** (Classifier port) | LF가 weak / 충돌 / watch-list near-miss일 때 | 두 축 + `rationale_note`, N개 샘플의 `agreement` | 계측됨(N회 호출) |
| **3. Human review** | §6 review 일부만 | confirm / override → labeled example | 희소 |

**1단계 — labeling functions.** Deterministic하고 high-precision한 규칙: watch-list 키워드/저자/venue regex →
`novelty-threat` 후보; 알려진 aggregator 도메인 → `noise` 후보; `has-code`/`has-numbers`/`has-baseline` → signal++.
Snorkel 스타일: 노이즈가 있는 LF들을 결합하고, 그 agreement를 confidence feature로 유지한다. **핵심 recall 규칙:
watch-list 용어에 대한 LF miss는 LLM으로 떨어진다 — 절대 `noise`로 기본 처리되지 않는다.**

**2단계 — LLM judge.** LF가 weak/충돌/near-miss일 때만 호출된다. 하나의 prompt가 **두 축 + rationale**을 반환한다.
**N개의 self-consistent 샘플**을 실행하고 **agreement rate를 raw confidence 신호로 사용**한다(LLM-as-judge는 seed에 걸쳐
self-inconsistent하므로 단일 샘플은 절대 신뢰하지 않는다). `model.version` + `prompt_hash`를 기록한다. Verbalized/token-prob
confidence는 로깅하되 약하고 미보정된 보조 신호로 취급한다.

**3단계 — human review.** 리뷰어가 confirm 또는 override한다. 모든 override는 LF를 튜닝하고 gate를 재보정하는 labeled
example이 된다(active learning).

## 6. Selective-review gate (recall-biased)
Selective prediction: high-confidence 라벨은 auto-accept하고, 그렇지 않으면 **abstain → human**, **절대 silent-discard
안 함**. 비대칭 비용(brief §1)은 false positive가 리뷰어에게 몇 초를 쓰게 하지만 false negative는 novelty를 지울 수 있음을
의미한다.

| 보정된 confidence | Class | 동작 |
|---|---|---|
| high (≥ `τ_high`) | support / adjacent / noise | **auto-accept**, route |
| any | **novelty-threat** | **항상 queue** (high-conf이어도) — 존재론적 비용 |
| mid (`τ_low`–`τ_high`) | any | **queue** — 모델 불확실 |
| low (< `τ_low`) **또는** self-consistency 불일치 | any | **abstain → queue**; 절대 discard 안 함 |

- **Recall-first floor.** watch-list에 1개 이상 hit한 finding은 **절대로** `noise`로 auto-discard되지 않는다 — queue된다
  (ADR-0002의 surface-not-drop floor를 따른다).
- **Calibration.** raw 점수(LF agreement, N-sample self-consistency, watch-list specificity, source-trust prior,
  verbalized confidence)를 Jimmy의 confirm/override 이력에 대한 작은 로지스틱 fit으로 보정된 확률에 매핑한다. ECE를
  추적하고, override rate가 drift하면 재보정한다. 약 50–100개의 라벨이면 임계값이 의미를 갖는다.
- **`τ_high` / `τ_low` / `N`은 상수가 아니라 config** — 보수적으로 시작하고 override log에서 튜닝한다.
  TODO(open-question: 초기값 — 경험적으로 설정; 하드코딩 금지.)
- **Export gate.** `review.state ∈ {auto-accepted, human-confirmed, human-overridden}`이 되기 전까지는 아무것도
  export되지 않는다(ADR-0001의 proposal-only `confirm`/`export` op로 강제). Queue된 항목은 digest의 "needs-review"
  섹션에 노출된다. `novelty-threat`는 동일 cycle 내 review를 위해 플래그된다.

## 7. Deterministic routing 엔진
Routing은 명명된 **triage profile**(`profile: narrow-radar-weekly`)이 선택하는 **`(relevance class, signal bucket,
review state)`의 deterministic 함수**다. 새 watch-list 라인이나 export target은 core 수정이 아니라 새 profile 행이다.
하나의 finding은 **여러 route**를 탈 수 있다.

| Relevance | Signal | Disposition | Export target(s) |
|---|---|---|---|
| novelty-threat | signal/mixed | **open-question** + flag | **CAW-03** (advisory) + **CAW-01/CAW-06** |
| novelty-threat | hype | **open-question** (낮은 우선순위) | CAW-03 — 여전히 노출됨(recall floor), low-signal로 표기 |
| support | signal | **knowledge** | **CAW-02** (Source/Claim/RelatedWork) |
| support | mixed/hype | **knowledge** (watch-list만) 그 외 discard | CAW-02 |
| adjacent | signal | **knowledge** (낮은 우선순위) 또는 **experiment** | CAW-02; experiment-idea note |
| adjacent | mixed/hype | **discard** (기록됨) | — watch-list hit이 아니면 → queue |
| noise | any | **discard** (tombstone 기록) | — dedup + audit용으로 보관 |
| (actionable, any) | — | **task** | CAW-06 / action-brief |

brief의 다섯 route로의 매핑: **knowledge → CAW-02**; **open-question → CAW-01 + CAW-06**; **task → CAW-06 /
action-brief**; **experiment → experiment-idea note** (digest; CAW-01 입력 후보); **discard → logged tombstone**
(dedup + audit, 절대 hard-delete 안 함). Routing은 중립적인 `routed_finding`을 방출한다. target별 bundle 형태는 각
`ExportAdapter`에 있다(classifier는 다른 제품의 스키마를 import하지 않는다 —
[./related-work-ledger.md](./related-work-ledger_ko.md) §4 참고).

## 8. 빌더 수용 기준 — negative 테스트 (반드시 유지)
| ID | 시나리오 | 요구되는 동작 |
|---|---|---|
| N1 | watch-list hit이 있는 high-confidence `noise` | **queue**, discard 아님 (recall floor) |
| N2 | `rationale_note`를 claim의 evidence로 전달 | **거부됨** (`evidence=false`) |
| N3 | `review.state` 확정 전에 export 시도 | **거부됨** |
| N4 | watch-list 용어에 대한 LF miss | LLM으로 떨어짐, **절대** `noise`로 기본 처리 안 됨 |
| N5 | single-sample LLM 실행을 최종으로 방출 | **거부됨** (N≥2 self-consistency 필요) |

## Open Questions
- TODO(open-question: 초기 `τ_high`/`τ_low`와 `N` — 첫 몇 주의 override log에서; 하드코딩 금지.)
- TODO(open-question: signal-vs-hype를 단일 점수로 줄지, 아니면 리뷰어에게 feature별 벡터로 줄지? 선호: 점수 + top features.)
- TODO(open-question: judge 단계에 어떤 LLM/model + prompt를 쓸지, local인지 API인지? cost/latency + claude-api 선택과 교차됨.)
- TODO(open-question: `task`/`experiment` route가 v1에서 export되는지, 아니면 CAW-01/CAW-06 계약이 확정될 때까지 digest에만 나타나는지?)
- TODO(open-question: `discard` tombstone의 retention/TTL — dedup 메모리 + audit window.)
- TODO(open-question: 다중 라벨 relevance — 하나의 finding이 `support`이면서 동시에 `novelty-threat`일 수 있는가? 선호: 가능, 집합으로 저장하고 합집합으로 route.)
- TODO(open-question: 기밀 review 맥락을 public을 향하는 모델로 누출하지 않으면서 calibration 데이터를 수집하기.)
- [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) 참고 (생성 예정).

## 런북에 대한 함의
- **RB (labeling functions):** watch-list LF(키워드/저자/venue regex, aggregator-domain noise 규칙,
  has-code/has-numbers/has-baseline signal feature); LF miss → LLM, 절대 `noise` 아님; feature + LF별 표 방출.
- **RB (LLM classifier):** 하나의 prompt → 두 축 + rationale; N self-consistent 샘플; `agreement`,
  `model.version`, `prompt_hash` 기록; rationale를 `Note(evidence=false)`로 저장. 수용: N5.
- **RB (confidence + review queue):** 보정된 로지스틱 점수화(ECE 추적); §6에 따른 selective gate; watch-list hit을
  절대 auto-discard 안 함; `novelty-threat`는 항상 queue; `review.state` 영속화; confirm 전 export 차단.
- **RB (routing engine):** §7을 config 선택 triage profile로; multi-route; 중립적인 `routed_finding`.
  수용: §7 각 행 + N1–N3.
- **RB (ports/config):** Classifier + Routing을 port 뒤에; profile + 임계값을 config에; 두 §1 불변식이 모든 profile에 걸쳐 유지됨.
