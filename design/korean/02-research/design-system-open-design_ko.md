# 디자인 시스템 & "오픈 디자인(open design)"

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [ADR-0006: 디자인 시스템 / "오픈 디자인" 도구 선택](../01-decisions/ADR-0006-design-system-open-design_ko.md)
  - [ADR-0003: 프런트엔드 스택 (Next.js)](../01-decisions/ADR-0003-frontend-stack_ko.md)
  - [ADR-0004: 캔버스 렌더링 기술](../01-decisions/ADR-0004-canvas-rendering_ko.md)
  - [프런트엔드 디자인](../06-frontend/) · [CAW-01 컨트롤 플레인](../05-caw01-simulation-control-plane/)
  - [열린 질문](../08-research-plan/open-questions_ko.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF_ko.md

## 목적

이 문서는 "오픈 디자인"이 CAW-01에 대해 구체적으로 무엇을 의미해야 하는지 조사하고, AI 빌더가 런북으로부터 구현할 수 있는 디자인 시스템 스택을 권장한다. 이 문서는 (1) "오픈 디자인"이라는 용어의 모호성과 우리가 진행하는 주된 해석, (2) 오픈소스 디자인 도구(Penpot)와 디자인-투-코드 경로, (3) Next.js 컴포넌트 레이어(shadcn/ui + Radix + Tailwind vs OpenUI 및 대안), (4) 토큰/스펙이 디자인 도구에서 코드베이스로 흐르는 방식, (5) 마케팅 사이트가 아닌 조밀한 컨트롤 플레인 UI에 대한 적합성을 다룬다.

이 문서는 Next.js app-router/server-client 분할(그것은 [ADR-0003](../01-decisions/ADR-0003-frontend-stack_ko.md))도, 세 캔버스를 위한 캔버스 렌더링 엔진([ADR-0004](../01-decisions/ADR-0004-canvas-rendering_ko.md))도 결정하지 **않는다**. 이 문서는 [ADR-0006](../01-decisions/ADR-0006-design-system-open-design_ko.md)에 기록되는 구속력 있는 결정으로 이어진다.

---

## 1. "오픈 디자인"의 모호성 — 선택하기 전에 갈림길의 이름을 붙여라

오너는 디자인이 "오픈 디자인" + Next.js로 수행될 것이라고 말했다. 이 표현은 충분히 명세되지 않았고 여러 별개의 워크플로를 하나로 뭉뚱그린다. 우리는 하나를 **주된 척추**로 골라야 하며 나머지는 선택적 입력으로 취급해야 한다. 그렇지 않으면 런북을 빌드할 수 없다.

| 해석 | 실제로 의미하는 바 | 주된 아티팩트 | 맹목적으로 선택할 때의 위험 |
|---|---|---|---|
| **A. 오픈소스 디자인 도구** | FOSS Figma 등가물(Penpot)을 사용해 화면을 그리고 토큰을 소유 | `.tokens.json` + 컴포넌트 스펙 | 대부분 테이블/그래프인 UI에 대한 디자이너 도구 왕복 오버헤드 |
| **B. 디자인 시스템으로서의 오픈소스 컴포넌트 시스템** | "디자인"이 코드 컴포넌트 라이브러리(shadcn/ui + Radix + Tailwind) 자체 — 코드로 디자인 | `components.json` + `globals.css` 토큰 + 컴포넌트 파일 | 시각 디자인 표면이 약함; 비개발자가 레이아웃 스케치하기 어려움 |
| **C. 생성형 / "오픈" UI** | UI를 자연어로 기술하고 생성(OpenUI, v0 스타일) | 프롬프트 + 생성된 JSX | 출력 드리프트, 지속적 토큰 계약 없음, 라이선스/유지보수 공백 |
| **D. "오픈 디자인" = 열린 *프로세스*** | 공개된 디자인: 스펙, ADR, 토큰 모두 git 저장소에 | Markdown 스펙 + 토큰 파일 | 도구가 전혀 아님; A/B/C와 직교 |

**우리가 진행하는 주된 해석 (B를 척추로, A를 토큰/시각 원천으로, D를 프로세스로):**

> **"오픈 디자인" = 진실의 원천이 저장소 내 코드인 오픈소스, 토큰 주도 디자인 시스템(shadcn/ui + Radix + Tailwind v4)이며, Penpot은 동일한 코드로 W3C 디자인 토큰을 내보내는 선택적 오픈소스 시각 레이어이다.** 생성형 UI(C)는 스캐폴딩 가속제일 뿐 절대 진실의 원천이 아니다.

근거: CAW-01은 마케팅 사이트가 아니라 **컨트롤 플레인**이다. 그 가치는 조밀하고 협응되며 상태를 가진 표면(nav bar, 1:9 분할, 세 캔버스, 작업 트리 패널)이다. 그 부류의 UI에 대해 지속적인 자산은 AI 빌더가 조합하는 **코드베이스 내의 타입 지정되고 테마 가능한 컴포넌트 라이브러리**이지 픽셀 컴프(comp)가 아니다. 우리는 여전히 레이아웃 탐색과 공유 토큰 어휘를 위한 오픈 시각 도구를 원하므로 Penpot은 유지하되 — 마스터가 아닌 *공급자(feeder)*로 둔다.

A-척추, C-척추, 도구 대체에 대한 대안은 열린 질문(§7)으로 기록되고 [ADR-0006](../01-decisions/ADR-0006-design-system-open-design_ko.md)에서 결정된다.

---

## 2. 오픈소스 디자인 도구 레이어 — Penpot

[Penpot](https://penpot.app)은 성숙한 오픈소스 Figma 대안이자 가장 방어 가능한 "오픈 디자인 도구" 선택이다. 두 가지 속성이 이를 코드 우선 시스템의 올바른 공급자로 만든다:

- **네이티브 W3C 디자인 토큰.** Penpot은 W3C Design Tokens Community Group (DTCG) 포맷을 네이티브로 구현한 첫 디자인 도구이며, 토큰이 JSON으로 import/export된다 ([Penpot tokens docs](https://help.penpot.app/user-guide/design-systems/design-tokens/)). DTCG 명세는 **첫 안정 버전(2025.10)**에 도달했다 — `$` 접두 속성과 `.tokens`/`.tokens.json` 파일을 사용하는 벤더 중립 JSON 포맷 ([W3C DTCG announcement](https://www.w3.org/community/design-tokens/2025/10/28/design-tokens-specification-reaches-first-stable-version/)). 이것이 디자인과 코드가 하나의 어휘를 공유하게 하는 교환 계약이다.
- **MCP 서버 (2025/2026).** Penpot은 디자인 데이터를 AI 클라이언트에 읽기 **및** 쓰기로 노출하는 공식 MCP 서버를 출시하여, 디자인-투-코드, 코드-투-디자인, 디자인 시스템 인식 컴포넌트 생성을 가능하게 했다 ([Penpot MCP](https://github.com/penpot/penpot-mcp), [Smashing Magazine](https://www.smashingmagazine.com/2026/01/penpot-experimenting-mcp-servers-ai-powered-design-workflows/)). 이것이 중요한 이유는 우리 빌더가 AI 에이전트이기 때문이다: 스크린샷으로 추측하는 대신 MCP를 통해 Penpot 프레임의 구조/토큰을 읽을 수 있다.

**Penpot을 실제로 어떻게 쓰는가 (그리고 어떻게 안 쓰는가):**

- **사용처:** 토큰 시스템(color, spacing, radius, typography, density scale), 그리고 셸(nav bar, 1:9 분할, 패널 크롬, 작업 트리 행)의 *저충실도 레이아웃 탐색*. 토큰을 DTCG JSON으로 내보내 저장소에 커밋.
- **사용하지 않을 곳:** Canvas 1/2/3 내부의 픽셀 완벽 컴프. 그것들은 노드 그래프와 3D 하드웨어 계층([ADR-0004](../01-decisions/ADR-0004-canvas-rendering_ko.md))으로, 레이아웃이 그려지는 것이 아니라 런타임에 계산된다. 정적 도구로 그것들을 디자인하는 것은 낭비된 노력이다.
- **Penpot은 선택 사항이지 차단 요소가 아니다.** Penpot이 세워지지 않아도 디자인 시스템은 여전히 코드 측 토큰(§4)으로 작동한다. Penpot 셀프 호스팅은 열린 질문(§7)이다.

### 오픈소스 디자인-투-코드 경로 (평가됨)

| 경로 | 산출물 | CAW-01에 대한 판정 |
|---|---|---|
| Penpot MCP → 에이전트가 프레임/토큰을 읽음 → shadcn JSX 작성 | 구조화된 토큰 인식 컴포넌트 | 셸을 위한 **주된** 보조 경로 |
| Penpot "inspect"/코드 내보내기(CSS/markup) | 원시 CSS/HTML 스니펫 | 참조용만; 컴포넌트로 붙여넣지 말 것 |
| OpenUI / 생성형 HTML→React | 일회성 JSX/HTML | 스캐폴딩 스파이크만(§3) |
| Figma-to-code 도구 | 해당 없음(독점) | 범위 밖 — "오픈"을 위반 |

---

## 3. Next.js 컴포넌트 레이어

### 권장: shadcn/ui + Radix + Tailwind v4

이것이 척추이다. 컨트롤 플레인에 특화된 정당화:

- **소유권 모델이 AI 빌더에 맞는다.** shadcn/ui는 import하는 npm 의존성이 아니다; CLI/레지스트리가 **컴포넌트 소스를 저장소에 복사**하므로 우리가 편집하고 버전 관리한다. 공식 레지스트리는 Radix 프리미티브 위에 구축되고 Tailwind로 스타일된 40개 이상의 기본 컴포넌트를 가진다 ([shadcn/ui](https://ui.shadcn.com/), [components.json](https://ui.shadcn.com/docs/components-json)). 소유한 소스를 수정하는 AI 빌더가 불투명한 라이브러리의 props와 씨름하는 것을 이긴다.
- **일급 AI/MCP 통합.** shadcn은 **MCP 서버**를 출시하여 에이전트가 자연어로 레지스트리 항목을 탐색, 검색, 소스 검색, 설치할 수 있게 한다 — 명시적으로 라이브 레지스트리 접근을 제공하여 "구식 지식이나 환각된(hallucinated) props를 제거"하기 위함 ([shadcn MCP](https://ui.shadcn.com/docs/mcp)). 이것이 우리 빌드 모델에서 가장 중요한 단일 속성이다: Penpot을 읽는 동일한 에이전트가 올바른 프리미티브를 결정론적으로 설치할 수 있다.
- **Radix = 조밀한 UI를 위한 접근성 + 올바른 상호작용.** 메뉴, 다이얼로그, 팝오버, 컨텍스트 메뉴, 크기 조절 패널, 툴팁, 스크롤 영역 — 컨트롤 플레인이 필요로 하는 모든 크롬 — 이 우리가 재발명하지 말아야 할 키보드/포커스 의미론을 가진 Radix 프리미티브로 처리된다.
- **Tailwind v4 + CSS 변수 = 토큰 싱크.** shadcn 테마는 CSS 변수 기반이다(`--background`, `--foreground`, `--primary` 같은 의미론적 토큰); `components.json`의 `baseColor`가 테마를 시드한다. 이곳이 정확히 DTCG 토큰이 도착하는 곳이다(§4).
- **레지스트리가 조합된다.** `components.json`에 여러 레지스트리를 구성하고 `shadcn build`로 조합할 수 있다(2026년 1월 기준 공식 인덱스에 ~149개 레지스트리). 베이스를 포크하지 않고 data-grid / chart / panel 레지스트리를 추가할 수 있다.

### 왜 OpenUI(또는 생성형 UI)를 척추로 하지 않는가

[OpenUI](https://github.com/wandb/openui) (W&B)와 Thesys "OpenUI Lang" 생성형 UI 표준은 실재하고 흥미롭지만, 런타임/빌드 타임에 프롬프트로부터 UI를 생성한다. 컨트롤 플레인에는 이것이 잘못된 고도(altitude)이다: 우리는 갓 생성된 마크업이 아니라 많은 빌드 반복을 견디는 **안정적이고 타입 지정되며 토큰에 묶인** 컴포넌트 계약이 필요하다. OpenUI는 **일회성 스캐폴딩 스파이크**("작업 트리 패널을 위한 후보 레이아웃을 보여줘")로 유용하며, 그 출력은 이후 shadcn 컴포넌트로 수작업 재구축된다 — 절대 진실의 원천으로 커밋되지 않는다.

### 컨트롤 플레인이 실제로 필요로 하는 컴포넌트 (기본 shadcn 너머)

이것들은 기본 shadcn이 완전히 다루지 않는 조밀한 UI 빌딩 블록이다; 빌더는 조합 가능한 레지스트리에서 가져오거나 직접 소유한다:

| 필요 | 권장 오픈 빌딩 블록 |
|---|---|
| 작업 트리 패널(트리, 항목별 저장) | Radix 기반 트리 + shadcn 프리미티브; 긴 트리에는 TanStack Virtual |
| 조밀한 표 형식 run/metric 표시 | TanStack Table (헤드리스) + shadcn 셀 |
| 크기 조절 가능 1:9 분할 & 중첩 패널 | shadcn `resizable` (react-resizable-panels) |
| Canvas 1 노드 그래프 | React Flow / xyflow ([ADR-0004](../01-decisions/ADR-0004-canvas-rendering_ko.md)에서 결정) |
| Canvas 3 3D HW 계층 | react-three-fiber / three.js ([ADR-0004](../01-decisions/ADR-0004-canvas-rendering_ko.md)) |
| 상태/증거 표시기 | shadcn `badge`/`progress` + 커스텀 의미론적 토큰 |

> 이것들은 완전성을 위해 나열된다; Canvas 1/2/3의 **렌더링** 결정은 [ADR-0004](../01-decisions/ADR-0004-canvas-rendering_ko.md)에 속한다. 이 문서는 그것들 주변의 *크롬과 토큰 시스템*만 고정한다.

### 컴포넌트 레이어 트레이드오프 표

| 옵션 | 장점 | 단점 | 적합성(컨트롤 플레인) |
|---|---|---|---|
| **shadcn/ui + Radix + Tailwind v4** | 소유 소스, MCP 설치, 접근성, CSS 변수 토큰, 조합 가능 레지스트리 | Tailwind 클래스 장황함; 복사된 소스를 우리가 유지 | **최선** |
| Radix Themes (사전 구축) | 소유할 것이 적음, 일관된 테마 | 조밀한 레이아웃에 대한 제어 적음; 무거운 의견 | 보통 |
| Mantine / Chakra / MUI | 모든 것 포함, 데이터 컴포넌트 | 런타임 의존성, 테마 시스템이 DTCG 네이티브 아님, 에이전트가 편집하기 어려움 | 보통–빈약 |
| OpenUI / 생성형 UI | 빠른 탐색 | 지속적 계약 없음, 드리프트, 라이선스/유지보수 편차 | 스파이크만 |
| 직접 구현 + 헤드리스(Ark/Radix만) | 최대 제어 | 가장 느림; shadcn 재발명 | 빈약(시간) |

---

## 4. 토큰 & 스펙 흐름: 오픈 디자인 도구 → Next.js + Tailwind/shadcn → AI 빌더

"오픈 디자인"을 실재하게 만드는 계약은 저장소를 진실의 원천으로 하는 **단방향, 파일 기반 토큰 파이프라인**이다. 어떤 도구도 런타임 경로에 있지 않다.

```
 Penpot (optional visual layer)
   │  export DTCG tokens (.tokens.json)        ← W3C DTCG 2025.10 stable
   ▼
 design/tokens/*.tokens.json   (committed; the shared vocabulary)
   │  Style Dictionary 4  (or Penpot Tailwind plugin)
   │   - emits CSS custom properties
   │   - emits Tailwind v4 @theme config
   ▼
 app/globals.css  (:root / .dark CSS variables)  +  tailwind theme
   │  shadcn components reference CSS vars (--background, --primary, --radius, density scale…)
   ▼
 shadcn/ui components in repo  ── consumed by ──►  Next.js app shell, panels, canvases chrome
   ▲
   │  AI builder installs/edits via shadcn MCP + reads design intent via Penpot MCP
```

이 흐름에 새겨진 핵심 결정:

- **DTCG JSON이 교환 포맷이다**, Penpot의 내부 포맷이 아니다. Penpot이 폐기되더라도 `*.tokens.json` 파일은 권위 있고 수작업 편집 가능하게 남는다.
- **Style Dictionary 4**(또는 Penpot Tailwind v3/v4 내보내기 플러그인)가 CSS 커스텀 속성과 Tailwind 설정을 모두 방출하는 변환 단계이다. 이 변환은 커밋된 빌드 스크립트라서 AI 빌더가 결정론적으로 다시 실행할 수 있다(Verify가 있는 런북 단계).
- **컴포넌트에는 원시 값이 아니라 의미론적 토큰.** 컴포넌트는 `--primary`, `--surface-2`, `--density-row-h` 등을 참조한다. 테마/밀도 변경이 한 곳에서 일어난다. 컨트롤 플레인은 일급 토큰 그룹으로 **density scale**(조밀한 간격)을 필요로 한다 — 마케팅 지향 기본값은 테이블/트리 중심 화면에 너무 헐겁기 때문에 명시적으로 저작된다.
- **AI 빌더는 절대 인라인으로 색상/간격을 발명하지 않는다.** 런북은 지시한다: 토큰을 가져오고, shadcn 컴포넌트를 설치하고, 의미론적 변수에 배선한다. 이것이 증거 사슬을 깨끗하게 유지하고 UI를 일관되게 유지한다.

---

## 5. 조밀한 컨트롤 플레인 스타일 기술 UI에 대한 적합성

브리프의 표면은 nav bar, 1:9 좌/우 분할, 세 개의 협응 캔버스, 작업 트리이다. 이는 웹사이트보다 IDE/관측 가능성(observability) 콘솔에 가깝다. 스택에 대한 함의:

- **여백보다 밀도.** 조밀한 density 토큰 그룹을 저작하고; shadcn의 기본 패딩을 오버라이드한다. 히어로 섹션이 아니라 작업 트리(많은 행)와 표 형식 표시에 대해 검증한다.
- **페이지 내비게이션이 아닌 협응된 상태.** 세 캔버스와 컨트롤 패널이 선택 상태와 작업 트리를 공유한다. 디자인 시스템은 *크롬*(패널, 리사이저, 메뉴, 배지)을 공급하고; *협응*은 앱 상태([ADR-0003](../01-decisions/ADR-0003-frontend-stack_ko.md))이다 — 디자인 시스템이 표현(presentational)에 머물도록 이 경계를 깨끗하게 유지한다.
- **상태 우선 시각 언어("챗봇이 아니라 컨트롤 플레인").** 토큰과 컴포넌트는 run 상태, 증거 완성도, 열린 질문, 차단 요소, 아티팩트 준비도를 표현해야 한다. **의미론적 상태 토큰 집합**(`--status-ok/warn/error/stale/running/blocked`)을 한 번 정의하고; 컨트롤 패널, 작업 트리 행, 캔버스 오버레이에 걸쳐 재사용한다.
- **Penpot의 가치는 한정되어 있다.** *셸과 패널 크롬* 탐색과 토큰 시스템에는 진정으로 유용하다. 런타임에 계산되는 캔버스 내부에는 거의 기여하지 않는다. 캔버스의 고충실도 컴프에 빌드를 게이트하지 말 것.
- **접근성/키보드.** 조밀한 운영자 도구는 키보드 내비게이션으로 흥하고 망한다; Radix 프리미티브가 포커스 관리와 ARIA 의미론을 공짜로 제공한다 — 생성형 출력보다 Radix 기반 척추를 선호할 강한 이유.

---

## 6. 권장 스택 (그 답)

| 레이어 | 선택 | 역할 |
|---|---|---|
| 시각 디자인 도구(선택) | **Penpot** (셀프 호스트 미정) | 레이아웃 탐색 + DTCG 토큰 저작; MCP/내보내기로 저장소에 공급 |
| 토큰 포맷 | **W3C DTCG `*.tokens.json` (2025.10)** | 단일 공유 어휘, 저장소 진실의 원천 |
| 토큰 변환 | **Style Dictionary 4** (또는 Penpot Tailwind 플러그인) | DTCG → CSS 변수 + Tailwind v4 `@theme` |
| 컴포넌트 시스템 | **shadcn/ui** (소유 소스) | 편집/버전 관리 가능한 컴포넌트 라이브러리 |
| 프리미티브 | **Radix UI** | 접근 가능하고 키보드 정확한 상호작용 |
| 스타일링 | **Tailwind v4 + CSS 변수** | 토큰 싱크; 테마/밀도 |
| 조밀한 데이터 | TanStack Table + TanStack Virtual | 테이블, 긴 작업 트리 |
| AI 빌드 통합 | **shadcn MCP** (+ **Penpot MCP**) | 에이전트를 위한 결정론적 설치/읽기 |
| 생성형 UI | OpenUI / v0 스타일 | **스파이크만**, 절대 진실의 원천 아님 |

**한 줄 결정:** 코드 우선 오픈 디자인 시스템 = shadcn/ui + Radix + Tailwind v4, W3C DTCG 토큰으로 테마됨(선택적으로 Penpot에서 저작), shadcn + Penpot MCP 서버를 통해 AI 에이전트가 빌드.

---

## 7. 열린 질문

([../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md)에 미러링.)

- `TODO(open-question: open-design-interpretation)` 오너가 "오픈 디자인"으로 의미하는 바가 **B-척추 + A-공급자**인지, 아니면 Penpot을 *마스터*(A-척추)로 두고 그로부터 코드를 생성하길 원하는지 확인. 이것이 Penpot이 차단 요소인지 선택 사항인지를 뒤집는다.
- `TODO(open-question: penpot-hosting)` Penpot을 셀프 호스트(Docker)할지, penpot.app을 쓸지, 아니면 Penpot을 완전히 건너뛰고 DTCG 토큰을 수작업으로 저작할지? 소규모 팀에 대한 셀프 호스팅 비용 대 이득은 미검증.
- `TODO(open-question: token-transform-tool)` Style Dictionary 4 vs Penpot Tailwind 내보내기 플러그인을 정규 변환으로 — 하나를 고르고 버전을 고정. Tailwind v4 `@theme`에 대한 동작 동등성은 미검증.
- `TODO(open-question: density-scale)` 조밀한 density 토큰 스케일과 그 구체 값(행 높이, 패딩, 폰트 크기)을 실제 작업 트리/테이블 콘텐츠에 대해 정의. 수치는 아직 측정되지 않음.
- `TODO(open-question: generative-ui-policy)` OpenUI/v0 생성형 스캐폴딩의 허용 범위 — 생성된 출력은 shadcn으로 재구축되고 커밋되지 않는다는 명시적 규칙.
- `TODO(open-question: registry-set)` 어떤 서드파티 shadcn 호환 레지스트리(charts, data-grid, tree, panels)를 신뢰하고 고정할지, 유지보수/라이선스 품질이 다양한 149개 이상의 레지스트리를 고려.
- `TODO(open-question: mcp-in-ci)` AI 빌더가 shadcn/Penpot MCP를 상호작용적으로만 사용할지, 아니면 재현 가능한 CI 빌드를 위해 비-MCP 스크립트 가능 경로(평범한 `shadcn` CLI + 커밋된 토큰)도 필요한지.

## 8. 런북에 대한 함의

이 문서는 다음 런북들을 이끈다(`../10-runbooks/` 아래에 작성될 예정):

- **`phase-0-foundations/RB-0xx-tokens-and-theme.md`** — `design/tokens/*.tokens.json`(DTCG) 생성, Style Dictionary 4 설치, `globals.css` CSS 변수 + Tailwind v4 테마 방출; 의미론적 상태 + density 토큰 그룹 정의. *Verify:* 변환이 결정론적으로 실행됨; `:root`/`.dark` 변수 존재.
- **`phase-0-foundations/RB-0xx-shadcn-bootstrap.md`** — shadcn 초기화(`components.json`, `baseColor`), `baseColor`/CSS 변수를 위 토큰에 배선, 기본 프리미티브(button, dialog, menu, popover, tooltip, scroll-area, resizable, tabs, badge, progress) 설치. *Verify:* 컴포넌트가 토큰으로 렌더링됨.
- **`phase-1-app-shell/RB-1xx-app-shell.md`** — nav bar(Simulation / Module Design / User / Setting)와 shadcn `resizable`을 사용한 1:9 크기 조절 분할 구축. *Verify:* 레이아웃 비율 + 키보드 내비게이션.
- **`phase-1-app-shell/RB-1xx-work-tree-panel.md`** — 상태 토큰을 사용한 작업 트리 컴포넌트(Radix tree + TanStack Virtual, 항목별 + 전체 저장 어포던스). *Verify:* 긴 트리 성능 + 저장 컨트롤.
- **([ADR-0004](../01-decisions/ADR-0004-canvas-rendering_ko.md) 런북으로 핸드오프)** — Canvas 1/2/3 크롬이 동일한 토큰 집합을 소비; 렌더링 엔진은 별도로 결정.
- **(선택) `phase-0-foundations/RB-0xx-penpot-token-sync.md`** — Penpot + MCP 세우기, DTCG 토큰 내보내기, 저장소로의 단방향 동기화 문서화. *Status:* penpot-hosting 열린 질문에 차단됨.

---

**출처:**
[Penpot design tokens](https://help.penpot.app/user-guide/design-systems/design-tokens/) ·
[W3C DTCG 2025.10 stable](https://www.w3.org/community/design-tokens/2025/10/28/design-tokens-specification-reaches-first-stable-version/) ·
[Design Tokens Format Module](https://www.designtokens.org/tr/drafts/format/) ·
[Penpot MCP server](https://github.com/penpot/penpot-mcp) ·
[Smashing: Penpot MCP](https://www.smashingmagazine.com/2026/01/penpot-experimenting-mcp-servers-ai-powered-design-workflows/) ·
[shadcn/ui](https://ui.shadcn.com/) ·
[shadcn components.json](https://ui.shadcn.com/docs/components-json) ·
[shadcn MCP server](https://ui.shadcn.com/docs/mcp) ·
[shadcn changelog (registries)](https://ui.shadcn.com/docs/changelog) ·
[OpenUI (W&B)](https://github.com/wandb/openui) ·
[OpenUI Lang (Thesys)](https://github.com/thesysdev/openui)
