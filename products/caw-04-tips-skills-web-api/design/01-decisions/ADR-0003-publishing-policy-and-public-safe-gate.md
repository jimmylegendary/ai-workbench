# ADR-0003: Publishing policy & public-safe gate (LOAD-BEARING)

- **Status:** proposed
- **Owner:** Jimmy
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md
- **Related:**
  - [ADR-0001-product-surface-and-delivery.md](./ADR-0001-product-surface-and-delivery.md)
  - [ADR-0002-content-model.md](./ADR-0002-content-model.md)
  - ADR-0004 (import, ports & adapters — group B), ADR-0005 (storage & versioning — group B), ADR-0006 (web & API stack — group B)
  - [../02-research/publishing-policy-and-public-safe.md](../02-research/publishing-policy-and-public-safe.md), [../02-research/import-and-ports.md](../02-research/import-and-ports.md)

## Context

This is **the load-bearing decision for CAW-04** (brief §9). CAW-04 is *the* public surface of the family, so the
single most dangerous failure is leaking unverified or company-confidential know-how to the world (brief §11). This
ADR fixes **what may be published**, the **publish gate** that blocks everything else, the **public-safe re-check**
run on every import (never trusting an upstream boundary flag), the **redaction** stance, and the **audit** that
traces every published artifact to its validated internal source + safety review. It REUSES CAW-02's boundary
semantics (a separate product) as *copied semantics*, not a shared library or store (brief §1 independence). It does
NOT decide the content model (ADR-0002), storage/versioning (ADR-0005), import port mechanics (ADR-0004), or the
stack (ADR-0006) — it sits on top of all of them.

## Non-negotiable principles

1. **Public outputs from public-safe sources only.** The only `boundary` a published artifact may carry is
   **`public`**. `internal` and `confidential` are publishable-never (brief §11).
2. **Default-deny, fail-closed.** Anything indeterminate, unverified, or unparseable is **excluded**. An empty
   result after gating is a no-op, not a degraded publish.
3. **Never trust the upstream boundary.** An import's declared `public_safe` is a *hint*; CAW-04 re-derives and
   re-checks locally (defense in depth; brief §7).
4. **Two independent axes** (reused from CAW-02): `boundary {public ⊂ internal ⊂ confidential}` (sensitivity) and
   `visibility {team, private}` (scope). A published item must be `public` **and** derive from no `private`
   ancestor. The axes never collapse into one field.
5. **No authoring, no laundering** (brief §10). Redaction may *remove*, never *invent*. If redaction would gut the
   artifact's meaning, it is rejected, not published as a hollow stub. There is **no downgrade/`reclassify` path
   inside CAW-04** — confidential→public happens only upstream and re-enters as a new import.
6. **Every publish is human-approved** (brief §11). The gate can only ever auto-**reject**; it can never
   auto-**approve**. Automatic gating produces a *proposal*; Jimmy approves each publish.

## Options considered

| Decision | Options | Choice | Why |
|---|---|---|---|
| Publishable boundary set | `{public}` only vs `{public, internal-on-authed}` | **`{public}` only** | brief §10: no above-public publishing; authed internal docs out of scope for v1 |
| Trust upstream `public_safe` | trust vs **re-derive locally** | **re-derive** | brief §7 "never trust upstream blindly"; upstream policy drift can't slip through |
| Action on redaction hit | auto-strip vs **reject + escalate** | **reject + escalate** | a public leak is irreversible once served/cached; a hit signals an upstream mis-classification to fix at source, not to silently paper over |
| Downgrade inside CAW-04 | allow `reclassify` vs **none** | **none** | the public surface must never be where confidential becomes public |
| Approval | auto vs **manual per publish** | **manual** | brief §11: gate auto-rejects only; Jimmy approves every publish |
| Boundary engine ownership | shared lib with CAW-02 vs **own copy of semantics** | **own copy** | brief §1 independence — no shared runtime substrate |
| Redaction engine | Presidio vs regex/denylist | **TODO (open question)** | recall vs dependency/ops weight; human approval mandatory either way |

## Decision

### The publish gate

A **total, side-effect-free decision function** `publish_decision(item) → PUBLISH_OK | REJECT{reasons[]}` runs
before anything reaches the public store. It is a chain of **fail-closed** checks; the first hard failure rejects,
soft findings are collected for the curator, and the **default branch is REJECT**.

| # | Check | Must hold to pass | On failure |
|---|---|---|---|
| G1 | Validated source | resolvable provenance ref to a **validated** CAW-02/CAW-03 source | REJECT: no validated source |
| G2 | Effective boundary | **`boundary_eff(item) == public`**, computed over provenance ancestors (lattice-max), not the declared flag | REJECT: above-public |
| G3 | Visibility | no ancestor is `visibility=private` (`visibility_eff == team`) | REJECT: private-derived |
| G4 | Redaction-clean | public-safe re-check returns **zero** hits on the *rendered public view* | REJECT: leak markers found |
| G5 | Evidence-grade | not a bare generated-summary; `isPublishable(record)` from ADR-0002 holds (reuse/audit metadata present) | REJECT: not reusable/auditable |
| G6 | Contract version | import envelope `contract_version` MAJOR is supported | REJECT: unknown contract |
| G7 | Integrity | `payload_sha256` matches canonicalized payload; signature (if present) verifies | REJECT: integrity/tamper |
| G8 | Curator approval | an explicit human approve event exists for this version | HOLD (stays in preview/admin) |

- **G2 is the spine.** `boundary_eff` is the lattice-max over the item and all provenance ancestors — a Tip citing
  one `confidential` Claim is itself `confidential` and is rejected; synthesis never launders sensitivity downward.
  CAW-04 **recomputes** this; it never reads a cached upstream flag.
- **G1–G7 gate eligibility; G8 gates promotion to live.** A G1–G7 pass with no G8 stays on the internal
  preview/admin surface (ADR-0001) — never on the public web/API.

### The public-safe re-check on import (defense in depth)

Every artifact crosses the import trust boundary through one shared in-product library (`pub.safe`). There is **no
raw import path** that bypasses it — agents and humans use the same checks (brief §8; the re-check lives in the
core, never in a `ContentSourceAdapter`; see ADR-0004). Each stage is fail-closed:

1. **Parse + semver-gate the envelope** (`contract_version`, `source_product`, `declared_boundary`,
   `payload_sha256`, `redaction_applied`, `payload`). Unknown MAJOR → reject; digest mismatch → reject.
2. **Re-derive `boundary_eff`/`visibility_eff` locally** from the provenance graph in the bundle. An
   **unresolvable ancestor resolves to `confidential`/`private`** (fail-closed unknown).
3. **Re-run the redaction ruleset** over the *rendered public view* (the markdown/JSON a reader would actually see),
   regardless of `redaction_applied`. Any hit on a candidate-public item ⇒ **reject + escalate** (do not auto-strip).
4. **Free-text leak scan** for internal markers (project codenames, fab/customer regexes, internal hostnames/URLs,
   employee identifiers) not caught by structured fields.
5. **Conflation guard** — a published artifact may not fuse a public source with a confidential one (brief §11:
   never conflate public research with internal Samsung/SAIT claims). Mixed provenance ⇒ split or reject.
6. **Emit a candidate, never a published item** — it lands in preview/admin with the full findings report for G8.

### Redaction stance

Redaction is **detection + rejection, not transformation**. CAW-04 owns its own `ruleset_version` (doctrinally
aligned with CAW-02 but **not** a shared dependency — independence). The scope is the *rendered public view*, not
just raw fields. Engine candidate is Microsoft Presidio (analyzer + custom recognizers) plus a CAW-04
codename/fab/customer pattern list — but the engine never substitutes for the mandatory human approval, and the
auto-strip-vs-reject question is settled as **reject**.

### Audit

The publish ledger is an **append-only, hash-chained `_events` log** (one line per gate decision and per
publish/unpublish/redact), reusing CAW-02 RB-013's chain construction
(`seq`, `prev_hash`, `hash = H(prev_hash ‖ canonical(line))`) with git history as a redundant second witness
(md/MDX-first store, brief §6). Each publish event records at minimum `event`, `artifact_id`, `version`,
`source_ref{product,id,producer_run_id}`, `boundary_eff`, the per-check `gate_result`, `redaction{ruleset_version,
hits}`, `approved_by`, `envelope_digest`, and `hash`.

Guarantees: **traceability** (`source_ref`+`producer_run_id` trace any public artifact back upstream without a live
handle), **tamper-evidence** (`verify_audit()` walks the chain → `broken_at`), **reconstructable decisions** ("why
publishable + who approved" is replayable), and **unpublish/redact are events, not deletes** (published *versions*
are immutable but can be withdrawn from serving — reconciled via 410 tombstones, see ADR-0005).

## Consequences

- **Easy:** the public surface is leak-resistant by construction — no `internal`/`confidential`/`private` item can
  reach web or API, even if upstream mis-labels it, because CAW-04 re-derives boundary and re-scans the rendered view.
- **Easy:** every live artifact is auditable end-to-end; "why was this publishable and who approved it" is replayable.
- **Easy:** ADR-0001's build-time `boundary == public` assertion is the last-line enforcement of G2/G4 at the sink.
- **Hard:** more validation cost on every import; pattern lists / `ruleset_version` must be maintained and kept
  doctrinally aligned with CAW-02 without becoming a shared dependency.
- **Hard:** if upstream ships only a leaf item without its provenance ancestor graph, every item fails closed and
  nothing publishes — the richer bundle may be required from CAW-02/CAW-03 (open question).
- **Hard:** nothing publishes without explicit human approval — throughput is curator-bound by design.
- **Follow-on:** a runbook builds the `pub.safe` library with a **negative-heavy, mutation-tested** suite (weakening
  the default branch to `PUBLISH_OK` must break the suite); ADR-0004's import re-check stage and ADR-0006's sink
  consume this gate; the unpublish/redact path ties to ADR-0005.

## Open questions / revisit triggers

- TODO(open-question: redaction engine — Presidio (NLP recall, REST-deployable) vs a lighter regex+denylist core,
  given human approval is mandatory regardless?)
- TODO(open-question: where CAW-04's codename/fab/customer pattern list lives and how it stays aligned with CAW-02
  without becoming a shared substrate.)
- TODO(open-question: does the import bundle ship the full provenance ancestor graph for local `boundary_eff`
  recomputation, or only the leaf + declared boundary? If only the leaf, unresolved ancestry fails closed.)
- TODO(open-question: signature/attestation scheme on imported bundles — DSSE / in-toto / minisign?)
- TODO(open-question: re-validation cadence — when upstream reclassifies a source to confidential, how does CAW-04
  learn it must unpublish? poll / revocation feed / curator-driven?)
- TODO(open-question: cache/CDN purge guarantee on unpublish — bound on time-to-purge after a `redact`/`unpublish`.)
- TODO(open-question: distinct provenance kinds for already-public external sources vs internal-origin public-safe
  content — both `boundary=public` but different risk.)
- **Revisit trigger:** any proposal to publish above the public boundary, or to let the gate auto-approve, re-opens
  this ADR (both are standing non-goals, brief §10/§11).
