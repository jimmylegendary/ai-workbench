# Publish Gate & Public-Safe (the load-bearing control)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./overview.md](./overview.md)
  - [./import-and-recheck.md](./import-and-recheck.md)
  - [../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md) (the authoritative ADR)
  - [../01-decisions/ADR-0002-content-model.md](../01-decisions/ADR-0002-content-model.md) (`isPublishable`, sidecar split)
  - [../01-decisions/ADR-0005-storage-and-versioning.md](../01-decisions/ADR-0005-storage-and-versioning.md) (freeze, tombstones)
  - [../02-research/publishing-policy-and-public-safe.md](../02-research/publishing-policy-and-public-safe.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This doc specifies the **publish gate** — the single load-bearing control that decides *what may be published* on
the public website + REST API. It elaborates ADR-0003 at the core/implementation altitude: the deny-by-default
decision function, the requirement of **both** a validated source **and** a public-safe boundary, the
**redaction** stance, the mandatory **curator approval**, and the rule that **generated/unverified content is
never published**. It does NOT re-derive boundary semantics from scratch (reused-as-semantics from CAW-02, an
independent copy) and it does NOT cover the import re-check mechanics (see
[import-and-recheck.md](./import-and-recheck.md)) — the re-check is the import-time enforcement of *this* gate.

## Non-negotiable principles (from ADR-0003 — restated, do not weaken)
1. **Public outputs from public-safe sources only.** The only `boundary` a published artifact may carry is
   **`public`**. `internal` and `confidential` are publishable-never (brief §11).
2. **Default-deny, fail-closed.** Anything indeterminate, unverified, or unparseable is **excluded**. The default
   branch of the decision function is **REJECT**.
3. **Never trust the upstream boundary.** A declared `public_safe` is *evidence*, not authority; the core
   re-derives and re-checks locally.
4. **Two independent axes.** `boundary {public ⊂ internal ⊂ confidential}` (sensitivity) and `visibility
   {team, private}` (scope). Published ⇒ `public` **and** no `private` ancestor. The axes never collapse.
5. **No authoring, no laundering.** Redaction may *remove*, never *invent*. There is **no downgrade/`reclassify`
   path inside CAW-04** — confidential→public happens only upstream and re-enters as a new import.
6. **Every publish is human-approved.** The gate can only ever auto-**reject**; it can never auto-**approve**.

## The decision function
`publish_decision(item) → PUBLISH_OK | REJECT{reasons[]}` is **total** (defined for every input) and
**side-effect-free** (it computes; it does not write the store — only the audit writer does, separately). It is a
chain of fail-closed checks: the **first hard failure rejects**; soft findings are collected for the curator; the
**default branch is REJECT**. It is the same function whether invoked by an agent or a human — there is no second,
looser path.

```
fn publish_decision(item) -> Decision {
    let reasons = [];
    for check in [G1, G2, G3, G4, G5, G6, G7] {        // eligibility checks
        match check(item) {
            Pass            => continue,
            HardFail(r)     => return REJECT([r]),       // fail fast, fail closed
            SoftFinding(f)  => reasons.push(f),          // surfaced to curator, still REJECT-by-default
        }
    }
    if !reasons.is_empty() { return REJECT(reasons); }
    if !G8_human_approval_exists(item) { return HOLD; }  // eligible, awaiting curator (G8)
    return PUBLISH_OK;                                    // <-- ONLY reachable via explicit human approve
}
// default, if the chain is ever edited to fall through: REJECT  (mutation-tested)
```

## The gate checks (G1–G8)
| # | Check | Must hold to pass | On failure |
|---|---|---|---|
| G1 | Validated source | resolvable provenance ref to a **validated** CAW-02/CAW-03 source (accepted/validated upstream) | REJECT: no validated source |
| G2 | Effective boundary | **`boundary_eff(item) == public`**, the lattice-max over the item + all provenance ancestors — not the declared flag | REJECT: above-public |
| G3 | Visibility | no ancestor is `visibility=private` (`visibility_eff == team`) | REJECT: private-derived |
| G4 | Redaction-clean | redaction scan returns **zero** hits on the *rendered public view* | REJECT: leak markers found |
| G5 | Evidence-grade | not a bare generated-summary; `isPublishable(record)` holds — reuse/audit metadata present (inputs/outputs, preconditions, provenance, safety boundary, version) | REJECT: not reusable/auditable |
| G6 | Contract version | import envelope `contract_version` MAJOR is supported | REJECT: unknown contract |
| G7 | Integrity | `payload_sha256` matches canonicalized payload; signature (if present) verifies | REJECT: integrity/tamper |
| G8 | Curator approval | an explicit human approve event exists for this version | HOLD (stays on preview/admin) |

- **G1–G7 gate eligibility; G8 gates promotion to live.** A G1–G7 pass with no G8 stays on the internal
  preview/admin surface (ADR-0001) — **never** on the public web/API.
- **G2 is the spine.** `boundary_eff` is the lattice-max over the item and *all* provenance ancestors. A Tip
  citing one `confidential` Claim is itself `confidential` and is rejected — synthesis never launders sensitivity
  downward. The core **recomputes** this; it never reads a cached upstream flag. An unresolvable ancestor resolves
  to `confidential`/`private` (fail-closed unknown).

## "Validated source AND public-safe" — both required, neither sufficient
The gate is an **AND**, not an OR. Two independent conditions must both hold, and the second is re-derived locally:

| Condition | Satisfied by | Checks | Failure mode it blocks |
|---|---|---|---|
| **Validated source** | a resolvable provenance ref to an upstream-validated artifact | G1, G7 | publishing fabricated / unverifiable content |
| **Public-safe boundary** | locally re-derived `boundary_eff == public` + `visibility_eff == team` + zero redaction hits | G2, G3, G4 | leaking internal/confidential/private know-how |

A validated-but-confidential item fails G2. A public-but-unverified item fails G1/G5. Only an artifact that is
**both** validated **and** public-safe — **and** then human-approved (G8) — is ever published.

## Generated / unverified content is never published (G5)
CAW-04 authors nothing (brief §10). A **bare generated summary** is *not evidence* (brief §11: generated
conclusions are kept separate from sources/claims/evidence). G5 rejects any record that:
- is a `generated-summary` kind with no validated source backing, or
- lacks the reusable+auditable metadata the content model requires (`isPublishable(record)` is false — ADR-0002).

Automatic generation upstream is **proposal generation**; it never becomes a published artifact without a
validated provenance chain (G1) and human approval (G8). The gate cannot be configured to wave this through.

## Redaction stance — detection + rejection, not transformation
| Aspect | CAW-04 stance | Rationale |
|---|---|---|
| Purpose | **Detection + rejection**, not transformation | a public-surface leak is unrecoverable once served/cached |
| Action on a hit (public item) | **reject + escalate** to curator | a hit means the *source* mis-classified; stripping would ship a silently-altered artifact and mask an upstream bug |
| Scope | the **rendered public view** (post-template markdown/JSON/HTML), not just raw fields | a reader sees the rendered output; that is the attack surface |
| Ruleset ownership | CAW-04 owns its own `ruleset_version`; **not** imported from CAW-02 (no shared substrate) | independence (brief §1); kept doctrinally aligned |
| Engine | candidate: **Microsoft Presidio** (analyzer + custom recognizers) + a CAW-04 codename/fab/customer pattern list | mature OSS, REST-deployable, customizable; "no guarantee it finds all" → human approval stays mandatory |

```
fn redact_scan(rendered_public_view) -> [Hit{ rule_id, span, sample, severity }]
// any hit on a candidate-public item  =>  G4 HardFail  =>  REJECT + escalate (never auto-strip)
```

`TODO(open-question: Presidio vs a lighter regex+denylist core — recall vs dependency/ops weight, given human
approval is mandatory regardless. ADR-0003.)`

## Curator approval (G8) — the only path to live
- The gate **auto-rejects**; it **never auto-approves** (principle 6). G1–G7 produce a *proposal*; G8 is a human act.
- Approval is an **explicit event** on the internal preview/admin surface (ADR-0001), recorded in the audit as
  `approved_by` against a specific `(artifact_id, version)`.
- Approval is **version-scoped**: a new version re-enters the gate; prior approval does not carry forward.
- Throughput is curator-bound **by design** — this is a guardrail, not a bottleneck to optimize away.

## Audit — every published item traces to a validated source + safety review
The publish ledger is an **append-only, hash-chained `_events` log** (one line per gate decision and per
publish/unpublish/redact), reusing CAW-02 RB-013's chain construction with git history as a redundant second
witness (md/MDX-first store, ADR-0005). Unpublish/redact are **events, not deletes**: published *versions* are
immutable (frozen forever — ADR-0005) but can be withdrawn from serving via an HTTP 410 tombstone.

```json
{
  "seq": 42,
  "prev_hash": "sha256:…",
  "event": "publish | reject | hold | unpublish | redact",
  "artifact_id": "caw04:<id>",
  "version": "1.2.0",
  "source_ref": { "product": "CAW-02|CAW-03", "id": "…", "producer_run_id": "<opaque>" },
  "boundary_eff": "public",
  "gate_result": { "G1": "ok", "G2": "ok", "G3": "ok", "G4": "ok", "G5": "ok", "G6": "ok", "G7": "ok", "G8": "ok" },
  "redaction": { "ruleset_version": "…", "hits": 0 },
  "approved_by": "human:jimmy",
  "envelope_digest": "sha256:…",
  "hash": "sha256: H(prev_hash ‖ canonical(line))"
}
```
Guarantees: **traceability** (`source_ref` + `producer_run_id` trace any public artifact upstream without a live
handle), **tamper-evidence** (`verify_audit()` walks the chain → `broken_at`), **reconstructable decisions**
("why publishable + who approved" is replayable), and **withdrawal-without-erasure** (unpublish/redact recorded).

> Note: `source_ref` and `producer_run_id` are **audit-only** provenance and live in the sidecar — they MUST NEVER
> serialize to the public web/API output (ADR-0002 public-projection split; test-enforced, see overview I3).

## Open Questions
- TODO(open-question: redaction engine — Presidio vs regex+denylist core. ADR-0003.)
- TODO(open-question: where the codename/fab/customer pattern list lives and how it stays aligned with CAW-02
  without a shared substrate. ADR-0003.)
- TODO(open-question: cache/CDN purge bound on time-to-purge after `redact`/`unpublish`. ADR-0003/0005.)
- TODO(open-question: distinct provenance kinds for already-public external sources vs internal-origin
  public-safe content — both `boundary=public`, different risk. ADR-0003.)
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks
- **RB (pub.safe gate):** implement `publish_decision()` as a total, side-effect-free function with default-REJECT;
  negative-heavy + mutation tests (weakening default to `PUBLISH_OK` must break the suite).
- **RB (redaction):** `scan()` over the rendered public view; reject+escalate on any hit; never auto-strip.
- **RB (preview/admin + approve):** the only path flipping a G1–G7 candidate to published is an explicit human
  approve event (G8); record `approved_by`.
- **RB (audit + verify):** hash-chained `_events` writer + `verify_audit()`; git as redundant witness;
  reconstruct "why publishable + who approved" for any live artifact.
