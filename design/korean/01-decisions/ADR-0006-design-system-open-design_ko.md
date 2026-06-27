# ADR-0006: 디자인 시스템 / "open design" — code-first shadcn/ui + Radix + Tailwind v4, W3C DTCG 토큰으로 테마링

- **Status:** proposed
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [SOURCE-BRIEF](../_meta/SOURCE-BRIEF_ko.md) (§1, §2, §3, §4, §5, §6)
  - [디자인 시스템 & open design (research)](../02-research/design-system-open-design_ko.md)
  - [캔버스 & 시각화 기술 (research)](../02-research/canvas-and-visualization-tech_ko.md)
  - [ADR-0003 프런트엔드 스택](./ADR-0003-frontend-stack_ko.md)
  - [ADR-0001 제품 표면(Product surface)](./ADR-0001-product-surface_ko.md)
  - [ADR-0004 캔버스 렌더링 기술](./ADR-0004-canvas-rendering_ko.md)
  - [ADR-0007 work-tree 변경 관리 모델](./ADR-0007-change-management-worktree_ko.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF_ko.md

## 목적

이 ADR은 CAW-01과 **디자인 시스템 스택**에 대해 **"open design"**이 구체적으로 무엇을 의미하는지, 그리고 디자인
artifact가 AI 빌더가 runbook으로부터 구현할 수 있는 빌드 가능한 컴포넌트가 되는 방법을 고정한다. 이 문서는 "open
design"의 해석, 컴포넌트 시스템, 토큰 포맷과 단방향 변환 파이프라인, 그리고 AI 빌드 통합을 결정한다. App Router/서버-
클라이언트 분리(ADR-0003)나 캔버스 렌더링 엔진(ADR-0004)을 결정하지는 **않는다**; 그것들이 끼워지는 **크롬(chrome)과
토큰 시스템**을 제공한다. 이는 SOURCE-BRIEF §2의 "open design + Next.js"를 구현하되, 내비게이션 바, 1:9 분할, 세
캔버스, work-tree를 재정의하지 않는다.

## 배경

우리가 충족해야 할 동인(forces)과 제약:

- **Brief §2:** UI는 Next.js 앱 위에서 **"open design"**(오픈소스 디자인 툴링, 정확한 도구는 여기서 TBD)으로 제작된다.
- **"Open design"은 명세가 부족하다.** 이는 여러 별개의 워크플로(오픈소스 디자인 *도구*, 오픈소스 *컴포넌트 시스템*,
  생성형 UI, 오픈 *프로세스*)를 한데 뭉뚱그린다. 주축(spine)을 선택하지 않으면 runbook을 빌드할 수 없다.
- **Brief §1 + §3–§6:** CAW-01은 마케팅 사이트가 아니라 **제어 평면(control plane)**이다 — 조밀하고, 조율되며,
  상태를 가진 표면: 내비게이션 바, 1:9 분할, 세 개의 조율된 캔버스, work-tree 패널, 상태 우선(status-first) 판독.
  지속되는 자산은 픽셀 시안이 아니라 **저장소 안의 타입이 있고 테마 가능한 컴포넌트 라이브러리**이다.
- **ADR-0001 빌드 모델:** 빌더는 **AI 에이전트**다. 디자인 시스템은 에이전트가 결정론적으로 설치하고 편집할 수 있어야
  하며, 많은 빌드 반복을 견디는 토큰 계약을 가져야 한다.
- **ADR-0003 경계:** 디자인 시스템은 **표현(presentational) 계층**(크롬, 토큰)에 머문다; 캔버스 간 조율은 디자인
  시스템이 아니라 Zustand 스토어 안의 앱 상태다.
- **Brief §11 가드레일:** 작은 수직 슬라이스를 선호하고, 재현 가능성을 유지하라. 토큰 파이프라인은 런타임 경로의 도구가
  아니라, 커밋되고 결정론적인 빌드 단계(Verify가 있는 runbook 단계)여야 한다.

## "open design" 분기 (선택 전에 명명하기)

| 해석 | 의미 | 주요 artifact | 무턱대고 선택할 때의 위험 |
|---|---|---|---|
| **A. 오픈소스 디자인 도구** | 화면을 그리고 토큰을 소유하는 FOSS Figma 대응물(Penpot) | `.tokens.json` + 스펙 | 테이블/그래프 UI에 대한 디자이너 왕복 오버헤드 |
| **B. 디자인 시스템으로서의 오픈소스 컴포넌트 시스템** | "디자인"이 *곧* 코드(shadcn/ui + Radix + Tailwind) | `components.json` + 토큰 CSS + 컴포넌트 파일 | 비개발자에게 약한 시각적 스케칭 표면 |
| **C. 생성형 / "open" UI** | UI를 자연어로 기술하여 생성(OpenUI, v0 스타일) | 프롬프트 + 생성된 JSX | 표류(drift), 지속적 토큰 계약 부재, 라이선스/유지보수 공백 |
| **D. "Open design" = 오픈 *프로세스*** | 스펙, ADR, 토큰이 모두 git에 존재 | 마크다운 스펙 + 토큰 파일 | 도구가 아님; A/B/C와 직교 |

## 결정

**B를 주축으로, A를 선택적 토큰/시각 피더로, D를 작업 프로세스로, C를 스캐폴딩 가속제로만 채택한다.**

> **CAW-01의 "open design" = 소스 오브 트루스가 저장소 안의 코드인 오픈소스, 토큰 주도 디자인 시스템 —
> shadcn/ui + Radix + Tailwind v4 — 이며 W3C DTCG `*.tokens.json`으로 테마링되고, 선택적으로 Penpot에서
> 작성되며, shadcn(및 선택적으로 Penpot) MCP 서버를 통해 AI 에이전트가 빌드한다. 생성형 UI는 일회성
> 스캐폴딩 스파이크이며, 결코 소스 오브 트루스가 아니다.**

근거: 조밀한 제어 평면에서 지속되는 자산은 AI 빌더가 조합하고 편집하는, 타입이 있고 테마 가능한 컴포넌트 라이브러리이지
픽셀 시안이 아니다. 우리는 오픈 시각 도구와 공유 토큰 어휘를 유지하되, 마스터가 아닌 **피더(feeder)**로 둔다.

### 1. 컴포넌트 시스템 — shadcn/ui + Radix + Tailwind v4

| 계층 | 선택 | 역할 |
|---|---|---|
| 컴포넌트 시스템 | **shadcn/ui** (소유 소스, 저장소에 복사) | 편집 가능하고 버전 관리되는 컴포넌트 라이브러리 |
| 프리미티브 | **Radix UI** | 조밀한 UI를 위한 접근성·키보드 정확성을 갖춘 상호작용 |
| 스타일링 | **Tailwind v4 + CSS 변수** | 토큰 싱크(sink); 테마링 + 밀도(density) |
| 조밀한 데이터 | **TanStack Table + TanStack Virtual** | 테이블, 긴 work-tree |

이것이 주축인 이유:

- **소유권이 AI 빌더에 맞는다.** shadcn/ui는 컴포넌트 **소스를 저장소에 복사**(불투명한 npm 의존성이 아님)하므로,
  에이전트는 라이브러리 props와 씨름하는 대신 소유한 버전 관리 소스를 편집한다.
- **일급 AI/MCP 통합.** shadcn은 MCP 서버를 제공하여 에이전트가 소스를 탐색/검색/조회하고 레지스트리 항목을
  결정론적으로 설치할 수 있게 한다 — 환각된 props를 제거한다. 이것이 ADR-0001 빌드 모델에 가장 중요한 속성이다.
- **Radix = 조밀한 UI를 위한 a11y + 올바른 상호작용.** 메뉴, 다이얼로그, 팝오버, 컨텍스트 메뉴, 리사이즈 가능한
  패널, 툴팁, 스크롤 영역 — 제어 평면 크롬 — 이 우리가 재발명해서는 안 되는 키보드/포커스/ARIA 시맨틱과 함께 온다.
  조밀한 운영자 도구는 키보드 내비게이션으로 흥하고 망한다.
- **Tailwind v4 + CSS 변수 = 토큰 싱크.** shadcn 테마링은 CSS 변수 기반이다(`--background`, `--primary`,
  `--radius` 같은 시맨틱 토큰); `components.json`의 `baseColor`가 테마를 시딩한다. 이것이 정확히 DTCG 토큰이
  안착하는 곳이다.
- **레지스트리가 조합된다.** `components.json`에 여러 레지스트리를 구성하여 `shadcn build`로 조합할 수 있어, 베이스를
  fork하지 않고 data-grid / chart / tree / panel 레지스트리를 추가한다.

베이스 shadcn을 넘어서는 제어 평면 빌딩 블록(소유하거나 고정된 레지스트리에서 가져옴): work-tree 패널
(Radix tree + TanStack Virtual), 조밀한 run/metric 테이블(TanStack Table + shadcn 셀), 리사이즈 가능한 1:9
분할과 중첩 패널(shadcn `resizable` / react-resizable-panels), 상태/증거 표시기(shadcn `badge`/`progress` +
시맨틱 상태 토큰). **Canvas 1/2/3 내부는 ADR-0004의 엔진이 렌더링하며**, 디자인 시스템이 하지 않는다 — 이 ADR은
그것들 주변의 크롬과 토큰만 고정한다.

### 2. 토큰 포맷 & 파이프라인 — DTCG, 단방향, 저장소가 소스 오브 트루스

- **W3C DTCG `*.tokens.json` (2025.10 안정 버전)**이 교환 포맷이다 — 벤더 중립 JSON, `$` 접두 속성. 이것이 단일
  공유 어휘이며 `design/tokens/`에 커밋된다. **Penpot이 폐기되더라도 `*.tokens.json` 파일은 권위 있게 남으며 손으로
  편집 가능하다.**
- **Style Dictionary 4**(또는 Penpot Tailwind export 플러그인 — 하나를 고정, 미해결 질문 참조)가 CSS 커스텀 속성
  (`:root` / `.dark`)과 Tailwind v4 `@theme` 구성을 방출하는 **커밋된 변환(transform)**이다. 이는 런타임 의존성이
  **아니라** 결정론적 빌드 스크립트(Verify가 있는 runbook 단계)다.
- **컴포넌트는 원시 값이 아니라 시맨틱 토큰을 참조한다.** `--primary`, `--surface-2`, `--density-row-h` 등이므로
  테마/밀도 변경이 한 곳에서 일어난다.
- **AI 빌더는 색상/간격을 인라인으로 절대 발명하지 않는다.** runbook은 지시한다: 토큰을 가져오기 → shadcn 컴포넌트
  설치 → 시맨틱 변수에 연결.

```
 Penpot (optional visual layer)
   │  export DTCG tokens (.tokens.json)        ← W3C DTCG 2025.10 stable
   ▼
 design/tokens/*.tokens.json   (committed; the shared vocabulary, source of truth)
   │  Style Dictionary 4 (committed transform; deterministic)
   ▼
 app/globals.css (:root/.dark CSS vars) + Tailwind v4 @theme
   │  shadcn components reference CSS vars
   ▼
 shadcn/ui components in repo ── consumed by ──► Next.js shell, panels, canvas chrome
   ▲
   │  AI builder installs/edits via shadcn MCP (+ reads design intent via Penpot MCP)
```

### 3. 제어 평면에 필요한 토큰 그룹 (마케팅 기본값이 아님)

- **밀도 척도(Density scale)**를 일급 토큰 그룹으로(`--density-row-h`, 컴팩트 패딩, 폰트 크기) — 마케팅 기본값은
  tree/table 위주 화면에 너무 헐겁기 때문에, 실제 work-tree/table 콘텐츠에 맞추어 명시적으로 작성한다.
- **시맨틱 상태 토큰 세트**(`--status-ok / warn / error / stale / running / blocked`)를 **한 번** 정의하여
  Control Panel, work-tree 행, 캔버스 오버레이 전반에서 재사용한다 — 이것이 brief §1의 "챗봇이 아닌 제어 평면"
  정직성 표면(run 상태, 증거 완전성, 블로커, artifact 준비도)의 시각적 주축이다.

### 4. 오픈소스 시각 도구 — Penpot (선택적 피더, 비차단)

- **Penpot 사용처:** 토큰 시스템(색상/간격/반경/타이포그래피/밀도)과 셸의 **저충실도 레이아웃 탐색**(내비게이션 바,
  1:9 분할, 패널 크롬, work-tree 행). DTCG JSON으로 export하여 커밋한다.
- **Penpot 비사용처:** Canvas 1/2/3 내부의 픽셀 완벽 시안 — 이것들은 런타임 계산되는 노드 그래프와 3D 하드웨어
  계층이며(ADR-0004), 정적으로 그리는 것은 낭비다.
- **Penpot은 선택적이며 비차단이다.** 세워지지 않더라도 시스템은 손으로 작성한 코드 측 DTCG 토큰으로 여전히
  작동한다. Penpot의 MCP 서버는 에이전트가 스크린샷에서 추측하는 대신 프레임의 구조/토큰을 직접 읽게 할 수 있다.

### 5. 생성형 UI 정책

OpenUI / v0 스타일 생성형 UI는 **일회성 스캐폴딩 스파이크로만** 허용된다("work-tree 패널의 후보 레이아웃을 보여줘").
그 출력은 **shadcn 컴포넌트로 재구축**되며 **소스 오브 트루스로 절대 커밋되지 않는다** — 지속적 토큰 계약 부재, 표류,
라이선스/유지보수 변동성이 제어 평면의 주축으로 부적합하게 만든다.

### 검토한 선택지 (컴포넌트 계층 요약)

| 옵션 | 장점 | 단점 | 적합성 |
|---|---|---|---|
| **shadcn/ui + Radix + Tailwind v4** | 소유 소스, MCP 설치, a11y, CSS 변수 토큰, 조합 가능한 레지스트리 | Tailwind 장황함; 복사된 소스를 우리가 유지보수 | **선택** |
| Radix Themes (사전 구축) | 소유할 것이 적고 일관된 테마 | 조밀한 레이아웃에 대한 제어가 적음; 더 무거운 의견 | 보통 |
| Mantine / Chakra / MUI | 배터리 포함 데이터 컴포넌트 | 런타임 의존성, DTCG 네이티브가 아닌 테마, 에이전트 편집이 어려움 | 보통–나쁨 |
| OpenUI / 생성형 UI | 빠른 탐색 | 지속적 계약 부재, 표류, 라이선스 변동성 | 스파이크 전용 |
| 직접 제작 + headless만 | 최대 제어 | 가장 느림; shadcn 재발명 | 나쁨(시간) |

## 결과(Consequences)

**쉬워지는 것:**
- AI 빌더가 shadcn MCP 서버를 통해 소유한 컴포넌트를 결정론적으로 설치/편집한다(ADR-0001 빌드 모델).
- 단일 DTCG 토큰 계약이 어디서나 테마 + 밀도 + 상태를 구동한다; 한 번의 변경으로 앱 전체가 재테마링된다.
- Radix가 접근성/키보드 정확성을 공짜로 제공한다 — 조밀한 운영자 도구에 필수적이다.
- 토큰 파이프라인이 CI에서 재현 가능하다(Verify 단계가 있는 커밋된 Style Dictionary 빌드).

**어려워지는 것 / 비용:**
- 복사된 shadcn 소스를 우리가 소유하고 유지보수한다; Tailwind 클래스 장황함은 실재한다.
- 밀도 토큰 척도와 상태 토큰 세트를 의도적으로 작성해야 한다(추측이 아니라 실제 콘텐츠에 맞춰 측정된 숫자).
- 변환 도구 하나를 고정해야 하고(Style Dictionary 4 대 Penpot 플러그인) Tailwind v4 `@theme` 동등성을 위해
  버전 안정적으로 유지해야 한다.
- 서드파티 shadcn 호환 레지스트리는 유지보수/라이선스 품질이 제각각이므로 고정해야 한다.

**후속 작업(runbook):**
- `RB-0xx-tokens-and-theme`: `design/tokens/*.tokens.json`(DTCG) 생성, Style Dictionary 4 설치,
  `globals.css` CSS 변수 + Tailwind v4 테마 방출; 밀도 + 상태 토큰 그룹 정의. *Verify:* 변환이 결정론적으로
  실행됨; `:root`/`.dark` 변수가 존재함.
- `RB-0xx-shadcn-bootstrap`: shadcn 초기화(`components.json`, `baseColor`), 토큰에 연결, 베이스 프리미티브
  설치(button, dialog, menu, popover, tooltip, scroll-area, resizable, tabs, badge, progress).
  *Verify:* 컴포넌트가 토큰으로 렌더링됨.
- `RB-1xx-app-shell`: 내비게이션 바(Simulation / Module Design / User / Setting) + 1:9 리사이즈 가능 분할.
  *Verify:* 레이아웃 비율 + 키보드 내비게이션.
- `RB-1xx-work-tree-panel`: 상태 토큰을 사용하는 work-tree 컴포넌트(Radix tree + TanStack Virtual, 항목별 +
  전체 저장). *Verify:* 긴 트리 성능 + 저장 컨트롤.
- (선택, 호스팅에 차단됨) `RB-0xx-penpot-token-sync`: Penpot + MCP를 세우고 DTCG export, 단방향 동기화 문서화.
- Canvas 1/2/3 크롬은 동일한 토큰 세트를 소비한다; 렌더링 엔진은 ADR-0004에서 결정.

## 미해결 질문 / 재검토 트리거

- `TODO(open-question: open-design-interpretation)` **B-주축 + A-피더**가 소유자가 "open design"으로 의미하는
  바인지, 아니면 Penpot을 *마스터*(A-주축)로 두고 거기서 코드를 생성하길 원하는지 확정. 이는 Penpot이 차단인지
  선택인지를 뒤집는다.
- `TODO(open-question: penpot-hosting)` Penpot 자체 호스팅(Docker), penpot.app 사용, 또는 Penpot을 건너뛰고
  DTCG를 손으로 작성.
- `TODO(open-question: token-transform-tool)` 정식 변환으로 Style Dictionary 4 대 Penpot Tailwind export
  플러그인 — 하나를 고르고 버전 고정; Tailwind v4 `@theme` 동등성 검증.
- `TODO(open-question: density-scale)` 실제 work-tree/table 콘텐츠에 맞춰 측정된 구체적 컴팩트 밀도 값(행 높이,
  패딩, 폰트 크기).
- `TODO(open-question: registry-set)` 신뢰하고 고정할 서드파티 shadcn 호환 레지스트리(차트, data-grid, tree,
  패널).
- `TODO(open-question: mcp-in-ci)` AI 빌더가 shadcn/Penpot MCP를 대화형으로만 쓰는지, 아니면 재현 가능한 CI
  빌드를 위해 비-MCP 스크립트 가능 경로(순수 `shadcn` CLI + 커밋된 토큰)도 필요한지.
- **재검토 트리거:** 생성형 UI 출력이 직접 커밋되면 이는 이 ADR을 위반한다 — shadcn으로 재구축하거나 결정을
  수정하라.
