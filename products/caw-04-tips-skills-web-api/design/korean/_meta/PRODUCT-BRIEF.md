# PRODUCT BRIEF — AI Tips / Skills 웹사이트 및 REST API (CAW-04)

> **CAW-04**에 대한 단일 진실 공급원(single source of truth). 모든 디자인 문서 + 런북은 이 brief와 일관되게 유지되어야 한다.
> 문서가 brief와 모순되면 brief가 이긴다. 미지의 사항은 `08-research-plan/open-questions.md`에 기록한다.

## 0. 단 하나의 엄격한 제약
우리는 여기서 제품을 빌드하지 않는다. 우리는 AI 빌더가 실행할 상세 디자인 + 빌드 지침(runbook)을 작성한다
— 구체적 기능, 방법론, 명명된 도구, 도구별 런북. 빌더가 코드를 작성한다.

## 1. 정체성 & 독립성
- **Product:** AI Tips / Skills 웹사이트 및 REST API (CAW-04).
- **One-liner:** **검증된(validated)** AI 활용 tip, skill, workflow, 재사용 가능한 운영 패턴을 발행하는 **public read/API surface** —
  무작위 프롬프트 조각이 아니다.
- 6개로 이루어진 `ai-workbench` 패밀리 안의 **독립적이고 standalone인 제품**. 자체 코어, 데이터, 배포. **공유 런타임
  기반(substrate)이 없다.** 명시적 경계를 넘어 검증된 콘텐츠를 **import**하고(CAW-02 knowledge, CAW-03 /
  skills registry) 웹사이트 + REST API를 **publish**한다.
- **Position:** **최종 퍼블리싱/읽기 레이어**. 콘텐츠를 발명해서는 안 된다 — 내부
  기반이 이미 검증한 것을 발행한다. (지금 설계됨; upstream에 검증된 항목이 존재하면 콘텐츠가 라이브로 전환됨.)

## 2. 문제 & 가치
- **Problem:** 검증된 AI 활용 관행이 내부에 갇혀 있다; 임시방편적 공유는 기밀 노하우를 유출하거나
  검증되지 않은 조각을 발행한다.
- **Unit of value:** provenance + safety boundary를 갖춘, web + API로 제공되는
  하나의 **발행된, 버전이 부여된, public-safe artifact**(하나의 Tip / Skill / Workflow / Playbook).
- **Why separate:** 퍼블리싱은 그 자체의 관심사(public-safe gating, versioning, web/API delivery, audit)를 가지며
  이는 내부 제품 안에 있어서는 안 된다.

## 3. 사용자 & 주요 use case
- **Personas:** 외부 독자(web/API 소비자), 발행을 승인하는 내부 큐레이터(Jimmy), API를 통해
  skill/workflow를 가져오는 AI 에이전트.
- **Top use cases:**
  1. CAW-02/CAW-03에서 검증된 Skill/Workflow를 import → **public-safe gate** → publish (버전 부여).
  2. 독자가 웹사이트를 탐색; 에이전트가 동일 콘텐츠를 REST(markdown 또는 JSON)로 가져옴.
  3. 발행된 항목 업데이트 → 새 **Version**; 이전 버전은 계속 주소 지정 가능(addressable).
  4. 경계가 바뀌면 항목을 Unpublish / redact.
  5. Audit: 발행된 모든 항목은 검증된 내부 소스 + safety review로 추적된다.

## 4. 제품 surface(들)
- **Primary:** **public website**(탐색/읽기) + **REST API**(프로그래밍 방식 읽기). 콘텐츠는
  **markdown 및/또는 JSON**으로 제공(ADR에서 결정).
- **Secondary:** publish gate를 위한 내부 **preview/admin** surface(큐레이터 승인).
- 모든 surface 뒤에는 하나의 제품 코어; 다른 제품과 공유 기반 없음.

## 5. 핵심 도메인 (the heart)
- **Entities:** `Tip, Skill, Workflow, Playbook, Example, Source, SafetyBoundary, Version`.
- **재사용 가능 + 감사 가능한 메타데이터:** 각 Skill/Workflow는 재사용 및 감사가 가능할 만큼 충분한 메타데이터를
  지닌다(inputs/outputs, preconditions, provenance, safety boundary, version).
- **Publish gate:** (a) 검증된 내부 소스와 (b) **public-safe** safety
  boundary 없이는 아무것도 발행되지 않는다. *검증되지 않았거나 회사 기밀인 노하우는 절대 발행되지 않는다.*
- **Versioning:** 콘텐츠는 버전이 부여된다; 발행된 버전은 불변(immutable) + 주소 지정 가능(addressable).

## 6. 데이터
- CAW-04 자체의 콘텐츠 저장소. 방향: 발행된 콘텐츠에 대한 **markdown/MDX-first (git)를 진실 공급원으로** +
  API를 위한 index(패밀리와 일관됨); 대용량 자산은 path로. ADR에서 결정.
- 모든 항목은 `boundary`(발행분은 public only) + provenance(내부 소스 참조) + version을 지닌다.

## 7. Import / export 경계 (다른 독립 제품으로)
- **Imports from CAW-02:** 검증된 knowledge(인용된 tip/insight)를 후보 콘텐츠로.
- **Imports from CAW-03 / skills registry:** 검증된 Skill/Workflow/Playbook.
- **Exports:** public website + REST API(세계 / 다른 에이전트를 위한 read surface).
- 모든 import는 **public-safe re-check**가 있는 경계를 넘는다(upstream 경계를 맹목적으로 신뢰하지 않는다).

## 8. 개방형 통합 인터페이스 (seam을 설계; v1만 빌드)
미래의 source/sink가 재설계 없이 꽂힐 수 있도록 ports & adapters로 빌드:
- **ContentSourceAdapter:** v1 = CAW-02 import, CAW-03/skills-registry import; future stub = 내부 wiki,
  임의의 큐레이션된 bundle.
- **PublishSinkAdapter:** v1 = website build + REST API; future stub = 외부 docs host, package registry,
  syndication.
- Config 기반 registry + 문서화된 stub(CAW-03와 동일 패턴).

## 9. 내려야 할 결정 (각각 ADR로)
- 제품 surface(website + REST API + preview/admin) 및 콘텐츠 delivery(markdown vs JSON vs 둘 다).
- Content model(Tip/Skill/Workflow/Playbook/Example/Source/SafetyBoundary/Version) + 재사용/감사 가능한 메타데이터.
- **퍼블리싱 정책 & public-safe boundary**(internal-only vs public-safe; publish gate). ← 핵심(load-bearing)
- Import(ContentSource) + public-safe re-check; ports & adapters.
- Storage(md/MDX-first vs DB) + versioning model.
- Web stack + API stack.

## 10. Non-goals (v1)
- 콘텐츠를 처음부터 저작(CAW-04는 검증된 upstream 콘텐츠를 발행하며, 원본 노하우가 아니다).
- 검증되지 않았거나 public boundary를 넘는 것을 발행.
- 사용자 계정 / public을 위한 write API(읽기 전용 public surface; 큐레이터 전용 publish).
- knowledge repo(CAW-02)나 skills harness(CAW-03)가 되는 것.
- 검증된 upstream 항목이 존재하기 전에 라이브로 전환(지금 설계, 나중에 publish).

## 11. Guardrails (상속됨, 모든 제품)
- public을 향하는 출력에 회사 기밀 데이터 없음; **public 출력은 public-safe 소스에서만**(여기가 public surface이므로 — 가장 중요).
- public-source 리서치를 내부 Samsung/SAIT 주장과 절대 혼동하지 않는다.
- source, claim, evidence, 생성된 conclusion을 분리해서 유지; 생성된 요약은 evidence가 아니다.
- 광범위한 scaffolding보다 작은 vertical slice를 선호한다.
- 자동 생성은 proposal generation이다; 모든 publish는 Jimmy가 승인한다.
