# RB-003: Design system (shadcn + Tailwind v4 + DTCG tokens)

- Status: ready
- Phase: phase-0-foundations
- Depends on: [RB-000, RB-001]
- Implements design: [open-design-integration.md](../../06-frontend/open-design-integration.md), [../../01-decisions/ADR-0006-design-system-open-design.md](../../01-decisions/ADR-0006-design-system-open-design.md)
- Produces: Tailwind v4 + shadcn/ui setup in `apps/web`, DTCG token build in `packages/design-tokens`

## Objective

The "open design" foundation: code-as-source-of-truth components (shadcn/ui + Radix) themed from W3C DTCG
`*.tokens.json`, so every UI runbook composes from a typed, themeable library — no ad-hoc styles.

## Preconditions

- [ ] RB-000 (apps/web exists), RB-001 (lint/format).

## Steps

1. **Do:** Add Tailwind v4 to `apps/web`; wire CSS variables for theming.
   **Verify:** `cmd:` web app builds with a Tailwind-styled test element.
2. **Do:** In `packages/design-tokens`, author baseline DTCG `*.tokens.json` (color, spacing, typography, radii) and a build step → Tailwind theme (CSS vars). Use Style Dictionary or a small custom build (see OQ-14).
   **Verify:** `cmd:` token build emits the theme; changing a token changes the rendered value.
3. **Do:** Initialize shadcn/ui; add base primitives used by [component-inventory.md](../../06-frontend/component-inventory.md): `Button, Tabs, Dialog, Tooltip, Select, Resizable, ScrollArea, Badge, Toast`.
   **Verify:** `view:` a scratch page renders the primitives themed by the tokens.
4. **Do:** Document the build loop (tokens → theme → shadcn components) in the repo README; mark generative-UI as throwaway-only.
   **Verify:** `view:` README states the source-of-truth = code + tokens.

## Acceptance criteria

- [ ] Tailwind v4 + shadcn render themed components.
- [ ] A DTCG token change propagates to the UI via the build.
- [ ] Base primitives from the inventory are available.

## Rollback / safety

Config + new components only; revert config to roll back. Do not commit any generative-UI scaffold as source of truth.

## Hand-off

UI runbooks (phase-1/2) build screens by composing these primitives + tokens; no runbook invents ad-hoc styling.
