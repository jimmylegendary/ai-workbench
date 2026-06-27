# Independent Product Design Template

This folder is the **template for designing one independent product** in the `ai-workbench` monorepo.
Each product under `products/caw-0X-*/` is a **separate, standalone product** — its own core, data, and
deployment, with **no shared runtime substrate**. Cross-product use is always an explicit **export/import
boundary**, never a shared registry or database.

## What's here

| File | Purpose |
| --- | --- |
| [DESIGN-SET-STRUCTURE.md](./DESIGN-SET-STRUCTURE.md) | the standard `design/` folder layout + what each section is for + how to adapt it per product |
| [DOC-CONVENTIONS.md](./DOC-CONVENTIONS.md) | doc / ADR / runbook writing format (reused verbatim in every product) |
| [PRODUCT-BRIEF.template.md](./PRODUCT-BRIEF.template.md) | the per-product **single source of truth** skeleton — copy, fill, and place at `<product>/design/_meta/PRODUCT-BRIEF.md` |

## How to instantiate a new product

1. Create `products/caw-0X-<slug>/design/` with the section folders from [DESIGN-SET-STRUCTURE.md](./DESIGN-SET-STRUCTURE.md).
2. Copy `DOC-CONVENTIONS.md` to `<product>/design/_meta/DOC-CONVENTIONS.md`.
3. Copy `PRODUCT-BRIEF.template.md` to `<product>/design/_meta/PRODUCT-BRIEF.md` and fill it in — this is the
   authoritative vision every later doc must obey.
4. Generate the design set top-down: `_meta` → `00-overview` → `01-decisions` (ADRs) → `02-research` →
   `03..09` design docs → `10-runbooks`.
5. Add a Korean mirror under `<product>/design/korean/` (same structure, `*_ko.md`, internal links → `_ko.md`).
6. Add a one-line entry to [../README.md](../README.md) (the products index).

## Independence checklist (every product must pass)

- [ ] No `shared substrate`, shared registry, or shared DB with another product.
- [ ] The product runs / ships / deploys on its own.
- [ ] Any other-product interaction is an **export or import boundary** (files/APIs across independent products).
- [ ] The product's own `_meta/PRODUCT-BRIEF.md` is the single source of truth.
- [ ] Guardrails preserved: no confidential data in public outputs; never conflate public research with internal Samsung/SAIT claims.
