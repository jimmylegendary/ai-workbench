# ADR-0006: Design system / "open design" — code-first shadcn/ui + Radix + Tailwind v4, themed from W3C DTCG tokens

- **Status:** proposed
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [SOURCE-BRIEF](../_meta/SOURCE-BRIEF.md) (§1, §2, §3, §4, §5, §6)
  - [Design System & open design (research)](../02-research/design-system-open-design.md)
  - [Canvas & Visualization Tech (research)](../02-research/canvas-and-visualization-tech.md)
  - [ADR-0003 Frontend stack](./ADR-0003-frontend-stack.md)
  - [ADR-0001 Product surface](./ADR-0001-product-surface.md)
  - [ADR-0004 Canvas rendering tech](./ADR-0004-canvas-rendering.md)
  - [ADR-0007 Work-tree change-management model](./ADR-0007-change-management-worktree.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## Purpose

This ADR fixes what **"open design"** concretely means for CAW-01 and the **design-system stack**, plus how
design artifacts become buildable components an AI builder can implement from runbooks. It decides: the
interpretation of "open design," the component system, the token format and one-way transform pipeline, and
the AI-build integration. It does **not** decide the App Router/server-client split (ADR-0003) or the canvas
rendering engines (ADR-0004); it supplies the **chrome and token system** those plug into. It realizes
SOURCE-BRIEF §2's "open design + Next.js" without redefining the nav bar, 1:9 split, three canvases, or
work-tree.

## Context

Forces and constraints we must satisfy:

- **Brief §2:** the UI is produced with **"open design"** (open-source design tooling, exact tool TBD here),
  on a Next.js app.
- **"Open design" is under-specified.** It collapses several distinct workflows (open-source design *tool*,
  open-source *component system*, generative UI, open *process*). A primary spine must be chosen or runbooks
  are not buildable.
- **Brief §1 + §3–§6:** CAW-01 is a **control plane**, not a marketing site — dense, coordinated, stateful
  surfaces: nav bar, 1:9 split, three coordinated canvases, work-tree panels, status-first readouts. The
  durable asset is a **typed, themeable component library in the repo**, not a pixel comp.
- **ADR-0001 build model:** the builder is an **AI agent**. The design system must be agent-installable and
  agent-editable deterministically, with a token contract that survives many build iterations.
- **ADR-0003 boundary:** the design system stays **presentational** (chrome, tokens); cross-canvas
  coordination is app state in the Zustand store, not the design system.
- **Brief §11 guardrail:** prefer small vertical slices; keep things reproducible. The token pipeline must
  be a committed, deterministic build step (a runbook step with a Verify), not a tool in the runtime path.

## The "open design" fork (name it before choosing)

| Interpretation | What it means | Primary artifact | Risk if chosen blindly |
|---|---|---|---|
| **A. Open-source design tool** | FOSS Figma-equivalent (Penpot) to draw screens + own tokens | `.tokens.json` + specs | Designer round-trip overhead for a tables/graphs UI |
| **B. Open-source component system as the design system** | The "design" *is* code (shadcn/ui + Radix + Tailwind) | `components.json` + token CSS + component files | Weaker visual sketching surface for non-coders |
| **C. Generative / "open" UI** | Describe UI in NL, generate it (OpenUI, v0-style) | Prompt + generated JSX | Drift, no durable token contract, license/maintenance gaps |
| **D. "Open design" = open *process*** | Specs, ADRs, tokens all live in git | Markdown specs + token files | Not a tool; orthogonal to A/B/C |

## Decision

**Adopt B as the spine, A as the optional token/visual feeder, D as the working process, C as a scaffolding
accelerant only.**

> **"Open design" for CAW-01 = an open-source, token-driven design system whose source of truth is code in
> the repo — shadcn/ui + Radix + Tailwind v4 — themed from W3C DTCG `*.tokens.json`, optionally authored in
> Penpot, and built by an AI agent through the shadcn (and optionally Penpot) MCP servers. Generative UI is
> a one-off scaffolding spike, never the source of truth.**

Rationale: for a dense control plane the durable asset is a typed, themeable component library the AI builder
composes and edits — not a pixel comp. We keep an open visual tool and a shared token vocabulary, but as a
**feeder**, not the master.

### 1. Component system — shadcn/ui + Radix + Tailwind v4

| Layer | Choice | Role |
|---|---|---|
| Component system | **shadcn/ui** (owned source, copied into repo) | Editable, versioned component library |
| Primitives | **Radix UI** | Accessible, keyboard-correct interaction for dense UI |
| Styling | **Tailwind v4 + CSS variables** | Token sink; theming + density |
| Dense data | **TanStack Table + TanStack Virtual** | Tables, long work-trees |

Why this is the spine:

- **Ownership fits an AI builder.** shadcn/ui copies component **source into the repo** (not an opaque npm
  dependency), so the agent edits owned, versioned source instead of wrestling library props.
- **First-class AI/MCP integration.** shadcn ships an MCP server so the agent can browse/search/retrieve
  source and install registry items deterministically — eliminating hallucinated props. This is the single
  most important property for the ADR-0001 build model.
- **Radix = a11y + correct interaction for dense UI.** Menus, dialogs, popovers, context menus, resizable
  panels, tooltips, scroll areas — the control-plane chrome — come with keyboard/focus/ARIA semantics we
  must not reinvent. Dense operator tooling lives and dies by keyboard navigation.
- **Tailwind v4 + CSS variables = the token sink.** shadcn theming is CSS-variable based (semantic tokens
  like `--background`, `--primary`, `--radius`); `baseColor` in `components.json` seeds the theme. This is
  exactly where DTCG tokens land.
- **Registries compose.** Multiple registries can be configured in `components.json` and composed with
  `shadcn build`, so we add data-grid / chart / tree / panel registries without forking the base.

Control-plane building blocks beyond base shadcn (owned or pulled from pinned registries): work-tree panels
(Radix tree + TanStack Virtual), dense run/metric tables (TanStack Table + shadcn cells), the resizable 1:9
split and nested panels (shadcn `resizable` / react-resizable-panels), status/evidence indicators (shadcn
`badge`/`progress` + semantic status tokens). **Canvas 1/2/3 internals are rendered by the engines in
ADR-0004**, not by the design system — this ADR only fixes the chrome and tokens around them.

### 2. Token format & pipeline — DTCG, one-way, repo is source of truth

- **W3C DTCG `*.tokens.json` (2025.10 stable)** is the interchange format — vendor-neutral JSON, `$`-prefixed
  properties. It is the single shared vocabulary, committed to `design/tokens/`. **Even if Penpot is dropped,
  the `*.tokens.json` files remain authoritative and hand-editable.**
- **Style Dictionary 4** (or the Penpot Tailwind export plugin — one is pinned, see open questions) is the
  **committed transform** that emits CSS custom properties (`:root` / `.dark`) and the Tailwind v4 `@theme`
  config. It is a deterministic build script (a runbook step with a Verify), **not** a runtime dependency.
- **Components reference semantic tokens, never raw values.** `--primary`, `--surface-2`, `--density-row-h`,
  etc., so theme/density changes happen in one place.
- **The AI builder never invents colors/spacing inline.** Runbooks instruct: pull tokens → install shadcn
  component → wire to semantic vars.

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

### 3. Required token groups for a control plane (not marketing defaults)

- **Density scale** as a first-class token group (`--density-row-h`, compact paddings, font sizes) — explicitly
  authored against the real work-tree/table content, because marketing defaults are too airy for
  tree/table-heavy screens.
- **Semantic status token set** (`--status-ok / warn / error / stale / running / blocked`) defined **once**
  and reused across the Control Panel, work-tree rows, and canvas overlays — this is the visual spine of the
  brief §1 "control plane, not chatbot" honesty surface (run status, evidence completeness, blockers,
  artifact readiness).

### 4. Open-source visual tool — Penpot (optional feeder, non-blocking)

- **Use Penpot for:** the token system (color/spacing/radius/typography/density) and **low-fidelity layout
  exploration** of the shell (nav bar, 1:9 split, panel chrome, work-tree rows). Export DTCG JSON; commit it.
- **Do NOT use Penpot for:** pixel-perfect comps of Canvas 1/2/3 internals — those are runtime-computed
  node-graphs and a 3D hardware hierarchy (ADR-0004); drawing them statically is wasted effort.
- **Penpot is optional, not blocking.** If it isn't stood up, the system still functions from code-side DTCG
  tokens authored by hand. Penpot's MCP server can let the agent read a frame's structure/tokens directly
  rather than guessing from a screenshot.

### 5. Generative UI policy

OpenUI / v0-style generative UI is allowed **only as a one-off scaffolding spike** ("show me a candidate
layout for the work-tree panel"). Its output is **rebuilt as shadcn components** and **never committed as the
source of truth** — no durable token contract, drift, and license/maintenance variance make it unfit as a
spine for a control plane.

### Options considered (component-layer summary)

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **shadcn/ui + Radix + Tailwind v4** | Owned source, MCP install, a11y, CSS-var tokens, composable registries | Tailwind verbosity; we maintain copied source | **Chosen** |
| Radix Themes (prebuilt) | Less to own, coherent theme | Less control over dense layouts; heavier opinion | Fair |
| Mantine / Chakra / MUI | Batteries-included data components | Runtime dep, theme not DTCG-native, harder for an agent to edit | Fair–poor |
| OpenUI / generative UI | Fast exploration | No durable contract, drift, licensing variance | Spike only |
| Hand-rolled + headless only | Max control | Slowest; reinvents shadcn | Poor (time) |

## Consequences

**Becomes easy:**
- The AI builder installs/edits owned components deterministically via the shadcn MCP server (ADR-0001 build
  model).
- A single DTCG token contract drives theme + density + status everywhere; one change re-themes the app.
- Radix gives accessibility/keyboard correctness for free — essential for dense operator tooling.
- The token pipeline is reproducible in CI (committed Style Dictionary build with a Verify step).

**Becomes harder / costs:**
- We own and maintain copied shadcn source; Tailwind class verbosity is real.
- A density token scale and status token set must be authored deliberately (numbers measured against real
  content, not guessed).
- One transform tool must be pinned (Style Dictionary 4 vs Penpot plugin) and kept version-stable for
  Tailwind v4 `@theme` parity.
- Third-party shadcn-compatible registries vary in maintenance/license quality and must be pinned.

**Follow-on work (runbooks):**
- `RB-0xx-tokens-and-theme`: create `design/tokens/*.tokens.json` (DTCG), install Style Dictionary 4, emit
  `globals.css` CSS vars + Tailwind v4 theme; define density + status token groups. *Verify:* transform runs
  deterministically; `:root`/`.dark` vars exist.
- `RB-0xx-shadcn-bootstrap`: init shadcn (`components.json`, `baseColor`), wire to the tokens, install base
  primitives (button, dialog, menu, popover, tooltip, scroll-area, resizable, tabs, badge, progress).
  *Verify:* components render with tokens.
- `RB-1xx-app-shell`: nav bar (Simulation / Module Design / User / Setting) + the 1:9 resizable split.
  *Verify:* layout ratio + keyboard nav.
- `RB-1xx-work-tree-panel`: work-tree component (Radix tree + TanStack Virtual, per-item + full save) using
  status tokens. *Verify:* long-tree perf + save controls.
- (optional, blocked on hosting) `RB-0xx-penpot-token-sync`: stand up Penpot + MCP, export DTCG, document the
  one-way sync.
- Canvas 1/2/3 chrome consumes the same token set; rendering engines decided in ADR-0004.

## Open questions / revisit triggers

- `TODO(open-question: open-design-interpretation)` Confirm **B-spine + A-feeder** is what the owner means by
  "open design," vs. wanting Penpot as the *master* (A-spine) with code generated from it. This flips whether
  Penpot is blocking or optional.
- `TODO(open-question: penpot-hosting)` Self-host Penpot (Docker), use penpot.app, or skip Penpot and author
  DTCG by hand.
- `TODO(open-question: token-transform-tool)` Style Dictionary 4 vs. the Penpot Tailwind export plugin as the
  canonical transform — pick one and pin versions; verify Tailwind v4 `@theme` parity.
- `TODO(open-question: density-scale)` Concrete compact density values (row heights, paddings, font sizes)
  measured against the real work-tree/table content.
- `TODO(open-question: registry-set)` Which third-party shadcn-compatible registries (charts, data-grid,
  tree, panels) we trust and pin.
- `TODO(open-question: mcp-in-ci)` Whether the AI builder uses shadcn/Penpot MCP interactively only, or we
  also need a non-MCP scriptable path (plain `shadcn` CLI + committed tokens) for reproducible CI builds.
- **Revisit trigger:** if generative-UI output ever gets committed directly, that violates this ADR — rebuild
  as shadcn or amend the decision.
