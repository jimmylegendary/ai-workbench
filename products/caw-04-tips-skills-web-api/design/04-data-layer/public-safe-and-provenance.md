# Public-Safe & Provenance — Boundary Model, the Audit Sidecar, the Local Re-Check

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(set on review)
- **Related:**
  - [./content-model.md](./content-model.md) — the public projection vs the audit sidecar
  - [./storage-and-versioning.md](./storage-and-versioning.md) — where the sidecar + ledger live
  - [../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md) (the gate — load-bearing)
  - [../01-decisions/ADR-0002-content-model.md](../01-decisions/ADR-0002-content-model.md) (sidecar decision)
  - [../01-decisions/ADR-0004-import-and-ports.md](../01-decisions/ADR-0004-import-and-ports.md) (re-check is a CORE stage, not in adapters)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

This data-layer doc defines, at the level of stored data: the **boundary model** (only `public-safe` content is
published), the **provenance model** (`origin_ref` / `origin_version` held in the audit sidecar, never served), how
the **public-safe re-check re-derives the boundary locally** from provenance, and the **audit trail** that ties every
published artifact to a validated internal source. It is the data-side companion to the gate policy in
[ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md). It does **NOT** restate the full gate
check chain (that is the ADR) or the storage layout ([storage-and-versioning](./storage-and-versioning.md)).

## Boundary model

Two independent axes (copied semantics from CAW-02 — **not** a shared library; brief §1 independence):

| Axis | Values (lattice) | Meaning |
|---|---|---|
| `boundary` (sensitivity) | `public ⊂ internal ⊂ confidential` | how sensitive the content is |
| `visibility` (scope) | `team`, `private` | who it was scoped to upstream |

**Publish rule:** a published artifact must be `boundary = public` **and** derive from **no `private` ancestor**.
`internal` and `confidential` are publishable-never. The axes never collapse into one field. Only `public-safe`
artifacts ever exist in the served corpus — the static build is public-safe **by construction**
([ADR-0006](../01-decisions/ADR-0006-web-stack.md)).

```yaml
# embedded in the public projection (content-model.md)
boundary:
  classification: public-safe        # only this value publishes
  recheck_status: pass               # pass | fail | pending — from CAW-04's OWN re-check
  rechecked_at: TODO(set at re-check)
```

`classification: internal-only` or `confidential`, or `recheck_status` of `fail`/`pending`, makes the record
structurally unpublishable — `isPublishable(record)` ([content-model](./content-model.md#the-reusableauditable-skill-metadata-standard))
returns false and `status` stays `in-review`.

## Provenance model & the audit sidecar

Provenance is **split across the two-record boundary** ([content-model](./content-model.md#the-two-record-principle-load-bearing)):

| Field | Where | Served? | Purpose |
|---|---|---|---|
| `origin_product` (`caw-02\|caw-03\|skills-registry`) | public projection | yes | coarse attribution (which product family) |
| `validated` (bool) | public projection | yes | asserts an upstream validation occurred |
| `derivation` (`verbatim\|redacted\|summarized`) | public projection | yes | W3C PROV `wasDerivedFrom` kind |
| **`origin_ref`** | **audit sidecar** | **never** | opaque internal handle in the origin product |
| **`origin_version`** | **audit sidecar** | **never** | exact validated upstream version pinned (deterministic audit) |
| `validated_by`, `imported_at` | audit sidecar | never | who/what validated upstream + when CAW-04 imported |
| `redactions[]` (what/why removed) | audit sidecar | never | reach-public-safe transformation record |
| `reviewer`, `rationale` | audit sidecar | never | curator approval detail |

### Sidecar file shape (`<slug>/<semver>.audit.yml`)

```yaml
# AUDIT-ONLY — beside the file, excluded from every build output. MUST NEVER serialize.
artifact: { id: summarize-pr-diff, kind: skill, version: 1.2.0 }
provenance:
  origin_product: caw-03
  origin_ref: "skreg://..."            # opaque internal handle — audit-only
  origin_version: "..."                # pinned upstream version — audit-only
  validated_by: "..."                  # upstream validation process (not a secret)
  imported_at: "TODO(set at import)"
  derivation: summarized
boundary_internal:
  reviewer: "Jimmy"
  rationale: "..."
  redactions: [ { field: example.output_sample, action: remove, reason: "..." } ]
recheck:
  status: pass
  rechecked_at: "TODO(set at re-check)"
  boundary_eff: public                 # locally re-derived (see below)
  visibility_eff: team
```

> Why a sidecar and not "hidden" inline fields: a serializer cannot leak what is not in the object it serializes. The
> audit fields physically do not travel with the rendered file. This is the structural guarantee, not a filter.

## The public-safe re-check (re-derives the boundary locally)

The re-check is a **CORE stage**, never inside a `ContentSourceAdapter`
([ADR-0004](../01-decisions/ADR-0004-import-and-ports.md)). It runs **before** any file is written to the git store
([storage-and-versioning](./storage-and-versioning.md#source-of-truth-markdownmdx-in-caw-04s-own-git-repo)). It is
**deny-by-default**: an upstream `public_safe` claim is **evidence only**, never trusted.

```
import bundle ─▶ [CORE re-check]
  1. parse + semver-gate envelope (contract_version, payload_sha256)         fail → reject
  2. re-derive boundary_eff = lattice-MAX over item + ALL provenance ancestors
        unresolvable ancestor ⇒ confidential / private   (fail-closed unknown)
  3. re-run redaction ruleset over the RENDERED PUBLIC VIEW (md/JSON a reader sees)
        any hit on a candidate-public item ⇒ reject + escalate (never auto-strip)
  4. free-text leak scan (codenames, fab/customer regexes, internal hosts, employee ids)
  5. conflation guard (no public source fused with a confidential one)
  6. emit a CANDIDATE → preview/admin with findings  (never a published item)
```

| Property | How the data layer enforces it |
|---|---|
| **Never trust upstream** | `boundary.recheck_status` is set ONLY by CAW-04's local re-check; the upstream flag is recorded as evidence in the sidecar, not copied into `classification`. |
| **Re-derive from provenance** | `boundary_eff` = lattice-max over the item + all ancestors; the result is stored in the sidecar `recheck` block and gates publish. |
| **Fail-closed** | an unresolvable ancestor resolves to `confidential`/`private`; indeterminate ⇒ excluded, not degraded-published. |
| **Scope = rendered view** | the redaction scan runs over the exact public projection that will be served, not raw fields. |

The re-check populates `recheck_status` + `boundary_eff`; the gate ([ADR-0003 G2/G4](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md))
consumes them. **`boundary_eff` recomputed inside CAW-04 is authoritative; the upstream claim is never.**

## Serialization firewall

The one rule that makes the split real: **audit-only fields must never appear in any served output** (web page, JSON,
raw markdown, `index.json`, MCP resource).

| Control | Mechanism |
|---|---|
| **Structural** | audit fields live in `<slug>/<semver>.audit.yml`, not in the served frontmatter (sidecar, [content-model](./content-model.md#the-two-record-principle-load-bearing)). |
| **Projection** | a `publicProjection(record)` function builds the served object from an allow-list of public keys only. |
| **Test-enforced** | a test asserts the deny-listed keys (`origin_ref`, `origin_version`, `validated_by`, `reviewer`, redaction internals) appear in **zero** build artifacts. Weakening it must fail CI. |
| **Build-time assertion** | the sink asserts `boundary.classification == public-safe ∧ recheck_status == pass` for every emitted artifact ([ADR-0006](../01-decisions/ADR-0006-web-stack.md)) — last-line enforcement. |

## Audit trail

Every gate decision and every publish/unpublish/redact is an event in the append-only, hash-chained `_events` ledger
([storage-and-versioning](./storage-and-versioning.md#derived-index--audit-witnesses),
[ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md)). Minimum per publish event:

```jsonc
{
  "seq": 0, "prev_hash": "…",
  "event": "publish",                      // publish | unpublish | redact | gate-decision
  "artifact_id": "summarize-pr-diff", "version": "1.2.0",
  "source_ref": { "product": "caw-03", "id": "<opaque>", "producer_run_id": "<opaque>" },
  "boundary_eff": "public", "visibility_eff": "team",
  "gate_result": { "G1": "pass", "G2": "pass", "G3": "pass", "G4": "pass", "G5": "pass", "G6": "pass", "G7": "pass", "G8": "approved" },
  "redaction": { "ruleset_version": "…", "hits": 0 },
  "approved_by": "Jimmy", "envelope_digest": "sha256:…",
  "hash": "H(prev_hash ‖ canonical(line))"
}
```

Guarantees:

- **Traceability** — `source_ref` + `producer_run_id` trace any public artifact back upstream **without a live
  handle**; `origin_ref`/`origin_version` in the sidecar complete the pin for deterministic re-audit.
- **Tamper-evidence** — `verify_audit()` walks the chain → `broken_at`; git history is the redundant second witness.
- **Reconstructable decisions** — "why publishable + who approved" is replayable from the recorded `gate_result`.
- **Retention across removal** — unpublish/redact are events, not deletes; **provenance to the internal source is
  retained even after public bytes are purged** ([storage](./storage-and-versioning.md#tombstone-semantics)).

## Open Questions

Promote to `../08-research-plan/open-questions.md`:

- TODO(open-question: does the import bundle ship the full provenance ancestor graph for local `boundary_eff` recomputation, or only the leaf + declared boundary? If only the leaf, unresolved ancestry fails closed.)
- TODO(open-question: redaction engine — Microsoft Presidio vs a lighter regex/denylist core, given human approval is mandatory regardless.)
- TODO(open-question: where CAW-04's codename/fab/customer pattern list lives and how it stays doctrinally aligned with CAW-02 without becoming a shared substrate.)
- TODO(open-question: re-validation cadence — when upstream reclassifies a source to confidential, how does CAW-04 learn it must unpublish? poll / revocation feed / curator-driven.)
- TODO(open-question: does `content_hash` cover the sidecar, or only the public projection? Coordinate with [content-model](./content-model.md) + [storage](./storage-and-versioning.md).)

## Implications for runbooks

- Build the `pub.safe` re-check library as a **CORE** stage (not an adapter), deny-by-default, with a
  **negative-heavy, mutation-tested** suite — weakening the default branch to publish must break the suite.
- Persist the **audit sidecar** beside each version and the **hash-chained ledger**; implement `verify_audit()`.
- Implement `publicProjection(record)` (allow-list) + the serialization-firewall test asserting audit keys never
  appear in any built artifact.
- The re-check sets `boundary.recheck_status` / `boundary_eff` locally from provenance; publish is refused on
  `fail`/`pending` regardless of any upstream boundary flag.
