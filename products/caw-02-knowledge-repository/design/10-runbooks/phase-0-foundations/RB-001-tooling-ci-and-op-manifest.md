# RB-001: Tooling, CI, the op manifest, and codegen of thin adapters

- Status: ready
- Phase: phase-0-foundations
- Depends on: [RB-000]
- Implements design: [component-boundaries.md §"one op manifest → codegen'd adapters"](../../03-architecture/component-boundaries.md), [tech-stack.md §"one op manifest → codegen'd thin adapters"](../../03-architecture/tech-stack.md), [repo-structure.md §manifest/schemas](../../03-architecture/repo-structure.md)
- Produces: lint + typecheck + test runner config; a CI pipeline (build + lint + test + schema-validate); `manifest/ops.yaml` (the single op declaration); `src/codegen/` generating MCP tool defs + CLI subcommands + API routes + shared JSON-Schema/zod from the manifest; a boundary (import-direction) lint enforcing `adapters → core/* → store/*`; a parity contract test stub

## Objective
The repo gains its quality gates and its single source of operation truth. `manifest/ops.yaml` declares the `kr.*` op catalog (each op once: name, kind, idempotency, confirm policy, input schema, errors). A codegen step in `src/codegen/` turns that manifest into the three thin adapter surfaces (MCP/CLI/API) plus the shared validation schema — adapters hold NO logic. A boundary lint fails any import that violates the dependency direction. A parity contract test stub asserts all three surfaces expose an identical op set. "Done" = CI runs lint + typecheck + test + schema-validate green, codegen is deterministic (re-running produces no diff), and the boundary lint catches a planted violation. Real op bodies are NOT implemented here — only the manifest, the generators, and the gates.

## Preconditions
- [ ] RB-000 complete: compiling TS workspace, `manifest/`, `src/codegen/`, `schemas/`, `tests/` exist.
- [ ] Version pins for `zod`, `zod-to-json-schema`, the MCP SDK, the CLI lib, and the HTTP framework chosen (resolve the `tech-stack.md` `TODO(open-question)` pins now; record in `README.md`).
- [ ] You have read the op catalog in `component-boundaries.md` (writes: `add_source, extract_claims, attach_evidence, synthesize_note, classify_signal, record_decision, link, import_projection`; reads: `search, get, export_bundle, verify_audit`).

## Steps

1. **Lint + format + typecheck config.**
   - Do: Add ESLint + a formatter and an `import/order`-capable plugin; add `tsc --noEmit` as the typecheck script. Add `lint`, `typecheck`, `format:check` npm scripts.
   - Verify: `npm run lint`, `npm run typecheck`, `npm run format:check` each exit 0 on the scaffold.

2. **Test runner.**
   - Do: Add a test runner (e.g. `vitest`/`node:test` — pin per stack) with a `test` script discovering `tests/**` and inline `*.test.ts`.
   - Verify: `npm test` runs (0 tests or trivial passing test) and exits 0.

3. **Author the op manifest.**
   - Do: Write `manifest/ops.yaml` with one entry per op in the catalog above, using the illustrative shape in `component-boundaries.md`: `op`, `kind: write|read`, `idempotent`, `read_only_hint`, `confirm: agent_default` (writes), `input_schema` (the ONLY place a field is declared), `errors`. Critically encode the evidence gate structurally: `attach_evidence` has `claim_ref`, `artifact_ref` (required), `stance`, optional `locator` — and NO prose/summary field; `errors: [ERR_EVIDENCE_NOT_ARTIFACT, ERR_NOTE_AS_EVIDENCE]`.
   - Verify: a manifest-load test parses `ops.yaml` and asserts the catalog set equals the expected op names; `attach_evidence.input_schema` has no `prose`/`summary`/`text` key.

4. **Codegen: manifest → shared schema.**
   - Do: In `src/codegen/`, build the generator that emits a shared zod schema per op input and `zod-to-json-schema` JSON Schemas (the validation contract core will consume). Output to a generated dir (e.g. `src/codegen/_generated/` or `schemas/_generated/`).
   - Verify: running codegen produces one schema per op; `npx tsc --noEmit` passes on generated output.

5. **Codegen: manifest → three thin adapters.**
   - Do: Generate MCP tool defs + annotations (from `op`, `read_only_hint`, `confirm`, `input_schema`), CLI subcommands + flags (`--json`, `--idempotency-key`, `--yes`), and API routes (`POST /v1/<resource>` for writes, reads as documented). Generated adapter code MUST only marshal transport ↔ typed op call into `core/*` — no validation/gate/store access (enforced by Step 7).
   - Verify: generated adapter files exist for all ops across MCP, CLI, API; they import only from core op entrypoints (stubs) + generated schemas.

6. **Codegen determinism gate.**
   - Do: Add a `codegen:check` script that regenerates into a temp location and diffs against committed generated files; CI fails on drift (adapters are regenerated, never hand-edited — ADR-0001).
   - Verify: `npm run codegen` then `npm run codegen:check` exits 0; manually editing a generated file makes `codegen:check` fail.

7. **Boundary (import-direction) lint.**
   - Do: Add a lint rule (ESLint `no-restricted-imports`/`import/no-restricted-paths` or a small AST check in `scripts/`) enforcing the matrix in `component-boundaries.md`: `adapters/**` may import `core/**` op entrypoints + generated schemas but NOT `store/**`, `index/**`, or `core/*/{validate,evidence-gate,...}` internals; `core/**` may import `store/**`/`index/**`; nothing imports back up into `adapters`. Only `core/ingest` may write through `store/files`→`store/index` (documented; enforced further in later phases).
   - Verify: lint passes clean; a planted `import` of `store/index` inside `adapters/cli` fails the lint with a clear message; remove the plant.

8. **Parity contract test stub.**
   - Do: In `tests/`, add a parity test that loads `manifest/ops.yaml` and asserts each surface (MCP tool list, CLI subcommand list, API route table) exposes an identical op set derived from the manifest. It is a stub now (drives generated metadata, not live servers) but must fail if a surface is missing an op.
   - Verify: parity test passes; deleting one op from one generated surface makes it fail; restore.

9. **CI pipeline.**
   - Do: Add CI (e.g. GitHub Actions) running, in order: install → `codegen:check` → `typecheck` → `lint` (incl. boundary lint) → `test` (incl. parity) → schema-validate (validate fixtures against generated JSON Schemas; fixtures may be empty/placeholder until RB-002). Wire it to run on push/PR.
   - Verify: CI config is valid; a local `act`/scripted run (or the listed scripts run in sequence) all exit 0.

## Acceptance criteria
- [ ] `npm run lint`, `typecheck`, `test`, `format:check` all green.
- [ ] `manifest/ops.yaml` declares the full read+write op catalog; `attach_evidence` has no prose field (structural gate encoded).
- [ ] Codegen produces shared zod/JSON-Schema + MCP/CLI/API adapters; `codegen:check` exits 0 and detects hand-edits.
- [ ] Boundary lint passes clean and rejects a planted `adapters → store` import.
- [ ] Parity contract test asserts an identical op set across the three surfaces and fails on a missing op.
- [ ] CI runs build + lint + test + schema-validate in sequence and is green on the current tree.
- [ ] Generated adapters contain no validation/gate/store logic.

## Rollback / safety
- All artifacts are code/config, no canonical data touched. Revert with `git reset --hard <pre-RB-001>`. Generated files are reproducible from the manifest via `npm run codegen`, so deleting them is safe.

## Hand-off
- RB-002 can assume: a working test runner + CI, the shared schema generator, and that frontmatter zod schemas it adds will be picked up by the schema-validate CI step.
- Phase-1 (core) RBs can assume the op manifest exists and adapters are codegen'd thin shells calling `core/*` op entrypoints; they implement the op bodies behind those entrypoints.
- The boundary lint and parity test are now standing gates every later RB must keep green.
