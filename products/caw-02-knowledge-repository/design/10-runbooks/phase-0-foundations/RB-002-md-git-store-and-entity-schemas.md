# RB-002: Markdown+frontmatter entity store, per-type schemas, `_events` writer, signed-commit write path

- Status: ready
- Phase: phase-0-foundations
- Depends on: [RB-000, RB-001]
- Implements design: [storage-strategy.md §1,§2,§4](../../04-data-layer/storage-strategy.md), [repo-structure.md §knowledge/, §entity file shape, §_events/](../../03-architecture/repo-structure.md), [component-boundaries.md §store/files, §Audit](../../03-architecture/component-boundaries.md), [tech-stack.md §"storage: git + markdown"](../../03-architecture/tech-stack.md)
- Produces: `schemas/frontmatter/` zod schema per entity kind (invariant layer 1); `src/core/store/files` read/write of `.md` (frontmatter + body) with a deterministic, abort-on-fail write order; the append-only `knowledge/_events/<ts>-<op>.jsonl` writer + event row shape; the git signed-commit driver in `src/core/audit`; valid sample fixtures per kind that pass schema validation in CI

## Objective
The canonical store becomes real: one `.md` per entity (YAML frontmatter machine-contract + markdown body), one zod frontmatter schema per entity kind covering the common fields and edges, a `store/files` layer that reads/writes those files in the fixed file-first write order, an append-only `_events` JSONL writer that mirrors every write as one line, and the git signed-commit driver that records the audit ledger. "Done" = a fixture round-trips (write → read → byte-stable re-emit), the frontmatter schemas validate good fixtures and reject bad ones in CI, exactly one `_events` line is appended per write, and a signed commit is produced. The full transaction orchestration (validator/gate/trust/index mirror) is NOT built here — this RB builds the store + schema + ledger + commit primitives those later layers call.

## Preconditions
- [ ] RB-000 + RB-001 complete: `knowledge/**` dirs exist, `schemas/frontmatter/` exists, CI schema-validate step is wired, op manifest exists.
- [ ] `gray-matter` + `yaml` pins resolved (tech-stack); commit-signing approach decided — record the chosen key/signing config and the `created_via`/`created_by` conventions for human vs agent actors (resolve `tech-stack.md` `TODO(open-question: commit-signing key management)`).
- [ ] ID scheme decided enough to proceed (resolve `repo-structure.md` `TODO(open-question: ID scheme)` — e.g. `<kindprefix>_<...>`); record it.
- [ ] You have read the common fields + edge shape in `repo-structure.md` §"Entity file naming and shape" and the write order in `storage-strategy.md` §4.

## Steps

1. **Define the shared frontmatter base + edge schema.**
   - Do: In `schemas/frontmatter/`, write a zod base schema for the common fields: `id, kind, boundary ∈ {public,internal,confidential}, visibility ∈ {team,private}, trust (T0..T3|contested), status, supersedes (nullable), content_hash, created_by, created_at (RFC3339)`, and a generic `edges: [{rel, dst}]` array (the one typed-edge contract — ADR-0003). Mark `trust` as DERIVED (schema accepts it but it is never caller-set; validation that it is not author-supplied is a later-phase concern, note it).
   - Verify: a unit test parses a minimal valid base object and rejects one missing `boundary`/`visibility`.

2. **Define a zod schema per entity kind.**
   - Do: Extend the base for each of the 10 kinds (`source, claim, evidence, note, concept, interest, decision, open-question, assumption, signal`) with kind-specific fields (e.g. `source`: `artifact_uri`/`content_hash`; `claim`: `claim_type`, edges incl. `supports`/`evidence` rel; `note`: `generated:true`; `evidence`: `extracted_from` artifact ref / never prose; `signal`: RelatedWork/RadarSignal typing). Do NOT yet enforce the Claim→Evidence ≥1 cross-entity invariant here beyond the schema-level requirement that a claim's edge array is present — full enforcement is layers 2/3 (later phases); note this boundary.
   - Verify: each kind schema compiles; a test validates one good fixture per kind.

3. **Author sample fixtures.**
   - Do: Add one valid `.md` fixture per kind under `tests/fixtures/knowledge/<kind>/` (or directly demonstrate in `knowledge/` if desired), plus at least one intentionally invalid fixture per a few kinds (missing `boundary`, claim with empty edges, evidence with a prose field).
   - Verify: CI schema-validate (RB-001) passes all valid fixtures and fails all invalid ones.

4. **Implement `store/files` read.**
   - Do: In `src/core/store/`, implement a reader using `gray-matter` + `yaml` that loads a `.md`, splits frontmatter/body, parses frontmatter with the kind's zod schema, and returns a typed entity. Derive `file_path` from `knowledge/<kind>/<id>.md`.
   - Verify: a test reads each fixture and gets a typed object whose `kind` matches the directory.

5. **Implement `store/files` deterministic write + round-trip stability.**
   - Do: Implement a writer that serializes frontmatter with a STABLE key order and canonical YAML formatting (so reindex is byte-deterministic — `storage-strategy.md` §5) and writes `knowledge/<kind>/<id>.md`. Compute `content_hash = sha256` over the canonical content. Writes are append-only + supersedes: never in-place mutate; a correction writes a new id and sets the prior `supersedes`.
   - Verify: write → read → re-serialize is byte-identical (round-trip test); editing a field changes `content_hash`.

6. **Implement the file-first, abort-on-fail write order (store primitive).**
   - Do: Provide a `store.writeTxn(files[])` primitive that performs `storage-strategy.md` §4 steps it owns: write/append the `.md` file(s) first (source of truth), then (in later phases) hand off to index mirror + `_events` + commit. On any failure before commit, remove the just-written files so no orphan remains. (Validator, index mirror, and invariant re-check are wired in phase-1/2; leave typed seams/no-op hooks for them.)
   - Verify: a test simulating a mid-write failure leaves `knowledge/` unchanged (no orphan file).

7. **Implement the append-only `_events` writer.**
   - Do: In `src/core/audit`, implement appending exactly one JSONL line per write to `knowledge/_events/<ts>-<op>.jsonl` with shape `{seq, ts, op, node_id, actor, payload}` (per `repo-structure.md` §`_events/`). `_events` is content (committed, never gitignored). The event mirrors the write; it is append-only — never rewritten.
   - Verify: performing one write appends exactly one line; the line parses as JSON with the required keys; a second write appends a second line (monotonic `seq`/`ts`).

8. **Implement the git signed-commit driver.**
   - Do: In `src/core/audit`, drive the `git` CLI to stage the written `.md` + `_events` line and create a SIGNED commit (the audit ledger — `storage-strategy.md` §4 step 6, `tech-stack.md`). Use the actor/signing config from Preconditions. Commit only after the file write + event append succeed; abort (and roll back files per Step 6) on failure.
   - Verify: a write produces one signed commit (`git log --show-signature -1` shows a good signature) containing the entity file and its `_events` line; an induced failure produces no commit and no orphan file.

9. **Wire into CI.**
   - Do: Add the store/schema/events/commit unit tests to the test suite; ensure schema-validate covers `schemas/frontmatter/**`.
   - Verify: `npm test` and CI are green; boundary lint (RB-001) still passes (`audit`/`store` live under `core/**`, not imported by adapters).

## Acceptance criteria
- [ ] A zod frontmatter schema exists for all 10 entity kinds, sharing the common-field + generic-edge base.
- [ ] Valid fixtures pass and invalid fixtures (missing boundary, empty claim edges, prose-in-evidence) fail CI schema-validate.
- [ ] `store/files` read→write→re-read is byte-identical (deterministic serialization); `content_hash` is sha256 over canonical content.
- [ ] The write path is file-first and abort-on-fail: an induced mid-write failure leaves no orphan in `knowledge/`.
- [ ] Each write appends exactly one `knowledge/_events/<ts>-<op>.jsonl` line with `{seq, ts, op, node_id, actor, payload}`; `_events` is committed, not gitignored.
- [ ] A write produces exactly one signed git commit containing the entity file + its event line; `git log --show-signature` verifies.
- [ ] Append-only + supersedes is honored (no in-place mutation path exists).
- [ ] Tree is green (typecheck + lint + tests + boundary lint).

## Rollback / safety
- Canonical data now exists. To undo this RB before merge: `git reset --hard <pre-RB-002>` (discards the added schemas/store code AND any committed fixtures). Because writes are append-only + supersedes and every write is a signed commit, mid-build corrections are themselves commits — prefer a new superseding commit over history rewriting once shared. Never edit `_events` lines in place.

## Hand-off
- Phase-1 (core/reindex, RB-003) can assume: typed read/write of `knowledge/**` with deterministic serialization + `content_hash`, the `_events` JSONL ledger, and the signed-commit driver — so reindex can parse files + replay events, and the core can validate then commit.
- The full §4 write order's middle steps (validate → index mirror → invariant re-check) plug into the seams left in Step 6; phase-2 core wires them.
- The frontmatter schemas are layer 1 of the 3-layer Claim→Evidence invariant; the core validator (layer 2) and reindex re-check (layer 3) build on these exact schemas.
