# Versioning & Events — append-only + supersedes, the _events ledger, git as audit

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./data-model.md](./data-model.md)
  - [./storage-strategy.md](./storage-strategy.md)
  - [./provenance-and-boundaries.md](./provenance-and-boundaries.md)
  - [../01-decisions/ADR-0002-storage.md](../01-decisions/ADR-0002-storage.md)
  - [../01-decisions/ADR-0004-provenance-and-trust.md](../01-decisions/ADR-0004-provenance-and-trust.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This doc fixes **how CAW-02 records change over time**: the append-only + `supersedes` model (no update/delete), the
append-only `knowledge/_events/*.jsonl` ledger, git history as the audit substrate, and how edits made **outside the
skill interface** are reconciled at reindex. It elaborates [ADR-0002](../01-decisions/ADR-0002-storage.md) and
[ADR-0004](../01-decisions/ADR-0004-provenance-and-trust.md). It does NOT redefine entity fields (see
[data-model](./data-model.md)) or index mechanics (see [storage-strategy](./storage-strategy.md)).

## 1. Append-only + supersedes (no update, no delete)
Knowledge is **never mutated in place**. A correction is a **new node** with a new content-addressed id, linked to
the prior version by a `supersedes` edge. Deletion is logical (a `rejected`/`superseded` status), never physical —
nothing is lost from history.

| Operation | What actually happens |
|---|---|
| "Edit a claim" | write a new `clm_*` node (new id) with `supersedes: <old id>`; old node stays, `status=superseded` |
| "Delete a claim" | new version with `status=rejected` (+ a `provenance_event` reason); node remains for audit |
| "Fix a typo in evidence" | new `evd_*` version superseding the old; the artifact pointer/locator is corrected, not overwritten |
| "Reclassify boundary" | a `reclassify` provenance_event (boundary change is itself append-only — see provenance doc §3) |

```yaml
# clm_2026_b9 supersedes clm_2026_a1
id:         clm_2026_b9xk...
supersedes: clm_2026_a1q7...
status:     accepted
# the superseded node is updated only in its status field via a NEW event, never content-mutated:
#   clm_2026_a1q7 -> status: superseded   (recorded as a supersede event, original content_hash preserved in history)
```

**Readers resolve the supersedes chain** to find the latest version; the chain itself is the edit history and is
walkable as edges or via git-blame.

`TODO(open-question: how status flips on a superseded node are recorded without violating "no in-place mutation" — likely a status-only event whose prior value lives in git history; confirm.)`

## 2. The _events JSONL ledger
Every skill-wrap write appends **one line** to `knowledge/_events/<ts>-<op>.jsonl`. It is committed (part of the
source of truth), append-only, and mirrored into the index `event` table at reindex.

```jsonl
{"seq":1,"ts":"2026-06-27T10:04:11Z","op":"add_source","node":"src_2026_aa","prov":"pe_2026_01","by":"human:jimmy","hash":"blake3:7c.."}
{"seq":2,"ts":"2026-06-27T10:05:02Z","op":"extract_claim","node":"clm_2026_a1","prov":"pe_2026_02","by":"skill:extract-claims","hash":"blake3:9f.."}
{"seq":3,"ts":"2026-06-27T10:06:40Z","op":"attach_evidence","node":"evd_2026_77","edges":[["evd_2026_77","clm_2026_a1","evidence_for"]],"prov":"pe_2026_03","by":"skill:attach-evidence","hash":"blake3:2c.."}
{"seq":4,"ts":"2026-06-27T11:00:00Z","op":"supersede","node":"clm_2026_b9","supersedes":"clm_2026_a1","prov":"pe_2026_04","by":"human:jimmy","hash":"blake3:de.."}
```

| Field | Meaning |
|---|---|
| `seq` | monotone sequence (assigned from `ts` ordering at replay) |
| `op` | transaction kind: `add_source\|extract_claim\|attach_evidence\|synthesize_note\|classify_signal\|supersede\|reclassify\|review\|reject` |
| `node` | the node written |
| `edges` | edges created in this transaction (optional) |
| `prov` | the `provenance_event` id (who/what/when — provenance doc §6) |
| `hash` | `content_hash` of the written node, for drift detection |

The ledger is the **replayable spine** of the store: continual learning (not v0) and any future audit read it
directly. It mirrors — never replaces — git history.

## 3. Two append-only ledgers, one truth
| Ledger | Granularity | Authority | Strength |
|---|---|---|---|
| git history (signed commits, blame) | per commit/file | audit of record | tamper-evident, human-diffable, survives product rewrite |
| `_events/*.jsonl` | per knowledge transaction | replay spine | machine-replayable, structured, semantic op names |

They are **redundant by design**: git answers "who changed this file and when" at the byte level; `_events` answers
"what knowledge transaction occurred" at the semantic level. A healthy store keeps them consistent (every event line
corresponds to a committed file change). Divergence is a reconciliation signal (§4).

`TODO(open-question: tamper-evidence — add a hash chain over _events lines in v0, or rely on signed git commits? owned by ADR-0004.)`

## 4. Reconciling out-of-band edits
Files are the source of truth, so a human MAY edit `knowledge/**.md` directly (or via PR/merge) without going
through the skill interface. That bypasses the `_events` append and the evidence gate, so **reindex is the
reconciliation point** (see [storage-strategy §5](./storage-strategy.md)).

```
reindex reconciliation:
  1. parse every .md -> recompute content_hash
  2. for each node: compare hash to the last _events line for that node
       - hash matches latest event        -> in sync
       - hash differs / no event           -> OUT-OF-BAND EDIT
  3. for each out-of-band edit:
       a. RE-RUN the Claim->Evidence invariant + boundary propagation + trust recompute
       b. if invariant violated  -> reindex FAILS LOUD (the edit is rejected, not silently indexed)
       c. if invariant holds      -> synthesize a reconciliation event:
            {"op":"reconcile","node":..,"by":"oob:git","hash":..,"note":"out-of-band edit detected at reindex"}
  4. git commits provide the who/when the missing _events line lacked (blame fills the audit gap)
```

| Scenario | Outcome |
|---|---|
| Out-of-band edit keeps invariant | accepted; a `reconcile` event is appended so the ledger catches up; git-blame supplies author/time |
| Out-of-band edit breaks `Claim→Evidence` (e.g. removes evidence) | reindex **fails loud**; the store is flagged inconsistent until fixed |
| Out-of-band edit lowers `boundary` below the computed floor | propagation recomputes the floor; declared-below-floor is surfaced (provenance doc §2); needs a `reclassify` to be legitimate |
| Direct delete of a file | the supersedes/edge targets dangle; reindex reports dangling references as a hard error |

This is exactly the ADR-0002 open risk — "direct file edits outside the skill interface can drift the `_events`
ledger from git" — and reindex is its containment: it never trusts a row, always re-checks, and fails loud rather
than indexing a broken state.

`TODO(open-question: should a reconcile event be auto-synthesized, or should out-of-band edits require explicit operator acknowledgement before the ledger is updated?)`

## 5. What v0 deliberately does NOT do
| Not in v0 | Why |
|---|---|
| Autonomous self-editing / continual learning | brief §2/§9 — v0 is append + retrieve + skill-wrap |
| Physical deletion / hard GC of history | append-only audit is the product's integrity guarantee |
| Distributed multi-writer conflict resolution | team writes are PR/merge on files until the Postgres port (storage doc §8) |
| Cryptographic hash-chain over events (beyond signed git commits) | deferred; see tamper-evidence open question |

## Open Questions
- `TODO(open-question: status-only flips on superseded nodes vs strict no-in-place-mutation.)`
- `TODO(open-question: tamper-evidence — hash chain over _events in v0 vs signed git commits only.)`
- `TODO(open-question: auto-synthesized reconcile event vs operator acknowledgement for out-of-band edits.)`
- `TODO(open-question: team write-concurrency model — git PR/merge vs serializing write-through API; the Postgres-port trigger.)`
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks
- **RB (write path):** append-only + supersedes; one `_events` line + one `provenance_event` per transaction; signed commit.
- **RB (reindex):** drift detection (hash vs last event), invariant re-check, `reconcile` event synthesis, fail-loud on violation.
- **RB (reader/resolver):** resolve `supersedes` chains to the latest version; expose edit history from edges + git-blame.
