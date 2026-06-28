# Validation & Tests — public-safe-by-construction 인수(acceptance) 스위트

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:** [./research-plan_ko.md](./research-plan_ko.md), [./open-questions_ko.md](./open-questions_ko.md), [../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md), [../01-decisions/ADR-0004-import-and-ports.md](../01-decisions/ADR-0004-import-and-ports.md), [../01-decisions/ADR-0005-storage-and-versioning.md](../01-decisions/ADR-0005-storage-and-versioning.md), [../01-decisions/ADR-0007-api-design.md](../01-decisions/ADR-0007-api-design.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

이 문서는 CAW-04를 구조적으로 public-safe하게 만드는 **실행 가능한 보장(executable guarantees)**을 명세한다. 아래의 각
불변식(invariant)은 AI builder가 구현하고 green으로 유지해야 하는 **테스트 family**다; 이들은 권고가 아니라 인수 gate다.
이 문서는 빌드 단계(runbook)를 정의하지 않으며 정책(ADR)을 재결정하지도 않는다 — 그 결정들이 약속하는 동작을 테스트로
고정한다. 지침 규칙: **V1–V7 중 하나의 테스트가 red이면 아무것도 출시되지 않는다.** 테스트는 `V<n>-*`로 명명되며 모든
변경마다 CI에서, 그리고 release gate로 실행되어야 한다.

## Invariant map

| ID | Invariant | Enforces ADR | Failure = |
|----|-----------|--------------|-----------|
| V1 | 검증된 source + public-safe 없이는 아무것도 게시되지 않음(deny-by-default) | ADR-0003, ADR-0004 | confidential/미검증 유출 |
| V2 | Audit 전용 필드는 web/API로 절대 직렬화되지 않음 | ADR-0002 | provenance/internal-ref 유출 |
| V3 | 게시된 `(slug, semver)`는 불변이며 영원히 동결됨 | ADR-0005 | addressable identity 깨짐 |
| V4 | Tombstone은 HTTP 410 반환 | ADR-0003, ADR-0005 | 철회된 콘텐츠가 계속 제공됨 |
| V5 | Import 재검사가 core에서 boundary를 재도출(주장 = 증거일 뿐) | ADR-0004 | upstream을 맹목적으로 신뢰 |
| V6 | 하나의 source에서 web/API parity | ADR-0007, ADR-0006 | HTML/MD/JSON 간 drift |
| V7 | Stub sink이 안전함(게시 없음, live 내부 경로 없음) | ADR-0004, ADR-0006 | 미래 connector 유출 |

---

## V1 — Deny-by-default publish gate

**Property:** artifact가 publish sink에 도달하는 것은 **iff** (a) 검증된 내부 `Source`가 있고 AND (b) public-safe
effective boundary가 있고 AND (c) curator 승인이 기록되어 있을 때다. 입력 중 하나라도 없으면 = **deny**(error-open 아님).

| Case | Input | Expected |
|------|-------|----------|
| V1-a | 검증된 source 없음 | DENY |
| V1-b | source 유효, boundary = confidential | DENY |
| V1-c | source 유효, boundary public-safe, **curator 승인 없음** | DENY(preview에 보류) |
| V1-d | source 유효, boundary public-safe, 승인 있음 | PUBLISH |
| V1-e | 생성된/미검증 콘텐츠(provenance 없음) | DENY |
| V1-f | gate 입력 누락/null(fuzz) | DENY(fail-closed, 절대 default-open 아님) |

```text
assert publish(artifact) == ALLOW
  requires validated_source(artifact)
       and boundary_eff(artifact) == PUBLIC_SAFE
       and approval_record(artifact).curator == "Jimmy"
otherwise -> DENY  # deny-by-default; missing inputs deny, never allow
```

- Property/fuzz 테스트: 무작위로 필드가 누락된 artifact는 **절대** ALLOW를 산출해서는 안 된다.
- curator 승인은 필수이며 기록된다(ADR-0003); 자동 생성은 제안만 한다.

## V2 — Audit 전용 필드는 web/API로 절대 직렬화되지 않음

**Property:** sidecar/audit 전용 필드(`origin_ref`, `origin_version`, 그리고 content model에서 audit-only로 표시된
모든 필드)는 어떤 public artifact에도 나타나지 않는다 — HTML, raw markdown, JSON, `index.json`, `SKILL.md`,
`manifest.json`, MCP resources view, sitemap, search index 어디에도.

| Case | Surface | Expected |
|------|---------|----------|
| V2-a | 렌더링된 HTML 페이지 | audit 필드 부분 문자열 없음 |
| V2-b | raw `.md` 출력 | audit 필드 부분 문자열 없음 |
| V2-c | artifact별 `.json` | key는 public-projection allowlist만 |
| V2-d | `index.json` / `manifest.json` | audit 필드 없음 |
| V2-e | `SKILL.md` + MCP resource | audit 필드 없음 |
| V2-f | search index(빌드된 경우, T7) | audit 필드 없음 |

```text
PUBLIC_ALLOWLIST = {id, kind, title, summary, version, safety_boundary, ...public fields}
for each built file f in dist/:
    parsed = parse(f)
    assert keys(parsed) ⊆ PUBLIC_ALLOWLIST
    assert not contains_any(text(f), AUDIT_ONLY_FIELDS)   # origin_ref, origin_version, ...
```

- 단위 serializer만이 아니라 빌드 출력의 **전체 트리 스캔(whole-tree scan)**(`dist/`)으로 강제된다 — 모든 렌더링 경로를
  통한 유출을 잡는다. 이것이 ADR-0002가 "test-enforced"라고 부르는 테스트다.
- 또한 JSON serializer가 denylist가 아니라 **allowlist**(deny-by-default 필드 projection)를 사용함을 단언한다.

## V3 — 불변 `(slug, semver)`가 영원히 동결됨

**Property:** 한 번 게시되면 `(slug, semver)` 쌍의 bytes와 content-digest는 재빌드 전반에 걸쳐 절대 변하지 않는다;
편집은 **새로운** 버전을 만든다; 이전 버전은 addressable하게 유지된다.

| Case | Action | Expected |
|------|--------|----------|
| V3-a | 변경되지 않은 콘텐츠 재빌드 | 동일한 content-digest(재현 가능) |
| V3-b | 게시된 버전을 제자리에서 편집 | CI 실패(frozen-version guard) |
| V3-c | 편집된 콘텐츠 게시 | 새 semver; 이전 버전은 계속 제공됨 |
| V3-d | 기록된 값과 digest 불일치 | release 차단됨 |

```text
for (slug, semver) in published_index:
    assert digest(build(slug, semver)) == frozen_digest[(slug, semver)]
# canonical serialization per ADR-0005 / research-plan T9 -> reproducible hash
```

- canonical serialization + digest 방식(research-plan **T9**)에 의존한다.
- frozen digest 집합은 커밋되며; 어떤 drift라도 hard CI 실패다.

## V4 — Tombstone은 HTTP 410 반환

**Property:** `unpublish`/`redact`는 모든 surface에 걸쳐 artifact를 **410 Gone tombstone**으로 교체한다;
public bytes는 제공되는 artifact와 index에서 제거된다.

| Case | Request | Expected |
|------|---------|----------|
| V4-a | redact된 artifact GET(HTML) | 410 Gone |
| V4-b | redact된 artifact GET(`.json`/`.md`) | 410 Gone |
| V4-c | `index.json` 내 redact된 artifact | 없음 또는 tombstone으로 플래그 |
| V4-d | purge 이후 edge/CDN GET | 410(purge 상한, research-plan **T4**) |
| V4-e | tombstone 본문 | 유출된 원본 콘텐츠 없음 |

- 정적 호스트의 410 메커니즘은 호스팅에 의존한다(TODO(open-question: hosting target)); 테스트는 제공되는 status +
  원본 bytes가 사라졌음 + **T4**에 따른 edge purge를 단언한다.
- deprecated되었지만 계속 제공되는 버전에 대한 Sitemap/index 동작은 open question이다(see open-questions).

## V5 — Import 재검사가 core에서 boundary를 재도출

**Property:** public-safe boundary는 provenance ancestor graph로부터 **core**가 재계산한다; upstream bundle의 boundary
주장은 **증거일 뿐**이며 그 자체만으로는 artifact를 public-safe로 승격시킬 수 없다.

| Case | Bundle claim | Ancestor graph | Expected |
|------|-------------|----------------|----------|
| V5-a | "public-safe" | 모든 ancestor가 public-safe | core가 PUBLISH 가능(V1이 성립하면) |
| V5-b | "public-safe" | 한 ancestor가 confidential | core DENY(주장 무시됨) |
| V5-c | 서명되지 않은/무효한 bundle | 임의 | 재검사 전에 거부(research-plan T5) |
| V5-d | 재검사가 core가 아닌 adapter에서 실행됨 | — | architecture 테스트 실패 |

```text
boundary_eff = recompute_in_core(ancestor_graph)   # NOT read from bundle claim
assert publish_allowed implies boundary_eff == PUBLIC_SAFE
# adapter cannot override core re-check / human gate / boundary policy (ADR-0004)
```

- Architecture 테스트: 재검사 심볼이 core 패키지에 있고 어떤 `PublishSinkAdapter`나 `ContentSourceAdapter`도 그것을
  import/내장하지 않음을 단언한다(research-plan **T1**, **T5**, **T8**과 결합).

## V6 — 하나의 source에서 web/API parity

**Property:** artifact의 HTML, raw markdown, JSON은 **하나의 source 파일에서 동일한 Astro 빌드**로 생성된다;
canonical 필드는 셋 전반에 걸쳐 일치한다.

| Case | Check | Expected |
|------|-------|----------|
| V6-a | artifact별, HTML vs JSON vs MD canonical 필드 | 동일(id, kind, title, summary, version, boundary) |
| V6-b | 모든 게시된 artifact가 세 가지 표현을 모두 가짐 | 존재 |
| V6-c | `.md`/`.json` suffix 경로가 정적으로 방출됨 | 존재(ADR-0007 / research-plan T6) |
| V6-d | `index.json`이 정확히 게시된 집합을 나열함 | 콘텐츠 디렉터리와 1:1 |

```text
for artifact in published:
    h, j, m = read_html(artifact), read_json(artifact), read_md(artifact)
    assert canonical_fields(h) == canonical_fields(j) == canonical_fields(m)
```

- ADR-0007의 "artifact당 하나의 canonical resource를 HTML/markdown/JSON으로" 약속을 보호한다; JSON API가 렌더링된
  사이트와 drift하는 것을 방지한다.

## V7 — Stub sink이 안전함

**Property:** 문서화된 미래 connector stub(외부 docs host, package registry, syndication)과 모든 비활성 adapter는
**게시할 수 없으며** 내부 저장소로의 **live 경로가 없다**.

| Case | Check | Expected |
|------|-------|----------|
| V7-a | stub `publish()` 호출됨 | no-op / 명시적 `NotImplemented`, public한 것을 아무것도 방출하지 않음 |
| V7-b | stub이 내부 저장소를 직접 읽음 | 금지(그런 import/경로 없음) |
| V7-c | config가 v1 `SiteAndApi` sink만 활성화 | registry가 미등재 sink을 거부 |
| V7-d | adapter가 boundary override 시도 | core가 거부 |

- v1 사이트는 **내부 저장소로의 live 경로가 없는, 동결되고 검증된 정적 artifact**다(ADR-0006); 배포된 bundle에 CAW-02/CAW-03
  또는 내부 데이터로의 런타임 credential/connection이 없음을 테스트한다.
- stub 등록은 config 기반이다(ADR-0004); stub이 명시적으로 빌드되고 재게이팅되기 전까지 비활성 상태임을 테스트한다.

## Test execution & gating

| Tier | When | Blocks |
|------|------|--------|
| Unit(serializer allowlist, gate logic) | 모든 commit | merge |
| Build-output scan(V2, V3, V6) | 모든 build | merge |
| Integration(V1, V4, V5, V7) | 모든 PR | merge |
| Release gate | pre-deploy | deploy |

- V1, V2, V5는 **load-bearing** public-safe 3종이다 — 여기서 red 결과는 override 없는 release 중단이다.
- 숫자 임계값(redaction recall, purge time bound)은 대응하는 research track(research-plan T2, T4)이 측정하기 전까지
  TODO(open-question)다.

## Implications for runbooks

- 각 P-phase runbook의 인수 기준(Acceptance criteria)은 충족하는 V-ID를 참조해야 한다.
- build-output 전체 트리 스캔(V2)은 첫 artifact가 게시되기 전에(P2) 연결되어야 한다.
- frozen-digest 집합(V3)은 커밋되며 새 버전을 추가할 때만 갱신되고, 기존 버전을 편집하는 일은 결코 없다.
