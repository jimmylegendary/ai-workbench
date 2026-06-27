# Layout & Navigation — CAW-01

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [ui-architecture-nextjs.md](./ui-architecture-nextjs.md), [../05-caw01-simulation-control-plane/control-panel-and-run-lifecycle.md](../05-caw01-simulation-control-plane/control-panel-and-run-lifecycle.md), [component-inventory.md](./component-inventory.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## Purpose

Spec the top nav bar and the Simulation screen's 1:9 split, including resize behavior. Per-canvas detail is in
`05-*`; component catalog in [component-inventory.md](./component-inventory.md).

## Top nav bar

System-wide menu spanning every screen:

```
┌──────────────────────────────────────────────────────────────────┐
│  ◰ CAW-01   │ Simulation │ Module Design │ User │ Setting │   ⚙   │
└──────────────────────────────────────────────────────────────────┘
```

- **Simulation** — the working screen below (default).
- **Module Design**, **User**, **Setting** — standard app menus (scaffolded in v1).

## Simulation screen — 1:9 split

```
┌──────────────────────────────────────────────────────────────────┐
│ NAV BAR                                                            │
├────────────┬─────────────────────────────────────────────────────┤
│ CONTROL    │  WORKSPACE                                            │
│ PANEL      │   ┌──────────┬──────────┬───────────────────────┐    │
│  (1)       │   │ Canvas 1 │ Canvas 2 │ Canvas 3 (3D)         │    │
│            │   │          │          │                       │    │
│ run/stop   │   │          │          │                       │    │
│ status     │   └──────────┴──────────┴───────────────────────┘    │
│ projection │   work-tree strip (tree / diff / branch)             │
│ save       │                                                       │
└────────────┴─────────────────────────────────────────────────────┘
     1        :                          9
```

- Left **1** = control panel ([../05-caw01-simulation-control-plane/control-panel-and-run-lifecycle.md](../05-caw01-simulation-control-plane/control-panel-and-run-lifecycle.md)).
- Right **9** = workspace with the three coordinated canvases + a work-tree strip.

## Workspace arrangement of the three canvases

- Default: the three canvases share the workspace; the active canvas can expand (focus mode) while the others
  collapse to rails, keeping cross-canvas selection alive.
- The work-tree view is a strip/drawer within the "9" region ([../05-caw01-simulation-control-plane/change-management-worktree.md](../05-caw01-simulation-control-plane/change-management-worktree.md)).

## Resize behavior

- The 1:9 ratio is the default; the divider is draggable with sensible min widths (control panel never collapses
  to unusable; canvases keep a minimum interactive area).
- Layout state is UI-local (not part of the experiment work-tree).

## Open questions

Whether the three canvases are tabs, tiles, or a focus+rails layout by default — leaning focus+rails;
TODO(open-question), validate with the Canvas-3 spike.

## Implications for runbooks

Phase-1 layout runbook builds the nav bar + 1:9 split + workspace container + work-tree strip placeholder
before canvases are implemented in phase-2.
