# Serving & Representation Layer — CAW-01

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [canvas-2-serving-representation.md](./canvas-2-serving-representation.md), [trace-pipeline-syntorch-chakra.md](./trace-pipeline-syntorch-chakra.md), [../01-decisions/ADR-0005-trace-pipeline.md](../01-decisions/ADR-0005-trace-pipeline.md), [../02-research/serving-and-simulation-frameworks.md](../02-research/serving-and-simulation-frameworks.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## Purpose

Define what the user composes in Canvas 2: for a given LLM model, **which serving framework**, **which
representation layer**, and **which simulator path** to run, and the **grammar** that makes a wiring legal.
Canvas-2 UX is in [canvas-2-serving-representation.md](./canvas-2-serving-representation.md); the resulting
trace flow is in [trace-pipeline-syntorch-chakra.md](./trace-pipeline-syntorch-chakra.md).

## The three composable dimensions

| Dimension | Choices (v1) | Meaning |
| --- | --- | --- |
| **Serving framework** | vLLM (harness) · LLMServingSim | the request/serving loop |
| **Representation layer** | torch · **syntorch** | what executes below `forward()`; syntorch enables sub-torch capture |
| **Simulator path** | ASTRA-sim (analytical) · +SST/ns-3 (flag) | how comm/network/compute is timed |

These map to a `SimulationConfig` ([../04-data-layer/data-model.md](../04-data-layer/data-model.md)).

## Building blocks (from research)

- **vLLM** = real serving loop; `syntorch` replaces everything from `model.forward()` down (the torch frontend contract).
- **LLMServingSim** = simulated serving loop that **already embeds a modified ASTRA-sim + Chakra** (emits Chakra per iteration).
- **ASTRA-sim** = consumes Chakra ET; analytical backend default; ns-3/SST behind a flag.
- **syntorch** = drop-in torch frontend with custom kernels/HW logic + a Chakra exporter ([SOURCE-BRIEF §7](../_meta/SOURCE-BRIEF.md)).

## Pipeline grammar (legal wirings)

Canvas 2 validates a composition against this grammar before it can run:

```
LLM model ─► serving{ vLLM | LLMServingSim }
serving=vLLM      ─► representation{ torch | syntorch }
  representation=syntorch ─► [syntorch capture] ─► [Chakra exporter] ─► chakra.et ─► ASTRA-sim{analytical|+SST}
  representation=torch    ─► (no sub-torch capture; real/aux only)
serving=LLMServingSim ─► (embeds Chakra+ASTRA-sim) ─► chakra/metrics
ALL axes ─► [Chakra→L0 lowering] ─► one L0 IR
```

Validation rules (typed handles in Canvas 2):
- syntorch is only attachable under a serving framework that exposes the torch frontend (vLLM harness).
- A Chakra exporter must precede ASTRA-sim.
- A hardware config (Canvas 3) is required before ASTRA-sim/SST can run.
- The simulation axis (LLMServingSim) and synthetic axis (syntorch) may both target the **same** L0 for comparison.

## Composition → run

A valid composition + a Canvas-1 workload + a Canvas-3 hardware config = a runnable `Experiment`.
`RunService.start` dispatches each enabled axis to the engine ([../03-architecture/data-flow.md](../03-architecture/data-flow.md)).

## Open questions

The brief's `LLMServingSim → syntorch → ASTRA-sim` ordering conflicts with LLMServingSim already embedding
ASTRA-sim. v1 resolution: **run axes in parallel into one L0** rather than chaining; whether syntorch should
instead replace LLMServingSim's per-op cost model is a TODO(open-question)
([../08-research-plan/open-questions.md](../08-research-plan/open-questions.md)).

## Implications for runbooks

The phase-2 Canvas-2 runbook implements the grammar/validation; the phase-3/4 runbooks implement the per-axis
dispatch behind the engine ports.
