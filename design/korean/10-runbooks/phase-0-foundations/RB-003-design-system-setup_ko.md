# RB-003: 디자인 시스템 (shadcn + Tailwind v4 + DTCG 토큰)

- Status: ready
- Phase: phase-0-foundations
- Depends on: [RB-000, RB-001]
- Implements design: [open-design-integration_ko.md](../../06-frontend/open-design-integration_ko.md), [../../01-decisions/ADR-0006-design-system-open-design_ko.md](../../01-decisions/ADR-0006-design-system-open-design_ko.md)
- Produces: `apps/web`의 Tailwind v4 + shadcn/ui 설정, `packages/design-tokens`의 DTCG 토큰 빌드

## Objective

"open design" 기반: W3C DTCG `*.tokens.json`으로 테마가 적용되는 code-as-source-of-truth 컴포넌트(shadcn/ui + Radix). 그리하여 모든 UI 런북이 타입이 지정되고 테마 가능한 라이브러리로부터 구성되며, 임시 스타일이 없다.

## Preconditions

- [ ] RB-000(apps/web 존재), RB-001(lint/format).

## Steps

1. **Do:** `apps/web`에 Tailwind v4를 추가한다. 테마용 CSS 변수를 연결한다.
   **Verify:** `cmd:` Tailwind 스타일이 적용된 테스트 요소와 함께 web 앱이 빌드된다.
2. **Do:** `packages/design-tokens`에서 기준 DTCG `*.tokens.json`(color, spacing, typography, radii)과 Tailwind 테마(CSS vars)로 가는 빌드 단계를 작성한다. Style Dictionary 또는 작은 커스텀 빌드를 사용한다(OQ-14 참조).
   **Verify:** `cmd:` 토큰 빌드가 테마를 산출한다. 토큰을 바꾸면 렌더링되는 값이 바뀐다.
3. **Do:** shadcn/ui를 초기화한다. [component-inventory_ko.md](../../06-frontend/component-inventory_ko.md)에서 사용하는 기본 primitive를 추가한다: `Button, Tabs, Dialog, Tooltip, Select, Resizable, ScrollArea, Badge, Toast`.
   **Verify:** `view:` 스크래치 페이지가 토큰으로 테마가 적용된 primitive들을 렌더링한다.
4. **Do:** 빌드 루프(tokens → theme → shadcn 컴포넌트)를 repo README에 문서화한다. generative-UI는 일회용(throwaway)으로만 표시한다.
   **Verify:** `view:` README가 source-of-truth = code + tokens임을 명시한다.

## Acceptance criteria

- [ ] Tailwind v4 + shadcn이 테마가 적용된 컴포넌트를 렌더링한다.
- [ ] DTCG 토큰 변경이 빌드를 통해 UI에 전파된다.
- [ ] inventory의 기본 primitive를 사용할 수 있다.

## Rollback / safety

설정 + 새 컴포넌트뿐이다. 설정을 되돌리면 롤백된다. generative-UI 스캐폴드를 source of truth로 commit하지 마라.

## Hand-off

UI 런북(phase-1/2)은 이 primitive + 토큰을 구성하여 화면을 만든다. 어떤 런북도 임시 스타일링을 만들어내지 않는다.
