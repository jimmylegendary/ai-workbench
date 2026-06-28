---
name: CAW-03 Paper & Patent Harness
description: Minimal review/status UI for an evidence-gated paper/patent harness that wraps PaperOrchestra. Foregrounds gate status, the patent-first interlock, and review scores.
mode: light-and-dark
colors:
  background: "#FAFAFA"
  surface: "#FFFFFF"
  surfaceMuted: "#F5F4F2"
  border: "#E7E4DE"
  text: "#1C1A17"
  textMuted: "#57534E"
  # CAW-03 accent — "IP / publishing" amber
  primary: "#B45309"
  primaryHover: "#92400E"
  accent: "#0EA5E9"
  # lifecycle + gate states
  stateGated: "#64748B"
  stateDrafted: "#2563EB"
  stateReviewed: "#7C3AED"
  statePublished: "#16A34A"
  blocked: "#DC2626"
  interlockHeld: "#DC2626"
  patentSensitive: "#B45309"
  dark:
    background: "#0D0B08"
    surface: "#17140F"
    border: "#322B20"
    text: "#EAE6DF"
    textMuted: "#A8A096"
typography:
  fontFamily: "Inter"
  mono: "JetBrains Mono"
  h1: { fontFamily: "Inter", size: "28px", weight: 600, lineHeight: "34px" }
  h2: { fontFamily: "Inter", size: "20px", weight: 600, lineHeight: "26px" }
  h3: { fontFamily: "Inter", size: "16px", weight: 600, lineHeight: "22px" }
  body: { fontFamily: "Inter", size: "14px", weight: 400, lineHeight: "21px" }
  label: { fontFamily: "Inter", size: "12px", weight: 500, lineHeight: "16px" }
  code: { fontFamily: "JetBrains Mono", size: "12px", weight: 400, lineHeight: "18px" }
radius: { sm: "4px", md: "6px", lg: "10px" }
spacing: { unit: "4px" }
density: compact
---

## Overview

CAW-03 is mainly a **CLI + MCP** harness over a writing engine (PaperOrchestra); its GUI is a **minimal
review/status surface** for the human gates. It foregrounds: the artifact lifecycle, the **evidence gate** +
blocked-claim backlog, **novelty / patent-sensitive** flags, the **patent-first interlock**, and review/autorater
scores. It never drafts content (that's the engine) and never auto-publishes/files (human-gated).

## Brand voice

Governance-first, calm, accountable. The UI's job is to make a publish/file decision *safe and legible*: what is
gated, what is held, what is ready. Amber accent signals IP/caution without alarm fatigue.

## Layout

A board + detail: an **artifact lifecycle board** (gated → assembled → drafting → drafted → reviewed → published /
filing-gate / held), with a detail panel per artifact (gated claim set, review checklist + scores, flags).

## Components (build these from the tokens above)

Source of truth: `design/06-interfaces/review-status-ui.md`, `design/05-harness-core/`.

- `ArtifactBoard` (lifecycle columns), `ArtifactCard` (state chip), `GateView` (+ `BlockedClaimList`),
  `NoveltyFlags` (novel / threatened / patent-sensitive), `InterlockBanner` (held → publish denied),
  `ReviewPanel` (checklist + autorater scores), `AdapterRegistryView` (ports + documented stubs).
- **Primitives** (shadcn/ui + Radix): Button (confirm-gated for publish/file), Badge, Tabs, Dialog, Tooltip.

## Design system stack (Open Design → code)

`DESIGN.md` → DTCG `*.tokens.json` → Tailwind v4 theme → shadcn/ui + Radix. Governance (gate, interlock,
confidentiality) lives in the core; the UI only reads state and invokes vetted ops.

## Notes for Open Design

- Starter palette — refine for AA. Lifecycle-state and `interlockHeld`/`blocked` colors are **semantic** and must
  stay unambiguous (this is a safety surface).
- Compact density; small UI surface — do not over-build. `publish`/`file` actions must be visibly **human-gated**.
