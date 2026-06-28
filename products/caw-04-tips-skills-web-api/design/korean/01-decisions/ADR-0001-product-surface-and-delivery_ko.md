# ADR-0001: 제품 표면(웹사이트 + REST API + preview/admin)과 콘텐츠 전달(markdown + JSON + HTML)

- **Status:** proposed
- **Owner:** Jimmy
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md
- **Related:**
  - [ADR-0002-content-model.md](./ADR-0002-content-model_ko.md)
  - [ADR-0003-publishing-policy-and-public-safe-gate.md](./ADR-0003-publishing-policy-and-public-safe-gate_ko.md)
  - ADR-0004 (import, ports & adapters — group B), ADR-0005 (storage & versioning — group B), ADR-0006 (web & API stack — group B)
  - [../02-research/web-and-api-stack.md](../02-research/web-and-api-stack_ko.md), [../02-research/skills-distribution-and-api-resources.md](../02-research/skills-distribution-and-api-resources_ko.md), [../02-research/versioning-and-immutability.md](../02-research/versioning-and-immutability_ko.md)

## Context

CAW-04는 `ai-workbench` 제품군의 **최종 publishing/read 레이어**다. 이미 검증되고 public-safe한 Tip/Skill/Workflow/Playbook을 공개 표면으로 publish한다(brief §1, §4). 그 자체로는 아무것도 저작하지 않으며, 형제 제품들과 런타임 기반을 공유하지 않는다(brief §1, §11). 이 ADR은 **어떤 표면이 존재하는지**와 **콘텐츠가 어떤 표현형으로 전달되는지**를 확정한다. 이는 ADR-0002(content model), ADR-0003(publish gate), 그리고 group-B의 스택/versioning ADR들이 모두 그 위에서 구축하는 바깥쪽 형태다.

작용하는 힘(forces):
- **공개, 읽기 전용, 계정 없음, curator만 publish**(brief §10). 공개 경로는 요청별 앱 서버가 필요 없어야 하고, 가능한 한 가장 작은 attack surface를 가져야 한다.
- **public-safe-by-construction**(brief §11, 가장 핵심적인 guardrail): 공개 요청에서 내부/upstream 저장소로 되돌아가는 라이브 코드 경로가 절대 없어야 한다. 제공되는 산출물은 동결되고 검증된 집합이어야 한다.
- **세 가지 소비자 클래스, 하나의 산출물**(research: skills-distribution §1): 사람 독자(HTML), HTTP agent(저토큰 markdown 또는 JSON), MCP host(JSON 카탈로그). 이들은 별도의 진실 원천이 아니라 하나의 정규(canonical) 리소스의 *projection*이어야 한다 — 그래야 provenance + boundary가 모든 표현형에 붙어 있게 된다.
- curator는 무엇이든 라이브로 가기 전에 **승인할 장소가 필요하다**(brief §4): 내부 preview/admin 표면.
- **Ports & adapters**(brief §8): 각 표면은 하나의 core 위에 있는 `PublishSinkAdapter`다. 표면은 content model이나 gate를 건드리지 않고도 교체 가능해야 한다.

## Options considered

### A. 어떤 표면들인가

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Website only** | 가장 단순 | 프로그래밍/agent 재사용 불가 — "agents fetch skills via API" 유스케이스가 죽음(brief §3) | reject |
| **API only** | machine-first | 사람 브라우징 표면 없음(brief §4 주요) | reject |
| **Website + REST API + internal preview/admin** (chosen) | 사람, agent, MCP, 그리고 curator 승인 단계를 모두 커버; brief §4와 정확히 일치 | 만들 표면이 셋 | **chosen** |
| Website + API + **public** write/admin | 제품 내 편집 UX | "no public write API / curator-only" 위반(brief §10) | reject |

### B. 콘텐츠 전달 표현형

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **JSON only** | 구조적, agent-파싱 가능 | 사람 페이지 없음; markdown agent는 HTML/JSON 토큰 세금을 냄 | reject |
| **Markdown only** | 저토큰, agent-친화적 | MCP/엄격한 클라이언트를 위한 typed envelope 없음; 렌더링된 웹 없음 | reject |
| **HTML + Markdown + JSON, 모두 하나의 source에서 projection** (chosen) | 하나의 canonical 리소스 → HTML 페이지(사람), raw markdown(research 기준 agent당 토큰 `~80%` 절감), JSON envelope(MCP/프로그래밍); provenance+boundary가 각각에 동행 | 세 projection을 parity로 유지해야 함 | **chosen** |

### C. 공개 경로를 어떻게 제공하는가

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **SSG: 모든 것을 정적 파일로 사전 빌드** (chosen) | 가장 저렴하고 가장 캐시 가능하며 가장 작은 attack surface; 배포된 집합이 동결되고 검증된 산출물(요청 시점에 내부 저장소로 가는 경로 없음); 이전 버전은 정적 파일로 유지됨 | publish마다 rebuild+deploy | **chosen** — publish 주기는 curator-paced + 저빈도 |
| SSR / runtime API | 요청 시점 동적 쿼리 | 런타임 기반 + ops + 누출 표면 추가; 읽기 전용 큐레이션 콘텐츠에는 정당화되지 않음 | defer |
| Hybrid (정적 + 하나의 search endpoint) | 정적이 어려운 곳에서 동적 검색 | 두 개의 전달 경로 | search 전용으로 v1.x |

## Decision

CAW-04는 **하나의 제품 core 위에 세 개의 표면**을 출하하며, 각각은 `PublishSinkAdapter`다(brief §8):

1. **Public website** — 사람 브라우징/읽기; 렌더링된 **HTML** 페이지.
2. **Public REST API** — agent와 MCP host를 위한 읽기 전용 프로그래밍 접근.
3. **Internal preview/admin** — curator(Jimmy)가 gate 발견 사항을 검토하고 publication을 승인(brief §4, §11). 이 표면은 절대 공개되지 않으며, gate를 통과한 후보를 라이브로 승격시키는 *유일한* 경로다(ADR-0003 G8 참조).

**전달 = markdown AND JSON AND HTML, 모두 하나의 canonical source 엔트리에서 projection된다.** publish된 산출물 및 버전마다 우리는 다음을 제공한다: HTML 페이지, raw `.md` 본문(frontmatter + body), 그리고 구조적 JSON envelope(body + ADR-0002 기준 reusable/auditable 메타데이터). 이들은 단일 리소스의 projection이며 — 결코 독립적인 저장소가 아니다 — 그래서 provenance와 public-safe boundary가 모든 표현형에 붙어 있게 된다.

공개 경로는 **정적으로 사전 빌드(SSG)된다**: 배포된 산출물은 동결되고 검증된 정적 파일 집합으로, **요청 시점에 어떤 내부 또는 upstream 저장소로도 되돌아가는 경로가 없다.** 빌드 시점 불변식이 방출되는 모든 항목에 대해 `boundary == public`을 단언하고 **그렇지 않으면 빌드를 실패시킨다**(brief §11에 대한 방어; ADR-0003 참조). Search는 사전 빌드/클라이언트 측 인덱스로 시작하며, 런타임 search endpoint는 보류된 선택적 adapter다.

**Content negotiation:** 명시적 `.md`/`.json` 확장자/접미사가 v1 계약(정적 파일 친화적이고 agent에게 모호하지 않음)이며, edge 레이어가 존재하는 곳에서는 `Accept`-헤더 negotiation(`text/markdown` vs `application/json`)이 정규의 보조 메커니즘이다. 기본 표현형: website 호스트에서는 HTML, API 호스트에서는 JSON. 구체적 리소스 트리, pagination, 필터링, 그리고 `.skill`/MCP 배포 형태는 ADR-0006 / skills-distribution research에서 확정된다. 이 ADR은 오직 **세 표현형 모두 존재하며 하나의 source에서 파생된다**는 것만 확정한다.

구체적 프레임워크(Astro + Starlight), API 리소스 스킴, 그리고 build/deploy 파이프라인은 **ADR-0006**(group B)에서 결정된다. 이 ADR은 그것들을 제약한다: 읽기 전용, 사전 빌드, one-source-many-projections, 공유 기반 없음.

## Consequences

- **쉬운 점:** 저렴한 CDN 호스팅; 사소한 수평 확장; 강력한 public-safe 스토리(동결 검증 파일); web/API parity는 모든 projection이 같은 source 엔트리를 읽기 때문에 구조적이다.
- **쉬운 점:** 나중에 표면 추가(외부 docs 호스트, 패키지 registry, 신디케이션, MCP registry 등록)는 같은 core 위에 있는 새 `PublishSinkAdapter`다(brief §8) — content-model이나 gate 변경 없음.
- **어려운 점:** 요청 시점 로직이 필요한 기능(사전 계산된 인덱스를 넘는 동적 필터링, 서버 측 search, 개인화)은 나중에 런타임 adapter 도입이 필요하다 — 의도적으로 보류됨.
- **어려운 점:** 모든 publish/unpublish가 rebuild+deploy를 트리거한다; rebuild 트리거 메커니즘은 후속 작업이다.
- **후속 작업:** ADR-0006이 스택과 리소스 스킴을 선택; ADR-0005가 표면이 따라야 할 versioned addressing을 확정; ADR-0003의 `boundary == public` 빌드 단언이 CI에 연결되어야 함.

## Open questions / revisit triggers

- TODO(open-question: content-negotiation) — 확장자 전용 라우트 vs 추가된 `Accept`-헤더 edge 규칙(런타임/edge 레이어가 들어오는지를 결정). [../02-research/web-and-api-stack.md](../02-research/web-and-api-stack_ko.md) 참조.
- TODO(open-question: search) — 사전 빌드 클라이언트 측 인덱스가 v1에 충분한가, 아니면 agent에게 서버 측 query/filter endpoint(런타임을 강제)가 필요한가?
- TODO(open-question: rebuild-trigger) — `PublishSinkAdapter`가 approve/update/unpublish 시 rebuild+deploy를 어떻게 트리거하는가.
- **Revisit trigger:** 상호작용성 또는 query 요구가 정적 전달을 넘어서면 Option C(runtime/SSR adapter)를 다시 연다.
