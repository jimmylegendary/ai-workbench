# Public-Safe & Provenance — 경계 모델, audit sidecar, 로컬 재확인(re-check)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(set on review)
- **Related:**
  - [./content-model_ko.md](./content-model_ko.md) — public projection vs audit sidecar
  - [./storage-and-versioning_ko.md](./storage-and-versioning_ko.md) — sidecar + ledger가 사는 곳
  - [../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md) (gate — load-bearing)
  - [../01-decisions/ADR-0002-content-model_ko.md](../01-decisions/ADR-0002-content-model_ko.md) (sidecar 결정)
  - [../01-decisions/ADR-0004-import-and-ports_ko.md](../01-decisions/ADR-0004-import-and-ports_ko.md) (재확인은 어댑터가 아닌 CORE 단계)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적

이 데이터 레이어 문서는 저장된 데이터 수준에서 다음을 정의합니다: **경계 모델**(`public-safe` 콘텐츠만 게시됨),
**provenance 모델**(`origin_ref` / `origin_version`은 audit sidecar에 보관되며 절대 제공되지 않음),
**public-safe 재확인이 provenance로부터 경계를 로컬에서 어떻게 재유도(re-derive)하는지**, 그리고 모든 게시된
산출물을 검증된 내부 출처에 묶는 **감사 추적(audit trail)**. 이는
[ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md)의 gate 정책에 대한 데이터 측
동반 문서입니다. 전체 gate 검사 체인을 다시 기술하지 **않으며**(그건 ADR의 몫) 저장 레이아웃
([storage-and-versioning](./storage-and-versioning_ko.md))도 다루지 않습니다.

## 경계 모델

두 개의 독립 축(CAW-02에서 복사한 의미론 — 공유 라이브러리가 **아님**; brief §1 독립성):

| Axis | Values (lattice) | 의미 |
|---|---|---|
| `boundary` (민감도) | `public ⊂ internal ⊂ confidential` | 콘텐츠가 얼마나 민감한가 |
| `visibility` (범위) | `team`, `private` | 상류에서 누구를 대상으로 범위가 정해졌나 |

**게시 규칙:** 게시된 산출물은 반드시 `boundary = public`이어야 하며 **`private` 조상을 전혀 갖지 않아야** 합니다.
`internal`과 `confidential`은 절대 게시 불가입니다. 두 축은 절대 하나의 필드로 합쳐지지 않습니다. 제공되는
코퍼스에는 오직 `public-safe` 산출물만 존재합니다 — 정적 빌드는 **설계상(by construction)** public-safe입니다
([ADR-0006](../01-decisions/ADR-0006-web-stack_ko.md)).

```yaml
# embedded in the public projection (content-model.md)
boundary:
  classification: public-safe        # only this value publishes
  recheck_status: pass               # pass | fail | pending — from CAW-04's OWN re-check
  rechecked_at: TODO(set at re-check)
```

`classification: internal-only` 또는 `confidential`, 또는 `recheck_status`가 `fail`/`pending`이면 레코드는
구조적으로 게시 불가가 됩니다 — `isPublishable(record)`
([content-model](./content-model_ko.md#재사용-가능감사-가능-skill-메타데이터-표준))가 false를 반환하고 `status`는
`in-review`에 머뭅니다.

## Provenance 모델 & audit sidecar

Provenance는 **두 레코드 경계에 걸쳐 분할**됩니다
([content-model](./content-model_ko.md#두-레코드-원칙-load-bearing)):

| Field | 위치 | 제공됨? | 목적 |
|---|---|---|---|
| `origin_product` (`caw-02\|caw-03\|skills-registry`) | public projection | yes | 거친 출처 표시(어느 제품군) |
| `validated` (bool) | public projection | yes | 상류 검증이 일어났음을 단언 |
| `derivation` (`verbatim\|redacted\|summarized`) | public projection | yes | W3C PROV `wasDerivedFrom` 종류 |
| **`origin_ref`** | **audit sidecar** | **never** | 출처 제품 내 불투명한 내부 핸들 |
| **`origin_version`** | **audit sidecar** | **never** | 핀된 정확한 검증 상류 버전(결정적 감사) |
| `validated_by`, `imported_at` | audit sidecar | never | 상류 검증 주체/방법 + CAW-04 import 시점 |
| `redactions[]` (무엇을/왜 제거) | audit sidecar | never | public-safe 도달 변환 기록 |
| `reviewer`, `rationale` | audit sidecar | never | 큐레이터 승인 세부 |

### Sidecar 파일 형태 (`<slug>/<semver>.audit.yml`)

```yaml
# AUDIT-ONLY — beside the file, excluded from every build output. MUST NEVER serialize.
artifact: { id: summarize-pr-diff, kind: skill, version: 1.2.0 }
provenance:
  origin_product: caw-03
  origin_ref: "skreg://..."            # opaque internal handle — audit-only
  origin_version: "..."                # pinned upstream version — audit-only
  validated_by: "..."                  # upstream validation process (not a secret)
  imported_at: "TODO(set at import)"
  derivation: summarized
boundary_internal:
  reviewer: "Jimmy"
  rationale: "..."
  redactions: [ { field: example.output_sample, action: remove, reason: "..." } ]
recheck:
  status: pass
  rechecked_at: "TODO(set at re-check)"
  boundary_eff: public                 # locally re-derived (see below)
  visibility_eff: team
```

> 인라인 "숨김" 필드가 아니라 sidecar인 이유: 직렬화기는 직렬화 대상 객체 안에 없는 것을 누출할 수 없습니다.
> 감사 필드는 렌더링된 파일과 물리적으로 함께 이동하지 않습니다. 이것은 필터가 아니라 구조적 보장입니다.

## public-safe 재확인(re-check) (경계를 로컬에서 재유도)

재확인은 **CORE 단계**이며 절대 `ContentSourceAdapter` 안에 있지 않습니다
([ADR-0004](../01-decisions/ADR-0004-import-and-ports_ko.md)). 어떤 파일이든 git store에 기록되기 **전에** 실행됩니다
([storage-and-versioning](./storage-and-versioning_ko.md#source-of-truth-markdownmdx-in-caw-04s-own-git-repo)).
재확인은 **기본 거부(deny-by-default)**입니다: 상류의 `public_safe` 주장은 **증거일 뿐** 절대 신뢰되지 않습니다.

```
import bundle ─▶ [CORE re-check]
  1. parse + semver-gate envelope (contract_version, payload_sha256)         fail → reject
  2. re-derive boundary_eff = lattice-MAX over item + ALL provenance ancestors
        unresolvable ancestor ⇒ confidential / private   (fail-closed unknown)
  3. re-run redaction ruleset over the RENDERED PUBLIC VIEW (md/JSON a reader sees)
        any hit on a candidate-public item ⇒ reject + escalate (never auto-strip)
  4. free-text leak scan (codenames, fab/customer regexes, internal hosts, employee ids)
  5. conflation guard (no public source fused with a confidential one)
  6. emit a CANDIDATE → preview/admin with findings  (never a published item)
```

| 속성 | 데이터 레이어가 어떻게 강제하는가 |
|---|---|
| **상류를 절대 신뢰하지 않음** | `boundary.recheck_status`는 오직 CAW-04의 로컬 재확인으로만 설정됨; 상류 플래그는 sidecar에 증거로 기록될 뿐 `classification`에 복사되지 않음. |
| **provenance로부터 재유도** | `boundary_eff` = 아이템 + 모든 조상에 대한 lattice-max; 결과는 sidecar `recheck` 블록에 저장되고 게시를 게이팅함. |
| **Fail-closed** | 해석 불가능한 조상은 `confidential`/`private`로 귀결됨; 불확정 ⇒ 강등 게시가 아니라 제외됨. |
| **범위 = 렌더링된 뷰** | redaction 스캔은 원시 필드가 아니라 제공될 정확한 public projection에 대해 실행됨. |

재확인은 `recheck_status` + `boundary_eff`를 채우고, gate
([ADR-0003 G2/G4](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md))가 이를 소비합니다.
**CAW-04 내부에서 재계산된 `boundary_eff`가 권위 있는 값이며, 상류 주장은 결코 그렇지 않습니다.**

## 직렬화 방화벽(Serialization firewall)

split을 실재하게 만드는 단 하나의 규칙: **감사 전용 필드는 제공되는 어떤 출력에도 절대 나타나서는 안 됩니다**
(웹 페이지, JSON, 원시 마크다운, `index.json`, MCP resource).

| Control | 메커니즘 |
|---|---|
| **Structural** | 감사 필드는 제공되는 frontmatter가 아니라 `<slug>/<semver>.audit.yml`에 존재함(sidecar, [content-model](./content-model_ko.md#두-레코드-원칙-load-bearing)). |
| **Projection** | `publicProjection(record)` 함수가 공개 키 allow-list만으로 제공 객체를 구성함. |
| **Test-enforced** | 거부 목록(deny-list) 키(`origin_ref`, `origin_version`, `validated_by`, `reviewer`, redaction 내부값)가 빌드 산출물에 **0건** 나타남을 단언하는 테스트. 이를 약화하면 CI가 반드시 실패해야 함. |
| **Build-time assertion** | sink가 방출되는 모든 산출물에 대해 `boundary.classification == public-safe ∧ recheck_status == pass`를 단언함([ADR-0006](../01-decisions/ADR-0006-web-stack_ko.md)) — 최후 방어선. |

## 감사 추적(Audit trail)

모든 gate 결정과 모든 publish/unpublish/redact는 append-only, 해시 체인된 `_events` ledger의 이벤트입니다
([storage-and-versioning](./storage-and-versioning_ko.md#derived-index--audit-witnesses),
[ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md)). publish 이벤트당 최소:

```jsonc
{
  "seq": 0, "prev_hash": "…",
  "event": "publish",                      // publish | unpublish | redact | gate-decision
  "artifact_id": "summarize-pr-diff", "version": "1.2.0",
  "source_ref": { "product": "caw-03", "id": "<opaque>", "producer_run_id": "<opaque>" },
  "boundary_eff": "public", "visibility_eff": "team",
  "gate_result": { "G1": "pass", "G2": "pass", "G3": "pass", "G4": "pass", "G5": "pass", "G6": "pass", "G7": "pass", "G8": "approved" },
  "redaction": { "ruleset_version": "…", "hits": 0 },
  "approved_by": "Jimmy", "envelope_digest": "sha256:…",
  "hash": "H(prev_hash ‖ canonical(line))"
}
```

보장:

- **추적성(Traceability)** — `source_ref` + `producer_run_id`는 **라이브 핸들 없이** 모든 공개 산출물을 상류로
  되짚음; sidecar의 `origin_ref`/`origin_version`이 결정적 재감사를 위한 핀을 완성함.
- **변조 증거(Tamper-evidence)** — `verify_audit()`가 체인을 따라가 → `broken_at`을 찾음; git history가 중복된
  두 번째 증인.
- **재구성 가능한 결정** — "왜 게시 가능했나 + 누가 승인했나"는 기록된 `gate_result`로부터 재생 가능.
- **제거 후에도 유지(Retention across removal)** — unpublish/redact는 삭제가 아니라 이벤트임; **내부 출처로의
  provenance는 공개 바이트가 퍼지된 후에도 유지됨**([storage](./storage-and-versioning_ko.md#tombstone-semantics)).

## 미해결 질문(Open Questions)

`../08-research-plan/open-questions_ko.md`로 승격:

- TODO(open-question: does the import bundle ship the full provenance ancestor graph for local `boundary_eff` recomputation, or only the leaf + declared boundary? If only the leaf, unresolved ancestry fails closed.)
- TODO(open-question: redaction engine — Microsoft Presidio vs a lighter regex/denylist core, given human approval is mandatory regardless.)
- TODO(open-question: where CAW-04's codename/fab/customer pattern list lives and how it stays doctrinally aligned with CAW-02 without becoming a shared substrate.)
- TODO(open-question: re-validation cadence — when upstream reclassifies a source to confidential, how does CAW-04 learn it must unpublish? poll / revocation feed / curator-driven.)
- TODO(open-question: does `content_hash` cover the sidecar, or only the public projection? Coordinate with [content-model](./content-model_ko.md) + [storage](./storage-and-versioning_ko.md).)

## 런북(runbook)에 대한 함의

- `pub.safe` 재확인 라이브러리를 **CORE** 단계로(어댑터가 아님), 기본 거부로, **부정 케이스 중심의
  뮤테이션 테스트(mutation-tested)** 스위트와 함께 구축한다 — 게시하도록 기본 분기를 약화하면 스위트가 반드시
  깨져야 한다.
- 각 버전 옆에 **audit sidecar**를, 그리고 **해시 체인된 ledger**를 영속화한다; `verify_audit()`를 구현한다.
- `publicProjection(record)`(allow-list)와 감사 키가 빌드 산출물에 절대 나타나지 않음을 단언하는
  직렬화 방화벽 테스트를 구현한다.
- 재확인은 provenance로부터 `boundary.recheck_status` / `boundary_eff`를 로컬에서 설정한다; `fail`/`pending`이면
  어떤 상류 경계 플래그와 무관하게 게시가 거부된다.
