# CLI — CAW-03

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [api-and-mcp.md](./api-and-mcp.md), [../07-backend-api/api-surface.md](../07-backend-api/api-surface.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

A scriptable CLI mapping 1:1 to the op-manifest. No domain logic; shares the core contract with API/MCP.

## Commands

```
caw3 import   <sourceRef>                       # import a CAW-02 bundle / CAW-01 results (via SourceAdapter)
caw3 ledger   build <bundleId>
caw3 gate     <ledgerId> --profile <p>          # fail-closed; prints blocked-claim backlog
caw3 assemble <gatedSetId>                       # engine-neutral inputs (gated only)
caw3 draft    paper  <artifactId>               # PaperOrchestra
caw3 draft    patent <artifactId>               # PatentEngine
caw3 novelty  <ledgerId>                         # citation_pool + CAW-05 radar; flags claims
caw3 review   <artifactId>
caw3 publish  <artifactId> --sink <sinkRef>      # confirm prompt; interlock + confidentiality enforced
caw3 adapters list|preflight                     # show registry + capability preflight
```

## Output

Human-readable by default; `--json` for machine use. `publish`/filing prompt for confirmation unless `--yes` (still
subject to interlock + confidentiality in the core).

## Open questions

Whether `--yes` is permitted for `publish` at all (leaning: never for patent-sensitive) — see
[../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks

The CLI runbook generates commands from the op-manifest; `adapters` commands expose the registry/preflight.
