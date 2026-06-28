# RB-020: Stand up the Astro 5 + Starlight SSG that renders content collections to static HTML

- Status: ready
- Phase: phase-2-build-and-publish
- Depends on: [RB-010 (import + ContentSource), RB-011 (core public-safe re-check), RB-012 (git content store + sidecar split), RB-002 (content-model types + public projection)]
- Implements design:
  - [../../05-publishing-core/rendering-web-and-api.md](../../05-publishing-core/rendering-web-and-api.md) (§1 one-source pipeline, §5 build invariant)
  - [../../07-backend-api/build-and-publish-service.md](../../07-backend-api/build-and-publish-service.md) (build pipeline stages, boundary assert, verify-output)
  - [../../01-decisions/ADR-0006-web-stack.md](../../01-decisions/ADR-0006-web-stack.md) (Astro 5 + Starlight, SSG)
  - [../../01-decisions/ADR-0002-content-model.md](../../01-decisions/ADR-0002-content-model.md) (public projection, sidecar)
- Produces: an Astro 5 + Starlight project that loads `src/content/{tips,skills,workflows,playbooks}/<slug>/<semver>.md(x)` as typed content collections, asserts `boundary === "public"` for every record, applies the public projection (strips the audit sidecar), and emits static HTML pages into `dist/`.

## Objective

"Done" means: running the SSG build over the frozen git corpus produces a `dist/` tree of static HTML pages — one canonical page per published `(type, slug)` plus a pinned page per `(type, slug, semver)` — with **no** server runtime and **no** live path to any internal store. The build is **fail-closed**: any record whose `boundary !== "public"` or whose `provenance.public_safe_recheck !== "passed"` aborts the whole build, and any audit-only field (`origin_ref`, `origin_version`) reaching a rendered page aborts the build. The audit sidecar (`<semver>.audit.json`) is never loaded into the render corpus. This runbook delivers the HTML surface only; RB-021 adds the JSON/markdown/manifest/MCP emitters over the same `getCollection()` corpus; RB-022 deploys the artifact.

## Preconditions

- [ ] RB-012 complete: the git content store exists at `src/content/{tips,skills,workflows,playbooks}/<slug>/<semver>.md(x)` with at least one validated Skill written **after** the core re-check, plus its `<semver>.audit.json` sidecar.
- [ ] RB-002 complete: TypeScript content-model types + `toPublicProjection()` exist and exclude `origin_ref`/`origin_version`.
- [ ] RB-011 complete: the public-safe re-check is a CORE stage; records on disk already carry `boundary: "public"` and `provenance.public_safe_recheck: "passed"`.
- [ ] Node LTS + a package manager are available; the tree is green (compiles, lints) at the RB-012 checkpoint.
- [ ] No network access to any internal/upstream store is required by the build (verify there is no such dependency).

## Steps

1. **Scaffold the Astro 5 + Starlight project.**
   - Do: Create the Astro app with the Starlight integration in the product repo (`astro`, `@astrojs/starlight`), `output: "static"` in `astro.config.mjs`. Point Starlight at the four content types. Do NOT add any SSR adapter or runtime data source.
   - Verify: `astro build` on the empty scaffold exits 0 and writes `dist/index.html`; `grep -r "output:" astro.config.mjs` shows `static`; no `@astrojs/node`/SSR adapter is installed.

2. **Define content-collection schemas that match the entity frontmatter.**
   - Do: In `src/content.config.ts` declare collections `tips, skills, workflows, playbooks` with a Zod schema for the common fields (`id, kind, title, summary, version, safety_boundary, tags, inputs, outputs, preconditions, provenance, digest`) and type extensions (`steps[]` for workflows, `contains[]` for playbooks). The schema MUST forbid unknown keys via `.strict()` so a stray audit field is a schema error. Do NOT include `origin_ref`/`origin_version` in any schema.
   - Verify: A unit test loads a known-good fixture and passes schema validation; a fixture containing `origin_ref` fails validation with `SCHEMA_NONCONFORMANT`.

3. **Exclude the audit sidecar from the render corpus.**
   - Do: Ensure the content loader globs only `*.md`/`*.mdx`, never `*.audit.json`. Add an explicit loader exclude for `**/*.audit.json`.
   - Verify: `getCollection("skills")` in a test returns entries with no `origin_ref`/`origin_version`; a test asserts no `.audit.json` content appears in any loaded entry.

4. **Implement the fail-closed boundary assertion as a build gate.**
   - Do: Add a build-time module run before rendering that iterates every record from `getCollection()` across all four collections and asserts, per record: `boundary === "public"` AND `provenance.public_safe_recheck === "passed"`. On any failure throw with `BOUNDARY_NOT_PUBLIC` and the offending `(type, slug, semver)`, aborting the build. This is the API-side backstop behind the core re-check (rendering doc §5), not a trust of upstream.
   - Verify: With a fixture flipped to `boundary: "internal"`, `astro build` exits non-zero with `BOUNDARY_NOT_PUBLIC`; with all-public fixtures it exits 0.

5. **Apply the public projection at the render boundary.**
   - Do: Route every entry through `toPublicProjection(entry)` before it reaches a page component, so audit-only fields cannot be referenced in templates. Render Starlight pages from the projected record only.
   - Verify: A test asserts `toPublicProjection()` output has no `origin_ref`/`origin_version`; a TypeScript check confirms page components consume the projected type, not the raw on-disk type.

6. **Generate canonical + pinned HTML routes.**
   - Do: Add `getStaticPaths` pages: canonical `/{type}/{slug}/` (latest published semver, moving) and pinned `/{type}/{slug}/v/{semver}/` (immutable). The canonical page links to its pinned versions and shows the resolved `semver` + `digest`.
   - Verify: `dist/` contains `skills/<slug>/index.html` and `skills/<slug>/v/<semver>/index.html` for the seeded Skill; the canonical page's resolved semver equals the newest published version.

7. **Add the post-render verify-output leak scan for HTML.**
   - Do: After `astro build`, run a verifier over `dist/**/*.html` that fails (`LEAK_DETECTED`) if any rendered page contains an audit-only field name/value or a known confidential pattern. Wire it as a build step so a green build implies a clean HTML surface.
   - Verify: Injecting `origin_ref` into a rendered fixture makes the verifier exit non-zero; the clean corpus passes.

8. **Wire build + checks into one command and keep the tree green.**
   - Do: Add an npm script (e.g. `build`) that runs schema validation → boundary assert → `astro build` → HTML leak scan in order, and a `lint`/`typecheck` script. Ensure CI fails on any stage failure.
   - Verify: `npm run build` exits 0 on the clean corpus and produces `dist/` HTML; `npm run lint && npm run typecheck` exit 0.

## Acceptance criteria

- [ ] `npm run build` produces `dist/` with a canonical and a pinned HTML page for the seeded Skill.
- [ ] Content collections load only `*.md(x)`; `*.audit.json` is never in the corpus (test-proven).
- [ ] Schemas are `.strict()`; an `origin_ref`-bearing fixture fails schema validation.
- [ ] Build aborts (`BOUNDARY_NOT_PUBLIC`) on any non-public / non-passed-recheck record.
- [ ] Pages render from `toPublicProjection()` output; no audit-only field is referencable in templates.
- [ ] The post-render HTML leak scan fails on an injected audit field and passes on the clean corpus.
- [ ] No SSR adapter, no runtime data source, no internal-store dependency exists in the build.
- [ ] `lint` + `typecheck` are green.

## Rollback / safety

- The build is fail-closed: any mid-way assertion failure aborts before `dist/` is finalized, so a broken or leaky corpus never produces a deployable artifact. Nothing in this runbook deploys.
- If the scaffold is wrong, delete the Astro project dir and re-run step 1; the git content store (RB-012) is untouched.
- Never relax `.strict()` schemas or the boundary assert to make a build pass — a failing boundary/leak check is a correct stop, not a bug.

## Hand-off

RB-021 can assume: a working Astro 5 + Starlight SSG with typed `getCollection()` over the four collections, a fail-closed `boundary==public ∧ public_safe_recheck==passed` gate, the audit sidecar excluded, and `toPublicProjection()` applied at the render boundary. RB-021 adds JSON/raw-markdown/`manifest.json`/`SKILL.md`/`index.json`/MCP emitters over the **same** corpus for web/API parity. RB-022 consumes the resulting `dist/` artifact for deploy.
