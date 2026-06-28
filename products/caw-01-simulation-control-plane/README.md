# CAW-01 — Simulation Control Plane

A **standalone** simulation control plane: a domain expert's instrument for memory-centric
design-space exploration.

It carries one experiment end to end:

`(workload, hardware config, simulation config) → trace → memory-annotated IR → metric → comparable projection`

across three evidence axes — real measurement (service infra → OTel trace), synthetic
execution (syntorch → Chakra trace), and simulation (LLMServingSim + ASTRA-sim). The design
emphasizes a memory-annotated IR (L0/L1/L2 fill levels), a trust ladder for unbuilt-device
assumptions, and a control-plane UI (run status, evidence completeness, open questions,
blockers, next honest action) rather than a chatbot.

This is an independent product. It does not depend on any shared substrate; any use by other
products happens through an explicit export boundary.

## Design

The full design lives under `design/`:

- `design/README.md` — design index (English).
- `design/korean/` — Korean (KO) version of the design.

### Frontend / web app (UI)

The web app is designed to a buildable level and a skeleton is scaffolded:

- `DESIGN.md` — Open Design seed (9-section schema) → tokens for the design system.
- `design/06-frontend/` — app architecture (**MVVM**), **Supabase** auth + schema + RLS, routes & screens,
  and `prototype-briefs/` (per-screen Open Design Prototype-mode inputs).
- `design/01-decisions/ADR-0008-auth-and-data-supabase.md` — auth + metadata-only data boundary decision.
- `caw01-workbench/` — **Next.js + Supabase skeleton** (pnpm monorepo): `apps/web` (App Router, MVVM,
  auth-gated), `packages/core` (Zod schemas + ports), `packages/db` (Supabase migrations + RLS). Structure and
  wiring are in place; business logic + the Python engine connection are stubbed (`TODO`). See
  `caw01-workbench/README.md`.
</content>
