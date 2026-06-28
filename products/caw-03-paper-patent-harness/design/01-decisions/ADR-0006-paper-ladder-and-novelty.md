# ADR-0006: Paper ladder (P1/P2/P3) and novelty / claim-boundary governance

- Status: proposed
- Owner: Jimmy
- Last-reviewed: TODO(open-question: set on review)
- Related:
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md) (§3, §5, §6)
  - [../02-research/novelty-priorart-and-venue.md](../02-research/novelty-priorart-and-venue.md) (research this ADR ratifies)
  - [./ADR-0002-writing-engine-integration.md](./ADR-0002-writing-engine-integration.md) (engine owns citation discovery; harness reuses its verified pool)
  - [./ADR-0003-evidence-gate-and-claim-ledger.md](./ADR-0003-evidence-gate-and-claim-ledger.md) (P1/P2/P3 claim typing; gate before novelty)
  - [./ADR-0004-patent-drafting.md](./ADR-0004-patent-drafting.md) (patent-first interlock, patentability screen)
  - [./ADR-0005-ports-and-adapters.md](./ADR-0005-ports-and-adapters.md) (Novelty/Radar port, registry, stubs)
  - [./ADR-0007-confidentiality-and-boundary.md](./ADR-0007-confidentiality-and-boundary.md) (boundary gate; patent-first egress block)
  - [./ADR-0008-artifact-lifecycle-and-storage.md](./ADR-0008-artifact-lifecycle-and-storage.md) (patent-first is a lifecycle state)
- Source of truth: ../_meta/PRODUCT-BRIEF.md

## Context

The brief (§3, §6) requires CAW-03 to add a **novelty / claim-boundary checker** (novel vs threatened, which claims
need patent-first handling) and a **paper ladder (P1/P2/P3) + portfolio** that plans/tracks the program paper
sequence with per-paper readiness gates. CAW-05 (a separate product) supplies a trend/threat radar that CAW-03
**imports** through a port; CAW-03 never crawls the field itself.

The forces:

- **Three concerns touch "related work" and must not be conflated.** (1) *Citation discovery + verification* for a
  draft is owned by PaperOrchestra's `literature-review-agent` (Semantic Scholar-verified BibTeX, ADR-0002).
  (2) *Trend/threat radar* over the field is owned by CAW-05. (3) *Novelty governance* — "is this claim still novel?
  does it need patent-first?" — is the CAW-03 value-add this ADR decides. Discovery is delegated; the **decision** is
  the harness's.
- **Generated text is never evidence (brief §3, §10; ADR-0003 §1).** An LLM novelty opinion can *flag* for human
  review but can never be the sole basis for `novel`/`anticipated`. The verdict must be auditable and replayable.
- **Disclosure order can burn patent rights.** P3 (future-device) claims are patent-sensitive by default; publishing
  before filing can forfeit the right. The patent-first gate must **fail closed**.
- **"P1/P2/P3" is overloaded** in the brief as both a *claim type* and a *paper-ladder rung*. This ADR fixes the
  mapping so the two readings stay consistent.
- **Open seams (brief §5).** Radar import, paper prior-art, and patent prior-art are sub-capabilities behind one
  Novelty/Radar port; live prior-art services are future adapters, port-only in v1.

## Options considered

### A. Who owns the novelty decision

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Harness decides; engine + radar supply (chosen)** | Governance stays independent of any one engine; reuses the engine's verified pool without re-querying | Harness carries a verdict model | **Chosen** |
| Bake novelty into PaperOrchestra | One place | Couples governance to the engine; breaks on engine swap (ADR-0002) | Rejected |
| Pure CAW-05 dependency | Less code | Violates independence (§1); radar is trend signal, not a per-claim gate | Rejected |

### B. Novelty detection method (v1)

| Option | Pros | Cons | v1 decision |
|---|---|---|---|
| **Overlap/retrieval signal** (embed claim, retrieve nearest related-work + radar, threshold) | cheap, explainable, no fabrication | crude; threshold tuning | **v1 baseline** |
| LLM contradiction/anticipation judge | catches semantic overlap retrieval misses | can hallucinate a verdict | v1 **advisory only**, never sole gate |
| Full agentic novelty scorer (OpenNovelty-style) | strongest, citation-grounded | heavy, external dep, immature | **port-stub** (future) |
| Human verdict | authoritative | slow | **required** for `threatened`/`patent-sensitive` |

### C. Radar coupling to CAW-05

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Import CAW-05 file artifact through the port (chosen)** | No shared substrate; CAW-05 stays separate; reuses the same boundary envelope CAW-02 uses | Bundle can go stale (freshness SLA needed) | **Chosen** |
| Live API into CAW-05 | Freshest | Violates independence §1 (shared runtime coupling) | Rejected |

### D. Prior-art default service

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **PatentsView free API + stubs (chosen)** | zero-cost, no key, scriptable | US-only, bibliographic | **v1 default** |
| Google Patents / Lens / EPO-OPS / PQAI | richer coverage / semantic | GCP billing / paid / EU-only / immature | future stubs |

## Decision

**1. The harness decides novelty; the engine and radar only supply.** CAW-03 reuses PaperOrchestra's
Semantic-Scholar-verified `citation_pool.json` (ADR-0002 output) as the **paper prior-art** input — it does not
re-query — and imports CAW-05 radar signals through the Novelty/Radar port. From these plus optional patent prior-art
it computes a per-claim **novelty verdict**.

**2. Novelty verdicts and the claim-boundary model.** Each typed claim (from the ADR-0003 ledger) carries a verdict
computed at draft time and re-checkable:

| Verdict | Meaning | Default gate action |
|---|---|---|
| `novel` | no prior-art/radar collision above threshold | proceed to draft |
| `threatened` | partial scope collision (overlaps, does not fully anticipate) | **propose a narrower claim boundary**; human review |
| `anticipated` | prior art fully covers the claim | block paper claim as-is; demote to background / cite it |
| `superseded` | a newer result beats ours | flag; may invalidate the contribution framing |
| `patent-sensitive` | patentable subject matter we may want to protect | route to **patent-first** (ADR-0004) before any publication |

**Claim-boundary** (the explicit scope of an assertion) is a **first-class field**. On a `threatened` claim the
harness proposes a narrowing (operating regime / constraint / metric / mechanism the prior art lacks); the engine
drafts to that boundary and the patent path reuses it as a claim limitation. This couples the two paths through one
boundary object instead of two divergent scopes.

**3. A novelty verdict is `(retrieval_signal, llm_advisory, human_decision)`.** The retrieval overlap signal is the
v1 baseline; the LLM judge is **advisory flag-only**; a human decision is **required** for `threatened` and
`patent-sensitive`. Generated LLM text is never the sole basis for `novel`/`anticipated` — it only flags. The
harness records all inputs and an `inputs_digest` so the verdict is auditable and replayable (mirrors the
evidence-gate invariant, ADR-0003).

**4. P1/P2/P3 mapping (claim type ⇄ ladder rung).**

- **Claim typing** (imported from the CAW-02 ledger, ADR-0003): **P1** = core method claim; **P2** = tool/system
  claim; **P3** = future-device / forward-looking projection. Patent posture: P1 usually publishable (patent
  optional), P2 sometimes patentable, **P3 patent-sensitive by default**.
- **Paper ladder** (the program paper sequence): **P1 (method) → P2 (tool/system + results) → P3 (future-device /
  vision)**. The sequence is chosen so disclosure order does not burn patent rights. Each rung has a **readiness
  gate**: claims pass the evidence gate (ADR-0003) **and** novelty verdict ≠ `anticipated` **and** confidentiality
  clears (ADR-0007). v1 *tracks* the ladder; Jimmy decides (brief §9 — no full portfolio automation).

**5. Patent-first is a fail-closed gate (the load-bearing rule).**

| Claim type | Novelty verdict | Action |
|---|---|---|
| P1 / P2 | `novel` | draft paper; patent optional (human flag) |
| P1 / P2 | `threatened` | narrow boundary, re-check, then draft |
| P1 / P2 | `patent-sensitive` (human-flagged valuable) | **patent-first**: hold paper until a filing decision |
| P3 | any | **patent-first by default**: no public draft until file/abandon recorded |
| any | `anticipated` | block as a contribution; demote to background |

**Patent-first** blocks a publication-bound draft for that claim until a human records `file` (→ patent path runs
first, ADR-0004), `abandon-protection` (→ publish allowed), or `defer` (→ stays blocked). This is a state on the
artifact lifecycle (ADR-0008), enforced by the harness, and it **fails closed** — the egress interlock in ADR-0007
§2.3 is the enforcement point.

**6. Venue-fit is advisory, not a gate.** The harness produces a ranked venue-fit note (top-N venues + rationale +
next deadline) from the engine's verified citation pool, fields-of-study, CFP trackers, and the venue's
`conference_guidelines.md`. The human picks; auto-submission is a non-goal (§9). The chosen venue feeds back into the
ladder rung and the engine's guidelines input (ADR-0002 §5).

**7. The Novelty/Radar port and v1 adapters (ADR-0005).** One typed port, config-selected; sub-capabilities declared
in a capability descriptor so the harness degrades gracefully (CAW-05 import works even with no live patent search).

```python
class NoveltyRadarPort(Protocol):
    def capabilities(self) -> CapabilityDescriptor: ...
    def check_novelty(self, req: NoveltyRequest) -> NoveltyVerdict: ...      # core gate input
    def search_prior_art(self, req: PriorArtQuery) -> list[PriorArtHit]: ... # optional capability
    def import_radar(self, bundle_uri: str) -> list[RadarSignal]: ...        # CAW-05 file-drop import
# v1 implemented: CAW-05 radar import; engine-pool reuse (paper prior-art, offline_ok);
#                 retrieval + LLM-advisory checker; PatentsView (thin, free) patent prior-art
# stubs (port-only): Google Patents / Lens / EPO-OPS / PQAI; OpenNovelty-style agentic scorer
```

`RadarSignal` **reuses the CAW-05 boundary envelope** (the same shape CAW-02 consumes); CAW-03 imports the same file
artifact and never reaches into CAW-05's store. `raw_summary` is generated text → excluded from evidence.
`NoveltyVerdict` carries `retrieval_signal`, advisory `llm_advisory`, `proposed_boundary_narrowing`, `patent_first`,
`human_decision`, and a replayable `inputs_digest`.

## Consequences

**Easier:**
- Governance is engine-independent: swapping PaperOrchestra (ADR-0002) does not move the novelty decision.
- No double-fetch: the engine's verified pool is the paper prior-art source; the harness only supplements with radar
  and (optional) patent prior-art.
- Patent rights are protected by a fail-closed, lifecycle-enforced gate, not author memory.
- A live prior-art or agentic-novelty service later is one adapter behind the same port (ADR-0005).
- `threatened` claims get a concrete, reusable narrower boundary that serves both the paper and the patent path.

**Harder / costs:**
- The retrieval overlap threshold and embedding model need tuning, and CAW-05 bundles can go stale (a freshness SLA
  on the gate is required before "submission-ready").
- Human review is mandatory for `threatened`/`patent-sensitive`, adding latency (accepted: rights protection > speed).
- The harness must keep three "related work" concerns cleanly separated to avoid coupling the engine, the radar, and
  the governance decision.

**Follow-on work (runbooks):**
- RB (novelty-radar-port): port + capability descriptor + verdict/signal schemas; config registry; four v1 adapters
  + stubs.
- RB (radar-import adapter): CAW-05 file-drop importer reusing the shared envelope + re-redaction; map `related_to`
  to harness claim ids; dedup by `external_ids`; exclude `raw_summary` from evidence.
- RB (novelty-checker): retrieval signal over engine pool + radar; LLM advisory flag-only; auditable verdict.
- RB (patent-first gate): lifecycle state + fail-closed gate keyed on P3 / `patent-sensitive` (ADR-0008, ADR-0007).
- RB (prior-art adapter — PatentsView v1): thin rate-limit-aware client; redact query text; document the
  Google/Lens/EPO/PQAI stubs.
- RB (paper-ladder + venue-fit): ladder plan with per-rung readiness gates; venue-fit note feeding the engine's
  `conference_guidelines.md`.

## Open questions / revisit triggers

- TODO(open-question: overlap threshold + embedding model for `retrieval_signal` — tune on what corpus, avoiding a shared dependency with CAW-05's scorer?)
- TODO(open-question: does CAW-05 emit `related_to` keyed to CAW-03 claim ids, or to CAW-02 concept/claim ids CAW-03 must re-map through the ledger?)
- TODO(open-question: who is authoritative for `patent-sensitive` flagging — human only, or may the harness auto-propose from claim type + patent prior-art hits?)
- TODO(open-question: confidentiality — patent prior-art queries may reveal an internal idea to a third-party API; restrict `patent_prior_art` to `boundary=public` claim text only, and how is the query redacted? cross-links ADR-0007.)
- TODO(open-question: how stale may an imported radar bundle be before a verdict must be re-run prior to "submission-ready"? a freshness SLA?)
- TODO(open-question: min trust per venue — is T1 enough for a P1 paper claim or do top venues require T2? cross-links ADR-0003.)
- **Revisit trigger:** if wiring a live prior-art search would force a change to novelty governance / patent-first
  logic (not just a new adapter file), the port contract is leaking.
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).
