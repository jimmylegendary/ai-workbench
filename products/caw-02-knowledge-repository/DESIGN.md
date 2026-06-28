---
name: CAW-02 Knowledge Repository
description: Minimal, read-only knowledge viewer over a provenance-preserving store (source → claim → evidence → cited note). Trust- and boundary-aware.
mode: light-and-dark
colors:
  background: "#FAFAFA"
  surface: "#FFFFFF"
  surfaceMuted: "#F4F4F5"
  border: "#E4E4E7"
  text: "#18181B"
  textMuted: "#52525B"
  # CAW-02 accent — "evidence" green
  primary: "#15803D"
  primaryHover: "#166534"
  accent: "#0D9488"
  # boundary badges
  boundaryPublic: "#16A34A"
  boundaryInternal: "#D97706"
  boundaryConfidential: "#DC2626"
  # trust ladder (T0..T3)
  trustLow: "#9CA3AF"
  trustHigh: "#15803D"
  contested: "#DC2626"
  dark:
    background: "#0B0D0C"
    surface: "#141816"
    border: "#26302B"
    text: "#E6E8E7"
    textMuted: "#97A39C"
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

CAW-02 is primarily an **API + MCP + CLI** product; its only GUI is an **optional, read-only knowledge viewer**.
The viewer lets a human browse the entity graph (Source / Claim / Evidence / Note / Concept / Interest /
OpenQuestion / Decision / Assumption) and follow provenance edges, with **trust** and **boundary** clearly badged.
Rich editing is a non-goal — writes go through the skill-wrap interface, not the UI.

## Brand voice

Sober, evidence-first. The UI must make the load-bearing invariant visible: *a claim points to evidence; a
generated summary is never evidence.* Badges and edges, not prose, carry the trust/boundary signal.

## Components (build these from the tokens above)

Source of truth: `design/05-knowledge-core/`, `design/06-interfaces/knowledge-viewer.md`.

- `NodeCard` (per entity type), `ProvenanceGraph` (edges: supports/contradicts/cites/derived-from/supersedes),
  `BoundaryBadge` (public/internal/confidential), `TrustBadge` (T0–T3 + contested), `EvidenceLink`,
  `SearchBox` (FTS), `FilterBar` (boundary/visibility/type/trust/concept).
- **Primitives** (shadcn/ui + Radix): Badge, Tabs, Tooltip, ScrollArea, Dialog.

## Design system stack (Open Design → code)

`DESIGN.md` → DTCG `*.tokens.json` → Tailwind v4 theme → shadcn/ui + Radix. The viewer is read-only and renders
from the derived index; it never bypasses the evidence gate.

## Notes for Open Design

- Starter palette — refine for AA. Boundary/trust colors are **semantic and must stay distinguishable** (incl. color-blind-safe).
- Compact density (graph + tables). This product's UI surface is small; do not over-build.
