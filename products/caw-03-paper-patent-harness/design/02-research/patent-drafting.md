# Patent Drafting

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md), [./paper-orchestra-engine.md](./paperorchestra-integration.md), [../03-architecture/ports-and-adapters.md](../05-harness-core/ports-and-adapters.md), [../05-harness-core/evidence-gate.md](../05-harness-core/evidence-gate-and-claim-ledger.md), [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This doc decides how CAW-03 treats **patent drafting** as a path distinct from paper drafting: claim structure
(independent/dependent), specification, prior-art search, patentability assessment, and **patent-first handling**
(file before publish). It defines a **v1 baseline `PatentEngineAdapter`** (LLM-assisted draft + mandatory human
gate) behind a swappable `PatentEngine` port, and the seams for future external patent tooling.

It does **NOT**: provide legal advice, define jurisdiction-specific filing procedure, or build a filing connector.
All legal-process specifics are marked `TODO(open-question)` and deferred to qualified counsel. PaperOrchestra
(the paper `WritingEngine`) is **papers-only** and is never used to draft patents — patents get their own engine.

## 1. Why patents are a separate path (not a paper variant)
The brief (§3, §6) fixes paper and patent as **shared front, distinct back**: they share claim/evidence selection
and novelty checking, but diverge at drafting and gating. The differences are not cosmetic — they invert several
defaults that PaperOrchestra bakes in.

### Paper vs. patent differences

| Dimension | Paper (PaperOrchestra) | Patent (PatentEngine) |
| --- | --- | --- |
| **Primary goal** | Communicate & persuade peers; maximize clarity/impact | Define a legally enforceable boundary; maximize defensible scope |
| **Core artifact** | Narrative sections + figures + verified citations | **Claim set** (the legal heart) + specification + drawings |
| **Audience** | Reviewers, researchers | Patent examiner, courts, competitors (design-around) |
| **Novelty stance** | Cite & build on prior work (≥90% pool usage) | **Distinguish from** prior art; one missing element clears 35 USC 102 novelty |
| **Disclosure timing** | Publish ASAP (priority = recognition) | **File BEFORE any public disclosure** (publish = statutory bar / loss of rights) |
| **"More detail" pressure** | Trim to page limits | Enablement: disclose enough to *make and use*; broad claims + many fallback embodiments |
| **Language** | Readable prose, hedging OK | Precise claim language, single-sentence claims, antecedent basis, no ambiguity |
| **Citations** | Semantic Scholar-verified BibTeX | Prior-art references (patents + NPL) cited to distinguish, not to credit |
| **Refinement loop** | Simulated peer review (content-refinement-agent) | Patentability/clarity critique + **attorney review** (non-optional) |
| **Generated text as evidence** | Never evidence (brief §3, §10) | Same rule — generated claims are a *draft*, never a filing |
| **Failure mode** | Weak reviews, rejection (re-submit) | **Irrecoverable**: premature disclosure can permanently bar patenting |

The last row is why CAW-03 needs a hard gate, not a soft preference: a paper mistake is recoverable; a patent
disclosure mistake can destroy the right. This is the load-bearing reason patents sit on a separate lifecycle
with a **publish-block** until cleared.

## 2. Patent anatomy (what the PatentEngine must produce)
A patent draft is a structured legal document, not free prose. The v1 adapter targets these parts:

- **Title** — short, descriptive.
- **Field & Background** — technical field; problem the prior art leaves unsolved (frame, do not admit too much).
- **Summary** — plain-language statement of the invention, aligned to the independent claims.
- **Detailed Description / Specification** — the enabling disclosure: how to make and use the invention, with
  multiple **embodiments** and fallback variations so dependent claims and design-arounds are supported. Must
  provide **antecedent basis** for every claim term.
- **Drawings** — figures with reference numerals; mapped from CAW-01 result registry / figure manifest where the
  invention is a method/tool with diagrammable structure.
- **Claims** — the enforceable core (see §3).
- **Abstract** — ≤150 words technical summary.

### Claim structure (independent / dependent)
- **Independent claims** stand alone and define the invention in the **broadest defensible** terms. A good one
  (a) reads on the real embodiment (enforceable), (b) reads on likely design-arounds, and (c) does **not** read on
  any single prior-art reference (avoids anticipation). Usually drafted as method, apparatus/system, and CRM
  (computer-readable-medium) variants for software/AI inventions.
- **Dependent claims** reference an earlier claim and add narrowing limitations — a **ladder** from broadest to
  narrowest. They are fallback positions: if a broad claim is invalidated, narrower ones may survive. Each
  limitation must be supported by the specification.
- **Claim-element ↔ evidence/specification mapping**: every claim element must trace to (a) specification support
  for enablement and (b) — in CAW-03's governance — an **evidence-gated claim** in the claim ledger (brief §3).
  An element with no evidence backing cannot enter a draft claim.

`TODO(open-question: claim count, jurisdiction-specific formalities (USPTO vs EPO vs KIPO), means-plus-function
§112(f) usage, and multiple-dependent-claim fees are legal-process specifics — defer to counsel.)`

## 3. Patentability assessment (the pre-draft screen)
Before drafting, the harness runs a **patentability screen** over a candidate claim/evidence bundle. This reuses
the shared novelty front (brief §3) plus patent-specific tests:

| Test | Question | CAW-03 input source |
| --- | --- | --- |
| **Novelty (102)** | Does any *single* prior-art reference disclose all elements? | Novelty/RadarAdapter (related-work + CAW-05 threat signals) |
| **Non-obviousness (103)** | Obvious combination of references to a skilled person? | Novelty/RadarAdapter + human judgment |
| **Eligibility (101)** | Is it patentable subject matter (esp. software/AI abstract-idea risk)? | `TODO(open-question: 101 analysis is legal)` |
| **Enablement / written description** | Does evidence support making & using it? | Evidence gate + result registry refs |
| **Utility** | Does it do something useful? | Claim ledger (P1/P2 method/tool claims) |

Claim typing from the brief maps directly: **P1/P2 method/tool** claims are the patentable substrate; **P3
future-device** claims are projections and are generally NOT independently patentable until reduced to practice or
constructively enabled — flag P3 as `requires-enablement-review`. The screen outputs a
`patentability: {recommend | weak | no-go}` verdict with rationale; a `no-go` blocks drafting just as a failed
evidence gate does.

## 4. Patent-first handling (file before publish)
This is the governance feature unique to the patent path and the reason for a cross-engine interlock.

**Rule:** if a claim is flagged `patent-first` by the Novelty/claim-boundary checker (brief §3), the harness MUST
**block any paper draft/publish that discloses that claim** until a patent filing (or an explicit waiver) is
recorded. Any public disclosure — preprint, talk, demo, on-sale — can start or blow the novelty clock.

Grounded facts (US, AIA) that shape the design — but are **not** authoritative; counsel decides:
- US offers a **1-year grace period** from an inventor's own disclosure to file. Most ex-US jurisdictions require
  **absolute novelty** (no grace) — so the safe harness default is **file before any disclosure**, not "file
  within a year." `TODO(open-question: which jurisdictions matter for SAIT/Samsung filings — drives grace policy.)`
- A **provisional application** secures a priority date cheaply and can be filed fast; the later non-provisional
  must be fully supported by it. The harness treats "provisional filed" as a valid state to release a publish hold.
  `TODO(open-question: is provisional-first the chosen strategy? legal decision.)`

**Interlock mechanism (cross-port):**
- The Sink/PublishAdapter (paper publish) queries each claim's `disclosure_status` before release.
- States: `clear` (publishable) | `patent-first-hold` (blocked) | `filed:provisional` | `filed:nonprovisional` |
  `waived:<approver>` (Jimmy/counsel explicitly accepts disclosure).
- Only `clear`, `filed:*`, or `waived:*` permit publish. The hold is **default-deny**.

## 5. Patent draft lifecycle
Mirrors the artifact lifecycle (brief §6) but with a patent-specific spine and the publish interlock:

```
candidate claim(s)            [from claim ledger, typed P1/P2/(P3 flagged)]
  -> evidence gate            [brief §3: insufficient evidence => cannot draft]
  -> patentability screen     [§3: novelty/obviousness/eligibility/enablement => {recommend|weak|no-go}]
       no-go --------------------------------------------------> STOP (record rationale)
  -> patent-first decision    [novelty/boundary checker sets disclosure_status]
  -> PatentEngine.draft()     [§6 port: LLM-assisted draft: spec + claims + abstract + drawing refs]
  -> review checklist         [patent-specific: claim clarity, antecedent basis, enablement, scope]
  -> HUMAN GATE (counsel)     [MANDATORY, non-bypassable; brief §9 non-goal: no autonomous filing]
  -> export patent draft doc  [Sink/PublishAdapter: document artifact, NOT a filing]
  -> (out of scope) filing    [external; on filing, set disclosure_status=filed:* -> releases publish hold]
```

State machine per patent artifact: `candidate -> screened -> drafted -> in-review -> attorney-review ->
ready-for-filing -> (filed | rejected | abandoned)`. Provenance preserved end to end (brief §6). The harness owns
states up to `ready-for-filing`; **filing itself is out of v1 scope** (brief §9) and is a future Sink adapter.

## 6. The `PatentEngine` port surface
A typed interface with a capability/config descriptor; adapters are **registered and selected by config**, never
hard-coded (brief §5). The harness core depends only on this port. The v1 `PatentEngineAdapter` is an
LLM-assisted drafter; future adapters (e.g., Rowan Patent, PatentPal, LLM+RAG over a patent corpus, or a law-firm
tool) implement the same contract.

```python
# Port: PatentEngine  (parallel to WritingEngine; patents only)
class PatentDraftRequest:
    claims: list[LedgerClaimRef]      # evidence-gated, typed P1/P2/(P3 flagged); core source of truth
    evidence_bundle: EvidenceRef      # from SourceAdapter (CAW-02 import); enablement support
    figures: list[FigureRef]          # from result registry / figure manifest (CAW-01 import)
    prior_art: list[PriorArtRef]      # from Novelty/RadarAdapter; references to distinguish
    patentability: PatentabilityVerdict
    template: PatentTemplateRef       # spec/claims skeleton; jurisdiction-tagged (default = generic)
    config: PatentEngineConfig        # selected adapter + options

class PatentDraft:
    spec: SpecificationDoc            # field/background/summary/detailed-description
    claims: ClaimSet                  # independent[] + dependent[] (ladder), element->support map
    abstract: str
    drawing_refs: list[FigureRef]
    open_items: list[str]             # gaps the human/attorney must resolve
    provenance: ProvenanceTrace       # claim->evidence->draft lineage

class PatentEngine(Port):
    def capabilities(self) -> CapabilityDescriptor: ...   # jurisdictions, claim types, max claims, needs_human
    def screen(self, req: PatentDraftRequest) -> PatentabilityVerdict: ...  # optional; harness may own this
    def draft(self, req: PatentDraftRequest) -> PatentDraft: ...           # LLM-assisted; NEVER auto-files
    def review_checklist(self, draft: PatentDraft) -> list[CheckResult]: ...# clarity/antecedent/enablement/scope
```

### v1 `PatentEngineAdapter` (the baseline that IS implemented)
- **What it does:** assembles the request from gated claims + evidence + prior art, then a structured multi-call
  LLM drafts (1) independent claims, (2) a dependent-claim ladder, (3) the specification with antecedent basis for
  every claim term, (4) abstract, (5) drawing references mapped to the figure manifest. Emits `open_items` for
  every unsupported or ambiguous element.
- **What it does NOT do:** legal advice, eligibility/101 determination, or filing. `capabilities().needs_human =
  True` is fixed — the human/attorney gate is structurally mandatory (brief §9, §10).
- **Why "LLM-assisted draft + human gate" for v1:** lowest-cost slice that proves the workflow seams (port,
  lifecycle, publish interlock) without depending on any external patent service. A real prior-art search service
  or attorney tool later drops in as another adapter without core changes.

### Tradeoff: build vs. wrap external patent tooling (v1)

| Option | Pros | Cons | Fit |
| --- | --- | --- | --- |
| **v1 LLM-assisted adapter (chosen)** | No external dependency; proves seams; cheap; full provenance | Draft quality below pro tools; needs heavy human review | **Best for v1 slice** |
| Wrap external patent SaaS now | Higher draft quality, real prior-art DB | Vendor lock, cost, legal/confidentiality review, slows v1 | Future adapter (port only) |
| No patent path in v1 | Simplest | Violates brief §3/§6; patent-first interlock unbuilt | Rejected |

## 7. Generalization / customizability (the seams)
- **PatentEngine is swappable** exactly like WritingEngine: same registration-by-config pattern; future tools are
  one adapter each (brief §5).
- **Prior-art is a port, not a vendor:** the `prior_art` input arrives via Novelty/RadarAdapter — v1 uses
  related-work + CAW-05 import; a live prior-art/patent-search service is a future adapter behind the same contract.
- **Jurisdiction as config, not code:** templates and the grace/absolute-novelty policy are config descriptors so
  KIPO/USPTO/EPO behavior is a profile swap, not a redesign. Defaults are conservative (file-before-disclose).
- **Filing is a future Sink adapter:** v1 stops at a draft document; `filed:*` state transitions are designed for
  but not wired (brief §9 non-goal).

## Open Questions
See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).
- `TODO(open-question)` Which jurisdictions govern SAIT/Samsung filings? Drives grace-period vs absolute-novelty
  default and template profiles.
- `TODO(open-question)` Is **provisional-first** the chosen priority strategy? It changes when a publish hold can be
  released.
- `TODO(open-question)` Who is the authoritative human gate — internal IP team, external counsel, or both — and
  what is the SLA/handoff format for `ready-for-filing` drafts?
- `TODO(open-question)` 101/eligibility analysis for AI/software claims is legal; can the harness even *flag* risk,
  or must it stay silent and defer entirely?
- `TODO(open-question)` Confidentiality: patent drafts contain pre-filing secrets — does the confidentiality filter
  (brief §3) need a stricter "pre-filing / attorney-eyes-only" tier beyond public-safe vs internal-review?
- `TODO(open-question)` Does CAW-03 own the patentability `screen()`, or delegate it to the PatentEngine adapter?

## Implications for runbooks
- **RB (patent path):** implement `PatentEngine` port + v1 `PatentEngineAdapter` (LLM-assisted draft) with
  `needs_human=True` non-bypassable; register via config alongside WritingEngine.
- **RB (lifecycle/state machine):** add the patent artifact state machine (§5) distinct from the paper one; both
  share the front (evidence gate, novelty).
- **RB (publish interlock):** Sink/PublishAdapter MUST check `disclosure_status` and **default-deny** on
  `patent-first-hold`; only `clear | filed:* | waived:*` release. This is a cross-port guard — build it as harness
  core logic, not inside an adapter.
- **RB (review checklist):** patent-specific checklist (claim clarity, antecedent basis, enablement, scope,
  independent/dependent ladder integrity) separate from the paper review checklist.
- Leave the **filing Sink adapter** and **external patent tooling adapter** as documented stubs (interface +
  not-implemented marker + config example) per brief §5.

## Sources (grounding, non-authoritative — not legal advice)
- [PatentPC — How to Write a Strong Patent Claim](https://patentpc.com/blog/how-to-write-a-strong-patent-claim-best-practices)
- [PatentPC — Types of Patent Claims](https://patentpc.com/blog/understanding-the-different-types-of-patent-claims-2)
- [USPTO — Provisional Application for Patent](https://www.uspto.gov/patents/basics/apply/provisional-application)
- [patentlawyer.io — 35 USC 102 Novelty and Prior Art](https://patentlawyer.io/35-usc-102-novelty-and-prior-art/)
- [Mewburn — Grace Periods for Disclosure Before Applying](https://www.mewburn.com/law-practice-library/grace-periods-for-disclosure-of-an-invention-before-applying-for-a-patent)
