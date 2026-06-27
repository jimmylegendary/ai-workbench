# Design Set Structure (per independent product)

The standard `design/` layout every product follows. Sections are **adapted** per product: rename `05-*` to the
product's core domain, include `06-*` only if the product has that surface, and size the runbook phases to the
product. Keep the numeric prefixes so the set sorts and cross-links consistently.

## Standard layout

```
<product>/design/
├─ README.md                      # index for this product's design set
├─ _meta/
│  ├─ PRODUCT-BRIEF.md            # SINGLE SOURCE OF TRUTH (from PRODUCT-BRIEF.template.md)
│  ├─ DOC-CONVENTIONS.md          # copied from the template
│  └─ GLOSSARY.md                 # this product's ubiquitous language
├─ 00-overview/
│  ├─ vision.md                   # north star: what & why, the unit of value, first slice
│  ├─ scope-and-non-goals.md      # in-scope v1 vs explicit non-goals; import/export boundaries to other products
│  └─ personas-and-use-cases.md   # who it serves + concrete use-case walkthroughs
├─ 01-decisions/                  # ADR-XXXX-*.md (one decision each)
├─ 02-research/                   # grounding research behind the ADRs
├─ 03-architecture/
│  ├─ system-architecture.md      # containers + one-way dependency rule
│  ├─ component-boundaries.md     # module ownership + interfaces (signature level)
│  ├─ data-flow.md                # end-to-end flows (incl. import/export boundaries)
│  ├─ tech-stack.md               # chosen stack + version pins
│  └─ repo-structure.md           # the product's own code layout
├─ 04-data-layer/                 # data-model, storage-strategy, + product-specific data concerns
├─ 05-<core>/                     # THE product core domain (rename: e.g. 05-knowledge-core, 05-simulation-control-plane)
├─ 06-<interfaces>/               # UI / API / MCP / CLI surfaces as relevant (omit a surface the product lacks)
├─ 07-backend-api/                # the product's API contract + services
├─ 08-research-plan/              # research-plan, validation, open-questions (aggregated)
├─ 09-roadmap/                    # milestones-and-phases, dependency-graph, risks-and-mitigations
└─ 10-runbooks/                   # executable build plan, phase-0..N (AI-builder format)
   └─ phase-0-foundations/ ...    # one folder per phase
```

## Section purpose (quick reference)

- **_meta** — the truth (PRODUCT-BRIEF), the rules (DOC-CONVENTIONS), the vocabulary (GLOSSARY).
- **00-overview** — frames the product for a reviewer: vision / scope / personas+use-cases.
- **01-decisions** — opinionated ADRs; the durable "why".
- **02-research** — evidence behind the ADRs (real tools/options, decision-oriented).
- **03-architecture** — how the product is built, at the container/module level.
- **04-data-layer** — the product's OWN data model + storage (never a shared store).
- **05-<core>** — the heart: the product's core domain logic/spec.
- **06-<interfaces>** — the surfaces users/agents drive (web/API/MCP/CLI), as applicable.
- **07-backend-api** — the typed API contract + services behind the surfaces.
- **08-research-plan** — what must still be learned/validated; aggregated open questions.
- **09-roadmap** — phases (↔ runbooks), dependency DAG, risks.
- **10-runbooks** — the build plan an AI builder executes, phase by phase.

## Adapt rules

- A product with no rich UI (e.g. a knowledge repo, an automation pipeline) folds UI into `06-interfaces`
  (API/MCP/CLI + optional minimal viewer) and keeps `05-<core>` heavy.
- A product that is mostly automation may merge `06` into `07` and keep runbooks lean.
- Always keep: PRODUCT-BRIEF, ADRs, data-model, a core section, an API/interface section, research-plan,
  roadmap, and runbooks. Everything else is sized to the product.

## Korean mirror

After the English set is complete, mirror it under `<product>/design/korean/` with the same structure,
`*_ko.md` filenames, internal `.md` links rewritten to `_ko.md`, and code/identifiers kept in English.
