# API & MCP — CAW-03

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [cli.md](./cli.md), [../07-backend-api/api-surface.md](../07-backend-api/api-surface.md), [../01-decisions/ADR-0001-product-surface.md](../01-decisions/ADR-0001-product-surface.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

The API + MCP surfaces: thin maps from transport to the op-manifest governed operations. No domain logic here.

## MCP tool catalog (→ op-manifest)

| MCP tool | Op | Notes |
| --- | --- | --- |
| `import_bundle` | import_bundle(sourceRef) | via SourceAdapter |
| `build_ledger` | build_ledger(bundleId) | refs to CAW-02 |
| `gate_claims` | gate_claims(ledgerId, profile) | fail-closed |
| `assemble_inputs` | assemble_inputs(gatedSetId) | gated only |
| `draft_paper` | draft_paper(artifactId) | PaperOrchestra |
| `draft_patent` | draft_patent(artifactId) | PatentEngine |
| `run_novelty` | run_novelty(ledgerId) | citation_pool + radar |
| `review` | review(artifactId) | checklist + scores |
| `publish` | publish(artifactId, sinkRef) | **confirmation required**; interlock + confidentiality |

## Human-gate ops

`publish` and any patent filing-related op require **explicit confirmation** (agents cannot auto-publish/file). The
patent-first interlock + confidentiality are enforced in the core regardless of surface.

## Typing

All tool IO uses the core's Zod-typed op contracts ([../07-backend-api/api-surface.md](../07-backend-api/api-surface.md)).
The same contract backs the REST API (route handlers) and the CLI.

## Auth / scoping

Read vs mutating tools are distinguished; mutating + human-gate tools require elevated confirmation. Single-user v1;
per-adapter secrets via env refs.

## Open questions

MCP scoping granularity; whether `run_novelty` is read-only or mutates flags — see
[../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks

The API/MCP runbook generates the tool catalog from the op-manifest and wires confirmation on human-gate ops.
