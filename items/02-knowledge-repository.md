# 02 — Team/Personal Knowledge Repository

## Goal

Create the knowledge infrastructure and skills that let Jimmy and the team store, retrieve, update, and reuse technical knowledge.

Longer-term direction: continual-learning knowledge repository.

Updated caution: continual learning is not v0. Start with append + retrieve + skill-wrap. The control-plane schema is part of the knowledge-store core because traces, simulation runs, insights, and decisions must remain reconstructable.

## Initial Entities

- `Source`
- `Claim`
- `Evidence`
- `Note`
- `Concept`
- `Interest`
- `OpenQuestion`
- `Decision`
- `Assumption`
- `Trace`
- `SimulationRun`
- `Experiment`
- `RelatedWork`
- `RadarSignal`

## Core Principle

The knowledge store must distinguish:

- raw source,
- extracted claim,
- evidence for claim,
- generated synthesis,
- decision,
- open question,
- experiment output,
- trace/projection artifact,
- related-work threat or support signal.

Generated summaries are not evidence by themselves.

## Design Questions

- Should v0 storage be markdown, SQLite, or both?
- What minimum schema allows future graph/continual-learning upgrades?
- How should team knowledge and Jimmy-private knowledge be separated?
- What skill interface should agents use to add/update knowledge safely?
- How should radar findings from `CAW-05` become sources/claims/open questions rather than loose summaries?
- How should simulation projections from `CAW-01` become durable evidence without leaking confidential data?

## Next Actions

- Define v0 schema.
- Define public/internal/confidential source boundaries.
- Create a first `add-source -> extract-claims -> synthesize-note` workflow.
- Create `add-related-work-signal -> classify-threat/support -> link-to-claim` workflow.
