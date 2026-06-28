# 콘텐츠 모델 — 디스크 스키마, 재사용 계약, public-projection split

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(set on review)
- **Related:**
  - [./storage-and-versioning_ko.md](./storage-and-versioning_ko.md) — 이 레코드들이 어디에 사는지 + 버전이 어떻게 동결되는지
  - [./public-safe-and-provenance_ko.md](./public-safe-and-provenance_ko.md) — 경계 모델 + audit sidecar
  - [../01-decisions/ADR-0002-content-model_ko.md](../01-decisions/ADR-0002-content-model_ko.md) (엔티티 집합을 비준)
  - [../01-decisions/ADR-0005-storage-and-versioning_ko.md](../01-decisions/ADR-0005-storage-and-versioning_ko.md)
  - [../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md)
  - [../02-research/content-model-and-metadata_ko.md](../02-research/content-model-and-metadata_ko.md) (연구 근거)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적

이 문서는 CAW-04의 **데이터 레이어 정본 스키마(schema of record)** 입니다: 디스크에 놓인 8개 엔티티의 구체적인
frontmatter 형태, 재사용 가능하고 감사 가능한(reusable/auditable) Skill 메타데이터 표준, 그리고
**public-projection split** — 감사 전용 필드는 sidecar에 두고 웹/API로는 **절대 직렬화하지 않는다**는 규칙입니다.
이 문서는 [ADR-0002](../01-decisions/ADR-0002-content-model_ko.md)를 빌더가 작성하고 검증하는 정확한 YAML로
구체화합니다. 디스크 레이아웃이나 버전 동결은 결정하지 **않으며**(see [storage-and-versioning](./storage-and-versioning_ko.md)),
gate 알고리즘([public-safe-and-provenance](./public-safe-and-provenance_ko.md) 및
[ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md)),
와이어/리소스 스킴([ADR-0007](../01-decisions/ADR-0007-api-design_ko.md))도 다루지 않습니다.

## 두 레코드 원칙 (load-bearing)

모든 게시 가능한 산출물은 **`id@semver`를 공유하는 두 개의 레코드**로 저장됩니다:

| Record | 위치 | 포함 내용 | 웹/API로 직렬화? |
|---|---|---|---|
| **Public projection** | `.md(x)` frontmatter + 본문 | 독자/에이전트가 볼 수 있는 모든 것 | **예** — 이것이 *바로* 게시된 산출물 |
| **Audit sidecar** | 형제 파일(see [storage](./storage-and-versioning_ko.md)) | `origin_ref`, `origin_version`, 편집(redaction) 내부값, 리뷰어 노트 | **절대 안 함**(테스트로 강제) |

이 split이 공개 표면을 **설계상(by construction) public-safe**하게 만드는 핵심입니다: 감사 필드는 렌더링된 파일과
물리적으로 함께 이동하지 않습니다. 직렬화기는 `origin_ref`가 직렬화 대상 객체 안에 없기 때문에 이를 누출할 수
없습니다. 이 규칙은 감사 전용 키가 빌드된 어떤 페이지, JSON, 마크다운 출력에도 절대 나타나지 않음을 단언하는
테스트로 강제됩니다(see [public-safe-and-provenance](./public-safe-and-provenance_ko.md#serialization-firewall)).

## 엔티티 맵

```
Source ──(derives)──▶ Tip ───────┐
   │                  Skill ──────┤
   │                  Workflow ───┼──▶ each publishable record pins exactly
   │                  Playbook ───┘    1 Source + 1 SafetyBoundary + 1 Version
   └─ Example attaches to a parent (id@version) and carries its OWN SafetyBoundary
```

- **Tip** — 가장 작은 단위: 검증된 public-safe 통찰 하나.
- **Skill** — 재사용 가능하고 매개변수화된 역량(재사용 계약; 아래 표준 참고).
- **Workflow** — 목표를 향한 Skill/단계의 순서 있는 구성.
- **Playbook** — 시나리오 기반 번들(Workflow + Skill + Tip + 의사결정 가이드).
- **Example** — 부모에 부착된 실제 작동 사례; **독립적으로 게이팅됨**(Example이 가장 많이 누출됨).
- **Source** — 검증된 상류 출처(provenance 앵커; 감사 필드는 sidecar로 감).
- **SafetyBoundary** — 게시를 게이팅하는 분류 + 재확인(re-check) 레코드.
- **Version** — 불변하고 주소 지정 가능한 스냅샷.

`Source`, `SafetyBoundary`, `Version`은 **독립적으로 게시되는 페이지가 아니며**, 네 가지 게시 가능 종류와
(감사 필드의 경우) sidecar에 임베드/핀됩니다.

## 공통 필드 (모든 게시 가능 엔티티)

| Field | Type | Req | Projection | Notes |
|---|---|---|---|---|
| `id` | slug (kebab) | yes | public | 안정적 공개 식별자; `kind` 내에서 유일. |
| `kind` | enum | yes | public | `tip\|skill\|workflow\|playbook`. |
| `title` | string | yes | public | 사람이 읽을 수 있는 제목; API에서는 `name`. |
| `summary` | string | yes | public | 1–3문장 public-safe 요약; 에이전트 분류(triage) 필드. |
| `tags` | string[] | no | public | 패싯 브라우즈 + API 필터. |
| `version` | semver | yes | public | 불변 스냅샷 라벨(see [storage](./storage-and-versioning_ko.md)). |
| `status` | enum | yes | public | `draft\|in-review\|published\|unpublished\|redacted`. |
| `license` | SPDX id | yes | public | 예: `CC-BY-4.0`; 재사용 권한. |
| `source` | embedded Source (public subset) | yes | mixed | 공개 부분집합은 인라인; `origin_ref`/`origin_version`는 sidecar로. |
| `boundary` | embedded SafetyBoundary | yes | public | 반드시 `public-safe` + `recheck_status=pass`. |
| `content_hash` | `sha256:` digest | yes | public | 불변성 증명; 게시 시 동결. |
| `created_at` / `updated_at` | ISO-8601 | yes | public | 큐레이션 타임스탬프(빌드 시 설정; 임의 생성 금지). |

## 엔티티별 frontmatter 스키마

### Skill (재사용 계약)

```yaml
---
id: summarize-pr-diff           # = SKILL.md `name`
kind: skill
title: Summarize a PR diff for review
summary: Reviewer-focused summary of a pull-request diff.
description: |                   # = SKILL.md `description` (triggering text: what + when)
  Produce a reviewer-focused summary of a unified diff; use before code review.
version: 1.2.0
license: CC-BY-4.0
tags: [code-review, summarization]
inputs:  [{ name: diff, type: string, required: true, description: unified diff text, schema_ref: null }]
outputs: [{ name: summary, type: string, required: true, description: reviewer summary }]
preconditions:  [{ id: has-diff, description: a non-empty unified diff is provided }]
postconditions: [{ id: covers-all-files, description: every changed file is mentioned }]
steps:
  - { order: 1, instruction: "Parse hunks and group by file", tool: null }
  - { order: 2, instruction: "Summarize intent per file, then overall" }
tools_required: []              # ToolRef[] — schema.org HowToTool
failure_modes: ["binary diff → no text to summarize"]
idempotent: true
est_cost: { tokens: TODO(open-question), time: null, money: null }
source:   { origin_product: caw-03, validated: true, derivation: summarized }  # audit refs → sidecar
boundary: { classification: public-safe, recheck_status: pass, rechecked_at: TODO }
content_hash: "sha256:…"        # set at publish, immutable
---
```

`inputs`/`outputs`는 공유 `Param` 형태를 사용하며 JSON-Schema로 뒷받침(`schema_ref`)되어, 에이전트가 산문을
읽지 않고도 I/O를 검증합니다. `description`은 Claude Agent `SKILL.md` 관례를 그대로 따르므로 산출물이 skill
로더에 변경 없이 그대로 들어갑니다(로더는 알 수 없는 governance 필드를 무시함).

### Workflow

| Field | Type | Req | Notes |
|---|---|---|---|
| (common) | — | yes | |
| `goal` | string | yes | 달성된 결과(schema.org `yield`). |
| `steps` | Step[] | yes | 한 단계가 `id@version`으로 Skill을 `uses`할 수 있음. |
| `inputs` / `outputs` | Param[] | yes | 집계 계약. |
| `preconditions` | Condition[] | yes | |
| `branches` | Branch[] | no | 조건 경로(`when` → 단계 집합). |
| `skills_used` | ref[] | yes | 구성된 모든 Skill의 핀된 `id@version` — **감사 그래프**. |

### Playbook

| Field | Type | Req | Notes |
|---|---|---|---|
| (common) | — | yes | |
| `scenario` | markdown | yes | 대상이 되는 상황. |
| `decision_guide` | markdown | no | 포함된 어떤 workflow를 언제 고를지. |
| `contains` | ref[] | yes | 번들된 Workflow/Skill/Tip의 `id@version`. |
| `outcomes` | string[] | no | 기대 결과 / 성공 신호. |

### Tip

| Field | Type | Req | Notes |
|---|---|---|---|
| (common) | — | yes | |
| `body` | markdown | yes | 통찰 자체, public-safe. |
| `rationale` | markdown | no | 왜 성립하는지; `body`와 분리해 유지. |
| `applies_to` | string[] | no | 유효한 컨텍스트/도구. |
| `confidence` | enum | no | `low\|medium\|high`, 검증된 Source가 주장한 대로. |

### Example (독립적으로 게이팅됨)

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | slug | yes | |
| `parent` | ref | yes | 설명하는 Skill/Workflow/Playbook(`id@version`). |
| `input_sample` / `output_sample` | object | no | 부모 계약과 일치해야 함; public-safe(필요 시 편집됨). |
| `narrative` | markdown | no | 워크스루. |
| `boundary` | embedded SafetyBoundary | yes | **자체** 경계 — Example은 가장 높은 누출 위험을 가짐. |

### 임베드된 Source / SafetyBoundary / Version (public subset)

```yaml
# Source — only the public subset is inline; origin_ref/origin_version → sidecar
source:   { origin_product: caw-02|caw-03|skills-registry, validated: true,
            derivation: verbatim|redacted|summarized }
# SafetyBoundary — public subset (full reviewer/redaction internals → sidecar)
boundary: { classification: public-safe, recheck_status: pass|fail|pending, rechecked_at: ISO-8601 }
# Version — see storage doc for freeze semantics
version_meta: { version: "1.2.0", content_hash: "sha256:…", published_at: ISO-8601, supersedes?: "1.1.0" }
```

## 공유 값 객체(value objects)

```yaml
Param:     { name, type, required, description, schema_ref?, example? }   # JSON-Schema-backed
Condition: { id, description, check? }                                    # check = optional machine assertion
Step:      { order, instruction, uses?(id@version), tool?, supply?, expected? }
ToolRef:   { name, url?, version?, optional }                             # schema.org HowToTool
Redaction: { field, action(remove|mask|summarize), reason }              # internals → sidecar
Branch:    { when, then_steps[] }
```

## 재사용 가능/감사 가능 Skill 메타데이터 표준

Skill/Workflow는 모든 블로킹 기둥(pillar)이 성립할 때에만 **재사용 가능한 것으로 게시 가능**합니다. 이것이
gate([ADR-0003 G5](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md))가 소비하는 단일
`isPublishable(record)` 술어(predicate)입니다.

| Pillar | 필수 필드 | Blocking | 왜 중요한가 |
|---|---|---|---|
| **Identity** | `id`, `title`, `description`, `version` | yes | 발견 + 결정적 `id@version` 핀. |
| **Contract** | `inputs`, `outputs` (typed) | yes | 에이전트가 산문 없이 호출; I/O 검증. |
| **Pre/Post** | `preconditions` (+ `postconditions`) | yes | 사전 적용 가능성 확인, 사후 검증. |
| **Procedure** | `steps` (+ `tools_required`) | yes | 실행 가능한 시퀀스; 도구를 암시가 아닌 명시. |
| **Provenance** | `source` (검증됨, 핀된 상류 버전) | yes | 검증된 내부 출처로 추적됨. |
| **Safety** | `boundary = public-safe` + `recheck_status = pass` | yes | 내부/기밀이 공개로 도달하지 않음. |
| **Provability** | `content_hash`, `published_at`, `license` | yes | 불변, 주소 지정 가능, 법적으로 재사용 가능. |
| **Reliability** | `failure_modes`, `idempotent`, `est_cost` | no | 재시도/비용 결정; 권장이며 블로킹 아님. |

**규칙:** `published`는 *Identity ∧ Contract ∧ Pre/Post ∧ Procedure ∧ Provenance ∧ Safety ∧ Provability*를 요구합니다.
블로킹 기둥이 하나라도 누락되면 → status는 `in-review`에 머물고 절대 `published`가 되지 않습니다. 이는 의도된
기본 거부(default-deny) 마찰입니다.

## 미해결 질문(Open Questions)

`../08-research-plan/open-questions_ko.md`로 승격:

- TODO(open-question: JSON Schema vs MCP tool schemas as the `inputs/outputs` contract language for agent interop.)
- TODO(open-question: is a 3-level `classification` enough, or are per-field sensitivity labels needed?)
- TODO(open-question: does `content_hash` cover the sidecar, or only the public projection? — affects what "immutable" means legally; coordinate with [storage](./storage-and-versioning_ko.md).)
- TODO(open-question: license policy — single default SPDX vs per-artifact, and inheritance from upstream Source.)

## 런북(runbook)에 대한 함의

- 8개 엔티티 + 6개 값 객체 전부를 **schema-as-code**(Zod/JSON Schema)로 정의하고 `isPublishable(record)`를 단일
  술어로 만든다; 골든 픽스처를 제공한다(완전히 채워진 Skill 하나, Skill을 `id@version`으로 핀한 Workflow 하나).
- 어떤 출력보다 먼저 감사 전용 필드를 제거하는 **public projection**을 구현하고, 그 필드들이 절대 직렬화되지
  않음을 단언하는 테스트를 추가한다(see [public-safe-and-provenance](./public-safe-and-provenance_ko.md#serialization-firewall)).
- 검증은 import 시점(재확인 후)과 빌드 시점에 실행된다; 유효하지 않거나 경계 검사를 통과하지 못한 레코드는
  sink에 도달할 수 없다.
