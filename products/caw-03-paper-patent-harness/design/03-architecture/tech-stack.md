# Tech Stack — CAW-03

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [system-architecture.md](./system-architecture.md), [repo-structure.md](./repo-structure.md), [../01-decisions/ADR-0002-writing-engine-integration.md](../01-decisions/ADR-0002-writing-engine-integration.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

The chosen stack per tier with reasons and version-pin TODOs.

## Stack table

| Tier | Choice | Why | Pin |
| --- | --- | --- | --- |
| Core language | TypeScript (strict) | one typed contract across surfaces + ports; consistent with CAW-01/02 cores | TODO |
| Surfaces | API (route handlers) + MCP server + CLI + minimal UI | drive the op-manifest; agents via MCP | TODO |
| Validation | Zod | typed op IO + capability descriptors + config schemas | TODO |
| Writing engine | **PaperOrchestra** via subprocess | wrap, don't rebuild ([ADR-0002](../01-decisions/ADR-0002-writing-engine-integration.md)) | TODO — PO suite version + outline.json/citation_pool schema |
| Engine runner | non-interactive PaperOrchestra entrypoint (TBD) | run its LLM/web/vision steps headless | TODO(open-question) |
| Patent engine | v1 baseline LLM-assisted drafter behind PatentEngine port | papers vs patents differ | TODO |
| Doc build | LaTeX → PDF (PaperOrchestra-produced) | submission-ready output | TODO |
| Storage | file + SQLite (governance data); artifacts by path | lightweight; consistent with siblings | TODO |
| Config/registry | config-driven adapter registry (e.g. entry-point groups) | open seams ([ADR-0005](../01-decisions/ADR-0005-ports-and-adapters.md)) | TODO |
| Novelty | reuse PaperOrchestra `citation_pool` + CAW-05 import | no re-query | n/a |
| Tests | Vitest (core), contract tests (ports/adapters), e2e (one paper) | per-tier verification | TODO |

## Critical pins to resolve

- **PaperOrchestra:** the non-interactive invocation mode + a pinned suite/schema version (EngineDescriptor.version).
- **Jurisdiction** for patent-first defaults (grace vs absolute novelty) — TODO(open-question).
- Secrets/auth per adapter live as **env refs** (no shared substrate).

## Boundaries reminder

Core depends only on ports; adapters never import core; PaperOrchestra runs out-of-process
([component-boundaries.md](./component-boundaries.md)).

## Open questions

Engine subprocess vs skill-mode invocation; per-adapter secret handling — [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks

Phase-0 turns this into package manifests + lockfiles + the PaperOrchestra invocation harness; pins recorded back here.
