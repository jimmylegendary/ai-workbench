# CAW-02 — Team/Personal Knowledge Repository

An **independent, standalone product** in the `ai-workbench` family of 6 (no shared runtime substrate).

CAW-02 is a **provenance-preserving knowledge store**: it lets Jimmy, the team, and AI agents **append, retrieve,
and reuse** technical knowledge with strict integrity — raw **Source** → extracted **Claim** → **Evidence** →
cited **Note** — where *a generated summary is never evidence*.

- **v0 = append + retrieve + skill-wrap** (NOT continual learning).
- **Source of truth = markdown files in git**; a SQLite index is derived and disposable.
- Surfaces: a typed **API + MCP + CLI** (the agent skill interface) and an optional read-only viewer.
- Interacts with other products only via **import/export boundaries**: imports CAW-01 simulation projections and
  CAW-05 radar signals; exports cited claim+evidence bundles to CAW-03. Never a shared store.

## Design

The full design set (what & why + the AI-builder runbooks) lives under [`design/`](./design/):

- Start at [`design/README.md`](./design/README.md).
- Korean mirror: `design/korean/` (added after the English set).

## Status

Design complete (draft). Implementation is performed by an AI builder following [`design/10-runbooks/`](./design/10-runbooks/).
