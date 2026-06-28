# Prototype briefs — CAW-01 (Open Design, Prototype mode)

These are **per-screen briefs** for Open Design's **Prototype mode** (one high-fidelity screen per run, HTML or
JSX). They exist because the **Design System** mode only yields tokens + a generic component kit (what you saw
first); to get screen-level fidelity you run Prototype mode **once per screen** with a focused brief that
references the locked design system.

## How to use

1. Make sure the CAW-01 **design system** is active in Open Design (from the product-root
   [`DESIGN.md`](../../../DESIGN.md), 9-section schema). All briefs say "use the active design system."
2. New project → **Prototype** mode → paste one brief below as the prompt. Generate. Repeat per screen.
3. Export the result (HTML/JSX) as the **visual reference**, then implement the real screen in the Next.js
   scaffold (`caw01-workbench/apps/web`) consuming the same tokens — the prototype is the look, the scaffold is
   the wiring (MVVM + Supabase, see [app-architecture-mvvm.md](../app-architecture-mvvm.md)).

> Prototypes are **visual artifacts, not the app** — they have no auth/data wiring. That is Track B (the
> scaffold + design docs). Keep them as reference; do not ship them as the product.

## Briefs
- [`01-login.md`](./01-login.md) — sign-in
- [`02-simulation.md`](./02-simulation.md) — the 1:9 instrument screen (the flagship)
- [`03-runs-data-management.md`](./03-runs-data-management.md) — runs/experiments browser + detail
- [`04-module-design.md`](./04-module-design.md) — module library/editor
- [`05-settings.md`](./05-settings.md) — workspace settings

Screen contracts (components, ViewModel, data) are in [routes-and-screens.md](../routes-and-screens.md).
