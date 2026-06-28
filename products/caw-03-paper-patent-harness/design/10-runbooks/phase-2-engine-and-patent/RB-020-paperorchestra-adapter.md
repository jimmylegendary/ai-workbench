# RB-020: PaperOrchestra WritingEngine adapter

- Status: ready
- Phase: phase-2-engine-and-patent
- Depends on: [RB-012, RB-002]
- Implements design: [../../05-harness-core/writing-engine-adapter-paperorchestra.md](../../05-harness-core/writing-engine-adapter-paperorchestra.md), [../../01-decisions/ADR-0002-writing-engine-integration.md](../../01-decisions/ADR-0002-writing-engine-integration.md)
- Produces: `adapters/writing-engine/v1/paperorchestra` behind the WritingEngineAdapter port

## Objective

Wrap PaperOrchestra as the v1 `WritingEngineAdapter`, invoked in **subprocess** mode over `workspace/`, mapping the
engine-neutral bundle to PaperOrchestra inputs and capturing outputs + provenance. **Do NOT modify PaperOrchestra.**

## Preconditions
- [ ] RB-012 (engine-neutral inputs), RB-002 (ports/registry). Resolve OQ-01 (non-interactive entrypoint) + OQ-02 (version pin).

## Steps
1. **Do:** Implement the adapter's `capabilities()` (EngineDescriptor: pinned PaperOrchestra version + schema).
   **Verify:** `test:` registry preflight pins/validates the version.
2. **Do:** Map the engine-neutral bundle → PaperOrchestra inputs (`idea.md`, `experimental_log.md`, `template.tex`, `conference_guidelines.md`, figures) into `workspace/<run>/`.
   **Verify:** `test:` mapping produces the expected PO input files for a fixture.
3. **Do:** Invoke PaperOrchestra as a subprocess (resolved entrypoint); capture `latex/pdf/bib/scores`.
   **Verify:** `cmd:` a fixture run produces a PDF + scores (or a mocked PO in CI).
4. **Do:** Capture provenance: bind PO `figure_id` → CAW-01 `result_id` into the FigureTableManifest.
   **Verify:** `test:` T6 — figure_id↔result_id round-trips.

## Acceptance criteria
- [ ] PaperOrchestra runs via the adapter (subprocess); outputs + scores captured.
- [ ] Version pinned via preflight; provenance manifest built; PaperOrchestra unmodified.

## Rollback / safety
Adapter only; revert to roll back. PO is a black box; never fork it.

## Hand-off
RB-021 orchestrates a full draft run + lifecycle around this adapter.
