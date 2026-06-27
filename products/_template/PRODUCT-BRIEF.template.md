# PRODUCT BRIEF — <Product name> (CAW-0X) — TEMPLATE

> Copy to `<product>/design/_meta/PRODUCT-BRIEF.md` and fill every `<…>`. This is the **single source of truth**;
> every design doc + runbook must stay consistent with it. If a doc contradicts this brief, the brief wins.
> Do not fabricate internal facts (esp. internal packages); capture unknowns in `08-research-plan/open-questions.md`.

## 0. The one hard constraint
We are NOT building the product here. We write the design + build instructions (runbooks) an AI builder executes.

## 1. Identity & independence
- **Product:** <name> (CAW-0X).
- **One-liner:** <what it is in one sentence>.
- This is an **independent, standalone product** in the `ai-workbench` family of 6. It has its OWN core, data,
  and deployment. **No shared runtime substrate** with other products. Cross-product use = import/export boundary.

## 2. Problem & value
- **Problem:** <the real problem this product solves>.
- **Unit of value:** <the atomic, repeatable thing it produces — the "one X -> Y" loop>.
- **Why now / why separate:** <why it's its own product, not a feature of another>.

## 3. Users & top use cases
- **Personas:** <who>.
- **Top use cases:** <3-6 concrete walkthroughs that define "it works">.

## 4. Product surface(s)
- **Primary surface:** <web app / API / MCP / CLI / pipeline>.
- **Secondary surfaces:** <…>. State the boundary between any UI and any backend/engine.

## 5. Core domain (the heart)
- <The core concepts, entities, and the central spec. This is what `05-<core>` elaborates.>

## 6. Data
- <The product's OWN data model + storage direction. Never a shared store. What is queryable vs blob vs file.>

## 7. Import / export boundaries (to other independent products)
- **Imports from:** <e.g. consumes exported artifacts from CAW-0Y> — as files/APIs across independent products.
- **Exports to:** <e.g. produces artifacts CAW-0Z can consume>.
- These are explicit boundaries — NOT a shared substrate/registry/DB.

## 8. Decisions to make (each gets an ADR)
- <ADR-0001 …>, <ADR-0002 …>, … (surface, data layer, core mechanism, interfaces, etc.)

## 9. Non-goals (v1)
- <what is explicitly out of scope; what is deferred but schema-anticipated>.

## 10. Guardrails (inherited, all products)
- No confidential company data in public-facing outputs.
- Never conflate public-source research with internal Samsung/SAIT claims.
- Keep sources, claims, evidence, and generated conclusions separate; generated summaries are not evidence.
- Prefer small vertical slices that prove workflow semantics over broad platform scaffolding.
- Automatic generation is proposal/update generation; Jimmy is the reviewer for strategic decisions.
