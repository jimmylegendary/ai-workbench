# Knowledge Core — The Claim→Evidence Invariant & the Evidence Gate

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./overview.md](./overview.md)
  - [./entity-and-edge-model.md](./entity-and-edge-model.md)
  - [../01-decisions/ADR-0003-knowledge-data-model.md](../01-decisions/ADR-0003-knowledge-data-model.md)
  - [../01-decisions/ADR-0004-provenance-and-trust.md](../01-decisions/ADR-0004-provenance-and-trust.md)
  - [../01-decisions/ADR-0001-product-surface-and-skill-interface.md](../01-decisions/ADR-0001-product-surface-and-skill-interface.md)
  - [../01-decisions/ADR-0002-storage.md](../01-decisions/ADR-0002-storage.md)
  - [../01-decisions/ADR-0005-ingestion-pipeline.md](../01-decisions/ADR-0005-ingestion-pipeline.md)
  - [../02-research/provenance-and-trust-models.md](../02-research/provenance-and-trust-models.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This doc specifies **THE invariant** of CAW-02 — *a Claim must point to Evidence; Evidence references a concrete
artifact, never free text; generated synthesis is never evidence* (brief §5, §10) — and the **structural evidence gate**
that enforces it. It defines the three lockstep enforcement layers, the error taxonomy, and the negative tests. It does
NOT restate the full entity/edge vocabulary (see [entity-and-edge-model.md](./entity-and-edge-model.md)) or the trust
ladder / boundary rules (see [ADR-0004](../01-decisions/ADR-0004-provenance-and-trust.md)); it consumes them.

## 1. Why this exists
The product's entire reason to exist (brief §2): *technical knowledge is un-reconstructable and generated summaries get
mistaken for evidence.* The gate is the machine-readable cure. It makes the dangerous mistakes — a Claim with no
evidence, prose passed off as evidence, a synthesized Note used as evidence — **structurally impossible**, not merely
discouraged. Agents cannot corrupt provenance even by accident.

## 2. The invariant — precise definition
A node of `kind=claim` is **valid** (may hold `status=accepted` and `trust > T0`) **iff**:
1. it has **≥1 `evidence_for` edge** from a node of `kind=evidence`; **and**
2. **every** such `evidence` node has an `extracted_from` edge to a concrete
   `source | trace | simulation_run | experiment` (or a resolvable `artifact_uri`); **and**
3. **no** `note` node appears as the `src` of any `evidence_for` / `extracted_from` edge.

Corollaries:
- A Claim with no resolvable evidence is **not an error to hide** — it is a first-class state `status=needs_evidence,
  trust=T0`, visible and un-promotable until evidence is attached.
- Imported, unchecked signals (ADR-0005/0007) also sit at `T0` until the gate passes **locally** (quarantine-on-import).
- A `Note` may `cites` a Claim/Evidence and may `derived_from` a Source, but is **never** the terminus of an evidence
  chain. Synthesis can *prompt* a Claim and be *cited by* one; it can never *back* one.

```
VALID:                                INVALID (rejected):
  evidence --evidence_for--> claim       claim with 0 evidence_for           -> ERR_TRUST_WITHOUT_EVIDENCE
  evidence --extracted_from--> source    evidence "free text", no artifact   -> ERR_EVIDENCE_NOT_ARTIFACT
                                         note --evidence_for--> claim         -> ERR_NOTE_AS_EVIDENCE
```

## 3. The structural evidence gate (skill-wrap, layer 1)
The first and strongest line is **the shape of the input itself**. Per [ADR-0001](../01-decisions/ADR-0001-product-surface-and-skill-interface.md),
all writes go through the op manifest; `attach_evidence` is designed so prose-as-evidence cannot even be expressed:

```
op attach_evidence:
  claim_ref     : ref<claim>                 # must resolve to an existing claim node
  artifact_ref  : { kind: source|trace|simulation_run|experiment, ref: <id|uri> }   # typed; MUST resolve
  locator       : { page?, line?, span?, selector? }   # where in the artifact
  stance        : supports | challenges      # becomes evidence_for | challenges
  # NOTE: there is NO `text` / `summary` / `prose` field. By construction.
```
Key properties of the gate at this layer:
- **No prose field exists.** You cannot submit a paragraph as evidence; the only way to point at backing is a typed,
  resolvable `artifact_ref`. This is the structural form of brief §10.
- **`artifact_ref` must resolve** to a real, already-cataloged artifact node (or a resolvable URI) *before* the edge is
  written. An unresolvable ref is rejected, not stored as a dangling pointer.
- **`synthesize_note` cannot create evidence edges.** Its op surface only emits `cites` / `derived_from`; it has no path
  to `evidence_for` / `extracted_from`. A Note is `generated=true` by construction.

## 4. Three lockstep enforcement layers
The invariant is **not a single DB constraint** — "≥1 of a typed edge" is not portably expressible as an FK/CHECK across
SQLite *and* Postgres (ADR-0002 portability). So it is enforced in three places that all run the **same** logic from the
core, identical across CLI/API/MCP and across engines.

| Layer | Where | What it checks | On failure |
|---|---|---|---|
| **1. Schema (skill-wrap input)** | op manifest input types (§3) | `attach_evidence` has no prose field; `artifact_ref` is a typed `{kind, ref}` that must resolve. Prose-as-evidence is structurally impossible. | `ERR_EVIDENCE_NOT_ARTIFACT` |
| **2. Core transaction validator** | pre-commit, in the core | (a) a Claim promoted past `needs_evidence` has ≥1 `evidence_for`; (b) each Evidence's `extracted_from` target resolves; (c) no `note` is the `src` of `evidence_for`/`extracted_from`; (d) edge endpoints obey the legality matrix ([entity-and-edge-model.md §4.1](./entity-and-edge-model.md)). Failure **aborts the whole transaction** — no orphan node/file/event. | `ERR_TRUST_WITHOUT_EVIDENCE`, `ERR_NOTE_AS_EVIDENCE`, `ERR_EDGE_ENDPOINT_ILLEGAL`, `ERR_ARTIFACT_UNRESOLVED` |
| **3. Reindex re-check** | batch reindex over `knowledge/**` | re-runs the full invariant against the source-of-truth md files; any violation is a hard error, never silently indexed. Catches hand-edits to .md and drift. | reindex **fails loud**, names offending ids |

Layer 1 stops the common case at the door; layer 2 is the authoritative gate inside the one transactional core; layer 3
guarantees the property holds even for writes that bypass the skill-wrap (e.g. a human editing a .md in git).

## 5. Error taxonomy
| Code | Raised by | Trigger | Caller remedy |
|---|---|---|---|
| `ERR_EVIDENCE_NOT_ARTIFACT` | layer 1 | a prose/summary value supplied where a typed `artifact_ref` is required, or no `artifact_ref`. | Catalog the artifact as a `source`/`trace`/… first, then pass its ref. |
| `ERR_ARTIFACT_UNRESOLVED` | layer 1/2 | `artifact_ref` points at a non-existent node / unreachable URI. | Fix the ref or import the artifact. |
| `ERR_TRUST_WITHOUT_EVIDENCE` | layer 2 | promoting a Claim to `accepted`/`trust>T0` with 0 `evidence_for`. | Attach evidence, or leave at `needs_evidence`/`T0`. |
| `ERR_NOTE_AS_EVIDENCE` | layer 1/2 | a `note` id used as the `src` of `evidence_for`/`extracted_from`. | Use `cites`/`derived_from`; a Note can never be evidence. |
| `ERR_EDGE_ENDPOINT_ILLEGAL` | layer 2 | an edge whose `(kind, rel, kind)` triple is not in the legality matrix. | Use a legal relation/endpoint. |
| `reindex: INVARIANT_VIOLATION` | layer 3 | a .md in `knowledge/**` violates the invariant. | Fix the offending file(s); reindex stays red until clean. |

All failures are **errors, not warnings** (ADR-0004 §3), and abort atomically — the .md file, the `_events/*.jsonl`
line, and the `provenance_event` are written **only** if every check passes.

## 6. Interaction with trust, boundary, and append-only
- **Trust** is derived *after* the gate passes: 0 evidence → `T0`/`needs_evidence`; ≥1 resolving source → `T1`; ≥2
  independent sources or an artifact-backed Evidence → `T2`; + human review → `T3`; both `supports` and `challenges`
  above threshold → `contested`. AI-only review caps at `T2`. (Detail: [ADR-0004](../01-decisions/ADR-0004-provenance-and-trust.md) §5.)
- **Boundary** propagation runs on the same post-gate graph; synthesis never downgrades sensitivity (ADR-0004 §4).
- **Append-only:** a correction (e.g. swapping bad evidence) is a *new* version linked by `supersedes`, not an in-place
  edit — the gate re-runs on the new version. Readers resolve `supersedes` chains to find the latest.

## 7. Reconstructability guarantee
Because the gate forbids any evidence chain from terminating in prose or synthesis, every accepted Claim is replayable:
```
note --cites--> claim --evidence_for(in)-- evidence --extracted_from--> source | trace | simulation_run | experiment
```
plus the per-hop `provenance_event` (who/what/when) and the git history. Nothing downstream can exist without pointing
back one concrete layer — this is the property the rest of CAW-02 (retrieval, export) relies on.

## 8. Negative tests (must exist; runbook acceptance)
| # | Attempt | Expected |
|---|---|---|
| N1 | Promote a Claim with 0 evidence to `accepted`. | `ERR_TRUST_WITHOUT_EVIDENCE`; nothing written. |
| N2 | `attach_evidence` with a prose summary and no `artifact_ref`. | `ERR_EVIDENCE_NOT_ARTIFACT` (field does not exist). |
| N3 | `attach_evidence` with an `artifact_ref` to a non-existent id. | `ERR_ARTIFACT_UNRESOLVED`. |
| N4 | Create `evidence_for` with a `note` as `src`. | `ERR_NOTE_AS_EVIDENCE`. |
| N5 | Hand-edit a .md to point Evidence at a Note, then reindex. | reindex `INVARIANT_VIOLATION`, names the id; index not updated. |
| P1 | Full happy path (add source → extract claim → attach evidence → synthesize cited note). | Claim `accepted`/`T1`; Note `generated=true` with `cites` only. |

## Open Questions
- TODO(open-question: is "independent source" for T2 corroboration machine-decidable, or human/heuristic? owned with ADR-0004.)
- TODO(open-question: do we persist rejected Claim candidates as audit nodes, and under what boundary? owned with ADR-0005.)
- TODO(open-question: tamper-evidence on provenance events — hash chain in v0 vs later upgrade? owned with ADR-0004.)
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks
- **RB (invariant gate):** implement the three-layer enforcement in the core; adapters add nothing. Ship the §8 negative
  tests as acceptance — N1–N5 must fail loud, P1 must pass.
- **RB (skill-wrap):** `attach_evidence` has no prose field; `artifact_ref` must resolve pre-commit; `synthesize_note`
  can only emit `cites`/`derived_from`.
- **RB (reindex):** rebuild index from `knowledge/**` and **re-run the invariant**; fail loud, naming offending ids.
- **RB (viewer, if in scope):** render Claim / Evidence / Note as visually distinct, with trust + boundary badges, so a
  human can never mistake synthesis for evidence.
