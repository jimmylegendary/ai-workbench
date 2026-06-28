# RB-011: Build the hypothesis record kinds, the reversible status lifecycle, calibrated uncertainty, and the hard evidence cap

- Status: ready
- Phase: phase-1-ingestion-and-hypothesis
- Depends on: [RB-001 (store layout + record schemas), RB-010 (ingestion → CandidateClaim records)]
- Implements design:
  - [../../05-ttt-research-core/hypothesis-and-uncertainty.md](../../05-ttt-research-core/hypothesis-and-uncertainty.md) (the anti-overclaim contract)
  - [../../01-decisions/ADR-0002-hypothesis-representation.md](../../01-decisions/ADR-0002-hypothesis-representation.md) (load-bearing decision)
  - [../../05-ttt-research-core/experiment-scout-pipeline.md](../../05-ttt-research-core/experiment-scout-pipeline.md) (stages 2–3: consolidate Claim, hypothesize)
- Produces: the three record kinds (`Claim`, `Hypothesis`, `Evidence`) with cross-ref ids; the four-state reversible status lifecycle over an append-only `status_log`; calibrated qualitative uncertainty fields with the `confidence ≤ evidence_strength` cap; validators enforcing the hard rules (floor `hypothesis`, `generated`-can't-promote); the scout hypothesis-generation step producing `Hypothesis` records under `store/hypotheses`.

## Objective
The core can structurally distinguish **"a source says X" (`Claim`)**, **"we propose to check Y" (`Hypothesis`)**, and **"we observed Z bearing on Y" (`Evidence`)** as three separate, separately-addressable records cross-referenced by id — never merged into one "fact" blob. "Done" means: stage-2 consolidates `CandidateClaim`s into attributed `Claim`s; stage-3 generates ≥1 `Hypothesis` from one or more `Claim`s at `status=hypothesis`, `confidence=very-low`, with `falsifiability` (or a `TODO`); the status lifecycle is reversible and append-only; and **validators reject** any hypothesis serialized without a status, any `confidence` above its `evidence_strength` cap, and any `→ supported`/`→ refuted` transition whose only evidence is `evidence_kind=generated`. A hypothesis is never rendered or exported as a settled claim.

## Preconditions
- [ ] RB-010 done: `store/claims` holds attributed `CandidateClaim`s (verbatim span, `source_locator`, `claim_type`, `writes_back`, `status=unverified`, `asserted_by`); `store/sources` deduped.
- [ ] RB-001 done: store layout + base record schema/validator harness importable.
- [ ] Tree is green at the RB-010 acceptance checkpoint.
- [ ] The calibration table from hypothesis-and-uncertainty.md §4 is available to encode as test cases.

## Steps

### 1. Implement the three separated record kinds
- **Do:** Define `Claim`, `Hypothesis`, and `Evidence` as three schemas with id cross-refs (never collapsed). `Claim` carries `asserted_by` provenance and renders "<source> claims …". `Hypothesis` carries `statement`, `theme`, `status`, `confidence`, `evidence_strength`, `agreement`, optional `likelihood`, `falsifiability`, `reproducibility`, `derived_from_claims[]`, `evidence[]` (Evidence ids), `status_log[]`, `boundary`, `provenance`. `Evidence` carries `evidence_kind ∈ {experiment, external, generated}`, `supports` (Hypothesis id), `direction ∈ {supporting, disconfirming, neutral}`, `strength`, and `ledger_ref`/`source_ref` as applicable. See the illustrative shapes in hypothesis-and-uncertainty.md §5 (builder writes the real schema).
- **Verify:** Round-trip serialization tests pass for all three kinds; a test asserts the three are independently addressable by id and that no schema embeds another's payload inline (no "fact" blob). Restating a `Claim` as a `Hypothesis` conclusion is structurally impossible (different records).

### 2. Implement stage-2: consolidate CandidateClaims into Claims
- **Do:** Build the stage-2 step that normalizes/consolidates `CandidateClaim`s from RB-010 into `Claim` records with `asserted_by` set to the source. Preserve attribution and the verbatim span; never paraphrase a claim into "our conclusion". Carry forward `claim_type` and `writes_back`.
- **Verify:** A test asserts each `Claim` keeps `asserted_by`, its `claim_type`, and `writes_back`; a `Claim` rendered to text reads "<source> claims …", never "it is true that …". The validator rejects a `Claim` lacking `asserted_by`.

### 3. Encode the four-state status lifecycle over an append-only log
- **Do:** Implement statuses `hypothesis | supported | refuted | inconclusive` with **default and floor `hypothesis`**. Status is resolved as the latest entry of an append-only `status_log` (each `StatusEvent`: `ts`, `from→to`, triggering `evidence` ids, `by`). `supported`/`refuted` are **never terminal** — any state re-opens on new/contradicting evidence (the lifecycle is reversible). Implement a `current_status(hypothesis)` resolver = latest event.
- **Verify:** A test drives `hypothesis → supported → refuted → inconclusive → hypothesis`, asserting each transition appends a `StatusEvent` (never mutates/deletes prior events) and that `current_status` returns the latest. A re-open after `supported` is accepted, proving reversibility.

### 4. Enforce the hard rules as validators (load-bearing)
- **Do:** Add validators that **reject**: (a) any `Hypothesis` serialized without a `status` (floor `hypothesis`); (b) a zero-evidence hypothesis at anything other than `hypothesis`; (c) any `→ supported` or `→ refuted` `StatusEvent` whose triggering evidence is **only** `evidence_kind=generated` — generated evidence may inform `inconclusive` only; (d) any export-bound hypothesis missing `status`/`confidence`. These are invariants, not warnings.
- **Verify:** Tests assert each rejection fires: a hypothesis without status fails validation; promoting to `supported` with only a `generated` Evidence raises; the same promotion with one `experiment`/`external` Evidence passes. A `generated`-only Evidence may move status to `inconclusive` and that passes.

### 5. Implement calibrated qualitative uncertainty with the cap
- **Do:** Implement `confidence ∈ {very-low … very-high}` derived from `evidence_strength ∈ {none, weak, moderate, strong}` × `agreement ∈ {conflicting, mixed, consistent}`, default `very-low`. Enforce the **hard cap**: `confidence` bounded by `evidence_strength` (`none → very-low`, `weak → low`) regardless of prose. `likelihood` is optional and **omitted unless quantified** — never invent a number (empty ≠ "as likely as not"). `falsifiability` is markdown and **required to leave `hypothesis`** (missing ⇒ `TODO`, not a `supported` candidate). `reproducibility ∈ {unrun, single-run, replicated, failed-to-reproduce}`.
- **Verify:** Encode the §4 calibration table as test cases (e.g. generated-only ⇒ `evidence_strength=none/weak`, `confidence=very-low`; single toy run supporting ⇒ `moderate`/`low`; two runs disagree ⇒ `conflicting`/`very-low`). A test asserts setting `confidence=high` with `evidence_strength=weak` is rejected by the cap, and that a missing `likelihood` is left absent (never defaulted to a number).

### 6. Implement stage-3: scout hypothesis generation with safe defaults
- **Do:** Build the stage-3 step that proposes checkable `Hypothesis` records from one or more `Claim`s (cross-claim reasoning allowed here). Every generated hypothesis is created at `status=hypothesis`, `confidence=very-low`, `evidence_strength=none|weak`, `reproducibility=unrun`, with `derived_from_claims[]` set and `falsifiability` filled or emitted as `TODO`. The generation prose itself is **not** evidence; if recorded at all, it is an `Evidence` with `evidence_kind=generated` (which cannot promote status). Persist to `store/hypotheses`.
- **Verify:** Running stage-3 on the RB-010 claims produces ≥1 `Hypothesis` at the safe defaults with `derived_from_claims` populated; a test asserts no generated hypothesis is created above `very-low` and that any generated rationale lands as `evidence_kind=generated`, not as a promotion. The headline TTT-writeback hypothesis exists as a tracked `Hypothesis`, never a premise.

### 7. Verify the export-boundary stance (no overclaim, no shared store)
- **Do:** Confirm (in code/tests, no adapter built here) that a `hypothesis`-status item is only eligible to export to CAW-01 (a separate product) as a future-workload **open question** carrying `confidence` + `falsifiability`, and that bare hypotheses are ineligible for CAW-02 claim+evidence export. Exports must carry `status` + `confidence` + evidence links **inline**. No record crosses a boundary stripped of its uncertainty. (Adapters are built in phase 4; this step only enforces the eligibility predicate.)
- **Verify:** A test of the eligibility predicate asserts a `status=hypothesis` item maps to "CAW-01 open question only" and is rejected by the CAW-02 claim gate; a hypothesis missing `confidence`/`status` is rejected by any export-eligibility check.

## Acceptance criteria
- [ ] Three separate record kinds (`Claim`, `Hypothesis`, `Evidence`) exist, cross-referenced by id, never merged into one fact blob.
- [ ] `Claim` retains `asserted_by` + verbatim attribution; renders "<source> claims …", never as our conclusion.
- [ ] ≥1 `Hypothesis` generated from `Claim`(s) at `status=hypothesis`, `confidence=very-low`, with `derived_from_claims` and `falsifiability` (or `TODO`).
- [ ] Status lifecycle is the four states, default+floor `hypothesis`, append-only `status_log`, `current = latest event`, fully reversible (re-open after `supported`/`refuted` works).
- [ ] Validators reject: hypothesis without status; non-`hypothesis` with zero evidence; `→ supported`/`→ refuted` driven only by `generated` evidence (hard evidence cap); export-bound record missing status/confidence.
- [ ] Calibrated uncertainty enforced: `confidence ≤ evidence_strength` cap holds; `likelihood` omitted unless quantified; `falsifiability` required to leave `hypothesis`. §4 calibration examples pass as tests.
- [ ] Export eligibility predicate enforces: `hypothesis` → CAW-01 open-question only; bare hypotheses rejected by the CAW-02 gate; uncertainty travels inline; no shared store assumed.
- [ ] Tree is green (compiles, lint passes) at this checkpoint.

## Rollback / safety
- The `status_log` is append-only; never delete or rewrite a `StatusEvent`. To "undo" an erroneous transition, append a corrective transition (auditable), do not mutate history.
- If a validator change would let `generated` evidence promote a status, or let a hypothesis serialize without status/confidence, **stop** — that is the load-bearing invariant breaking, not a feature request (ADR-0002 revisit trigger). Revert the change.
- Hypothesis records are additive under `store/hypotheses`; a bad stage-3 pass can be undone by deleting only the hypothesis ids it created (they carry `created_at`/`created_by` provenance) and re-running.
- Never fabricate `likelihood` numbers or a `falsifiability` to clear a gate; emit `TODO(open-question: ...)` instead (DOC-CONVENTIONS §3).

## Hand-off
The next phase (**RB-2XX, experiment ledger**) can assume: `store/hypotheses` holds tracked `Hypothesis` records at `status=hypothesis`/`confidence=very-low` with `falsifiability` (or `TODO`) and `reproducibility=unrun`, plus the `Evidence` record kind and the status lifecycle ready to receive ledger verdicts. A ledger verdict (including a failure) will create an `Evidence` (`evidence_kind=experiment`, including negative results) and **propose** a `StatusEvent` — only `experiment`/`external` evidence can drive `→ supported`/`→ refuted`, and `→ supported` is human-gated. Generated summaries are never evidence; nothing exports stripped of status/uncertainty.
