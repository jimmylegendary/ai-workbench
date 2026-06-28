# ADR-0002: Content model (Tip/Skill/Workflow/Playbook/Example/Source/SafetyBoundary/Version) + reusable/auditable 메타데이터

- **Status:** proposed
- **Owner:** Jimmy
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md
- **Related:**
  - [ADR-0001-product-surface-and-delivery.md](./ADR-0001-product-surface-and-delivery_ko.md)
  - [ADR-0003-publishing-policy-and-public-safe-gate.md](./ADR-0003-publishing-policy-and-public-safe-gate_ko.md)
  - ADR-0004 (import, ports & adapters — group B), ADR-0005 (storage & versioning — group B), ADR-0006 (web & API stack — group B)
  - [../02-research/content-model-and-metadata.md](../02-research/content-model-and-metadata_ko.md), [../02-research/skills-distribution-and-api-resources.md](../02-research/skills-distribution-and-api-resources_ko.md)

## Context

CAW-04의 가치 단위는 provenance + 안전 boundary를 지니는 **하나의 publish된, versioned, public-safe 산출물**이다(brief §2, §5). 이 모델은 산출물을 **reusable**(agent가 메타데이터만으로 Skill을 fetch하고 실행 가능)하면서 동시에 **auditable**(모든 주장이 검증된 내부 Source와 public-safe한 SafetyBoundary로 추적됨)하게 만들어야 한다. brief는 엔티티 집합을 확정한다; 이 ADR은 그 필드들, reuse 계약, 그리고 레코드가 언제 publishable한지를 결정하는 규칙을 비준한다. 이 ADR은 storage 레이아웃(ADR-0005), gate 알고리즘(ADR-0003), wire/resource 스킴(ADR-0006), 또는 import 메커니즘(ADR-0004)을 결정하지 않는다.

작용하는 힘(forces):
- **publish-safe by construction**(brief §5, §11): 검증된 `source` 또는 `public-safe`한 `boundary`가 빠진 레코드는 구조적으로 publish 불가능하다.
- **재사용에는 산문이 아니라 machine-readable 계약이 필요하다**(brief §5): `inputs`/`outputs`/`preconditions`/`steps`는 markdown에 묻히지 않고 typed 필드여야 한다.
- **레이어 분리**(brief §11): source/claim/evidence와 생성된 summary는 별개로 유지된다; 내부 식별자는 절대 public-rendered 필드에 섞이지 않는다.
- **불변(immutable), addressable한 Version**(brief §5): 편집은 새 Version을 생성하며, 이전 것들은 읽을 수 있게 유지된다.
- 산출물이 agent 런타임과 상호 운용되도록 **실제 표준 위에 기반한다**.

## Options considered

| Decision | Options | Choice | Why |
|---|---|---|---|
| Entity set | brief의 8개 엔티티 vs 평탄화된 "document" 모델 | **brief의 8개 엔티티**(Tip, Skill, Workflow, Playbook, Example, Source, SafetyBoundary, Version) | brief §5로 확정; 각각이 별개의 reuse/audit 의미를 지님 |
| Reuse-contract 뒷받침 | 임시 YAML vs **JSON-Schema-backed typed 필드** vs OpenAPI components | **JSON-Schema-backed** `inputs/outputs`(`schema_ref`) | agent가 산문을 읽지 않고 I/O를 검증; MCP tool schema와 정렬 |
| Frontmatter 기반 | CAW-04 포맷을 발명 vs **Claude Agent `SKILL.md`에 정렬** | **정렬**(`name`=`id`, `description`=`summary`) + 가산적 governance 필드 | skill 로더에 그대로 들어감; 알 수 없는 필드는 무시됨 |
| Step/procedure 어휘 | 커스텀 vs **schema.org/HowTo 의미 차용** | `tool/supply/step/yield` 의미 차용, 자체 필드명 | 검증된 어휘, lock-in 없음 |
| Provenance 어휘 | 커스텀 vs **W3C PROV `wasDerivedFrom`** | PROV `derivation` enum(`verbatim\|redacted\|summarized`) 차용 | 표준, audit-grade |
| audit-only 필드의 위치 | inline-hidden vs **sidecar** vs DB row | **sidecar**, 제공 출력에서 제외 | 내부 ref가 절대 공개적으로 직렬화되지 않음을 보장 |
| License | 없음 vs **산출물당 SPDX id** | SPDX id(예: `CC-BY-4.0`) | 독자/agent에게 어떤 재사용이 허용되는지 알림 |

## Decision

[../02-research/content-model-and-metadata.md](../02-research/content-model-and-metadata_ko.md)의 필드 스키마를 가진 **8-엔티티 모델**을 채택한다:

- **공통 필드**(모든 publishable 엔티티): `id`, `kind`(`tip|skill|workflow|playbook`), `title`, `summary`, `tags?`, `source`(ref → Source), `boundary`(ref → SafetyBoundary), `version`(ref → Version), `status`(`draft|in-review|published|unpublished|redacted`), `license`(SPDX), `created_at`/`updated_at`.
- **Tip:** `body`, `rationale?`, `applies_to?`, `confidence?`.
- **Skill (reuse 계약):** `description`(triggering 텍스트), `inputs[]`, `outputs[]`(typed, JSON-Schema-backed), `preconditions[]`, `postconditions?`, `steps[]`, `tools_required?`, `failure_modes?`, `idempotent?`, `est_cost?`.
- **Workflow:** `goal`, `steps[]`(한 step이 Skill을 `id@version`으로 `uses` 가능), 집계 `inputs/outputs`, `preconditions[]`, `branches?`, `skills_used[]`(고정된 `id@version` — audit 그래프).
- **Playbook:** `scenario`, `decision_guide?`, `contains[]`(`id@version`), `outcomes?`.
- **Example:** `parent`(`id@version`), `input_sample?`, `output_sample?`, `narrative?`, 그리고 **자체 `boundary`** — example은 가장 많이 누출되므로 부모와 독립적으로 gating된다.
- **Source (provenance 앵커):** `origin_product`(`caw-02|caw-03|skills-registry`), `origin_ref`, `origin_version`, `validated`, `validated_by`, `imported_at`, `derivation`(PROV), `internal_only`. `origin_ref`/`origin_version`은 **audit-only** — sidecar에 저장되며 web/API에 **절대 렌더링되지 않는다**.
- **SafetyBoundary (gate 레코드):** `classification`(`public-safe|internal-only|confidential` — `public-safe`만 publish됨), `recheck_status`(`pass|fail|pending`, CAW-04 자체 re-check에서), `rechecked_at`, `redactions?`, `reviewer`, `rationale?`, `expires_at?`.
- **Version (불변 스냅샷):** `version`(semver 라벨), `content_hash`(content-addressed digest), `supersedes?`, `published_at`, `change_note?`, `source_at_publish`, `boundary_at_publish`.

공유 value object: `Param`, `Condition`, `Step`, `ToolRef`, `Redaction`, `Branch`(형태는 research 기준).

**reusable-skill 규칙(publishability 계약):** Skill/Workflow는 모든 blocking pillar가 성립할 때만 `published`가 된다 — **Identity ∧ Contract ∧ Pre/Post ∧ Procedure ∧ Provenance ∧ Safety ∧ Provability**. Reliability(`failure_modes`/`idempotent`/`est_cost`)는 권장이며 blocking이 아니다. blocking pillar 중 하나라도 빠지면 → status는 `in-review`에 머물고 결코 `published`가 되지 않는다. 이것은 ADR-0003의 gate가 소비하는 단일 `isPublishable(record)` predicate로 표현된다(gate check G5가 여기에 매핑됨).

**레이어 분리는 구조적이다:** audit-only 필드는 **sidecar** 레코드에 살며; public projection이 web/API 출력 전에 그것들을 제거한다. `boundary`(민감도)와 visibility는 절대 하나의 필드로 붕괴되지 않으며, 어떤 레코드든 publish하려면 검증된 `source`와 `boundary = public-safe / recheck_status = pass`가 *필수*다.

## Consequences

- **쉬운 점:** agent가 Skill의 JSON을 fetch해서 산문을 읽지 않고 호출 가능(typed I/O, preconditions, 고정된 `id@version`); 감사자는 어떤 산출물이든 검증된 Source + 안전 검토로 추적 가능.
- **쉬운 점:** Workflow/Playbook이 합성된 Skill을 `id@version`으로 고정하여 결정론적 audit 그래프와 변경 하에서 안정적인 재사용을 제공(ADR-0005 immutability와 연결).
- **어려운 점:** 모든 산출물은 publish하기 전에 전체 메타데이터를 지녀야 함 — 부분 import는 `in-review`에 머문다. 이는 의도된 마찰(default-deny)이다.
- **어려운 점:** sidecar/public-projection 분리는 코드 + audit 필드가 절대 직렬화되지 않음을 단언하는 테스트로 강제되어야 한다.
- **후속 작업:** ADR-0005가 semver bump 의미 + `content_hash` canonicalization을 비준; ADR-0003이 `isPublishable`을 gate에 연결; runbook이 8개 엔티티 스키마를 golden fixture(완전히 채워진 Skill 하나, Skill을 `id@version`으로 고정하는 Workflow 하나)와 함께 코드(Zod/JSON Schema)로 정의한다.

## Open questions / revisit triggers

- TODO(open-question: CAW-02/CAW-03가 고정할 안정적이고 versioned된 `origin_ref`를 노출하는가, 아니면 가변 핸들만 노출하는가? 결정론적 audit은 `origin_version` 고정을 요구한다.)
- TODO(open-question: JSON Schema가 `inputs/outputs`를 위한 제품군 전체 계약 언어인가, 아니면 agent 상호 운용을 위해 MCP tool schema에 정렬하는가?)
- TODO(open-question: 3단계 `classification`으로 충분한가, 아니면 필드별 민감도 라벨이 필요한가?)
- TODO(open-question: `content_hash`가 sidecar/audit 필드를 포함하는가, 아니면 public projection만인가?)
- TODO(open-question: license 정책 — 단일 기본 SPDX vs 산출물당, 그리고 upstream Source로부터의 상속.)
- **Revisit trigger:** 새 엔티티 또는 비공개 boundary 등급이 필요해지면 엔티티 집합을 다시 연다(참고: public 이상으로 publish하는 것은 상시 non-goal, brief §10).
