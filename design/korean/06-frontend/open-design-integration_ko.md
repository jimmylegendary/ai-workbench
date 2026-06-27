# Open-Design 통합 — CAW-01

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [component-inventory.md](./component-inventory_ko.md), [../01-decisions/ADR-0006-design-system-open-design.md](../01-decisions/ADR-0006-design-system-open-design_ko.md), [../02-research/design-system-open-design.md](../02-research/design-system-open-design_ko.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## 목적

"open design"을 구체화한다. 즉, 오픈소스이며 토큰 기반인 디자인 시스템이 AI가 구축한 Next.js 코드베이스에 어떻게 공급되는지를 다룬다.
이에 대한 결정은 [ADR-0006](../01-decisions/ADR-0006-design-system-open-design_ko.md)이며, 이 문서는 실제 동작하는 통합을 다룬다.

## 정의 (ADR-0006에서)

> CAW-01에서의 "open design" = 오픈소스이며 토큰 기반인 디자인 시스템으로, **source of truth는 repo 내의 코드**이다
> — **shadcn/ui + Radix + Tailwind v4** — 이는 **W3C DTCG `*.tokens.json`**으로 테마가 지정되고, 선택적으로
> **Penpot**에서 작성되며, **shadcn(및 선택적으로 Penpot) MCP 서버**를 통해 AI 에이전트가 구축한다. Generative UI(생성형 UI)는
> 일회성 스캐폴딩 spike일 뿐이며, 결코 source of truth가 아니다.

## 토큰 흐름

```
Penpot (optional visual authoring)
   └─► design-tokens/*.tokens.json  (W3C DTCG)   ← source of truth for visual values
            └─► build step ─► Tailwind v4 theme (CSS vars)
                     └─► shadcn/ui + Radix components consume the theme
                              └─► app components (component-inventory.md)
```

- **토큰**(`packages/design-tokens`)은 지속 가능하고 diff 가능한 시각적 계약(contract)이다.
- 컴포넌트는 타입이 지정된 React(shadcn/Radix)이며, 테마 적용이 가능하고 AI로 구축/편집이 가능하다 — 밀도 높은 컨트롤 플레인을 위한
  지속 가능한 자산이다(픽셀 단위 컴포지션이 아님).

## AI 빌더를 위한 빌드 루프

1. 토큰을 작성/조정한다 (Penpot → DTCG, 또는 DTCG를 직접 편집).
2. **shadcn MCP**를 사용해 컴포넌트를 코드베이스에 스캐폴드/추가한다.
3. 인벤토리에 있는 컴포넌트로 앱 컴포넌트를 구성한다 ([component-inventory.md](./component-inventory_ko.md)).
4. Generative UI는 레이아웃을 한 번 spike하는 데 사용한 뒤 폐기할 수 있다 — 결코 source of truth로 커밋하지 않는다.

## 컨트롤 플레인에 대한 적합성

이 UI는 밀도 높고 기술적이다(nav bar, 1:9 레이아웃, 세 개의 캔버스, work-tree 패널). 마케팅 사이트가 아니므로
그 가치는 타입이 지정되고 테마 적용이 가능한 컴포넌트 라이브러리 + 토큰에 있으며, 이는 정확히 이 스택이 제공하는 것이다.

## 미해결 질문

- v1에서 Penpot을 실제로 사용할지, 아니면 DTCG를 직접 손으로 작성할지 — 손으로 작성하는 DTCG로 기우는 중; TODO(open-question).
- 정확한 DTCG→Tailwind 빌드 도구 (Style Dictionary vs 커스텀) — TODO(open-question).

## 런북에 대한 시사점

Phase-0 디자인 시스템 런북은 Tailwind v4 + shadcn + DTCG 토큰 빌드를 설정한다. 모든 UI 런북은 인벤토리에서 구성하며,
임시방편(ad-hoc) 스타일을 만들어내지 않는다.
