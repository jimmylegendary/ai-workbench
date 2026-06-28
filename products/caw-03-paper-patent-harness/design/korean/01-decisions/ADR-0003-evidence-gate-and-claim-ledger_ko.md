# ADR-0003: Evidence gate & claim ledger — 최소 gate, P1/P2/P3 typing, generated-text-not-evidence

- **Status:** proposed
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF_ko.md) (source of truth; §3 governance delta, §4 imports)
  - [../02-research/evidence-gate-and-claim-ledger.md](../02-research/evidence-gate-and-claim-ledger_ko.md) (gate policy, ledger model, negative tests)
  - [ADR-0002-writing-engine-integration.md](ADR-0002-writing-engine-integration_ko.md) (gate는 입력 조립 전에 실행됨)
  - [ADR-0005-ports-and-adapters.md](ADR-0005-ports-and-adapters_ko.md) (gate는 SourceAdapter 형태만 읽음)
  - [../02-research/confidentiality-and-artifact-lifecycle.md](../02-research/confidentiality-and-artifact-lifecycle_ko.md) (gate는 세 conjunction gate 중 하나)
  - [../02-research/novelty-priorart-and-venue.md](../02-research/novelty-priorart-and-venue_ko.md) (P3 → patent-first routing)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
CAW-03의 **evidence gate**를 결정한다: claim이 paper 또는 patent draft에 진입하기 전에 운반해야 하는 최소 evidence; CAW-02의 인용된 claim+evidence bundle을 *import하여*(knowledge repo를 재소유하지 않고 참조) CAW-03이 구축하는 **claim ledger**; gate를 타입별로 만드는 **claim typing**(P1/P2 method/tool vs P3 future-device); 그리고 **generated text는 결코 evidence가 아니다**라는 타협 불가 규칙. gate가 어떻게 **WritingEngine을 구조적으로 차단**하여(기본은 PaperOrchestra) ungated claim이 draft될 수 없게 하는지 명세한다. CAW-02의 내부 claim/evidence 불변식(import boundary 너머에서 그대로 소비), patent 모듈 내부(patent-overlay gate 행만), novelty checker, engine adapter는 재정의하지 **않는다** — 이들은 별도 ADR이다.

## Context
- 브리프(§3)는 gate, ledger, claim typing을 CAW-03이 PaperOrchestra 위에 더하는 **governance delta**로 만든다. 두 가지 엄격한 규칙: 불충분/무 evidence claim은 **draft될 수 없다**, 그리고 **generated text는 결코 evidence가 아니다**(§3, §10).
- ledger는 **CAW-02로부터 import**된다(§3, §4): CAW-03은 claim/evidence/result를 id/URI로 참조하며 knowledge graph를 재소유하지 않는다. CAW-02는 `claims[]`(trust + boundary), `evidence[]`, `bibliography`, `provenance_digest`를 담은 서명된 `*.caw03-bundle.json`을 emit한다.
- 브리프는 세 가지 claim type을 고정한다(§3): **P1** method, **P2** tool, **P3** future-device. 이들은 *어떤 evidence가 존재할 수 있는가*에서 다르다 — P1/P2는 회고적(built/run/measured); P3는 전망적(미구축 device의 projection, USPTO 35 U.S.C. 112 하의 patent **prophetic example**에 유사).
- CAW-03이 `experimental_log.md`에 넣는 숫자는 PO의 Step-5 hallucination ground truth다(ADR-0002 §Context) — 따라서 정확하고 result-ref로 추적된 숫자가 governance와 엔진이 만나는 지점이다.
- gate는 **adapter-agnostic**해야 한다(브리프 §5): SourceAdapter의 evidence 형태만 읽으므로, 미래의 wiki/experiment-server source가 gate 로직을 건드리지 않고 plug in된다.

## Options considered

### A. gate가 위치하는 곳
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **입력 조립의 precondition (SourceAdapter import와 엔진 사이)** | ungated claim이 엔진에 결코 도달하지 않음; "draft될 수 없다"가 구조적으로 참 | 조립이 blocked-but-requested claim에 fail-loud해야 함 | **Chosen** |
| 산출된 draft에 대한 사후 검사 | 덧붙이기 쉬움 | 엔진이 이미 claim을 봤음/사용함; 그래도 출시하고 싶은 유혹; 누수 위험 | Rejected |
| 엔진/작성자의 자기 단속을 신뢰 | 코드 없음 | 브리프 §3 위반; 유창한 generated text가 evidence 세탁을 유발 | Rejected |

### B. 무엇이 evidence로 인정되는가
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **구체 artifact에 대한 타입 지정, resolvable ref만**(`artifact_ref`를 가진 CAW-02 `Evidence`, 또는 CAW-01 result-registry ref) | 재현 가능; 브리프 §3/§10 강제; string-as-evidence 없음 | resolvable ref 필요 | **Chosen** |
| prose 요약 / LLM note가 claim을 뒷받침하도록 허용 | 충족하기 쉬움 | "generated text는 결코 evidence가 아니다"를 직접 위반; harness의 핵심 취지 | Rejected |

### C. ledger 소유권
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **CAW-02의 서명된 bundle 위의 projection**: digest+서명 검증, id/URI로 참조, typing + gate status + draft routing만 저장 | knowledge-graph 중복 없음; 정확한 export로 재현 가능; 독립성 보존 | import 시 재검증 필요; CAW-02 export contract에 의존 | **Chosen** |
| CAW-02 claim/evidence를 CAW-03으로 복사 | 자체 완결적 읽기 | knowledge repo 재소유(브리프 non-goal §9); drift; 공유-substrate 냄새 | Rejected |

### D. gate threshold 형태
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **config로 선택되는 gate *profile*로서의 타입별 최소치**(예: `neurips-paper`, `us-utility-patent`) | 신규 venue/jurisdiction = 새 profile, 코어 변경 아님 | profile을 작성/유지해야 함 | **Chosen** |
| 하나의 고정 global threshold | 단순 | P1 vs P3 vs paper-vs-patent 차이를 표현 불가; 취약 | Rejected |

## Decision
**입력 조립의 precondition으로 자리한 타입별, profile 구성 가능 evidence gate; CAW-03이 참조하되 결코 재소유하지 않는 import된 CAW-02 claim ledger 위에서 동작; generated text는 결코 evidence가 아니며 — 어떤 profile도 완화할 수 없는 단 하나의 불변식.**

1. **Claim ledger (import됨, 재소유 아님).** import 시 bundle의 `provenance_digest` + 서명을 검증하고(실패 시 거부 — 아무것도 ledger에 들어가지 않음), `claim_ref`/`evidence_refs`/`result_registry_refs`를 CAW-02/CAW-01로의 URI로 **참조**하는 CAW-03-로컬 `ledger_entry` 레코드를 구축한다. 엔트리는 다음만 소유한다: `claim_type`(P1/P2/P3), 운반된 `trust`(T0–T3)와 `boundary`, `gate_status`(`blocked | draftable | draftable_with_label`), `gate_report_ref`, `draft_targets`. bundle digest는 **pin**되어, 렌더된 모든 artifact가 정확한 CAW-02 export로 재현된다. Note는 `evidence=false`로 도착하며 `evidence_refs`에 결코 나타날 수 없다.
2. **Claim typing.** 각 엔트리는 `claim_type`을 선언한다(기본은 추론, 사람 확인 가능): **P1**(method — evidence = 측정/시뮬레이션 결과 + 재현 가능 `code`/`strategy-id`), **P2**(tool — evidence = 구현 artifact + ≥1 execution trace/run), **P3**(future-device — evidence = 명시적 가정 + CI를 가진 model-projection **만**, 결코 측정 아님). type이 gate threshold와 downstream routing을 결정한다(P3 → [novelty 문서](../02-research/novelty-priorart-and-venue_ko.md)에 따른 novelty/patent-first review).
3. **타협 불가의 단 하나 규칙.** **Generated text는 결코 evidence가 아니다.** PO prose, autorater 판정, LLM 요약, 또는 CAW-02 `Note`(`evidence=false`)는 claim을 prompt하거나 claim에 의해 인용될 수는 있으나 claim을 결코 *뒷받침*할 수 없다. evidence는 항상 구체 artifact에 대한 타입 지정, resolvable ref다. 어떤 gate profile도 이를 완화할 수 없다.
4. **type별 최소 gate (행이 통과해야만 draftable).** "Concrete Evidence" = resolving `artifact_ref`를 가진 CAW-02 `Evidence` *또는* CAW-01 result-registry ref:
   - **P1 method:** **trust ≥ T1**의 concrete Evidence ≥1 + 재현 가능 code/strategy-id; 각 숫자가 `unit`(+CI)을 가진 CAW-01 result ref로 resolve; comparative는 same-kind baseline ref 필요.
   - **P2 tool:** P1과 동일, 더해 구현 artifact + ≥1 execution trace/run(artifact 없음 → `ERR_TOOL_UNBACKED`).
   - **P3 future-device:** 명시적 **가정 + CI**를 가진 **model-projection** Evidence ≥1; 숫자는 *projection*으로 렌더(labeled, unit+CI 운반); device 속성으로 가장한 측정 → `ERR_PROJECTION_AS_MEASUREMENT`; 가정/CI 누락 → `ERR_PROJECTION_UNQUALIFIED`.
   type 전반의 하드 blocker: 0 evidence → `ERR_NO_EVIDENCE`; generated/Note만 → `ERR_GENERATED_AS_EVIDENCE`.
5. **Paper vs patent overlay (같은 claim, patent 경로에서 더 엄격).** Paper: trust ≥ T1(venue가 기대하는 곳에서 reproducibility-checklist 항목); P3 숫자는 명시적으로 projection으로 라벨링. Patent: P3 prophetic claim은 **허용**되나 **written-description + enablement** review와 **patent-first** gating(publish 전 file)을 위해 flag; prophetic vs working example을 명확히 구분(USPTO 112); novelty/claim-boundary 검사(CAW-05 import)가 draft 전에 실행되어야 함.
6. **`draftable_with_label`**은 P3 결과다: claim은 projection/prophetic 라벨이 머신으로 부착된 경우에**만** draft될 수 있어, 엔진이 측정된 사실로 렌더할 수 없다.
7. **gate가 drafting을 차단하는 방식.** gate는 **SourceAdapter import와 WritingEngine port 사이**에 자리한다. engine-input assembler(ADR-0002 §3)는 `draftable`/`draftable_with_label` claim으로 필터링하고, 요청된 claim이 blocked면 gate 리포트와 함께 **요란하게 실패**한다 — PaperOrchestra는 이미 gate된 set 위에서만 호출되며 ungated claim을 결코 보지 않는다. claim별 상태 머신: `imported → typed → gated{...} → in_draft → in_review → published|filed`; `blocked` claim은 전진할 수 없다. gate는 "submission-ready" 전 review checklist에서 **재검사**되어, evidence를 잃은(superseded bundle) claim이 publish/file 전에 잡힌다.
8. **일반화 (브리프 §5).** gate는 **SourceAdapter 형태 + config 선택 gate profile 뒤의 policy object**다 — 어떤 adapter가 claim을 생산했는지 결코 알지 못하며, 신규 venue/jurisdiction은 코어 변경이 아니라 새 profile이다. "generated text는 결코 evidence가 아니다" 규칙은 무조건적 불변식이다.

**Acceptance (negative + positive tests, 연구 §6에서):** N1 `ERR_NO_EVIDENCE`; N2 `ERR_GENERATED_AS_EVIDENCE`; N3 `ERR_PROJECTION_AS_MEASUREMENT`; N4 `ERR_PROJECTION_UNQUALIFIED`; N5 result ref 없는 numeric P1 → blocked, 누락된 ref 명시; N6 잘못된 digest/서명 → import 거부; 완전 뒷받침 P1 → `draftable`; P2 qualified P3 → `draftable_with_label`.

## Consequences
- **쉬움:** "ungated claim은 draft될 수 없다"가 희망이 아니라 구조적으로 참; draft된 모든 숫자/figure가 CAW-01 result와 정확한 CAW-02 export로 재현; 신규 venue/jurisdiction은 profile 편집.
- **쉬움:** gate는 `gated` lifecycle 상태를 공급하는 세 conjunction gate(evidence ∧ confidentiality ∧ novelty) 중 하나(confidentiality 문서 §3.2); 실패는 타입 지정 사유(`EVIDENCE`)를 산출.
- **어려움 / 비용:** CAW-03은 CAW-02의 서명된 export contract에 의존하며 import 시 재검증해야 함; P3 projection 라벨링이 렌더된 LaTeX까지 끝내 전파되어야 함; *superseded* upstream bundle 탐지와 진행 중 draft의 re-gating은 미해결(open questions 참조).
- **후속 runbook:** (1) bundle import + ledger(digest+서명 검증, URI로 참조, digest pin); (2) gate 엔진(타입별, config 선택 profile; N1–N6 + P1/P2 acceptance; no-generated-evidence 규칙 무조건); (3) engine-input assembler(draftable로 필터, fail loud, P3 라벨 부착, result ref로부터 figure/table manifest 1:1 구축); (4) review checklist(gate 재실행; 렌더된 artifact의 pin된 digest 검증).

## Open questions / revisit triggers
- TODO(open-question: claim-type 추론이 사람-확인을 동반한 자동인가, 아니면 사람-할당 전용인가?) [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) 참조.
- TODO(open-question: venue별 정확한 min trust — P1 paper claim에 T1로 충분한가, 아니면 top venue는 T2를 요구하는가? paper-ladder/novelty 문서와 함께 소유.)
- TODO(open-question: CAW-03이 *superseded* CAW-02 bundle을 어떻게 탐지하고 진행 중 draft를 re-gate하는가 — poll, webhook, 또는 re-import-on-build? CAW-02와 boundary 교차.)
- TODO(open-question: patent 112 enablement/written-description 검사는 누가 소유하는가 — CAW-03 규칙, 사람, 또는 PatentEngine adapter? patent ADR과 함께 소유.)
- TODO(open-question: *blocked* claim을 일급 ledger 엔트리(보이는 backlog)로 영속화할 것인가, 버릴 것인가? lean: 영속화, CAW-02의 `needs_evidence`를 반영.)
- **Revisit trigger:** 제안된 gate profile이 "generated text는 결코 evidence가 아니다"를 완화한다면 그 profile을 거부한다 — 불변식은 고정이다.

Sources (grounding): [USPTO — Prophetic and Working Examples (35 U.S.C. 112)](https://www.federalregister.gov/documents/2021/07/01/2021-14034/properly-presenting-prophetic-and-working-examples-in-a-patent-application), [MPEP 2164 Enablement](https://www.uspto.gov/web/offices/pac/mpep/s2164.html), [NeurIPS Paper Checklist](https://neurips.cc/public/guides/PaperChecklist).
