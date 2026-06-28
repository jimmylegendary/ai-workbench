# GLOSSARY — CAW-04 보편 언어(Ubiquitous Language)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set review date)
- **Related:**
  - [PRODUCT-BRIEF.md](./PRODUCT-BRIEF_ko.md)
  - [DOC-CONVENTIONS.md](./DOC-CONVENTIONS_ko.md)
  - [ADR-0002-content-model.md](../01-decisions/ADR-0002-content-model_ko.md)
  - [ADR-0003-publishing-policy-and-public-safe-gate.md](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md)
  - [ADR-0004 import & ports](../01-decisions/) · [ADR-0005 storage & versioning](../01-decisions/) · [ADR-0006 web stack](../01-decisions/) · [ADR-0007 API design](../01-decisions/)
  - [content-model-and-metadata.md](../02-research/content-model-and-metadata_ko.md)
- **Source of truth:** ./PRODUCT-BRIEF.md

## Purpose

이 문서는 CAW-04 — AI Tips/Skills Website & REST API — 의 **보편 언어(ubiquitous language)** 를 고정합니다. 모든 설계 문서, ADR, 리서치 노트, runbook은 여기에 정의된 그대로 이 용어들을 사용해야(MUST) 합니다(DOC-CONVENTIONS §7 참조). 정의와 ADR이 어긋날 때는, 동작(behaviour)에 대해서는 ADR의 규범적(normative) 본문이 우선하며 이 glossary가 그에 맞게 수정됩니다. 이 문서는 결정을 내리지 않습니다(NOT). ADR이 결정하는 개념에 이름을 붙일 뿐입니다. 상호 링크는 각 용어에 대해 권위 있는 ADR을 가리킵니다 — ADR의 근거(rationale)를 여기에 중복 기재하지 마세요.

읽기 규칙: **MUST / MUST NOT / NEVER** 는 규범적(normative, 핵심을 떠받치는)입니다. 그 외 산문은 서술적(descriptive)입니다.

---

## 1. 핵심 정체성 용어(Core identity terms)

| Term | Definition | Authority |
|------|------------|-----------|
| **CAW-04** | 이 제품: AI Tips/Skills Website & REST API. `ai-workbench` 제품군에 속하는 **독립적(independent), 단독(standalone)** 제품으로 자체 core, data, deploy를 가지며 형제 제품들과 **공유하는 런타임 substrate가 없음(no shared runtime substrate)**. | BRIEF §1 |
| **Publishing layer** / **public read layer** | CAW-04의 역할: 제품군의 **최종 발행/읽기 surface**. 내부 substrate가 이미 검증한 콘텐츠를 발행하며, 콘텐츠를 지어내서는 안 됨(MUST NOT). | BRIEF §1 |
| **Artifact** | 가치의 단위: provenance(출처)와 safety boundary를 갖춘, **발행되고 버전이 매겨진 public-safe한** 항목 하나(Tip / Skill / Workflow / Playbook)로 web + API를 통해 제공됨. | BRIEF §2 |
| **Curator** | 모든 발행을 승인하는 내부의 사람(Jimmy). 자동 생성은 *제안(proposal)* 생성에 불과하며, curator가 발행을 게이트(gate)함. | BRIEF §3, §11 |
| **Reader** | 공개 surface의 외부 소비자 — 웹사이트를 둘러보는 사람, 또는 REST/MCP를 통해 가져가는 에이전트. | BRIEF §3 |

---

## 2. 콘텐츠 모델 — 여덟 개의 엔티티

콘텐츠 모델은 **8개 엔티티**를 가집니다. 넷은 **발행 가능(publishable)**(주소 지정 가능한 artifact)이고 넷은 **보조(supporting)** 입니다. 전체 스키마와 필드별 상세: [ADR-0002](../01-decisions/ADR-0002-content-model_ko.md) 및 [content-model-and-metadata.md](../02-research/content-model-and-metadata_ko.md).

| Entity | Kind | Definition |
|--------|------|------------|
| **Tip** | publishable | 작고 검증된 AI 활용 관행 — 초점이 분명하고 실행 가능하며, 단순한 프롬프트 스니펫 이상. |
| **Skill** | publishable | 명시적 **inputs/outputs, preconditions, provenance, safety boundary, version** 을 갖춘 재사용 가능하고 감사 가능한(auditable) 역량. `SKILL.md` + `manifest.json`으로 배포 가능(§7 참조). |
| **Workflow** | publishable | 더 큰 작업을 수행하기 위한 Skill/Tip의 순서 있는 조합. |
| **Playbook** | publishable | 반복적인 상황을 위해 Workflow/Skill/Tip을 묶은 상위 수준 운영 패턴. |
| **Example** | supporting | 발행 가능 엔티티에 부착된 구체적이고 public-safe한 예시. |
| **Source** | supporting | artifact의 **검증된 내부 기원(validated internal origin)** 에 대한 참조(어떤 upstream 제품/항목에서 왔는지). 감사 및 publish gate에 사용됨. provenance + sidecar(§4) 참조. |
| **SafetyBoundary** | supporting | 어떤 항목이 주어진 노출 수준(exposure level)에서 안전함을 단언하는 분류. **public-safe** boundary를 가진 항목만 발행될 수 있음. [ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md) 참조. |
| **Version** | supporting | 발행 가능 엔티티의 불변이며 주소 지정 가능한 리비전으로, **semver** + **content-digest**(§6)로 식별됨. |

### 공통 필드(Common fields)

모든 발행 가능 엔티티가 공유: `id`, `kind`, `title`, `summary`, `version`, `safety_boundary`, `provenance`.

```yaml
# shared frontmatter shape (illustrative — ADR-0002 is authoritative)
id: skill.public-safe-redaction          # stable public id
kind: skill                              # tip | skill | workflow | playbook
title: "..."
summary: "..."
version: 1.2.0                           # semver — public addressable identity
safety_boundary: public-safe            # only public-safe is publishable
provenance:                             # PUBLIC-SAFE provenance only
  source_kind: caw-03-skills-registry
# origin_ref / origin_version => SIDECAR ONLY (never serialized; see §4)
```

---

## 3. publish gate와 public-safe

| Term | Definition |
|------|------------|
| **Publish gate** | 모든 콘텐츠가 발행 전에 통과해야 하는 **deny-by-default(기본 거부)** 통제. (a) 검증된 내부 **Source** 가 있고 AND (b) **public-safe** SafetyBoundary 가 있고 AND (c) 명시적 **curator 승인** 이 있을 때 **에만** 발행함. 핵심을 떠받침(load-bearing) — [ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md) 참조. |
| **Public-safe** | 콘텐츠가 **기밀 회사 데이터를 담고 있지 않으며** 공개 surface로 내보내도 됨을 뜻하는 boundary 분류. 가장 중요한 guardrail(BRIEF §11): 공개 출력은 오직 public-safe한 소스에서만 나옴. |
| **Deny-by-default** | 모든 후보의 기본 처분은 *발행하지 않음*. 안전하다는 증거가 없으면 안전하지 않은 것으로 취급함. |
| **Curator approval** | 모든 발행에 대한 필수적인 사람(curator)의 승인. 어떤 자동 경로도 이를 우회하지 않음. |
| **Boundary** | SafetyBoundary 값(예: `public-safe`, `internal-only`)의 약칭. 발행된 항목에 대한 **boundary 변경** 은 deprecate / unpublish / **redact**(§5)를 촉발함. |
| **Public-safe by construction** | 시스템 수준의 속성: 발행된 artifact는 동결되고 검증된 정적 출력으로 내부 store로 가는 **라이브 경로가 없으므로(no live path)**, upstream이 바뀌더라도 유출될 수 없음. SSG(§8)와 public-projection split(§4)으로 강화됨. |

---

## 4. public-projection split과 sidecar

| Term | Definition |
|------|------------|
| **Public-projection split** | artifact의 공개 표현은 내부 레코드의 **엄격한 projection(투영)** 이라는 규칙: audit 전용 필드는 web/API로 제공되는 어떤 것에서도 제외됨. 테스트로 강제됨. [ADR-0002](../01-decisions/ADR-0002-content-model_ko.md) 참조. |
| **Sidecar** | **audit 전용 provenance 필드**(특히 `origin_ref`, `origin_version`)를 담는 별도의 내부 전용 store. sidecar는 웹사이트나 API로 **절대 serialize되어서는 안 됨(MUST NEVER serialize)**. |
| **Audit-only fields** | artifact를 검증된 내부 Source로 역추적하기 위해 보관하지만 **공개적으로 노출하기에 public-safe하지 않은** 필드. sidecar에 존재하며, 공개 frontmatter/JSON에는 결코 없음. |
| **Provenance (public)** | 공개 surface에 나타나도 되는(MAY) 기원 메타데이터의 public-safe한 부분집합(예: 거친 수준의 `source_kind`). audit 전용 provenance와는 구별됨. |

```
artifact record  ──projection──▶  PUBLIC (web HTML / API JSON / markdown)
       │
       └── sidecar (audit-only: origin_ref, origin_version)  ──▶  NEVER public  (test-enforced)
```

---

## 5. unpublish, redaction, tombstone

| Term | Definition |
|------|------------|
| **Redaction** | 더 이상 노출되어서는 안 되는 콘텐츠를 제거하거나 가리는 것(예: boundary 변경 이후). publish 정책의 일부이며, 즉흥적으로가 아니라 gate를 통해 적용됨. |
| **Unpublish** | 이전에 발행된 artifact를 공개 surface에서 철회하는 것. |
| **Tombstone** | artifact/version이 unpublish 또는 redact될 때 남는 영속적 표식. 공개 surface는 해당 주소에 대해 **HTTP 410 Gone** tombstone을 제공함 — 주소는 조용히 재사용되거나 404가 되지 않음. [ADR-0005](../01-decisions/) / [ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md) 참조. |
| **Generated/unverified content** | upstream에서 검증되지 않은 LLM 또는 파이프라인 생성 자료. **절대 발행되지 않음(NEVER published)** — curator + source + boundary를 기다리는 제안(proposal)일 뿐. |

---

## 6. 버전 관리 및 불변성(Versioning & immutability)

| Term | Definition |
|------|------------|
| **semver** | artifact의 **public addressable identity(공개 주소 식별자)** 인 시맨틱 버전(`MAJOR.MINOR.PATCH`). version의 web/API URL은 그 semver를 담음. |
| **content-digest** | version의 **불변성 증명(immutability proof)** 역할을 하는 콘텐츠 해시 — 동결된 version에 대한 은밀한 편집을 탐지/금지함. |
| **Immutable version** | 발행된 `(slug, semver)` 쌍은 **영원히 동결됨(frozen forever)**: 그 콘텐츠는 결코 변하지 않음. 편집은 옛 것의 변형이 아니라 **새(new)** version을 만들어냄. |
| **Frozen** | 발행된 모든 version의 상태: 무기한 주소 지정 가능하며, byte 단위로 안정적(content-digest로 검증됨). |
| **Edit = new version** | 발행된 콘텐츠를 바꾸는 유일한 방법은 더 높은 semver를 발행하는 것이며, 옛 version은 주소 지정 가능한 채로 남음. boundary 변경은 편집이 아니라 deprecate/unpublish/redact(§5)를 사용함. |

저장 레이아웃([ADR-0005](../01-decisions/) 참조):
```
src/content/{tips,skills,workflows,playbooks}/<slug>/<semver>.md(x)
# audit-only fields => sidecar (never in the served file)
```

---

## 7. surface, 배포 형식 및 API

CAW-04는 **하나의 제품 core 위의 세 개 surface** 이며, 각각이 **PublishSinkAdapter**(§9)로 구현됩니다. [ADR-0001](../01-decisions/)(surface)과 [ADR-0007](../01-decisions/)(API 설계) 참조.

| Term | Definition |
|------|------------|
| **Website** | 사람이 둘러보고 읽기 위한 공개 **HTML** surface. |
| **REST API** | 에이전트/MCP를 위한 공개적이고 **읽기 전용(read-only)** 인 프로그래밍 surface. 동일 빌드에 의해 **정적 JSON + raw markdown으로 사전 빌드됨(prebuilt)**(하나의 소스에서 web/API parity). |
| **Preview/admin surface** | curator의 publish gate(미리보기 + 승인)를 위한 내부 surface. 공개되지 않음. |
| **Canonical resource** | artifact당 정확히 **하나(one)** 의 권위 있는 resource로, HTML / markdown / JSON 표현으로 제공됨. |
| **`SKILL.md`** | Skill을 위한 사람/에이전트가 읽을 수 있는 배포 파일. |
| **`manifest.json`** | 배포를 위해 Skill의 메타데이터를 기술하는 기계가 읽을 수 있는 동반 파일. |
| **`index.json`** | 발행된 artifact를 열거하는 최상위 **manifest**(API의 발견 진입점). |
| **MCP resources view** | 에이전트가 Model Context Protocol을 통해 목록 조회/읽기를 할 수 있도록, 발행된 artifact를 **MCP resources** 로 노출한 표현. |
| **Web/API parity** | HTML, markdown, JSON이 하나의 빌드에서 하나의 소스로부터 생성되어 서로 어긋날 수 없다는 속성. |

연기됨(v1에 포함되지 않음, ADR-0007에 따라): 런타임 검색; `Accept` 헤더 콘텐츠 협상(content negotiation).

---

## 8. 웹 스택 및 빌드(Web stack & build)

| Term | Definition |
|------|------------|
| **Astro** | 사이트/API를 빌드하는 데 사용하는 웹 프레임워크(Astro 5). [ADR-0006](../01-decisions/) 참조. |
| **Starlight** | 사이트의 docs/읽기 UI를 제공하는 Astro 문서 프레임워크. |
| **SSG (static site generation)** | 빌드 시점에 **정적(static)** 출력 artifact를 만들어내는 빌드 모드 — 내부 store를 가져오는 서버 측 런타임 fetching이 없음. "public-safe by construction"(§3)의 토대. |
| **content-from-git** | 빌드가 라이브 데이터베이스가 아니라 CAW-04 자체의 git 콘텐츠 repo(§ storage)에서 콘텐츠를 가져옴. |
| **Content collection** | `src/content/` 아래의 콘텐츠 파일(`tips`, `skills`, `workflows`, `playbooks`)에 대한 Astro의 타입이 지정된 묶음으로, 빌드 시 스키마 검증됨. |
| **Static artifact** | SSG 빌드의 동결되고 검증된 출력으로, SiteAndApi sink 뒤에 배포됨. 내부 store로 가는 라이브 경로 없음. |

---

## 9. port, adapter 및 import

**두 개의 port** 와 설정 주도 registry를 갖춘 hexagonal core. [ADR-0004](../01-decisions/) 참조.

| Term | Definition |
|------|------------|
| **Port** | core 경계의 안정적 인터페이스. CAW-04는 정확히 두 개를 가짐: `ContentSourceAdapter`(인바운드)와 `PublishSinkAdapter`(아웃바운드). |
| **Adapter** | 특정 source 또는 sink에 대한 port의 구체적 구현. |
| **Registry** | 어떤 adapter가 활성인지 선택하는 설정 주도(config-driven) 배선(wiring). 재설계 없이 미래의 source/sink를 끼워 넣을 수 있게 함. |
| **ContentSourceAdapter** | **인바운드(inbound)** port: 후보 콘텐츠를 import함. v1 adapter: **CAW-02**(검증된 knowledge)와 **CAW-03 / skills-registry**(검증된 Skill/Workflow/Playbook). 문서화된 stub: internal wiki, curated bundle. |
| **PublishSinkAdapter** | **아웃바운드(outbound)** port: 검증된 artifact를 발행함. v1 adapter: **SiteAndApi**(웹사이트 빌드 + REST API). 문서화된 stub: external docs host, package registry, syndication. |
| **Stub** | 미래의 source/sink를 위한 이음새(seam)가 존재함을 증명하는, 문서화되어 있으나 아직 빌드되지 않은 adapter 자리표시자. |
| **Import re-check** | 모든 import된 후보에 대해 **CORE에서 수행되는 public-safe RE-CHECK(재검증)**(adapter가 아님, NOT in adapters). upstream의 boundary 주장은 **증거일 뿐(evidence only)** 이며, core가 deny-by-default로 재검증함. 이 재검증을 통과한 **후에(after)** ContentSource가 콘텐츠를 git store에 기록함. |
| **Evidence-only** | upstream boundary 주장의 지위: 정보를 제공하지만 발행을 결코 승인하지 않음. core의 재검증이 결정함. |

```
CAW-02 / CAW-03 ─▶ ContentSourceAdapter ─▶ [ CORE: import re-check (deny-by-default, public-safe) ]
                                                     │ pass + curator approval
                                                     ▼
                              git content store ─▶ Astro SSG ─▶ PublishSinkAdapter(SiteAndApi) ─▶ Web + API + MCP
```

---

## 10. 제품 간 경계 용어(Cross-product boundary terms)

CAW-02와 CAW-03은 **별개의 독립 제품(separate, independent products)** 입니다(BRIEF §1, DOC-CONVENTIONS §4). CAW-04는 이들을 오직 **import/export 경계** 를 가로질러 참조하며 — 공유 store, registry, substrate로 참조하지 않습니다.

| Term | Definition |
|------|------------|
| **CAW-02** | 별개 제품: 검증된 **knowledge** 저장소. 공유 store가 아니라 import source. |
| **CAW-03** | 별개 제품: **skills harness / skills registry**. 공유 store가 아니라 import source. |
| **Import boundary** | upstream 후보가 CAW-04로 넘어오는 명시적 이음새이며, 여기서 core 재검증이 적용됨. |
| **Export** | CAW-04가 세상에 내보내는 출력: 공개 웹사이트 + REST API (+ MCP view). |

---

## Open Questions

[../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md)에서 추적:
- TODO(open-question: exact enumerated values + ordering of the SafetyBoundary scale beyond `public-safe`).
- TODO(open-question: precise public-vs-sidecar field list for `provenance` — confirm against ADR-0002 final schema).
- TODO(open-question: canonical content-digest algorithm and where the digest is recorded/verified).
- TODO(open-question: tombstone retention policy — how long 410s are served).

## Implications for runbooks

- Runbook은 이 정확한 용어 이름을 사용해야(MUST) 함(DOC-CONVENTIONS §7); 핵심을 떠받치는 용어를 처음 쓸 때 이 glossary를 링크할 것.
- serialization을 건드리는 모든 runbook은 **public-projection split**(sidecar는 결코 serialize되지 않음)을 테스트로 단언해야(MUST) 함.
- versioning을 건드리는 모든 runbook은 발행된 `(slug, semver)`를 동결된 것으로 취급하고 content-digest 불변성을 강제해야(MUST) 함.
