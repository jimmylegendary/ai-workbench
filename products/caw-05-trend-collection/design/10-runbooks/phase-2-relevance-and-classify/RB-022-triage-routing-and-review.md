# RB-022: Recall-biased selective-review gate + deterministic config-driven routing

- **Status:** ready
- **Phase:** phase-2-relevance-and-classify
- **Depends on:** [RB-021 (classification cascade), RB-020 (recall floor), RB-003 (Routing port stub), RB-001 (CLI/MCP surface ops: confirm/export)]
- **Implements design:** [../../05-radar-core/classification-and-triage.md](../../05-radar-core/classification-and-triage.md) (§6, §7, §8), [../../01-decisions/ADR-0004-classification-and-triage.md](../../01-decisions/ADR-0004-classification-and-triage.md), [../../01-decisions/ADR-0002-interest-model.md](../../01-decisions/ADR-0002-interest-model.md) (recall floor)
- **Produces:** the **triage/route stage** of the Run: a calibrated **selective-review gate** (auto-accept / queue / abstain→human, never silent-discard), a `review.state` machine + needs-review queue, and a **deterministic config-driven routing engine** behind the `Routing` port emitting a neutral `routed_finding` to `knowledge / task / experiment / open-question / discard`.

## Objective
"Done" = each `classified_finding` passes through a recall-biased selective-prediction gate and a deterministic routing profile. The gate auto-accepts only high-confidence `support/adjacent/noise`; **always queues `novelty-threat`** (even high-confidence — existential cost); queues mid-confidence; and **abstains→queue on low confidence or self-consistency disagreement — never silent-discard**. A finding with ≥1 watch-list hit (`surface_not_drop`) is **never auto-discarded as `noise`**. Routing is a pure deterministic function of `(relevance class, signal bucket, review state)` selected by a named triage profile (`narrow-radar-weekly`), allowing **multi-route**, emitting a neutral `routed_finding` whose per-target bundle shape lives in the ExportAdapter (the router never imports another product's schema). **Nothing exports until `review.state ∈ {auto-accepted, human-confirmed, human-overridden}`.**

## Preconditions
- [ ] RB-021 complete: findings carry both axes, `method.self_consistency`, `method.abstained`, confidence inputs, `rationale_note{evidence:false}`, `surface_not_drop`.
- [ ] `Routing` port exists (P0 stub); `confirm`/`export` proposal-only surface ops exist (ADR-0001 / RB-001).
- [ ] A triage profile config file is creatable (`profile: narrow-radar-weekly`); `τ_high`/`τ_low`/`N` are config keys, not constants.
- [ ] Tree is green.

## Steps

1. **Build the calibrated confidence scorer.**
   - **Do:** Map raw signals (LF agreement, N-sample self-consistency, watch-list specificity, `source_trust_prior`, verbalized confidence) to a calibrated probability via a small logistic fit over Jimmy's confirm/override history. Track ECE. With <~50 labels, run in a **conservative cold-start mode** (treat confidence as low → queue more). Recalibrate when override rate drifts.
   - **Verify:** Calibration is fit from `interest-feedback`/override logs (not hard-coded); with an empty history the scorer defaults conservative (most items queue, none silently accepted into `discard`).

2. **Implement the selective-review gate (§6 table).**
   - **Do:** Apply, in order: (a) `novelty-threat` → **always queue** regardless of confidence; (b) low confidence (< `τ_low`) OR self-consistency disagreement / `method.abstained` → **abstain→queue**; (c) mid confidence (`τ_low`–`τ_high`) → queue; (d) high confidence (≥ `τ_high`) AND class ∈ `{support, adjacent, noise}` → **auto-accept**. `τ_high`/`τ_low`/`N` read from config.
   - **Verify:** A high-confidence `novelty-threat` still goes to **queue** (not auto-accept); a low-confidence `support` goes to queue; a high-confidence `support` auto-accepts.

3. **Enforce the recall-first floor at the gate (never silent-discard).**
   - **Do:** Any finding with `surface_not_drop: true` (≥1 `recall_priority:high` watch-list hit) can **never** be auto-routed to `discard` — at worst it queues. Encode as a hard precondition before routing.
   - **Verify (negative test N1):** A high-confidence `noise` label that carries a watch-list hit is **queued, not discarded**.

4. **Implement the `review.state` machine + needs-review queue.**
   - **Do:** States: `auto-accepted | queued | human-confirmed | human-overridden`. Queued items surface in the digest "needs-review" section; `novelty-threat` is flagged for **same-cycle** review. A human `confirm` sets `human-confirmed`; an override sets `human-overridden` and **emits a labeled example** for LF/threshold recalibration (active learning). Record `reviewer`, `decided_at`.
   - **Verify:** A queued item cannot transition to routed/export without a human op; an override writes a labeled example to the calibration log.

5. **Implement the deterministic routing engine (§7) behind the Routing port.**
   - **Do:** Routing = pure function of `(relevance class, signal bucket, review state)` from the named profile table. Encode every §7 row, e.g.: `novelty-threat × signal/mixed → open-question + flag → CAW-03 (advisory) + CAW-01/CAW-06`; `novelty-threat × hype → open-question(low-pri) → CAW-03 marked low-signal (still surfaced)`; `support × signal → knowledge → CAW-02`; `noise × any → discard (logged tombstone, never hard-deleted)`; actionable → `task → CAW-06/action-brief`. A finding may take **multiple routes** (route the union). Emit a neutral `routed_finding{decision, targets[], digest_eligible}`.
   - **Verify:** Each §7 row maps to its disposition + targets in a table-driven test; a `novelty-threat × hype` finding still routes to CAW-03 (recall floor), marked low-signal; a finding qualifying for two rows gets both targets.

6. **Enforce the pre-confirm export gate.**
   - **Do:** Block emission of any export bundle unless `review.state ∈ {auto-accepted, human-confirmed, human-overridden}`. `discard` writes a logged **tombstone** (kept for dedup + audit, never hard-deleted). The router never imports another product's schema — it emits `routed_finding`; ExportAdapters build per-target bundles later (P4/P5).
   - **Verify (negative test N3):** An export attempted on a `queued` finding is **refused**; a `discard` produces a tombstone retrievable for dedup.

7. **Keep generated rationale non-evidence through routing.**
   - **Do:** Carry `rationale_note{evidence:false}` onto the `routed_finding` unchanged; it may explain a route or render in the digest but never becomes a target's evidence. Routing decisions log the deterministic rule that fired (auditable), not the LLM rationale.
   - **Verify (negative test N2 boundary):** No routed_finding or downstream bundle can use `rationale_note` as evidence; the route is justified by the profile rule + provenance.

8. **Make the profile + thresholds config, and the invariants profile-independent.**
   - **Do:** Put the routing table, `τ_high`/`τ_low`/`N`, and signal cut-points in the `narrow-radar-weekly` profile config. Add a profile-load guard that **rejects** any profile attempting to (a) auto-discard a `surface_not_drop` finding or (b) set `rationale_note.evidence:true`.
   - **Verify:** Loading a profile that auto-discards a watch-list hit is rejected at load time; new watch-list lines/targets are added as profile rows without core code edits.

## Acceptance criteria
- [ ] Selective gate matches §6: novelty-threat always queues; abstain→queue on low conf / disagreement; high-conf support/adjacent/noise auto-accept.
- [ ] Negative test N1: high-confidence `noise` with a watch-list hit is queued, not discarded.
- [ ] Negative test N3: export refused unless `review.state` confirmed/accepted/overridden.
- [ ] Routing is deterministic, table-driven, multi-route; every §7 row covered by a test.
- [ ] `routed_finding` is neutral (no foreign product schema imported); discard = logged tombstone.
- [ ] Profile-load guard rejects any profile that relaxes the two invariants (no auto-discard of watch-list hits; rationale never evidence).
- [ ] Overrides produce labeled examples feeding calibration; ECE tracked.
- [ ] Tree is green at this checkpoint.

## Rollback / safety
- Gate decisions, `review.state`, and `routed_finding` are derived metadata; clear them to return to the post-RB-021 state — labels + raw findings untouched.
- Cold-start safety: with insufficient calibration data the gate biases to **queue**, never to silent auto-accept-into-discard.
- Tombstones are append-only; a wrong `discard` is recoverable from the tombstone log (never hard-deleted).
- If a profile change would relax a §1 invariant (ADR-0004 §6), **stop** — that is the one thing no profile may do.

## Hand-off
Phase-3/4 synthesis (digest) can assume each finding carries `review.state` + a neutral `routed_finding{decision, targets[], digest_eligible}` with `rationale_note{evidence:false}`. The M1 export path (minimal CAW-03 ExportAdapter, pulled forward per the DAG) consumes `routed_finding` targets — but only for findings past the pre-confirm export gate, and a `novelty-threat` to CAW-03 remains **advisory**, backed by provenance, never by generated rationale. The needs-review queue + override log feed P3 calibration and P5 ledger.
