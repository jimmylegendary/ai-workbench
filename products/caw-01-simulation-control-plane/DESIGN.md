---
name: CAW-01 Simulation Control Plane
description: Dense, instrument-grade control plane for composing and running memory-centric AI hardware simulations. Control plane, not a chatbot.
mode: light-and-dark
colors:
  # neutrals (zinc family — shared across the workbench)
  background: "#FAFAFA"
  surface: "#FFFFFF"
  surfaceMuted: "#F4F4F5"
  border: "#E4E4E7"
  text: "#18181B"
  textMuted: "#52525B"
  # CAW-01 accent — "instrument" blue + cyan signal
  primary: "#2563EB"
  primaryHover: "#1D4ED8"
  accent: "#06B6D4"
  # status
  success: "#16A34A"
  warning: "#D97706"
  danger: "#DC2626"
  # canvas surfaces (the right "9")
  canvasBg: "#0E1116"
  canvasGrid: "#1C232B"
  dark:
    background: "#0B0D10"
    surface: "#15181D"
    border: "#2A2F37"
    text: "#E6E8EB"
    textMuted: "#9AA1AC"
typography:
  fontFamily: "Inter"
  mono: "JetBrains Mono"
  h1: { fontFamily: "Inter", size: "30px", weight: 600, lineHeight: "36px" }
  h2: { fontFamily: "Inter", size: "22px", weight: 600, lineHeight: "28px" }
  h3: { fontFamily: "Inter", size: "16px", weight: 600, lineHeight: "24px" }
  body: { fontFamily: "Inter", size: "14px", weight: 400, lineHeight: "20px" }
  label: { fontFamily: "Inter", size: "12px", weight: 500, lineHeight: "16px" }
  code: { fontFamily: "JetBrains Mono", size: "12px", weight: 400, lineHeight: "18px" }
radius: { sm: "4px", md: "6px", lg: "10px" }
spacing: { unit: "4px" }
density: compact
---

## Overview

CAW-01 is the **simulation control plane** of the Company AI Workbench: the user composes an AI workload
(agent-turn) × a serving/representation layer × custom hardware, runs it, and compares evidence axes through a
memory-annotated IR. The UI must **feel like an instrument** — information-dense, fast, status-forward — not a
conversational app.

## Brand voice

Precise, technical, trustworthy. Surfaces foregrounded by the UI: run status, evidence completeness, open
questions, blockers, artifact readiness, and the *next honest action*. Avoid marketing tone and decorative
flourish; every pixel should carry signal.

## Layout

- Top **nav bar**: Simulation · Module Design · User · Setting.
- Simulation screen splits **1:9** — left **control panel** (run/stop/save, status, projection), right
  **workspace** of three coordinated canvases + a work-tree strip.

## Components (build these from the tokens above)

Source of truth: `design/06-frontend/component-inventory.md`.

- **Shell**: `NavBar`, `AppShell`, `SplitPane` (resizable 1:9, min widths).
- **Control panel**: `RunControls`, `RunStatus`, `ProjectionReadout`, `SaveControls` (per-item / full), `EvidenceList`, `NextActionHint`.
- **Canvas 1 & 2** (React Flow / `@xyflow/react`): `FlowCanvas`, `OpNode`, `TensorPort`, `ServingNode` + typed handles. Use `canvasBg`/`canvasGrid`; nodes on `surface` with `primary`/`accent` for selection + valid/invalid edges.
- **Canvas 3** (react-three-fiber): `HardwareScene` (chip→die→package→tray→rack→cluster), `PartInspector`. Picking returns a domain `partId`.
- **Work-tree**: `WorkTreeView`, `DiffView`, `BranchBar`, `HistoryList`.
- **Primitives** (shadcn/ui + Radix): Button, Tabs, Dialog, Tooltip, Select, Resizable, ScrollArea, Badge, Toast.

## Design system stack (Open Design → code)

`DESIGN.md` (this file) → DTCG `*.tokens.json` → Tailwind v4 theme (CSS vars) → shadcn/ui + Radix components,
built/refined by the AI agent inside the project. See `design/06-frontend/open-design-integration.md` and
`design/01-decisions/ADR-0006-design-system-open-design.md`. The three canvases are client components
(`design/06-frontend/canvas-rendering-implementation.md`).

## Notes for Open Design

- Color values here are a **starter palette** — refine for contrast/AA, dark-mode parity, and canvas legibility.
- Keep density **compact** (control-plane tables, dense panels). Mono font is load-bearing for IR/op/tensor readouts.
- Dark mode matters most for the three canvases; light mode for panels/forms.
