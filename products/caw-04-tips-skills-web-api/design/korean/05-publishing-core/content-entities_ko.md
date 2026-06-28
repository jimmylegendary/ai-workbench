# Content Entities — 8개 엔티티 모델 심층 분석

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(set on review)
- **Related:**
  - [./versioning-and-immutability_ko.md](./versioning-and-immutability_ko.md)
  - [./rendering-web-and-api_ko.md](./rendering-web-and-api_ko.md)
  - [../01-decisions/ADR-0002-content-model_ko.md](../01-decisions/ADR-0002-content-model_ko.md) (이 문서가 구체화하는 결정)
  - [../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md) (`isPublishable`를 소비하는 gate)
  - [../01-decisions/ADR-0005-storage-and-versioning_ko.md](../01-decisions/ADR-0005-storage-and-versioning_ko.md) (디스크 레이아웃 + sidecar)
  - [../02-research/content-model-and-metadata_ko.md](../02-research/content-model-and-metadata_ko.md) (필드별 연구)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

이 문서는 CAW-04의 8개 콘텐츠 엔티티 — `Tip`, `Skill`,
`Workflow`, `Playbook`, `Example`, `Source`, `SafetyBoundary`, `Version` — 그리고 이들의 관계, **public /
audit projection split**, 외부 agent가 의존하는 **reusable-skill metadata contract**에 대한
**구현 관점의 레퍼런스**다. 이 문서는
[ADR-0002](../01-decisions/ADR-0002-content-model_ko.md)를 빌더가 바로 쓸 수 있는 엔티티 맵으로 바꾼다. 모든
필드 테이블을 다시 나열하지 않으며(see [content-model research](../02-research/content-model-and-metadata_ko.md)), 버전 관리
방식([versioning-and-immutability](./versioning-and-immutability_ko.md))이나 렌더링([rendering-web-and-api](./rendering-web-and-api_ko.md))을
결정하지도 않는다. 여기서 구체화하는 핵심 속성: **레코드는 설계상 public-safe하다 — provenance와 통과한 public-safe boundary가
둘 다 존재하기 전까지는 구조적으로 publish가 불가능하며, audit 전용 필드는 web/API로 직렬화될 수 없다.**

## 1. 엔티티 분류

8개 엔티티가 3개 역할로 나뉜다. 이 중 4개만 **publishable**(자체 URL을 가짐)이고, 나머지는 publishable 아티팩트에
부착되는 **support record**다.

| Role | Entities | URL of its own? | Carries `boundary`? |
|---|---|---|---|
| **Publishable artifacts** | Tip, Skill, Workflow, Playbook | yes (`/{type}/{slug}`) | yes (own SafetyBoundary) |
| **Attached content** | Example | sub-resource only (`/{type}/{slug}/examples`) | yes (gated independently) |
| **Governance / audit** | Source, SafetyBoundary, Version | never (embedded or sidecar) | n/a |

4개의 publishable 아티팩트는 **composition ladder**(구성 계층)를 이룬다 — 상위 계층은 하위 계층을 고정된
`id@version`으로 참조하며, 복사하지 않는다:

```
Tip        ── atomic insight ("do X because Y")
Skill      ── reusable parameterized capability (the reuse contract)
Workflow   ── ordered composition of Skills (steps may `uses: skill@semver`)
Playbook   ── scenario bundle of Workflows + Skills + Tips (`contains: [id@version]`)
```

## 2. 관계 맵

```
                 ┌───────────── Source (provenance anchor, 1 per Version) ──────────────┐
                 │                                                                        │ audit-only
   SafetyBoundary┤  (1 gate record per Version; only classification=public-safe publishes)│  origin_ref
                 │                                                                        │  origin_version
                 ▼                                                                        ▼  (SIDECAR)
   ┌───────► Tip ─────────┐
   │         Skill ───────┤── each: 1 Source + 1 SafetyBoundary + 1+ Version + 0..n Example
   │         Workflow ────┤
   │         Playbook ────┘
   │            │
   │            ├─ Workflow.skills_used[]  → pins Skill   by id@version  (audit graph)
   │            ├─ Workflow.steps[].uses   → pins Skill   by id@version
   │            └─ Playbook.contains[]     → pins Workflow/Skill/Tip by id@version
   │
   └─ Example.parent → pins one artifact by id@version (Example has its OWN boundary)
```

그래프를 audit 가능하고 immutable-safe하게 만드는 세 가지 관계 규칙:

1. **구성은 고정 참조(pinned reference)로만 이뤄지며 임베딩하지 않는다.** Workflow는 Skill의 본문을 복사하지 않고
   `skill@2.1.0`을 pin한다. pin들의 집합이 **audit graph**다 — 전이적으로 사용된 모든 아티팩트를 열거할 수 있고
   각자의 검증된 Source로 추적된다 ([ADR-0002](../01-decisions/ADR-0002-content-model_ko.md)).
2. **pin은 version-exact다.** `(slug, semver)`가 영원히 고정되므로
   ([versioning-and-immutability](./versioning-and-immutability_ko.md)), pin은 참조하는 쪽의 수명 내내 바이트 단위로
   동일한 콘텐츠로 resolve된다. TODO(open-question: workflow step 참조가 range / `latest`를 허용하는가, 아니면 정확한
   `id@version`만 허용하는가? — [ADR-0007](../01-decisions/ADR-0007-api-design_ko.md)에서 이어짐).
3. **모든 publishable 레코드는 `Version`마다 정확히 하나의 `Source`와 하나의 `SafetyBoundary`를 참조한다.** 이들은
   *publish 시점에* `source_at_publish` / `boundary_at_publish`로 캡처되어, live 레코드가 나중에 바뀌더라도 audit이
   결정론적으로 유지된다.

## 3. public / audit projection split (load-bearing)

모든 엔티티 필드는 두 projection 중 정확히 하나에 속한다. 이 split이 brief에서 가장 중요한 guardrail(§11)
**public outputs from public-safe sources only**의 구조적 보증이다.

| Projection | Where it lives | Serialized to web/API? | Example fields |
|---|---|---|---|
| **Public projection** | rendered YAML frontmatter + markdown body | **yes** | `id`, `title`, `summary`, `inputs`, `outputs`, `boundary.classification`, `version`, `digest`, `license` |
| **Audit sidecar** | sidecar record beside the file (`*.audit.json` per [ADR-0005](../01-decisions/ADR-0005-storage-and-versioning_ko.md)) | **NEVER** | `Source.origin_ref`, `Source.origin_version`, `Redaction` internals, `internal_only` markers |

```
src/content/skills/triage-incident/
  2.1.0.mdx          # public projection — what renders + serializes
  2.1.0.audit.json   # audit sidecar — origin_ref, origin_version, redaction internals (NEVER served)
```

집행은 **관례가 아니라 코드 + 테스트**로 이뤄진다:

- 단일 `toPublicProjection(record)` 함수가 모든 web/API emit 이전에 audit 전용 필드를 제거한다.
- 빌드 타임 불변식이 emit되는 모든 레코드에 대해 `boundary.classification === "public-safe"`와
  `recheck_status === "pass"`를 단언하고, 그렇지 않으면 빌드를 실패시킨다.
- 회귀 테스트가 audit 필드명(`origin_ref`, `origin_version`, …)이 emit된 어떤 HTML/JSON/markdown 바이트 스트림에도
  결코 나타나지 않음을 단언한다. 이것이 [ADR-0002](../01-decisions/ADR-0002-content-model_ko.md)가 의무화하는 테스트다.

`boundary`(민감도 분류)와 **visibility**는 의도적으로 별개의 필드이며 — 하나로 합쳐지지 않는다. 레코드는
`internal-only`이면서 단순히 빌드에서 빠질 수 있다; 결코 "publish되었지만 숨겨진" 상태가 아니다.

## 4. 엔티티 빠른 참조

전체 필드 테이블은 [content-model research](../02-research/content-model-and-metadata_ko.md)에 있으며, 여기서는
한눈에 보는 contract다. **Req** = 해당 엔티티가 `published`에 도달하기 위한 필수 항목.

| Entity | Defining fields (beyond common) | Req-critical additions |
|---|---|---|
| **Tip** | `body`, `rationale?`, `applies_to?`, `confidence?` | `body` |
| **Skill** | `description`, `inputs[]`, `outputs[]`, `preconditions[]`, `steps[]`, `postconditions?`, `tools_required?`, `failure_modes?`, `idempotent?`, `est_cost?` | `description`, `inputs`, `outputs`, `preconditions`, `steps` |
| **Workflow** | `goal`, `steps[]` (`uses: skill@semver`), `inputs/outputs`, `preconditions[]`, `branches?`, `skills_used[]` | `goal`, `steps`, `skills_used` (pinned) |
| **Playbook** | `scenario`, `decision_guide?`, `contains[]` (`id@version`), `outcomes?` | `scenario`, `contains` (pinned) |
| **Example** | `parent` (`id@version`), `input_sample?`, `output_sample?`, `narrative?`, **own `boundary`** | `parent`, own `boundary` |
| **Source** | `origin_product`, `origin_ref`*, `origin_version`*, `validated`, `validated_by`, `imported_at`, `derivation`, `internal_only` | `validated == true` |
| **SafetyBoundary** | `classification`, `recheck_status`, `rechecked_at`, `redactions?`, `reviewer`, `rationale?`, `expires_at?` | `classification == public-safe`, `recheck_status == pass` |
| **Version** | `version` (semver), `content_hash`, `supersedes?`, `published_at`, `change_note?`, `source_at_publish`, `boundary_at_publish` | `version`, `content_hash`, `published_at` |

\* `origin_ref` / `origin_version`은 **audit 전용**이다(sidecar; 결코 직렬화되지 않음) — §3.

**Common fields** (모든 publishable 엔티티): `id`, `kind`, `title`, `summary`, `tags?`, `source`, `boundary`,
`version`, `status`, `license`, `created_at`, `updated_at`. 타입은 research 참조.

## 5. 공유 value object

```yaml
Param:      { name, type, required, description, schema_ref?, example? }   # type backed by JSON Schema
Condition:  { id, description, check? }                                    # check = optional machine assertion
Step:       { order, instruction, uses?(skill id@version), tool?, supply?, expected? }
ToolRef:    { name, url?, version?, optional }                             # schema.org HowToTool semantics
Redaction:  { field, action(remove|mask|summarize), reason }              # internals live in the audit sidecar
Branch:     { when, then_steps[] }
```

`inputs`/`outputs`는 `type`이 JSON-Schema로 뒷받침되는(`schema_ref`) `Param[]`이므로, agent가 산문을 읽지 않고도
I/O를 검증한다. TODO(open-question: family contract 언어로 JSON Schema vs MCP tool-schema —
[ADR-0002](../01-decisions/ADR-0002-content-model_ko.md)에서).

## 6. reusable-skill metadata contract

`Skill`/`Workflow`는 **모든 blocking pillar**가 성립할 때만 `published`가 된다. 이것이
[ADR-0002](../01-decisions/ADR-0002-content-model_ko.md)가 `isPublishable(record)`로 명명한 술어이며,
[ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md)의 gate check G5가 여기에 직접 매핑된다.

| Pillar | Blocking? | Required fields | What it buys the consumer |
|---|---|---|---|
| **Identity** | yes | `id`, `title`, `description`, `version` | discovery + deterministic `id@version` pinning |
| **Contract** | yes | `inputs`, `outputs` (typed) | call without reading prose; validate I/O |
| **Pre/Post** | yes | `preconditions` (+ `postconditions?`) | check applicability before, verify after |
| **Procedure** | yes | `steps` (+ `tools_required?`) | executable sequence; tools named, not implied |
| **Provenance** | yes | `source` (validated, pinned `origin_version`) | every artifact traces to a validated internal origin |
| **Safety** | yes | `boundary = public-safe` ∧ `recheck_status = pass` | nothing internal/confidential reaches the surface |
| **Provability** | yes | `content_hash`, `published_at`, `license` | immutable, addressable, legally reusable |
| **Reliability** | no (recommended) | `failure_modes`, `idempotent`, `est_cost` | agent retry/cost decisions |

```text
isPublishable(record) :=
      Identity ∧ Contract ∧ Pre/Post ∧ Procedure ∧ Provenance ∧ Safety ∧ Provability
# Missing ANY blocking pillar → status stays `in-review`, never `published` (default-deny).
# Reliability missing → still publishable, flagged as best-effort.
```

`status` lifecycle: `draft → in-review → published → (deprecated) → unpublished | redacted`. gate만이 레코드를
`published`로 이동시키며; Jimmy가 승인한 removal op만이 거기서 빼낼 수 있다
([versioning-and-immutability](./versioning-and-immutability_ko.md) §removal).

## 7. public frontmatter 예시 (Skill)

디스크상의 source of truth이며; API index는 여기서 파생된다. audit 전용 필드는 여기 없다(sidecar에 있다).

```yaml
---
id: triage-incident
kind: skill
title: Triage an incoming incident
description: Classify and route a new incident before on-call escalates; use at first alert.
version: 2.1.0
license: CC-BY-4.0
tags: [ops, incident-response]
inputs:  [{ name: alert, type: string, required: true, description: raw alert payload }]
outputs: [{ name: triage_report, type: markdown, required: true }]
preconditions: [{ id: has-alert, description: a non-empty alert payload is provided }]
steps:
  - { order: 1, instruction: "Classify severity from the alert signature" }
  - { order: 2, instruction: "Route to the owning team and draft the triage report" }
source:   { ref: src-caw03-0117, validated: true, derivation: summarized }  # ref opaque; details in sidecar
boundary: { classification: public-safe, recheck_status: pass }
content_hash: "sha256:…"   # set at publish, immutable
---
```

## 8. Open Questions

[../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md)에서 추적:

- TODO(open-question: CAW-02 / CAW-03이 pin할 안정적이고 버전이 있는 `origin_ref`를 노출하는가, 아니면 mutable handle만 노출하는가?)
- TODO(open-question: `inputs/outputs` contract 언어로 JSON Schema vs MCP tool-schema.)
- TODO(open-question: 3단계 `classification`으로 충분한가, 아니면 필드별 민감도 레이블이 필요한가?)
- TODO(open-question: license 정책 — 단일 기본 SPDX vs 아티팩트별, 그리고 upstream Source로부터의 상속.)
- TODO(open-question: workflow step pin — 정확한 `id@version`만 vs range/`latest`.)

## 9. runbook에 대한 함의

- 8개 엔티티 + 6개 value object 전부를 **schema-as-code**(Zod/JSON Schema)로 정의하고, `isPublishable(record)`를
  단일 blocking-pillar gate로 둔다.
- audit 전용 필드를 제거하는 `toPublicProjection(record)`를 구현하고, 그 필드명들이 HTML/JSON/markdown으로 결코
  직렬화되지 않음을 단언하는 회귀 테스트를 추가한다.
- golden fixture를 제공한다: 완전히 채워진 reusable Skill 하나와 Skill을 `id@version`으로 pin하는 Workflow 하나로,
  reuse contract와 audit graph를 고정한다.
- 각 version 파일 옆에 audit sidecar를 영속화하고; 빌드 출력 집합에서 sidecar가 제외됨을 단언한다.
