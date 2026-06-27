# RB-051: CLI surface

- Status: ready
- Phase: phase-5-persistence-and-api
- Depends on: [RB-033]
- Implements design: [mcp-and-cli-adapters.md](../../07-backend-api/mcp-and-cli-adapters.md), [api-surface.md](../../07-backend-api/api-surface.md)
- Produces: `apps/cli` (`caw`) mapping commands to `@caw/core` operations

## Objective

A thin scriptable CLI (`caw`) that exposes the same core operations as the web/MCP surfaces — no added domain logic.

## Preconditions

- [ ] `@caw/core` services implemented. Shares DI wiring with the other surfaces.

## Steps

1. **Do:** Scaffold `apps/cli` with a command framework; map commands per [mcp-and-cli-adapters.md](../../07-backend-api/mcp-and-cli-adapters.md):
   `caw experiment …`, `caw run start|status --follow|stop`, `caw worktree save-item|save-all|branch|diff`, `caw evidence metrics|projection|trust`, `caw registry …`.
   **Verify:** `cmd: caw --help` lists the commands.
2. **Do:** Wire commands to core via the Zod contract; `run status --follow` streams.
   **Verify:** `test:` `caw experiment create` then `caw run start` then `caw run status --follow` works against a test core.
3. **Do:** Human-friendly output (tables/JSON flag) for projections/metrics.
   **Verify:** `view:` `caw evidence projection --refs …` prints a readable comparison (+ `--json`).

## Acceptance criteria

- [ ] CLI maps the core operations 1:1 (no domain logic added).
- [ ] Create/run/follow/save/evidence work from the terminal.
- [ ] Output is human-readable with a JSON option.

## Rollback / safety

Thin surface; remove the bin to roll back. Boundary rule enforced.

## Hand-off

All three surfaces (web, MCP, CLI) now sit on one `@caw/core`. CAW-01 v1 surface set is complete.
