# Publishing Policy & Public-Safe Gate

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md)
  - [../01-decisions/](../01-decisions/) (ADR: publishing policy & public-safe boundary — TODO; load-bearing per brief §9)
  - [../06-interfaces/](../06-interfaces/) (ContentSourceAdapter / public-safe re-check — TODO)
  - [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This is the **load-bearing** doc for CAW-04 (brief §9). It decides **what may be published** on the public
website + REST API, defines the **publish gate** that blocks unverified or above-public content, specifies the
**public-safe re-check** run on every import (never trusting an upstream `public-safe` flag), the **redaction**
sweep, and the **audit** that traces every published item back to its validated internal source. It REUSES the
boundary semantics already designed in CAW-02 (a separate product) rather than inventing new ones. It does NOT
decide the content model (Tip/Skill/Workflow… — separate ADR), storage/versioning (separate ADR), or the web/API
stacks. It assumes the ports & adapters seams from brief §8.

## Non-negotiable principles (inherited + sharpened for a public surface)
1. **Public outputs from public-safe sources only.** CAW-04 is *the* public surface (brief §11), so the publish
   gate is the most critical control in the family. The only `boundary` value a published artifact may carry is
   **`public`**. `internal` and `confidential` are publishable-never.
2. **Default-deny, fail-closed.** Anything indeterminate, unverified, or unparseable is **excluded**, never
   published. An empty result after gating is a no-op, not a degraded publish.
3. **Never trust the upstream boundary.** Imports from CAW-02 / CAW-03 declare a boundary; CAW-04 **re-derives and
   re-checks** it locally (defense in depth — mirrors CAW-02's "re-redact on import" rule). A producer's
   `public_safe=true` is a *hint*, not authority.
4. **Two independent axes, reused from CAW-02.** `boundary {public ⊂ internal ⊂ confidential}` (sensitivity, "can
   it leave the building") and `visibility {team, private}` (scope). A published item must be `public` **and** must
   not derive from any `private` ancestor. These axes never collapse into one field.
5. **No authoring, no laundering.** CAW-04 publishes validated upstream artifacts (brief §10). It never rewrites
   know-how into something "more shareable" — redaction may *remove*, never *invent*, content. If redaction would
   gut the artifact's meaning, it is rejected, not published as a hollow stub.
6. **Every publish is human-approved.** Automatic gating produces a *proposal*; Jimmy (curator) approves each
   publish (brief §11). The gate can only ever *reject* automatically; it can never *approve* automatically.

## The publish gate — what may be published
The gate is a **total, side-effect-free decision function** `publish_decision(item) → PUBLISH_OK | REJECT{reasons[]}`
run before anything reaches the public store. It is a chain of **fail-closed** checks; the first hard failure
rejects, and all soft findings are collected for the curator. Default branch = REJECT.

| # | Gate check | Rule (must hold to pass) | On failure |
|---|---|---|---|
| G1 | Validated source | item carries a resolvable provenance ref to a **validated** CAW-02/CAW-03 source (status accepted/validated upstream) | REJECT: no validated source |
| G2 | Effective boundary | **`boundary_eff(item) == public`** (computed over provenance ancestors, not the declared flag) | REJECT: above-public |
| G3 | Visibility | no ancestor is `visibility=private` (`visibility_eff == team`) | REJECT: private-derived |
| G4 | Redaction-clean | the public-safe re-check (below) returns **zero** hits on the rendered public view | REJECT: leak markers found |
| G5 | Evidence-grade | item is not a bare `generated-summary`; reused metadata (inputs/outputs/preconditions) present per content model | REJECT: not reusable/auditable |
| G6 | Contract version | import envelope `contract_version` MAJOR is supported | REJECT: unknown contract |
| G7 | Integrity | `payload_sha256` matches canonicalized payload; signature (if present) verifies | REJECT: integrity/tamper |
| G8 | Curator approval | an explicit human approve event exists for this version | HOLD (stays in preview/admin) |

Notes:
- **G2 is the spine.** `boundary_eff` is the lattice-max over the item and all provenance ancestors (CAW-02
  RB-013). A Tip that cites one `confidential` Claim is itself `confidential` and is rejected — synthesis can never
  launder sensitivity downward. CAW-04 recomputes this; it does not read a cached upstream flag.
- **No downgrade path inside CAW-04.** CAW-02 has a human-attributed `reclassify` activity; CAW-04 deliberately
  has **none**. If something needs to become public, that decision happens **upstream** and re-enters as a new
  import. The public surface cannot be the place where confidential becomes public.
- G8 gates *promotion to live*; G1–G7 gate *eligibility*. A G1–G7 pass with no G8 stays in the internal
  preview/admin surface (brief §4) — never on the public web/API.

## The public-safe re-check on import (defense in depth)
Every artifact crosses the import boundary through one shared in-product library (call it `pub.safe`), the CAW-04
analogue of CAW-02's `kr.boundary`. There is **no raw import path** that bypasses it — agents and humans use the
same checks (brief §8 ports & adapters; same pattern as CAW-03).

Import re-check pipeline (each stage fail-closed):

1. **Parse + semver-gate the envelope.** Reuse CAW-02's common envelope shape (`contract_version`,
   `source_product`, `declared_boundary`, `payload_sha256`, `redaction_applied`, `payload`). Unknown MAJOR →
   reject (never guess). Digest mismatch → reject.
2. **Re-derive effective boundary/visibility locally.** Do not trust `declared_boundary` or any upstream
   `public_safe` field. Compute `boundary_eff`/`visibility_eff` from the provenance graph shipped in the bundle;
   an **unresolvable ancestor resolves to `confidential`/`private`** (fail-closed unknown), exactly as CAW-02
   RB-052 step 3.
3. **Re-run the redaction ruleset** over the *rendered public view* (the markdown/JSON a reader would actually
   see), regardless of `redaction_applied`. Producer redaction is a single point of failure; CAW-04 re-redacts.
   `scan(view) → [Hit{rule_id, span, sample}]`. Any hit on a candidate-public item ⇒ reject (do not auto-strip a
   public artifact — a hit means the source mis-classified, escalate to curator).
4. **Free-text leak scan** for internal markers not caught by structured fields: project codenames, fab/customer
   regexes, internal hostnames/URLs, employee identifiers. Mirrors CAW-02 import "free-text leak scan".
5. **Conflation guard.** A published artifact may not fuse a public source with a confidential one as a single
   item (CAW-02 guardrail: never conflate public research with internal Samsung/SAIT claims). Mixed provenance ⇒
   split or reject.
6. **Emit a candidate**, never a published item. The candidate lands in the preview/admin store with the full
   findings report attached for curator review (G8).

### Redaction: what it is and is not here
| Aspect | CAW-04 stance | Rationale |
|---|---|---|
| Purpose | **Detection + rejection**, not transformation | A public-surface leak is unrecoverable once served/cached |
| Auto-strip on public items | **No** — a hit means mis-classified source; escalate | Stripping would publish a silently-altered artifact and mask an upstream bug |
| Ruleset ownership | CAW-04 owns its own `ruleset_version`; **not** imported from CAW-02 (no shared substrate) | Independence; but kept doctrinally aligned |
| Engine | candidate: **Microsoft Presidio** (analyzer + custom recognizers) for PII/regex, plus a CAW-04 codename/fab/customer pattern list | Mature OSS, REST-deployable, customizable; explicitly "no guarantee it finds all" → human approval stays mandatory |
| Scope | the **rendered public view** (post-template markdown/JSON), not just raw fields | A reader sees the rendered output; that is the attack surface |

`TODO(open-question: Presidio vs a lighter regex+denylist core — Presidio adds an NLP dependency and ops weight;
is its recall worth it given human approval is mandatory regardless?)`

## Boundary vocabulary reused from CAW-02 (do not redefine)
| Concept | CAW-02 definition (reused verbatim) | CAW-04 use |
|---|---|---|
| `boundary` lattice | `public ⊂ internal ⊂ confidential`, NOT NULL, default `internal` | only `public` is publishable; default-deny |
| `visibility` | `{team, private}`, NOT NULL, default `private` | any `private` ancestor ⇒ never publishable |
| `boundary_eff` | lattice-max over self + provenance ancestors | the G2 gate value; recomputed locally |
| Monotone propagation | synthesis never downgrades sensitivity | imported derivations keep their floor |
| Re-redaction on crossing | re-check regardless of producer's `redaction_applied` | the import re-check, step 3 |
| Fail-closed allow-list | indeterminate ⇒ EXCLUDE | the gate's default branch |
| Hash-chained `_events` audit | one append-only line per crossing, `verify_audit` | the publish audit (below) |

CAW-04 keeps these as **copies of the semantics**, not a shared library or store (independence contract). The
boundary values arrive inside the import envelope; CAW-04 re-derives rather than trusts them.

## Audit — every published item traces to a validated source + safety review
The publish ledger is an append-only, **hash-chained** `_events` log (one line per gate decision and per publish/
unpublish), reusing CAW-02 RB-013's chain construction (`seq`, `prev_hash`, `hash = H(prev_hash ‖ canonical(line))`)
with git history as the redundant second witness (md/MDX-first store, brief §6).

Each publish event records, at minimum:

```json
{
  "seq": 42,
  "prev_hash": "…",
  "event": "publish | reject | unpublish | redact",
  "artifact_id": "caw04:<id>",
  "version": "1.2.0",
  "source_ref": { "product": "CAW-02|CAW-03", "id": "…", "producer_run_id": "<opaque>" },
  "boundary_eff": "public",
  "gate_result": { "G1": "ok", "G2": "ok", "…": "…" },
  "redaction": { "ruleset_version": "…", "hits": 0 },
  "approved_by": "human:jimmy",
  "envelope_digest": "sha256:…",
  "hash": "…"
}
```

Audit guarantees:
- **Traceability (brief §3 use case 5):** `source_ref` + `producer_run_id` let a human trace any public artifact
  back into the originating product without a live handle (the run id is opaque, as in CAW-02).
- **Tamper-evidence:** `verify_audit()` walks the chain; any mutated historical line yields `broken_at`.
- **Reconstructable decisions:** the recorded `gate_result` + `redaction` make "why was this publishable, and who
  approved it" replayable — the safety review is part of the record, not a side note.
- **Unpublish/redact are events, not deletes:** if a boundary changes upstream, CAW-04 records an `unpublish`/
  `redact` event (brief §3 use case 4); published *versions* are immutable but can be withdrawn from serving.

## Tradeoffs / decisions to carry into the ADR
| Decision | Options | Leaning | Why |
|---|---|---|---|
| Publishable boundary set | `{public}` only vs `{public, internal-on-authed}` | **`{public}` only** | brief §10 non-goal: no above-public publishing; authed internal docs are out of scope for v1 |
| Redaction on hit | reject vs auto-strip | **reject + escalate** | public leak is irreversible; a hit signals an upstream mis-classification to fix at source |
| Trust upstream `public_safe` | trust vs re-derive | **re-derive locally** | defense in depth; brief §7 "never trust upstream boundary blindly" |
| Redaction engine | Presidio vs regex/denylist | **TODO (open question)** | recall vs dependency/ops weight; human approval mandatory either way |
| Downgrade inside CAW-04 | allow `reclassify` vs none | **none** | the public surface must never be where confidential becomes public |
| Approval | manual vs auto | **manual, per publish** | brief §11: Jimmy approves every publish; gate can only auto-reject |

## Open Questions
- TODO(open-question: redaction engine — Microsoft Presidio (NLP recall, REST-deployable) vs a lighter
  regex+denylist core, given human approval is mandatory regardless of engine?)
- TODO(open-question: where does CAW-04's codename/fab/customer pattern list live and how is it kept doctrinally
  aligned with CAW-02's without becoming a shared dependency / shared substrate?)
- TODO(open-question: does the import bundle ship the full provenance ancestor graph so CAW-04 can recompute
  `boundary_eff`, or only the leaf item + declared boundary? If only the leaf, every item with unresolved
  ancestry fails closed and nothing publishes — is the richer bundle required from CAW-02/CAW-03?)
- TODO(open-question: signature/attestation scheme on imported bundles — DSSE / in-toto / minisign — to verify the
  upstream producer, consistent with CAW-02's open export-signature question?)
- TODO(open-question: re-validation cadence — when an upstream source is later reclassified to confidential, how
  does CAW-04 learn it must unpublish? pull/poll, a revocation feed, or curator-driven?)
- TODO(open-question: cache/CDN purge guarantee on unpublish — a public artifact may be cached at the edge; what
  is the bound on time-to-purge after a `redact`/`unpublish` event?)
- TODO(open-question: handling already-public external sources (e.g. cited papers) vs internal-origin public-safe
  content — both are `boundary=public` but carry different risk; do they need distinct provenance kinds?)
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks
- **RB (pub.safe library):** the one shared in-product gate library — envelope parse + semver gate, local
  `boundary_eff`/`visibility_eff` re-derivation (fail-closed unknown ⇒ confidential/private), `scan()` redaction
  over the rendered public view, the total `publish_decision()` with default-REJECT, and the hash-chained audit
  writer. A negative-heavy test suite proves no `internal`/`confidential`/`private` item ever passes the gate and
  that indeterminate ⇒ REJECT (mutation-tested: weakening the default to PUBLISH_OK must break the suite).
- **RB (ContentSourceAdapter — CAW-02 / CAW-03 import):** envelope intake → re-check pipeline → land a *candidate*
  (never a published item) with findings report attached; one append-only audit line per crossing.
- **RB (preview/admin + curator approve):** the only path that flips a G1–G7-passing candidate to published is an
  explicit human approve event (G8); record `approved_by` in the audit.
- **RB (PublishSinkAdapter — website build + REST API):** publishes only artifacts with `boundary_eff=public` and
  a recorded approval; emits immutable versioned outputs; an `unpublish`/`redact` event withdraws serving and
  triggers cache/CDN purge.
- **RB (audit + verify):** `verify_audit()` over the publish ledger + git as redundant witness; reconstruct "why
  publishable + who approved" for any live artifact.
- Every importer/publisher must be a **vetted skill-interface action** so agents traverse the same gate as humans
  — there is no raw path to the public store.

---

Sources:
- [Microsoft Presidio (PII detection/redaction framework)](https://github.com/microsoft/presidio)
- [Presidio: Data Protection and De-identification SDK](https://microsoft.github.io/presidio/)
- [Static Site Generator Security guide](https://www.blog.brightcoding.dev/2025/11/21/static-site-generator-security-the-ultimate-guide-to-protecting-your-markdown-powered-websites-in-2025)
- Reused internal design (separate product): CAW-02 RB-013 (boundary + audit), CAW-02 import/export-boundaries, CAW-02 RB-052 (boundary/redaction validation library).
