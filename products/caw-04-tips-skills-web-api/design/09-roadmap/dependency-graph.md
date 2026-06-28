# Dependency Graph

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set review date)
- **Related:**
  - [./milestones-and-phases.md](./milestones-and-phases.md)
  - [./risks-and-mitigations.md](./risks-and-mitigations.md)
  - [../01-decisions/ADR-0004-import-and-ports.md](../01-decisions/ADR-0004-import-and-ports.md)
  - [../01-decisions/ADR-0005-storage-and-versioning.md](../01-decisions/ADR-0005-storage-and-versioning.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

This doc states the **build-order DAG** for CAW-04: which capabilities must exist before others.
The ordering is not arbitrary — it is what makes the public surface **public-safe by construction**.
It does NOT assign phases/milestones (see [milestones-and-phases.md](./milestones-and-phases.md)).

## Invariants the DAG enforces

| Invariant | Edge that enforces it |
|-----------|----------------------|
| No adapter can bypass the gate | ports + registry + **gate** built BEFORE adapters |
| Nothing is built/served before it has an identity & immutability | content model + **storage/versioning** BEFORE build |
| Nothing is published without a core re-check | **import + re-check** BEFORE publish |
| No mutation without addressable history | **versioning** BEFORE any update/unpublish path |
| Audit fields never leak | sidecar split (in content model) BEFORE build/serialize |

## ASCII DAG

```
                          ┌──────────────────────────┐
                          │ A. Content model (8 ents) │
                          │  common fields + SIDECAR  │  (ADR-0002)
                          └─────────────┬─────────────┘
                                        │
              ┌─────────────────────────┼──────────────────────────┐
              v                         v                          v
   ┌────────────────────┐   ┌────────────────────┐    ┌─────────────────────┐
   │ B. Hexagonal core  │   │ C. Config-driven   │    │ D. Storage &        │
   │    + TWO ports     │   │    adapter         │    │    versioning       │
   │  (ADR-0004)        │   │    registry        │    │  git + semver +     │
   └─────────┬──────────┘   └─────────┬──────────┘    │  content-digest     │
             │                        │               │  + sidecar persist  │
             v                        │               │  (ADR-0005)         │
   ┌────────────────────┐            │               └──────────┬──────────┘
   │ E. Publish GATE    │<───────────┘                          │
   │ deny-by-default;   │                                       │
   │ public-safe RE-    │                                       │
   │ CHECK = CORE stage │                                       │
   │ (ADR-0003)         │                                       │
   └─────────┬──────────┘                                       │
             │                                                  │
             v                                                  │
   ┌────────────────────┐                                       │
   │ F. ContentSource   │  upstream boundary claim = EVIDENCE   │
   │    adapters (v1)    │  ONLY; writes git AFTER re-check     │
   │  CAW-02, CAW-03     │                                       │
   │  (ADR-0004/0005)    │                                       │
   └─────────┬──────────┘                                       │
             │                                                  │
             └───────────────┬──────────────────────────────────┘
                             v
                  ┌─────────────────────┐
                  │ G. Build (Astro 5 + │   reads frozen git content
                  │  Starlight SSG)     │   (ADR-0006)
                  │  static artifact    │
                  └─────────┬───────────┘
                            │
              ┌─────────────┼──────────────┐
              v             v              v
     ┌──────────────┐ ┌───────────┐ ┌──────────────┐
     │ H. Website   │ │ I. REST   │ │ J. MCP view  │
     │   (HTML)     │ │  API JSON │ │  + SKILL.md  │
     │              │ │  + raw md │ │  + index.json│
     │  PublishSink │ │  (ADR-0007)│ │              │
     └──────┬───────┘ └─────┬─────┘ └──────┬───────┘
            └───────────────┼──────────────┘
                            v
                  ┌─────────────────────┐
                  │ K. Lifecycle ops    │  needs versioning (D)
                  │  unpublish/redact   │  + published surfaces (H/I/J)
                  │  HTTP 410 tombstone │  (ADR-0003/0005)
                  │  + cache invalidate │
                  └─────────────────────┘
```

## Edge list (machine-checkable)

| From | To | Reason |
|------|----|--------|
| A | B, C, D | core, registry, storage all depend on the typed model |
| A | (sidecar) → G | serialize-time split must exist before build |
| B, C | E | the gate lives in the core; registry feeds it adapters |
| D | E | gate writes via storage; needs versioned identity |
| E | F | adapters may only run behind the gate / re-check |
| D | F | ContentSource writes git AFTER re-check |
| F, D | G | build reads frozen, versioned git content |
| G | H, I, J | one build emits all three surfaces (web/API parity) |
| D | K | unpublish/redact needs versioning + tombstone identity |
| H, I, J | K | lifecycle acts on already-published surfaces |

## Critical path to Milestone M1

```
A → D → (B,C → E) → F → G → {H, I}
```

M1 (one validated Skill → gate → versioned web page + API resource) requires every node on this
path; J/K are not on the M1 critical path but follow immediately.

## Parallelizable work

| Can run in parallel | Constraint |
|---------------------|-----------|
| C (registry) ∥ D (storage) | both only need A |
| H, I, J (surface emitters) | all gated behind G; one build, parallel writers |
| Stub documentation (future adapters) | any time after B/C; no code dependency |

## Open Questions

- Whether the MCP view (J) ships within M1 or M2 — TODO(open-question).
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks

- Topologically sort runbooks by this DAG; never schedule an adapter runbook before the gate runbook.
- The G→{H,I,J} fan-out is a single build runbook with parallel sink writers, not three pipelines.
