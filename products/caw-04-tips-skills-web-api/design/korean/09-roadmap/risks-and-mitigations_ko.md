# Risks & Mitigations

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set review date)
- **Related:**
  - [./milestones-and-phases_ko.md](./milestones-and-phases_ko.md)
  - [./dependency-graph_ko.md](./dependency-graph_ko.md)
  - [../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md)
  - [../01-decisions/ADR-0004-import-and-ports.md](../01-decisions/ADR-0004-import-and-ports_ko.md)
  - [../01-decisions/ADR-0005-storage-and-versioning.md](../01-decisions/ADR-0005-storage-and-versioning_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적

이 문서는 CAW-04 — **공개** 발행 계층 — 의 delivery + 운영 risk와, 설계에 녹아 있는 구체적 완화책을 열거한다.
CAW-04가 공개 표면이기 때문에 가장 심각도가 높은 risk는 기밀성 유출이다. 이 문서는 gate 설계를 재진술하지 않는다(see
[ADR-0003]) — risk를 이미 존재하는 통제에 매핑하고 격차를 open question으로 표시한다.

## Risk register

| ID | Risk | Likelihood | Impact | Severity |
|----|------|-----------|--------|----------|
| R1 | Confidential/internal 데이터가 공개 표면에 도달 | Low(설계상) | Critical | **High** |
| R2 | Audit 전용 provenance 필드가 web/API로 직렬화됨 | Medium | Critical | **High** |
| R3 | unpublish/redact 후에도 stale 또는 cached copy 생존 | Medium | High | **High** |
| R4 | Upstream provenance/boundary가 불충분하거나 잘못됨 | Medium | High | High |
| R5 | authoring / 원본 콘텐츠로의 scope creep | Medium | Medium | Medium |
| R6 | Build-budget 중단으로 절반만 발행된 상태가 남음 | Medium | Medium | Medium |
| R7 | edit-in-place에 의해 동결된 `(slug, semver)`가 위반됨 | Low | High | Medium |
| R8 | Adapter가 core gate를 우회하는 경로가 됨 | Low | Critical | High |

---

## R1 — 공개 표면에서의 confidential 유출

**제품의 정의적 실패 모드.** 회사 기밀 노하우를 담은 tip/skill이 세상에 제공된다.

**완화책(설계 수준):**

- Deny-by-default publish gate: 검증된 내부 소스 AND public-safe boundary 둘 다 없이는 아무것도 발행되지 않음([ADR-0003]).
- Public-safe 재검사는 adapter가 아니라 **CORE** stage([ADR-0004]); upstream "public" claim은 **증거로만**
  취급되며 결코 신뢰되지 않음.
- 발행된 artifact는 어떤 내부 저장소로도 **라이브 경로가 없는 동결된 정적 SSG build**다([ADR-0006]) —
  구조적으로 public-safe.
- 발행 전 Curator(Jimmy) 승인은 필수; 자동 생성은 제안만 함.

**Tests/controls:** confidential 태그된 fixture는 upstream이 public으로 표시해도 거부되어야 함;
CI에 red-team fixture suite. TODO(open-question: define the confidential-content fixture corpus).

## R2 — Audit 필드 직렬화

`origin_ref` / `origin_version`은 audit 전용이며 web/API 출력에 절대 나타나서는 안 됨.

**완화책:**

- Public-projection 분리: audit 전용 필드는 발행 가능 frontmatter와 분리된 **sidecar**에 존재([ADR-0002], [ADR-0005]).
- **Test-enforced** 직렬화 경계: golden 테스트가 어떤 HTML, JSON, raw-markdown, `index.json`, 또는 MCP resource
  출력에도 sidecar 키가 나타나지 않음을 단언.
- serializer는 public projection 타입만 받음 — sidecar 필드는 그 입력 타입에 없음.

**Control:** M1 인수 체크리스트에 "audit 전용 필드가 모든 public 출력에서 부재"가 포함됨.

## R3 — Stale / unpublish cache

unpublish나 redact 후, cached 또는 CDN copy가 철회된 artifact를 계속 제공한다.

**완화책:**

- **HTTP 410 tombstone**을 통한 Unpublish/redact([ADR-0005], [ADR-0003]) — silent delete가 아니라 명시적인
  gone 마커.
- 모든 lifecycle 변경 시 전체 정적 artifact를 rebuild + redeploy; cache invalidation 단계는 unpublish
  runbook의 일부.
- versioning은 철회된 `(slug, semver)`가 purge를 위해 식별 가능함을 보장.

**Gap:** CDN/cache purge target이 아직 고정되지 않음 — TODO(open-question: specify cache invalidation hooks
for the chosen host).

## R4 — Upstream provenance 불충분

CAW-02 / CAW-03(별개 제품)이 provenance나 boundary 메타데이터가 누락되거나, 잘못되거나, 과도하게 낙관적인
콘텐츠를 공급한다.

**완화책:**

- Core 재검사는 upstream 판정에 의존하지 않음; 누락/모호한 boundary ⇒ deny.
- ContentSource는 재검사 통과 **후에만** git에 write([ADR-0005]).
- Provenance는 필수 common-field 메타데이터; 검증된 소스 ref가 없는 항목은 거부됨.

**Gap:** 각 upstream으로부터 받아들이는 최소 provenance schema — TODO(open-question: pin per-source
provenance contract).

## R5 — authoring으로의 scope creep

"그냥 여기서 tip을 작성하자"는 압력이 발행 계층을 authoring 도구로 바꿔 — PRODUCT-BRIEF §10 비-목표를 위반.

**완화책:**

- 아키텍처에 authoring port 없음 — `ContentSourceAdapter`(import)와 `PublishSinkAdapter`(publish)만 있음([ADR-0004]).
- 콘텐츠는 import adapter + 재검사를 통해서만 들어올 수 있음; "빈 곳에서 생성" 경로는 없음.
- Roadmap은 authoring을 영구 deferred로 표시([milestones-and-phases.md](./milestones-and-phases_ko.md)).

## R6 — Build-budget 중단

긴 build/import이 중단되어(timeout, budget), 부분적으로 발행되거나 일관성 없는 상태의 risk가 발생한다.

**완화책:**

- phase 대역으로 번호 매겨진 작고 **재개 가능한 runbook**; 각각이 acceptance checkpoint에서 트리를 green으로
  남김([DOC-CONVENTIONS §6]).
- Git content store가 source of truth; SSG build는 git의 순수하고 재실행 가능한 함수 —
  build 재실행은 idempotent하며 안전함.
- 발행은 artifact 수준에서 atomic: 절반만 빌드된 정적 출력은 결코 라이브 표면으로 승격되지 않음(build-then-swap).
  TODO(open-question: confirm atomic promotion mechanism for the host).

## R7 — 동결 버전 위반

편집이 새 버전을 만드는 대신 이미 발행된 `(slug, semver)`를 변형한다.

**완화책:**

- 발행된 `(slug, semver)`는 영원히 동결됨([ADR-0005]); store는 빌드 시 기존 쌍의 재-write를 거부.
- Content-digest가 immutability 증명을 제공; 동결된 쌍의 digest 불일치는 빌드 실패.
- 편집은 새 semver를 만들고; 이전 버전은 주소 지정 가능 상태로 남음.

## R8 — Adapter의 gate 우회

미래의 adapter가 core 재검사를 통과하지 않고 store에 콘텐츠를 write한다.

**완화책:**

- 재검사 + gate는 **core** stage로, DAG에서 모든 adapter보다 구조적으로 상류에 있음([dependency-graph.md](./dependency-graph_ko.md)).
- Adapter는 gate에 의존(빌드 순서); ContentSource는 post-re-check 경로를 통해서만 git에 write.
- 문서화된 stub은 동일한 core gate를 경유하기 전까지 spec 전용임.

## Severity matrix

| | Impact: Medium | Impact: High | Impact: Critical |
|---|---|---|---|
| **Likelihood: Medium** | R5 | R3, R4 | R2 |
| **Likelihood: Low** | — | R7 | R1, R8 |

## Open Questions

- Confidential-content fixture corpus(R1) — TODO(open-question).
- Cache/CDN purge hooks(R3) 및 atomic promotion(R6) — TODO(open-question).
- Per-source provenance contract(R4) — TODO(open-question).
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md).

## runbook에 대한 함의

- gate runbook에 red-team fixture 단계를 추가하고(R1) build runbook에 직렬화 golden-test를 추가하라(R2).
- unpublish runbook은 cache invalidation + tombstone 검증을 포함해야 한다(R3).
- 중단이 복구 가능하도록 모든 runbook을 작고 idempotent하게 유지하라(R6).
