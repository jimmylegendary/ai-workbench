# Patent Drafting (특허 작성)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF_ko.md), [./paper-orchestra-engine.md](./paperorchestra-integration_ko.md), [../03-architecture/ports-and-adapters.md](../05-harness-core/ports-and-adapters_ko.md), [../05-harness-core/evidence-gate.md](../05-harness-core/evidence-gate-and-claim-ledger_ko.md), [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적
이 문서는 CAW-03이 **patent 작성**을 paper 작성과 구별되는 경로로 다루는 방법을 결정한다: claim 구조(independent/dependent), specification, prior-art 검색, patentability 평가, 그리고 **patent-first 처리**(publish 전에 출원). 교체 가능한 `PatentEngine` port 뒤에서 **v1 baseline `PatentEngineAdapter`**(LLM-assisted draft + 필수 human gate)를 정의하고, 향후 외부 patent 도구를 위한 이음새를 정의한다.

다음은 **하지 않는다**: 법률 자문 제공, 관할권별 출원 절차 정의, 출원 connector 구축. 모든 법적 절차 세부사항은 `TODO(open-question)`으로 표시되어 자격 있는 법률 자문에게 위임된다. PaperOrchestra(paper용 `WritingEngine`)는 **papers-only**이며 patent 작성에는 결코 사용되지 않는다 — patent는 자체 엔진을 갖는다.

## 1. patent가 별도 경로인 이유 (paper의 변형이 아니라)
브리프(§3, §6)는 paper와 patent를 **공유된 앞단, 구별된 뒷단(shared front, distinct back)** 으로 고정한다: 둘은 claim/evidence 선택과 novelty 점검을 공유하지만, 작성과 gating에서 갈라진다. 그 차이는 표면적인 것이 아니다 — PaperOrchestra가 내장하는 여러 기본값을 뒤집는다.

### Paper vs. patent 차이

| Dimension | Paper (PaperOrchestra) | Patent (PatentEngine) |
| --- | --- | --- |
| **주요 목표** | 동료를 설득하고 소통; 명료성/영향력 극대화 | 법적으로 집행 가능한 boundary 정의; 방어 가능한 범위 극대화 |
| **핵심 산출물** | 서술 섹션 + figures + 검증된 citations | **Claim set**(법적 핵심) + specification + 도면 |
| **대상 독자** | 리뷰어, 연구자 | 특허 심사관, 법원, 경쟁자(design-around) |
| **Novelty 입장** | prior work를 인용하고 그 위에 구축(≥90% pool 사용) | prior art와 **구별**; 하나의 누락 요소가 35 USC 102 novelty를 통과시킴 |
| **공개 시점** | 가능한 한 빨리 publish(우선권 = 인정) | **어떤 공개보다도 먼저 출원**(publish = 법정 장벽 / 권리 상실) |
| **"더 상세히" 압력** | page limit에 맞춰 다듬음 | Enablement: *make and use*가 가능할 만큼 충분히 공개; 넓은 claim + 다수의 fallback embodiment |
| **언어** | 읽기 쉬운 산문, hedging 허용 | 정밀한 claim 언어, 단일 문장 claim, antecedent basis, 모호성 없음 |
| **Citations** | Semantic Scholar로 검증된 BibTeX | Prior-art 참조(특허 + NPL)를 구별을 위해 인용, 공로 인정이 아님 |
| **Refinement loop** | 모의 peer review(content-refinement-agent) | Patentability/명료성 비평 + **변호사 검토**(필수, 선택 아님) |
| **생성된 텍스트의 증거성** | 결코 evidence가 아님(브리프 §3, §10) | 동일한 규칙 — 생성된 claim은 *draft*일 뿐 결코 출원이 아님 |
| **실패 양상** | 약한 리뷰, 거절(재제출) | **회복 불가능**: 조기 공개는 영구히 특허 취득을 막을 수 있음 |

마지막 행이 CAW-03에 soft preference가 아니라 hard gate가 필요한 이유다: paper 실수는 회복 가능하지만, patent 공개 실수는 권리를 파괴할 수 있다. 이것이 patent가 cleared될 때까지 **publish-block**과 함께 별도 라이프사이클에 놓이는 핵심(load-bearing) 이유다.

## 2. patent 해부 (PatentEngine이 산출해야 하는 것)
patent draft는 자유로운 산문이 아니라 구조화된 법적 문서다. v1 adapter는 다음 부분들을 목표로 한다:

- **Title** — 짧고 서술적.
- **Field & Background** — 기술 분야; prior art가 미해결로 남긴 문제(틀을 잡되, 너무 많이 인정하지 말 것).
- **Summary** — independent claim에 정렬된, 발명에 대한 평이한 진술.
- **Detailed Description / Specification** — enabling disclosure: 발명을 make and use 하는 방법을, dependent claim과 design-around가 뒷받침되도록 다수의 **embodiment**와 fallback 변형과 함께 기술. 모든 claim 용어에 대한 **antecedent basis**를 제공해야 함.
- **Drawings** — reference numeral이 있는 figures; 발명이 도식화 가능한 구조를 가진 method/tool인 경우 CAW-01 result registry / figure 매니페스트에서 매핑.
- **Claims** — 집행 가능한 핵심(§3 참조).
- **Abstract** — ≤150 단어의 기술 요약.

### Claim 구조 (independent / dependent)
- **Independent claims**는 독립적으로 성립하며 **가장 넓게 방어 가능한** 용어로 발명을 정의한다. 좋은 것은 (a) 실제 embodiment에 부합하고(집행 가능), (b) 가능성 있는 design-around에 부합하며, (c) 어떤 단일 prior-art 참조에도 부합하지 **않는다**(anticipation 회피). 소프트웨어/AI 발명에서는 보통 method, apparatus/system, CRM(computer-readable-medium) 변형으로 작성된다.
- **Dependent claims**는 앞선 claim을 참조하고 한정(narrowing) 한정사항을 추가한다 — 가장 넓은 것에서 가장 좁은 것으로의 **ladder**. 이들은 fallback 입장이다: 넓은 claim이 무효화되면 더 좁은 것이 살아남을 수 있다. 각 한정사항은 specification에 의해 뒷받침되어야 한다.
- **Claim-element ↔ evidence/specification 매핑**: 모든 claim element는 (a) enablement를 위한 specification 뒷받침과 (b) — CAW-03의 거버넌스에서 — claim ledger의 **evidence-gated claim**(브리프 §3)으로 추적되어야 한다. 증거 뒷받침이 없는 element는 draft claim에 진입할 수 없다.

`TODO(open-question: claim count, jurisdiction-specific formalities (USPTO vs EPO vs KIPO), means-plus-function §112(f) usage, and multiple-dependent-claim fees are legal-process specifics — defer to counsel.)`

## 3. Patentability 평가 (작성 전 스크린)
작성 이전에, harness는 후보 claim/evidence 번들에 대해 **patentability 스크린**을 실행한다. 이는 공유된 novelty 앞단(브리프 §3)에 patent 특유의 테스트를 더해 재사용한다:

| Test | Question | CAW-03 input source |
| --- | --- | --- |
| **Novelty (102)** | 어떤 *단일* prior-art 참조가 모든 요소를 공개하는가? | Novelty/RadarAdapter (related-work + CAW-05 threat signals) |
| **Non-obviousness (103)** | 숙련된 사람에게 참조들의 자명한 조합인가? | Novelty/RadarAdapter + 인간 판단 |
| **Eligibility (101)** | 특허 대상 적격인가(특히 software/AI abstract-idea 위험)? | `TODO(open-question: 101 analysis is legal)` |
| **Enablement / written description** | 증거가 make & use를 뒷받침하는가? | Evidence gate + result registry 참조 |
| **Utility** | 유용한 무언가를 하는가? | Claim ledger (P1/P2 method/tool claims) |

브리프의 claim 타이핑이 직접 매핑된다: **P1/P2 method/tool** claim은 특허 가능한 기반이고; **P3 future-device** claim은 투영(projection)이며 reduce to practice 되거나 구성적으로 enable 되기 전까지는 일반적으로 독립적으로 특허 불가능하다 — P3는 `requires-enablement-review`로 플래그한다. 스크린은 근거와 함께 `patentability: {recommend | weak | no-go}` 판정을 출력한다; `no-go`는 실패한 evidence gate와 마찬가지로 작성을 차단한다.

## 4. Patent-first 처리 (publish 전에 출원)
이것은 patent 경로 고유의 거버넌스 기능이며 cross-engine interlock의 이유다.

**규칙:** claim이 Novelty/claim-boundary 검사기(브리프 §3)에 의해 `patent-first`로 플래그되면, harness는 patent 출원(또는 명시적 waiver)이 기록될 때까지 **그 claim을 공개하는 모든 paper draft/publish를 차단**해야 한다. 어떤 공개든 — preprint, 발표, demo, on-sale — novelty 시계를 시작시키거나 날려버릴 수 있다.

설계를 형성하지만 **권위 있는 것은 아닌**(법률 자문이 결정한다) 근거 사실(US, AIA):
- US는 발명자 자신의 공개로부터 출원까지 **1년 유예기간**을 제공한다. 대부분의 US 외 관할권은 **절대 신규성(absolute novelty)**(유예 없음)을 요구한다 — 따라서 안전한 harness 기본값은 "1년 내 출원"이 아니라 **어떤 공개보다도 먼저 출원**이다. `TODO(open-question: which jurisdictions matter for SAIT/Samsung filings — drives grace policy.)`
- **가출원(provisional application)** 은 우선일을 저렴하게 확보하고 빠르게 출원할 수 있다; 이후의 정식 출원(non-provisional)은 가출원에 의해 완전히 뒷받침되어야 한다. harness는 "provisional filed"를 publish hold를 해제할 수 있는 유효 상태로 취급한다. `TODO(open-question: is provisional-first the chosen strategy? legal decision.)`

**Interlock 메커니즘(cross-port):**
- Sink/PublishAdapter(paper publish)는 release 이전에 각 claim의 `disclosure_status`를 조회한다.
- 상태: `clear`(publishable) | `patent-first-hold`(차단됨) | `filed:provisional` | `filed:nonprovisional` | `waived:<approver>`(Jimmy/법률 자문이 공개를 명시적으로 수용).
- `clear`, `filed:*`, 또는 `waived:*`만 publish를 허용한다. hold는 **default-deny**다.

## 5. Patent draft 라이프사이클
artifact 라이프사이클(브리프 §6)을 반영하되, patent 특유의 척추와 publish interlock을 갖는다:

```
candidate claim(s)            [from claim ledger, typed P1/P2/(P3 flagged)]
  -> evidence gate            [brief §3: insufficient evidence => cannot draft]
  -> patentability screen     [§3: novelty/obviousness/eligibility/enablement => {recommend|weak|no-go}]
       no-go --------------------------------------------------> STOP (record rationale)
  -> patent-first decision    [novelty/boundary checker sets disclosure_status]
  -> PatentEngine.draft()     [§6 port: LLM-assisted draft: spec + claims + abstract + drawing refs]
  -> review checklist         [patent-specific: claim clarity, antecedent basis, enablement, scope]
  -> HUMAN GATE (counsel)     [MANDATORY, non-bypassable; brief §9 non-goal: no autonomous filing]
  -> export patent draft doc  [Sink/PublishAdapter: document artifact, NOT a filing]
  -> (out of scope) filing    [external; on filing, set disclosure_status=filed:* -> releases publish hold]
```

patent artifact별 상태 기계: `candidate -> screened -> drafted -> in-review -> attorney-review -> ready-for-filing -> (filed | rejected | abandoned)`. provenance는 처음부터 끝까지 보존된다(브리프 §6). harness는 `ready-for-filing`까지의 상태를 소유한다; **출원 자체는 v1 범위 밖**(브리프 §9)이며 향후 Sink adapter다.

## 6. `PatentEngine` port 표면
capability/config descriptor를 가진 타입이 지정된 인터페이스다; adapter는 hard-code 되지 않고 **config에 의해 등록되고 선택된다**(브리프 §5). harness 코어는 이 port에만 의존한다. v1 `PatentEngineAdapter`는 LLM-assisted drafter다; 향후 adapter(예: Rowan Patent, PatentPal, 특허 corpus 위의 LLM+RAG, 또는 로펌 도구)는 동일한 계약을 구현한다.

```python
# Port: PatentEngine  (parallel to WritingEngine; patents only)
class PatentDraftRequest:
    claims: list[LedgerClaimRef]      # evidence-gated, typed P1/P2/(P3 flagged); core source of truth
    evidence_bundle: EvidenceRef      # from SourceAdapter (CAW-02 import); enablement support
    figures: list[FigureRef]          # from result registry / figure manifest (CAW-01 import)
    prior_art: list[PriorArtRef]      # from Novelty/RadarAdapter; references to distinguish
    patentability: PatentabilityVerdict
    template: PatentTemplateRef       # spec/claims skeleton; jurisdiction-tagged (default = generic)
    config: PatentEngineConfig        # selected adapter + options

class PatentDraft:
    spec: SpecificationDoc            # field/background/summary/detailed-description
    claims: ClaimSet                  # independent[] + dependent[] (ladder), element->support map
    abstract: str
    drawing_refs: list[FigureRef]
    open_items: list[str]             # gaps the human/attorney must resolve
    provenance: ProvenanceTrace       # claim->evidence->draft lineage

class PatentEngine(Port):
    def capabilities(self) -> CapabilityDescriptor: ...   # jurisdictions, claim types, max claims, needs_human
    def screen(self, req: PatentDraftRequest) -> PatentabilityVerdict: ...  # optional; harness may own this
    def draft(self, req: PatentDraftRequest) -> PatentDraft: ...           # LLM-assisted; NEVER auto-files
    def review_checklist(self, draft: PatentDraft) -> list[CheckResult]: ...# clarity/antecedent/enablement/scope
```

### v1 `PatentEngineAdapter` (실제로 구현되는 baseline)
- **하는 일:** gated claim + evidence + prior art로부터 request를 조립한 뒤, 구조화된 multi-call LLM이 (1) independent claims, (2) dependent-claim ladder, (3) 모든 claim 용어에 대한 antecedent basis를 갖춘 specification, (4) abstract, (5) figure 매니페스트에 매핑된 drawing 참조를 작성한다. 뒷받침되지 않거나 모호한 모든 element에 대해 `open_items`를 방출한다.
- **하지 않는 일:** 법률 자문, eligibility/101 판정, 또는 출원. `capabilities().needs_human = True`는 고정이다 — human/attorney gate는 구조적으로 필수다(브리프 §9, §10).
- **v1에 "LLM-assisted draft + human gate"인 이유:** 외부 patent 서비스에 의존하지 않고 워크플로 이음새(port, lifecycle, publish interlock)를 증명하는 최저비용 슬라이스다. 실제 prior-art 검색 서비스나 변호사 도구는 나중에 코어 변경 없이 또 하나의 adapter로 들어온다.

### Tradeoff: 외부 patent 도구 구축 vs. 래핑 (v1)

| Option | Pros | Cons | Fit |
| --- | --- | --- | --- |
| **v1 LLM-assisted adapter (선택)** | 외부 의존성 없음; 이음새 증명; 저렴; 완전한 provenance | draft 품질이 전문 도구보다 낮음; 무거운 human review 필요 | **v1 슬라이스에 최적** |
| 지금 외부 patent SaaS 래핑 | 높은 draft 품질, 실제 prior-art DB | 벤더 lock-in, 비용, 법무/기밀 검토, v1 지연 | 향후 adapter(port만) |
| v1에 patent 경로 없음 | 가장 단순 | 브리프 §3/§6 위반; patent-first interlock 미구축 | 거절됨 |

## 7. 일반화 / 커스터마이즈 가능성 (이음새)
- **PatentEngine은 WritingEngine과 정확히 같은 방식으로 교체 가능하다:** 동일한 registration-by-config 패턴; 향후 도구는 각각 하나의 adapter다(브리프 §5).
- **Prior-art는 벤더가 아니라 port다:** `prior_art` 입력은 Novelty/RadarAdapter를 통해 도착한다 — v1은 related-work + CAW-05 import를 사용하고; 실시간 prior-art/patent 검색 서비스는 동일한 계약 뒤의 향후 adapter다.
- **Jurisdiction은 코드가 아니라 config다:** template과 grace/absolute-novelty 정책은 config descriptor이므로 KIPO/USPTO/EPO 동작은 재설계가 아니라 프로파일 교체다. 기본값은 보수적이다(file-before-disclose).
- **출원은 향후 Sink adapter다:** v1은 draft 문서에서 멈춘다; `filed:*` 상태 전이는 설계되어 있으나 연결되지 않았다(브리프 §9 non-goal).

## Open Questions
[../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) 참조.
- `TODO(open-question)` SAIT/Samsung 출원을 어느 관할권이 관장하는가? grace-period vs absolute-novelty 기본값과 template 프로파일을 결정한다.
- `TODO(open-question)` **provisional-first**가 선택된 우선권 전략인가? publish hold가 언제 해제될 수 있는지를 바꾼다.
- `TODO(open-question)` 권위 있는 human gate는 누구인가 — 내부 IP 팀, 외부 법률 자문, 또는 둘 다 — 그리고 `ready-for-filing` draft에 대한 SLA/handoff 형식은 무엇인가?
- `TODO(open-question)` AI/software claim에 대한 101/eligibility 분석은 법적이다; harness가 위험을 *플래그*라도 할 수 있는가, 아니면 침묵하고 전적으로 위임해야 하는가?
- `TODO(open-question)` 기밀성: patent draft는 출원 전 비밀을 담는다 — confidentiality 필터(브리프 §3)에 public-safe vs internal-review를 넘어선 더 엄격한 "pre-filing / attorney-eyes-only" 계층이 필요한가?
- `TODO(open-question)` CAW-03이 patentability `screen()`을 소유하는가, 아니면 PatentEngine adapter에 위임하는가?

## 런북(runbooks)에 대한 함의
- **RB (patent path):** `PatentEngine` port + v1 `PatentEngineAdapter`(LLM-assisted draft)를 `needs_human=True` non-bypassable로 구현하고; WritingEngine과 나란히 config로 등록한다.
- **RB (lifecycle/state machine):** paper의 것과 구별되는 patent artifact 상태 기계(§5)를 추가한다; 둘은 앞단(evidence gate, novelty)을 공유한다.
- **RB (publish interlock):** Sink/PublishAdapter는 `disclosure_status`를 점검하고 `patent-first-hold`에 대해 **default-deny** 해야 한다; `clear | filed:* | waived:*`만 release한다. 이것은 cross-port guard다 — adapter 내부가 아니라 harness 코어 로직으로 구축한다.
- **RB (review checklist):** paper review checklist와 분리된 patent 특유의 checklist(claim clarity, antecedent basis, enablement, scope, independent/dependent ladder integrity).
- **filing Sink adapter**와 **external patent tooling adapter**는 브리프 §5에 따라 문서화된 stub(인터페이스 + not-implemented 마커 + config 예시)으로 남겨 둔다.

## Sources (근거, 권위 없음 — 법률 자문 아님)
- [PatentPC — How to Write a Strong Patent Claim](https://patentpc.com/blog/how-to-write-a-strong-patent-claim-best-practices)
- [PatentPC — Types of Patent Claims](https://patentpc.com/blog/understanding-the-different-types-of-patent-claims-2)
- [USPTO — Provisional Application for Patent](https://www.uspto.gov/patents/basics/apply/provisional-application)
- [patentlawyer.io — 35 USC 102 Novelty and Prior Art](https://patentlawyer.io/35-usc-102-novelty-and-prior-art/)
- [Mewburn — Grace Periods for Disclosure Before Applying](https://www.mewburn.com/law-practice-library/grace-periods-for-disclosure-of-an-invention-before-applying-for-a-patent)
