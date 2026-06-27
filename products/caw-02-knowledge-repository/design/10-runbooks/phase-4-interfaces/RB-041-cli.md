# RB-041: Build the `kr` CLI mapping 1:1 to core ops

- Status: ready
- Phase: phase-4-interfaces
- Depends on: [RB-040 (op manifest + codegen + parity test), RB-021 (core txn), RB-031 (trust/boundary labels)]
- Implements design:
  - [../../06-interfaces/cli.md](../../06-interfaces/cli.md)
  - [../../06-interfaces/api-and-mcp.md](../../06-interfaces/api-and-mcp.md) (shared envelope, scopes)
  - [../../01-decisions/ADR-0001-product-surface-and-skill-interface.md](../../01-decisions/ADR-0001-product-surface-and-skill-interface.md)
  - [../../09-roadmap/milestones-and-phases.md](../../09-roadmap/milestones-and-phases.md) (P4 / M3)
- Produces: the `kr` CLI generated from the same op manifest — one subcommand per core op; global flags (`--json`, `--idempotency-key`, `--yes`, `--boundary`, `--visibility`, `--actor`, `--quiet/--verbose`); a human table renderer with trust/boundary badges; envelope + exit-code mapping; CLI registered into the cross-surface parity test.

## Objective
"Done" = a `kr` CLI exists where each subcommand maps 1:1 to a core op and is **generated from the same op manifest** as API/MCP (no third validation path, no extra logic). It validates against the same closed JSON Schemas, calls the same `core.invoke`, and emits the **same** canonical envelope under `--json` (byte-for-byte what API/MCP return) while rendering a human table by default. Writes prompt for confirmation by default (`--yes` skips); reads never prompt. Exit codes let scripts branch without parsing prose. The CLI joins the parity contract test so its op set + schemas can never drift from the other surfaces.

## Preconditions
- [ ] RB-040 landed: op manifest, shared schemas, `core.invoke`, the typed envelope, and the parity test harness exist.
- [ ] The core returns trust + boundary + visibility labels and the hydrated provenance chain on `search`/`get` (RB-031, RB phase-3 retrieval).
- [ ] Tree is green.

## Steps

1. **Generate subcommands from the manifest.**
   - Do: Emit one subcommand per op using the catalog in [cli.md §2](../../06-interfaces/cli.md): `kr add-source, extract-claims, attach-evidence, synthesize-note, classify-signal, record-decision, link, import, query, get, export, verify-audit`. Map each subcommand name to its `op` (`kr query`→`search`, `kr import`→`import_projection`, `kr export`→`export_bundle`). Add **no** `update`/`delete` subcommands (append-only; corrections via a new version + `kr link --rel supersedes`). Each subcommand only parses args, validates against the op's shared schema, and calls `core.invoke(op, args, actor)`.
   - Verify: `kr --help` lists exactly the 12 subcommands; `kr update`/`kr delete` do not exist; `kr add-source --help` shows flags derived from the op's schema.

2. **Implement global flags.**
   - Do: Add `--json`, `--idempotency-key <k>` (defaults to the op's natural key where defined), `--yes/-y`, `--boundary <public|internal|confidential>`, `--visibility <team|private>`, `--actor <id>` (defaults to OS user; labels audit only — grants no clearance), `--quiet/--verbose`, per [cli.md §3](../../06-interfaces/cli.md). The evidence subcommand exposes `--artifact-ref <kind:ref>` and has **no** prose flag.
   - Verify: `kr attach-evidence --help` shows `--artifact-ref` and no `--text`/`--summary`; flags parse on every subcommand.

3. **Wire idempotency + the shared envelope.**
   - Do: Carry idempotency via `--idempotency-key` (the CLI's carrier vs API header / MCP arg). Pass the resulting envelope straight through; under `--json` print it unmodified to stdout.
   - Verify: Running a write twice with the same `--idempotency-key` yields `status:"noop"` and the original id the second time; the `--json` body diffs byte-identically against the API response for the same op + args.

4. **Confirmation-by-default for writes.**
   - Do: Before executing any `kind:write` op, prompt for confirmation (mirroring MCP G6); `--yes` skips it (scripts). Reads never prompt. A declined prompt writes nothing and exits non-zero (usage/abort).
   - Verify: `kr synthesize-note ...` without `--yes` prompts; declining writes nothing to `knowledge/`; `--yes` proceeds and appends one `_events` line.

5. **Human renderer with trust/boundary badges.**
   - Do: Build the default human renderer per [cli.md §4](../../06-interfaces/cli.md): success shows id, key fields, the trust transition (e.g. `reported → corroborated`), and `audit ... (chain ok)`. `kr query` renders a table with `TRUST` and `BOUND.` badge columns plus the hydrated evidence chain; a Note is rendered as a generated note, **never** badged as evidence. `--json` returns the `RetrievalHit` envelope unchanged.
   - Verify: `kr query "GaN reliability" --type claim --boundary internal --min-trust corroborated` prints a badge table; the same command with `--json` returns the structured `RetrievalHit` set; a confidential item never appears for an under-cleared actor (same boundary-filtered read path).

6. **Exit-code mapping.**
   - Do: Map outcomes to exit codes per [cli.md §5](../../06-interfaces/cli.md): `0` ok/noop, `2` usage/bad flags, `5` `ERR_VALIDATION`, `7` auth/scope, `9` guardrail reject (`ERR_*`), `4` referenced entity not found. The exact `error.code` is always available under `--json`.
   - Verify: `kr attach-evidence --claim clm_x --artifact-ref note:nte_77c` exits `9` with `ERR_NOTE_AS_EVIDENCE`; a bad flag exits `2`; a missing claim exits `4`.

7. **Full transaction smoke test + parity registration.**
   - Do: Script the core knowledge transaction from [cli.md §6](../../06-interfaces/cli.md): `add-source → extract-claims → attach-evidence → synthesize-note`, then `kr export`. Register the CLI subcommand catalog into the RB-040 parity contract test so all three surfaces are asserted to share op set + schemas.
   - Verify: The smoke script completes end-to-end producing valid md under `knowledge/` and a signed bundle; the extended parity test (API + MCP + CLI) is green; dropping a subcommand from the manifest fails parity.

## Acceptance criteria
- [ ] One subcommand per core op, generated from the same manifest; no `update`/`delete`; no logic beyond arg-parse + render + confirm.
- [ ] `--json` output is byte-identical to the API/MCP envelope for the same op + args.
- [ ] Writes confirm by default; `--yes` skips; reads never prompt.
- [ ] `kr query`/`kr get` render trust + boundary badges and the hydrated provenance chain; a Note is never shown as Evidence; confidential items never leak to an under-cleared actor.
- [ ] Exit codes follow the documented table; `attach-evidence` with a note ref exits `9` (`ERR_NOTE_AS_EVIDENCE`).
- [ ] The CLI is registered in the parity contract test and CI is green.
- [ ] Tree is green at this checkpoint.

## Rollback / safety
- The CLI is generated; deleting the generated CLI module and re-running codegen restores a known state. No CLI step mutates the store except via `core.invoke`, so a failed/declined command leaves `knowledge/` and the index untouched (append-only: no partial entity).
- If the CLI is found to add validation or business logic, revert and move the logic into the core, not the adapter.

## Hand-off
- RB-042 (viewer) can assume a stable read path identical to the CLI's `kr query`/`kr get` (boundary-filtered, hydrated chain, trust/boundary badges) and may reuse the same envelope/`RetrievalHit` shape.
- Downstream import/export runbooks (phase-5) can assume `kr import` and `kr export` exist as thin wrappers over the core's `import_projection`/`export_bundle` ops with `kr:import`/`kr:export` scopes.
