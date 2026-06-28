# Adapter Registry & Config — CAW-03

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [../05-harness-core/ports-and-adapters.md](../05-harness-core/ports-and-adapters.md), [../01-decisions/ADR-0005-ports-and-adapters.md](../01-decisions/ADR-0005-ports-and-adapters.md), [api-surface.md](./api-surface.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

The config-driven registry that discovers, preflights, and selects adapters per port — the mechanism that keeps the
open seams safe and customizable.

## Responsibilities

| Step | Behavior |
| --- | --- |
| **Discover** | enumerate registered adapters per port (entry-point group or config manifest — TODO) |
| **Select** | choose the adapter per port from config (fan-in allowed for SourceAdapter) |
| **Preflight** | validate the adapter's `configSchema`, check version/feature compatibility; refuse incompatible |
| **Instantiate** | inject per-adapter secrets via **env refs** (no shared substrate) |
| **Stub handling** | a documented stub is selectable but preflight reports `implemented: false` → safe no-op/unavailable |

## Config

```yaml
ports:
  source:  [ { id: caw02-bundle }, { id: caw01-results } ]   # fan-in; precedence: TODO(open-question)
  engine:  { id: paperorchestra, version: ">=x.y" }
  patent:  { id: baseline-patent }
  sink:    { id: latex-pdf }
  novelty: { id: caw05-radar }
profiles:
  gate:    { ... }       # gate thresholds per claim type
  confidentiality: { ... }
```

## Capability descriptor

```ts
type Descriptor = { id, port, version, features: string[], configSchema: ZodSchema, implemented: boolean }
```
Preflight = validate config against `configSchema` + assert `features`/`version` satisfy the core's needs.

## Governance guarantee

The registry never lets an adapter override a core gate/interlock/confidentiality; adapters only supply
data/engines ([../03-architecture/component-boundaries.md](../03-architecture/component-boundaries.md)).

## Open questions

Discovery mechanism (entry-point vs manifest); SemVer/compat policy; source fan-in precedence; per-adapter secret
model — see [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks

The registry runbook implements discovery + preflight + config selection + stub handling before the v1 adapters land.
