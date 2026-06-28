# RB-001: Tooling, CI, the core→ports boundary rule, and the op-manifest

- Status: ready
- Phase: phase-0-foundations
- Depends on: [RB-000]
- Implements design: [../../03-architecture/repo-structure.md](../../03-architecture/repo-structure.md), [../../05-publishing-core/ports-and-adapters.md](../../05-publishing-core/ports-and-adapters.md), [../../01-decisions/ADR-0004-import-and-ports.md](../../01-decisions/ADR-0004-import-and-ports.md)
- Produces: lint + typecheck + test toolchain; a CI pipeline that gates every commit green; an enforced architecture boundary rule (core→ports only, adapters→ports only); and the typed **op-manifest** declaring the six operations (import, recheck, gate, version, build, publish, unpublish) as specs with NotImplemented bodies.

## Objective

The repo gains its quality gates and its operation contract. Lint, typecheck, and a test runner are wired and run in CI on every push; the tree must stay green at each acceptance checkpoint ([DOC-CONVENTIONS §6](../../_meta/DOC-CONVENTIONS.md)). An **architecture boundary rule** is enforced mechanically so the hexagon cannot rot: `src/core/**` may import only from `src/core/**` and `src/ports/**` (never from `src/adapters/**`), and `src/adapters/**` may import `src/ports/**` + `src/core/**` shared types but adapters never import each other. The **op-manifest** is added: a single typed module enumerating the six pipeline operations with their input/output value-object types and ordering, so later runbooks fill bodies against a fixed contract and no operation can be added that skips a stage. "Done" = CI is green, the boundary rule fails the build on a violation, and the op-manifest type-checks.

## Preconditions

- [ ] RB-000 complete: the tree compiles, `tsc --noEmit` passes, lockfile pinned.
- [ ] `src/ports/`, `src/core/`, `src/adapters/` directories exist.

## Steps

1. **Add linter + formatter with pinned config.**
   - Do: add ESLint (TypeScript-aware) + a formatter; pin versions exactly; add scripts `lint`, `format`. Configure for the Astro + TS project.
   - Verify: `lint` runs clean on the RB-000 skeleton.

2. **Add typecheck + test runner scripts.**
   - Do: add `typecheck` (`tsc --noEmit` / `astro check`) and a test runner (e.g. Vitest) with a `test` script and one trivial passing smoke test under `tests/`.
   - Verify: `typecheck` and `test` both pass.

3. **Enforce the core→ports boundary rule mechanically.**
   - Do: add an import-boundary lint rule (e.g. `eslint-plugin-boundaries` or `no-restricted-imports` zones) encoding:
     - `src/core/**` → may import `src/core/**`, `src/ports/**` only. **Importing `src/adapters/**` is an error.**
     - `src/adapters/**` → may import `src/ports/**` and shared types from `src/core/model/**`; **importing another adapter dir is an error.**
     - `src/pages/**` (build/serialize) may import `src/core/**` + `src/lib/**`; must NOT import `_audit/**` (the served-vs-audit firewall, repo-structure §Layout-rule 1).
   - Verify: add a temporary file in `src/core/` importing from `src/adapters/` → `lint` FAILS with an actionable message; remove it → `lint` passes.

4. **Add a regression test for the boundary rule.**
   - Do: add a test under `tests/` that asserts the boundary lint rule is configured (e.g. snapshots the config zones) so the rule cannot be silently deleted.
   - Verify: `test` passes; deleting a zone fails the test.

5. **Author the op-manifest as typed specs.**
   - Do: create `src/core/op-manifest.ts` declaring the six operations in fixed pipeline order with their value-object signatures (types are imported from `src/core/model/**`; full type bodies arrive in RB-002/RB-003 — placeholders are fine here as long as it type-checks):

     ```ts
     // src/core/op-manifest.ts — the fixed operation contract; the ONLY sanctioned pipeline.
     // Order mirrors the hexagon (ports-and-adapters §1); no op may be reordered or skipped.
     export type Op =
       | "import"     // ContentSourceAdapter.fetch -> CandidateItem            (source port)
       | "recheck"    // CORE public-safe re-check: CandidateItem -> RecheckVerdict (deny-by-default)
       | "gate"       // CORE curator approval: Verdict + Candidate -> Acceptance (Jimmy approves)
       | "version"    // CORE: assign semver + compute content-digest -> PublishableItem
       | "build"      // CORE serialize: PublishableItem -> static artifact inputs (projection strips sidecar)
       | "publish"    // PublishSinkAdapter.publish -> PublishReceipt              (sink port)
       | "unpublish"; // PublishSinkAdapter.unpublish -> 410 tombstone receipt    (sink port)

     export interface OpSpec<I, O> {
       op: Op;
       stage: "source-port" | "core" | "sink-port";
       /** ops that MUST have run before this one (enforces no-bypass) */
       requires: Op[];
       run(input: I): Promise<O>;   // NotImplemented body in phase 0
     }
     ```
     Annotate each: `recheck`, `gate`, `version`, `build` are `stage: "core"`; only `import` is `source-port`; `publish`/`unpublish` are `sink-port`. Emphasize in comments: **the public-safe re-check is a CORE op, never in an adapter; upstream boundary is evidence only; audit fields are stripped at `build` via the projection; versions, once produced, are immutable.**
   - Verify: `typecheck` passes; bodies throw `NotImplemented`.

6. **Add an op-manifest ordering invariant test.**
   - Do: add a test asserting the `requires` graph forces: `recheck` before `gate`, `gate` before `version`, `version` before `build`/`publish`, and that `publish` requires the full core chain (`import → recheck → gate → version`). This is the test-level expression of "no adapter can bypass the gate" (dependency-graph §Invariants).
   - Verify: the test passes; mutating an `OpSpec.requires` to drop `recheck` before `publish` fails it.

7. **Wire CI.**
   - Do: add a CI workflow running `install (frozen lockfile) → lint → typecheck → test → astro build` on every push/PR; fail the pipeline on any non-zero step.
   - Verify: CI runs green on the current tree; introducing a lint/boundary violation makes CI red.

## Acceptance criteria

- [ ] `lint`, `typecheck`, `test`, and `astro build` all pass locally and in CI.
- [ ] A `src/core/**` file importing `src/adapters/**` fails `lint` (boundary rule enforced), and a test guards the rule's existence.
- [ ] `src/pages/**` importing `_audit/**` fails lint (served-vs-audit firewall).
- [ ] `src/core/op-manifest.ts` declares all six operations (import, recheck, gate, version, build, publish/unpublish) with `stage` and `requires`; recheck/gate/version/build are `stage:"core"`.
- [ ] The ordering-invariant test enforces `import → recheck → gate → version → build/publish`; dropping a `requires` edge fails it.
- [ ] CI is green; a deliberate violation turns it red.

## Rollback / safety

- All additions are config/test scaffolding; revert via `git` to the RB-000 commit.
- Never relax the boundary rule to "warn" — it must be an **error** that fails CI, or adapters can grow a path around the core gate.
- The op-manifest `requires` edges are load-bearing safety constraints; do not weaken them in later runbooks — add bodies, not bypasses.

## Hand-off

The next runbooks can assume: a green CI with enforced lint/typecheck/test; a mechanically enforced hexagon boundary; and a fixed, typed op-manifest defining the only sanctioned pipeline order, into which RB-002 (ports/registry) and RB-003 (schemas/versioning), then the phase-1+ runbooks, fill real bodies. The re-check, gate, version, and build ops are reserved as **core** stages.
