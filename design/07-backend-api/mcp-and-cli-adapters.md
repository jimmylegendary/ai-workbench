# MCP & CLI Adapters — CAW-01

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [api-surface.md](./api-surface.md), [../01-decisions/ADR-0001-product-surface.md](../01-decisions/ADR-0001-product-surface.md), [../02-research/product-surface-and-stack.md](../02-research/product-surface-and-stack.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## Purpose

Define how the MCP server and CLI expose the **same** `@caw/core` operations as the web app, and what a "skill"
means in the Company AI Workbench. All three surfaces are thin; the contract is [api-surface.md](./api-surface.md).

## Principle

One core, three surfaces. The MCP and CLI add **no domain logic** — they map their primitives to core operations
([ADR-0001](../01-decisions/ADR-0001-product-surface.md)).

## MCP tool catalog (maps to core ops)

| MCP tool | Core op |
| --- | --- |
| `experiment.create/update/get/list` | `ExperimentService.*` |
| `run.start/status/stop` | `RunService.*` (status streams/polls) |
| `registry.models/serving/hwparts/strategies` | `RegistryService.*` |
| `worktree.saveItem/saveAll/branch/diff/history` | `WorkTreeService.*` |
| `evidence.metrics/projection/trustStatus/registerArtifact` | `EvidenceService.*` |

This lets other agents in the substrate drive the workbench programmatically.

## CLI command catalog (maps to core ops)

```
caw experiment create|update|get|list
caw run start <exp> [--axes ...] [--backend analytical] ; caw run status <run> --follow ; caw run stop <run>
caw worktree save-item <exp> <path> | save-all <exp> -m "msg" | branch <exp> <from> <name> | diff <a> <b>
caw evidence metrics <run> | projection <exp> --refs ... | trust <run>
caw registry models|serving|hwparts|strategies
```

## What a "skill" is here

A **skill** packages a reusable workbench *workflow* (a sequence of core ops with a clear input/output) and
exposes it — typically via MCP — so it can be reused by other agents. Skills are compositions over the contract,
not new domain logic.

## Auth & scoping

Single-user in v1; surfaces share the same local credentials/config. MCP tool scoping (read-only vs mutating) is
a TODO(open-question) for multi-agent use.

## Open questions

- Whether the MCP server streams run status or only polls in v1 — TODO(open-question).
- Skill packaging format (manifest) — align with the broader Company AI Workbench skill registry; TODO(open-question).

## Implications for runbooks

Phase-5 builds the MCP server + CLI as thin maps over the already-implemented core; no business logic is added.
