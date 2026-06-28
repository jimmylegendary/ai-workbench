# Import & 핵심 Public-Safe 재검사

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./overview_ko.md](./overview_ko.md)
  - [./publish-gate-and-public-safe_ko.md](./publish-gate-and-public-safe_ko.md) (이 재검사가 import 시점에 집행하는 gate)
  - [../01-decisions/ADR-0004-import-and-ports_ko.md](../01-decisions/ADR-0004-import-and-ports_ko.md) (권위 있는 ADR)
  - [../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md)
  - [../01-decisions/ADR-0002-content-model_ko.md](../01-decisions/ADR-0002-content-model_ko.md) (`CandidateItem`/`PublishableItem`, sidecar)
  - [../06-interfaces/](../06-interfaces/) (port contract — adapter 세부)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
이 문서는 콘텐츠가 CAW-04로 **들어오는** 방식 — `ContentSourceAdapter` import — 과 모든 import가 반드시 통과해야
하는 **핵심 public-safe 재검사**를 설명한다. 다루는 내용: 재검사가 왜 **core**에 위치하는지(결코 adapter가 아님),
**upstream boundary claim을 증거로만** 취급하는 것, CAW-02와 CAW-03이 같은 논리적 항목을 노출할 때의
**fan-in dedup/precedence** 규칙, 그리고 **pull-vs-push** 입장(v1은 pull). gate check를 재정의하지 않으며(see
[publish-gate-and-public-safe_ko.md](./publish-gate-and-public-safe_ko.md)) port interface 전체를 다루지도 않는다(see
[../06-interfaces/](../06-interfaces/)); 이 문서는 파이프라인의 import 측 관점이다.

## 재검사는 어디에 있는가 (그리고 왜 adapter에 없는가)
public-safe 재검사는 **core 단계**이며, 결코 `ContentSourceAdapter` 안에 있지 않다(ADR-0004 §2, load-bearing).
adapter는 read-only 배관(plumbing)이다: 하나의 upstream과 통신하여 provenance 태그가 붙은
`CandidateItem`을 반환하는 법을 알 뿐이며 — 재검사의 존재를 **알지 못하고** 스스로 우회할 **수 없다**. 파이프라인은
고정되어 있다:

```
import → re-check → curator gate → version → publish
         ^^^^^^^^   (core)         (core)    (sink)
```
재검사를 우회하는 **raw import path는 없다** — agent와 사람이 동일한 검사를 사용한다(ADR-0004 §2).
config 기반 registry는 어떤 adapter가 active인지 배선할 수 있지만, adapter가 재검사,
human gate, boundary policy를 override하게 결코 둘 수 없다(ADR-0004 §4).
`AdapterCapabilities.requiresPublicSafe`는 `true`이며 **스스로 비활성화할 수 없다**(ADR-0004 §3).

## `ContentSourceAdapter` (driven port, read-only)
| Method | Returns | Notes |
|---|---|---|
| `capabilities()` | `AdapterCapabilities` | `port`, `id`, `version`, `provides`, `features`, `requiresConfig`, `requiresPublicSafe:true`, `maturity` |
| `discover(query)` | `CandidateRef[]` | upstream을 **id/URI/version**으로 참조 — 결코 공유 store handle이 아님 |
| `fetch(ref)` | `CandidateItem` | payload + `upstream_boundary_claim` + `source_ref` + `upstream_metadata` |
| `health()` | `Health` | preflight + liveness |

v1 구체적 source: `Caw02KnowledgeSourceAdapter`, `Caw03SkillsRegistrySourceAdapter`. 문서화된 stub
(등록됨, config-disabled, `maturity="stub"`): `InternalWikiSourceAdapter`, `CuratedBundleSourceAdapter`
(ADR-0004 §5). preflight는 `active`한 `stub` 실행을 거부한다.

### import envelope (core에서 파싱 + semver-gate)
```yaml
contract_version: "1.x"          # MAJOR semver-gated; unknown MAJOR => reject (never guess)
source_product:   "CAW-02"       # or CAW-03
declared_boundary: "public"      # EVIDENCE ONLY — re-derived locally, never trusted
redaction_applied: true          # EVIDENCE ONLY — re-scanned locally regardless
payload_sha256:   "sha256:…"     # must match canonicalized payload, else reject (integrity)
provenance:       { graph: [...] }   # ancestor graph for local boundary_eff recomputation
payload:          { ... }        # the candidate Tip/Skill/Workflow/Playbook + metadata
```

## upstream boundary claim = 증거일 뿐
| Upstream field | CAW-04 treatment | Why |
|---|---|---|
| `declared_boundary` | provenance graph로부터 **`boundary_eff`를 로컬에서 재유도** | upstream policy drift가 새어 들어올 수 없음 (ADR-0003 P3) |
| `redaction_applied` | 무조건 **redaction scan을 재실행** | producer redaction은 단일 실패점 |
| `public_safe` (any hint) | 평결이 아니라 *힌트* | brief §7 "never trust upstream blindly" |
| unresolvable ancestor | **`confidential`/`private`로 resolve** (fail-closed) | deny-by-default; ADR-0004 §2 |

CAW-04가 신뢰하는 평결은 `pub.safe`가 만든 **자기 자신의** 평결이다. upstream의 claim은 audit에 증거로 기록되지만
결코 권위가 아니다.

## 핵심 재검사 파이프라인 (각 단계 fail-closed)
```
1. envelope.parse + semver-gate     # unknown MAJOR => reject; digest mismatch => reject
2. boundary.eff / visibility.eff    # re-derive from provenance graph; unresolvable ancestor => confidential/private
3. redact.scan(rendered view)       # re-run ruleset over the PUBLIC view a reader would see; any hit => reject+escalate
4. free-text leak scan              # codenames, fab/customer regexes, internal hosts/URLs, employee ids
5. conflation guard                 # may not fuse a public source with a confidential one => split or reject
6. emit CANDIDATE (never published)  # lands in preview/admin with full findings report attached for G8
```
결과는 타입이 있는 평결이다:
```
RecheckVerdict { decision: publish_eligible | quarantine | reject, findings[], boundary, evidence_ref }
```
**Deny-by-default:** 적극적으로 public-safe로 확인되지 않은 것은 eligible이 되지 **않는다**. 실패한 재검사는
**upstream이 public-safe로 표시했더라도** 항목을 차단한다(ADR-0004 §2 / brief §11 guardrail). 재검사는
[gate](./publish-gate-and-public-safe_ko.md)의 import 시점 집행이다 — G8을 대체하지 않는다(live로 가려면 여전히
human 승인이 필요하다).

> 여기서 추출된 audit 전용 provenance 필드(`origin_ref`/`origin_version`)는 **sidecar**로 가며 web/API로 결코
> 직렬화되어서는 안 된다(ADR-0002; overview I3).

## Fan-in: dedup & precedence
registry는 **여러 active source**(fan-in)를 허용한다. CAW-02와 CAW-03이 **같은 논리적 항목**을 노출할 때
core는 provenance를 보존하며 dedup하고 merge해야 한다. 작업 규칙(비준 대기):

| Step | Rule |
|---|---|
| Identity | 논리적 identity = 정규화된 `(kind, stable upstream id)`; 제품 간 충돌은 자동 merge가 아니라 *merge 후보* |
| Precedence | **필드별로 가장 구체적인 source가 우선**: CAW-03/skills-registry는 Skill/Workflow 실행 메타데이터(inputs/outputs/preconditions)에 대해 권위; CAW-02는 knowledge/claims/citations에 대해 권위 |
| Boundary | merged `boundary_eff` = 기여한 모든 source에 대한 **lattice-max**(결코 min이 아님) — fail-closed |
| Provenance | 모든 `source_ref`를 sidecar로 **union**; 결코 ancestor를 버리지 않음(boundary 재계산을 약화시킴) |
| Conflict | precedence가 필드 충돌을 해소하지 못하면 **자동 merge 금지** — 별도 candidate를 emit하고 curator에게 flag |
| Conflation | merge된 아티팩트는 public source와 confidential source를 융합할 수 없음(재검사 step 5) |

`TODO(open-question: 두 source adapter가 같은 논리적 항목을 노출할 때의 정확한 dedup key + provenance merge
algorithm. ADR-0004.)`

## Pull vs push — v1은 pull
| Model | How | v1 |
|---|---|---|
| **Pull** | CAW-04가 일정 주기로 `discover()`를 폴링한 뒤 선택한 ref를 `fetch()` | **v1 채택** — inbound surface 없음, upstream coupling 없음, CAW-04가 타이밍을 제어하고 재검사가 자기 시계로 실행됨 |
| Push | upstream이 새/변경 콘텐츠를 CAW-04에 알림 | 보류 — inbound endpoint + auth + trust surface를 추가; freshness가 필요하면 재검토 |

Pull은 import boundary를 한 방향으로 유지하고 CAW-04를 독립적으로 유지한다(upstream이 그 런타임으로 콜백하지 않음).
어느 쪽이든 재검사는 동일하다 — push는 `fetch()`가 *언제* 트리거되는지만 바꿀 뿐 core 단계는 결코 바꾸지 않는다.

`TODO(open-question: pull-only vs push; source port에 영향. ADR-0004.)`
`TODO(open-question: upstream이 source item을 재검증하거나 철회할 때 CAW-04가 이를 어떻게 알고 gate를 재실행하는지 —
provenance ref가 liveness/revocation 검사를 포함하는가. ADR-0005의 unpublish와 연결됨.)`

## Preflight (모든 I/O 이전)
import 전에 core는 active adapter를 resolve하고, `AdapterCapabilities`를 읽고, 배선을 검증한다(ADR-0004
§3): source가 content model이 필요로 하는 것을 `provides`하는지; 필요한 config/auth 존재(secret은 **env ref만**);
**어떤 `active` adapter도 `stub`이 아님**; `requiresPublicSafe`가 켜져 있음. 실패는 import 중간이 아니라 여기서
실행 가능한 메시지와 함께 보고된다.

## Open Questions
- TODO(open-question: bundle이 전체 provenance ancestor graph를 보내는가, 아니면 leaf + declared boundary만
  보내는가? leaf만이라면 해결되지 않은 ancestry는 fail closed되고 아무것도 publish되지 않는다. ADR-0003/0004.)
- TODO(open-question: fan-in에서의 dedup/precedence + provenance merge. ADR-0004.)
- TODO(open-question: pull vs push; adapter discovery 메커니즘 + adapter↔port SemVer/compat 정책. ADR-0004.)
- TODO(open-question: import된 bundle에 대한 signature/attestation 방식 — DSSE / in-toto / minisign. ADR-0003.)
- See [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md).

## runbook에 대한 함의
- **RB (ContentSourceAdapter — CAW-02/CAW-03):** read-only; id/URI/version으로 참조; provenance 태그가 붙은
  `CandidateItem` 반환; adapter는 재검사를 결코 보지 않는다.
- **RB (core re-check):** envelope parse + semver gate → 로컬 `boundary_eff`/`visibility_eff`(unknown은
  fail-closed) → rendered view에 대한 `scan()` → free-text leak scan → conflation guard → findings를 붙인
  *candidate* emit; crossing당 append-only audit 라인 하나.
- **RB (fan-in merge):** 논리적 identity로 dedup; 필드별 precedence; lattice-max boundary; provenance union;
  해소되지 않은 충돌 ⇒ 별도 candidate + curator flag.
- **RB (registry + preflight):** config 기반; `active`한 `stub` 거부; env-ref secret; I/O 이전에 배선 검증.
- **RB (seam test):** source 추가는 정확히 adapter 파일 하나 + config 블록 하나만 건드린다 — seam이 core로 새지
  않았다는 회귀 검사.
