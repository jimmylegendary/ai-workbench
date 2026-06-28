# Patent Drafting Module — CAW-03

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [evidence-gate-and-claim-ledger.md](./evidence-gate-and-claim-ledger.md), [ports-and-adapters.md](./ports-and-adapters.md), [../02-research/patent-drafting.md](../02-research/patent-drafting.md), [../01-decisions/ADR-0004-patent-drafting.md](../01-decisions/ADR-0004-patent-drafting.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

The patent path: a separate `PatentEngine` port (PaperOrchestra never drafts patents), sharing the front
(GatedClaimSet) with papers but differing in drafting and gates, plus the **patent-first interlock**.

## Paper vs patent (key differences)

| Aspect | Paper | Patent |
| --- | --- | --- |
| Engine | PaperOrchestra | `PatentEngine` adapter (v1 baseline LLM-assisted) |
| Structure | sections + figures + bib | claims (independent/dependent) + specification + prior-art |
| Prior-art | Semantic-Scholar citation_pool | patent + non-patent prior-art (live search = stub adapter) |
| Disclosure | publish is the goal | **file before disclose** (patent-first) |
| Gate | venue thresholds | enablement/written-description relevant evidence (flagged; counsel decides) |
| Confidentiality | public-safe | counsel / pre-filing tier |
| Terminal gate | reviewer | **human + counsel** filing gate (no autonomous filing) |

## The port

```ts
interface PatentEngineAdapter { capabilities(): EngineDescriptor; draft(inputs: PatentInputs, workspace): PatentDraft }
```
Registered in the same registry as the WritingEngine, selected by config ([ports-and-adapters.md](./ports-and-adapters.md)).

## Patent-first interlock (harness-core logic, not adapter-local)

- A claim flagged **patent-sensitive** ([paper-ladder-and-novelty.md](./paper-ladder-and-novelty.md)) sets
  `InterlockState=held`.
- `publish` of ANY paper artifact whose `GatedClaimSet` contains a held claim is **default-denied**.
- The interlock releases only when the patent gate clears (filed / cleared by counsel).

## Human/counsel gate

CAW-03 produces a **ready-for-filing draft**; it never files. Hand-off format + SLA to internal IP team / external
counsel is a TODO(open-question). Jurisdiction sets grace-period vs absolute-novelty defaults (TODO).

## Open questions

Jurisdiction; provisional-first strategy; who owns the §112 enablement check; 101/eligibility flagging — see
[../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks

The patent runbook implements the PatentEngine port + v1 adapter + the interlock (in core) + the counsel hand-off;
the publish runbook enforces the interlock default-deny.
