# ADR-0003: Evidence gate & claim ledger — the minimum gate, P1/P2/P3 typing, generated-text-not-evidence

- **Status:** proposed
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md) (source of truth; §3 governance delta, §4 imports)
  - [../02-research/evidence-gate-and-claim-ledger.md](../02-research/evidence-gate-and-claim-ledger.md) (gate policy, ledger model, negative tests)
  - [ADR-0002-writing-engine-integration.md](ADR-0002-writing-engine-integration.md) (gate runs before input assembly)
  - [ADR-0005-ports-and-adapters.md](ADR-0005-ports-and-adapters.md) (gate reads only the SourceAdapter shape)
  - [../02-research/confidentiality-and-artifact-lifecycle.md](../02-research/confidentiality-and-artifact-lifecycle.md) (gate is one of three conjunction gates)
  - [../02-research/novelty-priorart-and-venue.md](../02-research/novelty-priorart-and-venue.md) (P3 → patent-first routing)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
Decide CAW-03's **evidence gate**: the minimum evidence a claim must carry before it may enter a paper or patent
draft; the **claim ledger** CAW-03 builds by *importing* CAW-02 cited claim+evidence bundles (referencing, not
re-owning the knowledge repo); the **claim typing** (P1/P2 method/tool vs P3 future-device) that makes the gate
type-specific; and the non-negotiable rule that **generated text is never evidence**. It specifies how the gate
**structurally blocks the WritingEngine** (PaperOrchestra by default) so an ungated claim cannot be drafted. It does
NOT redefine CAW-02's internal claim/evidence invariant (consumed as-is across the import boundary), the patent
module internals (only the patent-overlay gate rows), the novelty checker, or the engine adapter — those are
separate ADRs.

## Context
- The brief (§3) makes the gate, ledger, and claim typing the **governance delta** CAW-03 adds over PaperOrchestra.
  Two hard rules: a claim with insufficient/no evidence **cannot be drafted**, and **generated text is never
  evidence** (§3, §10).
- The ledger is **imported from CAW-02** (§3, §4): CAW-03 references claims/evidence/results by id/URI and does not
  re-own the knowledge graph. CAW-02 emits a signed `*.caw03-bundle.json` with `claims[]` (trust + boundary),
  `evidence[]`, a `bibliography`, and a `provenance_digest`.
- The brief fixes three claim types (§3): **P1** method, **P2** tool, **P3** future-device. They differ in *what
  evidence can exist* — P1/P2 are retrospective (built/run/measured); P3 is prospective (a projection of an unbuilt
  device, analogous to a patent **prophetic example** under USPTO 35 U.S.C. 112).
- The numbers CAW-03 lands in `experimental_log.md` are PO's Step-5 hallucination ground truth (ADR-0002 §Context) —
  so accurate, result-ref-traced numbers are where governance meets the engine.
- The gate must stay **adapter-agnostic** (brief §5): it reads only the SourceAdapter's evidence shape, so a future
  wiki/experiment-server source plugs in without touching gate logic.

## Options considered

### A. Where the gate sits
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Precondition on input assembly (between SourceAdapter import and the engine)** | Ungated claims never reach the engine; "cannot be drafted" is structurally true | Assembly must fail-loud on a blocked-but-requested claim | **Chosen** |
| Post-hoc check on the produced draft | Simple to bolt on | The engine already saw/used the claim; temptation to ship anyway; leak risk | Rejected |
| Trust the engine/author to self-police | No code | Violates brief §3; fluent generated text invites evidence-laundering | Rejected |

### B. What counts as evidence
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Only a typed, resolvable ref to a concrete artifact** (CAW-02 `Evidence` with `artifact_ref`, or a CAW-01 result-registry ref) | Replayable; enforces brief §3/§10; no string-as-evidence | Requires resolvable refs | **Chosen** |
| Allow a prose summary / LLM note to back a claim | Easy to satisfy | Directly breaks "generated text is never evidence"; the whole point of the harness | Rejected |

### C. Ledger ownership
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Projection over CAW-02's signed bundle**: verify digest+signature, reference by id/URI, store only typing + gate status + draft routing | No knowledge-graph duplication; replayable to an exact export; independence preserved | Must re-verify on import; depends on CAW-02 export contract | **Chosen** |
| Copy CAW-02 claims/evidence into CAW-03 | Self-contained reads | Re-owns the knowledge repo (brief non-goal §9); drift; shared-substrate smell | Rejected |

### D. Gate threshold shape
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Type-specific minimums as a config-selected gate *profile*** (e.g. `neurips-paper`, `us-utility-patent`) | New venue/jurisdiction = new profile, not a core change | Profiles must be authored/maintained | **Chosen** |
| One fixed global threshold | Simple | Can't express P1 vs P3 vs paper-vs-patent differences; brittle | Rejected |

## Decision
**A type-specific, profile-configurable evidence gate sitting as a precondition on input assembly, over an imported
CAW-02 claim ledger that CAW-03 references but never re-owns; generated text is never evidence — the one invariant
no profile can relax.**

1. **Claim ledger (imported, not re-owned).** On import, verify the bundle's `provenance_digest` + signature
   (refuse on failure — nothing enters the ledger), then build CAW-03-local `ledger_entry` records that **reference**
   `claim_ref`/`evidence_refs`/`result_registry_refs` as URIs into CAW-02/CAW-01. The entry owns only:
   `claim_type` (P1/P2/P3), carried `trust` (T0–T3) and `boundary`, `gate_status`
   (`blocked | draftable | draftable_with_label`), a `gate_report_ref`, and `draft_targets`. The bundle digest is
   **pinned**, so any rendered artifact replays to an exact CAW-02 export. Notes arrive `evidence=false` and can
   never appear in `evidence_refs`.
2. **Claim typing.** Each entry declares `claim_type` (default inferred, human-confirmable): **P1** (method —
   evidence = measured/simulated results + reproducible `code`/`strategy-id`), **P2** (tool — evidence =
   implementation artifact + ≥1 execution trace/run), **P3** (future-device — evidence = **only** a model-projection
   with explicit assumptions + CI, **never** a measurement). Type drives the gate threshold and downstream routing
   (P3 → novelty/patent-first review per [novelty doc](../02-research/novelty-priorart-and-venue.md)).
3. **The one non-negotiable rule.** **Generated text is never evidence.** PO prose, an autorater verdict, an LLM
   summary, or a CAW-02 `Note` (`evidence=false`) can prompt or be cited by a claim but can never *back* one.
   Evidence is always a typed, resolvable ref to a concrete artifact. No gate profile may relax this.
4. **Minimum gate per type (draftable iff the row clears).** "Concrete Evidence" = a CAW-02 `Evidence` with a
   resolving `artifact_ref` *or* a CAW-01 result-registry ref:
   - **P1 method:** ≥1 concrete Evidence at **trust ≥ T1** + reproducible code/strategy-id; each number resolves to
     a CAW-01 result ref with `unit` (+CI); comparatives need a same-kind baseline ref.
   - **P2 tool:** as P1, plus an implementation artifact + ≥1 execution trace/run (missing artifact →
     `ERR_TOOL_UNBACKED`).
   - **P3 future-device:** ≥1 **model-projection** Evidence with explicit **assumptions + CI**; numbers rendered as
     *projection* (labeled, carry unit+CI); a measurement masquerading as a device property →
     `ERR_PROJECTION_AS_MEASUREMENT`; missing assumptions/CI → `ERR_PROJECTION_UNQUALIFIED`.
   Hard blockers across types: 0 evidence → `ERR_NO_EVIDENCE`; only generated/Note → `ERR_GENERATED_AS_EVIDENCE`.
5. **Paper vs patent overlay (same claim, stricter on the patent path).** Paper: trust ≥ T1
   (reproducibility-checklist items where the venue expects them); P3 numbers explicitly labeled projections.
   Patent: P3 prophetic claims **allowed** but flagged for **written-description + enablement** review and
   **patent-first** gating (file before publish); prophetic vs working examples clearly distinguished (USPTO 112);
   the novelty/claim-boundary check (CAW-05 import) must run before draft.
6. **`draftable_with_label`** is the P3 outcome: the claim may be drafted **only** with the projection/prophetic
   label machine-attached, so the engine cannot render it as a measured fact.
7. **How the gate blocks drafting.** The gate sits **between the SourceAdapter import and the WritingEngine port**.
   The engine-input assembler (ADR-0002 §3) filters to `draftable`/`draftable_with_label` claims and **fails loud**
   with the gate report if a requested claim is blocked — PaperOrchestra is invoked only over an already-gated set
   and never sees an ungated claim. Per-claim state machine: `imported → typed → gated{...} → in_draft → in_review →
   published|filed`; a `blocked` claim cannot advance. The gate is **re-checked at the review checklist** before
   "submission-ready" so a claim that lost evidence (superseded bundle) is caught before publish/file.
8. **Generalization (brief §5).** The gate is a **policy object behind the SourceAdapter shape + a config-selected
   gate profile** — it never knows which adapter produced the claim, and new venues/jurisdictions are new profiles,
   not core changes. The "generated text is never evidence" rule is the unconditional invariant.

**Acceptance (negative + positive tests, from research §6):** N1 `ERR_NO_EVIDENCE`; N2 `ERR_GENERATED_AS_EVIDENCE`;
N3 `ERR_PROJECTION_AS_MEASUREMENT`; N4 `ERR_PROJECTION_UNQUALIFIED`; N5 numeric P1 with no result ref → blocked,
names the missing ref; N6 bad digest/signature → import refused; P1 fully-backed → `draftable`; P2 qualified P3 →
`draftable_with_label`.

## Consequences
- **Easy:** "an ungated claim cannot be drafted" is structurally true, not a hope; every drafted number/figure
  replays to a CAW-01 result and an exact CAW-02 export; new venues/jurisdictions are profile edits.
- **Easy:** the gate is one of three conjunction gates (evidence ∧ confidentiality ∧ novelty) feeding the `gated`
  lifecycle state (confidentiality doc §3.2); a fail yields a typed reason (`EVIDENCE`).
- **Hard / cost:** CAW-03 depends on CAW-02's signed export contract and must re-verify on import; P3 projection
  labeling must propagate all the way into the rendered LaTeX; detecting a *superseded* upstream bundle and
  re-gating in-flight drafts is unsolved (see open questions).
- **Follow-on runbooks:** (1) bundle import + ledger (verify digest+signature, reference by URI, pin digest);
  (2) gate engine (type-specific, config-selected profile; N1–N6 + P1/P2 acceptance; the no-generated-evidence rule
  unconditional); (3) engine-input assembler (filter to draftable, fail loud, attach P3 label, build figure/table
  manifest 1:1 from result refs); (4) review checklist (re-run gate; verify rendered artifact's pinned digest).

## Open questions / revisit triggers
- TODO(open-question: is claim-type inference automatic with human-confirm, or human-assigned only?) See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).
- TODO(open-question: exact min trust per venue — is T1 enough for a P1 paper claim, or do top venues require T2?
  owned with the paper-ladder/novelty doc.)
- TODO(open-question: how does CAW-03 detect a *superseded* CAW-02 bundle and re-gate in-flight drafts — poll,
  webhook, or re-import-on-build? cross-boundary with CAW-02.)
- TODO(open-question: who owns the patent 112 enablement/written-description check — a CAW-03 rule, a human, or the
  PatentEngine adapter? owned with the patent ADR.)
- TODO(open-question: persist *blocked* claims as first-class ledger entries (visible backlog) or drop them? lean:
  persist, mirroring CAW-02's `needs_evidence`.)
- **Revisit trigger:** if any proposed gate profile would relax "generated text is never evidence", reject the
  profile — the invariant is fixed.

Sources (grounding): [USPTO — Prophetic and Working Examples (35 U.S.C. 112)](https://www.federalregister.gov/documents/2021/07/01/2021-14034/properly-presenting-prophetic-and-working-examples-in-a-patent-application), [MPEP 2164 Enablement](https://www.uspto.gov/web/offices/pac/mpep/s2164.html), [NeurIPS Paper Checklist](https://neurips.cc/public/guides/PaperChecklist).
