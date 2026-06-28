# RB-021: Classify findings on two axes via the LF→LLM→human cascade (rationale never evidence)

- **Status:** ready
- **Phase:** phase-2-relevance-and-classify
- **Depends on:** [RB-020 (relevance scoring + recall floor), RB-002 (Classifier port stub), RB-012 (FILES-AS-TRUTH store)]
- **Implements design:** [../../05-radar-core/classification-and-triage.md](../../05-radar-core/classification-and-triage.md), [../../01-decisions/ADR-0004-classification-and-triage.md](../../01-decisions/ADR-0004-classification-and-triage.md), [../../01-decisions/ADR-0002-interest-model.md](../../01-decisions/ADR-0002-interest-model.md)
- **Produces:** the **classify stage** of the Run: a labeling-function (LF) layer, a self-consistent LLM judge behind the `Classifier` port, and the `classified_finding` record carrying both axes (`relevance.class` × `signal.bucket`), `method`, and a `rationale_note{evidence:false}`. (The selective-review gate + routing are RB-022.)

## Objective
"Done" = each scored finding receives a `classified_finding` record with **two orthogonal labels** — Axis A relevance class (`novelty-threat | support | adjacent | noise`) and Axis B signal-vs-hype (`hype | mixed | signal`) — assigned by a cheap→expensive cascade: deterministic labeling functions first, a self-consistent LLM judge (N≥2 samples) only on weak/conflicting/near-miss cases, with `method.labeler` recording the label's authorship. Two invariants are encoded in the data and enforced by negative tests: **(1) generated rationale is `evidence:false` and can never back a claim**, and **(2) an LF miss on a watch-list term falls through to the LLM and never defaults to `noise`** (recall-first). The stage assigns labels + confidence inputs only; it does **not** decide auto-accept/queue/route (that is RB-022).

## Preconditions
- [ ] RB-020 complete: findings carry `relevance{score, explain[], matched_watch_list, surface_not_drop}`.
- [ ] Findings carry provenance + `source_trust_prior` (high/medium/low) + `dedup_key` from ingestion (ADR-0003).
- [ ] `Classifier` port exists (P0 stub) with contract `finding → {relevance, signal, confidence inputs, rationale_note}`.
- [ ] An LLM is selected for the judge (TODO open-question — if Claude/Anthropic, follow the claude-api reference for model id + params); v1 may run the judge against a fixture/mock so the cascade is testable without live calls.
- [ ] Tree is green.

## Steps

1. **Define the `classified_finding` record schema.**
   - **Do:** Implement the record from classification-and-triage.md §4: read-only `provenance`/`dedup_key`; `relevance{class, watchlist_hits, confidence}`; `signal{score, bucket}`; `rationale_note{text, model{name,version,prompt_hash}, evidence:false}`; `method{labeler, self_consistency{samples,agreement}, abstained}`. Make `rationale_note.evidence` a constant `false` that cannot be set true by any code path.
   - **Verify:** Schema validation rejects a record with `rationale_note.evidence: true`; provenance/dedup_key fields are immutable (write-once from upstream).

2. **Implement Stage 1 — labeling functions (deterministic, always run).**
   - **Do:** Build high-precision LFs: watch-list keyword/author/venue regex → `novelty-threat` candidate; known-aggregator-domain → `noise` candidate; `has-code` / `has-numbers` / `has-method` / `has-baseline` → signal++; superlatives / press-release / N-th-hand → signal−−. Seed Axis B from `source_trust_prior` (carried, not re-derived). Combine noisy LFs Snorkel-style and keep **per-LF votes + agreement** as a confidence feature.
   - **Verify:** A title with `Chakra` + `MC-DLA` produces a `novelty-threat` candidate with both LF votes recorded; an arXiv finding with code + numbers raises the signal feature vs a press-release fixture.

3. **Encode the critical recall rule (LF miss → LLM, never noise).**
   - **Do:** When LFs are weak, conflicting, or a watch-list **near-miss** (e.g. a `matched_watch_list` hit from RB-020 but no LF fired the class), the finding is escalated to Stage 2. A watch-list-touching finding may **never** be labeled `noise` by LFs alone.
   - **Verify (negative test N4):** A finding matching a watch-list term that no LF classified does NOT receive `noise`; it is queued for the LLM judge with `method.labeler` pending LLM.

4. **Implement Stage 2 — self-consistent LLM judge behind the Classifier port.**
   - **Do:** Invoke only on escalated findings. ONE prompt returns **both axes + a rationale** in a structured shape. Run **N self-consistent samples** (N config, ≥2); use the **agreement rate as the raw confidence signal**. Record `model.name/version`, `prompt_hash` (sha256 of the prompt), and `self_consistency{samples, agreement}`. Store the model text strictly as `rationale_note.text` with `evidence:false`. Verbalized/token-prob confidence may be logged as a weak secondary signal only.
   - **Verify (negative test N5):** A single-sample run (N=1) is **refused** — the judge requires N≥2 and records agreement; `prompt_hash` and `model.version` are present on every LLM-labeled record.

5. **Set `method.labeler` provenance + abstention flag.**
   - **Do:** Record `method.labeler ∈ {lf, lf+llm, llm}` (human is set later by RB-022). Set `method.abstained: true` when N-sample agreement is below the disagreement bar (the gate consumes this in RB-022). Do not auto-discard here — abstention only flags.
   - **Verify:** An LF-only clear case has `labeler: lf` and no LLM call was made; a disagreeing N-sample case has `abstained: true`.

6. **Keep rationale strictly non-evidence end-to-end.**
   - **Do:** Store rationale as a `Note(evidence=false)`. Ensure no serializer, export builder, or digest renderer can promote `rationale_note` into a claim's backing — backing is always provenance + (post-verification) source locator. Add a guard/assert at the claim-construction boundary.
   - **Verify (negative test N2):** Passing `rationale_note` as a claim's evidence is **refused** by the guard; the digest may render rationale but flagged as generated, not as evidence.

7. **Persist records to the store.**
   - **Do:** Write each `classified_finding` as metadata over the immutable finding (files-as-truth); re-running classification is idempotent for fixed inputs + fixed `prompt_hash`/model version (cache LLM results by `prompt_hash` to avoid re-billing).
   - **Verify:** Re-run produces identical labels for unchanged findings without new LLM calls (cache hit on `prompt_hash`).

## Acceptance criteria
- [ ] Every finding has a `classified_finding` with both axes + `method` + `rationale_note{evidence:false}`.
- [ ] LFs run on all findings; LLM judge runs ONLY on weak/conflict/near-miss; most findings clear without the LLM.
- [ ] Negative test N4: an LF miss on a watch-list term never yields `noise` (escalates to LLM).
- [ ] Negative test N5: N=1 LLM run refused; N≥2 with recorded `agreement`, `model.version`, `prompt_hash`.
- [ ] Negative test N2: `rationale_note` cannot back a claim (`evidence:false` enforced).
- [ ] Records are reproducible from files; LLM results cached by `prompt_hash`.
- [ ] Tree is green at this checkpoint.

## Rollback / safety
- Classification records are derived metadata; delete the `classified_finding` block to return to the post-RB-020 state — raw findings + relevance untouched.
- If the LLM judge is unavailable, the stage must degrade safely: escalated findings remain `method.abstained:true` / unlabeled-by-LLM and flow to RB-022's human queue — they are **never** auto-labeled `noise`.
- Never relax the two invariants (N2, N4) in any code path or config profile (ADR-0004 §6 revisit trigger: stop).

## Hand-off
RB-022 can assume each finding carries a `classified_finding` with both axes, `method.self_consistency`, `method.abstained`, `relevance.confidence` inputs, and `surface_not_drop` (from RB-020). RB-022 owns the calibrated selective-review gate (auto-accept/queue/abstain), the human-review state machine, and deterministic routing. The `rationale_note{evidence:false}` flag travels with the finding into the ledger and exports unchanged.
