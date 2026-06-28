# ADR-0004: Patent drafting as a separate path behind a PatentEngine port with a mandatory human gate

- Status: proposed
- Owner: Jimmy
- Last-reviewed: TODO(open-question: set on review)
- Related:
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md) (§3, §6, §9, §10)
  - [../02-research/patent-drafting.md](../02-research/patent-drafting.md) (research this ADR ratifies)
  - [./ADR-0002-writing-engine-integration.md](./ADR-0002-writing-engine-integration.md) (WritingEngine port — papers only)
  - [./ADR-0003-evidence-gate-and-claim-ledger.md](./ADR-0003-evidence-gate-and-claim-ledger.md) (the shared front: gate + claim typing)
  - [./ADR-0005-ports-and-adapters.md](./ADR-0005-ports-and-adapters.md) (registry, capability descriptors, stubs)
  - [./ADR-0006-paper-ladder-and-novelty.md](./ADR-0006-paper-ladder-and-novelty.md) (patent-first flagging, novelty verdicts)
  - [./ADR-0007-confidentiality-and-boundary.md](./ADR-0007-confidentiality-and-boundary.md) (publish interlock, counsel audience)
  - [./ADR-0008-artifact-lifecycle-and-storage.md](./ADR-0008-artifact-lifecycle-and-storage.md) (patent artifact state machine)
- Source of truth: ../_meta/PRODUCT-BRIEF.md

## Context

The brief (§3, §6) fixes paper and patent as **shared front, distinct back**: they share claim/evidence selection
and novelty checking, but diverge at drafting and gating. PaperOrchestra (the default `WritingEngine`, ADR-0002)
is **papers-only**; it does not produce a claim set, specification, or prior-art-distinguishing argument, and it
cannot model the one failure mode that makes patents special.

The forces:

- **Patents invert several PaperOrchestra defaults.** A paper communicates and cites prior work to build on it
  (≥90% pool usage); a patent defines a legally enforceable boundary and *distinguishes from* prior art (one
  missing element clears 35 USC 102 novelty). A paper trims to a page limit; a patent must *enable* (disclose
  enough to make and use, with fallback embodiments). A paper hedges in prose; a patent needs precise
  single-sentence claims with antecedent basis.
- **The failure mode is irrecoverable.** A weak paper can be re-submitted. A premature public disclosure can
  permanently bar patenting (statutory bar in first-to-file regimes). This asymmetry forces a *hard* gate, not a
  soft preference, and a cross-engine interlock that blocks paper publish for claims marked patent-first.
- **No autonomous filing (brief §9).** Generated claims are a *draft*, never a filing. A human/attorney decision
  is structurally required.
- **No external dependency for v1 (brief §10 — vertical slice).** The cheapest slice that proves the seams
  (port, lifecycle, publish interlock) is an in-house LLM-assisted drafter, not a wrapped patent SaaS.
- **Generated text is never evidence (brief §3, §10; ADR-0003 §1).** This invariant carries into the patent path:
  every claim element must trace to an evidence-gated ledger claim.

## Options considered

### A. Patent engine selection

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **v1 in-house LLM-assisted `PatentEngineAdapter` (chosen)** | No external dependency; proves the port/lifecycle/interlock seams; cheap; full provenance | Draft quality below pro tools; heavy human review required | **v1 slice** |
| Wrap external patent SaaS now (Rowan/PatentPal/Lens) | Higher draft quality, real prior-art DB | Vendor lock, cost, confidentiality review of a pre-filing secret leaving the building, slows v1 | Future adapter (port-only stub) |
| Reuse PaperOrchestra for patents | One engine | Violates brief §6; PO cannot draft claims/spec or distinguish prior art; would couple the irrecoverable gate to a paper engine | Rejected |
| No patent path in v1 | Simplest | Violates brief §3/§6; the patent-first interlock (the load-bearing safety feature) goes unbuilt | Rejected |

### B. Where the human gate lives

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Mandatory human gate in the harness core, before any Sink (chosen)** | Cannot be bypassed by swapping an adapter; one enforcement point | Core carries a patent-specific state | **Chosen** (matches ADR-0005: human gate stays in core) |
| Gate inside the PatentEngine adapter | Adapter-local | An adapter could self-disable it; violates ADR-0005 `requires_human_gate` rule | Rejected |
| Gate at the filing connector | Simple | Filing is out of v1 scope; nothing would enforce it in v1 | Rejected |

## Decision

**1. Patents get their own path and their own engine port.** A `PatentEngine` port (parallel to ADR-0002's
`WritingEngine`, registered in the same ADR-0005 registry, selected by config) drafts patents. PaperOrchestra is
never used to draft a patent. The two paths **share the front** — the same `GatedClaimSet` from ADR-0003 (evidence
gate + P1/P2/P3 typing) and the same novelty front from ADR-0006 — and **diverge at drafting and gating**.

**2. The v1 adapter is an in-house LLM-assisted drafter.** `BaselinePatentDrafterAdapter` assembles a request from
gated, typed claims + evidence (CAW-02 import) + figures (CAW-01 import) + prior art (Novelty/Radar port), then a
structured multi-call LLM drafts: (1) independent claims (broadest defensible), (2) a dependent-claim ladder, (3)
the specification with **antecedent basis for every claim term**, (4) the abstract, (5) drawing references mapped to
the figure manifest. It emits an `open_items[]` list for every unsupported or ambiguous element. Its capability
descriptor fixes `needs_human = True`.

**3. Patent-first handling is a cross-port interlock, enforced in the core.** A claim flagged `patent-first` by the
novelty/claim-boundary checker (ADR-0006) carries a `disclosure_status`. The Sink/Publish path (paper publish)
queries it and is **default-deny**: only `clear`, `filed:provisional`, `filed:nonprovisional`, or `waived:<approver>`
permit a public paper disclosure that cites the claim; `patent-first-hold` and `defer` block it. The hold and the
interlock live in harness core logic (ADR-0007 §2.3), not in any adapter. Conservative default: **file before any
disclosure** (most ex-US regimes have no grace period), not "file within a year".

**4. The patent draft lifecycle ends at `ready-for-filing`; filing is out of scope.** State machine per patent
artifact: `candidate → screened → drafted → in-review → attorney-review → ready-for-filing → (filed | rejected |
abandoned)`, integrated with the unified artifact lifecycle in ADR-0008. The harness owns states up to
`ready-for-filing`; the actual filing is a **future `PatentFilingSinkAdapter` stub** (brief §9). On a recorded
filing, `disclosure_status` transitions to `filed:*`, releasing the paper publish hold.

**5. A patentability screen runs before drafting.** Reuses the shared novelty front (102 novelty, 103 obviousness
via Novelty/Radar) plus patent-specific tests (enablement/written-description via the evidence gate + result refs;
utility via P1/P2 typing). It emits `{recommend | weak | no-go}`; a `no-go` blocks drafting exactly as a failed
evidence gate does. **101/eligibility is legal** and is left as `TODO(open-question)` — the harness may at most flag
risk, never determine eligibility. CAW-03 owns the screen by default; an adapter may override via `screen()`.

**6. The harness gives no legal advice.** Jurisdiction formalities, claim counts, means-plus-function §112(f) usage,
grace-vs-absolute-novelty policy, and "what counts as disclosure" are config/`TODO(open-question)` deferred to
counsel. Jurisdiction is **config (a template + policy profile), not code**; the default profile is conservative
(file-before-disclose, generic template).

### Port surface (ratifies research §6)

```python
# Port: PatentEngine (parallel to WritingEngine; patents only). Registered + config-selected (ADR-0005).
class PatentDraftRequest:
    claims: list[LedgerClaimRef]       # evidence-gated, typed P1/P2/(P3 flagged) — the source of truth (ADR-0003)
    evidence_bundle: EvidenceRef       # CAW-02 import via SourceAdapter; enablement support
    figures: list[FigureRef]           # CAW-01 result registry / figure manifest
    prior_art: list[PriorArtRef]       # Novelty/Radar port; references to DISTINGUISH (not to credit)
    patentability: PatentabilityVerdict
    template: PatentTemplateRef        # jurisdiction-tagged; default generic
    config: PatentEngineConfig

class PatentDraft:
    spec: SpecificationDoc             # field/background/summary/detailed-description (enabling)
    claims: ClaimSet                   # independent[] + dependent[] ladder; element -> support map
    abstract: str
    drawing_refs: list[FigureRef]
    open_items: list[str]              # gaps the human/attorney MUST resolve
    provenance: ProvenanceTrace        # claim -> evidence -> draft lineage (replayable)

class PatentEngine(Port):
    def capabilities(self) -> CapabilityDescriptor: ...   # jurisdictions, claim types, max claims, needs_human=True
    def screen(self, req: PatentDraftRequest) -> PatentabilityVerdict: ...  # optional; harness owns by default
    def draft(self, req: PatentDraftRequest) -> PatentDraft: ...            # LLM-assisted; NEVER auto-files
    def review_checklist(self, draft: PatentDraft) -> list[CheckResult]: ...# clarity/antecedent/enablement/scope
```

**Swap rule:** any engine returning a `PatentDraft` with `needs_human=True` satisfies the port; external patent
tooling drops in as one adapter behind the same contract (ADR-0005). `prior_art` always arrives via the
Novelty/Radar port — the patent engine never owns a prior-art vendor.

## Consequences

**Easier:**
- The irrecoverable failure mode (premature disclosure) is structurally prevented by a default-deny core interlock,
  not by author memory.
- A real patent service later is one adapter + one config line; the lifecycle, interlock, and provenance are unchanged.
- Paper and patent reuse the same gated, typed, novelty-checked front, so claim/evidence selection is written once.
- Provenance is end-to-end: every claim element traces to an evidence-gated ledger claim and a CAW-02/CAW-01 ref.

**Harder / costs:**
- v1 patent draft quality is low and demands heavy human/attorney review (accepted: it proves the seams cheaply).
- The core carries a patent-specific state (`disclosure_status`) and a cross-port interlock — more core logic, but
  it is the one place the safety rule cannot be bypassed.
- The harness must carefully *not* give legal advice; several screen tests (esp. 101) stay advisory or silent.

**Follow-on work (runbooks):**
- RB (patent path): `PatentEngine` port + `BaselinePatentDrafterAdapter` with `needs_human=True` non-bypassable.
- RB (publish interlock): core-level default-deny `disclosure_status` check on the Sink path (cross-port guard).
- RB (patent review checklist): claim clarity, antecedent basis, enablement, scope, ladder integrity — distinct
  from the paper review checklist.
- RB (stubs): `PatentFilingSinkAdapter` + `ExternalPatentToolingAdapter` as documented stubs (ADR-0005 §6).

## Open questions / revisit triggers

- TODO(open-question: which jurisdictions govern SAIT/Samsung filings? drives grace-vs-absolute-novelty default and template profiles.)
- TODO(open-question: is provisional-first the chosen priority strategy? it changes when a publish hold may be released.)
- TODO(open-question: who is the authoritative human gate — internal IP team, external counsel, or both — and the SLA/handoff format for `ready-for-filing` drafts?)
- TODO(open-question: 101/eligibility for AI/software claims is legal; may the harness even flag risk, or must it stay silent and defer entirely?)
- TODO(open-question: does CAW-03 own `screen()`, or delegate to the PatentEngine adapter? default: harness owns.)
- TODO(open-question: does the confidentiality filter need a stricter "pre-filing / attorney-eyes-only" tier beyond public-safe vs internal-review? cross-links ADR-0007.)
- **Revisit trigger:** if wiring a real patent tool or filing connector would force a change to the core interlock
  or the lifecycle, the port contract is leaking and this ADR must be revisited.
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

> Grounding is non-authoritative and not legal advice; sources are listed in
> [../02-research/patent-drafting.md](../02-research/patent-drafting.md).
