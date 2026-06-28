# PRODUCT BRIEF — AI Tips / Skills Website & REST API (CAW-04)

> Single source of truth for **CAW-04**. Every design doc + runbook must stay consistent with this brief.
> If a doc contradicts the brief, the brief wins. Capture unknowns in `08-research-plan/open-questions.md`.

## 0. The one hard constraint
We are NOT building the product here. We write the detailed design + build instructions (runbooks) an AI builder
executes — concrete features, methodology, named tools, tool-specific runbooks. The builder writes the code.

## 1. Identity & independence
- **Product:** AI Tips / Skills Website & REST API (CAW-04).
- **One-liner:** the **public read/API surface** that publishes **validated** AI-use tips, skills, workflows, and
  reusable operating patterns — not random prompt snippets.
- **Independent, standalone product** in the `ai-workbench` family of 6. Own core, data, deploy. **No shared
  runtime substrate.** It **imports** validated content across explicit boundaries (CAW-02 knowledge, CAW-03 /
  skills registry) and **publishes** a website + REST API.
- **Position:** the **final publishing/read layer**. It must not invent content — it publishes what the internal
  substrate has already validated. (Designed now; content goes live once validated entries exist upstream.)

## 2. Problem & value
- **Problem:** validated AI-use practice is trapped internally; ad-hoc sharing leaks confidential know-how or
  publishes unverified snippets.
- **Unit of value:** one **published, versioned, public-safe artifact** (a Tip / Skill / Workflow / Playbook)
  with provenance + a safety boundary, served over web + API.
- **Why separate:** publishing has its own concerns (public-safe gating, versioning, web/API delivery, audit) that
  should not live inside the internal products.

## 3. Users & top use cases
- **Personas:** external readers (web/API consumers), internal curator (Jimmy) who approves publication, AI agents
  that fetch skills/workflows via the API.
- **Top use cases:**
  1. Import a validated Skill/Workflow from CAW-02/CAW-03 → **public-safe gate** → publish (versioned).
  2. A reader browses the website; an agent fetches the same content via REST (markdown or JSON).
  3. Update a published item → new **Version**; old versions remain addressable.
  4. Unpublish / redact an item if its boundary changes.
  5. Audit: every published item traces to its validated internal source + safety review.

## 4. Product surface(s)
- **Primary:** a **public website** (browse/read) + a **REST API** (programmatic read). Content served as
  **markdown and/or JSON** (decide in ADR).
- **Secondary:** an internal **preview/admin** surface for the publish gate (curator approval).
- One product core behind all surfaces; no shared substrate with other products.

## 5. Core domain (the heart)
- **Entities:** `Tip, Skill, Workflow, Playbook, Example, Source, SafetyBoundary, Version`.
- **Reusable + auditable metadata:** each Skill/Workflow carries enough metadata to be reused and audited
  (inputs/outputs, preconditions, provenance, safety boundary, version).
- **Publish gate:** nothing is published without (a) a validated internal source and (b) a **public-safe** safety
  boundary. *Unverified or company-confidential know-how is never published.*
- **Versioning:** content is versioned; published versions are immutable + addressable.

## 6. Data
- CAW-04's OWN content store. Direction: **markdown/MDX-first (git) as source of truth** for published content +
  an index for the API (consistent with the family); large assets by path. Decide in ADR.
- Every item carries `boundary` (public only, for published) + provenance (internal source ref) + version.

## 7. Import / export boundaries (to other independent products)
- **Imports from CAW-02:** validated knowledge (cited tips/insights) as candidate content.
- **Imports from CAW-03 / a skills registry:** validated Skills/Workflows/Playbooks.
- **Exports:** the public website + REST API (read surface for the world / other agents).
- All imports cross a boundary with a **public-safe re-check** (never trust upstream boundary blindly).

## 8. Open integration interfaces (design the seams; build only v1)
Build as ports & adapters so future sources/sinks plug in without redesign:
- **ContentSourceAdapter:** v1 = CAW-02 import, CAW-03/skills-registry import; future stubs = internal wiki,
  arbitrary curated bundle.
- **PublishSinkAdapter:** v1 = the website build + REST API; future stubs = external docs host, package registry,
  syndication.
- Config-driven registry + documented stubs (same pattern as CAW-03).

## 9. Decisions to make (each gets an ADR)
- Product surface (website + REST API + preview/admin) and content delivery (markdown vs JSON vs both).
- Content model (Tip/Skill/Workflow/Playbook/Example/Source/SafetyBoundary/Version) + reusable/auditable metadata.
- **Publishing policy & public-safe boundary** (internal-only vs public-safe; the publish gate). ← load-bearing
- Import (ContentSource) + the public-safe re-check; ports & adapters.
- Storage (md/MDX-first vs DB) + versioning model.
- Web stack + API stack.

## 10. Non-goals (v1)
- Authoring content from scratch (CAW-04 publishes validated upstream content, not original know-how).
- Publishing anything unverified or above public boundary.
- User accounts / write API for the public (read-only public surface; curator-only publish).
- Becoming the knowledge repo (CAW-02) or the skills harness (CAW-03).
- Going live before validated upstream entries exist (design now; publish later).

## 11. Guardrails (inherited, all products)
- No confidential company data in public-facing outputs; **public outputs from public-safe sources only** (this is the public surface — most critical here).
- Never conflate public-source research with internal Samsung/SAIT claims.
- Keep sources, claims, evidence, and generated conclusions separate; generated summaries are not evidence.
- Prefer small vertical slices over broad scaffolding.
- Automatic generation is proposal generation; Jimmy approves every publish.
