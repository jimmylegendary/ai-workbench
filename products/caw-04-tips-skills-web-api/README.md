# CAW-04 — AI Tips / Skills Website & REST API

An **independent, standalone product** in the `ai-workbench` family of 6 (no shared runtime substrate).

CAW-04 is the **public read/API publishing layer**: it publishes **validated, public-safe** AI-use tips, skills,
workflows, and playbooks — never random snippets, never confidential know-how. It is **public-safe by
construction**: a frozen, vetted static artifact (Astro 5 + Starlight, SSG) with no live code path to internal
stores.

- **Content:** Tip / Skill / Workflow / Playbook (+ Example / Source / SafetyBoundary / Version), markdown-in-git as source of truth, **semver + content-digest** immutable versions.
- **Publish gate:** deny-by-default; nothing publishes without a validated internal source **and** a public-safe boundary; curator approval mandatory. A **public-projection split** keeps audit-only provenance in a sidecar that never serializes.
- **Surfaces:** public website + read-only REST API (static JSON + raw markdown + `manifest.json`/`SKILL.md` + an MCP resources view) — web/API parity from one build.
- **Ports & adapters:** imports from CAW-02 (knowledge) and CAW-03/a skills registry via a core **public-safe re-check** (upstream boundary = evidence only); future connectors (internal wiki, external docs host, package registry, syndication) ship as documented stubs.

## Design

Full design set under [`design/`](./design/) — start at [`design/README.md`](./design/README.md). Korean mirror:
`design/korean/`.

## Status

Design complete (draft). Built by an AI builder following [`design/10-runbooks/`](./design/10-runbooks/). Goes live
once validated upstream entries exist.
