# Ports & Adapters (Open Integration Seams) — CAW-03

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [../03-architecture/component-boundaries.md](../03-architecture/component-boundaries.md), [../02-research/ports-and-adapters-architecture.md](../02-research/ports-and-adapters-architecture.md), [../01-decisions/ADR-0005-ports-and-adapters.md](../01-decisions/ADR-0005-ports-and-adapters.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

THE load-bearing design property: CAW-03 is hexagonal — the core depends only on **typed ports**, and every
external system (inputs, engines, outputs, signals) is an **adapter** selected by config. Future integrations
(internal wiki, internal experiment-server, venue submission, patent filing) plug in by implementing one adapter,
**without changing the core**.

## The five ports

| Port | Role | v1 adapters | Future adapters (documented stubs in v1) |
| --- | --- | --- | --- |
| `SourceAdapter` | provide claim+evidence bundles + result refs | CAW-02 bundle, CAW-01 results | **internal wiki**, **internal experiment-server**, arbitrary user bundle |
| `WritingEngineAdapter` | paper drafting | PaperOrchestra | other engines |
| `PatentEngineAdapter` | patent drafting | v1 baseline | external patent tools |
| `Sink`/`PublishAdapter` | emit outputs | LaTeX/PDF | **internal wiki publish**, venue submission, patent filing |
| `Novelty`/`RadarAdapter` | related-work + threat signals | citation_pool + CAW-05 | live prior-art / patent search |

## Adapter contract

Every adapter exposes a **capability descriptor** + its operation:

```ts
interface Adapter { capabilities(): Descriptor }   // { id, port, version, configSchema, features }
// + the port-specific method (fetch / draft / publish / signals)
```

## Config-driven registry + preflight

- Adapters are **registered** and selected by **config** (which adapter implements each port), never hard-coded.
- Before use, the registry runs **preflight**: validates the adapter's `configSchema`, checks version/feature
  compatibility, and refuses incompatible adapters.
- Secrets/auth are referenced by **env refs** per adapter (no shared runtime substrate).

```yaml
# config example
ports:
  source:   [ { id: caw02-bundle }, { id: caw01-results } ]   # fan-in (precedence: TODO)
  engine:   { id: paperorchestra, version: ">=x.y" }
  patent:   { id: baseline-patent }
  sink:     { id: latex-pdf }
  novelty:  { id: caw05-radar }
```

## Documented-stub pattern (the open seam)

A future connector ships now as a **stub adapter**: the interface + a `not-implemented` marker + a config example +
a capability descriptor advertising `implemented: false`. Selecting it is allowed but preflight reports it as a
no-op/unavailable safely. **Wiring the real connector later = filling in that one adapter.** Example targets:
`source/internal-wiki`, `source/experiment-server`, `sink/internal-wiki-publish`, `sink/venue-submission`,
`sink/patent-filing`, `novelty/live-prior-art`.

## Governance cannot be weakened by an adapter

Gates, the patent-first interlock, and confidentiality run in the **core**, around adapter calls. A misbehaving or
malicious adapter cannot bypass them ([../03-architecture/component-boundaries.md](../03-architecture/component-boundaries.md)).

## Open questions

Source fan-in precedence + provenance merge; sync vs async (job-handle) engine runs; adapter discovery mechanism +
SemVer/compat policy; whether Novelty is one port or split (related-work vs radar) — see
[../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks

A dedicated runbook builds: (1) ports + value objects + fakes, (2) the registry + config + preflight, (3) the v1
adapters, (4) the brief-mandated documented stubs. This is the seam that keeps wiki/exp-server integration cheap.
