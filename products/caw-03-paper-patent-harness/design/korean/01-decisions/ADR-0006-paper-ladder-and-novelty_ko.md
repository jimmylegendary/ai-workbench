# ADR-0006: Paper ladder (P1/P2/P3) 및 novelty / claim-boundary governance

- Status: proposed
- Owner: Jimmy
- Last-reviewed: TODO(open-question: 검토 시 설정)
- Related:
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF_ko.md) (§3, §5, §6)
  - [../02-research/novelty-priorart-and-venue.md](../02-research/novelty-priorart-and-venue_ko.md) (이 ADR이 비준하는 리서치)
  - [./ADR-0002-writing-engine-integration.md](./ADR-0002-writing-engine-integration_ko.md) (engine이 citation discovery를 소유; harness는 검증된 pool을 재사용)
  - [./ADR-0003-evidence-gate-and-claim-ledger.md](./ADR-0003-evidence-gate-and-claim-ledger_ko.md) (P1/P2/P3 claim 타이핑; novelty 이전의 gate)
  - [./ADR-0004-patent-drafting.md](./ADR-0004-patent-drafting_ko.md) (patent-first interlock, patentability screen)
  - [./ADR-0005-ports-and-adapters.md](./ADR-0005-ports-and-adapters_ko.md) (Novelty/Radar port, registry, stubs)
  - [./ADR-0007-confidentiality-and-boundary.md](./ADR-0007-confidentiality-and-boundary_ko.md) (boundary gate; patent-first egress 차단)
  - [./ADR-0008-artifact-lifecycle-and-storage.md](./ADR-0008-artifact-lifecycle-and-storage_ko.md) (patent-first는 lifecycle 상태)
- Source of truth: ../_meta/PRODUCT-BRIEF.md

## Context

brief(§3, §6)는 CAW-03이 **novelty / claim-boundary checker**(novel vs threatened, 어느 claim이 patent-first 처리를 필요로 하는가)와 **paper ladder(P1/P2/P3) + portfolio**(프로그램 논문 시퀀스를 per-paper readiness gate와 함께 계획/추적)를 추가하도록 요구한다. CAW-05(별개 제품)는 trend/threat radar를 공급하며 CAW-03은 이를 port를 통해 **import**한다; CAW-03은 결코 필드 자체를 크롤링하지 않는다.

작용하는 힘들:

- **세 가지 관심사가 "related work"에 닿으며 혼동되어선 안 된다.** (1) draft를 위한 *citation discovery + verification*은 PaperOrchestra의 `literature-review-agent`가 소유한다(Semantic Scholar 검증 BibTeX, ADR-0002). (2) 필드 전반의 *trend/threat radar*는 CAW-05가 소유한다. (3) *Novelty governance* — "이 claim이 여전히 novel한가? patent-first가 필요한가?" — 가 이 ADR이 결정하는 CAW-03의 부가가치이다. discovery는 위임되지만 **결정**은 harness의 것이다.
- **생성된 텍스트는 절대 evidence가 아니다(brief §3, §10; ADR-0003 §1).** LLM novelty 의견은 인간 검토를 위해 *플래그*할 수는 있으나 `novel`/`anticipated`의 유일한 근거가 될 수는 없다. 평결은 감사 가능하고 재현 가능해야 한다.
- **공개 순서가 patent 권리를 태울 수 있다.** P3(future-device) claim은 기본적으로 patent-sensitive하다; 출원 전에 공개하면 권리를 상실할 수 있다. patent-first gate는 반드시 **fail closed** 되어야 한다.
- **"P1/P2/P3"는 과부하되어 있다** — brief에서 *claim type*인 동시에 *paper-ladder rung*이다. 이 ADR은 두 해석이 일관되게 유지되도록 매핑을 고정한다.
- **개방 seam(brief §5).** Radar import, paper prior-art, patent prior-art는 하나의 Novelty/Radar port 뒤의 하위 capability이다; live prior-art 서비스는 미래 adapter이며, v1에서는 port-only이다.

## Options considered

### A. novelty 결정을 누가 소유하는가

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **harness가 결정; engine + radar는 공급(선택)** | governance가 어느 한 engine에도 독립적; 재질의 없이 engine의 검증된 pool 재사용 | harness가 verdict 모델을 보유 | **Chosen** |
| novelty를 PaperOrchestra에 내장 | 한 곳 | governance를 engine에 결합; engine 교체 시 깨짐(ADR-0002) | Rejected |
| 순수 CAW-05 의존 | 코드 적음 | 독립성 위반(§1); radar는 trend 신호이지 per-claim gate가 아님 | Rejected |

### B. novelty 탐지 방법 (v1)

| Option | Pros | Cons | v1 결정 |
|---|---|---|---|
| **Overlap/retrieval 신호** (claim 임베딩, 최근접 related-work + radar 검색, threshold) | 저렴, 설명 가능, 조작 없음 | 조잡함; threshold 튜닝 | **v1 baseline** |
| LLM contradiction/anticipation 판정 | retrieval이 놓치는 의미적 중복 포착 | verdict를 환각할 수 있음 | v1 **advisory only**, 단독 gate 절대 아님 |
| 완전 agentic novelty scorer (OpenNovelty 스타일) | 가장 강력, citation 기반 | 무거움, 외부 의존, 미성숙 | **port-stub** (미래) |
| 인간 평결 | 권위 있음 | 느림 | `threatened`/`patent-sensitive`에 **필수** |

### C. CAW-05와의 radar 결합

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **CAW-05 file artifact를 port를 통해 import(선택)** | 공유 기반 없음; CAW-05 분리 유지; CAW-02가 쓰는 동일 boundary envelope 재사용 | bundle이 오래될 수 있음(freshness SLA 필요) | **Chosen** |
| CAW-05로의 live API | 가장 최신 | 독립성 §1 위반(공유 런타임 결합) | Rejected |

### D. prior-art 기본 서비스

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **PatentsView 무료 API + stubs(선택)** | 무비용, 키 불필요, 스크립트 가능 | US 한정, 서지적 | **v1 default** |
| Google Patents / Lens / EPO-OPS / PQAI | 더 풍부한 커버리지 / 의미적 | GCP 과금 / 유료 / EU 한정 / 미성숙 | future stubs |

## Decision

**1. harness가 novelty를 결정하고, engine과 radar는 공급만 한다.** CAW-03은 PaperOrchestra의 Semantic-Scholar 검증 `citation_pool.json`(ADR-0002 출력)을 **paper prior-art** 입력으로 재사용한다 — 재질의하지 않는다 — 그리고 CAW-05 radar 신호를 Novelty/Radar port를 통해 import한다. 이로부터 선택적 patent prior-art를 더해 per-claim **novelty verdict**를 계산한다.

**2. Novelty verdict와 claim-boundary 모델.** 각 타입화된 claim(ADR-0003 ledger에서)은 draft 시점에 계산되고 재검사 가능한 verdict를 보유한다:

| Verdict | 의미 | 기본 gate 동작 |
|---|---|---|
| `novel` | threshold 이상의 prior-art/radar 충돌 없음 | draft로 진행 |
| `threatened` | 부분적 범위 충돌(겹치나 완전히 anticipate하지 않음) | **더 좁은 claim boundary 제안**; 인간 검토 |
| `anticipated` | prior art가 claim을 완전히 포괄 | paper claim을 그대로 차단; background로 강등 / 인용 |
| `superseded` | 더 새로운 결과가 우리 것을 능가 | 플래그; 기여 framing을 무효화할 수 있음 |
| `patent-sensitive` | 우리가 보호하고 싶을 수 있는 특허 가능 주제 | 공개 전 **patent-first**(ADR-0004)로 라우팅 |

**Claim-boundary**(주장의 명시적 범위)는 **first-class 필드**이다. `threatened` claim에서 harness는 좁히기를 제안한다(prior art가 결여한 operating regime / constraint / metric / mechanism); engine은 그 boundary에 맞춰 draft하고 patent 경로는 그것을 claim limitation으로 재사용한다. 이는 두 경로를 두 개의 갈라진 범위가 아니라 하나의 boundary object를 통해 결합한다.

**3. novelty verdict는 `(retrieval_signal, llm_advisory, human_decision)`이다.** retrieval overlap 신호가 v1 baseline이고; LLM 판정은 **advisory flag-only**이며; 인간 결정은 `threatened`와 `patent-sensitive`에 **필수**이다. 생성된 LLM 텍스트는 `novel`/`anticipated`의 유일한 근거가 절대 아니다 — 플래그만 한다. harness는 모든 입력과 `inputs_digest`를 기록하여 verdict가 감사 가능하고 재현 가능하게 한다(evidence-gate 불변식을 미러링, ADR-0003).

**4. P1/P2/P3 매핑 (claim type ⇄ ladder rung).**

- **Claim typing**(CAW-02 ledger에서 import, ADR-0003): **P1** = core method claim; **P2** = tool/system claim; **P3** = future-device / forward-looking 투영. Patent posture: P1은 보통 publishable(patent 선택), P2는 때때로 patentable, **P3은 기본적으로 patent-sensitive**.
- **Paper ladder**(프로그램 논문 시퀀스): **P1 (method) → P2 (tool/system + results) → P3 (future-device / vision)**. 공개 순서가 patent 권리를 태우지 않도록 시퀀스가 선택된다. 각 rung은 **readiness gate**를 가진다: claim이 evidence gate(ADR-0003)를 통과하고 **그리고** novelty verdict ≠ `anticipated`이며 **그리고** confidentiality가 통과(ADR-0007)한다. v1은 ladder를 *추적*하고; Jimmy가 결정한다(brief §9 — 완전 portfolio 자동화 없음).

**5. Patent-first는 fail-closed gate이다(load-bearing 규칙).**

| Claim type | Novelty verdict | 동작 |
|---|---|---|
| P1 / P2 | `novel` | paper draft; patent 선택(human flag) |
| P1 / P2 | `threatened` | boundary 좁히고, 재검사 후 draft |
| P1 / P2 | `patent-sensitive` (인간이 가치 있다고 플래그) | **patent-first**: 출원 결정까지 paper 보류 |
| P3 | any | **기본적으로 patent-first**: file/abandon 기록 전까지 공개 draft 없음 |
| any | `anticipated` | 기여로서 차단; background로 강등 |

**Patent-first**는 인간이 `file`(→ patent 경로 먼저 실행, ADR-0004), `abandon-protection`(→ 공개 허용), 또는 `defer`(→ 차단 유지)를 기록할 때까지 해당 claim에 대한 publication-bound draft를 차단한다. 이는 artifact lifecycle(ADR-0008)상의 상태이며, harness가 강제하고, **fail closed** 된다 — ADR-0007 §2.3의 egress interlock이 강제 지점이다.

**6. Venue-fit은 advisory이지 gate가 아니다.** harness는 engine의 검증된 citation pool, fields-of-study, CFP 트래커, 그리고 venue의 `conference_guidelines.md`로부터 순위화된 venue-fit note(상위 N개 venue + 근거 + 다음 마감)를 생산한다. 인간이 선택하고; 자동 submission은 비목표이다(§9). 선택된 venue는 ladder rung과 engine의 guidelines 입력(ADR-0002 §5)으로 피드백된다.

**7. Novelty/Radar port와 v1 adapters(ADR-0005).** 하나의 타입화된 port, config로 선택됨; 하위 capability는 capability descriptor에 선언되어 harness가 우아하게 degrade한다(live patent search가 없어도 CAW-05 import는 동작).

```python
class NoveltyRadarPort(Protocol):
    def capabilities(self) -> CapabilityDescriptor: ...
    def check_novelty(self, req: NoveltyRequest) -> NoveltyVerdict: ...      # core gate input
    def search_prior_art(self, req: PriorArtQuery) -> list[PriorArtHit]: ... # optional capability
    def import_radar(self, bundle_uri: str) -> list[RadarSignal]: ...        # CAW-05 file-drop import
# v1 implemented: CAW-05 radar import; engine-pool reuse (paper prior-art, offline_ok);
#                 retrieval + LLM-advisory checker; PatentsView (thin, free) patent prior-art
# stubs (port-only): Google Patents / Lens / EPO-OPS / PQAI; OpenNovelty-style agentic scorer
```

`RadarSignal`은 **CAW-05 boundary envelope를 재사용**한다(CAW-02가 소비하는 동일 형태); CAW-03은 동일 file artifact를 import하며 CAW-05의 store에 결코 손대지 않는다. `raw_summary`는 생성된 텍스트 → evidence에서 제외. `NoveltyVerdict`는 `retrieval_signal`, advisory `llm_advisory`, `proposed_boundary_narrowing`, `patent_first`, `human_decision`, 그리고 재현 가능한 `inputs_digest`를 보유한다.

## Consequences

**더 쉬워짐:**
- Governance가 engine 독립적: PaperOrchestra 교체(ADR-0002)가 novelty 결정을 옮기지 않는다.
- 이중 fetch 없음: engine의 검증된 pool이 paper prior-art source이고; harness는 radar와 (선택적) patent prior-art로만 보충한다.
- Patent 권리가 저자의 기억이 아니라 fail-closed, lifecycle 강제 gate로 보호된다.
- 나중의 live prior-art나 agentic-novelty 서비스는 동일 port 뒤의 adapter 하나이다(ADR-0005).
- `threatened` claim은 paper와 patent 경로 양쪽에 기여하는 구체적이고 재사용 가능한 좁은 boundary를 얻는다.

**더 어려움 / 비용:**
- retrieval overlap threshold와 embedding model이 튜닝을 필요로 하고, CAW-05 bundle이 오래될 수 있다("submission-ready" 이전에 gate의 freshness SLA가 필요).
- `threatened`/`patent-sensitive`에는 인간 검토가 필수여서 지연이 추가된다(수용: 권리 보호 > 속도).
- harness는 engine, radar, governance 결정을 결합시키지 않도록 세 가지 "related work" 관심사를 깔끔히 분리해서 유지해야 한다.

**후속 작업(runbooks):**
- RB (novelty-radar-port): port + capability descriptor + verdict/signal 스키마; config registry; 네 개의 v1 adapter + stubs.
- RB (radar-import adapter): 공유 envelope를 재사용하는 CAW-05 file-drop importer + 재-redaction; `related_to`를 harness claim id에 매핑; `external_ids`로 dedup; `raw_summary`를 evidence에서 제외.
- RB (novelty-checker): engine pool + radar 위의 retrieval 신호; LLM advisory flag-only; 감사 가능한 verdict.
- RB (patent-first gate): P3 / `patent-sensitive`에 키된 lifecycle 상태 + fail-closed gate(ADR-0008, ADR-0007).
- RB (prior-art adapter — PatentsView v1): thin rate-limit 인식 client; query 텍스트 redact; Google/Lens/EPO/PQAI stub 문서화.
- RB (paper-ladder + venue-fit): per-rung readiness gate를 가진 ladder 계획; engine의 `conference_guidelines.md`로 들어가는 venue-fit note.

## Open questions / revisit triggers

- TODO(open-question: `retrieval_signal`을 위한 overlap threshold + embedding model — CAW-05의 scorer와 공유 의존을 피하면서 어느 코퍼스로 튜닝하는가?)
- TODO(open-question: CAW-05가 `related_to`를 CAW-03 claim id에 키해서 내보내는가, 아니면 CAW-03이 ledger를 통해 재매핑해야 하는 CAW-02 concept/claim id에 키해서 내보내는가?)
- TODO(open-question: `patent-sensitive` 플래그에 대한 권위는 누구인가 — 인간만인가, 아니면 harness가 claim type + patent prior-art hit로부터 자동 제안할 수 있는가?)
- TODO(open-question: confidentiality — patent prior-art query가 내부 아이디어를 서드파티 API에 노출할 수 있다; `patent_prior_art`를 `boundary=public` claim 텍스트로만 제한하고, query는 어떻게 redact하는가? ADR-0007 교차 링크.)
- TODO(open-question: import된 radar bundle이 "submission-ready" 이전에 verdict를 재실행해야 하기 전까지 얼마나 오래될 수 있는가? freshness SLA?)
- TODO(open-question: venue별 최소 trust — P1 paper claim에 T1로 충분한가, 아니면 top venue가 T2를 요구하는가? ADR-0003 교차 링크.)
- **Revisit trigger:** live prior-art search 배선이 (새 adapter 파일이 아니라) novelty governance / patent-first 로직 변경을 강요한다면, port 계약이 새고 있는 것이다.
- [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) 참조.
