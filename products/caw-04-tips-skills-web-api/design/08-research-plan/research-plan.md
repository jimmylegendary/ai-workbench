# Research Plan — open tracks for CAW-04

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:** [./validation-and-tests.md](./validation-and-tests.md), [./open-questions.md](./open-questions.md), [../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md), [../01-decisions/ADR-0004-import-and-ports.md](../01-decisions/ADR-0004-import-and-ports.md), [../01-decisions/ADR-0005-storage-and-versioning.md](../01-decisions/ADR-0005-storage-and-versioning.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

This doc enumerates the **open research tracks** that must close before (or alongside) CAW-04's build phases.
Each track names the question, the ADR/research doc it derives from, why it is on the critical path, the
**spike** that resolves it, the **exit criterion**, and the **phase** that needs the answer. It does NOT
re-decide anything already fixed in the ADRs — it scopes the remaining unknowns. The unifying constraint for
every track is CAW-04's load-bearing property: **the public surface is public-safe by construction** (a frozen,
vetted static artifact with no live path to internal stores). No track may erode that property.

Phases referenced (from the build plan; see runbooks once written):
`P0` core/skeleton · `P1` content model + storage · `P2` import + public-safe gate · `P3` web/API build ·
`P4` versioning/tombstone + operations · `P5` hardening/future connectors.

## Track summary

| # | Track | Owning ADR / doc | Blocks phase | Risk if unresolved |
|---|-------|------------------|-------------|--------------------|
| T1 | Provenance ancestor graph from CAW-02/03 | ADR-0003, ADR-0002 | P2 | Cannot re-derive boundary locally; gate trusts upstream blindly |
| T2 | Redaction engine choice (Presidio vs regex/denylist) | ADR-0003 | P2 | Recall gap leaks confidential data, or ops weight stalls build |
| T3 | Re-validation / revocation feed | ADR-0003, ADR-0004 | P4 | Reclassified upstream content stays public |
| T4 | Cache/CDN purge guarantee on unpublish | ADR-0003, ADR-0006 | P4 | Tombstoned bytes linger at the edge |
| T5 | Bundle signature / attestation | ADR-0003, ADR-0004 | P2 | Import trusts unauthenticated upstream bundles |
| T6 | Content negotiation (`Accept` vs suffix) | ADR-0007, ADR-0001 | P3 | Cache fragmentation; agent integration friction |
| T7 | Search (client index vs server) | ADR-0001, ADR-0006 | P5 | Agents cannot discover artifacts at scale |
| T8 | Provenance dedup/precedence (fan-in) | ADR-0004 | P2 | Same item from two sources double-published |
| T9 | Canonical serialization + digest scheme | ADR-0005 | P1 | Non-reproducible hashes break immutability proof |

---

## T1 — Provenance ancestor graph from CAW-02/CAW-03

- **Derives from:** ADR-0003 (local `boundary_eff` recompute), ADR-0002 (provenance/origin_ref sidecar),
  research `publishing-policy-and-public-safe.md`, `content-model-and-metadata.md`.
- **Question:** Does the import bundle ship the **full provenance ancestor graph** (every upstream source +
  its boundary claim, transitively) so CAW-04 can recompute the effective boundary locally, or only a flat
  leaf claim? And do CAW-02/CAW-03 expose a **stable, versioned `origin_ref`** to pin, or only mutable handles?
- **Why critical:** ADR-0004 makes the public-safe re-check a **core stage** and treats upstream claims as
  **evidence only**. A re-check cannot be deny-by-default if it can only see a leaf claim — a public-safe leaf
  derived from a confidential ancestor must fail. The graph is the input to that recompute.
- **Spike:** request a sample export from CAW-02 and CAW-03 (separate products, import boundary); model the
  ancestor graph; prototype `boundary_eff = max(severity over all ancestors)`; confirm `origin_ref` immutability.
- **Exit criterion:** a documented bundle schema field carrying the ancestor graph + a deterministic recompute
  rule with a failing test when an ancestor is confidential. Remember: `origin_ref`/`origin_version` are
  **audit-only sidecar fields** — they MUST NOT serialize to web/API (see [validation-and-tests.md](./validation-and-tests.md) V2).
- **Phase:** P2.

## T2 — Redaction engine choice

- **Derives from:** ADR-0003 (redaction), research `publishing-policy-and-public-safe.md`.
- **Question:** Microsoft **Presidio** (NLP recall, REST-deployable) vs a lighter **regex + denylist** core for
  the redaction/scan stage? Where does CAW-04's codename/fab/customer pattern list live and how is it kept
  doctrinally aligned with the upstream boundary policy without a shared substrate?
- **Why critical:** redaction is a gate component; recall failure is a confidential-data leak. But Presidio adds
  an NLP dependency and ops weight that may not fit an SSG-centric build.
- **Spike:** build a labelled fixture set (synthetic confidential patterns — codenames/fab IDs/customer names);
  measure recall/precision of both options; measure build-time cost. **Human curator approval is mandatory
  either way** — the engine is a recall aid, not the gate.
- **Exit criterion:** a decision table with measured recall/precision on the fixture set (mark numbers TODO
  until measured) and a chosen engine + pattern-list home (likely a versioned file in CAW-04's own repo).
- **Phase:** P2.

## T3 — Re-validation / revocation feed

- **Derives from:** ADR-0003 (re-validation cadence), ADR-0004 (upstream retract), research import + policy docs.
- **Question:** When an upstream source is later **reclassified to confidential** or **retracted**, how does
  CAW-04 learn and re-run the gate? Is the provenance ref a **liveness check** (poll), a **push** notification,
  or a periodic re-import? What is the acceptable staleness window?
- **Why critical:** a published artifact that becomes confidential upstream is a standing leak until withdrawn.
  This is the dynamic half of the public-safe guarantee.
- **Spike:** prototype a `revalidate()` pass that re-pulls each published artifact's `origin_ref`, diffs the
  boundary claim, and queues a curator `unpublish`/`redact` proposal on regression. Decide pull vs push (see
  open-questions OQ — import direction).
- **Exit criterion:** a documented revocation feed contract + a staleness bound (TODO(open-question: numeric
  bound)) + a runbook step that re-runs the gate on schedule.
- **Phase:** P4 (depends on import direction; couples to T8).

## T4 — Cache / CDN purge guarantee on unpublish

- **Derives from:** ADR-0003 (purge guarantee), ADR-0006 (SSG/edge), research policy + web/api stack.
- **Question:** A public artifact may be cached at the edge/CDN. On `unpublish`/`redact`, what is the **bound on
  time-to-purge**, and is purge **best-effort** or **guaranteed** before the curator action is reported complete?
- **Why critical:** the tombstone (HTTP 410) is only as strong as the slowest cache. A redact that leaves bytes
  at the edge defeats the boundary-change workflow.
- **Spike:** evaluate the deploy target's purge API (TODO(open-question: hosting target not yet fixed)); model a
  `redact -> rebuild -> deploy -> purge -> verify-410` pipeline; decide whether short max-age + explicit purge,
  or immutable-with-versioned-URLs + index removal, gives the firmer guarantee.
- **Exit criterion:** a documented purge sequence with a verification step that asserts 410 at the edge, plus a
  stated time bound. Cross-link [validation-and-tests.md](./validation-and-tests.md) V4 (tombstone returns 410).
- **Phase:** P4.

## T5 — Bundle signature / attestation

- **Derives from:** ADR-0003, ADR-0004 (signature scheme), research policy + import docs.
- **Question:** Which signature/attestation scheme on imported bundles — **DSSE / in-toto / minisign** — verifies
  the bundle came from the claimed validated upstream and was not tampered in transit?
- **Why critical:** the re-check trusts the bundle's *contents as evidence*; an unauthenticated bundle lets an
  attacker forge a "validated, public-safe" claim. Signature authenticates the evidence source (it does **not**
  replace the core re-check — deny-by-default still applies).
- **Spike:** prototype verifying a signed sample bundle from CAW-02; compare key-management overhead of the three
  schemes for a two-product (CAW-02/03 -> CAW-04) trust boundary.
- **Exit criterion:** a chosen scheme + key-distribution note + a gate step that **rejects** unsigned/invalid
  bundles before the re-check runs.
- **Phase:** P2.

## T6 — Content negotiation

- **Derives from:** ADR-0007 (decision: `Accept` primary + `.md`/`.json` suffix secondary), ADR-0001, research
  web/api + versioning docs.
- **Question:** ADR-0007 picked `Accept` header as canonical with suffix aliases. Open detail: some CDNs handle
  `Vary: Accept` poorly. Is the **suffix the cache-safe canonical** path in practice, with `Accept` as a
  convenience for dumb clients? This is an **elaboration**, not a re-decision.
- **Why critical:** wrong cache keys fragment the CDN and undermine the static-artifact model; agents need a
  stable, shareable URL.
- **Spike:** test `Vary: Accept` behaviour on the candidate CDN; confirm suffix routes are emitted statically by
  the Astro build for every artifact (web/API parity, ADR-0007).
- **Exit criterion:** a documented per-CDN recommendation; suffix routes verified present for all artifacts.
- **Phase:** P3.

## T7 — Search

- **Derives from:** ADR-0001, ADR-0006 (deferred), research web/api stack, skills-distribution.
- **Question:** Is a **prebuilt client-side index** (Pagefind-style) sufficient for v1, or do agents need a
  **server-side search** endpoint? ADR defers runtime search; this track scopes when/if it returns.
- **Why critical:** discovery at scale; but a server-side search endpoint reintroduces a runtime path, which must
  not become a live path to internal stores. Any search must index only the **public projection**.
- **Spike:** prototype Pagefind over the built static site; measure index size + agent query ergonomics via the
  `index.json` manifest (ADR-0007).
- **Exit criterion:** a go/defer decision; if built, a static index that demonstrably indexes only public
  fields (no sidecar/audit fields — see [validation-and-tests.md](./validation-and-tests.md) V2).
- **Phase:** P5 (deferred per ADR-0007).

## T8 — Provenance dedup / precedence (fan-in)

- **Derives from:** ADR-0004 (fan-in of CAW-02 + CAW-03), research import docs.
- **Question:** When both source adapters surface the **same logical item**, what is the dedup/precedence rule,
  and how is provenance preserved across the merge?
- **Why critical:** double-publishing or losing an ancestor in a merge corrupts the audit trail and the boundary
  recompute (couples to T1, T3).
- **Spike:** define a logical-identity key; prototype a merge that unions ancestor graphs and records precedence.
- **Exit criterion:** documented precedence + provenance-preserving merge rule with a test (two sources, one
  item, single published artifact, both ancestors retained in the sidecar).
- **Phase:** P2.

## T9 — Canonical serialization + digest scheme

- **Derives from:** ADR-0005, research versioning-and-immutability.
- **Question:** Exact **canonical serialization** spec (field order, whitespace, which metadata fields are inside
  the hashed envelope vs sidecar) and the **digest algorithm + prefix** (`sha256:` vs multihash). Does the hash
  cover the sidecar/audit fields or only the public projection?
- **Why critical:** the content-digest is the immutability proof; non-reproducible hashing breaks the "frozen
  forever" guarantee (ADR-0005) and the parity tests.
- **Spike:** prototype canonical normalization + hashing across two rebuilds; assert identical digest.
- **Exit criterion:** a written serialization spec + chosen algorithm/prefix + a reproducibility test. Decision:
  hash covers the **public projection** (so sidecar churn never re-hashes public content) unless T1 shows audit
  integrity needs otherwise — TODO(open-question).
- **Phase:** P1.

## Implications for runbooks

- P1 runbooks must land T9 (canonical hash) before any content is frozen.
- P2 runbooks must land T1, T2, T5, T8 — the gate cannot be deny-by-default without the ancestor graph (T1),
  signed evidence (T5), and merge rules (T8).
- P4 runbooks must land T3 + T4 — the dynamic half of the public-safe guarantee.
- T6/T7 are P3/P5 elaborations; do not block the core publish path.
- Every track's exit test belongs in [validation-and-tests.md](./validation-and-tests.md); every unresolved
  detail is mirrored in [open-questions.md](./open-questions.md).
