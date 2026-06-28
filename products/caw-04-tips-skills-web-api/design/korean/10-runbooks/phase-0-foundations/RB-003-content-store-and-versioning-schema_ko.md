# RB-003: Content-store schema, slug/semver 레이아웃, audit sidecar, 그리고 semver+digest 모델

- Status: ready
- Phase: phase-0-foundations
- Depends on: [RB-000, RB-001, RB-002]
- Implements design: [../../04-data-layer/content-model_ko.md](../../04-data-layer/content-model_ko.md), [../../04-data-layer/storage-and-versioning_ko.md](../../04-data-layer/storage-and-versioning_ko.md), [../../01-decisions/ADR-0002-content-model_ko.md](../../01-decisions/ADR-0002-content-model_ko.md), [../../01-decisions/ADR-0005-storage-and-versioning_ko.md](../../01-decisions/ADR-0005-storage-and-versioning_ko.md)
- Produces: 8개 엔티티에 대한 전체 md/MDX YAML frontmatter schema(`src/content/config.ts`), audit sidecar를 동반한 public-projection 분리, `<slug>/<semver>` 레이아웃 관례, 그리고 semver + content-digest 신원 모델(`src/lib/`의 canonical-serialization + digest 헬퍼). Schema 수준만; write path는 phase 2에서 도착.

## Objective

CAW-04가 그 **schema of record**를 갖추게 된다([content-model_ko.md](../../04-data-layer/content-model_ko.md)): 네 개의 publishable 종류(Tip/Skill/Workflow/Playbook)에 더해 embedded/attached Example/Source/SafetyBoundary/Version이, 각각 검증된 Astro content-collection frontmatter로. **two-record 원칙**이 구조적으로 인코딩된다: served `.md(x)` frontmatter는 **public projection**만 담고, audit 전용 필드(`origin_ref`, `origin_version`, redaction 내부, reviewer note)는 웹/API로 절대 직렬화되지 않는 **별도의 sidecar schema**에 선언된다. `<slug>/<semver>` 디스크 레이아웃과 semver + content-digest 신원 모델(`digest = "sha256:" + sha256(canonical_serialization(public_projection))`)이 헬퍼와 함께 성문화되고 freeze/never-reuse 불변식이 문서화된다. "Done" = schema가 fixture를 검증하고, sidecar가 별도로 타입화되며, canonical-serialization + digest 헬퍼가 결정론적이라는 것 — 모두 green 트리 위에서. 이것은 DAG의 **node A→D**이다; 어떤 build/serialize runbook도 이보다 앞설 수 없다.

## Preconditions

- [ ] RB-002 완료: `PublicProjection` / `PublishableItem` value object가 `src/core/model/`에 존재.
- [ ] `src/content/config.ts`가 RB-000의 common-field stub과 함께 존재.
- [ ] `_audit/sidecar/` 트리가 존재하며 절대 served되지 않음(RB-000).

## Steps

1. **모든 publishable 엔티티의 공통 필드 인코딩.**
   - Do: `src/content/config.ts`에서 다음을 가진 공유 Zod base schema 정의: `id`(kebab slug), `kind`(`tip|skill|workflow|playbook`), `title`, `summary`, `tags?`, `version`(semver), `status`(`draft|in-review|published|unpublished|redacted`), `license`(SPDX id), `source`(embedded public subset), `boundary`(embedded SafetyBoundary), `content_hash`(`sha256:` digest), `created_at`/`updated_at`(ISO-8601). 각 필드의 projection을 [content-model §Common-fields](../../04-data-layer/content-model_ko.md)에 따라 표시 — 모두 `public`.
   - Verify: `astro check`/`typecheck` 통과; base schema가 non-semver `version`과 non-SPDX `license`를 거부.

2. **네 개의 publishable-kind schema 정의.**
   - Do: base를 네 개의 collection으로 확장:
     - **Skill**(재사용 계약): `description`, `inputs[]`/`outputs[]`(`Param`), `preconditions[]`/`postconditions[]`(`Condition`), `steps[]`(`Step`), `tools_required[]`(`ToolRef`), `failure_modes[]`, `idempotent`, `est_cost`. `description`은 Agent `SKILL.md` 관례를 반영; `id` = SKILL.md `name`.
     - **Workflow**: `goal`, `steps[]`(`uses?: id@version`), `inputs[]`/`outputs[]`, `preconditions[]`, `branches[]?`, `skills_used[]`(고정된 `id@version` — audit graph).
     - **Playbook**: `scenario`, `decision_guide?`, `contains[]`(`id@version`), `outcomes[]?`.
     - **Tip**: `body`, `rationale?`, `applies_to[]?`, `confidence?`(`low|medium|high`).
   - Verify: 각 collection이 최소 fixture를 검증하고 누락된 blocking 필드를 거부.

3. **Example을 독립적으로 게이트되는 attached 엔티티로 정의.**
   - Do: `examples` schema 추가: `id`, `parent`(`id@version`), `input_sample?`/`output_sample?`(parent 계약과 일치해야 함; public-safe/redacted), `narrative?`, 그리고 그 **자체** embedded `boundary`(Example은 가장 높은 누출 위험을 운반함).
   - Verify: `boundary`가 없는 Example은 검증 실패.

4. **embedded Source / SafetyBoundary / Version public subset 정의.**
   - Do: [content-model §Embedded](../../04-data-layer/content-model_ko.md)에 따라 inline public subset 정의:
     - `source`: `{ origin_product: caw-02|caw-03|skills-registry, validated: true, derivation: verbatim|redacted|summarized }` — **public subset만**; `origin_ref`/`origin_version`은 여기 없음.
     - `boundary`: `{ classification: public-safe, recheck_status: pass|fail|pending, rechecked_at: ISO-8601 }`.
     - `version_meta`: `{ version, content_hash, published_at, supersedes? }`.
   - Verify: `source` schema에 `origin_ref`/`origin_version` 키가 없음(분리가 구조적임).

5. **audit sidecar schema 정의 — 별도, 절대 served되지 않음.**
   - Do: `src/core/model/`에서(그리고 `_audit/sidecar/{type}/<slug>/<semver>.audit.json|.yml`로 키된 로더에서) `origin_ref`, `origin_version`, reviewer note, 그리고 `Redaction[]` 내부(`{field, action: remove|mask|summarize, reason}`)를 담는 sidecar 타입 정의. 이것은 public record와 `id@semver`를 공유하지만 page/endpoint 코드가 절대 import할 수 없는 **별개의 타입**이다(RB-001 경계 lint가 이미 `src/pages/**`가 `_audit/**`를 import하는 것을 금지함).
   - Verify: `typecheck` 통과; sidecar 타입과 `PublicProjection`이 audit 전용 키를 공유하지 않음; `PublicProjection`이 `origin_ref`를 담을 수 없음을 테스트가 단언.

6. **`<slug>/<semver>` 레이아웃 관례 성문화.**
   - Do: 레이아웃 `src/content/{tips,skills,workflows,playbooks}/<slug>/<semver>.md(x)`를 sibling sidecar `_audit/sidecar/{type}/<slug>/<semver>.audit.json`와 함께 문서화 + 헬퍼 인코딩. `(kind, slug, semver)`로부터 두 경로를 도출하는 path 헬퍼를 `src/lib/`에 추가. 불변식을 명시(아직 write path 없음): 새 version은 같은 `<slug>/` 디렉터리의 **새 파일**이다; `(slug,semver)`는 **영원히 frozen**되며 **절대 재사용되지 않는다** — 강제는 phase-2 storage runbook에서 도착.
   - Verify: path 헬퍼가 `(kind, slug, semver)` ↔ 두 파일 경로를 round-trip.

7. **semver + content-digest 모델 구현.**
   - Do: `src/core/version/` + `src/lib/`에서 구현: (a) semver 검증 + content-adapted bump-rule 문서화(MAJOR = 다른 action; MINOR = 추가적; PATCH = 외형적, [storage-and-versioning §bump-rules](../../04-data-layer/storage-and-versioning_ko.md)에 따라); (b) `canonicalSerialization(publicProjection)` — frontmatter 키 정렬, LF newline, trailing whitespace 제거, body는 단일 정규화된 구분자 뒤에, **public projection만** 다룸; (c) `contentDigest(projection) = "sha256:" + sha256(canonicalSerialization(projection))`. 정확한 canonicalization/algorithm spec은 `TODO(open-question: sha256 vs multihash; which metadata fields are inside the hashed envelope)`로 표시 — 임의로 만들지 말 것.
   - Verify: `canonicalSerialization`이 결정론적임(같은 입력 → 바이트 동일 출력, 키 순서 무관); `contentDigest`가 실행 간 안정적; sidecar 필드를 재직렬화해도 digest가 바뀌지 않음(projection 안에 없으므로).

8. **serialization-firewall 테스트 추가(public-safe 가드).**
   - Do: 채워진 sidecar를 가진 fixture에 대해, canonical serialization / public projection이 audit 전용 키(`origin_ref`, `origin_version`, redaction 내부)를 **하나도** 포함하지 않음을 단언하는 테스트 추가. 이것은 B3 "audit 필드는 절대 직렬화되지 않는다" 보장의 schema 수준 절반이다(dist-output 테스트는 phase 4에서 도착).
   - Verify: 테스트 통과; projection fixture에 `origin_ref`를 추가하면 실패.

## Acceptance criteria

- [ ] `src/content/config.ts`가 네 개의 publishable 종류 + Example을 엔티티별 전체 필드와 함께 검증; 누락된 blocking 필드와 잘못된 semver/SPDX를 거부.
- [ ] audit sidecar가 `_audit/sidecar/...`의 **별도** schema/타입임; `PublicProjection`이 그것과 audit 전용 키를 공유하지 않음(타입 강제 테스트 통과).
- [ ] embedded `source` public subset에 `origin_ref`/`origin_version`이 없음.
- [ ] `<slug>/<semver>` path 헬퍼가 `(kind, slug, semver)` ↔ content path + sidecar path를 round-trip.
- [ ] `canonicalSerialization`이 결정론적이고 키 순서 무관; `contentDigest`가 안정적이며 **public projection만**으로 계산됨(sidecar 변경이 그것을 바꾸지 않음).
- [ ] serialization-firewall 테스트가 projection/serialization에 audit 전용 필드가 나타나지 않음을 확인.
- [ ] Freeze/never-reuse 불변식이 문서화됨(강제는 phase 2로 연기); `typecheck`/`lint`/`test`/`astro build`가 green 유지.

## Rollback / safety

- Schema + 헬퍼 작업만; `git`으로 RB-002로 revert. content가 쓰이지 않으므로 아직 frozen되는 것이 없음.
- served frontmatter schema에 `origin_ref`/`origin_version`이나 redaction 내부를 절대 추가하지 말 것 — 그것들은 sidecar 타입에만 속한다; 이것이 load-bearing public-safe 분리다.
- 여기서 freeze/never-reuse write 강제를 구현하지 말 것 — 그것은 phase-2 storage runbook에 속하므로 phase 0에서 green 트리가 I/O-free로 유지된다.
- digest/canonicalization open-question은 `TODO(open-question: ...)`로 남길 것; spec을 임의로 만들지 말 것.

## Hand-off

Phase-1(import + core re-check + gate)과 phase-2(git content store + write path) runbook은 다음을 가정할 수 있다: 8개 엔티티에 대한 검증된 frontmatter schema; 구조적으로 별개인 audit sidecar 타입; `<slug>/<semver>` 레이아웃 헬퍼; 그리고 public projection 위의 결정론적 canonical-serialization + content-digest 함수. freeze + never-reuse write 강제, 실제 sidecar write, 그리고 `index.json` 도출은 phase-2다; dist 수준 "audit 필드는 절대 직렬화되지 않는다" 테스트는 phase-4(M1 acceptance)다.
