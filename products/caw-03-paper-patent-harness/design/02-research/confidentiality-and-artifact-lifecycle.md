# Confidentiality & Artifact Lifecycle

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md)
  - CAW-02 (a separate product): `RB-013` boundary+audit, `RB-052` boundary/redaction lib, `RB-051` CAW-03 bundle exporter, `ADR-0007` import/export contracts
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

This doc decides three things for CAW-03: (1) the **confidentiality gate** — how the harness distinguishes a
*public-source-assisted* artifact (may flow to a public sink without internal review) from an
*internal-review-required* artifact (cannot), reusing CAW-02 boundary/redaction semantics rather than reinventing
them; (2) the **artifact lifecycle state machine** (`claim → gate → draft → review → paper | patent`) with
provenance preserved end to end; (3) the **minimal CAW-03 data the harness owns vs. references** by id/URI, and
its file/SQLite-friendly storage shape. It does NOT define the evidence-completeness gate internals (own doc),
the novelty/claim-boundary checker (own doc), or the PaperOrchestra WritingEngine port wiring (own doc) — it
consumes those as inputs/transitions. It does not re-own classification: CAW-02 is authoritative for labels.

---

## 1. Reuse, don't rebuild: CAW-02 boundary semantics

CAW-03 imports cited claim+evidence bundles from CAW-02 as signed, versioned envelopes
(`boundary_kind=caw03-bundle`, see CAW-02 `RB-051`). Each entity in a bundle already carries an **effective**
label computed by CAW-02 via monotone provenance propagation. CAW-03 inherits these definitions verbatim and
MUST NOT redefine them:

| Axis | Values | Meaning | Who decides |
| --- | --- | --- | --- |
| `boundary` | `public ⊂ internal ⊂ confidential` (ordered lattice) | "can it leave the building" | CAW-02 (effective = lattice-max over provenance ancestors) |
| `visibility` | `{team, private}` (unordered) | "whose space" | CAW-02 (effective = `team` iff self and all ancestors `team`) |

Three inherited invariants the harness depends on and re-asserts at its own export boundary:

1. **Monotone propagation (no laundering).** A draft assembled from a `confidential` claim is itself
   ≥ `confidential`. Generated text never downgrades the boundary of its sources. CAW-03 applies the same
   lattice-max rule when it computes an *artifact's* effective boundary from its selected claims.
2. **Generated text is not evidence.** Bundles tag synthesis `evidence=false`; CAW-03 carries this through so a
   draft paragraph can never be cited back as evidence.
3. **Fail-closed default-deny.** Indeterminate/unknown → exclude. A missing or unresolvable label is treated as
   `confidential`/`private`, never as `public`.

CAW-03 reuses the CAW-02 redaction ruleset semantics (codename/fab/customer/PII patterns, `scan()`/`redact()`)
as a **defense-in-depth re-sweep at egress** — see §2. `TODO(open-question: does CAW-03 vendor a copy of the
ruleset, depend on a shared library, or receive ruleset_version pinned in the import envelope? The brief forbids
a shared runtime substrate, so a vendored, version-pinned copy is the default — confirm in ADR.)`

---

## 2. The confidentiality gate

The gate is a **policy function evaluated at two points** in the lifecycle, never a one-off flag:

- **Ingest classification** (at `gate`): compute the artifact's effective boundary/visibility as the lattice-max
  over every selected claim+evidence label. This sets the artifact's **confidentiality track**.
- **Egress decision** (at the publish/sink boundary): re-run the allow-list `decide(artifact, target_audience)`
  against the chosen sink's audience, plus a redaction re-sweep. Egress is the load-bearing gate; ingest only
  routes.

### 2.1 The two tracks

| Track | Trigger (effective labels of selected claims) | What it permits | What it blocks |
| --- | --- | --- | --- |
| **public-source-assisted** | every selected claim+evidence is effective `boundary=public` AND `visibility=team` | draft may target a **public sink** (arXiv/venue) once the review checklist passes — no human confidentiality review required | nothing extra; standard review still applies |
| **internal-review-required** | any selected claim/evidence is effective `boundary ≥ internal` OR `visibility=private` | draft may be produced and reviewed internally; may target an **internal sink** up to its boundary; patent track may proceed (counsel is a privileged internal audience) | a **public sink is hard-blocked** until a human `reclassify`/clearance event lowers the floor, or the patent-first path files before disclosure |

The track name is descriptive: "public-source-assisted" means *the artifact stands on public-safe inputs and
therefore needs no internal review to leave the building*; "internal-review-required" means *a human must clear
or reclassify it before any public disclosure*.

### 2.2 The egress decision (reused from CAW-02 `decide()`)

At a sink, `decide(artifact, target_audience)` is **total and side-effect-free**, default-deny:

- `target_audience=public` ⇒ ALLOW only if effective `boundary == public` AND effective `visibility == team`.
- effective `visibility == private` (jimmy-private) ⇒ never ALLOW for any audience.
- `target_audience=internal` ⇒ ALLOW up to effective `boundary == internal`.
- `target_audience=counsel` (patent) ⇒ ALLOW up to `confidential` (privileged); still subject to the
  redaction re-sweep for accidental PII/customer leakage. `TODO(open-question: is "counsel" a distinct
  audience tier above "internal", or just internal with privilege? owned by the Patent ADR.)`
- any unrecognized state ⇒ EXCLUDE / block.

Then a **redaction re-sweep**: `scan()` over every string the engine emitted (title, abstract, body, captions,
table cells, bibliography locators). **Any hit aborts publication** with the offending span list — defense in
depth even after the allow-list, because the writing engine can synthesize a codename the source bundle did not
literally contain.

### 2.3 Patent-specific overlay (public disclosure bar)

A patent-relevant claim is treated as **patent-first**: public disclosure (paper, preprint, talk) can forfeit
patentability in first-to-file regimes. So the confidentiality gate enforces an extra ordering constraint on the
lifecycle, not just a label check:

| Condition | Egress rule |
| --- | --- |
| claim flagged `patent_first` by the novelty checker, not yet filed | **block every public paper sink** for any artifact citing it, regardless of boundary |
| `patent_first` claim, filing recorded (`filed_patent` reached or filing-ref present) | public paper sink unblocked for that claim |

`TODO(open-question: legal definition of "disclosure" (does an internal preprint count? grace periods?) is a
counsel decision; CAW-03 models the *gate ordering*, not the legal advice. Owned by the Patent ADR + an open
question in 08-research-plan.)`

---

## 3. The artifact lifecycle state machine

One **Artifact** = one paper or one patent draft under governance. It binds a selected claim set to a track, an
engine run, a review, and a terminal output. The state machine is identical for paper and patent up to `draft`;
the tail differs by `artifact_type` and by the patent-first ordering above.

```
                 (evidence gate + confidentiality gate + novelty)
  [selected] ───────────────► [gated] ──────► [drafting] ──► [drafted]
      │  claim set bound          │  pass        │ engine        │
      │                           │              │ (port)        │
      │                     fail  ▼              │               ▼
      └─────────────────────► [blocked] ◄───────┘            [in_review]
                                  ▲   (engine error / track downgrade)   │
                                  │                                       │ review checklist
              human reclassify /  │              changes requested       │
              add evidence /      └───────────────[changes_requested]◄───┤
              file patent                                                │ approved
                                                                         ▼
                                                                    [approved]
                                                          ┌──────────────┴──────────────┐
                                              artifact_type=paper            artifact_type=patent
                                                          ▼                              ▼
                                                  [published_paper]               [filed_patent]
                                                       (terminal)                   (terminal)

  side states (from any non-terminal): [withdrawn] (terminal), [superseded:<id>] (terminal)
```

### 3.1 States

| State | Meaning | Entry guard | Owner of transition |
| --- | --- | --- | --- |
| `selected` | a claim set + intended `artifact_type` + `paper_ladder` slot is bound | claims resolvable by id/URI | human (curator) |
| `gated` | passed evidence-completeness + confidentiality classification + novelty | all three gates pass; track assigned | system (gates) |
| `blocked` | a gate failed or engine failed | any gate fail / engine error / track downgrade | system; exits via human action |
| `drafting` | WritingEngine port invoked (PaperOrchestra default) | engine adapter selected by config | system (adapter) |
| `drafted` | engine returned a draft + figure/table manifest | engine run captured | system |
| `in_review` | review checklist running (incl. autoraters) | draft present | system + human |
| `changes_requested` | review found issues; loop back to drafting/refinement | review verdict = revise | human reviewer |
| `approved` | review checklist + confidentiality egress pre-check pass | `decide()` ALLOW for intended sink | **human (Jimmy)** |
| `published_paper` | exported to public/internal sink (LaTeX+PDF) | egress `decide()` + redaction re-sweep pass | human; system records |
| `filed_patent` | patent draft handed to filing path | counsel audience egress pass | human; system records |
| `withdrawn` | abandoned | — | human |
| `superseded:<id>` | replaced by a newer artifact | newer artifact published | human |

### 3.2 Transition rules (invariants)

- **Gates are a conjunction.** `gated` requires evidence gate ∧ confidentiality classification ∧ novelty pass.
  Any failure → `blocked` with a typed reason (`EVIDENCE`, `BOUNDARY`, `NOVELTY`, `ENGINE`).
- **Re-gating on the way out.** Reaching `approved` re-evaluates the confidentiality egress decision for the
  *intended* sink; a public sink with an `internal-review-required` track cannot pass — it returns to `blocked`
  with `BOUNDARY` until a human `reclassify`/clearance event (mirrors CAW-02's human-only downgrade authority).
- **Human owns publish/file + downgrade.** `approved → published_paper|filed_patent` and any boundary downgrade
  are human-attributed events; AI agents cannot perform them (inherited guardrail).
- **Track is recomputed, not cached.** If the underlying claim set changes (claim added/reclassified upstream),
  the artifact is forced back to `gated` and the track is recomputed — a stale `public` track can never persist.
- **Terminal states are append-only.** Corrections create a new artifact `superseded:<old_id>`, preserving the
  published record.

### 3.3 Provenance per transition

Every transition appends one **hash-chained lifecycle event** (same shape as CAW-02 `_events`: `seq`,
`prev_hash`, `hash`, payload), recording: `from_state`, `to_state`, `actor` (`human:jimmy` | `agent:<engine>`),
`timestamp`, `inputs` (claim ids/URIs, result-registry refs, bundle digest), `engine_version` +
`adapter_id` (for drafting transitions), `boundary_eff` snapshot, and `reason`. This makes the path
`claim → … → paper|patent` fully replayable and answers "which evidence, which engine, which review, who
approved" for any published artifact. `verify_lifecycle(artifact_id)` walks the chain and reports the first
break, exactly like CAW-02 `verify_audit`.

---

## 4. Data: what CAW-03 owns vs. references

Principle (PRODUCT-BRIEF §7): CAW-03 owns **governance + lifecycle state**, and **references** the knowledge and
results by id/URI; large artifacts by path. It never duplicates CAW-02 claims/evidence or CAW-01 runs.

| Datum | Owned / Referenced | Form |
| --- | --- | --- |
| Artifact record (id, type, `lifecycle_state`, track, ladder slot) | **Owned** | SQLite row |
| Lifecycle event log (hash-chained transitions + provenance) | **Owned** | append-only JSONL (`_events`) |
| Claim-set binding (which claim ids/URIs this artifact uses) | **Owned (refs)** | join table → CAW-02 ids/URIs |
| Imported bundle snapshot (digest, ruleset_version, signature) | **Owned (snapshot)** | file + row; verifies, not re-authored |
| Claim ledger snapshot/refs | **Owned (refs)** | rows referencing CAW-02 ids |
| Confidentiality track + egress decisions + redaction hits | **Owned** | rows + `_events` lines |
| Figure/table manifest (which result → which figure) | **Owned (refs)** | rows → CAW-01 result-registry refs |
| Review checklist + autorater scores | **Owned** | rows / JSON |
| Paper-ladder plan (P1/P2/P3 sequence + readiness) | **Owned** | rows |
| Adapter/config registry (which Source/Engine/Patent/Sink/Novelty adapter) | **Owned** | config file + row |
| Draft sources & compiled outputs (LaTeX, PDF, patent doc) | **Owned by path** | filesystem; row stores path + digest |
| Claims & evidence *content* | **Referenced** (CAW-02) | by id/URI inside verified bundle |
| Simulation runs / projections / result content | **Referenced** (CAW-01) | by id/URI / result-registry ref |
| Novelty/threat radar signals | **Referenced** (CAW-05, separate product) | by id/URI |

### 4.1 Storage shape (file/SQLite-friendly)

Consistent with the family (decide finally in the Storage ADR): a single SQLite DB for structured state
(`artifact`, `artifact_claim`, `lifecycle_event`, `review`, `manifest`, `ladder`, `adapter_config`) plus a
content directory on disk for large/opaque artifacts (`artifacts/<id>/draft.tex`, `.../paper.pdf`,
`.../bundle.json`). Rows store **refs and digests, not blobs**: external knowledge as `caw02://claim/<id>`-style
URIs, runs as `caw01://result/<id>`, local big files as relative `path` + `sha256`. The lifecycle event log is
git-committable JSONL so git blame is a second witness (mirrors CAW-02 `RB-013` step 8).

```
# illustrative — builder writes the real schema
artifact(id, type[paper|patent], state, conf_track, boundary_eff, ladder_slot, created, updated)
artifact_claim(artifact_id, claim_uri, bundle_digest)          # refs into CAW-02
lifecycle_event(seq, artifact_id, from_state, to_state, actor, ts,
                inputs_json, engine_version, adapter_id, boundary_eff, reason,
                prev_hash, hash)                                 # hash-chained
manifest(artifact_id, figure_id, result_ref, caption, path, sha256)  # result_ref → CAW-01
review(artifact_id, checklist_json, autorater_scores_json, verdict, reviewer)
```

`TODO(open-question: SQLite single-file vs. per-artifact directory-of-files as primary store — owned by the
Storage ADR; this doc only requires "refs by id/URI, big things by path, hash-chained event log".)`

---

## 5. Generalization / seams (so this survives new sources & sinks)

- The confidentiality gate depends only on **effective labels carried in the import envelope**, not on CAW-02
  internals. A future `SourceAdapter` (internal wiki, experiment-server) plugs in by emitting the same
  label-bearing, signed envelope contract; the gate code is unchanged.
- The egress `decide(artifact, target_audience)` is parameterized by **audience**, supplied by the chosen
  `Sink/PublishAdapter` (public venue = `public`; internal wiki = `internal`; patent filing = `counsel`). New
  sinks register an audience tier; the gate logic is unchanged.
- The lifecycle state machine is **engine-agnostic**: `drafting` records `adapter_id`+`engine_version`, so
  swapping PaperOrchestra for another WritingEngine changes one config entry, not the lifecycle.
- A "future" adapter ships as a documented stub (interface + not-implemented marker + config example) per
  PRODUCT-BRIEF §5; the gate and lifecycle never reference a concrete adapter by name.

---

## Open Questions

Mirror these into `08-research-plan/open-questions.md`.

- Ruleset home: vendored+version-pinned copy of CAW-02 redaction rules vs. ruleset_version pinned in the import
  envelope (no shared runtime substrate is allowed).
- Audience tiering: is `counsel` a distinct tier above `internal`, and what is its exact redaction profile?
- Legal definition of "public disclosure" for patent-first gating (preprints, talks, grace periods) — counsel
  decision; CAW-03 only models gate ordering.
- Primary store: SQLite single-file vs. directory-of-files; final call in the Storage ADR.
- Reclassification authority across the boundary: can CAW-03 record a human clearance locally, or must the
  downgrade originate as a CAW-02 `reclassify` event re-imported in a fresh bundle? (Default: re-import, to keep
  CAW-02 authoritative.)
- Re-gating granularity: does any upstream claim change force full re-draft, or can an artifact re-gate without
  re-running the engine when labels are unchanged?

## Implications for runbooks

- **Confidentiality gate runbook:** implement ingest classification (lattice-max over selected claim labels →
  track) + egress `decide()` + redaction re-sweep; fail-closed; abort-on-hit; one `_events` line per egress
  decision. Reuse CAW-02 semantics; do not re-derive labels.
- **Lifecycle runbook:** implement the state machine (§3.1) with the conjunction gate, re-gate-on-change,
  human-only publish/file/downgrade, terminal append-only + `superseded` chain, and hash-chained
  `lifecycle_event` with `verify_lifecycle`.
- **Storage runbook:** create the SQLite schema (§4.1) storing refs/digests not blobs, content dir for big
  artifacts, git-committable JSONL event log; provide `verify_lifecycle`.
- **Bundle-import adapter runbook:** verify envelope signature + `provenance_digest`, refuse `evidence=false`-only
  claims, snapshot bundle (digest+ruleset_version), expose effective labels to the gate — never re-author content.
- Every drafting transition must persist `adapter_id`+`engine_version` so the engine stays swappable behind the
  WritingEngine port.
