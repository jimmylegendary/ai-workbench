# 06 — AI Future / TTT Research Automation

## Goal

Automate technology collection, hypothesis generation, small experiments, and research tracking around the future of AI, including TTT.

This surface should connect public research to concrete experiments and company-relevant implications.

Updated framing: TTT is not just future-AI research. It is a candidate future workload axis for the simulation control plane.

The architectural point is that inference may write back:

- weight updates,
- gradients,
- optimizer state,
- write traffic,
- updated-weight reuse.

That could create a memory axis not captured by read-dominant LLM serving profiles.

## Initial Workflow

1. Source discovery.
2. Claim extraction.
3. Hypothesis generation.
4. Minimal reproduction / toy experiment planning.
5. Result logging.
6. Implication mapping for AI services, education, dev platforms, models, hardware, and memory-centric systems.

## Memory-Centric Hypothesis

TTT-class workloads may require memory-device properties different from current inference-serving assumptions:

- write bandwidth,
- write endurance,
- near-memory update/optimization,
- updated state residency,
- capacity/bandwidth ratio changes over context/update frequency.

This is currently a hypothesis to be investigated, not a settled claim.

## Design Questions

- Which TTT/test-time compute claims are experimentally checkable with available resources?
- How should uncertain future-AI hypotheses be represented without overclaiming?
- What is the right small experiment ledger?
- How should failures be kept useful?
- Which TTT variants actually update weights or state during inference?
- Can write traffic be modeled at L0/L1 before full syntorch/vLLM integration?

## Next Actions

- Define an `ExperimentScout` workflow.
- Track 5-10 core research themes.
- Define a minimal result ledger for small reproductions.
- Define writeback-traffic schema fields that connect to `CAW-01` IR.
- Create a TTT source shortlist and claim/evidence ledger.
