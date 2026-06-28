# ADR-0003: Publishing policy & public-safe gate (LOAD-BEARING)

- **Status:** proposed
- **Owner:** Jimmy
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md
- **Related:**
  - [ADR-0001-product-surface-and-delivery.md](./ADR-0001-product-surface-and-delivery_ko.md)
  - [ADR-0002-content-model.md](./ADR-0002-content-model_ko.md)
  - ADR-0004 (import, ports & adapters — group B), ADR-0005 (storage & versioning — group B), ADR-0006 (web & API stack — group B)
  - [../02-research/publishing-policy-and-public-safe.md](../02-research/publishing-policy-and-public-safe_ko.md), [../02-research/import-and-ports.md](../02-research/import-and-ports_ko.md)

## Context

이것은 **CAW-04의 load-bearing 결정**이다(brief §9). CAW-04는 제품군의 *바로 그* 공개 표면이므로, 단 하나의 가장 위험한 실패는 검증되지 않았거나 회사 기밀인 노하우를 세상에 누출하는 것이다(brief §11). 이 ADR은 **무엇이 publish될 수 있는지**, 그 외 모든 것을 막는 **publish gate**, 모든 import에서 실행되는(upstream boundary 플래그를 절대 신뢰하지 않는) **public-safe re-check**, **redaction** 입장, 그리고 모든 publish된 산출물을 그 검증된 내부 source + 안전 검토로 추적하는 **audit**을 확정한다. 이는 CAW-02의 boundary 의미(별도 제품)를 공유 라이브러리나 저장소가 아니라 *복사된 의미*로서 재사용한다(brief §1 독립성). 이 ADR은 content model(ADR-0002), storage/versioning(ADR-0005), import port 메커니즘(ADR-0004), 또는 스택(ADR-0006)을 결정하지 않는다 — 그 모두의 위에 자리한다.

## Non-negotiable principles

1. **public-safe한 source로부터만 public 출력.** publish된 산출물이 지닐 수 있는 유일한 `boundary`는 **`public`**이다. `internal`과 `confidential`은 publishable-never다(brief §11).
2. **Default-deny, fail-closed.** 불확정적이거나, 검증되지 않았거나, 파싱 불가능한 것은 무엇이든 **제외**된다. gating 후의 빈 결과는 no-op이지, 저하된 publish가 아니다.
3. **upstream boundary를 절대 신뢰하지 말 것.** import의 선언된 `public_safe`는 *힌트*다; CAW-04는 로컬에서 재유도하고 재검사한다(defense in depth; brief §7).
4. **두 개의 독립적인 축**(CAW-02에서 재사용): `boundary {public ⊂ internal ⊂ confidential}`(민감도)와 `visibility {team, private}`(범위). publish된 항목은 `public`이고 **또한** 어떤 `private` 조상에서도 파생되지 않아야 한다. 두 축은 절대 하나의 필드로 붕괴되지 않는다.
5. **저작 없음, 세탁 없음**(brief §10). Redaction은 *제거*할 수 있을 뿐, 절대 *발명*하지 않는다. redaction이 산출물의 의미를 도려낼 정도라면, 빈 stub으로 publish하지 않고 거부한다. CAW-04 **내부에는 downgrade/`reclassify` 경로가 없다** — confidential→public은 오직 upstream에서 일어나고 새 import로 재진입한다.
6. **모든 publish는 사람이 승인한다**(brief §11). gate는 오직 자동-**거부**만 가능하다; 절대 자동-**승인**할 수 없다. 자동 gating은 *제안*을 만든다; Jimmy가 각 publish를 승인한다.

## Options considered

| Decision | Options | Choice | Why |
|---|---|---|---|
| Publishable boundary 집합 | `{public}`만 vs `{public, internal-on-authed}` | **`{public}`만** | brief §10: public 이상 publish 없음; authed 내부 docs는 v1 범위 밖 |
| upstream `public_safe` 신뢰 | 신뢰 vs **로컬 재유도** | **재유도** | brief §7 "upstream을 맹목적으로 신뢰하지 말 것"; upstream 정책 drift가 빠져나갈 수 없음 |
| redaction hit 시 조치 | auto-strip vs **거부 + 에스컬레이션** | **거부 + 에스컬레이션** | public 누출은 제공/캐시되면 되돌릴 수 없음; hit은 upstream의 오분류를 source에서 고치라는 신호이지, 조용히 덮으라는 것이 아님 |
| CAW-04 내부 downgrade | `reclassify` 허용 vs **없음** | **없음** | 공개 표면은 confidential이 public이 되는 장소가 절대 되어선 안 됨 |
| Approval | 자동 vs **publish당 수동** | **수동** | brief §11: gate는 자동-거부만; Jimmy가 모든 publish를 승인 |
| Boundary engine 소유권 | CAW-02와 공유 lib vs **자체 의미 복사본** | **자체 복사본** | brief §1 독립성 — 공유 런타임 기반 없음 |
| Redaction engine | Presidio vs regex/denylist | **TODO (open question)** | recall vs 의존성/ops 무게; 어느 쪽이든 사람 승인은 필수 |

## Decision

### The publish gate

**total하고 부작용 없는 결정 함수** `publish_decision(item) → PUBLISH_OK | REJECT{reasons[]}`가 무엇이든 public 저장소에 도달하기 전에 실행된다. 이는 **fail-closed** 검사들의 체인이다; 첫 hard failure가 거부하고, soft 발견 사항은 curator를 위해 수집되며, **기본 분기는 REJECT**다.

| # | Check | 통과 조건 | 실패 시 |
|---|---|---|---|
| G1 | Validated source | **검증된** CAW-02/CAW-03 source로의 해결 가능한 provenance ref | REJECT: no validated source |
| G2 | Effective boundary | **`boundary_eff(item) == public`**, 선언된 플래그가 아니라 provenance 조상들에 대해 계산(lattice-max) | REJECT: above-public |
| G3 | Visibility | 어떤 조상도 `visibility=private`가 아님(`visibility_eff == team`) | REJECT: private-derived |
| G4 | Redaction-clean | public-safe re-check가 *rendered public view*에서 **zero** hit 반환 | REJECT: leak markers found |
| G5 | Evidence-grade | 단순 생성-summary가 아님; ADR-0002의 `isPublishable(record)`가 성립(reuse/audit 메타데이터 존재) | REJECT: not reusable/auditable |
| G6 | Contract version | import envelope `contract_version` MAJOR가 지원됨 | REJECT: unknown contract |
| G7 | Integrity | `payload_sha256`가 canonicalized payload와 일치; signature(있으면) 검증됨 | REJECT: integrity/tamper |
| G8 | Curator approval | 이 버전에 대한 명시적 사람 approve 이벤트 존재 | HOLD (preview/admin에 머묾) |

- **G2가 등뼈다.** `boundary_eff`는 item과 모든 provenance 조상에 대한 lattice-max다 — 하나의 `confidential` Claim을 인용하는 Tip은 그 자체가 `confidential`이고 거부된다; synthesis는 절대 민감도를 아래로 세탁하지 않는다. CAW-04는 이것을 **재계산**한다; 캐시된 upstream 플래그를 절대 읽지 않는다.
- **G1–G7은 적격성을 gate하고; G8은 라이브 승격을 gate한다.** G8 없이 G1–G7을 통과하면 내부 preview/admin 표면(ADR-0001)에 머문다 — 절대 public web/API에 가지 않는다.

### import 시 public-safe re-check (defense in depth)

모든 산출물은 하나의 공유 제품 내 라이브러리(`pub.safe`)를 통해 import trust boundary를 건넌다. 그것을 우회하는 **raw import 경로는 없다** — agent와 사람이 같은 검사를 사용한다(brief §8; re-check는 core에 살며, 절대 `ContentSourceAdapter`에 있지 않다; ADR-0004 참조). 각 단계는 fail-closed다:

1. **envelope를 Parse + semver-gate**(`contract_version`, `source_product`, `declared_boundary`, `payload_sha256`, `redaction_applied`, `payload`). 알 수 없는 MAJOR → 거부; digest 불일치 → 거부.
2. 번들 내 provenance 그래프로부터 **`boundary_eff`/`visibility_eff`를 로컬에서 재유도**. **해결 불가능한 조상은 `confidential`/`private`로 해결됨**(fail-closed unknown).
3. *rendered public view*(독자가 실제로 보게 될 markdown/JSON)에 대해 **redaction ruleset를 재실행**, `redaction_applied`와 무관하게. candidate-public 항목에 대한 어떤 hit이든 ⇒ **거부 + 에스컬레이션**(auto-strip하지 않음).
4. 구조적 필드가 잡지 못한 내부 마커(프로젝트 코드네임, fab/고객 regex, 내부 hostname/URL, 직원 식별자)에 대한 **자유 텍스트 leak scan**.
5. **Conflation guard** — publish된 산출물은 public source를 confidential과 융합할 수 없다(brief §11: 절대 public research를 내부 Samsung/SAIT 주장과 conflate하지 말 것). 혼합 provenance ⇒ 분리하거나 거부.
6. **publish된 항목이 아니라 candidate를 방출** — 전체 발견 사항 리포트와 함께 G8을 위해 preview/admin에 도착한다.

### Redaction stance

Redaction은 **탐지 + 거부이지, 변환이 아니다**. CAW-04는 자체 `ruleset_version`을 소유한다(교리적으로 CAW-02와 정렬되지만 공유 의존성은 **아님** — 독립성). 범위는 raw 필드만이 아니라 *rendered public view*다. Engine 후보는 Microsoft Presidio(analyzer + 커스텀 recognizer)에 CAW-04 codename/fab/customer 패턴 리스트를 더한 것 — 그러나 engine은 필수적인 사람 승인을 절대 대체하지 않으며, auto-strip-vs-reject 질문은 **reject**로 확정된다.

### Audit

publish ledger는 **append-only, hash-chained `_events` 로그**(gate 결정당 그리고 publish/unpublish/redact당 한 줄)로, CAW-02 RB-013의 체인 구성(`seq`, `prev_hash`, `hash = H(prev_hash ‖ canonical(line))`)을 재사용하며 git history를 중복된 두 번째 증인으로 둔다(md/MDX-first 저장소, brief §6). 각 publish 이벤트는 최소한 `event`, `artifact_id`, `version`, `source_ref{product,id,producer_run_id}`, `boundary_eff`, 검사별 `gate_result`, `redaction{ruleset_version, hits}`, `approved_by`, `envelope_digest`, 그리고 `hash`를 기록한다.

보장: **추적성**(`source_ref`+`producer_run_id`가 라이브 핸들 없이 어떤 public 산출물이든 upstream으로 역추적), **tamper-evidence**(`verify_audit()`가 체인을 따라가 → `broken_at`), **재구성 가능한 결정**("왜 publishable했고 + 누가 승인했는가"가 replay 가능), 그리고 **unpublish/redact는 이벤트이지 삭제가 아님**(publish된 *버전*은 불변이지만 제공에서 철회 가능 — 410 tombstone으로 조정, ADR-0005 참조).

## Consequences

- **쉬운 점:** 공개 표면이 구조적으로 leak-resistant — upstream이 오분류하더라도 `internal`/`confidential`/`private` 항목이 web이나 API에 도달할 수 없다. CAW-04가 boundary를 재유도하고 rendered view를 재스캔하기 때문이다.
- **쉬운 점:** 모든 라이브 산출물이 end-to-end로 auditable; "왜 이것이 publishable했고 누가 승인했는가"가 replay 가능.
- **쉬운 점:** ADR-0001의 빌드 시점 `boundary == public` 단언이 sink에서 G2/G4의 last-line 강제다.
- **어려운 점:** 모든 import에 더 많은 검증 비용; 패턴 리스트 / `ruleset_version`이 공유 의존성이 되지 않으면서 CAW-02와 교리적으로 정렬되도록 유지되어야 함.
- **어려운 점:** upstream이 provenance 조상 그래프 없이 leaf 항목만 출하하면 모든 항목이 fail closed되어 아무것도 publish되지 않는다 — CAW-02/CAW-03로부터 더 풍부한 번들이 필요할 수 있음(open question).
- **어려운 점:** 명시적 사람 승인 없이는 아무것도 publish되지 않는다 — throughput은 설계상 curator-bound다.
- **후속 작업:** runbook이 **negative-heavy, mutation-tested** 스위트로 `pub.safe` 라이브러리를 구축(기본 분기를 `PUBLISH_OK`로 약화시키면 스위트가 깨져야 함); ADR-0004의 import re-check 단계와 ADR-0006의 sink가 이 gate를 소비; unpublish/redact 경로는 ADR-0005와 연결.

## Open questions / revisit triggers

- TODO(open-question: redaction engine — Presidio(NLP recall, REST-deployable) vs 더 가벼운 regex+denylist core, 어차피 사람 승인이 필수임을 감안할 때?)
- TODO(open-question: CAW-04의 codename/fab/customer 패턴 리스트가 어디에 살며 공유 기반이 되지 않으면서 CAW-02와 어떻게 정렬을 유지하는가.)
- TODO(open-question: import 번들이 로컬 `boundary_eff` 재계산을 위해 전체 provenance 조상 그래프를 출하하는가, 아니면 leaf + 선언된 boundary만인가? leaf만이라면 해결되지 않은 ancestry는 fail closed.)
- TODO(open-question: import된 번들에 대한 signature/attestation 스킴 — DSSE / in-toto / minisign?)
- TODO(open-question: re-validation 주기 — upstream이 source를 confidential로 reclassify할 때, CAW-04는 unpublish해야 함을 어떻게 아는가? poll / revocation feed / curator-driven?)
- TODO(open-question: unpublish 시 cache/CDN purge 보장 — `redact`/`unpublish` 후 time-to-purge에 대한 경계.)
- TODO(open-question: 이미 공개된 외부 source vs 내부 출처의 public-safe 콘텐츠에 대한 별개의 provenance 종류 — 둘 다 `boundary=public`이지만 위험이 다름.)
- **Revisit trigger:** public boundary 이상으로 publish하거나 gate가 자동-승인하도록 하는 어떤 제안이든 이 ADR을 다시 연다(둘 다 상시 non-goal, brief §10/§11).
