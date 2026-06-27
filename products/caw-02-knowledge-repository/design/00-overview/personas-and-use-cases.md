# Personas & Use Cases — CAW-02

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set review date)
- **Related:**
  - [vision.md](./vision.md)
  - [scope-and-non-goals.md](./scope-and-non-goals.md)
  - [ADR-0001 Product surface & skill interface](../01-decisions/ADR-0001-product-surface-and-skill-interface.md)
  - [ADR-0005 Ingestion pipeline](../01-decisions/ADR-0005-ingestion-pipeline.md)
  - [ADR-0006 Retrieval](../01-decisions/ADR-0006-retrieval.md)
  - [ADR-0007 Import/export contracts](../01-decisions/ADR-0007-import-export-contracts.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This doc names the **personas** of CAW-02 and walks through the **use cases** that the design must support, so the
ADRs and runbooks can be checked against concrete flows. It describes *what each actor does and what the system
guarantees*; it does not specify op signatures, schemas, or storage layout (see the linked ADRs and
[02-research](../02-research)).

## 1. Personas

| Persona | Role | Primary surface | Trust / write rights | Cares most about |
|---------|------|-----------------|----------------------|------------------|
| **Jimmy** (curator) | Domain expert; reviewer of strategic decisions | CLI + read-only viewer | Can author up to T3; approves agent submissions; records `Decision`/`Assumption` | Reconstructability; no leakage; fast retrieval with trust |
| **The team** (contributors/readers) | Add and consume knowledge | CLI + API + viewer | Author within team `visibility`; reviewed writes | Finding "what we know about X, with evidence" |
| **AI agents** | Run vetted knowledge transactions via skill-wrap | MCP (skill interface) | **Capped at T2**; confirmation-by-default; reviewed before accept | Performing the loop without corrupting provenance |

Notes:
- Agents never bypass the **evidence gate**: `attach_evidence` has no prose field and `artifact_ref` must resolve.
- Agent submissions are **reviewed by default** (no silent auto-accept in v0); rejected candidates may be retained
  for audit ([ADR-0005](../01-decisions/ADR-0005-ingestion-pipeline.md)).
- `visibility {team,private}` separates team knowledge from Jimmy-private notes; `boundary {public,internal,
  confidential}` is orthogonal ([ADR-0004](../01-decisions/ADR-0004-provenance-and-trust.md)).

## 2. Use-case walkthroughs

### UC-1 — Core ingestion loop (the unit of value)
**Actor:** AI agent proposes; Jimmy reviews. **Goal:** turn a real source into reusable, cited knowledge.

```
add-source(url|file)                  → Source node (boundary/visibility set)
  → extract-claim(s)                   → Claim candidate(s)        [reviewed]
    → attach-evidence(artifact_ref)    → Evidence (gate: ref MUST resolve; no prose)
      → synthesize-note(cites: [...])  → Note (cited; NEVER itself evidence)
```

Guarantees exercised: Claim→≥1 Evidence invariant; evidence gate; append-only + event-log mirror; monotone
boundary propagation; AI-authored trust capped at T2 pending Jimmy's review. This is the **first vertical slice**
(see [vision.md](./vision.md) §6). Pipeline detail: [ADR-0005](../01-decisions/ADR-0005-ingestion-pipeline.md).

### UC-2 — Radar / related-work signal intake
**Actor:** AI agent (ingesting a CAW-05 export). **Goal:** classified intake, not loose summaries.

```
import CAW-05 signal (file/API)
  → quarantine + boundary check
    → classify threat | support
      → map to Source / Claim / OpenQuestion / RelatedWork / RadarSignal (typed)
        → link-to-claim where applicable
```

Guarantees: signals become **typed nodes**, never free-text blobs; classification is recorded as provenance; the
Claim→Evidence invariant still holds for any Claim created. CAW-05 is a **separate product**; this is a file/API
import boundary ([ADR-0007](../01-decisions/ADR-0007-import-export-contracts.md)).

### UC-3 — Retrieve "what do we know about X?"
**Actor:** Jimmy or team member. **Goal:** answer a question *with evidence and trust level*.

```
query("X") + filters{boundary, visibility, type, trust, concept}
  → structured filters applied BEFORE ranking
    → FTS5 BM25 ranking
      → results hydrate the provenance chain (claim + evidence + note)
        → citation-constrained RAG (returns claim+evidence, never opaque blobs)
```

Guarantees: filters are first-class and applied before ranking; every result carries its trust level and walkable
provenance; RAG cannot return an un-cited blob. No embeddings in v0 ([ADR-0006](../01-decisions/ADR-0006-retrieval.md)).

### UC-4 — Import a CAW-01 projection as evidence
**Actor:** Jimmy or agent. **Goal:** make a simulation result durable evidence *without leaking confidential data*.

```
receive CAW-01 projection/evidence export (file/API, signed)
  → quarantine-on-import + confidentiality check
    → map to Evidence (+ imported refs: Trace / SimulationRun / Experiment)
      → attach Evidence to the target Claim   (invariant satisfied)
```

Guarantees: large artifacts referenced by path/URI, not copied as prose; boundary enforced at import (no
confidential leak); the projection is **cataloged, never executed** here. CAW-01 is a **separate product**.

### UC-5 — Export a cited bundle to CAW-03
**Actor:** Jimmy (curator approves the export). **Goal:** hand a paper/patent product a defensible bundle.

```
select Claim(s) → gather cited Evidence chain
  → fail-closed allow-list filter (public-safe only)
    → re-redaction at the crossing
      → sign bundle + attach provenance manifest
        → export to CAW-03 (file/API)
```

Guarantees: **fail-closed** — anything not on the allow-list is dropped, not leaked; no confidential item can reach
a public-facing destination; bundle is signed and carries its provenance manifest. CAW-03 is a **separate product**
([ADR-0007](../01-decisions/ADR-0007-import-export-contracts.md)).

### UC-6 — Record a Decision / OpenQuestion / Assumption
**Actor:** Jimmy. **Goal:** keep strategic reasoning linked to its evidence.

```
record Decision (or OpenQuestion / Assumption)
  → link to supporting Claim(s) + Evidence
    → append-only write + event-log mirror
```

Guarantees: decisions stay reconstructable (which claims/evidence they rested on); superseding a Decision keeps the
prior one in history. Jimmy is the reviewer for strategic decisions; automatic generation is proposal-only
(PRODUCT-BRIEF §10).

## 3. Persona × use-case matrix

| Use case | Jimmy | Team | AI agent |
|----------|:-----:|:----:|:--------:|
| UC-1 core loop | reviews/approves | contributes | proposes (T2 cap) |
| UC-2 signal intake | reviews | reads | proposes/maps |
| UC-3 retrieve | yes | yes | yes (read) |
| UC-4 import projection | yes | — | proposes/maps |
| UC-5 export bundle | **approves** | — | prepares only |
| UC-6 decision/question | **authors** | proposes | proposes |

## Open questions
See [08-research-plan/open-questions.md](../08-research-plan/open-questions.md) (TODO: create). Open here:
do team members need a finer write-role split than the single `visibility {team,private}` axis in v1? Should
UC-5 export require a second reviewer beyond Jimmy?

## Implications for runbooks
- The first runbook slice implements **UC-1** end-to-end through the skill-wrap before any import/export use case.
- Every write-path runbook must enforce reviewed-by-default for agent submissions and exercise the evidence gate.
- Import runbooks (UC-2, UC-4) implement quarantine first; the export runbook (UC-5) implements the fail-closed
  allow-list before any field mapping.
