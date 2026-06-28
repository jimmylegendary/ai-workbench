---
name: CAW-04 Tips & Skills
description: Public, trustworthy docs-style website + read-only API publishing validated AI-use tips, skills, workflows, and playbooks. Public-safe by construction.
mode: light-first
colors:
  # neutrals (zinc family — shared across the workbench)
  background: "#FFFFFF"
  surface: "#FFFFFF"
  surfaceMuted: "#F8FAFC"
  border: "#E2E8F0"
  text: "#0F172A"
  textMuted: "#475569"
  # CAW-04 accent — clean public indigo
  primary: "#4F46E5"
  primaryHover: "#4338CA"
  accent: "#0EA5E9"
  link: "#4F46E5"
  # status / badges (boundary + version)
  success: "#16A34A"
  warning: "#D97706"
  danger: "#DC2626"
  badgePublic: "#16A34A"
  badgeVersion: "#6366F1"
  dark:
    background: "#0B1020"
    surface: "#111729"
    border: "#24304B"
    text: "#E5E9F0"
    textMuted: "#9AA6BC"
typography:
  fontFamily: "Inter"
  mono: "JetBrains Mono"
  h1: { fontFamily: "Inter", size: "36px", weight: 700, lineHeight: "42px" }
  h2: { fontFamily: "Inter", size: "26px", weight: 600, lineHeight: "32px" }
  h3: { fontFamily: "Inter", size: "19px", weight: 600, lineHeight: "26px" }
  body: { fontFamily: "Inter", size: "16px", weight: 400, lineHeight: "26px" }
  label: { fontFamily: "Inter", size: "13px", weight: 500, lineHeight: "18px" }
  code: { fontFamily: "JetBrains Mono", size: "14px", weight: 400, lineHeight: "22px" }
radius: { sm: "6px", md: "8px", lg: "14px" }
spacing: { unit: "4px" }
density: comfortable
---

## Overview

CAW-04 is the **public read/API publishing layer** — a docs-style website plus a read-only REST API that publish
**validated, public-safe** tips, skills, workflows, and playbooks. The site is a **frozen, vetted static artifact**
(Astro 5 + Starlight, SSG): comfortable to read, fast, and credible. Nothing unverified or confidential is ever
shown.

## Brand voice

Clear, credible, practical. This is *published practice*, not prompt snippets — so the visual tone is calm,
high-readability, documentation-grade. Reassure the reader that each item is versioned, sourced, and safe.

## Layout

- Docs-style: top nav + left sidebar (Tips / Skills / Workflows / Playbooks) + content + right "on this page".
- Each artifact page shows: title, summary, **version (semver) badge**, **public-safe badge**, body, and a
  copyable API/`SKILL.md` link. Older versions remain addressable (`/v/{semver}`); withdrawn items show a clear
  tombstone state.

## Components (build these from the tokens above)

Source of truth: `design/06-interfaces/website.md`, `design/06-interfaces/rest-api.md`, `design/05-publishing-core/`.

- **Site**: `NavBar`, `SideNav`, `ArtifactPage`, `VersionBadge`, `BoundaryBadge` (public), `TableOfContents`, `CodeBlock` (mono), `CopyButton`, `SearchBox` (client-side).
- **Listing**: `ArtifactCard` (kind + summary + version), `KindFilter`, `Pagination`.
- **API affordances**: `ApiResourceLink` (md/json), `ManifestLink` (`manifest.json` / `SKILL.md`).
- **Preview/admin** (internal, not public): `PublishGatePanel`, `RecheckResult`, `DiffPreview`.
- **Primitives** (shadcn/ui + Radix): Button, Badge, Tabs, Tooltip, ScrollArea, Dialog.

## Design system stack (Open Design → code)

`DESIGN.md` (this file) → DTCG `*.tokens.json` → Tailwind v4 / Starlight theme → components, built/refined by the AI
agent inside the project. See `design/06-interfaces/website.md` and
`design/01-decisions/ADR-0006-web-stack.md`. The published artifact has **no live path to internal stores**
(public-safe by construction).

## Notes for Open Design

- Color values are a **starter palette** — refine for WCAG AA on long-form reading and for the Starlight theme.
- Optimize for **reading**: generous body line-height (26px), large code blocks, comfortable density.
- Keep public surface visually distinct from the internal preview/admin (which can reuse the CAW-01 control-plane
  density).
