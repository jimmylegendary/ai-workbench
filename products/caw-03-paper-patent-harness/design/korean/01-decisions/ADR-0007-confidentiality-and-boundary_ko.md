# ADR-0007: Confidentiality gate — public-safe vs internal-review, CAW-02 boundary/redaction 재사용

- Status: proposed
- Owner: Jimmy
- Last-reviewed: TODO(open-question: 검토 시 설정)
- Related:
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF_ko.md) (§3, §4, §5, §10)
  - [../02-research/confidentiality-and-artifact-lifecycle.md](../02-research/confidentiality-and-artifact-lifecycle_ko.md) (이 ADR이 비준하는 리서치 — §1, §2, §5)
  - [./ADR-0002-writing-engine-integration.md](./ADR-0002-writing-engine-integration_ko.md) (engine 입력에 대한 confidentiality-before-assemble)
  - [./ADR-0003-evidence-gate-and-claim-ledger.md](./ADR-0003-evidence-gate-and-claim-ledger_ko.md) (boundary는 ledger 항목마다 보유; gate가 읽음)
  - [./ADR-0004-patent-drafting.md](./ADR-0004-patent-drafting_ko.md) (counsel audience; patent-first publish 차단)
  - [./ADR-0005-ports-and-adapters.md](./ADR-0005-ports-and-adapters_ko.md) (gate는 core에, sink가 audience tier 공급)
  - [./ADR-0006-paper-ladder-and-novelty.md](./ADR-0006-paper-ladder-and-novelty_ko.md) (publish bar를 촉발하는 patent-first verdict)
  - [./ADR-0008-artifact-lifecycle-and-storage.md](./ADR-0008-artifact-lifecycle-and-storage_ko.md) (이 gate가 평가되는 lifecycle)
- Source of truth: ../_meta/PRODUCT-BRIEF.md

## Context

brief(§3, §10)는 *public-source-assisted* artifact(건물을 떠날 수 있음)와 *internal-review-required* artifact(떠날 수 없음)를 구별하는 **confidentiality filter**를 요구하며, public 대상 출력에 기밀 회사 데이터를 담거나, public 리서치를 내부 Samsung/SAIT claim과 혼동하거나, 생성된 요약을 evidence로 취급하는 것을 금한다. CAW-03은 인용된 claim+evidence bundle을 CAW-02(별개 제품)로부터 서명되고 버전화된 envelope으로 import한다; 각 entity는 이미 CAW-02가 계산한 **effective** boundary/visibility 라벨을 보유한다.

작용하는 힘들:

- **재사용하되 재구축하지 말 것(brief §3, §10).** CAW-02가 분류의 권위이다. CAW-03은 그것의 boundary lattice, visibility 축, redaction ruleset 의미론을 그대로 상속해야 한다 — 병렬 체계를 발명하지 말 것.
- **공유 런타임 기반 없음(brief §1).** CAW-03은 런타임에 CAW-02의 classifier를 호출할 수 없다; import envelope에 담긴 라벨을 소비하고 자체 egress boundary에서 재주장한다.
- **writing engine이 누출을 합성할 수 있다.** PaperOrchestra는 source bundle이 문자 그대로 포함하지 않은 codename이나 내부 표현을 생산할 수 있으므로, source 라벨 위의 allow-list는 필요하지만 **충분하지 않다** — 내보낸 텍스트 위의 redaction 재스윕이 필요하다(심층 방어).
- **Patent은 순서 제약을 추가한다.** 공개 공시는 patentability를 상실시킬 수 있다; gate는 patent-first claim에 대해 출원 전까지 public paper sink를 차단해야 한다(ADR-0004/0006 교차 링크).
- **개방 seam(brief §5).** 미래 source(wiki, experiment-server)와 sink(wiki, venue, filing)는 gate를 변경하지 않고 plug in 되어야 한다; gate는 envelope 라벨 계약과 sink의 audience tier에만 의존한다.

## Options considered

### A. 분류 소유권

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **CAW-02 라벨을 그대로 상속; CAW-03은 라우팅 + 재주장만(선택)** | 단일 진실 공급원; drift 없음; 독립성에 부합 | envelope이 effective 라벨을 보유함에 의존 | **Chosen** |
| CAW-03에서 재분류 | 자기 완결 | 두 classifier가 drift; "재사용하되 재구축 말 것" 위반; laundering 위험 | Rejected |

### B. redaction ruleset의 거처 (공유 런타임 기반 불허)

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **CAW-02 ruleset의 vendored, 버전 고정 복사본(선택, 기본)** | 공유 런타임 없음; 결정적; 오프라인 | 상류 ruleset 업데이트를 추적해야 함 | **Chosen** (envelope-pinned `ruleset_version` 대비 확인) |
| 공유 라이브러리 | DRY | 공유 런타임 기반 — 금지(§1) | Rejected |
| import envelope에 고정된 `ruleset_version` | 항상 bundle과 일치 | egress sweep을 import cadence에 결합 | Open question (수용 가능한 대안) |

### C. gate가 실행되는 곳

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **두 지점의 policy function: ingest 분류 + egress 결정(선택)** | 일찍 라우팅, 늦게 강제; egress가 load-bearing gate | 일관 유지할 평가 지점 두 개 | **Chosen** |
| ingest 시 일회성 플래그 | 단순 | draft 시점의 합성된 누출이 빠져나감; track이 오래될 수 있음 | Rejected |
| 각 Sink adapter 내부의 gate | adapter-local | adapter가 opt out 가능; ADR-0005 위반(gate는 core에 유지) | Rejected |

## Decision

**1. CAW-02 boundary/visibility 의미론을 그대로 상속한다.** 두 축, 변경 없음:

| Axis | Values | 의미 | 결정자 |
|---|---|---|---|
| `boundary` | `public ⊂ internal ⊂ confidential` (순서 lattice) | "건물을 떠날 수 있는가" | CAW-02 (effective = provenance 조상 위 lattice-max) |
| `visibility` | `{team, private}` (비순서) | "누구의 공간" | CAW-02 (effective = 자신과 모든 조상이 `team`일 때만 `team`) |

CAW-03이 자체 export boundary에서 재주장하는 세 가지 상속 불변식: **(1) monotone propagation (laundering 없음)** — artifact의 effective boundary는 선택된 claim 위의 lattice-max이다; 생성된 텍스트는 결코 source를 다운그레이드하지 않는다; **(2) 생성된 텍스트는 evidence가 아니다** (`evidence=false` 관통; draft 문단은 결코 evidence로 역인용될 수 없다); **(3) fail-closed default-deny** — 불확정/미지는 `public`이 아니라 `confidential`/`private`로 취급된다.

**2. confidentiality gate는 lifecycle(ADR-0008)의 두 지점에서 평가되는 policy function**이며, 결코 일회성 플래그가 아니다:
- **Ingest 분류**(`gated`에서): artifact의 effective boundary/visibility를 선택된 모든 claim+evidence 라벨 위의 lattice-max로 계산한다; 이것이 artifact의 **confidentiality track**을 할당한다.
- **Egress 결정**(Sink boundary에서): `decide(artifact, target_audience)`를 redaction 재스윕과 함께 재실행한다. egress가 load-bearing gate이고; ingest는 라우팅만 한다. 이것은 engine 입력에 **confidentiality-before-assemble**(ADR-0002 §5)도 적용한다: internal-review-required span은 engine이 보기 전에 public-target assembly에서 차단된다.

**3. 두 track.**

| Track | Trigger (선택된 claim의 effective 라벨) | 허용 | 차단 |
|---|---|---|---|
| **public-source-assisted** | 선택된 모든 claim+evidence가 effective `boundary=public` AND `visibility=team` | review 체크리스트 통과 시 draft가 public sink(arXiv/venue)를 대상으로 가능 — **인간 confidentiality 검토 불필요** | 추가 차단 없음; 표준 review는 여전히 적용 |
| **internal-review-required** | 선택된 어느 claim/evidence라도 effective `boundary ≥ internal` OR `visibility=private` | 내부적으로 생산/검토; 그 boundary까지 내부 sink 대상 가능; patent track 진행 가능(counsel은 특권적 내부 audience) | 인간 `reclassify`/clearance가 floor를 낮추거나 patent-first가 공개 전에 출원하기 전까지 **public sink 하드 차단** |

**4. egress 결정은 total, 부작용 없음, default-deny이다**(CAW-02 `decide()` 재사용):
- `target_audience=public` ⇒ effective `boundary == public` AND effective `visibility == team`일 때만 ALLOW.
- effective `visibility == private`(jimmy-private) ⇒ 어떤 audience에도 절대 ALLOW 안 함.
- `target_audience=internal` ⇒ effective `boundary == internal`까지 ALLOW.
- `target_audience=counsel`(patent) ⇒ `confidential`까지 ALLOW(특권); 여전히 redaction 재스윕 대상. (`counsel`이 `internal` 위의 별개 tier인지는 ADR-0004 소유 — TODO open-question.)
- 인식되지 않은 상태 ⇒ EXCLUDE / 차단.

그 다음 **redaction 재스윕**: engine이 내보낸 모든 문자열(title, abstract, body, captions, table cells, bibliography locators) 위의 `scan()`. **어떤 hit이든 publication을 중단시키고** 위반 span 목록을 출력한다 — allow-list 이후에도 심층 방어인데, engine이 bundle이 문자 그대로 포함하지 않은 codename을 합성할 수 있기 때문이다.

**5. Patent 특정 오버레이(공개 공시 bar).** novelty checker(ADR-0006)가 `patent_first`로 플래그했고 아직 미출원인 claim ⇒ 그것을 인용하는 어떤 artifact든 **모든 public paper sink 차단**(boundary 무관). 출원이 기록되면(ADR-0004의 `disclosure_status=filed:*`) ⇒ 그 claim에 대한 public paper sink 해제. CAW-03은 **gate 순서**를 모델링하지, "공시(disclosure)"의 법적 정의는 모델링하지 않는다(그것은 counsel의 것 — open question).

**6. CAW-02 redaction ruleset을 vendored, 버전 고정 복사본으로 재사용.** brief는 공유 런타임 기반(§1)을 금하므로, 기본은 vendored, 버전 고정 ruleset(codename/fab/customer/PII 패턴, `scan()`/`redact()`)이며 egress 재스윕으로 사용된다. 대신 import envelope에 `ruleset_version`을 고정하는 것이 수용 가능한 대안이지만(open question), 공유 라이브러리는 거부된다.

**7. gate는 ports 뒤에서 일반화된다(brief §5).** 그것은 **import envelope에 담긴 effective 라벨**(CAW-02 내부가 아님)과 **선택된 Sink adapter가 공급하는 audience tier**에만 의존한다. 미래의 `SourceAdapter`(wiki, experiment-server)는 동일한 라벨 보유 서명 envelope을 내보냄으로써 plug in 한다; 미래의 `SinkAdapter`(wiki, venue, filing)는 audience tier를 등록한다. 두 경우 모두 gate 코드는 변경되지 않으며, human gate는 core에 유지된다(ADR-0005) — 어떤 adapter도 스스로 opt out 할 수 없다.

## Consequences

**더 쉬워짐:**
- 단일 분류 진실 공급원(CAW-02); drift하거나 유지보수할 병렬 classifier 없음.
- public 출력이 public-safe 입력만으로 구축됨이 증명 가능하며, allow-list가 잡지 못하는 engine-합성 누출을 심층 방어 재스윕이 잡는다.
- Patent 권리가 동일 gate(순서 오버레이)로 보호되며, ADR-0006의 patent-first verdict를 재사용한다.
- 새 source/sink가 gate 로직을 건드리지 않고 plug in 한다 — seam은 envelope 라벨 계약 + audience tier이다.

**더 어려움 / 비용:**
- CAW-03은 상류 ruleset 업데이트를 추적(vendored 복사본)하거나 envelope-pinned 버전을 수용해야 한다; 오래된 ruleset은 잠재적 누출 위험이다(버전 고정 + open question으로 완화).
- egress는 fail-closed이다: 단일 redaction hit이 publication을 중단시키므로 저자는 release 전에 span을 정리해야 한다(수용: false block은 복구 가능하나 누출은 아니다).
- 상류 변경 시 재-gating(ADR-0008)은 오래된 `public` track이 결코 지속될 수 없음을 의미하며, claim set이 바뀔 때 gate를 재실행하는 비용을 치른다.

**후속 작업(runbooks):**
- RB (confidentiality gate): ingest 분류(lattice-max → track) + egress `decide()` + redaction 재스윕; fail-closed; abort-on-hit; egress 결정마다 하나의 lifecycle 이벤트. CAW-02 의미론 재사용; 라벨을 재유도하지 말 것.
- RB (bundle-import adapter): envelope 서명 + `provenance_digest` 검증; effective 라벨을 gate에 노출; `ruleset_version` 스냅샷; 콘텐츠 재저작 금지.
- RB (engine-input assembler): confidentiality-before-assemble(ADR-0002 §5) 적용 — public-target 입력에서 internal-review-required span 부재.
- RB (sinks): 각각 audience tier 등록; (adapter가 아니라) core가 `publish()` 전에 `decide()` + 재스윕 실행.

## Open questions / revisit triggers

- TODO(open-question: ruleset 거처 — vendored+버전 고정 복사본 vs import envelope에 고정된 `ruleset_version`? 공유 런타임 기반 불허.)
- TODO(open-question: `counsel`이 `internal` 위의 별개 audience tier인가, 그리고 그 정확한 redaction 프로파일은 무엇인가? ADR-0004 소유.)
- TODO(open-question: patent-first gating을 위한 "public disclosure"의 법적 정의 — preprint, 발표, grace period? counsel 결정; CAW-03은 gate 순서만 모델링.)
- TODO(open-question: boundary 전반의 재분류 권한 — CAW-03이 인간 clearance를 로컬에 기록할 수 있는가, 아니면 다운그레이드가 새 bundle로 재import되는 CAW-02 `reclassify` 이벤트로 시작되어야 하는가? 기본: 재import, CAW-02를 권위로 유지.)
- TODO(open-question: 중간 engine artifact — citation_pool.json / outline.json — 가 저장 전에 입력과 동일한 egress sweep을 필요로 하는가? ADR-0002 교차 링크.)
- **Revisit trigger:** 새 sink나 source가 (새 audience tier / 새 envelope 내보내는 adapter가 아니라) `decide()`나 lattice 변경을 강요한다면, gate 계약이 새고 있는 것이다.
- [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) 참조.
