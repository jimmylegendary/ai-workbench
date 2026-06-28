# Runbook Conventions — CAW-03

- **Status:** draft
- **Owner:** Jimmy
- **Audience:** the AI builder
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md · ../_meta/DOC-CONVENTIONS.md §6

## The contract

Every runbook follows DOC-CONVENTIONS §6:

```
# RB-XXX: <imperative title>
- Status: ready | blocked
- Phase: <folder>
- Depends on: [RB-###, ...]
- Implements design: [links]
- Produces: <artifacts/components>

## Objective / Preconditions / Steps (Do:+Verify:) / Acceptance criteria / Rollback / Hand-off
```

## Builder rules specific to CAW-03

- **Do NOT rebuild PaperOrchestra.** It is the v1 `WritingEngineAdapter`, invoked as a subprocess. Treat it as a
  black box behind the port.
- **Governance lives in the core, never in adapters.** The gate, the patent-first interlock, and confidentiality
  must run in core services; an adapter (or a stub, or a misbehaving fake) must never be able to bypass them.
- **Generated text is never evidence.** Enforce structurally (no prose evidence field; artifact_ref must resolve).
- **Ports first, adapters second.** Build the 5 ports + registry + preflight + fakes before any real adapter.
- **Documented stubs for future connectors** (internal wiki, experiment-server, venue, filing): ship the interface
  + `implemented:false` descriptor + config example; never a silent no-op that drops governance.
- **Reference, don't copy** CAW-01/CAW-02 data (id/URI). No shared store.
- **Human gate** on publish/filing; never autonomous.
- Leave the tree green (compiles, lint+tests pass) at each Acceptance checkpoint so an interrupted build resumes.

## Verify vocabulary

`cmd:` shell exit/output · `test:` unit/contract/e2e test · `view:` manual/visual confirmation.
