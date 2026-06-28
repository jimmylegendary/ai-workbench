# Open Questions — 통합 추적기

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:** [./research-plan_ko.md](./research-plan_ko.md), [./validation-and-tests_ko.md](./validation-and-tests_ko.md), [../01-decisions/](../01-decisions/), [../02-research/](../02-research/)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적

이 문서는 CAW-04의 연구 노트(`02-research/`)와 결정 기록(`01-decisions/`) 전반에서 제기된 모든 open question에 대한 **단일 통합 추적기**다. 각 행은 중복이 제거되어 있다(연구 문서와 그에 대응하는 ADR에 동일하게 등장하는 질문은 둘 다를 인용하면서 하나의 행으로 병합된다). 이 문서는 질문을 해결하지는 않는다 — 각 질문에 안정적인 `OQ-id`, 소유 문서, 해결 기한 **phase**([research-plan.md](./research-plan_ko.md)의 빌드 phase 기준; 날짜를 임의로 만들지 않음), 그리고 상태를 부여할 뿐이다. 질문이 답변되면 해당 ADR/연구 문서를 갱신하고, 상태를 `resolved`로 설정한 뒤 해결 산출물을 링크한다.

상태 값: `open` · `in-research`(research-plan.md에 트랙이 있음) · `resolved` · `deferred`.
Phase: `P0`–`P5`(research-plan.md 참조). 해결 기한은 날짜가 아니라 phase를 사용한다 — DOC-CONVENTIONS에 따라 날짜를 임의로 만들지 않는다.

## 추적기

| id | question | owning ADR / doc | research track | resolve-by | status |
|----|----------|------------------|----------------|-----------|--------|
| OQ-01 | CAW-02/CAW-03이 고정할 수 있는 안정적이고 버전이 매겨진 `origin_ref`를 노출하는가, 아니면 가변 핸들만 노출하는가? | ADR-0002; research/content-model-and-metadata | T1 | P2 | in-research |
| OQ-02 | JSON Schema가 `inputs/outputs`에 대한 family 전반의 계약 언어인가, 아니면 MCP tool schema에 맞추는가? | ADR-0002; research/content-model-and-metadata | — | P1 | open |
| OQ-03 | 최소 실행 가능한 `SafetyBoundary.classification` enum — 3단계 척도로 충분한가, 아니면 필드별 민감도 라벨이 필요한가? | ADR-0002; research/content-model-and-metadata | — | P1 | open |
| OQ-04 | `content_hash`/`Version.content_hash`가 sidecar/audit 필드를 포함하는가, 아니면 public projection만 포함하는가? | ADR-0002, ADR-0005; research/content-model-and-metadata, research/versioning-and-immutability | T9 | P1 | in-research |
| OQ-05 | 라이선스 정책 — 단일 기본 SPDX 대 artifact별, 그리고 upstream `Source`로부터의 상속? | ADR-0002, ADR-0007; research/content-model-and-metadata, research/skills-distribution-and-api-resources | — | P3 | open |
| OQ-06 | 정확한 public-safe 재검사 규칙 집합 + `profiles.recheck`에서 임계값이 어디에 위치하는가; 공유 기반(substrate) 없이 upstream boundary 정책과의 정합성? | ADR-0003, ADR-0004; research/import-and-ports, research/publishing-policy-and-public-safe | T2 | P2 | in-research |
| OQ-07 | redaction 엔진 — Microsoft Presidio(NLP recall) 대 더 가벼운 regex+denylist 코어? | ADR-0003; research/publishing-policy-and-public-safe | T2 | P2 | in-research |
| OQ-08 | CAW-04의 codename/fab/customer 패턴 목록은 어디에 위치하며 어떻게 doctrine 차원에서 정합성을 유지하는가? | ADR-0003; research/publishing-policy-and-public-safe | T2 | P2 | in-research |
| OQ-09 | import bundle이 로컬 `boundary_eff` 재계산을 위한 전체 provenance ancestor graph를 함께 전달하는가? | ADR-0003; research/publishing-policy-and-public-safe | T1 | P2 | in-research |
| OQ-10 | imported bundle에 대한 서명/증명(attestation) 방식 — DSSE / in-toto / minisign? | ADR-0003, ADR-0004; research/publishing-policy-and-public-safe, research/import-and-ports | T5 | P2 | in-research |
| OQ-11 | 재검증 주기 — upstream이 어떤 소스를 confidential로 재분류할 때 CAW-04는 이를 어떻게 인지하고 gate를 다시 실행하는가? | ADR-0003, ADR-0004; research/publishing-policy-and-public-safe, research/import-and-ports | T3 | P4 | in-research |
| OQ-12 | unpublish/redact 시 Cache/CDN purge 보장 — 작업 후 purge까지의 시간 상한? | ADR-0003, ADR-0006; research/publishing-policy-and-public-safe, research/web-and-api-stack | T4 | P4 | in-research |
| OQ-13 | 이미 공개된 외부 소스(인용된 논문)와 내부 출처의 public-safe 콘텐츠에 대해 provenance 종류를 구분하는가? | ADR-0003; research/publishing-policy-and-public-safe | T1 | P2 | open |
| OQ-14 | 두 source 어댑터가 동일한 논리적 항목을 노출할 때(fan-in)의 dedup/우선순위 + provenance를 보존하는 병합? | ADR-0004; research/import-and-ports | T8 | P2 | in-research |
| OQ-15 | import 방향 — pull(CAW-04가 `discover()`를 폴링) 대 push(upstream이 통지)? | ADR-0004; research/import-and-ports | T3 | P2 | open |
| OQ-16 | 어댑터 발견 메커니즘 — 내장 registry만 대 entry-point/manifest 플러그인 — 그리고 어댑터↔포트 SemVer/호환 정책? | ADR-0004; research/import-and-ports | — | P5 | open |
| OQ-17 | immutable한 주소 지정 가능 버전에 대한 `unpublish` 의미 — tombstone 대 hard-removal; API는 철회된 버전에 어떻게 응답하는가? | ADR-0004, ADR-0005; research/import-and-ports, research/versioning-and-immutability | T4 | P4 | open |
| OQ-18 | 정확한 canonical serialization 사양 — 어떤 메타데이터 필드가 해시된 envelope 안에 있고 어떤 것이 sidecar에 있는가? | ADR-0005; research/versioning-and-immutability | T9 | P1 | in-research |
| OQ-19 | semver bump를 누가/무엇이 할당하는가 — curator 단독 대 Jimmy가 승인하는 diff 보조 제안? | ADR-0005; research/versioning-and-immutability | — | P1 | open |
| OQ-20 | redact 시 public 바이트를 즉시 purge하는가 대 audit(법무/보존)를 위해 내부에 암호화하여 보존하는가? | ADR-0005; research/versioning-and-immutability | T4 | P4 | open |
| OQ-21 | digest 알고리즘 + 접두사 규약(`sha256:` 대 multihash); digest-pin URL alias를 노출하는가? | ADR-0005; research/versioning-and-immutability | T9 | P1 | in-research |
| OQ-22 | 항목 slug가 변경(rename)되는 경우가 있는가 — 기존 slug에서 301 대 새 항목 + provenance 링크? | ADR-0005; research/versioning-and-immutability | — | P4 | open |
| OQ-23 | deprecated이지만 계속 제공되는 버전에 대한 Sitemap/index 동작 — 목록에 표시, 숨김, 또는 플래그? | ADR-0005; research/versioning-and-immutability | — | P4 | open |
| OQ-24 | Content negotiation — `Accept` header(canonical) + `.md`/`.json` 접미사; CDN `Vary: Accept` 동작? | ADR-0001, ADR-0007; research/web-and-api-stack, research/versioning-and-immutability | T6 | P3 | in-research |
| OQ-25 | 검색 — 사전 빌드된 클라이언트 측 인덱스(Pagefind)가 v1에 충분한가, 아니면 서버 측 검색이 필요한가? | ADR-0001, ADR-0006; research/web-and-api-stack | T7 | P5 | deferred |
| OQ-26 | `PublishSinkAdapter`의 rebuild+deploy 트리거 메커니즘(webhook 대 CI-on-git-push 대 기타)? | ADR-0001, ADR-0006; research/web-and-api-stack | — | P3 | open |
| OQ-27 | Starlight의 문서 중심 레이아웃/버전 관리가 Tip/Skill/Workflow/Playbook 엔티티 모델에 맞는가? | ADR-0006; research/web-and-api-stack | — | P3 | open |
| OQ-28 | 공개 Agent Skills `SKILL.md` 사양을 그대로 채택할 것인가 대 CAW-04 superset 프로파일(drift 위험)? | ADR-0007; research/skills-distribution-and-api-resources | — | P3 | open |
| OQ-29 | `published_at`/`updated_at` 타임스탬프 + 타임존 정책(임의로 만들지 않음)? | ADR-0007; research/skills-distribution-and-api-resources | — | P3 | open |
| OQ-30 | 카탈로그가 커져도 `total_count`가 저렴하게 유지되는가, 아니면 순수 cursor pagination을 위해 이를 제거하는가? | ADR-0007; research/skills-distribution-and-api-resources | — | P3 | open |
| OQ-31 | MCP Registry 등재 — v1 범위에 포함 대 이후의 PublishSinkAdapter stub만? | ADR-0007; research/skills-distribution-and-api-resources | — | P5 | deferred |
| OQ-32 | `references/`/`assets/` 크기 제한 + bundling 전 secret/virus 스캔(public-safe)? | ADR-0007; research/skills-distribution-and-api-resources | T2 | P2 | open |
| OQ-33 | 버전 간 Workflow step 참조 — 정확한 `id@version` 고정 대 range/`latest` 허용? | ADR-0007; research/skills-distribution-and-api-resources | — | P3 | open |
| OQ-34 | read API의 OpenAPI/JSON-Schema 설명을 정적 경로에 게시하는가? | ADR-0007; research/web-and-api-stack | — | P3 | open |
| OQ-35 | `/api/v1`이 대체될 때의 API path-prefix deprecation 정책? | ADR-0001; research/web-and-api-stack | — | P5 | open |

## dedup에 관한 메모

- provenance/`origin_ref` 질문은 ADR-0002와 content-model 연구 노트 둘 다에 등장한다 → **OQ-01**.
- redaction 엔진, codename 패턴 목록, ancestor-graph, 서명, 재검증, CDN-purge 질문은 각각 ADR-0003과
  publishing-policy 연구 노트 둘 다에 등장한다(일부는 import-and-ports에도) → 모든 소유 문서를 인용하여
  **OQ-06..OQ-13**으로 병합.
- canonical-serialization, semver-bump 권한, redact-retention, digest-algo, slug-rename,
  deprecated-index 질문은 ADR-0005와 versioning 연구 노트 둘 다에 등장한다 → **OQ-18..OQ-23**.
- content-negotiation, 검색, rebuild-trigger는 ADR-0001/0006/0007과 web/api 연구 노트에 걸쳐 등장한다
  → **OQ-24..OQ-26**.

## Load-bearing 하위 집합(public-safe critical)

이들은 공개 경로가 가동되기 전에 반드시 해결되어야 하며,
[validation-and-tests.md](./validation-and-tests_ko.md)의 테스트를 직접 뒷받침한다: **OQ-06, OQ-07, OQ-08, OQ-09, OQ-10, OQ-11, OQ-12, OQ-13,
OQ-14, OQ-17, OQ-20, OQ-32**. 나머지는 품질/사용성에 관한 것이며 각자의 phase에서 해결될 수 있다.
