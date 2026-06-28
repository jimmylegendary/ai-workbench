# ADR-0004: 필수 human gate를 갖춘 PatentEngine port 뒤의 별도 경로로서의 patent drafting

- Status: proposed
- Owner: Jimmy
- Last-reviewed: TODO(open-question: review 시 설정)
- Related:
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF_ko.md) (§3, §6, §9, §10)
  - [../02-research/patent-drafting.md](../02-research/patent-drafting_ko.md) (이 ADR이 ratify하는 연구)
  - [./ADR-0002-writing-engine-integration.md](./ADR-0002-writing-engine-integration_ko.md) (WritingEngine port — papers only)
  - [./ADR-0003-evidence-gate-and-claim-ledger.md](./ADR-0003-evidence-gate-and-claim-ledger_ko.md) (공유 front: gate + claim typing)
  - [./ADR-0005-ports-and-adapters.md](./ADR-0005-ports-and-adapters_ko.md) (registry, capability descriptors, stubs)
  - [./ADR-0006-paper-ladder-and-novelty.md](./ADR-0006-paper-ladder-and-novelty_ko.md) (patent-first flagging, novelty verdicts)
  - [./ADR-0007-confidentiality-and-boundary.md](./ADR-0007-confidentiality-and-boundary_ko.md) (publish interlock, counsel audience)
  - [./ADR-0008-artifact-lifecycle-and-storage.md](./ADR-0008-artifact-lifecycle-and-storage_ko.md) (patent artifact 상태 머신)
- Source of truth: ../_meta/PRODUCT-BRIEF.md

## Context

브리프(§3, §6)는 paper와 patent를 **공유 front, 구별된 back**으로 고정한다: 둘은 claim/evidence 선택과 novelty 검사를 공유하지만 drafting과 gating에서 갈라진다. PaperOrchestra(기본 `WritingEngine`, ADR-0002)는 **papers-only**다; claim set, specification, 또는 prior-art를 구별하는 논증을 생산하지 않으며, patent를 특별하게 만드는 단 하나의 failure mode를 모델링할 수 없다.

힘(forces):

- **Patent는 여러 PaperOrchestra 기본값을 뒤집는다.** 논문은 선행 연구를 소통하고 인용하여 그 위에 쌓는다(≥90% pool 사용); patent는 법적으로 강제 가능한 boundary를 정의하고 prior art와 *구별한다*(하나의 누락 요소가 35 USC 102 novelty를 통과시킨다). 논문은 page limit에 맞춰 다듬는다; patent는 *enable*해야 한다(만들고 사용하기에 충분히 공개, fallback embodiment 포함). 논문은 prose에서 hedge한다; patent는 antecedent basis를 가진 정확한 단문 claim이 필요하다.
- **failure mode가 회복 불가다.** 약한 논문은 재투고할 수 있다. 조기 public disclosure는 patenting을 영구히 차단할 수 있다(first-to-file 체제의 statutory bar). 이 비대칭이 *소프트* 선호가 아니라 *하드* gate를, 그리고 patent-first로 표시된 claim에 대해 paper publish를 차단하는 cross-engine interlock을 강제한다.
- **자율 filing 없음 (브리프 §9).** 생성된 claim은 *draft*이지 결코 filing이 아니다. 사람/변호사 결정이 구조적으로 요구된다.
- **v1에 외부 의존성 없음 (브리프 §10 — vertical slice).** seam(port, lifecycle, publish interlock)을 증명하는 가장 저렴한 slice는 wrapped patent SaaS가 아니라 in-house LLM-assisted drafter다.
- **Generated text는 결코 evidence가 아니다 (브리프 §3, §10; ADR-0003 §1).** 이 불변식은 patent 경로로 이어진다: 모든 claim element가 evidence-gated ledger claim으로 추적되어야 한다.

## Options considered

### A. patent 엔진 선택

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **v1 in-house LLM-assisted `PatentEngineAdapter` (chosen)** | 외부 의존성 없음; port/lifecycle/interlock seam 증명; 저렴; 완전한 provenance | draft 품질이 전문 도구보다 낮음; 무거운 human review 필요 | **v1 slice** |
| 지금 외부 patent SaaS 래핑 (Rowan/PatentPal/Lens) | 더 높은 draft 품질, 실제 prior-art DB | vendor lock, 비용, pre-filing 비밀이 외부로 나가는 confidentiality review, v1 지연 | Future adapter (port-only stub) |
| patent에 PaperOrchestra 재사용 | 엔진 하나 | 브리프 §6 위반; PO는 claim/spec을 draft하거나 prior art를 구별할 수 없음; 회복 불가 gate를 paper 엔진에 결합 | Rejected |
| v1에 patent 경로 없음 | 가장 단순 | 브리프 §3/§6 위반; patent-first interlock(load-bearing 안전 기능)이 미구축으로 남음 | Rejected |

### B. human gate가 자리하는 곳

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **harness 코어 내, 모든 Sink 이전의 필수 human gate (chosen)** | adapter를 swap해도 우회 불가; 단일 강제 지점 | 코어가 patent-specific 상태를 운반 | **Chosen** (ADR-0005와 일치: human gate는 코어에 머묾) |
| PatentEngine adapter 내부의 gate | adapter-로컬 | adapter가 스스로 비활성화 가능; ADR-0005 `requires_human_gate` 규칙 위반 | Rejected |
| filing connector에서의 gate | 단순 | filing은 v1 범위 밖; v1에서 아무것도 이를 강제하지 않음 | Rejected |

## Decision

**1. Patent는 자체 경로와 자체 engine port를 가진다.** `PatentEngine` port(ADR-0002의 `WritingEngine`과 병렬, 동일한 ADR-0005 registry에 등록, config로 선택)가 patent를 draft한다. PaperOrchestra는 결코 patent를 draft하는 데 사용되지 않는다. 두 경로는 **front를 공유**한다 — ADR-0003의 동일한 `GatedClaimSet`(evidence gate + P1/P2/P3 typing)과 ADR-0006의 동일한 novelty front — 그리고 **drafting과 gating에서 갈라진다**.

**2. v1 adapter는 in-house LLM-assisted drafter다.** `BaselinePatentDrafterAdapter`는 gated, typed claim + evidence(CAW-02 import) + figures(CAW-01 import) + prior art(Novelty/Radar port)로부터 request를 조립한 뒤, 구조화된 multi-call LLM이 draft한다: (1) independent claim(가장 넓은 방어 가능), (2) dependent-claim ladder, (3) **모든 claim term에 대한 antecedent basis**를 가진 specification, (4) abstract, (5) figure manifest에 매핑된 drawing reference. 모든 미지원 또는 모호한 element에 대해 `open_items[]` 리스트를 emit한다. 그 capability descriptor는 `needs_human = True`로 고정한다.

**3. Patent-first 처리는 코어에서 강제되는 cross-port interlock이다.** novelty/claim-boundary checker(ADR-0006)에 의해 `patent-first`로 flag된 claim은 `disclosure_status`를 운반한다. Sink/Publish 경로(paper publish)는 이를 질의하며 **default-deny**다: `clear`, `filed:provisional`, `filed:nonprovisional`, 또는 `waived:<approver>`만이 claim을 인용하는 public paper disclosure를 허용한다; `patent-first-hold`와 `defer`는 이를 차단한다. hold와 interlock은 어떤 adapter도 아닌 harness 코어 로직(ADR-0007 §2.3)에 자리한다. 보수적 기본값: "1년 내 file"이 아니라 **모든 disclosure 이전에 file**(대부분의 비-US 체제는 grace period가 없음).

**4. patent draft lifecycle은 `ready-for-filing`에서 끝난다; filing은 범위 밖이다.** patent artifact별 상태 머신: `candidate → screened → drafted → in-review → attorney-review → ready-for-filing → (filed | rejected | abandoned)`, ADR-0008의 통합 artifact lifecycle과 결합. harness는 `ready-for-filing`까지의 상태를 소유한다; 실제 filing은 **미래의 `PatentFilingSinkAdapter` stub**(브리프 §9)이다. filing이 기록되면 `disclosure_status`가 `filed:*`로 전이하여 paper publish hold를 해제한다.

**5. drafting 전에 patentability screen이 실행된다.** 공유 novelty front(102 novelty, Novelty/Radar를 통한 103 obviousness)에 patent-specific 테스트(evidence gate + result ref를 통한 enablement/written-description; P1/P2 typing을 통한 utility)를 더해 재사용한다. `{recommend | weak | no-go}`를 emit한다; `no-go`는 실패한 evidence gate와 똑같이 drafting을 차단한다. **101/eligibility는 법률 사안**이며 `TODO(open-question)`으로 남긴다 — harness는 최대한 위험을 flag할 뿐, eligibility를 결코 판정하지 않는다. CAW-03이 기본으로 screen을 소유한다; adapter는 `screen()`을 통해 override 가능하다.

**6. harness는 법률 자문을 제공하지 않는다.** 관할 formality, claim count, means-plus-function §112(f) 사용, grace-vs-absolute-novelty 정책, 그리고 "무엇이 disclosure로 인정되는가"는 config/`TODO(open-question)`으로 counsel에게 미룬다. 관할은 **config(template + policy profile)이지 code가 아니다**; 기본 profile은 보수적이다(file-before-disclose, generic template).

### Port surface (ratifies research §6)

```python
# Port: PatentEngine (parallel to WritingEngine; patents only). Registered + config-selected (ADR-0005).
class PatentDraftRequest:
    claims: list[LedgerClaimRef]       # evidence-gated, typed P1/P2/(P3 flagged) — the source of truth (ADR-0003)
    evidence_bundle: EvidenceRef       # CAW-02 import via SourceAdapter; enablement support
    figures: list[FigureRef]           # CAW-01 result registry / figure manifest
    prior_art: list[PriorArtRef]       # Novelty/Radar port; references to DISTINGUISH (not to credit)
    patentability: PatentabilityVerdict
    template: PatentTemplateRef        # jurisdiction-tagged; default generic
    config: PatentEngineConfig

class PatentDraft:
    spec: SpecificationDoc             # field/background/summary/detailed-description (enabling)
    claims: ClaimSet                   # independent[] + dependent[] ladder; element -> support map
    abstract: str
    drawing_refs: list[FigureRef]
    open_items: list[str]              # gaps the human/attorney MUST resolve
    provenance: ProvenanceTrace        # claim -> evidence -> draft lineage (replayable)

class PatentEngine(Port):
    def capabilities(self) -> CapabilityDescriptor: ...   # jurisdictions, claim types, max claims, needs_human=True
    def screen(self, req: PatentDraftRequest) -> PatentabilityVerdict: ...  # optional; harness owns by default
    def draft(self, req: PatentDraftRequest) -> PatentDraft: ...            # LLM-assisted; NEVER auto-files
    def review_checklist(self, draft: PatentDraft) -> list[CheckResult]: ...# clarity/antecedent/enablement/scope
```

**Swap 규칙:** `needs_human=True`인 `PatentDraft`를 반환하는 모든 엔진이 port를 충족한다; 외부 patent tooling은 동일한 contract 뒤의 adapter 하나로 drop in된다(ADR-0005). `prior_art`는 항상 Novelty/Radar port를 통해 도착한다 — patent 엔진은 prior-art vendor를 결코 소유하지 않는다.

## Consequences

**더 쉬워짐:**
- 회복 불가 failure mode(조기 disclosure)가 작성자 기억이 아니라 default-deny 코어 interlock으로 구조적으로 방지된다.
- 나중의 실제 patent service는 adapter 하나 + config 한 줄이다; lifecycle, interlock, provenance는 변하지 않는다.
- paper와 patent가 동일한 gated, typed, novelty-checked front를 재사용하므로 claim/evidence 선택은 한 번만 작성된다.
- provenance가 end-to-end다: 모든 claim element가 evidence-gated ledger claim과 CAW-02/CAW-01 ref로 추적된다.

**더 어려워짐 / 비용:**
- v1 patent draft 품질이 낮고 무거운 human/attorney review를 요구한다(수용: seam을 저렴하게 증명).
- 코어가 patent-specific 상태(`disclosure_status`)와 cross-port interlock을 운반한다 — 코어 로직이 늘지만, 이는 안전 규칙을 우회할 수 없는 유일한 지점이다.
- harness는 법률 자문을 *하지 않도록* 신중해야 한다; 여러 screen 테스트(특히 101)는 advisory하거나 침묵으로 남는다.

**후속 작업 (runbooks):**
- RB (patent path): `PatentEngine` port + 우회 불가 `needs_human=True`인 `BaselinePatentDrafterAdapter`.
- RB (publish interlock): Sink 경로에 대한 코어 수준 default-deny `disclosure_status` 검사(cross-port guard).
- RB (patent review checklist): claim clarity, antecedent basis, enablement, scope, ladder integrity — paper review checklist와 구별됨.
- RB (stubs): 문서화된 stub으로서의 `PatentFilingSinkAdapter` + `ExternalPatentToolingAdapter`(ADR-0005 §6).

## Open questions / revisit triggers

- TODO(open-question: 어느 관할이 SAIT/Samsung filing을 규율하는가? grace-vs-absolute-novelty 기본값과 template profile을 결정.)
- TODO(open-question: provisional-first가 선택된 priority 전략인가? publish hold가 언제 해제될 수 있는지를 바꾼다.)
- TODO(open-question: 권위 있는 human gate는 누구인가 — 내부 IP 팀, 외부 counsel, 또는 둘 다 — 그리고 `ready-for-filing` draft의 SLA/handoff 형식은?)
- TODO(open-question: AI/소프트웨어 claim의 101/eligibility는 법률 사안이다; harness가 위험을 flag라도 할 수 있는가, 아니면 침묵하고 전적으로 미뤄야 하는가?)
- TODO(open-question: CAW-03이 `screen()`을 소유하는가, 아니면 PatentEngine adapter에 위임하는가? 기본: harness가 소유.)
- TODO(open-question: confidentiality filter가 public-safe vs internal-review를 넘어 더 엄격한 "pre-filing / attorney-eyes-only" 계층이 필요한가? ADR-0007 교차 링크.)
- **Revisit trigger:** 실제 patent 도구나 filing connector를 배선하는 것이 코어 interlock이나 lifecycle 변경을 강제한다면, port contract가 누수되고 있으므로 이 ADR을 재검토해야 한다.
- [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) 참조.

> Grounding은 비권위적이며 법률 자문이 아니다; sources는
> [../02-research/patent-drafting.md](../02-research/patent-drafting_ko.md)에 나열되어 있다.
