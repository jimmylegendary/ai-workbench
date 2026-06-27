# Company AI Workbench Monorepo

This repository hosts six **independent products** (CAW-01..06) under `products/`.

Each product is separately designed, implemented, and deployed. There is **no shared
runtime substrate**: products do not depend on a common database, UI, or service layer.
Any cross-product use happens through an explicit **export boundary** (one product
publishes an artifact another product can consume), not a shared platform.

## Products

- `products/caw-01-simulation-control-plane/` — standalone simulation control plane (real/synthetic/sim trace axes → memory-annotated IR → metrics → comparable projection). **Designed.**
- `products/caw-02-knowledge-repository/` — team/personal knowledge repository and skills. *Planned.*
- `products/caw-03-paper-patent-harness/` — harness-engineered agent for paper and patent writing. *Planned.*
- `products/caw-04-tips-skills-web-api/` — website and REST API for AI-use tips, skills, and workflows. *Planned.*
- `products/caw-05-trend-collection/` — periodic collection and synthesis of AI papers, articles, reports, and community trends. *Planned.*
- `products/caw-06-ai-future-ttt-research/` — automated technology collection and research on the future of AI, including TTT. *Planned.*

## Start Here

CAW-01 is the only product designed today. See its full design at
`products/caw-01-simulation-control-plane/design/README.md`.

## Program-Level Files

- `architecture.md` — program-level context (shared vocabulary: layer model, memory-annotated IR, trust ladder). Per-product architecture lives in each product's `design/`.
- `TODO.md` — top-level tracking across the six independent products.
</content>
</invoke>
