# Validation & Tests

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: review date — do not invent)
- **Related:**
  - [research-plan.md](research-plan.md)
  - [open-questions.md](open-questions.md)
  - [../01-decisions/ADR-0003-knowledge-data-model.md](../01-decisions/ADR-0003-knowledge-data-model.md)
  - [../01-decisions/ADR-0004-provenance-and-trust.md](../01-decisions/ADR-0004-provenance-and-trust.md)
  - [../01-decisions/ADR-0002-storage.md](../01-decisions/ADR-0002-storage.md)
  - [../01-decisions/ADR-0006-retrieval.md](../01-decisions/ADR-0006-retrieval.md)
  - [../01-decisions/ADR-0007-import-export-contracts.md](../01-decisions/ADR-0007-import-export-contracts.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

This doc specifies the **acceptance tests that prove CAW-02's integrity invariants hold across every
surface**. These are not unit-test minutiae; they are the load-bearing guarantees that, if broken,
mean the product has failed its core promise. Each test states the invariant, the setup, the actions
across **all surfaces** (core, API, MCP, CLI — which are thin adapters over one op manifest per
ADR-0001), the expected result, and the owning ADR. It does NOT specify implementation; it specifies
*what must be true*. Open research that gates some tests is tracked in
[research-plan.md](research-plan.md) and [open-questions.md](open-questions.md).

## Test principles

1. **Surface-parity.** Because API/MCP/CLI are codegen'd thin adapters over one op manifest (ADR-0001),
   every invariant test runs **once per surface** plus directly against the core. A guarantee that
   holds in the CLI but not MCP is a build failure, not a quirk.
2. **Both layers, then reindex.** Invariants enforced in the three lockstep layers (frontmatter schema,
   core validator, reindex re-check — ADR-0003) must be tested at each layer independently.
3. **Fail-loud / fail-closed.** Boundary and export tests assert that ambiguity is *rejected*, never
   silently passed.
4. **Determinism.** Reindex and propagation tests assert byte/row-level reproducibility.
5. **No fabricated numbers.** Where a threshold is needed (recall, dedup), the test is marked
   `TODO(open-question)` and gated on the matching research track, not given an invented value.

## Test catalog

| ID | Invariant under test | Surfaces | Owning ADR | Severity |
| --- | --- | --- | --- | --- |
| T1 | Claim→Evidence (≥1) cannot be violated via any surface | core+API+MCP+CLI | ADR-0003 | Critical |
| T2 | Evidence gate rejects note/summary-as-evidence | core+API+MCP+CLI | ADR-0004 | Critical |
| T3 | Reindex is deterministic & idempotent | core | ADR-0002 | Critical |
| T4 | Boundary never leaks on export (fail-closed allow-list) | export adapter | ADR-0007/0004 | Critical |
| T5 | Import quarantine works (no auto-trust, confidentiality check) | import adapter | ADR-0007 | Critical |
| T6 | FTS + structured filter retrieval returns correct citations | retrieval | ADR-0006 | High |
| T7 | Append-only / supersedes — no destructive update or delete | core+all | ADR-0001/0002 | High |
| T8 | Monotone boundary/visibility propagation (no downgrade) | core | ADR-0004 | High |
| T9 | Write-concurrency: parallel writes keep events+index consistent | write path | ADR-0002 | High |

---

## T1 — Claim→Evidence invariant cannot be violated via any surface

**Invariant (ADR-0003).** Every `Claim` references ≥1 `Evidence`; enforced in **three lockstep
layers** — frontmatter schema, core validator, reindex re-check — identical across surfaces and across
SQLite/Postgres.

**Setup.** Empty repo; one valid `Source`.

**Actions & expected (run for core, API, MCP, CLI):**

| Attempt | Expected result |
| --- | --- |
| Create a `Claim` with zero `evidence` refs | **Rejected** at validator; no file written; no `_events` entry |
| Hand-write a `Claim` `.md` with empty `evidence:` and run **reindex** | Reindex **flags/quarantines** the orphan claim; does not index it as valid |
| Create `Claim` citing a non-existent `evidence_id` | **Rejected** (unresolvable ref) |
| Supersede a `Claim`'s only `Evidence` so the live claim loses all evidence | **Rejected** — supersede must keep ≥1 live evidence or also supersede the claim |
| Valid `Claim` with one resolvable `Evidence` | Accepted; indexed; `_events` append present |

**Pass criteria.** All four bad attempts fail at the layer they target; the reindex re-check
independently catches the hand-written orphan even though the validator was bypassed. Surface-parity:
identical outcomes across all four surfaces.

---

## T2 — Evidence gate rejects note/summary as evidence

**Invariant (ADR-0004).** The evidence gate is **structural**: `attach_evidence` has **no prose
field**, and `artifact_ref` MUST resolve to a real artifact. A `Note`/summary can **never** be
evidence.

**Actions & expected (all surfaces):**

| Attempt | Expected result |
| --- | --- |
| `attach_evidence` with a free-text string instead of `artifact_ref` | **Rejected** — no prose field exists in the op schema |
| `attach_evidence` whose `artifact_ref` points to a `Note` entity | **Rejected** — type check: Note is not an artifact-backed Evidence source |
| `attach_evidence` whose `artifact_ref` does not resolve to any artifact | **Rejected** — unresolved ref, fail-loud |
| `attach_evidence` to a `Source`/imported `Trace`/`SimulationRun` artifact | Accepted |
| Generated synthesis `Note` later referenced as evidence for a new `Claim` | **Rejected** — generated summary ≠ evidence (brief §10) |

**Pass criteria.** The op manifest provides no path to smuggle prose as evidence on any surface; every
Note-as-evidence attempt fails structurally, not by heuristic.

---

## T3 — Reindex is deterministic & idempotent

**Invariant (ADR-0002).** SQLite is a **derived, disposable** index rebuilt by a **deterministic,
idempotent** reindex from md-in-git + `_events`.

**Actions & expected:**

| Action | Expected result |
| --- | --- |
| Reindex from a fixed corpus twice into two fresh DBs | Row-for-row identical (stable ordering, stable IDs) |
| Delete the SQLite file and reindex | Reconstructs an index functionally identical to before |
| Reindex an already-current index (no md change) | No-op result; same content; safe to re-run |
| Reindex after a single `_events` append | Reflects exactly that delta; no drift in untouched rows |
| Reindex the same corpus under the future Postgres engine | Same logical rows/edges (proves engine-swap-not-rewrite) |

**Pass criteria.** Determinism verified by comparing dumps; idempotency by re-running with no diff.
FTS and vector live in **separate droppable migrations** (ADR-0006) — dropping/rebuilding them must
not affect relational rows.

`TODO(open-question: reconciliation when files are edited outside the skill interface — ADR-0002; test
must define expected reindex behavior for out-of-band edits.)`

---

## T4 — Boundary never leaks on export (fail-closed)

**Invariant (ADR-0007/0004).** Export uses a **fail-closed allow-list** with **re-redaction at the
crossing**; no confidential data in public outputs (brief §10).

**Actions & expected:**

| Attempt | Expected result |
| --- | --- |
| Export a bundle requested as `public` containing a `confidential` Claim | **Blocked** — item not on the public allow-list; export fails closed |
| Export where one cited Evidence is `confidential` but the Claim is `internal` | **Blocked** — whole chain must satisfy the target boundary |
| Export body containing a known codename/fab/customer token | **Re-redacted**; if redaction ruleset version is unknown/older, **fail closed** (see research R5) |
| Export of an item with an **unrecognized** boundary value | **Blocked** (default-deny, not default-allow) |
| Export of fully public-safe, allow-listed Claim+Evidence bundle | Accepted; bundle **signed**; provenance manifest attached |

**Pass criteria.** Default is deny; any ambiguity or ruleset mismatch fails closed; signed bundle +
provenance manifest accompany every successful export. This is the highest-severity guardrail.

---

## T5 — Import quarantine works

**Invariant (ADR-0007).** Import = **quarantine + confidentiality check**, then map to nodes;
**no silent auto-accept** (ADR-0005); agent submissions reviewed by default.

**Actions & expected:**

| Action | Expected result |
| --- | --- |
| Import a CAW-01 projection bundle | Lands in **quarantine**; not retrievable as trusted knowledge until reviewed |
| Import a bundle whose signature fails to verify | **Rejected** at the boundary |
| Import a bundle marked `confidential` into a public-capable deployment | Confidentiality check **blocks** general exposure; reference stored by URI with access mediation |
| Import CAW-05 signals; AI-authored claims | Trust **capped at T2** (ADR-0004); never auto-promoted |
| Import two Sources resolving to the same DOI | Deduped per precedence (research R6); lower-precedence match only **flags** for review |
| Imported summary blob with no artifact backing presented as Evidence | **Rejected** — evidence gate (T2) applies at the boundary too |

**Pass criteria.** Nothing imported is trusted-by-default; signature + confidentiality + evidence-gate
checks all run before promotion out of quarantine.

---

## T6 — FTS + structured-filter retrieval returns correct citations

**Invariant (ADR-0006).** Text retrieval = SQLite FTS5 (BM25); **structured filters (boundary,
visibility, type, trust, concept) are first-class and applied BEFORE ranking**; results **hydrate the
provenance chain**; RAG is **citation-constrained** (returns Claim+Evidence, never opaque blobs).

**Actions & expected:**

| Query | Expected result |
| --- | --- |
| Keyword query with `boundary=public` filter | Only public items returned; confidential never appears even if higher BM25 |
| Query with `visibility=team` while acting as a private-only actor | Private-scope filtering applied pre-rank; no leakage |
| Query with `type=Claim` + `trust>=T2` | Only matching typed/trust rows; each result carries its Evidence chain |
| RAG retrieval for a question | Returns Claim + its Evidence (artifact refs), **never** an opaque text blob or uncited summary |
| Filter excludes all candidates | Empty result (fail-loud "no grounded answer"), not a hallucinated/unfiltered fallback |

**Pass criteria.** Filters are applied before ranking (verified by injecting a high-BM25 confidential
decoy that must be absent); every returned item resolves its full provenance chain.

`TODO(open-question: recall/precision targets that would trigger embeddings — ADR-0006 triggers A–D;
no invented numbers here.)`

---

## T7 — Append-only / supersedes (no destructive write)

**Invariant (ADR-0001/0002).** Writes are **append-only + supersedes**; no update/delete;
confirmation-by-default for agent writes; git history is the audit.

**Actions & expected:**

| Attempt | Expected result |
| --- | --- |
| Op to hard-delete an entity | **Not exposed** by the op manifest on any surface |
| "Edit" a Claim | Realized as a **new version + supersedes** edge; prior version retained |
| Agent write without confirmation (default policy) | Held for confirmation; not committed silently |
| Inspect history of a superseded entity | Full chain reconstructable from git + `_events` |

**Pass criteria.** No code path mutates or removes a prior version; supersedes chains are intact and
auditable.

---

## T8 — Monotone boundary/visibility propagation

**Invariant (ADR-0004).** `boundary {public,internal,confidential}` and `visibility {team,private}`
are two orthogonal axes with **computed monotone propagation — synthesis never downgrades**.

**Actions & expected:**

| Scenario | Expected result |
| --- | --- |
| Note synthesized from one `internal` + one `confidential` Claim | Note computed as **`confidential`** (most-restrictive wins) |
| Note synthesized from `team`+`private` sources | Visibility resolves to **`private`** (no widening) |
| Attempt to manually set a synthesized Note to a looser boundary than its inputs | **Rejected** — would downgrade |
| Declassification/downgrade by an authorized actor | Allowed only via the explicit reclassification workflow with audit |

**Pass criteria.** Propagation is computed, monotone, and never silently widens exposure.

`TODO(open-question: reclassification/declassification authority + audit — ADR-0004.)`

---

## T9 — Write-concurrency consistency

**Invariant (ADR-0002).** Concurrent team writes keep `_events` JSONL and the derived index
consistent (this is the Postgres-port trigger — research R3).

**Actions & expected:**

| Scenario | Expected result |
| --- | --- |
| N parallel `attach_evidence` / `synthesize_note` flows | All append; no lost `_events` lines; reindex reconciles |
| Concurrent supersede of the same entity | Serialized; one wins, the other rebases or is rejected loudly — never silent loss |
| Index contention beyond the defined threshold | Surfaces the **port trigger** signal (does not corrupt) |

**Pass criteria.** No lost writes, no corrupt index; contention is observable as a port-trigger metric,
not data loss.

`TODO(open-question: N concurrent writers + latency threshold defining the port trigger — research R3.)`

---

## Coverage matrix (invariant → test)

| Invariant (source) | Test |
| --- | --- |
| Claim→Evidence ≥1, three lockstep layers (ADR-0003) | T1 |
| Evidence gate structural; summary ≠ evidence (ADR-0004, brief §10) | T2 |
| Derived index, deterministic idempotent reindex (ADR-0002) | T3 |
| Fail-closed export allow-list, no confidential in public (ADR-0007/0004) | T4 |
| Quarantine-on-import, no silent auto-accept (ADR-0007/0005) | T5 |
| FTS+filters-before-rank, citation-constrained RAG (ADR-0006) | T6 |
| Append-only + supersedes (ADR-0001/0002) | T7 |
| Monotone boundary/visibility propagation (ADR-0004) | T8 |
| Write-concurrency consistency (ADR-0002) | T9 |

## Implications for runbooks

- Each P0 data-layer / core / surface runbook must ship its slice of T1–T3, T6–T8 **green** before
  hand-off (DOC-CONVENTIONS §6 "leave the tree green").
- T4–T5 are P1 (boundaries) gates; T9 maps to research track R3 and gates the concurrency model choice.
- Surface-parity (test once per adapter) is mandatory because the adapters are codegen'd — a parity
  failure indicates the op manifest, not the adapter, is wrong.
