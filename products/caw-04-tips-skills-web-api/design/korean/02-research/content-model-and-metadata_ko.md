# Content Model & Metadata (콘텐츠 모델과 메타데이터)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF_ko.md), [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS_ko.md), [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

이 문서는 CAW-04의 **content model**(콘텐츠 모델)을 정의한다. 즉 엔티티 `Tip, Skill, Workflow, Playbook, Example,
Source, SafetyBoundary, Version`과 그 필드들, 그리고 발행된 Skill/Workflow를 **reusable**(재사용 가능, 에이전트가
가져와 실행할 수 있음)인 동시에 **auditable**(감사 가능, 모든 주장이 검증된 내부 source와 public-safe 경계로
추적됨)하게 만드는 **reusable-skill 메타데이터 표준**을 정의한다. 이는 저장 ADR, publish-gate 설계, API 스키마
문서에 입력으로 쓰인다. 이 문서는 저장 레이아웃(md/MDX 대 DB), public-safe gate 알고리즘, wire/직렬화 포맷, import
adapter 메커니즘을 **결정하지 않는다** — 그것들은 별도의 ADR/문서이다. 또한 콘텐츠를 저작하지 않으며, 콘텐츠가
발행 가능해지기 위해 가져야 할 형태를 정의한다.

## Design principles (brief에서 온 제약)

1. **Publish-safe by construction.** 발행된 모든 레코드는 `public-safe`인 `boundary`와 검증된 upstream source로의
   `provenance` 링크를 가진다. 둘 중 하나라도 없는 레코드는 발행 불가하다 (brief §5, §11).
2. **Immutable, addressable Versions.** 발행된 콘텐츠는 버전이 매겨진다. 발행된 `Version`은 불변이며 영구히 주소
   지정 가능하다 (brief §5). 편집은 새 Version을 만들고, 이전 것은 계속 읽을 수 있다.
3. **Reuse needs a contract, not prose.** Skill/Workflow는 그 `inputs`, `outputs`, `preconditions`,
   `safety boundary`가 markdown 안에 묻혀 있지 않고 machine-readable일 때에만 재사용 가능하다 (brief §5).
4. **Separation of layers.** Source/claim/evidence와 생성된 요약은 구분된 필드이며 결코 병합되지 않는다
   (brief §11). 이 모델은 내부 source 식별자를 공개 렌더링 필드에 결코 섞어 넣지 않는다.
5. **Ground on real standards.** Frontmatter는 [Claude Agent Skill `SKILL.md`](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview)
   패턴(`name`/`description` 필수)을 따른다. 단계 의미론은
   [schema.org/HowTo](https://schema.org/HowTo)(`tool`/`supply`/`step`/`yield`)에서 빌려온다. provenance는
   [W3C PROV](https://www.w3.org/TR/prov-overview/)의 `wasDerivedFrom`에서 빌려온다. license는 SPDX 식별자를 쓴다.

## Entity map

```
Source ──(derives)──▶ Tip ───────┐
   │                  Skill ──────┤
   │                  Workflow ───┼──▶ has 1 SafetyBoundary, 1+ Example, 1+ Version
   │                  Playbook ───┘
   └─ every publishable entity references exactly one validated Source + one SafetyBoundary per Version
```

- **Tip** — 가장 작은 단위: 검증된 public-safe 통찰 하나("Y이므로 X를 하라").
- **Skill** — 재사용 가능하고 매개변수화된 역량(재사용 contract의 핵심).
- **Workflow** — 결과를 향한 Skill/단계들의 순서 있는 조합.
- **Playbook** — 상위 차원의 시나리오 중심 묶음(Workflow + Tip + 의사결정 가이드).
- **Example** — Skill/Workflow/Playbook에 붙은 구체적 작동 사례.
- **Source** — 검증된 upstream 기원(CAW-02 knowledge / CAW-03 skills registry) — provenance 앵커.
- **SafetyBoundary** — 발행을 통제하는 분류 + redaction 레코드.
- **Version** — 발행 가능한 엔티티의 불변·주소 지정 가능한 스냅샷.

## Common fields (모든 발행 가능 엔티티)

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | slug (kebab) | yes | 안정적인 공개 식별자; 엔티티 타입 내에서 고유. |
| `kind` | enum | yes | `tip\|skill\|workflow\|playbook`. |
| `title` | string | yes | 사람이 읽는 형태; 웹에 렌더링되며 API에서는 `name`. |
| `summary` | string | yes | 1–3 문장의 public-safe 요약; API/에이전트의 분류(triage) 필드. |
| `tags` | string[] | no | 분류 탐색(faceted browse) + API 필터. |
| `source` | ref(Source) | yes | provenance 앵커; 없거나 미검증이면 publish gate 실패. |
| `boundary` | ref(SafetyBoundary) | yes | 발행하려면 `public-safe`로 해석되어야 함. |
| `version` | ref(Version) | yes | 이 레코드가 나타내는 불변 스냅샷. |
| `status` | enum | yes | `draft\|in-review\|published\|unpublished\|redacted`. |
| `license` | SPDX id | yes | 예: `CC-BY-4.0`; 독자/에이전트가 이를 가지고 할 수 있는 것. |
| `created_at` / `updated_at` | ISO-8601 | yes | 큐레이션 타임스탬프(임의로 만들지 않음; 빌드 시 설정). |

## Per-entity fields

### Tip

| Field | Type | Req | Notes |
|---|---|---|---|
| (common fields) | — | yes | 위 참조. |
| `body` | markdown | yes | 통찰 본문, public-safe. |
| `rationale` | markdown | no | 왜 성립하는가; `body`와 분리 유지. |
| `applies_to` | string[] | no | 이 tip이 유효한 컨텍스트/도구. |
| `confidence` | enum | no | 검증된 Source가 단언한 `low\|medium\|high`. |

### Skill (reuse contract — 아래 표준 참조)

| Field | Type | Req | Notes |
|---|---|---|---|
| (common fields) | — | yes | `name`(=`id`) + `description`(=`summary`)이 SKILL.md를 미러링. |
| `description` | string | yes | 트리거 텍스트: 무엇을 하는지 + 언제 쓰는지. |
| `inputs` | Param[] | yes | 타입이 지정된 입력 contract(JSON-Schema 기반). |
| `outputs` | Param[] | yes | 타입이 지정된 출력 contract. |
| `preconditions` | Condition[] | yes | 실행 전 참이어야 할 것. |
| `postconditions` | Condition[] | no | 실행 후 보장되는 것. |
| `steps` | Step[] | yes | 순서 있는 동작(`instruction`, `tool`, `supply`). |
| `tools_required` | ToolRef[] | no | 이름이 명시된 외부 도구/API(schema.org `tool`). |
| `failure_modes` | string[] | no | 알려진 실패 방식 + 완화책. |
| `idempotent` | bool | no | 재실행해도 안전한가? 에이전트 retry 동작을 좌우. |
| `est_cost` | object | no | `{tokens?, time?, money?}` — best-effort, 추정값임을 표시. |

### Workflow

| Field | Type | Req | Notes |
|---|---|---|---|
| (common fields) | — | yes | |
| `goal` | string | yes | workflow가 달성하는 결과(schema.org `yield`). |
| `steps` | Step[] | yes | 순서 있음; 한 단계가 `id@version`으로 Skill을 `uses`할 수 있음. |
| `inputs` / `outputs` | Param[] | yes | workflow 전체에 대한 집계 contract. |
| `preconditions` | Condition[] | yes | |
| `branches` | Branch[] | no | 조건부 경로(`when` → step 집합). |
| `skills_used` | ref(Skill)[] | yes | 조합된 모든 Skill의 고정된 `id@version`(audit 그래프). |

### Playbook

| Field | Type | Req | Notes |
|---|---|---|---|
| (common fields) | — | yes | |
| `scenario` | markdown | yes | 이 playbook이 다루는 상황. |
| `decision_guide` | markdown | no | 포함된 어느 workflow를 언제 고를지. |
| `contains` | ref[] | yes | 묶인 Workflow/Skill/Tip의 `id@version`. |
| `outcomes` | string[] | no | 기대 결과 / 성공 신호. |

### Example

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | slug | yes | |
| `parent` | ref | yes | 그것이 예시하는 Skill/Workflow/Playbook(`id@version`). |
| `input_sample` | object | no | parent contract에 맞는 구체적 입력. |
| `output_sample` | object | no | 결과 출력(public-safe; 필요 시 redact). |
| `narrative` | markdown | no | 워크스루. |
| `boundary` | ref(SafetyBoundary) | yes | Example이 가장 많이 누출됨; 독립적으로 통제됨. |

### Source (provenance 앵커)

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | slug | yes | |
| `origin_product` | enum | yes | `caw-02\|caw-03\|skills-registry`. |
| `origin_ref` | string | yes | 기원 제품 내의 불투명한 내부 식별자. |
| `origin_version` | string | yes | 검증된 정확한 upstream 버전에 고정(pin). |
| `validated` | bool | yes | 발행하려면 `true`여야 함(import 시 재확인). |
| `validated_by` | string | yes | upstream을 검증한 주체/방법(프로세스이며 비밀이 아님). |
| `imported_at` | ISO-8601 | yes | CAW-04가 이를 import한 시점. |
| `derivation` | enum | yes | `verbatim\|redacted\|summarized`(PROV `wasDerivedFrom`). |
| `internal_only` | bool | yes | 결코 공개 렌더링되면 안 되는 필드를 표시. |

> `origin_ref`/`origin_version`은 공개 표면에 **결코** 렌더링되지 않는다 — audit 전용 필드로, 레코드 곁에
> 저장되지만 웹/API 출력에서는 제외된다(레이어 분리, brief §11).

### SafetyBoundary (publish gate 레코드)

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | slug | yes | |
| `classification` | enum | yes | `public-safe\|internal-only\|confidential`. `public-safe`만 발행됨. |
| `recheck_status` | enum | yes | CAW-04 자체 재확인의 `pass\|fail\|pending`(upstream을 결코 신뢰하지 않음). |
| `rechecked_at` | ISO-8601 | yes | CAW-04가 경계를 재검증한 시점. |
| `redactions` | Redaction[] | no | public-safe에 도달하기 위해 제거/변환된 것. |
| `reviewer` | string | yes | 승인한 큐레이터(brief §11: Jimmy가 모든 publish를 승인). |
| `rationale` | markdown | no | 이 분류가 성립하는 이유. |
| `expires_at` | ISO-8601 | no | 선택적 재검토 트리거; 만료 시 → `pending`. |

### Version (불변 스냅샷)

| Field | Type | Req | Notes |
|---|---|---|---|
| `version` | semver-ish | yes | 공개 버전 레이블, 예: `1.2.0`. |
| `content_hash` | hash | yes | 전체 레코드의 content-addressed 다이제스트(불변성 증명). |
| `supersedes` | ref(Version) | no | 이것이 대체하는 이전 버전; 이전 것은 계속 주소 지정 가능. |
| `published_at` | ISO-8601 | yes | publish 시 설정; 이후 불변. |
| `change_note` | string | no | `supersedes` 대비 무엇이 바뀌었는지. |
| `source_at_publish` | ref(Source) | yes | publish 시 고정된 Source(audit 결정성). |
| `boundary_at_publish` | ref(SafetyBoundary) | yes | publish 시 유효했던 boundary 레코드. |

## Shared value objects (공유 값 객체)

```yaml
Param:        { name, type, required, description, schema_ref?, example? }   # type backed by JSON Schema
Condition:    { id, description, check? }                                    # check = optional machine assertion
Step:         { order, instruction, uses?(skill id@version), tool?, supply?, expected? }
ToolRef:      { name, url?, version?, optional }                             # schema.org HowToTool
Redaction:    { field, action(remove|mask|summarize), reason }
Branch:       { when, then_steps[] }
```

## The reusable-skill metadata standard

Skill/Workflow는 아래 조건을 모두 만족할 때에만 **재사용 가능한 형태로 발행 가능(publishable as reusable)**하다.
이것은 외부 에이전트가 REST API로 아티팩트를 가져올 때 의존하는 contract이다.

| Pillar | Required fields | 재사용/audit에 왜 중요한가 |
|---|---|---|
| **Identity** | `id`, `title`, `description`, `version` | 에이전트 발견 + 결정적 고정(`id@version`). |
| **Contract** | `inputs`, `outputs` (타입 지정, JSON-Schema 기반) | 산문을 읽지 않고 호출 가능; I/O 검증. |
| **Pre/Post** | `preconditions` (+ `postconditions`) | 실행 전 적용 가능성 확인; 실행 후 검증. |
| **Procedure** | `steps` (+ `tools_required`) | 실행 가능한 순서; 도구가 암시가 아니라 명시됨. |
| **Provenance** | `source`(검증됨, `origin_version` 고정) | 모든 아티팩트가 검증된 내부 기원으로 추적됨. |
| **Safety** | `boundary` = `public-safe` + `recheck_status=pass` | 내부/기밀이 공개 표면에 도달하지 않음. |
| **Reliability** | `failure_modes`, `idempotent`, `est_cost` | 에이전트 retry/비용 결정; 재사용 기대치 설정. |
| **Provability** | `content_hash`, `published_at`, `license` | 불변, 주소 지정 가능, 법적으로 재사용 가능. |

**Reusable-skill rule:** 아티팩트는 *Identity ∧ Contract ∧ Pre/Post ∧ Procedure ∧ Provenance ∧ Safety ∧
Provability*가 모두 만족될 때에만 `published`가 된다. Reliability는 권장되지만 차단 요건은 아니다. 차단 pillar 중
하나라도 빠지면 status는 `in-review`에 머물며 결코 `published`가 되지 않는다.

### Public frontmatter projection (md/MDX-first)

디스크상의 source of truth는 YAML frontmatter가 있는 markdown이며, API 인덱스는 거기서 파생된다. audit 전용
필드(`origin_ref`, `origin_version`, redaction 내부 정보)는 **sidecar** 레코드에 존재하며, 렌더링/서빙되는 public
frontmatter에는 결코 들어가지 않는다.

```yaml
---
id: summarize-pr-diff
kind: skill
title: Summarize a PR diff for review
description: Produce a reviewer-focused summary of a pull request diff; use before code review.
version: 1.2.0
license: CC-BY-4.0
tags: [code-review, summarization]
inputs:  [{ name: diff, type: string, required: true, description: unified diff text }]
outputs: [{ name: summary, type: string, required: true, description: reviewer summary }]
preconditions: [{ id: has-diff, description: a non-empty unified diff is provided }]
steps:
  - { order: 1, instruction: "Parse hunks and group by file", tool: null }
  - { order: 2, instruction: "Summarize intent per file, then overall" }
source: { ref: src-caw02-0042, validated: true, derivation: summarized }   # ref is opaque, audit-only
boundary: { classification: public-safe, recheck_status: pass }
content_hash: "sha256:…"     # set at publish, immutable
---
```

## Tradeoffs / ADR로 미룬 결정

| Question | Options | Lean (이 문서) | Decide in |
|---|---|---|---|
| 타입 지정 contract 백엔드 | ad-hoc YAML 대 JSON Schema `$ref` 대 OpenAPI components | JSON Schema (`schema_ref`) | content-model ADR |
| Version 레이블 방식 | semver 대 날짜 대 content-hash만 | semver 레이블 + 불변성용 `content_hash` | versioning ADR |
| audit 필드 위치 | 인라인(숨김) 대 sidecar 파일 대 DB 행 | sidecar 레코드, 서빙 출력에서 제외 | storage ADR |
| Skill ↔ schema.org HowTo | 어휘 채택 대 커스텀 | `tool/supply/step/yield` 의미론 차용, 필드명은 자체 | content-model ADR |
| Example boundary | parent 상속 대 독립 gate | 독립 `SafetyBoundary`(Example이 가장 많이 누출) | publish-gate doc |

## Open Questions

- TODO(open-question: CAW-02/CAW-03이 고정 가능한 안정적·버전 지정된 `origin_ref`를 노출하는가, 아니면 가변
  핸들만 제공하는가? 결정적 audit을 위해 `origin_version` 고정이 필요하다.)
- TODO(open-question: `inputs/outputs`의 합의된 contract 언어가 제품군 전반에서 JSON Schema인가, 아니면 에이전트
  상호운용을 위해 MCP tool 스키마에 맞추는가?)
- TODO(open-question: 최소 실행 가능한 `SafetyBoundary.classification` enum — 3단계 척도로 충분한가, 아니면
  필드별 민감도 레이블이 필요한가?)
- TODO(open-question: `Version.content_hash`가 sidecar/audit 필드까지 포함해야 하는가, 아니면 public projection만
  포함하는가? "불변"이 법적으로 무엇을 뜻하는지에 영향.)
- TODO(open-question: license 정책 — 단일 기본 SPDX license 대 아티팩트별, 그리고 upstream Source로부터 어떻게
  상속되는가.)

## Implications for runbooks

- runbook은 8개 엔티티 + 6개 값 객체 전부에 대한 **content schema를 코드로**(예: Zod/JSON Schema) 정의해야 하며,
  차단 pillar 검증을 단일 `isPublishable(record)` gate로 두어야 한다.
- runbook은 웹/API 출력 전에 audit 전용 필드(`origin_ref`, `origin_version`, redaction 내부 정보)를 제거하는
  **public projection**을 구현해야 하며, 이것들이 결코 직렬화되지 않음을 단언하는 테스트를 두어야 한다.
- runbook은 publish 시점에 `content_hash` + `published_at`를 계산·동결하고 `published` Version의 변형을 금지해야
  한다(append-only; 편집 시 새 Version).
- runbook은 CAW-04 내부에서 `SafetyBoundary.recheck_status`를 재도출하는 **import 재확인**을 구현하고, upstream의
  어떤 boundary 플래그와도 무관하게 `fail`/`pending`이면 publish를 거부해야 한다.
- Fixture/golden 파일은 완전히 채워진 reusable Skill 하나와 `id@version`으로 Skill을 고정하는 Workflow 하나를
  포함해 재사용 contract를 고정해야 한다.
