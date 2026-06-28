# Evidence Gate & Claim Ledger

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md)
  - [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS.md)
  - CAW-02 (a separate product) export contract — `RB-051-export-caw03` and `claim-evidence-and-evidence-gate.md`
  - sibling: `./paper-orchestra-integration.md` (WritingEngine port) — TODO(link once written)
  - sibling: `./patent-drafting-module.md` (patent path + patent-first) — TODO(link once written)
  - sibling: `./ports-and-adapters.md` (SourceAdapter / registry) — TODO(link once written)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This doc decides **CAW-03's evidence gate**: the minimum evidence a claim must carry before it may enter a
paper or patent draft, the **claim typing** (P1/P2 method/tool vs P3 future-device), how **provenance carries
through** to the rendered artifact, and the **claim-ledger model** that CAW-03 builds by *importing* CAW-02 cited
claim+evidence bundles (CAW-03 references; it does not re-own the knowledge repo). It specifies how the gate
**blocks the WritingEngine** (PaperOrchestra by default) so that an ungated claim cannot be drafted. It does NOT
redefine CAW-02's internal claim/evidence invariant (CAW-03 consumes the exported bundle as-is), does NOT design
the patent module internals (only the patent-specific gate rows), and does NOT design the PaperOrchestra adapter.

## 1. The one non-negotiable rule
**Generated text is never evidence.** PaperOrchestra prose, an autorater verdict, an LLM "summary", a CAW-02
`Note` (`evidence=false`), or any synthesized paragraph can *prompt* or *be cited by* a claim but can never
*back* one. This is CAW-02's invariant carried across the import boundary: the gate's sole job at CAW-03 is to
re-enforce it on the *drafting* side, where the temptation to let fluent generated text stand in for evidence is
highest. Evidence is always a typed, resolvable reference to a concrete artifact (a CAW-02 `Evidence` node that
`extracted_from` a `source | trace | simulation_run | experiment`, or a CAW-01 result-registry ref) — not a string.

## 2. Claim typing (P1/P2/P3)
The brief fixes three claim types. They differ in **what kind of evidence can exist for them**, which is what makes
the gate type-specific. P1/P2 are *retrospective* (the thing was built/run and measured); P3 is *prospective* (a
projection about an unbuilt device — analogous to a patent **prophetic example**, which is allowed but must be
clearly marked as predicted, not actual, per USPTO 35 U.S.C. 112 guidance).

| Type | Meaning | Evidence that *can* exist | Maps to |
|---|---|---|---|
| **P1** | **Method** claim — an algorithm / technique works (e.g. a tiling/partitioning strategy reduces traffic) | measured/simulated results with reproducible code or `strategy-id`; CAW-01 run evidence | paper "working example"; method patent claim |
| **P2** | **Tool** claim — a built tool/system exists and does X (e.g. syntorch captures sub-torch traces → Chakra) | implementation artifact + execution trace/run; CAW-01 result | paper systems contribution; apparatus patent claim |
| **P3** | **Future-device** claim — a property of an *unbuilt* memory device | **only** model-projection evidence (CAW-01 projection with assumptions + CI); never a measurement | paper "projection"; **prophetic** patent claim |

The type is **declared per claim in the ledger** and drives both the gate threshold (§4) and downstream handling
(P3 routes to novelty/patent-first review; numeric P3 statements must be rendered as projections, never measurements).

## 3. The claim ledger — imported, not re-owned
CAW-03's ledger is a **projection over CAW-02's exported bundle**, plus CAW-03-local drafting state. CAW-02 emits a
signed, self-contained `*.caw03-bundle.json` (`boundary_kind=caw03-bundle`) carrying `claims[]` (with trust +
boundary), `evidence[]` (`{kind, locator, citation, artifact_ref|null, value}`), a deduped `bibliography`, and a
`provenance_digest`. CAW-03 **verifies the digest + signature, then references entries by id/URI**; it stores no
copy of the knowledge graph. (This is a one-way file/API boundary — CAW-02 emits, CAW-03 pulls; no shared store.)

```yaml
# CAW-03 claim-ledger entry (CAW-03-owned state; refs CAW-02, never duplicates it)
ledger_entry:
  ledger_id: caw03-clm-0001              # CAW-03-local id
  source_bundle:                         # provenance of the import itself
    bundle_uri: caw02://exports/2026-..caw03-bundle.json
    provenance_digest: sha256:...        # re-verified on import; pinned
    signature_ok: true
  claim_ref: caw02://claim/CLM-2031      # REFERENCE into CAW-02 (not a copy)
  claim_type: P1 | P2 | P3               # CAW-03 typing decision (default inferred, human-confirmable)
  evidence_refs:                         # references into the bundle's evidence[]
    - { ref: caw02://evidence/EV-77, kind: simulation_run|trace|experiment|source|model-projection,
        artifact_ref: caw01://result/RS-12 | null, value: {n, unit, ci}|null, citation: bib:smith2025 }
  result_registry_refs: [ caw01://result/RS-12 ]   # CAW-01 import (figures/tables), referenced not owned
  trust: T0|T1|T2|T3                     # carried from CAW-02; gate reads it
  boundary: public|internal|confidential # effective boundary from CAW-02; gate + confidentiality filter read it
  gate_status: blocked | draftable | draftable_with_label
  gate_report_ref: ./gate/clm-0001.json  # why blocked / what's missing
  draft_targets: [ paper:P1-ladder, patent:none ]   # where this claim is allowed to flow
```

Key properties: (1) `claim_ref`/`evidence_refs`/`result_registry_refs` are **URIs into other products** — CAW-03
owns only typing, gate status, and draft routing. (2) The bundle's `provenance_digest` is **pinned** in the entry,
so the rendered paper/patent is replayable to an exact CAW-02 export. (3) Notes arrive `evidence=false` and can
never appear in `evidence_refs`.

## 4. Gate policy — minimum evidence per claim type
A claim is **draftable** only if it clears the row below. "Concrete Evidence" = a CAW-02 `Evidence` with a
resolving `artifact_ref` *or* a CAW-01 result-registry ref. Generated text never counts (§1). Trust tiers (T0–T3)
are carried from CAW-02; the gate **reads** them, it does not recompute them.

| Claim type | Minimum to be **draftable** | Numeric statements | Comparative ("better than") | Hard blockers |
|---|---|---|---|---|
| **P1 method** | ≥1 concrete Evidence at **trust ≥ T1**; reproducible `code`/`strategy-id` present | each number resolves to a CAW-01 result-registry ref with `unit` (+ CI where applicable) | requires a baseline result ref of the same kind | 0 evidence → `ERR_NO_EVIDENCE`; only generated/Note → `ERR_GENERATED_AS_EVIDENCE` |
| **P2 tool** | ≥1 concrete Evidence at **trust ≥ T1**; implementation artifact + ≥1 execution trace/run | as P1 | as P1 | as P1; missing artifact → `ERR_TOOL_UNBACKED` |
| **P3 future-device** | ≥1 **model-projection** Evidence (CAW-01) with explicit **assumptions + CI**; **never** a measurement | numbers rendered as *projection* (carry `unit`+CI, label "projected") | baseline must also be a projection of the same model class | a measurement masquerading as a device property → `ERR_PROJECTION_AS_MEASUREMENT`; missing assumptions/CI → `ERR_PROJECTION_UNQUALIFIED` |

**Paper vs patent overlay** (same claim, stricter gate on the patent path):

| Path | Extra requirement beyond the row above |
|---|---|
| **Paper** | trust ≥ T1 (reproducibility-checklist style: code/hyperparams/seeds/baseline present where the venue expects them); P3 numbers explicitly labeled as projections |
| **Patent** | P3 prophetic claims **allowed** but flagged for **written-description + enablement** review and **patent-first** gating (file before publish); prophetic/working examples must be clearly distinguished (USPTO 112 guidance); novelty/claim-boundary check (CAW-05 import) must run before draft |

`draftable_with_label` is the P3 outcome: the claim may be drafted **only** with the projection/prophetic label
machine-attached, so the engine cannot render it as a measured fact.

## 5. Provenance carry-through (gate → draft → rendered artifact)
The gate does not just admit a claim; it **propagates the evidence chain into the rendered output** so the paper or
patent is replayable to its CAW-02/CAW-01 origins.

```
CAW-02 bundle (signed, digest)
  └─ ledger_entry (pins digest; types claim; gate=draftable)
       └─ engine input assembly  → experimental_log.md rows + figure/table manifest carry the result-registry ref
            └─ PaperOrchestra draft (LaTeX): every numeric cell/figure caption keeps a back-ref id
                 └─ rendered PDF/patent: claim ↔ evidence ↔ bibliography all resolve; digest recorded in artifact metadata
```

Rules: (1) Every figure/table the engine renders maps 1:1 to a `result_registry_ref` in the manifest — no figure
without a backing run. (2) The bundle's `bibliography` becomes the BibTeX; citations must resolve (no dangling).
(3) The final artifact records the pinned `provenance_digest`, so review can verify the draft was built from the
exact gated evidence set, not a drifted one.

## 6. How the gate blocks drafting
The gate sits **between the SourceAdapter import and the WritingEngine port** — it is a precondition on input
assembly, not a post-hoc check. PaperOrchestra (the default engine) is invoked only over an **already-gated claim
set**; it never sees an ungated claim.

```
SourceAdapter(import) → ClaimLedger(type + gate) ──[only draftable / draftable_with_label]──▶ EngineInputAssembler → WritingEngine(PaperOrchestra)
                              │
                              └─[blocked]──▶ gate_report (missing-evidence list) ; NOT passed to engine
```

State machine per claim: `imported → typed → gated{blocked|draftable|draftable_with_label} → in_draft → in_review →
published|filed`. A `blocked` claim **cannot advance**; the engine-input assembler filters to draftable claims and
**fails loud** if a requested claim is blocked (returns the gate report, drafts nothing — mirrors CAW-02's
fail-closed export). The gate is also re-checked at the **review checklist** before "submission-ready", so a claim
that lost evidence (superseded bundle) is caught before publish/file.

**Negative tests (runbook acceptance):**

| # | Attempt | Expected |
|---|---|---|
| N1 | Draft a claim with 0 evidence | `ERR_NO_EVIDENCE`; engine not invoked for it |
| N2 | Pass an LLM summary / Note as the backing | `ERR_GENERATED_AS_EVIDENCE`; refused |
| N3 | P3 device claim backed by a *measurement* | `ERR_PROJECTION_AS_MEASUREMENT`; refused |
| N4 | P3 claim with projection but no assumptions/CI | `ERR_PROJECTION_UNQUALIFIED`; refused |
| N5 | Numeric P1 claim with no result-registry ref | blocked; named missing ref |
| N6 | Import a bundle whose `provenance_digest`/signature fails | import refused; nothing enters the ledger |
| P1 | Fully-backed P1 claim (T1, result ref, baseline) | `draftable`; flows to engine with provenance carried |
| P2 | P3 projection claim, qualified | `draftable_with_label`; rendered as projection only |

## 7. Generalization (the seam, per brief §5)
The gate is a **policy object behind a port**, not hard-coded thresholds. Two seams must stay open:
- **SourceAdapter-agnostic.** The ledger is fed via the `SourceAdapter` contract; CAW-02 bundles are the v1 source,
  but a future internal-wiki or experiment-server adapter must produce the *same* `evidence_refs` shape (typed,
  resolvable, `evidence=false` for synthesis). The gate logic does not know which adapter produced the claim.
- **Config-driven gate profile.** Thresholds (min trust, required result ref, venue reproducibility items,
  patent 112 checks) live in a named **gate profile** selected by config (e.g. `profile: neurips-paper`,
  `profile: us-utility-patent`). New venues/jurisdictions = a new profile, not a core change. The "generated text
  is never evidence" rule is the one invariant **no profile can relax**.

## Open Questions
- TODO(open-question: is claim-type (P1/P2/P3) inference automatic with human confirm, or human-assigned only? owned with the claim-ledger ADR.)
- TODO(open-question: exact min trust per venue — is T1 enough for a P1 paper claim, or do top venues require T2? owned with paper-ladder & novelty doc.)
- TODO(open-question: how does CAW-03 detect a *superseded* CAW-02 bundle and re-gate in-flight drafts — poll, webhook, or re-import-on-build? cross-boundary with CAW-02.)
- TODO(open-question: who owns the patent 112 enablement/written-description check — a CAW-03 rule, a human reviewer, or the PatentEngine adapter? owned with the patent-drafting doc.)
- TODO(open-question: do we persist *blocked* claims as first-class ledger entries (visible backlog) or drop them? lean: persist, mirroring CAW-02's `needs_evidence` state.)
- See `../08-research-plan/open-questions.md` (to be created).

## Implications for runbooks
- **RB (bundle import + ledger):** verify `provenance_digest` + signature on import (N6); build ledger entries that
  *reference* CAW-02/CAW-01 by URI; pin the digest. No copy of the knowledge graph.
- **RB (gate engine):** implement the §4 type-specific gate as a **config-selected profile**; ship N1–N6 + P1/P2 as
  acceptance; the "generated text is never evidence" rule is unconditional across all profiles.
- **RB (engine-input assembler):** filter to `draftable`/`draftable_with_label` claims only; fail loud with the gate
  report if a requested claim is blocked; attach the projection label for P3 so the engine cannot render it as a
  measurement; build the figure/table manifest 1:1 from `result_registry_refs`.
- **RB (review checklist):** re-run the gate before "submission-ready"; verify the rendered artifact's pinned digest
  matches the bundle it was built from (provenance carry-through, §5).
- **RB (ports):** the gate reads only the `SourceAdapter` evidence shape and a gate-profile config — never a concrete
  adapter — so wiki/experiment-server sources plug in without touching gate logic.

Sources: [USPTO — Properly Presenting Prophetic and Working Examples (35 U.S.C. 112)](https://www.federalregister.gov/documents/2021/07/01/2021-14034/properly-presenting-prophetic-and-working-examples-in-a-patent-application), [MPEP 2164 Enablement](https://www.uspto.gov/web/offices/pac/mpep/s2164.html), [NeurIPS Paper Checklist Guidelines](https://neurips.cc/public/guides/PaperChecklist).
