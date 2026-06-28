# ADR-0008: Artifact lifecycle state machine and minimal storage (refs-not-copies)

- Status: proposed
- Owner: Jimmy
- Last-reviewed: TODO(open-question: set on review)
- Related:
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md) (§6, §7)
  - [../02-research/confidentiality-and-artifact-lifecycle.md](../02-research/confidentiality-and-artifact-lifecycle.md) (research this ADR ratifies — §3, §4)
  - [./ADR-0002-writing-engine-integration.md](./ADR-0002-writing-engine-integration.md) (drafting transition records engine outputs + provenance)
  - [./ADR-0003-evidence-gate-and-claim-ledger.md](./ADR-0003-evidence-gate-and-claim-ledger.md) (evidence gate is the first conjunct of `gated`)
  - [./ADR-0004-patent-drafting.md](./ADR-0004-patent-drafting.md) (patent tail: attorney-review → ready-for-filing → filed)
  - [./ADR-0005-ports-and-adapters.md](./ADR-0005-ports-and-adapters.md) (drafting records adapter_id + engine_version)
  - [./ADR-0006-paper-ladder-and-novelty.md](./ADR-0006-paper-ladder-and-novelty.md) (novelty is the third conjunct; patent-first is a lifecycle state)
  - [./ADR-0007-confidentiality-and-boundary.md](./ADR-0007-confidentiality-and-boundary.md) (confidentiality gate is the second conjunct; egress re-gate)
- Source of truth: ../_meta/PRODUCT-BRIEF.md

## Context

The brief (§6) fixes the core domain as an **artifact lifecycle** —
`claim(s) → evidence gate → draft (engine) → review checklist → (paper PDF | patent draft)` — with **provenance
preserved end to end** and a **status/state machine per artifact**. The brief (§7) fixes the data principle: CAW-03
stores its **own minimal** governance/lifecycle state and **references** CAW-02 claims/evidence and CAW-01 results by
id/URI, large artifacts by path; storage should be lightweight, file/SQLite-friendly, consistent with the family.

The forces:

- **One state machine, two tails.** Paper and patent share the front (selection, evidence gate, confidentiality,
  novelty) and diverge only after `drafting`; the lifecycle must express both without forking the whole machine
  (ADR-0004, ADR-0002).
- **Gates are a conjunction, evaluated at the right edges.** Evidence (ADR-0003), confidentiality (ADR-0007), and
  novelty (ADR-0006) must all pass to reach `gated`; confidentiality must be **re-evaluated at egress**.
- **Provenance must be replayable.** A published artifact must answer "which evidence, which engine, which review, who
  approved" — so every transition needs a tamper-evident record pinned to the exact CAW-02/CAW-01 inputs.
- **Humans own publish/file/downgrade (brief §10).** AI agents cannot perform these transitions.
- **No duplication of upstream stores (brief §7, §1).** CAW-03 references by id/URI; it never copies the CAW-02 graph
  or CAW-01 runs. No shared runtime substrate.
- **Engine-agnostic (brief §5).** Swapping PaperOrchestra must change one config entry, not the lifecycle.

## Options considered

### A. Lifecycle shape

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **One state machine, shared front, branch at `approved` by `artifact_type` (chosen)** | Reuses the entire governed front; paper/patent diverge only at the tail | Tail states differ; needs an `artifact_type` discriminator | **Chosen** |
| Two independent state machines | Clear separation | Duplicates the front (gate/conf/novelty); drift risk | Rejected |
| Free-form status strings | Flexible | No invariants; not auditable; no replay | Rejected |

### B. Primary store

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **SQLite for structured state + content dir on disk for big artifacts; refs/digests not blobs (chosen)** | Lightweight, family-consistent, queryable; big files by path; git-committable event log | Two storage media to keep in sync | **Chosen** |
| Single SQLite with blobs | One file | Bloats DB with PDFs/traces; poor diff/git story | Rejected |
| Directory-of-files only (no DB) | Simple, git-native | Weak queries over lifecycle state; harder joins | Open question (final call here) — leaning SQLite+dir |

### C. Provenance / tamper-evidence

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Hash-chained append-only event log (CAW-02 `_events` shape) + git-committable JSONL (chosen)** | Tamper-evident; replayable; git blame = second witness | Append-only discipline; no in-place edits | **Chosen** |
| Mutable status column only | Simple | No history; not replayable; not auditable | Rejected |

## Decision

**1. One Artifact = one paper or one patent draft under governance.** It binds a selected claim set to a
confidentiality track, an engine run, a review, and a terminal output. The state machine is identical for paper and
patent up to `drafted`; the tail branches on `artifact_type` (ratifies research §3):

```
                 (evidence gate ∧ confidentiality gate ∧ novelty)        [ADR-0003 ∧ ADR-0007 ∧ ADR-0006]
  [selected] ───────────────► [gated] ──────► [drafting] ──► [drafted]
      │  claim set bound          │  pass        │ engine        │
      │                     fail  ▼              │ (port,        ▼
      └─────────────────────► [blocked] ◄───────┘  ADR-0002/04) [in_review]
                                  ▲   (engine error / track downgrade)        │ review checklist (+ autoraters)
              human reclassify /  │              changes requested            │
              add evidence /      └───────────────[changes_requested]◄────────┤
              file patent                                                     │ approved (egress re-gate, ADR-0007)
                                                                              ▼
                                                                         [approved]
                                                          ┌──────────────────┴──────────────────┐
                                              artifact_type=paper                    artifact_type=patent
                                                          ▼                  (attorney-review → ready-for-filing)
                                                  [published_paper]                        ▼
                                                       (terminal)                     [filed_patent] (terminal)

  side states (from any non-terminal): [withdrawn] (terminal), [superseded:<id>] (terminal)
```

The patent tail expands `approved → attorney-review → ready-for-filing → filed_patent` (the mandatory human/counsel
gate, ADR-0004); the paper tail is `approved → published_paper`.

**2. Gates are a conjunction, with re-gating on the way out and on upstream change.**
- `gated` requires **evidence gate ∧ confidentiality classification ∧ novelty** to pass; any failure → `blocked`
  with a typed reason (`EVIDENCE`, `BOUNDARY`, `NOVELTY`, `ENGINE`).
- Reaching `approved` **re-evaluates the confidentiality egress decision** for the *intended* sink (ADR-0007 §2.2): a
  public sink with an `internal-review-required` track returns to `blocked` (`BOUNDARY`) until a human
  reclassify/clearance.
- **Track is recomputed, not cached:** if the underlying claim set changes (claim added/reclassified/superseded
  upstream), the artifact is forced back to `gated` and the track + novelty verdict are recomputed — a stale `public`
  track or a lost-evidence claim can never persist to publish.

**3. Humans own publish/file/downgrade.** `approved → published_paper | filed_patent` and any boundary downgrade are
human-attributed events; agents cannot perform them (brief §10). Patent-first holds (ADR-0006/0004/0007) are enforced
here: a publish-bound artifact citing a `patent-first`/unfiled claim cannot leave `approved` for `published_paper`.

**4. Terminal states are append-only.** Corrections create a new artifact `superseded:<old_id>`, preserving the
published record. `withdrawn` and `superseded:<id>` are reachable from any non-terminal state.

**5. Provenance per transition.** Every transition appends one **hash-chained lifecycle event** (same shape as
CAW-02 `_events`: `seq`, `prev_hash`, `hash`, payload) recording `from_state`, `to_state`, `actor`
(`human:jimmy` | `agent:<engine>`), `timestamp`, `inputs` (claim ids/URIs, result-registry refs, **pinned bundle
digest**), `engine_version` + `adapter_id` (drafting transitions, ADR-0005), `boundary_eff` snapshot, and `reason`.
This makes `claim → … → paper|patent` fully replayable; `verify_lifecycle(artifact_id)` walks the chain and reports
the first break (mirrors CAW-02 `verify_audit`). The final artifact records the pinned `provenance_digest` so review
can confirm the draft was built from the exact gated evidence set (provenance carry-through, ADR-0003 §5).

**6. CAW-03 owns governance + lifecycle state; it references everything upstream (brief §7).**

| Datum | Owned / Referenced | Form |
|---|---|---|
| Artifact record (id, type, `lifecycle_state`, track, ladder slot) | **Owned** | SQLite row |
| Lifecycle event log (hash-chained transitions + provenance) | **Owned** | append-only JSONL (`_events`) |
| Claim-set binding (which claim ids/URIs this artifact uses) | **Owned (refs)** | join table → CAW-02 ids/URIs |
| Imported bundle snapshot (digest, ruleset_version, signature) | **Owned (snapshot)** | file + row; verified, not re-authored |
| Confidentiality track + egress decisions + redaction hits | **Owned** | rows + `_events` lines |
| Figure/table manifest (which result → which figure) | **Owned (refs)** | rows → CAW-01 result-registry refs |
| Review checklist + autorater scores | **Owned** | rows / JSON |
| Paper-ladder plan (P1/P2/P3 sequence + readiness) | **Owned** | rows |
| Adapter/config registry (Source/Engine/Patent/Sink/Novelty) | **Owned** | config file + row |
| Draft sources & compiled outputs (LaTeX, PDF, patent doc) | **Owned by path** | filesystem; row stores path + sha256 |
| Claims & evidence *content* | **Referenced** (CAW-02) | by id/URI inside the verified bundle |
| Simulation runs / projections / result content | **Referenced** (CAW-01) | by id/URI / result-registry ref |
| Novelty/threat radar signals | **Referenced** (CAW-05, separate product) | by id/URI |

**7. Storage shape: SQLite + content dir, refs/digests not blobs.** A single SQLite DB for structured state
(`artifact`, `artifact_claim`, `lifecycle_event`, `review`, `manifest`, `ladder`, `adapter_config`) plus a content
directory for large/opaque artifacts (`artifacts/<id>/draft.tex`, `.../paper.pdf`, `.../bundle.json`). Rows store
**refs and digests**: external knowledge as `caw02://claim/<id>` URIs, runs as `caw01://result/<id>`, local big files
as relative `path` + `sha256`. The lifecycle event log is **git-committable JSONL** so git blame is a second witness.

```
# illustrative — builder writes the real schema
artifact(id, type[paper|patent], state, conf_track, boundary_eff, ladder_slot, created, updated)
artifact_claim(artifact_id, claim_uri, bundle_digest)               # refs into CAW-02
lifecycle_event(seq, artifact_id, from_state, to_state, actor, ts,
                inputs_json, engine_version, adapter_id, boundary_eff, reason,
                prev_hash, hash)                                     # hash-chained
manifest(artifact_id, figure_id, result_ref, caption, path, sha256) # result_ref → CAW-01
review(artifact_id, checklist_json, autorater_scores_json, verdict, reviewer)
```

**8. The lifecycle is engine/source/sink-agnostic (brief §5).** `drafting` records `adapter_id` + `engine_version`,
so swapping PaperOrchestra (ADR-0002) for another engine is one config entry, not a lifecycle change. The gates read
only the ADR-0003/0006/0007 contracts and never a concrete adapter by name; a future source/sink plugs in as an
adapter (ADR-0005) without touching the state machine.

## Consequences

**Easier:**
- One auditable, replayable state machine covers both paper and patent; the governed front is written once.
- Every published artifact is replayable to its exact CAW-02/CAW-01 origins via the hash-chained log + pinned digest.
- Stale tracks/verdicts cannot persist (forced re-gate on upstream change), so a lost-evidence or reclassified claim
  is caught before publish/file.
- Lightweight, family-consistent storage; git is a second witness; engine swap is config-only.

**Harder / costs:**
- Two storage media (SQLite + content dir) must be kept in sync; orphan files must be reconciled (path + digest in
  rows mitigates this).
- Append-only discipline means corrections are new `superseded:<id>` artifacts, not in-place edits — more records,
  but a clean published record.
- Re-gate-on-change can force re-work; whether labels-unchanged edits can re-gate without re-running the engine is an
  open question.

**Follow-on work (runbooks):**
- RB (lifecycle): implement the state machine with the conjunction gate, egress re-gate, re-gate-on-change,
  human-only publish/file/downgrade, terminal append-only + `superseded` chain, hash-chained `lifecycle_event` +
  `verify_lifecycle`.
- RB (storage): create the SQLite schema (§7) storing refs/digests not blobs, the content dir, the git-committable
  JSONL event log; provide `verify_lifecycle`.
- RB (bundle-import + manifest): snapshot the bundle (digest + ruleset_version + signature), bind the claim set by
  URI, build the figure/table manifest 1:1 from CAW-01 result refs — never copy upstream content.

## Open questions / revisit triggers

- TODO(open-question: SQLite single-file vs directory-of-files as the primary store — final call here; leaning SQLite + content dir.)
- TODO(open-question: re-gating granularity — does any upstream claim change force a full re-draft, or can an artifact re-gate without re-running the engine when labels/evidence are unchanged?)
- TODO(open-question: how does CAW-03 detect a superseded CAW-02 bundle to trigger re-gate — poll, webhook, or re-import-on-build? cross-boundary with CAW-02, cross-links ADR-0003.)
- TODO(open-question: is `counsel` a distinct audience/state nuance in the patent tail, or just an attorney-review actor on `in_review`? cross-links ADR-0004/0007.)
- **Revisit trigger:** if a new artifact type, sink, or engine forces new core states (beyond the `artifact_type`
  tail branch), revisit the single-state-machine decision.
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).
