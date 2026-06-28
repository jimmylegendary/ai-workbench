# Data Flow — import, build, publish, unpublish/redact

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(set on review)
- **Related:**
  - [./tech-stack_ko.md](./tech-stack_ko.md) (각 단계가 실행되는 컴포넌트)
  - [./repo-structure_ko.md](./repo-structure_ko.md) (각 artifact가 디스크상 어디에 위치하는지)
  - [../01-decisions/ADR-0004-import-and-ports_ko.md](../01-decisions/ADR-0004-import-and-ports_ko.md) (ports; re-check는 CORE 단계)
  - [../01-decisions/ADR-0005-storage-and-versioning_ko.md](../01-decisions/ADR-0005-storage-and-versioning_ko.md) (git store, semver+digest, 410 tombstones)
  - [../01-decisions/ADR-0006-web-stack_ko.md](../01-decisions/ADR-0006-web-stack_ko.md) (Astro SSG, boundary build invariant)
  - [../01-decisions/ADR-0007-api-design_ko.md](../01-decisions/ADR-0007-api-design_ko.md) (static JSON + raw md + manifest)
  - [../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md) (deny-by-default gate, hash-chained ledger)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적

이 문서는 콘텐츠를 CAW-04를 거쳐 이동시키는 네 가지 data flow를 서술한다: **import**(discover → re-check →
markdown을 git에 기록), **build**(Astro SSG → HTML + static JSON + raw markdown + `index.json`/manifest),
**publish**(`PublishSinkAdapter`를 통한 배포), 그리고 **unpublish/redact**(tombstone + cache purge). 어디에서
public-safe 속성이 강제되는지, 그리고 왜 배포된 artifact가 **public-safe by construction(구성상 public-safe)** 인지
보여준다. stack, storage, 또는 API 계약을 재결정하지 **않는다**(그것들은 각자의 ADR에 있다) — 그것들을 순서대로
배열할 뿐이다.

## 모든 flow가 보호하는 단 하나의 불변식

public byte는 **core public-safe re-check를 통과했고** `boundary == "public"`를 지니며
`provenance.public_safe_recheck == passed`인 경우에 **한해서만** website/API에 존재할 수 있다. Upstream
boundary claim은 **evidence(증거)일 뿐**이다; gate는 **deny-by-default**이다. re-check는
**adapter가 아닌 core 단계**이므로([ADR-0004](../01-decisions/ADR-0004-import-and-ports_ko.md)), source를
교체하는 것으로 우회될 수 없다. 독자에게 이르는 경로상에서 이를 강제하는 세 가지 독립적인 backstop:

| # | Backstop | Stage | Mechanism |
|---|----------|-------|-----------|
| B1 | Core re-check | import | deny-by-default gate; redaction; curator approval; 통과 시에만 파일 기록 |
| B2 | Build invariant | build | `astro build`는 방출되는 모든 항목에 대해 `boundary === "public"`를 assert하며, 아니면 **빌드를 실패시킨다** |
| B3 | Public projection | build | audit-only sidecar 필드는 임의의 직렬화 이전에 제거된다; 테스트가 그것들이 출력에 결코 나타나지 않음을 assert한다 |

## Flow 1 — Import (discover → re-check → markdown을 git에 기록)

`ContentSourceAdapter`(v1: CAW-02 knowledge, CAW-03/skills-registry; stubs: internal wiki, curated bundle —
[ADR-0004](../01-decisions/ADR-0004-import-and-ports_ko.md))가 후보를 제안한다. **core**가 re-check를 수행하고,
curator approval 시 public projection을 markdown/MDX 파일과 audit-only **sidecar**로 기록한다.

```
  ┌────────────────────────────────────────────────────────────────────────┐
  │ UPSTREAM (separate products — import boundary, never a shared store)     │
  │   CAW-02 knowledge        CAW-03 / skills-registry      [stub] wiki/...  │
  └───────────────┬──────────────────┬───────────────────────────┬─────────┘
                  │   ContentSourceAdapter.discover() / fetch()    │
                  ▼                                                ▼
        ┌───────────────────────── CAW-04 CORE (hexagonal) ───────────────────┐
        │  1. NORMALIZE candidate → internal content model (ADR-0002)          │
        │  2. PUBLIC-SAFE RE-CHECK  (deny-by-default; upstream claim = EVIDENCE)│
        │       fail ─► reject + record reason (no file written)               │
        │  3. REDACT  (strip/transform anything not public-safe)               │
        │  4. CURATOR APPROVAL  (Jimmy; mandatory — ADR-0003)                  │
        │  5. ASSIGN semver + COMPUTE content-digest (ADR-0005)               │
        │  6. SPLIT projection:                                                │
        │       public frontmatter+body ─► file                                │
        │       origin_ref/origin_version/redaction internals ─► SIDECAR       │
        └───────────────┬───────────────────────────────┬────────────────────┘
                        │ write (only on pass+approve)   │ append
                        ▼                                ▼
        src/content/{type}/<slug>/<semver>.md(x)   _audit sidecar + hash-chained
                        │                            _events ledger (ADR-0003/0005)
                        ▼
                 git commit  ◄── diffable PR review IS part of the curator gate
```

결과: git repo는 **동결되고 검증된 코퍼스(corpus)** 를 보유한다. `(slug, semver)`는 영원히 동결되며, 제거 이후에도
결코 재사용되지 않는다([ADR-0005](../01-decisions/ADR-0005-storage-and-versioning_ko.md)). 하류(downstream)의
무엇도 결코 upstream을 다시 호출하지 않는다 — import boundary는 정확히 한 번, 여기서 넘어간다.

## Flow 2 — Build (Astro SSG → HTML + static JSON + raw markdown + index/manifest)

하나의 `astro build`가 **동일한** content collection(`getCollection()`)을 읽어 모든 표현을 방출하므로, web/API
parity(동등성)는 구조적이다 — 두 번째 source of truth는 없다([ADR-0006](../01-decisions/ADR-0006-web-stack_ko.md),
[ADR-0007](../01-decisions/ADR-0007-api-design_ko.md)).

```
   git repo: src/content/{tips,skills,workflows,playbooks}/<slug>/<semver>.md(x)
            (+ _audit sidecar — loaded for gate checks, NEVER serialized)
                                   │
                                   ▼
            Astro Content Collections — typed, schema-validated
            one in-memory corpus ── B2 assert boundary==="public" (else FAIL)
                                   │       B3 public projection (drop sidecar fields)
        ┌──────────────┬──────────┴───────────┬──────────────────┬───────────────┐
        ▼              ▼                       ▼                  ▼               ▼
   HTML pages     JSON envelopes         raw markdown        index.json      SKILL.md /
   (Starlight)    /api/v1/{type}/        /api/v1/{type}/     manifest        manifest.json
   moving +       {slug}[/versions/      {slug}[.md]         (all items,     + .skill bundle
   /v/{semver}    {semver}].json         (body + yaml hdr)   versions,       (slug@semver)
                                                             boundary,links) + MCP resources view
                                   │
                                   ▼
                       dist/  (HTML + .json + .md + manifests)
                                   │
                          content-digest frozen into every version body + strong ETag
```

핵심 속성:
- **고정/버전 라우트**(`/{type}/{slug}/v/{semver}`, `.../versions/{semver}.json`)는 불변 정적 파일이며
  `Cache-Control: public, max-age=31536000, immutable`로 제공된다.
- **MCP resources** 뷰와 **REST API**는 동일한 `dist/` 코퍼스의 추가 projection이다 — 각각이 하나의
  `PublishSinkAdapter`이며, 공유 substrate가 없다([ADR-0007](../01-decisions/ADR-0007-api-design_ko.md)).
- B2/B3가 실패하면 `dist/`는 결코 생성되지 않는다 — 비공개 항목은 배포에 결코 도달할 수 없다.

## Flow 3 — Publish (PublishSinkAdapter를 통한 배포)

게시(publish)는 `SiteAndApiSinkAdapter`가 동결된 `dist/` artifact를 static host + CDN으로 가져가는 것이다. 공개
요청에서 임의의 내부 store로 되돌아가는 **live 경로는 없다** — 배포된 artifact는 자기완결적(self-contained)이다.

```
   approved publish/update event
            │  (trigger: TODO(open-question: webhook vs CI-on-git-push vs scheduled — ADR-0006))
            ▼
   SiteAndApiSinkAdapter
            ├─ run Flow 2 (astro build) → dist/
            ├─ upload immutable static files → object store / static host
            ├─ invalidate moving URLs + index.json + manifests on CDN
            └─ leave pinned /v/{semver} files untouched (immutable, long-TTL)
            ▼
   CDN edge  ──►  web readers (HTML) · HTTP agents (.md/.json) · MCP hosts · crawlers (/llms.txt)
```

대체 sink(외부 docs host, package registry, syndication — [ADR-0004](../01-decisions/ADR-0004-import-and-ports_ko.md))는
content model을 건드리지 않고 동일한 adapter seam(이음새) 뒤에 끼워진다. 각각은 `dist/`의 별도 projection이다.

## Flow 4 — Unpublish / redact (tombstone + cache purge)

Boundary 변경은 re-check의 실패 모드 대응물이다. 세 가지 별개의, 감사되고(audited), Jimmy가 승인하는 연산
([ADR-0005](../01-decisions/ADR-0005-storage-and-versioning_ko.md)); `(slug, semver)`는 결코 재사용되지 않으므로
**tombstone하되, 결코 rewrite하지 않는다**.

| Operation | Scope | Public result | Cache action |
|-----------|-------|---------------|--------------|
| Deprecate | version or item | 여전히 제공됨; `deprecated` 플래그 + 후속(successor) 포인터; API 경고 | moving URL + index purge |
| Unpublish | whole item | 항목 라우트 → **HTTP 410 Gone**; index/sitemap에서 제거; web tombstone 페이지 | 모든 item URL + index purge |
| Redact | single version/field | 해당 버전 → **410 tombstone**; 형제(sibling)는 온전; `latest` 재지정 | 해당 version URL + index purge |

```
   curator decision (boundary changed) ─► core records audit (what/why/when/who)
            │
            ├─ mark item/version status in store + sidecar; public bytes purged on redact
            ├─ re-run Flow 2: removed addresses now emit 410 tombstone bodies
            │     (id, semver, digest, redacted_at, machine-readable reason — ADR-0007)
            ├─ Flow 3 deploy: tombstones replace prior files; sitemap/index regenerated
            └─ CDN PURGE the affected URLs (bounded — TODO(open-question: time-to-purge guarantee))
```

- **410 Gone, not 404** — "존재했으나, 의도적으로 제거됨"; agent에게 정직하고, SEO de-index에 올바르다.
- **301**은 콘텐츠가 진정으로 *이동*했을 때(rename/merge)에만 사용하며, boundary 제거에는 결코 사용하지 않는다.
- 내부 source로의 provenance는 public byte가 purge된 이후에도 **audit를 위해 보존된다**.

## 한눈에 보는 종단간(end-to-end)

```
 upstream ──import(re-check, core)──► git(frozen) ──build(SSG,assert)──► dist ──publish(sink)──► CDN ──► consumers
                    │                                   │                                          ▲
                    └─ deny/reject (no file)            └─ fail build if any item ≠ public          │
 unpublish/redact ──audit──► status+tombstone ──rebuild──► dist(410) ──deploy+CDN PURGE────────────┘
```

## 미해결 질문

> `../08-research-plan/open-questions_ko.md`로 미러링할 것.

- TODO(open-question: `PublishSinkAdapter`를 위한 rebuild+deploy 트리거 — webhook vs CI-on-git-push vs scheduled).
- TODO(open-question: unpublish/redact 시 CDN time-to-purge 보장; edge에 캐시된 public byte).
- TODO(open-question: redact 시, public byte를 즉시 purge할지 vs audit 보존을 위해 내부에 암호화하여 보관할지).
- TODO(open-question: semver bump를 누가/무엇이 할당하는지 — curator 단독 vs Jimmy가 승인하는 diff 보조 제안).

## runbook에 대한 함의

- **RB (import adapter + core re-check):** discover→normalize→re-check→redact→approve→write file+sidecar; gate는
  deny-by-default이며 adapter가 아닌 core에 위치한다.
- **RB (build invariant):** CI에 배선된 B2 `boundary === "public"` assertion과 B3 public-projection 테스트.
- **RB (publish sink):** `SiteAndApiSinkAdapter` 인터페이스 뒤의 `astro build` → upload + CDN invalidation.
- **RB (tombstones):** unpublish/redact를 위한 410 body + sitemap/index 제거 + bounded CDN purge.
</content>
