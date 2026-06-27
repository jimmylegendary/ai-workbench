# Open-Design Integration — CAW-01

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [component-inventory.md](./component-inventory.md), [../01-decisions/ADR-0006-design-system-open-design.md](../01-decisions/ADR-0006-design-system-open-design.md), [../02-research/design-system-open-design.md](../02-research/design-system-open-design.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## Purpose

Make "open design" concrete: how an open-source, token-driven design system feeds an AI-built Next.js codebase.
The decision is [ADR-0006](../01-decisions/ADR-0006-design-system-open-design.md); this doc is the working integration.

## Definition (from ADR-0006)

> "Open design" for CAW-01 = an open-source, token-driven design system whose **source of truth is code in the
> repo** — **shadcn/ui + Radix + Tailwind v4** — themed from **W3C DTCG `*.tokens.json`**, optionally authored in
> **Penpot**, and built by an AI agent through the **shadcn (and optionally Penpot) MCP servers**. Generative UI
> is a one-off scaffolding spike, never the source of truth.

## Token flow

```
Penpot (optional visual authoring)
   └─► design-tokens/*.tokens.json  (W3C DTCG)   ← source of truth for visual values
            └─► build step ─► Tailwind v4 theme (CSS vars)
                     └─► shadcn/ui + Radix components consume the theme
                              └─► app components (component-inventory.md)
```

- The **tokens** (`packages/design-tokens`) are the durable, diffable visual contract.
- Components are typed React (shadcn/Radix), themeable, and AI-buildable/editable — the durable asset for a
  dense control plane (not pixel comps).

## Build loop for the AI builder

1. Author/adjust tokens (Penpot → DTCG, or edit DTCG directly).
2. Use the **shadcn MCP** to scaffold/add components into the codebase.
3. Compose app components from the inventory ([component-inventory.md](./component-inventory.md)).
4. Generative-UI may be used once to spike a layout, then discarded — never committed as source of truth.

## Fit for a control plane

The UI is dense and technical (nav bar, 1:9 layout, three canvases, work-tree panels), not a marketing site —
so the value is a typed, themeable component library + tokens, exactly what this stack provides.

## Open questions

- Whether Penpot is actually used or DTCG is hand-authored in v1 — leaning hand-authored DTCG; TODO(open-question).
- The exact DTCG→Tailwind build tool (Style Dictionary vs custom) — TODO(open-question).

## Implications for runbooks

Phase-0 design-system runbook sets up Tailwind v4 + shadcn + the DTCG token build; every UI runbook composes
from the inventory, never inventing ad-hoc styles.
