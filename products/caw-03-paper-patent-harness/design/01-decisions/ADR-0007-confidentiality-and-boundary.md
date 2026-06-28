# ADR-0007: Confidentiality gate — public-safe vs internal-review, reusing CAW-02 boundary/redaction

- Status: proposed
- Owner: Jimmy
- Last-reviewed: TODO(open-question: set on review)
- Related:
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md) (§3, §4, §5, §10)
  - [../02-research/confidentiality-and-artifact-lifecycle.md](../02-research/confidentiality-and-artifact-lifecycle.md) (research this ADR ratifies — §1, §2, §5)
  - [./ADR-0002-writing-engine-integration.md](./ADR-0002-writing-engine-integration.md) (confidentiality-before-assemble on engine inputs)
  - [./ADR-0003-evidence-gate-and-claim-ledger.md](./ADR-0003-evidence-gate-and-claim-ledger.md) (boundary carried per ledger entry; gate reads it)
  - [./ADR-0004-patent-drafting.md](./ADR-0004-patent-drafting.md) (counsel audience; patent-first publish block)
  - [./ADR-0005-ports-and-adapters.md](./ADR-0005-ports-and-adapters.md) (gate in core, sinks supply audience tier)
  - [./ADR-0006-paper-ladder-and-novelty.md](./ADR-0006-paper-ladder-and-novelty.md) (patent-first verdict that triggers the publish bar)
  - [./ADR-0008-artifact-lifecycle-and-storage.md](./ADR-0008-artifact-lifecycle-and-storage.md) (the lifecycle this gate is evaluated within)
- Source of truth: ../_meta/PRODUCT-BRIEF.md

## Context

The brief (§3, §10) requires a **confidentiality filter** that distinguishes *public-source-assisted* artifacts
(may leave the building) from *internal-review-required* artifacts (cannot), and forbids confidential company data in
public-facing outputs, conflating public research with internal Samsung/SAIT claims, or treating generated summaries
as evidence. CAW-03 imports cited claim+evidence bundles from CAW-02 (a separate product) as signed, versioned
envelopes; each entity already carries an **effective** boundary/visibility label computed by CAW-02.

The forces:

- **Reuse, don't rebuild (brief §3, §10).** CAW-02 is authoritative for classification. CAW-03 must inherit its
  boundary lattice, visibility axis, and redaction ruleset semantics verbatim — not invent a parallel scheme.
- **No shared runtime substrate (brief §1).** CAW-03 cannot call into CAW-02's classifier at runtime; it consumes
  labels carried in the import envelope and re-asserts them at its own egress boundary.
- **The writing engine can synthesize a leak.** PaperOrchestra can produce a codename or internal phrasing the source
  bundle did not literally contain, so an allow-list over source labels is necessary but **not sufficient** — a
  redaction re-sweep over emitted text is required (defense in depth).
- **Patents add an ordering constraint.** Public disclosure can forfeit patentability; the gate must block public
  paper sinks for patent-first claims until filing (cross-links ADR-0004/0006).
- **Open seams (brief §5).** Future sources (wiki, experiment-server) and sinks (wiki, venue, filing) must plug in
  without changing the gate; the gate depends only on the envelope label contract and the sink's audience tier.

## Options considered

### A. Classification ownership

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Inherit CAW-02 labels verbatim; CAW-03 only routes + re-asserts (chosen)** | Single source of truth; no drift; matches independence | Depends on envelope carrying effective labels | **Chosen** |
| Re-classify in CAW-03 | Self-contained | Two classifiers drift; violates "reuse, don't rebuild"; risks laundering | Rejected |

### B. Redaction ruleset home (no shared runtime substrate allowed)

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Vendored, version-pinned copy of the CAW-02 ruleset (chosen, default)** | No shared runtime; deterministic; offline | Must track upstream ruleset updates | **Chosen** (confirm vs envelope-pinned `ruleset_version`) |
| Shared library | DRY | Shared runtime substrate — forbidden (§1) | Rejected |
| `ruleset_version` pinned in the import envelope | Always matches the bundle | Couples egress sweep to import cadence | Open question (acceptable alternative) |

### C. Where the gate runs

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Policy function at two points: ingest classification + egress decision (chosen)** | Routes early, enforces late; egress is the load-bearing gate | Two evaluation points to keep consistent | **Chosen** |
| One-off flag at ingest | Simple | A synthesized leak at draft time escapes; track can go stale | Rejected |
| Gate inside each Sink adapter | Adapter-local | An adapter could opt out; violates ADR-0005 (gate stays in core) | Rejected |

## Decision

**1. Inherit CAW-02 boundary/visibility semantics verbatim.** Two axes, unchanged:

| Axis | Values | Meaning | Who decides |
|---|---|---|---|
| `boundary` | `public ⊂ internal ⊂ confidential` (ordered lattice) | "can it leave the building" | CAW-02 (effective = lattice-max over provenance ancestors) |
| `visibility` | `{team, private}` (unordered) | "whose space" | CAW-02 (effective = `team` iff self and all ancestors `team`) |

Three inherited invariants CAW-03 re-asserts at its own export boundary: **(1) monotone propagation (no laundering)**
— an artifact's effective boundary is the lattice-max over its selected claims; generated text never downgrades its
sources; **(2) generated text is not evidence** (`evidence=false` carried through; a draft paragraph can never be
cited back as evidence); **(3) fail-closed default-deny** — indeterminate/unknown is treated as
`confidential`/`private`, never `public`.

**2. The confidentiality gate is a policy function evaluated at two points** in the lifecycle (ADR-0008), never a
one-off flag:
- **Ingest classification** (at `gated`): compute the artifact's effective boundary/visibility as the lattice-max
  over every selected claim+evidence label; this assigns the artifact's **confidentiality track**.
- **Egress decision** (at the Sink boundary): re-run `decide(artifact, target_audience)` plus a redaction re-sweep.
  Egress is the load-bearing gate; ingest only routes. This also applies **confidentiality-before-assemble** on the
  engine inputs (ADR-0002 §5): internal-review-required spans are blocked from public-target assemblies before the
  engine ever sees them.

**3. Two tracks.**

| Track | Trigger (effective labels of selected claims) | Permits | Blocks |
|---|---|---|---|
| **public-source-assisted** | every selected claim+evidence is effective `boundary=public` AND `visibility=team` | draft may target a public sink (arXiv/venue) once the review checklist passes — **no human confidentiality review required** | nothing extra; standard review still applies |
| **internal-review-required** | any selected claim/evidence is effective `boundary ≥ internal` OR `visibility=private` | produce/review internally; target an internal sink up to its boundary; patent track may proceed (counsel is a privileged internal audience) | a **public sink is hard-blocked** until a human `reclassify`/clearance lowers the floor, or patent-first files before disclosure |

**4. The egress decision is total, side-effect-free, default-deny** (reuses CAW-02 `decide()`):
- `target_audience=public` ⇒ ALLOW only if effective `boundary == public` AND effective `visibility == team`.
- effective `visibility == private` (jimmy-private) ⇒ never ALLOW for any audience.
- `target_audience=internal` ⇒ ALLOW up to effective `boundary == internal`.
- `target_audience=counsel` (patent) ⇒ ALLOW up to `confidential` (privileged); still subject to the redaction
  re-sweep. (Whether `counsel` is a distinct tier above `internal` is owned by ADR-0004 — TODO open-question.)
- any unrecognized state ⇒ EXCLUDE / block.

Then a **redaction re-sweep**: `scan()` over every string the engine emitted (title, abstract, body, captions, table
cells, bibliography locators). **Any hit aborts publication** with the offending span list — defense in depth even
after the allow-list, because the engine can synthesize a codename the bundle did not literally contain.

**5. Patent-specific overlay (public disclosure bar).** A claim flagged `patent_first` by the novelty checker
(ADR-0006), not yet filed ⇒ **block every public paper sink** for any artifact citing it, regardless of boundary.
Once filing is recorded (`disclosure_status=filed:*` per ADR-0004) ⇒ the public paper sink is unblocked for that
claim. CAW-03 models the **gate ordering**, not the legal definition of "disclosure" (that is counsel's — open
question).

**6. Reuse the CAW-02 redaction ruleset as a vendored, version-pinned copy.** The brief forbids a shared runtime
substrate (§1), so the default is a vendored, version-pinned ruleset (codename/fab/customer/PII patterns,
`scan()`/`redact()`), used as the egress re-sweep. Pinning `ruleset_version` in the import envelope instead is an
acceptable alternative (open question), but a shared library is rejected.

**7. The gate is generalized behind the ports (brief §5).** It depends only on **effective labels carried in the
import envelope** (not CAW-02 internals) and on the **audience tier supplied by the chosen Sink adapter**. A future
`SourceAdapter` (wiki, experiment-server) plugs in by emitting the same label-bearing signed envelope; a future
`SinkAdapter` (wiki, venue, filing) registers an audience tier. The gate code is unchanged in both cases, and the
human gate stays in the core (ADR-0005) — no adapter can opt itself out.

## Consequences

**Easier:**
- One classification source of truth (CAW-02); no parallel classifier to drift or maintain.
- Public outputs are provably built only from public-safe inputs, with a defense-in-depth re-sweep catching
  engine-synthesized leaks the allow-list cannot.
- Patent rights are protected by the same gate (ordering overlay), reusing the patent-first verdict from ADR-0006.
- New sources/sinks plug in without touching gate logic — the seam is the envelope label contract + audience tier.

**Harder / costs:**
- CAW-03 must track upstream ruleset updates (vendored copy) or accept envelope-pinned versions; a stale ruleset is a
  latent leak risk (mitigated by version pinning + the open question).
- Egress is fail-closed: a single redaction hit aborts publication, so authors must clean spans before release
  (accepted: a false block is recoverable, a leak is not).
- Re-gating on upstream change (ADR-0008) means a stale `public` track can never persist, at the cost of re-running
  the gate when the claim set changes.

**Follow-on work (runbooks):**
- RB (confidentiality gate): ingest classification (lattice-max → track) + egress `decide()` + redaction re-sweep;
  fail-closed; abort-on-hit; one lifecycle event per egress decision. Reuse CAW-02 semantics; do not re-derive labels.
- RB (bundle-import adapter): verify envelope signature + `provenance_digest`; expose effective labels to the gate;
  snapshot `ruleset_version`; never re-author content.
- RB (engine-input assembler): apply confidentiality-before-assemble (ADR-0002 §5) — internal-review-required spans
  absent from public-target inputs.
- RB (sinks): each registers an audience tier; the core (not the adapter) runs `decide()` + the re-sweep before
  `publish()`.

## Open questions / revisit triggers

- TODO(open-question: ruleset home — vendored+version-pinned copy vs `ruleset_version` pinned in the import envelope? no shared runtime substrate is allowed.)
- TODO(open-question: is `counsel` a distinct audience tier above `internal`, and what is its exact redaction profile? owned by ADR-0004.)
- TODO(open-question: legal definition of "public disclosure" for patent-first gating — preprints, talks, grace periods? counsel decision; CAW-03 models only gate ordering.)
- TODO(open-question: reclassification authority across the boundary — can CAW-03 record a human clearance locally, or must the downgrade originate as a CAW-02 `reclassify` event re-imported in a fresh bundle? default: re-import, keeping CAW-02 authoritative.)
- TODO(open-question: do intermediate engine artifacts — citation_pool.json / outline.json — need the same egress sweep as inputs before storage? cross-links ADR-0002.)
- **Revisit trigger:** if a new sink or source forces a change to `decide()` or the lattice (not just a new audience
  tier / a new envelope-emitting adapter), the gate contract is leaking.
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).
