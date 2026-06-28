# PRODUCT BRIEF — AI Tips / Skills 웹사이트 & REST API (CAW-04)

> **CAW-04**의 단일 진실 공급원(single source of truth). 모든 설계 문서 + 런북은 이 brief와 일관성을 유지해야 한다.
> 문서가 brief와 모순되면 brief가 이긴다. 미지의 사항은 `08-research-plan/open-questions.md`에 기록한다.

## 0. 단 하나의 굳은 제약
우리는 여기서 제품을 빌드하지 않는다. 우리는 AI 빌더가 실행할 상세 설계 + 빌드 지침(런북)을 작성한다 — 구체적인 기능,
방법론, 명명된 도구, 도구별 런북. 빌더가 코드를 작성한다.

## 1. 정체성 & 독립성
- **제품:** AI Tips / Skills 웹사이트 & REST API (CAW-04).
- **한 줄 요약:** **검증된** AI 활용 tips, skills, workflows, 재사용 가능한 운영 패턴을 퍼블리시하는 **공개 read/API
  표면** — 무작위 프롬프트 스니펫이 아니다.
- 6개로 이뤄진 `ai-workbench` 패밀리 내의 **독립적이고 standalone한 제품**. 자체 코어, 데이터, 배포를 가진다. **공유
  런타임 기반(substrate)이 없다.** 명시적 경계를 가로질러 검증된 콘텐츠를 **import**하고(CAW-02 knowledge, CAW-03 /
  skills registry) 웹사이트 + REST API를 **publish**한다.
- **위치:** **최종 퍼블리싱/read 레이어**. 콘텐츠를 만들어내서는 안 된다 — 내부 기반이 이미 검증한 것을 퍼블리시한다.
  (지금 설계하되, 콘텐츠는 upstream에 검증된 항목이 존재하면 라이브로 간다.)

## 2. 문제 & 가치
- **문제:** 검증된 AI 활용 실천이 내부에 갇혀 있다. 임시방편 공유는 기밀 노하우를 유출하거나 검증되지 않은 스니펫을
  퍼블리시한다.
- **가치의 단위:** provenance + safety boundary를 갖추고 web + API로 제공되는, **퍼블리시되고 버전이 매겨진 public-safe
  산출물** 하나 (Tip / Skill / Workflow / Playbook).
- **왜 분리하는가:** 퍼블리싱은 자체적인 관심사(public-safe gating, versioning, web/API delivery, audit)를 가지며 이는
  내부 제품 안에 살아서는 안 된다.

## 3. 사용자 & 주요 사용 사례
- **페르소나:** 외부 독자(web/API 소비자), 퍼블리케이션을 승인하는 내부 큐레이터(Jimmy), API를 통해 skills/workflows를
  가져오는 AI 에이전트.
- **주요 사용 사례:**
  1. CAW-02/CAW-03에서 검증된 Skill/Workflow를 import → **public-safe gate** → 퍼블리시(버전 매김).
  2. 독자가 웹사이트를 둘러보고, 에이전트가 동일한 콘텐츠를 REST(markdown 또는 JSON)로 가져온다.
  3. 퍼블리시된 항목 업데이트 → 새로운 **Version**. 이전 버전들도 계속 주소 지정 가능하게 유지된다.
  4. 경계가 바뀌면 항목을 unpublish / redact 한다.
  5. Audit: 퍼블리시된 모든 항목은 검증된 내부 소스 + safety review로 추적된다.

## 4. 제품 표면
- **주요:** **공개 웹사이트**(browse/read) + **REST API**(프로그램적 read). 콘텐츠는 **markdown 및/또는 JSON**으로
  제공된다(ADR에서 결정).
- **보조:** publish gate를 위한 내부 **preview/admin** 표면(큐레이터 승인).
- 모든 표면 뒤에 하나의 제품 코어. 다른 제품과 공유 기반 없음.

## 5. 코어 도메인 (핵심)
- **엔티티:** `Tip, Skill, Workflow, Playbook, Example, Source, SafetyBoundary, Version`.
- **재사용 가능 + 감사 가능한 메타데이터:** 각 Skill/Workflow는 재사용 및 감사가 가능하도록 충분한 메타데이터를 지닌다
  (inputs/outputs, preconditions, provenance, safety boundary, version).
- **Publish gate:** (a) 검증된 내부 소스와 (b) **public-safe** safety boundary 없이는 아무것도 퍼블리시되지 않는다.
  *검증되지 않았거나 회사 기밀인 노하우는 절대 퍼블리시되지 않는다.*
- **Versioning:** 콘텐츠는 버전이 매겨진다. 퍼블리시된 버전은 불변 + 주소 지정 가능하다.

## 6. 데이터
- CAW-04의 자체 콘텐츠 저장소. 방향: 퍼블리시된 콘텐츠의 진실 공급원으로서의 **markdown/MDX-first (git)** + API를 위한
  인덱스(패밀리와 일관). 대용량 에셋은 path로. ADR에서 결정.
- 모든 항목은 `boundary`(퍼블리시된 것은 public only) + provenance(내부 소스 ref) + version을 지닌다.

## 7. Import / export 경계 (다른 독립 제품으로)
- **CAW-02에서 import:** 검증된 knowledge(인용된 tips/insights)를 후보 콘텐츠로.
- **CAW-03 / skills registry에서 import:** 검증된 Skills/Workflows/Playbooks.
- **Exports:** 공개 웹사이트 + REST API(세계 / 다른 에이전트를 위한 read 표면).
- 모든 import는 **public-safe 재검사**를 거쳐 경계를 넘는다(upstream 경계를 절대 맹목적으로 신뢰하지 않는다).

## 8. 개방형 통합 인터페이스 (이음매를 설계하되 v1만 빌드)
향후 소스/싱크가 재설계 없이 꽂힐 수 있도록 ports & adapters로 빌드한다:
- **ContentSourceAdapter:** v1 = CAW-02 import, CAW-03/skills-registry import. 향후 스텁 = 내부 wiki,
  임의의 큐레이션된 번들.
- **PublishSinkAdapter:** v1 = 웹사이트 빌드 + REST API. 향후 스텁 = 외부 docs 호스트, 패키지 레지스트리,
  syndication.
- 설정 기반 레지스트리 + 문서화된 스텁(CAW-03과 동일한 패턴).

## 9. 내려야 할 결정 (각각 ADR을 가짐)
- 제품 표면(웹사이트 + REST API + preview/admin)과 콘텐츠 delivery(markdown vs JSON vs 둘 다).
- Content model(Tip/Skill/Workflow/Playbook/Example/Source/SafetyBoundary/Version) + 재사용/감사 가능 메타데이터.
- **퍼블리싱 정책 & public-safe boundary**(internal-only vs public-safe; publish gate). ← load-bearing
- Import(ContentSource) + public-safe 재검사; ports & adapters.
- Storage(md/MDX-first vs DB) + versioning 모델.
- Web stack + API stack.

## 10. 비목표 (v1)
- 콘텐츠를 처음부터 저작하는 것(CAW-04는 검증된 upstream 콘텐츠를 퍼블리시하지, 독자적 노하우를 만들지 않는다).
- 검증되지 않았거나 public 경계 위에 있는 어떤 것의 퍼블리시.
- 사용자 계정 / 공개용 write API(읽기 전용 공개 표면; 큐레이터 전용 publish).
- knowledge 리포(CAW-02)나 skills harness(CAW-03)가 되는 것.
- 검증된 upstream 항목이 존재하기 전에 라이브로 가는 것(지금 설계, 나중에 publish).

## 11. 가드레일 (상속됨, 모든 제품 공통)
- 공개 출력물에 기밀 회사 데이터 금지. **public 출력은 public-safe 소스에서만**(여기는 공개 표면이므로 가장 중요).
- 공개 소스 연구를 내부 Samsung/SAIT 주장과 절대 혼동하지 않는다.
- 소스, 주장, 증거, 생성된 결론을 분리 유지한다. 생성된 요약은 증거가 아니다.
- 넓은 스캐폴딩보다 작은 수직 슬라이스를 선호한다.
- 자동 생성은 제안 생성이다. 모든 publish는 Jimmy가 승인한다.
