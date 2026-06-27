# Design System & "Open Design"

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [ADR-0006: Design system / "open design" tool choice](../01-decisions/ADR-0006-design-system-open-design.md)
  - [ADR-0003: Frontend stack (Next.js)](../01-decisions/ADR-0003-frontend-stack.md)
  - [ADR-0004: Canvas rendering tech](../01-decisions/ADR-0004-canvas-rendering.md)
  - [Frontend design](../06-frontend/) · [CAW-01 control plane](../05-caw01-simulation-control-plane/)
  - [Open questions](../08-research-plan/open-questions.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## Purpose

This document researches what "open design" should concretely mean for CAW-01 and recommends a
design-system stack that an AI builder can implement from runbooks. It covers (1) the ambiguity of the
term "open design" and the leading interpretation we proceed on, (2) the open-source design tool
(Penpot) and design-to-code paths, (3) the Next.js component layer (shadcn/ui + Radix + Tailwind vs
OpenUI and alternatives), (4) how tokens/specs flow from the design tool into the codebase, and (5) fit
for a dense control-plane UI rather than a marketing site.

It does **not** decide the Next.js app-router/server-client split (that is [ADR-0003](../01-decisions/ADR-0003-frontend-stack.md)),
nor the canvas rendering engines for the three canvases ([ADR-0004](../01-decisions/ADR-0004-canvas-rendering.md)).
It feeds the binding decision recorded in [ADR-0006](../01-decisions/ADR-0006-design-system-open-design.md).

---

## 1. The ambiguity of "open design" — name the fork before choosing

The owner said the design will be done with "open design" + Next.js. The phrase is under-specified and
collapses several distinct workflows. We must pick one as the **primary spine** and treat the others as
optional inputs, or runbooks will not be buildable.

| Interpretation | What it actually means | Primary artifact | Risk if chosen blindly |
|---|---|---|---|
| **A. Open-source design tool** | Use an FOSS Figma-equivalent (Penpot) to draw screens and own tokens | `.tokens.json` + component specs | Designer-tool round-trip overhead for a UI that is mostly tables/graphs |
| **B. Open-source component system as the design system** | The "design" *is* a code component library (shadcn/ui + Radix + Tailwind) — design in code | `components.json` + `globals.css` tokens + component files | Weak visual-design surface; harder for a non-coder to sketch layout |
| **C. Generative / "open" UI** | Describe UI in natural language, generate it (OpenUI, v0-style) | Prompt + generated JSX | Output drift, no durable token contract, license/maintenance gaps |
| **D. "Open design" = open *process*** | Design-in-the-open: specs, ADRs, tokens all in the git repo | Markdown specs + token files | Not a tool at all; orthogonal to A/B/C |

**Leading interpretation we proceed on (B as spine, A as the token/visual source, D as the process):**

> **"Open design" = an open-source, token-driven design system whose source of truth is code in the
> repo (shadcn/ui + Radix + Tailwind v4), with Penpot as the optional open-source visual layer that
> exports W3C design tokens into that same code.** Generative UI (C) is a scaffolding accelerant only,
> never the source of truth.

Rationale: CAW-01 is a **control plane**, not a marketing site. Its value is dense, coordinated,
stateful surfaces (nav bar, 1:9 split, three canvases, work-tree panels). For that class of UI the
durable asset is a **typed, themeable component library in the codebase** that the AI builder composes,
not a pixel comp. We still want an open visual tool for layout exploration and a shared token vocabulary,
so Penpot is kept — but as a *feeder*, not the master.

Alternatives A-spine, C-spine, and tool substitutions are recorded as open questions (§7) and decided in
[ADR-0006](../01-decisions/ADR-0006-design-system-open-design.md).

---

## 2. The open-source design tool layer — Penpot

[Penpot](https://penpot.app) is the mature open-source Figma alternative and the most defensible "open
design tool" choice. Two properties make it the right feeder for a code-first system:

- **Native W3C design tokens.** Penpot is the first design tool to natively implement the W3C Design
  Tokens Community Group (DTCG) format, and tokens import/export as JSON
  ([Penpot tokens docs](https://help.penpot.app/user-guide/design-systems/design-tokens/)). The DTCG
  spec reached its **first stable version (2025.10)** — a vendor-neutral JSON format using `$`-prefixed
  properties and `.tokens`/`.tokens.json` files
  ([W3C DTCG announcement](https://www.w3.org/community/design-tokens/2025/10/28/design-tokens-specification-reaches-first-stable-version/)).
  This is the interchange contract that lets design and code share one vocabulary.
- **MCP server (2025/2026).** Penpot shipped an official MCP server that exposes design data to AI
  clients for read **and** write, enabling design-to-code, code-to-design, and design-system-aware
  component generation ([Penpot MCP](https://github.com/penpot/penpot-mcp),
  [Smashing Magazine](https://www.smashingmagazine.com/2026/01/penpot-experimenting-mcp-servers-ai-powered-design-workflows/)).
  This matters because our builder is an AI agent: it can read a Penpot frame's structure/tokens via MCP
  instead of guessing from a screenshot.

**How we actually use Penpot (and how we don't):**

- **Use it for:** the token system (color, spacing, radius, typography, density scale), and for
  *low-fidelity layout exploration* of the shell (nav bar, 1:9 split, panel chrome, work-tree tree
  rows). Export tokens as DTCG JSON, commit to the repo.
- **Do NOT use it for:** pixel-perfect comps of Canvas 1/2/3 internals. Those are node-graphs and a 3D
  hardware hierarchy ([ADR-0004](../01-decisions/ADR-0004-canvas-rendering.md)) whose layout is
  computed at runtime, not drawn. Designing those in a static tool is wasted effort.
- **Penpot is optional, not blocking.** If Penpot is not stood up, the design system still functions
  from the code-side tokens (§4). Penpot self-hosting is an open question (§7).

### Open-source design-to-code paths (assessed)

| Path | What it produces | Verdict for CAW-01 |
|---|---|---|
| Penpot MCP → agent reads frame/tokens → writes shadcn JSX | Structured, token-aware components | **Primary** assist path for the shell |
| Penpot "inspect"/code export (CSS/markup) | Raw CSS/HTML snippets | Reference only; do not paste as components |
| OpenUI / generative HTML→React | One-shot JSX/HTML | Scaffolding spike only (§3) |
| Figma-to-code tools | n/a (proprietary) | Out of scope — violates "open" |

---

## 3. The Next.js component layer

### Recommendation: shadcn/ui + Radix + Tailwind v4

This is the spine. Justification specific to a control plane:

- **Ownership model fits an AI builder.** shadcn/ui is not an npm dependency you import; the CLI/registry
  **copies component source into your repo** so it is editable and versioned by us. The official registry
  has 40+ base components built on Radix primitives and styled with Tailwind
  ([shadcn/ui](https://ui.shadcn.com/), [components.json](https://ui.shadcn.com/docs/components-json)).
  An AI builder modifying owned source beats wrestling an opaque library's props.
- **First-class AI/MCP integration.** shadcn ships an **MCP server** so agents can browse, search,
  retrieve source, and install registry items via natural language — explicitly to "eliminate outdated
  knowledge or hallucinated props" by giving live registry access
  ([shadcn MCP](https://ui.shadcn.com/docs/mcp)). This is the single most important property for our
  build model: the same agent that reads Penpot can install the right primitive deterministically.
- **Radix = accessibility + correct interaction for dense UI.** Menus, dialogs, popovers, context menus,
  resizable panels, tooltips, scroll areas — all the chrome a control plane needs — are handled by Radix
  primitives with keyboard/focus semantics we should not reinvent.
- **Tailwind v4 + CSS variables = the token sink.** shadcn theming is CSS-variable based (semantic tokens
  like `--background`, `--foreground`, `--primary`); `baseColor` in `components.json` seeds the theme.
  This is exactly where DTCG tokens land (§4).
- **Registries compose.** Multiple registries can be configured in `components.json` and composed with
  `shadcn build` (official index had ~149 registries by Jan 2026). We can add data-grid / chart / panel
  registries without forking the base.

### Why not OpenUI (or generative UI) as the spine

[OpenUI](https://github.com/wandb/openui) (W&B) and the Thesys "OpenUI Lang" generative-UI standard are
real and interesting, but they generate UI from prompts at runtime/build-time. For a control plane this
is the wrong altitude: we need a **stable, typed, token-bound** component contract that survives many
build iterations, not freshly-generated markup. OpenUI is useful as a **one-off scaffolding spike** ("show
me a candidate layout for the work-tree panel") whose output is then hand-rebuilt as shadcn components —
never committed as the source of truth.

### Components the control plane actually needs (beyond base shadcn)

These are dense-UI building blocks not fully covered by base shadcn; the builder pulls them from
composable registries or owns them directly:

| Need | Recommended open building block |
|---|---|
| Work-tree panels (tree, per-item save) | Radix-based tree + shadcn primitives; TanStack Virtual for long trees |
| Dense tabular run/metric readouts | TanStack Table (headless) + shadcn cells |
| Resizable 1:9 split & nested panels | shadcn `resizable` (react-resizable-panels) |
| Canvas 1 node-graph | React Flow / xyflow (decided in [ADR-0004](../01-decisions/ADR-0004-canvas-rendering.md)) |
| Canvas 3 3D HW hierarchy | react-three-fiber / three.js ([ADR-0004](../01-decisions/ADR-0004-canvas-rendering.md)) |
| Status/evidence indicators | shadcn `badge`/`progress` + custom semantic tokens |

> These are listed for completeness; the **rendering** decisions for Canvas 1/2/3 belong to
> [ADR-0004](../01-decisions/ADR-0004-canvas-rendering.md). This doc only fixes the *chrome and token
> system* around them.

### Component-layer tradeoff table

| Option | Pros | Cons | Fit (control plane) |
|---|---|---|---|
| **shadcn/ui + Radix + Tailwind v4** | Owned source, MCP install, a11y, CSS-var tokens, composable registries | Tailwind-class verbosity; we maintain copied source | **Best** |
| Radix Themes (prebuilt) | Less to own, coherent theme | Less control over dense layouts; heavier opinion | Fair |
| Mantine / Chakra / MUI | Batteries-included, data components | Runtime dep, theme system not DTCG-native, harder for agent to edit | Fair–poor |
| OpenUI / generative UI | Fast exploration | No durable contract, drift, licensing/maintenance variance | Spike only |
| Hand-rolled + headless (Ark/Radix only) | Max control | Slowest; reinvents shadcn | Poor (time) |

---

## 4. Token & spec flow: open design tool → Next.js + Tailwind/shadcn → AI builder

The contract that makes "open design" real is a **one-way, file-based token pipeline** with the repo as
source of truth. No tool is in the runtime path.

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

Key decisions baked into this flow:

- **DTCG JSON is the interchange format**, not Penpot's internal format. Even if Penpot is dropped, the
  `*.tokens.json` files remain authoritative and hand-editable.
- **Style Dictionary 4** (or the Penpot Tailwind v3/v4 export plugin) is the transform step that emits
  both CSS custom properties and Tailwind config. The transform is a committed build script so the AI
  builder can re-run it deterministically (a runbook step with a Verify).
- **Semantic tokens, not raw values, in components.** Components reference `--primary`,
  `--surface-2`, `--density-row-h`, etc. Theme/density changes happen in one place. A control plane needs
  a **density scale** (compact spacing) as a first-class token group — explicitly authored, since
  marketing-oriented defaults are too airy for table/tree-heavy screens.
- **The AI builder never invents colors/spacing inline.** Runbooks instruct: pull tokens, install shadcn
  component, wire to semantic vars. This keeps the evidence chain clean and the UI coherent.

---

## 5. Fit for a dense, control-plane-style technical UI

The brief's surface is a nav bar, a 1:9 left/right split, three coordinated canvases, and a work-tree.
This is closer to an IDE/observability console than a website. Implications for the stack:

- **Density over whitespace.** Author a compact density token group; override shadcn's default paddings.
  Validate against the work-tree (many rows) and tabular readouts, not hero sections.
- **Coordinated state, not page navigation.** The three canvases and the control panel share selection
  state and the work-tree. The design system supplies *chrome* (panels, resizers, menus, badges); the
  *coordination* is app state ([ADR-0003](../01-decisions/ADR-0003-frontend-stack.md)) — keep this
  boundary clean so the design system stays presentational.
- **Status-first visual language ("control plane, not chatbot").** Tokens and components must express run
  status, evidence completeness, open questions, blockers, artifact readiness. Define a **semantic status
  token set** (`--status-ok/warn/error/stale/running/blocked`) once; reuse across control panel,
  work-tree rows, and canvas overlays.
- **Penpot's value is bounded.** It is genuinely useful for the *shell and panel chrome* exploration and
  the token system. It adds little to the canvas internals, which are runtime-computed. Do not gate the
  build on high-fidelity comps of the canvases.
- **Accessibility/keyboard.** Dense operator tooling lives and dies by keyboard navigation; Radix
  primitives give us focus management and ARIA semantics for free — a strong reason to prefer the
  Radix-backed spine over generative output.

---

## 6. Recommended stack (the answer)

| Layer | Choice | Role |
|---|---|---|
| Visual design tool (optional) | **Penpot** (self-host TBD) | Layout exploration + DTCG token authoring; feeds repo via MCP/export |
| Token format | **W3C DTCG `*.tokens.json` (2025.10)** | Single shared vocabulary, repo source of truth |
| Token transform | **Style Dictionary 4** (or Penpot Tailwind plugin) | DTCG → CSS vars + Tailwind v4 `@theme` |
| Component system | **shadcn/ui** (owned source) | Editable, versioned component library |
| Primitives | **Radix UI** | Accessible, keyboard-correct interaction |
| Styling | **Tailwind v4 + CSS variables** | Token sink; theming/density |
| Dense data | TanStack Table + TanStack Virtual | Tables, long work-trees |
| AI build integration | **shadcn MCP** (+ **Penpot MCP**) | Deterministic install/read for the agent |
| Generative UI | OpenUI / v0-style | **Spike only**, never source of truth |

**One-line decision:** Code-first open design system = shadcn/ui + Radix + Tailwind v4, themed from
W3C DTCG tokens (optionally authored in Penpot), built by an AI agent through the shadcn + Penpot MCP
servers.

---

## 7. Open Questions

(Mirror into [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).)

- `TODO(open-question: open-design-interpretation)` Confirm interpretation **B-spine + A-feeder** is what
  the owner means by "open design," vs. wanting Penpot as the *master* (A-spine) with code generated from
  it. This flips whether Penpot is blocking or optional.
- `TODO(open-question: penpot-hosting)` Do we self-host Penpot (Docker) or use penpot.app, or skip Penpot
  entirely and author DTCG tokens by hand? Self-hosting cost vs. benefit for a small team is unverified.
- `TODO(open-question: token-transform-tool)` Style Dictionary 4 vs. the Penpot Tailwind export plugin as
  the canonical transform — pick one and pin versions. Behavior parity for Tailwind v4 `@theme` is
  unverified.
- `TODO(open-question: density-scale)` Define the compact density token scale and its concrete values
  (row heights, paddings, font sizes) against the real work-tree/table content. Numbers not yet measured.
- `TODO(open-question: generative-ui-policy)` Allowed scope of OpenUI/v0 generative scaffolding — explicit
  rule that generated output is rebuilt as shadcn, not committed.
- `TODO(open-question: registry-set)` Which third-party shadcn-compatible registries (charts, data-grid,
  tree, panels) we trust and pin, given 149+ registries of varying maintenance/license quality.
- `TODO(open-question: mcp-in-ci)` Whether the AI builder uses shadcn/Penpot MCP interactively only, or we
  also need a non-MCP scriptable path (plain `shadcn` CLI + committed tokens) for reproducible CI builds.

## 8. Implications for runbooks

This doc drives the following runbooks (to be authored under `../10-runbooks/`):

- **`phase-0-foundations/RB-0xx-tokens-and-theme.md`** — create `design/tokens/*.tokens.json` (DTCG),
  install Style Dictionary 4, emit `globals.css` CSS variables + Tailwind v4 theme; define semantic
  status + density token groups. *Verify:* transform runs deterministically; `:root`/`.dark` vars exist.
- **`phase-0-foundations/RB-0xx-shadcn-bootstrap.md`** — init shadcn (`components.json`, `baseColor`),
  wire `baseColor`/CSS vars to the tokens above, install base primitives (button, dialog, menu, popover,
  tooltip, scroll-area, resizable, tabs, badge, progress). *Verify:* components render with tokens.
- **`phase-1-app-shell/RB-1xx-app-shell.md`** — build nav bar (Simulation / Module Design / User /
  Setting) and the 1:9 resizable split using shadcn `resizable`. *Verify:* layout ratio + keyboard nav.
- **`phase-1-app-shell/RB-1xx-work-tree-panel.md`** — work-tree component (Radix tree + TanStack Virtual,
  per-item + full save affordances) using status tokens. *Verify:* long-tree perf + save controls.
- **(handoff to [ADR-0004](../01-decisions/ADR-0004-canvas-rendering.md) runbooks)** — Canvas 1/2/3
  chrome consumes the same token set; rendering engines decided separately.
- **(optional) `phase-0-foundations/RB-0xx-penpot-token-sync.md`** — stand up Penpot + MCP, export DTCG
  tokens, document the one-way sync into the repo. *Status:* blocked on the penpot-hosting open question.

---

**Sources:**
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
