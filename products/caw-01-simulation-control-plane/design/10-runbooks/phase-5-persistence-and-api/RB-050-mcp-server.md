# RB-050: MCP server surface

- Status: ready
- Phase: phase-5-persistence-and-api
- Depends on: [RB-033]   # core ops must exist; full value after phase-4
- Implements design: [mcp-and-cli-adapters.md](../../07-backend-api/mcp-and-cli-adapters.md), [api-surface.md](../../07-backend-api/api-surface.md), [../../01-decisions/ADR-0001-product-surface.md](../../01-decisions/ADR-0001-product-surface.md)
- Produces: `apps/mcp` exposing `@caw/core` operations as MCP tools

## Objective

A thin MCP server that maps `@caw/core` operations to MCP tools so external agents and tools can drive CAW-01
(an independent product) — with **no** added domain logic. This is CAW-01's own automation surface, not a shared
substrate for other products.

## Preconditions

- [ ] `@caw/core` services implemented (phase-1/3). RB-040+ make runs meaningful.

## Steps

1. **Do:** Scaffold `apps/mcp`; register tools mapping to core ops (`experiment.*`, `run.*`, `registry.*`, `worktree.*`, `evidence.*`) per [mcp-and-cli-adapters.md](../../07-backend-api/mcp-and-cli-adapters.md).
   **Verify:** `cmd:` the MCP server lists the expected tools.
2. **Do:** Wire tool inputs/outputs to the Zod contract; mutations and reads call core, streams poll/stream run status.
   **Verify:** `test:` `experiment.create` + `run.start`/`run.status` work via MCP against a test core.
3. **Do:** Add tool scoping (read-only vs mutating) — resolve OQ-16 or apply the documented default.
   **Verify:** `view:` scoping documented; OQ-16 updated.
4. **Do:** Add the "skill" packaging note (a skill = a reusable workflow over this product's own operations/tools).
   **Verify:** `view:` one example skill workflow documented.

## Acceptance criteria

- [ ] MCP server exposes the core operations as tools (no domain logic added).
- [ ] Create/run/status/save/evidence reachable via MCP.
- [ ] Scoping decided (OQ-16) and documented.

## Rollback / safety

Thin surface; disable the server to roll back. Boundary rule keeps logic in core.

## Hand-off

External agents and tools can now drive CAW-01 (an independent product) programmatically; RB-051 adds the CLI.
