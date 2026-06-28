# RB-000: Scaffold the Astro 5 + Starlight repo and the hexagonal tree

- Status: ready
- Phase: phase-0-foundations
- Depends on: []
- Implements design: [../../03-architecture/repo-structure.md](../../03-architecture/repo-structure.md), [../../03-architecture/tech-stack.md](../../03-architecture/tech-stack.md), [../../01-decisions/ADR-0006-web-stack.md](../../01-decisions/ADR-0006-web-stack.md)
- Produces: a compiling, lint-clean Astro 5 + Starlight project with the full `src/{content,pages,core,ports,adapters,lib,components}` + `_audit/` tree, a gitignored `dist/`, and a pinned lockfile.

## Objective

A new, empty-but-well-typed CAW-04 product repo that **builds clean** (`astro build` succeeds) and contains the exact on-disk skeleton fixed by [repo-structure.md](../../03-architecture/repo-structure.md): the served corpus tree `src/content/{tips,skills,workflows,playbooks}/`, the physically separate `_audit/` sidecar tree, the hexagonal `src/core/`, `src/ports/`, `src/adapters/{sources,sinks}/` dirs, and the build-time API endpoint tree `src/pages/api/v1/`. No business logic yet — only directories, placeholder modules that type-check, and config. "Done" = the tree is green and an interrupted build resumes from a known checkpoint. This is **node A** of the DAG ([dependency-graph.md](../../09-roadmap/dependency-graph.md)); every later runbook depends on it.

## Preconditions

- [ ] PRODUCT-BRIEF and ADR-0002/0004/0005/0006/0007 are accepted.
- [ ] Node.js LTS + a package manager are available (record the exact versions in the pin table — do NOT invent; fill from the running toolchain).
- [ ] You are in an empty product repo directory `caw-04-tips-skills-web-api/` (its own git repo = source of truth, ADR-0005).

## Steps

1. **Initialize the project + pin the toolchain.**
   - Do: `git init`; create the Astro 5 project (the Starlight starter is acceptable as a base), then add the Starlight integration. Pin **exact** versions (no `^`/`~`) for Astro 5.x, Starlight, TypeScript in `package.json`, and commit the lockfile. Set `output: "static"` (SSG) in `astro.config.mjs` — there is NO SSR adapter on the public path (tech-stack §Web framework).
   - Verify: `package.json` lists exact pins; the lockfile exists and is committed; `astro.config.mjs` has `output: "static"`.

2. **Fill the version-pin table.**
   - Do: edit [../../03-architecture/tech-stack.md](../../03-architecture/tech-stack.md) "Version-pin summary" replacing the Node / TypeScript / package-manager / Astro / Starlight rows with the **actual installed versions**. Leave still-undecided rows (MCP SDK, CDN, digest algo) as `TODO(open-question: ...)`.
   - Verify: no invented values; every filled row matches `package.json`/lockfile.

3. **Create the served corpus tree + content collection schema stub.**
   - Do: create `src/content/{tips,skills,workflows,playbooks}/` (each with a `.gitkeep`). Create `src/content/config.ts` (Astro content collections) declaring the four collections; the Zod schemas are stubbed here as the common-field set only (`id, kind, title, summary, version, status, license, boundary, content_hash`) — full per-entity schemas land in RB-003.
   - Verify: `astro build` runs the content config without error (empty collections are valid); the four type dirs exist.

4. **Create the audit sidecar tree — physically separate, never served.**
   - Do: create `_audit/sidecar/` and an empty `_audit/_events.log` (placeholder for the hash-chained ledger, ADR-0003). Add a `_audit/README.md` stating: this tree is NEVER read by an endpoint and NEVER copied into `dist/` (the structural public-safe guarantee, repo-structure §Layout-rule 1).
   - Verify: `_audit/` is a sibling of `src/`, not under `src/content/`.

5. **Create the hexagonal core skeleton.**
   - Do: create `src/core/{model,recheck,redact,version,projection,gate}/` each with an `index.ts` exporting a typed placeholder (e.g. `export {}` or a TODO-bodied signature). Add a top comment in each: which ADR concept it owns and "core has NO I/O; imports ports only, never an adapter".
   - Verify: `tsc --noEmit` passes; no file under `src/core/` imports anything from `src/adapters/`.

6. **Create the ports + adapters + registry skeleton.**
   - Do: create `src/ports/ContentSourceAdapter.ts` and `src/ports/PublishSinkAdapter.ts` (empty `interface` placeholders; real signatures land in RB-002). Create `src/adapters/sources/{caw02-knowledge,caw03-skills-registry,stub-internal-wiki,stub-curated-bundle}/` and `src/adapters/sinks/{site-and-api,mcp-resources,stub-external-docs-host,stub-package-registry,stub-syndication}/`, each with a `.gitkeep`. Create `src/adapters/registry.ts` placeholder.
   - Verify: the directory set exactly matches [repo-structure.md](../../03-architecture/repo-structure.md) §Top-level tree; `tsc --noEmit` passes.

7. **Create the build-time API endpoint tree (empty routes).**
   - Do: create `src/pages/api/v1/` with placeholder endpoint files `index.json.ts`, `[type].json.ts`, and the `[type]/[slug]/` set (`index.json.ts`, `index.md.ts`, `versions.json.ts`, `versions/[semver].json.ts`, `versions/[semver].md.ts`, `manifest.json.ts`). Each exports a `GET` returning an empty/stub payload for now (real serialization is a phase-4 runbook). Create `src/pages/index.astro` and the `{tips,skills,workflows,playbooks}/[slug]/` page placeholders (`index.astro`, `v/[semver].astro`).
   - Verify: `astro build` emits the placeholder routes with no error.

8. **Create `lib/`, `components/`, `public/`, gitignore `dist/`.**
   - Do: create `src/lib/` (digest/canonical-serialize/manifest helpers — empty stubs), `src/components/` (placeholder, incl. future 410 tombstone component), `public/` (robots.txt, favicon, empty llms.txt). Add `dist/` and `node_modules/` to `.gitignore`. `dist/` is derived and gitignored (repo-structure §Layout-rule 4).
   - Verify: `.gitignore` contains `dist/`; `public/` exists.

9. **Green-tree checkpoint.**
   - Do: run a full `astro build` + `tsc --noEmit`.
   - Verify: both succeed; `dist/` is produced and is gitignored; `git status` shows no committed `dist/`.

## Acceptance criteria

- [ ] `astro build` succeeds on the empty skeleton; `dist/` is produced and gitignored.
- [ ] `tsc --noEmit` passes with zero errors.
- [ ] The directory tree matches [repo-structure.md](../../03-architecture/repo-structure.md) §Top-level tree exactly (served corpus, `_audit/` sidecar as a separate tree, `core/ports/adapters/lib/components`, `pages/api/v1/**`).
- [ ] `_audit/` is a sibling of `src/` and not referenced by any page or endpoint.
- [ ] No file under `src/core/` imports from `src/adapters/`.
- [ ] `package.json` has exact pins, a committed lockfile, and `output: "static"`; the tech-stack pin table is filled from the real toolchain (no invented values).

## Rollback / safety

- The runbook is additive scaffolding only; to undo, `git reset --hard` to the pre-scaffold commit (no published content exists yet, so nothing is frozen).
- Do NOT create any file under `_audit/` that an endpoint reads, and do NOT place sidecar files under `src/content/` — that would breach the public-safe-by-construction separation before any later guard exists.

## Hand-off

The next runbooks can assume: a compiling Astro 5 + Starlight repo; the full hexagonal + content + API directory tree; `src/content/config.ts` ready to receive the full per-entity schemas (RB-003); `src/ports/*` ready for real interfaces (RB-002); a separate, never-served `_audit/` tree. RB-001 adds tooling/CI + the boundary lint rule + the op-manifest; RB-002 fills the ports/registry; RB-003 fills the frontmatter schemas + versioning model.
