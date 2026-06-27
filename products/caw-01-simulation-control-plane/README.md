# CAW-01 — Simulation Control Plane

A **standalone** simulation control plane: a domain expert's instrument for memory-centric
design-space exploration.

It carries one experiment end to end:

`(workload, hardware config, simulation config) → trace → memory-annotated IR → metric → comparable projection`

across three evidence axes — real measurement (service infra → OTel trace), synthetic
execution (syntorch → Chakra trace), and simulation (LLMServingSim + ASTRA-sim). The design
emphasizes a memory-annotated IR (L0/L1/L2 fill levels), a trust ladder for unbuilt-device
assumptions, and a control-plane UI (run status, evidence completeness, open questions,
blockers, next honest action) rather than a chatbot.

This is an independent product. It does not depend on any shared substrate; any use by other
products happens through an explicit export boundary.

## Design

The full design lives under `design/`:

- `design/README.md` — design index (English).
- `design/korean/` — Korean (KO) version of the design.
</content>
