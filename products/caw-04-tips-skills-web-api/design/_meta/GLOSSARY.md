# GLOSSARY — CAW-04 Ubiquitous Language

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set review date)
- **Related:**
  - [PRODUCT-BRIEF.md](./PRODUCT-BRIEF.md)
  - [DOC-CONVENTIONS.md](./DOC-CONVENTIONS.md)
  - [ADR-0002-content-model.md](../01-decisions/ADR-0002-content-model.md)
  - [ADR-0003-publishing-policy-and-public-safe-gate.md](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md)
  - [ADR-0004 import & ports](../01-decisions/) · [ADR-0005 storage & versioning](../01-decisions/) · [ADR-0006 web stack](../01-decisions/) · [ADR-0007 API design](../01-decisions/)
  - [content-model-and-metadata.md](../02-research/content-model-and-metadata.md)
- **Source of truth:** ./PRODUCT-BRIEF.md

## Purpose

This document fixes the **ubiquitous language** for CAW-04 — the AI Tips/Skills Website & REST API. Every design
doc, ADR, research note, and runbook MUST use these terms exactly as defined here (see DOC-CONVENTIONS §7). When a
definition and an ADR drift, the ADR's normative text wins for behaviour and this glossary is corrected to match.
This doc does NOT make decisions; it names the concepts that the ADRs decide. Cross-links point to the authoritative
ADR for each term — do not duplicate ADR rationale here.

Reading convention: **MUST / MUST NOT / NEVER** are normative (load-bearing); other prose is descriptive.

---

## 1. Core identity terms

| Term | Definition | Authority |
|------|------------|-----------|
| **CAW-04** | This product: the AI Tips/Skills Website & REST API. An **independent, standalone** product in the `ai-workbench` family with its own core, data, and deploy — **no shared runtime substrate** with siblings. | BRIEF §1 |
| **Publishing layer** / **public read layer** | CAW-04's role: the **final publishing/read surface** of the family. It publishes content the internal substrate already validated; it MUST NOT invent content. | BRIEF §1 |
| **Artifact** | The unit of value: one **published, versioned, public-safe** item (a Tip / Skill / Workflow / Playbook) with provenance and a safety boundary, served over web + API. | BRIEF §2 |
| **Curator** | The internal human (Jimmy) who approves every publication. Automatic generation is *proposal* generation only; the curator gates the publish. | BRIEF §3, §11 |
| **Reader** | An external consumer of the public surfaces — a person browsing the website or an agent fetching via REST/MCP. | BRIEF §3 |

---

## 2. Content model — the eight entities

The content model has **8 entities**. Four are **publishable** (addressable artifacts) and four are **supporting**.
Full schema and field-by-field detail: [ADR-0002](../01-decisions/ADR-0002-content-model.md) and
[content-model-and-metadata.md](../02-research/content-model-and-metadata.md).

| Entity | Kind | Definition |
|--------|------|------------|
| **Tip** | publishable | A small, validated AI-use practice — focused, actionable, more than a prompt snippet. |
| **Skill** | publishable | A reusable, auditable capability with explicit **inputs/outputs, preconditions, provenance, safety boundary, version**. Distributable as `SKILL.md` + `manifest.json` (see §7). |
| **Workflow** | publishable | An ordered composition of Skills/Tips that accomplishes a larger task. |
| **Playbook** | publishable | A higher-level operating pattern bundling Workflows/Skills/Tips for a recurring situation. |
| **Example** | supporting | A concrete, public-safe illustration attached to a publishable entity. |
| **Source** | supporting | The reference to the **validated internal origin** of an artifact (which upstream product/entry it came from). Used for audit and the publish gate; see provenance + sidecar (§4). |
| **SafetyBoundary** | supporting | The classification asserting an item is safe at a given exposure level. Only items with a **public-safe** boundary may be published. See [ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md). |
| **Version** | supporting | An immutable, addressable revision of a publishable entity, identified by **semver** + **content-digest** (§6). |

### Common fields

Every publishable entity shares: `id`, `kind`, `title`, `summary`, `version`, `safety_boundary`, `provenance`.

```yaml
# shared frontmatter shape (illustrative — ADR-0002 is authoritative)
id: skill.public-safe-redaction          # stable public id
kind: skill                              # tip | skill | workflow | playbook
title: "..."
summary: "..."
version: 1.2.0                           # semver — public addressable identity
safety_boundary: public-safe            # only public-safe is publishable
provenance:                             # PUBLIC-SAFE provenance only
  source_kind: caw-03-skills-registry
# origin_ref / origin_version => SIDECAR ONLY (never serialized; see §4)
```

---

## 3. The publish gate & public-safe

| Term | Definition |
|------|------------|
| **Publish gate** | The **deny-by-default** control through which all content must pass before publication. Publishes **only** when there is (a) a validated internal **Source** AND (b) a **public-safe** SafetyBoundary AND (c) explicit **curator approval**. Load-bearing — see [ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md). |
| **Public-safe** | The boundary classification meaning the content carries **no confidential company data** and is cleared for the public surfaces. The most critical guardrail (BRIEF §11): public outputs come from public-safe sources only. |
| **Deny-by-default** | The default disposition of every candidate is *not published*. Absence of proof of safety is treated as unsafe. |
| **Curator approval** | Mandatory human sign-off (curator) on every publish. No automated path bypasses it. |
| **Boundary** | Shorthand for a SafetyBoundary value (e.g. `public-safe`, `internal-only`). A **boundary change** on a published item triggers deprecate / unpublish / **redact** (§5). |
| **Public-safe by construction** | The system-level property: the published artifact is a frozen, vetted static output with **no live path** to internal stores, so it cannot leak even if upstream changes. Reinforced by SSG (§8) and the public-projection split (§4). |

---

## 4. Public-projection split & sidecar

| Term | Definition |
|------|------------|
| **Public-projection split** | The rule that the public representation of an artifact is a **strict projection** of its internal record: audit-only fields are excluded from anything served to web/API. Enforced by test. See [ADR-0002](../01-decisions/ADR-0002-content-model.md). |
| **Sidecar** | A separate, internal-only store holding **audit-only provenance fields** (notably `origin_ref`, `origin_version`). The sidecar **MUST NEVER serialize** to the website or API. |
| **Audit-only fields** | Fields kept for traceability of an artifact back to its validated internal Source, but which are **not public-safe to expose**. They live in the sidecar, never in public frontmatter/JSON. |
| **Provenance (public)** | The public-safe subset of origin metadata that MAY appear on the public surface (e.g. coarse `source_kind`). Distinct from audit-only provenance. |

```
artifact record  ──projection──▶  PUBLIC (web HTML / API JSON / markdown)
       │
       └── sidecar (audit-only: origin_ref, origin_version)  ──▶  NEVER public  (test-enforced)
```

---

## 5. Unpublish, redaction & tombstone

| Term | Definition |
|------|------------|
| **Redaction** | Removing or masking content that must no longer be exposed (e.g. after a boundary change). Part of the publish policy; applied through the gate, not ad hoc. |
| **Unpublish** | Withdrawing a previously published artifact from the public surfaces. |
| **Tombstone** | The durable marker left when an artifact/version is unpublished or redacted. The public surface serves a **HTTP 410 Gone** tombstone for that address — the address is not silently reused or 404'd. See [ADR-0005](../01-decisions/) / [ADR-0003](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md). |
| **Generated/unverified content** | LLM- or pipeline-generated material that has not been validated upstream. **NEVER published** — proposals only, pending curator + source + boundary. |

---

## 6. Versioning & immutability

| Term | Definition |
|------|------------|
| **semver** | Semantic version (`MAJOR.MINOR.PATCH`) that is the artifact's **public addressable identity**. The web/API URL for a version embeds its semver. |
| **content-digest** | A content hash serving as the **immutability proof** of a version — detects/forbids silent edits to a frozen version. |
| **Immutable version** | A published `(slug, semver)` pair is **frozen forever**: its content never changes. An edit produces a **new** version, never a mutation of the old one. |
| **Frozen** | State of any published version: addressable indefinitely, byte-stable (verified by content-digest). |
| **Edit = new version** | The only way to change published content is to publish a higher semver; old versions remain addressable. Boundary changes use deprecate/unpublish/redact (§5) rather than edit. |

Storage layout (see [ADR-0005](../01-decisions/)):
```
src/content/{tips,skills,workflows,playbooks}/<slug>/<semver>.md(x)
# audit-only fields => sidecar (never in the served file)
```

---

## 7. Surfaces, distribution formats & API

CAW-04 is **three surfaces over ONE product core**, each implemented as a **PublishSinkAdapter** (§9). See
[ADR-0001](../01-decisions/) (surface) and [ADR-0007](../01-decisions/) (API design).

| Term | Definition |
|------|------------|
| **Website** | Public **HTML** surface for human browsing/reading. |
| **REST API** | Public, **read-only** programmatic surface for agents/MCP. **Prebuilt as static JSON + raw markdown** by the same build (web/API parity from one source). |
| **Preview/admin surface** | Internal surface for the curator publish gate (preview + approval). Not public. |
| **Canonical resource** | Exactly **one** authoritative resource per artifact, offered in HTML / markdown / JSON representations. |
| **`SKILL.md`** | The human/agent-readable distribution file for a Skill. |
| **`manifest.json`** | The machine-readable companion describing a Skill's metadata for distribution. |
| **`index.json`** | The top-level **manifest** enumerating published artifacts (the API's discovery entry point). |
| **MCP resources view** | A representation of published artifacts exposed as **MCP resources** so agents can list/read them through the Model Context Protocol. |
| **Web/API parity** | Property that HTML, markdown, and JSON are generated from one source in one build, so they cannot diverge. |

Deferred (NOT in v1, per ADR-0007): runtime search; `Accept`-header content negotiation.

---

## 8. Web stack & build

| Term | Definition |
|------|------------|
| **Astro** | The web framework (Astro 5) used to build the site/API. See [ADR-0006](../01-decisions/). |
| **Starlight** | The Astro documentation framework providing the site's docs/reading UI. |
| **SSG (static site generation)** | Build mode producing a **static** output artifact at build time — no server-side runtime fetching internal stores. The basis of "public-safe by construction" (§3). |
| **content-from-git** | The build sources content from CAW-04's own git content repo (§ storage), not a live database. |
| **Content collection** | Astro's typed grouping of content files (`tips`, `skills`, `workflows`, `playbooks`) under `src/content/`, schema-validated at build. |
| **Static artifact** | The frozen, vetted output of the SSG build, deployed behind the SiteAndApi sink. No live path to internal stores. |

---

## 9. Ports, adapters & import

Hexagonal core with **two ports** and a config-driven registry. See [ADR-0004](../01-decisions/).

| Term | Definition |
|------|------------|
| **Port** | A stable interface on the core's boundary. CAW-04 has exactly two: `ContentSourceAdapter` (in) and `PublishSinkAdapter` (out). |
| **Adapter** | A concrete implementation of a port for a specific source or sink. |
| **Registry** | Config-driven wiring that selects which adapters are active. Enables plugging in future sources/sinks without redesign. |
| **ContentSourceAdapter** | The **inbound** port: imports candidate content. v1 adapters: **CAW-02** (validated knowledge) and **CAW-03 / skills-registry** (validated Skills/Workflows/Playbooks). Documented stubs: internal wiki, curated bundle. |
| **PublishSinkAdapter** | The **outbound** port: publishes vetted artifacts. v1 adapter: **SiteAndApi** (website build + REST API). Documented stubs: external docs host, package registry, syndication. |
| **Stub** | A documented, not-yet-built adapter placeholder proving the seam exists for a future source/sink. |
| **Import re-check** | The **public-safe RE-CHECK performed in the CORE** (NOT in adapters) on every imported candidate. Upstream boundary claims are **evidence only**; the core re-validates deny-by-default. Content is written to the git store by the ContentSource **after** this re-check passes. |
| **Evidence-only** | Status of an upstream boundary claim: it informs but never authorizes publication; the core's re-check decides. |

```
CAW-02 / CAW-03 ─▶ ContentSourceAdapter ─▶ [ CORE: import re-check (deny-by-default, public-safe) ]
                                                     │ pass + curator approval
                                                     ▼
                              git content store ─▶ Astro SSG ─▶ PublishSinkAdapter(SiteAndApi) ─▶ Web + API + MCP
```

---

## 10. Cross-product boundary terms

CAW-02 and CAW-03 are **separate, independent products** (BRIEF §1, DOC-CONVENTIONS §4). CAW-04 references them
only across **import/export boundaries** — never as a shared store, registry, or substrate.

| Term | Definition |
|------|------------|
| **CAW-02** | A separate product: the validated **knowledge** repository. An import source, not a shared store. |
| **CAW-03** | A separate product: the **skills harness / skills registry**. An import source, not a shared store. |
| **Import boundary** | The explicit seam an upstream candidate crosses into CAW-04, where the core re-check applies. |
| **Export** | CAW-04's outputs to the world: the public website + REST API (+ MCP view). |

---

## Open Questions

Track in [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md):
- TODO(open-question: exact enumerated values + ordering of the SafetyBoundary scale beyond `public-safe`).
- TODO(open-question: precise public-vs-sidecar field list for `provenance` — confirm against ADR-0002 final schema).
- TODO(open-question: canonical content-digest algorithm and where the digest is recorded/verified).
- TODO(open-question: tombstone retention policy — how long 410s are served).

## Implications for runbooks

- Runbooks MUST use these exact term names (DOC-CONVENTIONS §7); link this glossary on first use of a load-bearing term.
- Any runbook touching serialization MUST assert the **public-projection split** (sidecar never serialized) with a test.
- Any runbook touching versioning MUST treat published `(slug, semver)` as frozen and enforce content-digest immutability.
