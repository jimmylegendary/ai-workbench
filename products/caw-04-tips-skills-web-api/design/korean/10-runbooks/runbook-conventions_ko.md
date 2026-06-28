# Runbook Conventions — CAW-04

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set review date)
- **Related:**
  - [./README_ko.md](./README_ko.md)
  - [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS_ko.md)
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF_ko.md)
  - [../09-roadmap/dependency-graph_ko.md](../09-roadmap/dependency-graph_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

이 문서는 **엄격한 runbook 형식**([DOC-CONVENTIONS §6](../_meta/DOC-CONVENTIONS_ko.md)에서)을 다시
서술하고, 모든 runbook 작성자와 실행자가 따라야 하는 **CAW-04 고유 builder 규칙**을 추가한다. 이
문서는 제품 설계를 결정하지 않으며(ADR 참조) 작업 순서를 정하지도 않는다([README_ko.md](./README_ko.md)와
roadmap 참조). 이 내용이 DOC-CONVENTIONS나 PRODUCT-BRIEF와 충돌하면 그쪽이 우선한다.

## Strict runbook format (DOC-CONVENTIONS §6)

모든 runbook은 `10-runbooks/phase-N-*/RB-XXX-topic.md`(kebab-case)에 위치하며 정확히 다음 형식을
따른다:

```
# RB-XXX: <imperative title>
- Status: ready | blocked
- Phase: <phase folder name>
- Depends on: [RB-###, ...]
- Implements design: [links to ADRs / design docs]
- Produces: <artifacts/components>

## Objective         — one paragraph; what "done" looks like
## Preconditions      — checklist true before starting
## Steps              — numbered atomic steps, each with **Do:** and **Verify:**
## Acceptance criteria — objectively checkable checklist
## Rollback / safety  — how to undo a mid-way failure
## Hand-off           — what the next runbook can assume
```

DOC-CONVENTIONS에서 가져온 규칙:

- **코드는 build 가이드일 뿐** — skeleton, 시그니처, config. 실제 코드는 builder가 작성한다.
- **phase 대역으로 번호를 매겨라:** `RB-0XX` = phase 0 … `RB-4XX` = phase 4, phase 폴더와 일치.
- **원자적이고 검증 가능한 step:** 각 step은 독립적으로 검증 가능하다; 계약은 `Do:`가 아니라
  `Verify:`이다.
- **tree를 green으로 유지하라**(compile, lint, test 통과) 모든 Acceptance checkpoint에서. 그래야
  중단된 build가 clean하게 재개된다.
- **Cross-link:** runbook이 구현하는 모든 ADR/design 문서를 링크하라; cross-product 참조는
  import/export boundary이다 — 다른 제품의 이름을 명시하고(예: "CAW-03, a separate product")
  공유된 store/registry/substrate를 절대 암시하지 마라.
- **정확한 entity/term 이름을 사용하라**([PRODUCT-BRIEF](../_meta/PRODUCT-BRIEF_ko.md)에서): 8개 entity
  `Tip, Skill, Workflow, Playbook, Example, Source, SafetyBoundary, Version`; 두 개의 port
  `ContentSourceAdapter`, `PublishSinkAdapter`; v1 sink `SiteAndApi`.
- **날짜/벤치마크/내부 사실을 지어내지 마라.** 미지의 것은 `TODO(open-question: ...)`로 표시하라.

## CAW-04 builder rules (non-negotiable)

이 규칙들은 load-bearing invariant를 인코딩한다. 하나라도 위반하는 runbook은 "동작"하더라도 **틀린**
것이다. 각각은 명시적 `Verify:` step과 Acceptance-criteria 한 줄로 나타나야 한다.

1. **Public-safe re-check은 CORE stage이다 — 절대 adapter에 두지 마라.**
   public-safe re-check은 모든 import마다, 어떤 git write 이전에, hexagonal core 안에서 실행된다.
   upstream `ContentSourceAdapter`의 boundary 주장은 **증거(evidence) 뿐**이다 — 결정으로 신뢰되지
   않는다. adapter는 gate나 re-check 로직을 포함해서는 안 되며, 그것을 우회할 수 있어서도 안 된다.
   *Verify:* upstream에서 "public"으로 표시된 confidential-tagged fixture는 여전히 **denied**된다.

2. **Audit 필드는 절대 웹이나 API로 serialize되지 않는다.**
   `origin_ref`와 `origin_version`(그리고 모든 audit-only 필드)은 **sidecar**에 있으며, publishable
   frontmatter나 HTML/JSON/raw-markdown 출력에 절대 들어가지 않는다. 이것은 **test로 강제**된다:
   어떤 public artifact에든 audit 필드가 나타나면 실패하는 자동화된 test를 출하하라.

3. **Deny-by-default publish gate.**
   (a) 검증된 internal `Source` AND (b) public-safe `SafetyBoundary` 없이는 아무것도 published되지
   않는다. 둘 중 하나라도 없으면 ⇒ deny. Redaction은 publish 이전에 적용된다. **Curator 승인
   (Jimmy)은 필수**이다; 생성된/미검증 콘텐츠는 절대 published되지 않는다. 기본값 = 거부.

4. **Immutable, addressable versions.**
   published된 `(slug, semver)` 쌍은 **영구히 frozen**이다. 기존 쌍을 다시 publish하면 반드시
   **build를 실패**시켜야 한다. 편집은 **새** `Version`을 만든다; 옛 version은 계속 주소 지정 가능하다.
   Unpublish/redact는 **HTTP 410 tombstone + bounded CDN purge**로 하며, frozen artifact를 제자리에서
   변경하거나 삭제하는 방식이 아니다.

5. **Public-safe by construction.**
   frozen static artifact(SSG 출력: HTML + 사전 빌드된 JSON + raw markdown + `index.json` manifest)는
   internal store로 가는 **live code path가 없다.** build는 frozen git 콘텐츠만 읽는다; 서빙되는
   surface는 요청 시점에 어떤 internal 것도 query하지 않는다.

6. **Stub은 `NotImplemented`이며, 절대 silent하지 않다.**
   미래의 `ContentSourceAdapter`/`PublishSinkAdapter` seam(internal wiki, curated bundle; external
   docs host, package registry, syndication)은 호출되면 **문서화되고 `NotImplemented`를 throw**한다.
   이들은 config-driven registry에 stub으로 등록된다 — 조용히 성공하거나 빈 값을 반환하는 no-op이
   절대 아니다.

7. **하나의 build에서 web/API parity.**
   하나의 Astro build가 모든 surface를 emit한다; HTML, raw markdown, JSON에 걸쳐 **artifact당 하나의
   canonical resource**가 있다. surface별 콘텐츠 파이프라인을 분기하지 마라.

8. **tree를 green으로 유지하라.**
   재개 가능성에 load-bearing이기 때문에 다시 명시한다: 모든 Acceptance checkpoint는 compile, lint,
   test를 통과한다. build를 깨는 runbook checkpoint를 절대 commit하지 마라.

## Authoring checklist (before marking a runbook `ready`)

- [ ] 헤더 완성; `Depends on:`이 [dependency-graph_ko.md](../09-roadmap/dependency-graph_ko.md)와 일치.
- [ ] 모든 step에 `Do:`와 `Verify:`가 모두 있음.
- [ ] 해당되는 builder 규칙(1–8) 각각이 `Verify:` step과 Acceptance 한 줄로 나타남.
- [ ] `Rollback / safety`가 partial publish를 남기지 않고 중간 실패를 되돌림.
- [ ] `Hand-off`가 다음 runbook이 가정해도 되는 것을 정확히 명시함.
- [ ] 마지막 Acceptance checkpoint에서 tree가 green임.
