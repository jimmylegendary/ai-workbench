# Import & the Core Public-Safe Re-check

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./overview.md](./overview.md)
  - [./publish-gate-and-public-safe.md](./publish-gate-and-public-safe.md) (the gate this re-check enforces at import time)
  - [../01-decisions/ADR-0004-import-and-ports.md](../01-decisions/ADR-0004-import-and-ports.md) (the authoritative ADR)
  - [../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md)
  - [../01-decisions/ADR-0002-content-model.md](../01-decisions/ADR-0002-content-model.md) (`CandidateItem`/`PublishableItem`, sidecar)
  - [../06-interfaces/](../06-interfaces/) (port contracts — adapter detail)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This doc describes how content **enters** CAW-04 — the `ContentSourceAdapter` import — and the **core public-safe
re-check** that every import must cross. It covers: why the re-check lives in the **core** (never an adapter),
treating the **upstream boundary claim as evidence only**, the **fan-in dedup/precedence** rules when CAW-02 and
CAW-03 surface the same logical item, and the **pull-vs-push** stance (v1 is pull). It does NOT redefine the gate
checks (see [publish-gate-and-public-safe.md](./publish-gate-and-public-safe.md)) or the port interfaces in full
(see [../06-interfaces/](../06-interfaces/)); it is the import-side view of the pipeline.

## Where the re-check lives (and why it is not in an adapter)
The public-safe re-check is a **core stage**, never in a `ContentSourceAdapter` (ADR-0004 §2, load-bearing). An
adapter is read-only plumbing: it knows how to talk to one upstream and return a provenance-tagged
`CandidateItem` — it does **not** know the re-check exists and **cannot** self-bypass it. The pipeline is fixed:

```
import → re-check → curator gate → version → publish
         ^^^^^^^^   (core)         (core)    (sink)
```
There is **no raw import path** around the re-check — agents and humans use the same checks (ADR-0004 §2). The
config-driven registry can wire which adapters are active but can **never** let an adapter override the re-check,
the human gate, or the boundary policy (ADR-0004 §4). `AdapterCapabilities.requiresPublicSafe` is `true` and
**cannot be self-disabled** (ADR-0004 §3).

## The `ContentSourceAdapter` (driven port, read-only)
| Method | Returns | Notes |
|---|---|---|
| `capabilities()` | `AdapterCapabilities` | `port`, `id`, `version`, `provides`, `features`, `requiresConfig`, `requiresPublicSafe:true`, `maturity` |
| `discover(query)` | `CandidateRef[]` | reference upstream by **id/URI/version** — never a shared store handle |
| `fetch(ref)` | `CandidateItem` | payload + `upstream_boundary_claim` + `source_ref` + `upstream_metadata` |
| `health()` | `Health` | preflight + liveness |

v1 concrete sources: `Caw02KnowledgeSourceAdapter`, `Caw03SkillsRegistrySourceAdapter`. Documented stubs
(registered, config-disabled, `maturity="stub"`): `InternalWikiSourceAdapter`, `CuratedBundleSourceAdapter`
(ADR-0004 §5). Preflight refuses to run an `active` `stub`.

### The import envelope (parsed + semver-gated in core)
```yaml
contract_version: "1.x"          # MAJOR semver-gated; unknown MAJOR => reject (never guess)
source_product:   "CAW-02"       # or CAW-03
declared_boundary: "public"      # EVIDENCE ONLY — re-derived locally, never trusted
redaction_applied: true          # EVIDENCE ONLY — re-scanned locally regardless
payload_sha256:   "sha256:…"     # must match canonicalized payload, else reject (integrity)
provenance:       { graph: [...] }   # ancestor graph for local boundary_eff recomputation
payload:          { ... }        # the candidate Tip/Skill/Workflow/Playbook + metadata
```

## Upstream boundary claim = evidence only
| Upstream field | CAW-04 treatment | Why |
|---|---|---|
| `declared_boundary` | **re-derive `boundary_eff` locally** from the provenance graph | upstream policy drift can't slip through (ADR-0003 P3) |
| `redaction_applied` | **re-run the redaction scan** regardless | producer redaction is a single point of failure |
| `public_safe` (any hint) | a *hint*, not a verdict | brief §7 "never trust upstream blindly" |
| unresolvable ancestor | resolve to **`confidential`/`private`** (fail-closed) | deny-by-default; ADR-0004 §2 |

The verdict CAW-04 trusts is its **own**, produced by `pub.safe`. Upstream's claim is recorded in the audit as
evidence but is never the authority.

## The core re-check pipeline (each stage fail-closed)
```
1. envelope.parse + semver-gate     # unknown MAJOR => reject; digest mismatch => reject
2. boundary.eff / visibility.eff    # re-derive from provenance graph; unresolvable ancestor => confidential/private
3. redact.scan(rendered view)       # re-run ruleset over the PUBLIC view a reader would see; any hit => reject+escalate
4. free-text leak scan              # codenames, fab/customer regexes, internal hosts/URLs, employee ids
5. conflation guard                 # may not fuse a public source with a confidential one => split or reject
6. emit CANDIDATE (never published)  # lands in preview/admin with full findings report attached for G8
```
Outcome is a typed verdict:
```
RecheckVerdict { decision: publish_eligible | quarantine | reject, findings[], boundary, evidence_ref }
```
**Deny-by-default:** anything not positively confirmed public-safe does **not** become eligible. A failed re-check
blocks the item **even when upstream marked it public-safe** (the ADR-0004 §2 / brief §11 guardrail). The re-check
is the import-time enforcement of the [gate](./publish-gate-and-public-safe.md) — it does not replace G8 (human
approval still required to go live).

> Audit-only provenance fields (`origin_ref`/`origin_version`) extracted here go to the **sidecar** and MUST NEVER
> serialize to web/API (ADR-0002; overview I3).

## Fan-in: dedup & precedence
The registry allows **multiple active sources** (fan-in). When CAW-02 and CAW-03 surface the **same logical item**
the core must dedup and merge provenance-preservingly. Working rules (open for ratification):

| Step | Rule |
|---|---|
| Identity | logical identity = `(kind, stable upstream id)` normalized; collisions across products are *candidates to merge*, not auto-merged |
| Precedence | **most-specific source wins per field**: CAW-03/skills-registry is authoritative for Skill/Workflow execution metadata (inputs/outputs/preconditions); CAW-02 is authoritative for knowledge/claims/citations |
| Boundary | merged `boundary_eff` = **lattice-max** across all contributing sources (never the min) — fail-closed |
| Provenance | **union** all `source_ref`s into the sidecar; never drop an ancestor (would weaken boundary recomputation) |
| Conflict | if precedence does not resolve a field conflict, **do not auto-merge** — emit separate candidates + flag for curator |
| Conflation | a merged artifact may not fuse a public source with a confidential one (re-check step 5) |

`TODO(open-question: exact dedup key + provenance merge algorithm when both source adapters surface the same
logical item. ADR-0004.)`

## Pull vs push — v1 is pull
| Model | How | v1 |
|---|---|---|
| **Pull** | CAW-04 polls `discover()` on a cadence, then `fetch()` selected refs | **Chosen for v1** — no inbound surface, no upstream coupling, CAW-04 controls timing and the re-check runs on its own clock |
| Push | upstream notifies CAW-04 on new/changed content | deferred — would add an inbound endpoint + auth + a trust surface; revisit if freshness needs it |

Pull keeps the import boundary one-directional and keeps CAW-04 independent (no upstream callback into its runtime).
Either way the re-check is identical — push would only change *when* `fetch()` is triggered, never the core stages.

`TODO(open-question: pull-only vs push; affects the source port. ADR-0004.)`
`TODO(open-question: when upstream re-validates or retracts a source item, how CAW-04 learns and re-runs the gate —
does the provenance ref include a liveness/revocation check. Ties to unpublish in ADR-0005.)`

## Preflight (before any I/O)
Before importing, the core resolves active adapters, reads `AdapterCapabilities`, and validates wiring (ADR-0004
§3): source `provides` what the content model needs; required config/auth present (secrets are **env refs only**);
**no `active` adapter is a `stub`**; `requiresPublicSafe` is on. Failures are reported here with actionable
messages, not mid-import.

## Open Questions
- TODO(open-question: does the bundle ship the full provenance ancestor graph, or only the leaf + declared
  boundary? If only the leaf, unresolved ancestry fails closed and nothing publishes. ADR-0003/0004.)
- TODO(open-question: dedup/precedence + provenance merge on fan-in. ADR-0004.)
- TODO(open-question: pull vs push; adapter discovery mechanism + adapter↔port SemVer/compat policy. ADR-0004.)
- TODO(open-question: signature/attestation scheme on imported bundles — DSSE / in-toto / minisign. ADR-0003.)
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks
- **RB (ContentSourceAdapter — CAW-02/CAW-03):** read-only; reference by id/URI/version; return a
  provenance-tagged `CandidateItem`; the adapter never sees the re-check.
- **RB (core re-check):** envelope parse + semver gate → local `boundary_eff`/`visibility_eff` (fail-closed
  unknown) → `scan()` over rendered view → free-text leak scan → conflation guard → emit a *candidate* with
  findings; one append-only audit line per crossing.
- **RB (fan-in merge):** dedup by logical identity; per-field precedence; lattice-max boundary; provenance union;
  unresolved conflict ⇒ separate candidates + curator flag.
- **RB (registry + preflight):** config-driven; refuse `active` `stub`; env-ref secrets; validate wiring before I/O.
- **RB (seam test):** adding a source touches exactly one adapter file + one config block — the regression check
  that the seam has not leaked into the core.
