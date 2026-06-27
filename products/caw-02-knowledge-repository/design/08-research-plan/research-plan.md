# Research & Validation Plan

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: review date — do not invent)
- **Related:**
  - [validation-and-tests.md](validation-and-tests.md)
  - [open-questions.md](open-questions.md)
  - [../01-decisions/ADR-0002-storage.md](../01-decisions/ADR-0002-storage.md)
  - [../01-decisions/ADR-0004-provenance-and-trust.md](../01-decisions/ADR-0004-provenance-and-trust.md)
  - [../01-decisions/ADR-0005-ingestion-pipeline.md](../01-decisions/ADR-0005-ingestion-pipeline.md)
  - [../01-decisions/ADR-0006-retrieval.md](../01-decisions/ADR-0006-retrieval.md)
  - [../01-decisions/ADR-0007-import-export-contracts.md](../01-decisions/ADR-0007-import-export-contracts.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

This doc enumerates the **open research / validation tracks** that must be resolved (or explicitly
deferred with a revisit trigger) before, during, and after the v0 build of CAW-02. Each track is a
bounded investigation with a hypothesis, a method, an exit criterion, an owning ADR, and a target
phase. It does NOT re-decide anything already fixed by an ADR or the PRODUCT-BRIEF — those are
elaborated, not redefined. The exhaustive list of unresolved questions lives in
[open-questions.md](open-questions.md); this doc converts the *decision-shaped* ones into actionable
tracks. Pass/fail acceptance tests live in [validation-and-tests.md](validation-and-tests.md).

## Phase model (referenced by every track)

These phase names are used throughout the design set. They are sequencing labels, not calendar dates.

| Phase | Theme | Scope (per PRODUCT-BRIEF) |
| --- | --- | --- |
| **P0** | Core append + retrieve + skill-wrap | md-in-git source of truth, SQLite derived index, FTS, evidence gate, boundary propagation, append-only events/audit |
| **P1** | Boundaries & exchange | import quarantine, fail-closed export allow-list, signed bundles, CAW-01/05/03 adapters |
| **P2** | Scale & semantics (trigger-gated) | embeddings sidecar, Postgres port, Apache AGE graph upgrade — only when measured triggers fire |

`TODO(open-question: calendar mapping for P0/P1/P2 — owned by 09-roadmap, not invented here.)`

## How to read a track

Each track below has: **Hypothesis / decision needed**, **Method**, **Exit criterion** (what makes it
resolved), **Owning ADR**, **Phase**, **Risk if unresolved**. A track is "done" only when its exit
criterion is met *and* the owning ADR's Open-Questions entry is struck and moved to `status: resolved`
in [open-questions.md](open-questions.md).

---

## Track R1 — Entity ID scheme

| Field | Value |
| --- | --- |
| Decision needed | Content-addressed hash vs sequential/typed slug for every entity's stable id (filename + frontmatter `id`). |
| Owning ADR | [ADR-0002](../01-decisions/ADR-0002-storage.md), shared with [ADR-0003](../01-decisions/ADR-0003-knowledge-data-model.md) |
| Phase | **P0** (blocking — IDs are baked into every file and edge) |

**Forces.** IDs must be (a) stable across re-index and git history, (b) human-diffable in PRs,
(c) compatible with the future Postgres/AGE port (ADR-0002), (d) usable as edge endpoints in the
generic edge table (ADR-0003). Content hashing gives free dedup + tamper-evidence but breaks on any
body edit (supersedes churns IDs); slugs are readable and stable but need a uniqueness allocator and
risk collisions on concurrent team writes (see R3).

**Method.**
1. Prototype both on a seed corpus of ~50 real entities (sources/claims/evidence/notes).
2. Measure: PR readability, rename/supersede behavior, collision rate under simulated concurrent adds,
   and whether `_events` JSONL + git blame stay reconcilable.
3. Candidate compromise to test: `type-prefixed ULID` for identity + a separate `content_hash`
   frontmatter field for tamper-evidence (decouples identity from content).

**Exit criterion.** One scheme chosen; `id` and (if adopted) `content_hash` fields fixed in the
frontmatter schema; reindex proven to preserve IDs (see deterministic-reindex test T3 in
[validation-and-tests.md](validation-and-tests.md)).

**Risk if unresolved.** Every other P0 runbook depends on the ID shape; cannot ship the data layer.

---

## Track R2 — Semantic dedup threshold & embedding choice

| Field | Value |
| --- | --- |
| Decision needed | Cosine-similarity threshold + embedding model for near-duplicate Claim/Source detection in ingestion (A4/B-stages). |
| Owning ADR | [ADR-0005](../01-decisions/ADR-0005-ingestion-pipeline.md), aligns with [ADR-0006](../01-decisions/ADR-0006-retrieval.md), [ADR-0007](../01-decisions/ADR-0007-import-export-contracts.md) |
| Phase | **P0** uses exact/normalized-string dedup only; **P2** for embedding-based dedup |

**Forces.** ADR-0006 fixes **no embeddings in v0**; dedup in P0 must therefore be lexical
(normalized text, DOI/arXiv/S2 id for Sources — see R6/dedup-authority). A cosine threshold is
meaningless until embeddings land *and* are tuned on real claims; picking a number now would be a
fabricated benchmark (forbidden by DOC-CONVENTIONS).

**Method.**
1. **P0:** ship exact + normalized-string + identifier-based dedup; log false-merge / missed-dup rates.
2. **P2 (trigger-gated):** when ADR-0006 embedding triggers fire, build a labeled set of true/near/
   non-duplicate claim pairs from the accumulated corpus; sweep threshold; pick the operating point
   that holds false-merge rate at/below a target to be set from data.
3. Confidential-boundary constraint: embedding model for `confidential` items must be **local-only**
   (no API egress) — see R4 and ADR-0006.

**Exit criterion (P2).** Threshold + model recorded with the measured pair-set it was tuned on; no
hard-coded number ships before that measurement.

`TODO(open-question: target false-merge ceiling — set from data, not assumed.)`

**Risk if unresolved.** Premature embedding adoption violates ADR-0006's measured-trigger discipline.

---

## Track R3 — Team write-concurrency model (Postgres-port trigger)

| Field | Value |
| --- | --- |
| Decision needed | How concurrent team writers are serialized: git PR/merge on files vs a write-through API that serializes appends. This is the **named Postgres-port trigger**. |
| Owning ADR | [ADR-0002](../01-decisions/ADR-0002-storage.md) |
| Phase | **P0** decides the v0 model; **P2** is the port if the trigger fires |

**Forces.** md-in-git is the source of truth. Append-only + supersedes means writes rarely conflict on
the *same* file, but the derived SQLite index and `_events` JSONL are single-writer artifacts. Two
viable v0 models:

| Model | Pros | Cons |
| --- | --- | --- |
| Git PR/merge | No server needed; review-by-default; full audit | Merge conflicts on `_events`/index; reindex needed post-merge; weak real-time consistency |
| Write-through API serializes | Single writer owns events+index; consistent | Requires a running service; becomes the contention point that triggers the Postgres port |

**Method.**
1. Define the **port trigger** precisely: e.g. sustained write contention or index-rebuild latency
   crossing a threshold under N concurrent writers (`TODO(open-question: N and latency threshold — measure)`).
2. Prototype both; run a concurrency harness (see validation T-concurrency) with simulated parallel
   `attach_evidence` / `synthesize_note` flows.
3. Decide v0 model; document the exact metric whose breach promotes to Postgres (ADR-0002 revisit).

**Exit criterion.** v0 concurrency model chosen; port trigger expressed as a measurable condition.

**Risk if unresolved.** Silent index corruption or lost `_events` entries under team load.

---

## Track R4 — Postgres / graph port trigger (engine swap, not data rewrite)

| Field | Value |
| --- | --- |
| Decision needed | The measurable conditions that promote SQLite→Postgres and the relational→Apache AGE graph engine. |
| Owning ADR | [ADR-0002](../01-decisions/ADR-0002-storage.md), retrieval impact [ADR-0006](../01-decisions/ADR-0006-retrieval.md) |
| Phase | **P2** (revisit-triggered) |

**Forces.** ADR-0002 fixes that a port is an **engine/query swap, not a data rewrite** (md-in-git
stays canonical; SQLite is disposable). Triggers named in ADR-0002: concurrent writers / index
contention (→ Postgres, see R3), and traversal depth/perf degrading beyond SQLite CTE-BFS range
(~100k-node order) or continual-learning greenlight (→ AGE).

**Method.**
1. Keep the reindex deterministic and engine-agnostic so the same `_events`/md produce either backend
   (proves the swap-not-rewrite claim — validated by T3).
2. Add lightweight telemetry: node/edge counts, deepest traversal used by retrieval, reindex wall time.
3. Treat the port as a runbook only when a trigger is *measured*, not anticipated.

**Exit criterion.** Trigger metrics instrumented; a documented go/no-go threshold for each port.

**Risk if unresolved.** Either premature complexity (early Postgres/AGE) or a wall hit with no plan.

---

## Track R5 — Redaction ruleset source-of-truth & sync

| Field | Value |
| --- | --- |
| Decision needed | Where the codename/fab/customer redaction regexes live, and how they stay in sync across import + export crossings **without becoming a shared dependency** between independent products. |
| Owning ADR | [ADR-0007](../01-decisions/ADR-0007-import-export-contracts.md), policy basis [ADR-0004](../01-decisions/ADR-0004-provenance-and-trust.md) |
| Phase | **P1** |

**Forces.** ADR-0007 mandates **re-redaction at every crossing** and a **fail-closed export
allow-list**; ADR-0004 forbids confidential data in public outputs. A shared library would violate the
independence contract (no shared substrate). But drift between CAW-02's ruleset and a producer's would
let confidential tokens through.

**Method / options.**

| Option | Independence | Sync risk |
| --- | --- | --- |
| Ruleset lives **inside CAW-02**, versioned in its repo | Full | CAW-02 owns its own egress safety; cannot police producers — acceptable since CAW-02 re-redacts on import too |
| Versioned ruleset **artifact** published, others copy-in | Full (copy, not link) | Manual version bumps; needs a `ruleset_version` field in the envelope |
| Shared package | **Violates** independence | Low drift but disallowed |

Chosen direction (to confirm): CAW-02 owns its ruleset; the import/export **envelope carries a
`redaction_ruleset_version`** so a mismatch is detectable and fails closed.

**Exit criterion.** Ruleset location fixed; envelope carries ruleset version; fail-closed behavior on
unknown/older version proven (export-leak test T4).

**Risk if unresolved.** Confidential leak on export — the highest-severity guardrail breach.

---

## Track R6 — Export signature scheme & dedup authority

| Field | Value |
| --- | --- |
| Decision needed | (a) Signature scheme for export bundles; (b) dedup authority precedence for Sources imported from CAW-05. |
| Owning ADR | [ADR-0007](../01-decisions/ADR-0007-import-export-contracts.md) |
| Phase | **P1** |

**(a) Signature scheme.** ADR-0007 requires **signed bundles**. Candidates:

| Scheme | Pros | Cons |
| --- | --- | --- |
| minisign | Tiny, simple keypair, easy verify | No envelope metadata standard |
| cosign | Ecosystem, transparency log option | Heavier; OCI-oriented |
| DSSE envelope | Typed payload + signature, attestation-friendly | More moving parts |
| Detached sig (raw) | Minimal | No payload-type binding |

Method: pick the lightest scheme that binds **payload type + ruleset version + producer breadcrumb**
into the signed body. Verify both directions (import verifies producer sig; export signs for consumer).

**(b) Dedup authority.** For CAW-05 Source intake, fix precedence — proposed: **DOI > arXiv id >
Semantic Scholar id > normalized-title+year**. The first resolvable identifier wins; lower-precedence
matches only *flag* for human review, never auto-merge.

**Exit criterion.** Signature scheme chosen + verify path tested; precedence ladder fixed and applied
in import (T5 quarantine test).

**Risk if unresolved.** Unverifiable provenance on bundles; duplicate Sources fragmenting the graph.

---

## Track R7 — Provenance tamper-evidence (hash chain)

| Field | Value |
| --- | --- |
| Decision needed | Whether `_events` provenance gets a hash chain / content addressing in v0, or as a later upgrade. |
| Owning ADR | [ADR-0004](../01-decisions/ADR-0004-provenance-and-trust.md) |
| Phase | **P0** (lightweight) vs **P2** (full) |

**Forces.** Git signed commits + blame already give an audit trail (ADR-0002). A per-event hash chain
in `_events/<ts>-<op>.jsonl` adds independent tamper-evidence but cost. R1's optional `content_hash`
field interacts here.

**Method.** Spike a cheap chained-hash (`prev_hash` per event line) and measure write/reindex cost;
decide whether git signing alone suffices for v0.

**Exit criterion.** Decision recorded; if deferred, a revisit trigger named in ADR-0004.

**Risk if unresolved.** Weaker audit guarantee than the brief's reconstructability goal may imply.

---

## Track R8 — Inter-product API auth (cross-cutting)

| Field | Value |
| --- | --- |
| Decision needed | Pull-API auth between independent products: static token vs mTLS vs signed-URL drop. |
| Owning ADR | [ADR-0007](../01-decisions/ADR-0007-import-export-contracts.md), surface impact [ADR-0001](../01-decisions/ADR-0001-product-surface-and-skill-interface.md) |
| Phase | **P1** |

**Method.** Default to **file-artifact drop (signed bundle on a path/URI)** per ADR-0007's
file-first stance; only add a pull API + auth if a producer cannot drop files. If a pull API is
needed, prefer mTLS for confidential-capable links; static token only for internal-boundary data.

**Exit criterion.** Auth model fixed per boundary class; recorded in ADR-0007.

---

## Track summary

| Track | Topic | Owning ADR | Phase | Blocking P0? |
| --- | --- | --- | --- | --- |
| R1 | ID scheme | ADR-0002/0003 | P0 | Yes |
| R2 | Dedup threshold + embedding | ADR-0005/0006 | P0 lexical / P2 vector | No |
| R3 | Team write-concurrency | ADR-0002 | P0 | Yes |
| R4 | Postgres/AGE port trigger | ADR-0002/0006 | P2 | No |
| R5 | Redaction ruleset sync | ADR-0007/0004 | P1 | No |
| R6 | Signature scheme + dedup authority | ADR-0007 | P1 | No |
| R7 | Provenance tamper-evidence | ADR-0004 | P0/P2 | No |
| R8 | Inter-product API auth | ADR-0007/0001 | P1 | No |

## Implications for runbooks

- R1 and R3 are **P0-blocking**: their runbooks (data layer, write-path) cannot start until resolved.
- Every track's exit criterion maps to a test in [validation-and-tests.md](validation-and-tests.md);
  a track is not "done" until that test passes and [open-questions.md](open-questions.md) is updated.
- P2 tracks (R2-vector, R4) must remain *trigger-gated*: no runbook ships them on speculation.
