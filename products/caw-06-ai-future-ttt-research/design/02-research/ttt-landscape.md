# TTT / Test-Time Compute Landscape

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md), [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS.md), [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

This doc maps the landscape of **test-time training (TTT)** and **test-time compute** variants and decides ONE
thing: **which variants actually write back weights/state during inference, and what that writeback implies for
memory traffic** (write bandwidth, gradients, optimizer state, updated-state residency, updated-weight reuse). It
produces a **taxonomy with a "writes back? what?" column** plus a per-variant memory-traffic implication, to seed
CAW-06's writeback-traffic schema and the export to CAW-01 (a separate product — the simulation control plane).

It does **NOT** decide the schema field set (that is its own design doc / ADR), does not run experiments, and does
not assert that any TTT variant is or will be a production workload. Every cross-product reference here is an
**import/export boundary**, never a shared store. Generated summaries below are **not evidence**; hypotheses carry
explicit uncertainty and are never presented as settled claims.

## 1. The axis that matters: does inference WRITE BACK?

Read-dominant LLM serving is the reference baseline: weights are **frozen**; the only per-request state that grows
is the **KV cache** (a read-mostly, append-on-generate structure). The strategic hypothesis (CAW-06 → CAW-01) is
that some test-time methods break this assumption by **issuing weight/state writes during inference**, creating a
**write-traffic axis** not captured by read-dominant serving profiles. *(Hypothesis — to be checked, not settled.)*

We separate two families that are routinely conflated:

- **Test-time SCALING / compute (TTS):** spend more compute at inference (longer chains, more samples, search) with
  **weights frozen**. Writeback = none to weights; the cost is **KV-cache growth + read bandwidth**.
- **Test-time TRAINING / adaptation (TTT/TTA):** **update parameters or a parametric state** during inference via
  gradient steps (or RL updates). Writeback = **yes** — the question is *what* (full weights, adapter, a small
  inner model, norm stats) and *how persistent*.

The boundary is not always clean: TTRL (test-time RL) and the architectural TTT layers blend scaling with updates.

## 2. Taxonomy — "writes back? what?" + memory-traffic implication

> Bandwidth/endurance numbers are NOT given (no benchmarks invented). Cells marked *(uncertain)* are hypotheses to
> verify in the first research run. "Inner-loop" = update happens inside the forward pass; "outer-loop" = a separate
> adaptation phase before/around the answer.

| # | Variant (representative work) | Update mechanism | **Writes back? What?** | Update scope / loop | Residency & reuse of the written state | **Memory-traffic implication** |
|---|---|---|---|---|---|---|
| 1 | **Test-time scaling** — CoT, self-consistency, ToT/MCTS; o1/R1-style (frozen-weight reasoning) | none (more tokens/samples/search) | **No weight writeback.** Only KV cache grows | n/a (read-only) | KV cache per request; discarded after request | Read-dominant; bottleneck = **KV-cache capacity + read BW**, not writes. This is the *baseline* the writeback axis is measured against |
| 2 | **TTT layers as architecture** — TTT-Linear / TTT-MLP (Sun et al. 2024, "RNNs with expressive hidden states") | inner-loop SGD step per token on a self-supervised loss; hidden state **is** a small model `W_t` | **Yes — the inner "fast-weight" model** `W_t = W_{t-1} − η∇ℓ`. A small linear/MLP weight matrix, updated every token | inner-loop, per-token, during forward pass | Lives for the sequence; **reused on the very next token** (high temporal reuse) | **High-frequency small writes** to fast-weight state every token; write volume scales with tokens × state size. Reads-then-writes the same buffer → favors **near-memory update** / on-chip residency *(uncertain: whether it spills to main memory at long context)* |
| 3 | **Neural long-term memory at test time** — Titans (Behrouz et al. 2025, "Learning to Memorize at Test Time") | gradient (surprise-gated) update to a small memory MLP while reading input | **Yes — the Neural Memory module weights only**; core/attention stay frozen | inner-loop, per-segment | Memory persists across segments within the context; **reused for long-past recall** | Sustained writes to a **bounded** memory module; write rate gated by "surprise" so traffic is **input-dependent / bursty** *(uncertain)*. Optimizer-like momentum may add state to keep resident |
| 4 | **Per-instance / per-task TTT fine-tuning** — ARC (Akyürek et al. 2024); few-shot TTT | outer-loop: train **task-specific LoRA adapters** on augmented in-context examples, then answer | **Yes — LoRA adapter weights** (low-rank ΔW); **discarded after the task** | outer-loop, per task/instance | Adapter resident only for that task; **little cross-task reuse** (thrown away) | **Bursty write + full optimizer state** (Adam moments ≈ 2× param size) during the adapt phase, then **read-only** during answer. Write-then-discard → low reuse, high churn; capacity dominated by **optimizer state**, not the small adapter |
| 5 | **Dynamic evaluation / online adaptation** — Krause et al.; "Revisiting Dynamic Evaluation" (2024) | gradient descent on recent history to adapt LM to local distribution | **Yes — full or partial base-model weights** (parameters become part of temporal state) | inner/online, rolling | Updated weights persist and **roll forward** with the stream; high reuse | Potentially **large write volume** (touches base weights), continuous. Worst case for the writeback axis: write BW ~ model size × update frequency *(uncertain whether full-param or subset in practice)* |
| 6 | **Test-time RL** — TTRL (Zuo et al. 2025); CG-TTRL on-device | RL (majority-vote / self-consistency reward) updates the **policy** at test time | **Yes — policy (model) weights**, plus rollout buffers + optimizer state | outer-loop, multi-rollout per query | Updated policy may persist (specialization) or reset; reuse varies | **Heaviest mixed traffic:** many sampled rollouts (read/KV) **plus** RL gradient writes + optimizer state + experience buffer. Both read- and write-heavy |
| 7 | **Test-time adaptation (TTA)** — TENT-style entropy min., BN-stat update; StreamAdapter | update **norm stats / a small parameter subset** to fit input distribution | **Yes — BatchNorm stats or a small subset** (affine/norm params) | inner/outer, lightweight | Often persists for the stream; cheap to recompute | **Low-volume writeback** (small param subset / running stats). Smallest memory-write footprint of the writeback family |
| 8 | **KV-binding TTT** — "Test-Time Training with KV Binding Is Secretly Linear Attention" (NVIDIA, 2026) | inner-loop KV-binding loss; framed as equivalent to linear attention | **Yes — inner-loop fast state** (interpretable as linear-attention state) | inner-loop, per-token | Sequence-scoped, high reuse | Similar profile to #2; the linear-attention framing suggests the "write" may be expressible as a **state-update recurrence** rather than explicit optimizer steps *(uncertain — equivalence claim to verify)* |

### Reading of the table (claims, with uncertainty)

- **Writes back weights/state:** variants **2, 3, 4, 5, 6, 7, 8**. **Does NOT:** variant **1** (test-time scaling)
  — it is read-dominant and is the comparison baseline, not part of the writeback axis. *(High confidence on the
  read/write split; medium confidence on each variant's exact written object.)*
- **Smallest write footprint:** #7 (norm stats) and #2/#8 (small fast-weight). **Largest / most novel for memory:**
  #4 (optimizer-state-dominated bursts) and #5/#6 (base-weight or policy writes). *(Hypothesis.)*
- **Optimizer state is a first-class memory consumer**, not just the weights: Adam-style moments roughly double
  the written-parameter footprint during adaptation (#4, #6). This is easy to miss if one only counts ΔW.

### Per-variant notes (why each row lands where it does)

- **#1 Test-time scaling.** o1/R1-style reasoning, self-consistency, tree/MCTS search all keep weights frozen and
  pay in *tokens and samples*. The only growing state is the KV cache, which is read-mostly and append-on-generate.
  We keep it in the taxonomy precisely to define the **read-dominant baseline** the writeback axis is measured
  against — and to stop "test-time compute" being misfiled as "writes back."
- **#2 TTT layers.** The conceptual pivot: the RNN hidden state is itself a tiny model whose weights are updated by
  one gradient step **per token**. Writeback is intrinsic to the forward pass, so it cannot be amortized away. This
  is the cleanest example of a high-frequency, small-payload write stream with immediate reuse.
- **#3 Titans / neural memory.** Only a bounded memory module is trained at test time; the surprise gate makes the
  write stream **data-dependent**, which complicates static traffic modeling. *(Uncertain: real-world write duty
  cycle.)*
- **#4 Per-task TTT (ARC).** A two-phase profile — a *write-heavy adapt phase* (LoRA + full optimizer state) then a
  *read-only answer phase* — with the written adapter **discarded** afterward. The memory story is dominated by the
  transient optimizer state, and reuse is essentially zero across tasks.
- **#5 Dynamic evaluation.** The oldest idea here (pre-LLM lineage) and the most aggressive on writes: parameters
  become part of the model's temporal state and roll forward with the stream. Worst case for write bandwidth if it
  touches base weights. *(Uncertain whether practical variants restrict to a subset.)*
- **#6 TTRL.** Explicitly *combines* scaling and training: many rollouts (read/KV heavy) feed a self-rewarded RL
  update (write + optimizer + buffer). The only row that is simultaneously read-heavy and write-heavy.
- **#7 TTA.** Lightweight adaptation (entropy minimization, norm-stat refresh) — included to mark the *floor* of the
  writeback family, useful as a low-cost contrast in experiments.
- **#8 KV-binding TTT.** Interesting because, if the linear-attention equivalence holds, its "training" write may
  reduce to a state-update recurrence with **no optimizer state** — which would move it next to #2 on cost. The
  equivalence is the thing to verify.

## 3. Tradeoffs across the writeback family

| Dimension | Inner-loop fast-weight (#2,#3,#8) | Per-task adapter (#4) | Online full-weight (#5,#6) | Norm/subset TTA (#7) |
|---|---|---|---|---|
| Write frequency | per-token (high) | per-task burst | continuous/rolling | low |
| Written object size | small (state/MLP) | small ΔW **+ large optimizer state** | up to full model | tiny |
| Updated-state reuse | high (next token) | low (discarded) | high (rolls forward) | medium |
| Residency pressure | on-chip / near-memory candidate | optimizer state in HBM during adapt | model-sized, persistent | negligible |
| Endurance concern (if non-volatile) | high write count | bursty | high | low |
| Fit for read-only serving profile | poor | poor (adapt phase) | poor | marginal |

**Implication:** a single "TTT" label hides at least four **different memory profiles**. The writeback-traffic
schema (CAW-01 bridge) must carry per-variant fields, not one global "TTT = writes" flag.

## 4. Candidate writeback-traffic schema seeds (export hint → CAW-01)

These are **proposed fields** the writeback-traffic schema doc/ADR should formalize; listed here only as what the
taxonomy implies. Not a committed schema.

- `written_object` ∈ {none, fast_weight_state, memory_module, lora_adapter, full_weights, norm_stats, policy}
- `update_loop` ∈ {none, inner_per_token, inner_per_segment, outer_per_task, online_rolling}
- `optimizer_state_factor` (×param footprint; e.g. ~2 for Adam) — *uncertain per variant; verify*
- `write_frequency` (per-token | per-segment | per-task | per-stream)
- `updated_state_reuse` (next-token | within-context | cross-task=none | rolls-forward)
- `residency_target` (on-chip | HBM | spill) — *open question whether modelable at L0/L1 abstractly*
- `endurance_sensitivity` (only meaningful for non-volatile write-back media) — *hypothesis*

## 5. Open Questions

Logged to [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md):

- **OQ-1:** For each "writes back" variant, what is the *actual* written-byte volume per token/segment/task? No
  benchmark numbers are claimed here. TODO(open-question: measure write volume in a minimal reproduction).
- **OQ-2:** Is the KV-binding-TTT ⇄ linear-attention equivalence (#8) exact enough that its "write" is just a
  recurrence (no optimizer state)? TODO(open-question: verify equivalence claim).
- **OQ-3:** Do inner-loop fast weights (#2/#3) ever spill from on-chip to main memory at long context, and at what
  context length? TODO(open-question).
- **OQ-4:** For per-task TTT (#4), does optimizer state (not ΔW) dominate the memory write footprint as hypothesized?
- **OQ-5:** Can writeback traffic be modeled at CAW-01's **L0/L1** abstraction before any syntorch/vLLM integration?
  (Core design question carried from the PRODUCT-BRIEF.)
- **OQ-6:** Which variants show **updated-weight reuse** strong enough to matter for caching/residency policy, vs.
  write-then-discard churn (#4)?
- **OQ-7:** Endurance/write-amplification only matters if the updated state lands on non-volatile media — is that a
  realistic deployment assumption, or always HBM/SRAM-resident? *(Hypothesis, unverified.)*

## 6. Implications for runbooks

- **Minimal-reproduction targets:** pick **one inner-loop variant (TTT-Linear, #2)** and **one per-task variant
  (ARC LoRA TTT, #4)** as the first two toy experiments — they sit at opposite ends of the write-frequency / 
  optimizer-state tradeoff and together exercise most schema fields. Log write volume + optimizer-state size; record
  failures (e.g., if write volume is unmeasurable in the toy setup) as first-class results.
- **Instrumentation:** a runbook must capture *written-byte counts*, *update frequency*, and *optimizer-state size*
  — not just accuracy. These are the numbers the writeback-traffic schema needs.
- **Export discipline:** emit taxonomy rows + schema-seed fields to CAW-01 as **open questions + a draft schema**,
  and claims+evidence to CAW-02 — both as explicit file boundaries, no shared store. Never present a taxonomy cell
  as a settled CAW-01 workload requirement; it is a hypothesis with provenance.
- **Import:** when CAW-05 (a separate product) emits a TTT radar signal, slot it into this taxonomy first (which row?
  writes back what?) before opening a research thread.

## 7. Provenance (sources consulted; summaries are not evidence)

- Sun et al., *Learning to (Learn at Test Time): RNNs with Expressive Hidden States*, arXiv:2407.04620 (2024).
- Akyürek et al., *The Surprising Effectiveness of Test-Time Training for Abstract Reasoning / Few-Shot Learning*,
  arXiv:2411.07279 (2024).
- Behrouz et al., *Titans: Learning to Memorize at Test Time*, arXiv:2501.00663 (NeurIPS 2025).
- Zuo et al., *TTRL: Test-Time Reinforcement Learning*, arXiv:2504.16084 (2025); CG-TTRL, arXiv:2511.06430.
- Krause et al., *Dynamic Evaluation of Neural Sequence Models*; *Revisiting Dynamic Evaluation: Online Adaptation
  for LLMs*, arXiv:2403.01518 (2024).
- *Test-Time Training with KV Binding Is Secretly Linear Attention*, arXiv:2602.21204 (NVIDIA, 2026).
- *Inference-Time Hyper-Scaling with KV Cache Compression*, arXiv:2506.05345 (2025) — for the read-only baseline.

> Reminder: these establish that the variants exist and what they update; **per-variant byte-level memory-traffic
> figures are NOT claimed** and must come from CAW-06's own minimal reproductions.
