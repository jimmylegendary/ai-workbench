# ADR-0004: Classification & triage — 2축 taxonomy, LF+LLM cascade, recall 편향 review, config 구동 라우팅

- **Status:** proposed
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF_ko.md) (단일 진실 공급원)
  - [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS_ko.md)
  - [ADR-0001-product-surface-and-outputs_ko.md](ADR-0001-product-surface-and-outputs_ko.md) (`confirm`/`export` review gate; digest가 rationale 렌더링)
  - [ADR-0002-interest-model_ko.md](ADR-0002-interest-model_ko.md) (relevance score + recall floor가 classification에 공급)
  - [ADR-0003-source-adapters-and-ingestion_ko.md](ADR-0003-source-adapters-and-ingestion_ko.md) (deduped finding + trust prior)
  - [../02-research/classification-and-triage_ko.md](../02-research/classification-and-triage_ko.md) (taxonomy, cascade, confidence 모델, 라우팅 매트릭스)
  - [../02-research/related-work-ledger_ko.md](../02-research/related-work-ledger_ko.md) (라우팅이 기록하는 ledger + export bundle)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적(Purpose)
**CAW-05가 각 finding을 어떻게 분류하고 라우팅하는지**를 결정한다: **2축 taxonomy**
(`novelty-threat / support / adjacent / noise` relevance class **그리고** 직교하는 `signal-vs-hype` 점수),
라벨을 할당하는 **LF + LLM + human cascade**, **recall 편향 selective-review** 모델, 그리고 CAW-01/02/03/06로의
export와 함께 `knowledge / task / experiment / open-question / discard`로의 **config 구동 라우팅**. 이 문서는
그것이 소비하는 interest/relevance 랭킹(ADR-0002), ingestion/dedup(ADR-0003), ledger 스키마나 export 와이어
포맷(안정적 경계로 소비), synthesis를 결정하지 **않는다**. 이 문서는 deduped, 점수화된, provenance를 가진
finding이 이미 존재한다고 가정한다.

## 맥락(Context)
- **단 하나의 타협 불가 규칙**(브리프 §11/§12): **classification은 제안이며, 결코 결정이 아니다; LLM의 라벨과
  rationale은 생성된 텍스트이지, evidence가 아니다.** 분류기는 class/confidence/rationale을 *부착*할 수 있으나,
  rationale은 결코 하류 주장을 뒷받침할 수 없는 `Note(evidence=false)`로 저장되며, 모든 라우팅된 출력은
  provenance를 담고, `novelty-threat` 경로는 CAW-03에 대해 **권고적(advisory)**이다(우리는 novelty가
  상실되었다고 결코 주장하지 않으며, 후보 가까운 결과가 존재한다고만 한다).
- **비대칭 비용**(§1): 놓친 `novelty-threat`는 false alarm보다 훨씬 나쁘다. 그래서 전체 파이프라인이 **recall
  편향**이다 — ADR-0002의 surface-not-drop floor를 상속하고 never-silent-discard 규칙을 추가한다.
- 두 축은 **직교**한다(classification 연구 §2): hype가 많은 블로그도 여전히 실제 novelty-threat를 가리킬 수
  있다; 엄격한 논문도 순수한 off-watch-list noise일 수 있다. 둘을 합치면 정보를 잃는다.
- ADR-0003의 소스별 `trust` prior가 signal 축을 시드한다(`arXiv/conf ≈ high`, `lab blog/GitHub ≈ medium`,
  `HN/Reddit/newsletter ≈ low`) — LLM이 **재유도하지 않고 운반**.
- 분류기와 라우팅은 **포트 뒤의 정책 객체**다(§5, §9): 미래 모델은 같은 `finding → {relevance, signal,
  confidence, rationale_note}` 형태를 만족한다; 라우팅은 명명된, config 선택 프로필이다.

## 고려된 옵션(Options considered)

### A. Taxonomy 형태
| 옵션 | 장점 | 단점 | 적합도 |
|---|---|---|---|
| **두 직교 축: relevance class(4) × signal-vs-hype(0–1 버킷화)** | "실제이나 hype된" 것과 "엄격하나 무관한" 것을 구분 유지; finding이 흐르는 *방식* vs *여부*를 게이트 | 할당/검토할 라벨 둘 | **선택됨** |
| 단일 결합 relevance+credibility 라벨 | 상태 적음 | 실질을 relevance와 혼동 → 실제 위협을 가리키는 hype된 포인터 상실 | 거부됨 |

### B. Classification 파이프라인
| 옵션 | 장점 | 단점 | 적합도 |
|---|---|---|---|
| **3단계 cascade: labeling functions → self-consistent LLM judge(N 샘플) → selective human review** | 저렴→고비용; 대부분 finding은 LLM에 도달하지 않고, LLM은 불확실하지 않으면 human에 도달하지 않음; LF 합의 + LLM self-consistency = confidence 신호 | cascade + 캘리브레이션 구축 필요 | **선택됨** |
| 모든 finding에 LLM 전용 | 단순 배선 | 고비용; seed 간 self-inconsistent; 저렴한 설명가능 첫 통과 없음 | 거부됨 |
| 규칙 전용 | 저렴, 설명가능 | 취약; near-phrasing 놓침 → 좁은 리스트에서 recall 위험 | 거부됨 |

### C. Review / confidence 모델
| 옵션 | 장점 | 단점 | 적합도 |
|---|---|---|---|
| **Selective prediction: 높은 confidence는 auto-accept; 낮으면 abstain→human; ALWAYS novelty-threat 큐잉; watch-list 적중을 결코 auto-discard 안 함** | recall 우선; 비대칭 비용 준수; 캘리브레이션된 임계값 = 실제 손잡이 | 캘리브레이션 fit + 검토자 시간 필요 | **선택됨** |
| 모든 것 auto-accept | human 부하 제로 | 조용한 잘못된 `noise` = 논문 누락 = 존재론적 | 거부됨 |
| 모든 것 human-review | 최대 precision | 자동화를 무효화; 확장 불가 | 거부됨 |

### D. 라우팅
| 옵션 | 장점 | 단점 | 적합도 |
|---|---|---|---|
| **결정론적 config 선택 triage 프로필: `(relevance, signal, review state) → disposition + export target(s)`; 다중 경로 허용** | 감사 가능; 새 watch-list 라인/타겟 = 새 프로필 행, 코어 편집 아님; 하나의 finding이 여러 타겟으로 라우팅 가능 | 유지할 프로필 표 | **선택됨** |
| 하드코딩된 라우팅 로직 | 직접적 | 모든 새 타겟/라인 = 코어 변경; §9 이음새 아님 | 거부됨 |

## 결정(Decision)
**LF→LLM→human cascade가 할당하는 2축 taxonomy, recall 편향 selective-review gate, 그리고 결정론적 config 구동
라우팅 — 모두 classifier/routing 포트 뒤에, 생성된 rationale은 결코 evidence가 아니고 novelty-threat는 결코
조용히 폐기되지 않음.**

1. **Taxonomy(두 직교 축).** **축 A — relevance class** vs watch list:
   `novelty-threat | support | adjacent | noise`(정의 + 기본 disposition은 classification 연구 §2.1).
   **축 B — signal-vs-hype**(0–1, `hype | mixed | signal`으로 버킷화), ADR-0003 source-trust prior로 시드되고
   저렴한 설명가능 feature로 조정(has-code/numbers/method/baseline은 상향; 최상급 / press-release / N차 정보는
   하향). 축 B는 finding이 흐르는 *여부*가 아니라 *방식*을 게이트한다.
2. **Classified-finding 레코드(provenance 우선).** 분류기는 deduped, 점수화된 finding을 읽고 하나의 레코드를
   기록한다(classification 연구 §3): `provenance` + `dedup_key`(상류 사실, 결코 발명 안 함),
   `relevance{class, watchlist_hits, confidence}`, `signal{score, bucket}`,
   `rationale_note{text, model, evidence:false}`, `method{labeler, self_consistency, abstained}`,
   `review{state, reviewer, decided_at}`, `routing{decision, targets, digest_eligible}`.
   `rationale_note.evidence=false` 플래그는 데이터 모델에 인코딩된 §1 불변식이다.
3. **3단계 cascade.** (1) **Labeling functions** — 결정론적, 고-precision watch-list keyword/author/venue
   regex, 알려진-aggregator-domain `noise` 규칙, has-code/has-numbers signal feature; **watch-list term에
   대한 LF miss는 LLM으로 떨어지며, 결코 `noise`로 기본값화하지 않음**. (2) **LLM judge** — LF가
   약함/충돌/near-miss일 때 호출; 하나의 프롬프트가 **두 축 + rationale**을 반환, 합의가 raw confidence인 **N개
   self-consistent 샘플** 실행; 단일 샘플은 결코 신뢰되지 않음. (3) **Human review** — §5가 사람에게 라우팅하는
   슬라이스만; override는 LF/임계값 튜닝을 위한 라벨링된 예시가 됨.
4. **Recall 편향 selective review.** 높은 confidence의 `support/adjacent/noise`는 auto-accept; **항상
   `novelty-threat` 큐잉**(높은 confidence라도 — 존재론적 비용); 중간 confidence는 큐잉; **낮은 confidence나
   self-consistency 불일치 시 abstain→큐잉, 결코 silent-discard 안 함.** **Recall 우선 floor:** ≥1 watch-list
   적중을 가진 finding은 **결코 `noise`로 auto-discard되지 않음** — 큐잉됨(ADR-0002의 surface-not-drop 준수).
   Confidence는 **캘리브레이션**됨(Jimmy의 confirm/override 이력에 대한 작은 logistic fit; ECE 추적). `τ_high`/
   `τ_low`/`N`은 **상수가 아니라 config** — 보수적으로 시작하여 override 로그에서 튜닝. **`review.state ∈
   {auto-accepted, human-confirmed, human-overridden}`가 되기 전까지는 아무것도 export되지 않음**(ADR-0001의
   제안 전용 `confirm`/`export` 연산이 강제).
5. **Config 구동 라우팅.** 명명된 **triage 프로필**(`profile: narrow-radar-weekly`, classification 연구 §6)이
   선택하는 `(relevance class, signal bucket, review state)`의 결정론적 함수. 다섯 브리프 경로로의 매핑:
   **knowledge → CAW-02**(Source/Claim/RelatedWork); **open-question → CAW-01 + CAW-06**;
   **task → CAW-06 / action-brief**; **experiment → experiment-idea note**; **discard → 로깅된 tombstone**
   (dedup + 감사용 보관, 결코 hard-delete 안 함). `novelty-threat`는 **CAW-03**(권고적 novelty 신호) **그리고**
   CAW-01/CAW-06로의 open-question으로 라우팅 — 하나의 finding이 **여러 경로**를 취할 수 있음. 라우팅은 중립적
   `routed_finding`을 내보냄; 타겟별 bundle 형태는 각 `ExportAdapter`에 산다(분류기는 다른 제품의 스키마를 결코
   import하지 않음).
6. **어떤 프로필도 완화할 수 없는 불변식:** 생성된 rationale은 `evidence=false`이며, `novelty-threat`는 결코
   조용히 auto-discard되지 않는다.

## 결과(Consequences)
- **쉬움:** 대부분 finding은 저렴한 LF에서 정리됨; LLM과 human은 불확실성이 실제인 곳에만 소비됨; 독자는 명명된
  rationale + ADR-0002의 relevance_explain을 봄; 새 watch-list 라인이나 export 타겟은 코어 편집이 아니라
  프로필 행.
- **쉬움:** export 경계가 깔끔하게 유지됨 — CAW-02/03/01/06은 provenance + `evidence:false` rationale을
  받아 재분류함; CAW-05는 결코 그들의 저장소에 기록하지 않음(브리프 §8).
- **어려움 / 비용:** 캘리브레이션은 임계값이 의미를 갖기 전 ~50–100개 라벨링된 결정이 필요; LLM self-inconsistency가
  N-샘플 실행을 강제(비용/지연); LLM/모델 + 프롬프트 선택은 claude-api 결정을 가로지르는 미해결 질문.
- **후속:** ledger(related-work 연구)는 이것들을 append-only `LedgerLink`로 지속하고 export 전 Semantic
  Scholar를 통해 논문을 검증함; synthesis(synthesis 연구)는 확정된 finding을 provenance manifest와 함께 다섯
  포맷으로 렌더링함. Runbooks: labeling functions(LF miss → LLM, 결코 `noise` 아님); LLM 분류기(N 샘플,
  `prompt_hash`, rationale을 `Note(evidence=false)`로); confidence + review queue(캘리브레이션, watch-list
  적중 결코 auto-discard 안 함, confirm 전 export 차단); 라우팅 엔진(config 프로필, 다중 경로, 중립적
  `routed_finding`)과 네거티브 테스트 N1–N3.

## 미해결 질문 / 재검토 트리거(Open questions / revisit triggers)
- TODO(open-question: self-consistency를 위한 초기 `τ_high`/`τ_low`와 `N` — 첫 몇 주의 override 로그에서
  경험적으로 설정; 하드코딩하지 말 것.) [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md) 참조.
- TODO(open-question: signal-vs-hype가 단일 점수인가, 아니면 검토자에게 표면화되는 feature별 벡터인가? 경향:
  점수 + 상위 기여 feature.)
- TODO(open-question: judge 단계를 위한 어떤 LLM/모델 + 프롬프트, 로컬인가 API인가? 비용/지연과 claude-api
  선택을 가로지름 — 여기서 소유.)
- TODO(open-question: `task`/`experiment` 경로가 v1에서 어디로든 export되는가, 아니면 CAW-01/CAW-06 계약이
  굳어질 때까지 digest에만 등장하는가?)
- TODO(open-question: `discard` tombstone의 보존/TTL — dedup 메모리 + 감사를 위해 얼마나 오래?)
- TODO(open-question: 다중 라벨 relevance — 하나의 finding이 `support` AND `novelty-threat` 둘 다일 수
  있는가? 경향: 그렇다, 집합을 저장하고 합집합을 라우팅.)
- TODO(open-question: 기밀 검토 컨텍스트를 공개 대면 모델로 유출하지 않으면서 캘리브레이션 데이터 포착.)
- **재검토 트리거:** 프로필이나 표면이 `evidence=false`를 완화하거나 watch-list 적중을 auto-discard해야 한다면,
  멈춰라 — 그것이 어떤 프로필도 완화할 수 없는 단 하나의 불변식이다.
