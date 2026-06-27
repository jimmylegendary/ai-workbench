# Tech Stack — CAW-01

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [system-architecture.md](./system-architecture.md), [repo-structure.md](./repo-structure.md), all ADRs in [../01-decisions/](../01-decisions/)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## Purpose

The concrete, chosen technology per tier, with the reason and the version to pin. Pinned versions are
TODO(open-question) until the phase-0 runbook locks the lockfile.

## Stack table

| Tier | Choice | Why | Pin |
| --- | --- | --- | --- |
| Monorepo | pnpm workspaces + Turborepo | Multiple packages/surfaces on one shared core | TODO |
| Language (app) | TypeScript (strict) | One typed contract across surfaces | TODO |
| Web framework | Next.js (App Router) | Server shell + client islands; Server Actions ([ADR-0003](../01-decisions/ADR-0003-frontend-stack.md)) | TODO |
| UI state | Zustand (single store) | Cross-canvas coordination ([ADR-0004](../01-decisions/ADR-0004-canvas-rendering.md)) | TODO |
| Validation | Zod | The `@caw/core` contract | TODO |
| Canvas 1 & 2 | @xyflow/react (React Flow v12) | Node/edge graphs, typed handles | TODO |
| Canvas 3 | react-three-fiber + drei (3D) | HW hierarchy w/ LOD/instancing; Konva 2D fallback gated on spike ([ADR-0004](../01-decisions/ADR-0004-canvas-rendering.md)) | TODO |
| Design system | shadcn/ui + Radix + Tailwind v4 + DTCG tokens | "open design" code-as-source-of-truth ([ADR-0006](../01-decisions/ADR-0006-design-system-open-design.md)) | TODO |
| Core | `@caw/core` (TS, zero next) | Domain logic + ports ([ADR-0001](../01-decisions/ADR-0001-product-surface.md)) | n/a |
| Surfaces | Next.js / MCP server / CLI | Web primary; MCP+CLI automation | TODO |
| Engine | Python service | syntorch, LLMServingSim, ASTRA-sim, L0 lowering | TODO |
| Engine deps | syntorch (internal), vLLM (harness), LLMServingSim, ASTRA-sim (+SST flag), Chakra toolchain | The three axes ([ADR-0005](../01-decisions/ADR-0005-trace-pipeline.md)) | TODO — pin vLLM V0/V1, Chakra et_def.proto rev, ASTRA-sim rev |
| System of record | Postgres (prod) / **SQLite first, PG-portable** | Polyglot spine ([ADR-0002](../01-decisions/ADR-0002-data-layer.md)) | TODO |
| Semantic search | pgvector (in-DB, when needed) | No second store at this scale | TODO |
| Artifact store | filesystem / object store | Large trace blobs by path/URI | TODO |
| Tests | Vitest (TS), pytest (engine), Playwright (e2e) | Per-tier verification for runbooks | TODO |

## Critical version pins (must resolve in phase-0/research)

- **vLLM engine version** (V0 vs V1) and the exact torch API surface syntorch must satisfy.
- **Chakra `et_def.proto` revision** (schema still evolving under MLCommons).
- **ASTRA-sim revision** and which network backend(s) are wired (analytical default).

## Boundaries reminder

`@caw/core` has zero `next` dependency; the Python engine never runs in the Next.js process
([system-architecture.md](./system-architecture.md)).

## Open questions

Object-store choice (local FS vs MinIO/S3) is deferred to when scale demands it — TODO(open-question).

## Implications for runbooks

Phase-0 runbook turns this table into the actual `package.json`/`pyproject.toml` + lockfiles and records the
resolved pins back into this doc.
