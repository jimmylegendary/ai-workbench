# RB-042: API + MCP + CLI surfaces

- Status: ready
- Phase: phase-4-publish-interfaces-stubs
- Depends on: [RB-040, RB-041]
- Implements design: [../../06-interfaces/api-and-mcp.md](../../06-interfaces/api-and-mcp.md), [../../06-interfaces/cli.md](../../06-interfaces/cli.md), [../../01-decisions/ADR-0001-product-surface.md](../../01-decisions/ADR-0001-product-surface.md)
- Produces: thin API + MCP + CLI surfaces over the op-manifest

## Objective

Expose the op-manifest as API + MCP + CLI — thin adapters that add no logic, with confirmation on human-gate ops
(`publish`, patent filing).

## Preconditions
- [ ] Core ops implemented (phases 1–4). Op-manifest from RB-001.

## Steps
1. **Do:** Generate the MCP tool catalog + REST route handlers from the op-manifest; map 1:1 to core ops.
   **Verify:** `test:` `import_bundle`→`publish` reachable via MCP/REST against a test core.
2. **Do:** Build the CLI (`caw3 ...`) mapping 1:1; human + `--json` output.
   **Verify:** `test:` a CLI e2e of UC-1 (import→gate→assemble→draft→review→publish) on fixtures.
3. **Do:** Enforce confirmation on `publish`/filing ops; verify governance still runs in the core (not the surface).
   **Verify:** `test:` an agent MCP `publish` without confirmation is refused; interlock/confidentiality still apply.

## Acceptance criteria
- [ ] All three surfaces map the op-manifest; no domain logic in surfaces; human-gate ops confirmed.

## Rollback / safety
Thin surfaces; remove to roll back. Governance unaffected (lives in core).

## Hand-off
Milestone 1 is now demoable via CLI; RB-043 adds the future-connector stubs.
