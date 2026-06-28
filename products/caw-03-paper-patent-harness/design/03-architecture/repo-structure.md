# Repo Structure — CAW-03

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [component-boundaries.md](./component-boundaries.md), [tech-stack.md](./tech-stack.md), [../10-runbooks/phase-0-foundations/RB-000-repo-scaffold.md](../10-runbooks/phase-0-foundations/RB-000-repo-scaffold.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

The harness's own code layout the runbooks build into.

## Directory tree

```
caw-03-harness/
├─ package.json
├─ src/
│  ├─ core/                      # harness core — depends only on ports
│  │  ├─ ops/                    # op-manifest implementations (import_bundle, gate_claims, …)
│  │  ├─ gate/                   # evidence gate (type-specific, profile-configurable)
│  │  ├─ ledger/                 # claim ledger (refs to CAW-02)
│  │  ├─ assembly/               # engine-neutral input assembly
│  │  ├─ orchestration/          # draft run lifecycle (subprocess)
│  │  ├─ patent/                 # patent path + patent-first interlock
│  │  ├─ novelty/                # novelty + paper ladder
│  │  ├─ review/                 # review checklist
│  │  ├─ publish/                # publish + confidentiality + interlock enforcement
│  │  ├─ registry/               # adapter registry + capability preflight
│  │  └─ store/                  # governance data (file/SQLite)
│  ├─ ports/                     # the 5 typed port interfaces + value objects
│  ├─ adapters/
│  │  ├─ source/                 # v1: caw02-bundle, caw01-results | stubs: wiki, exp-server
│  │  ├─ writing-engine/         # v1: paperorchestra | stubs: other engines
│  │  ├─ patent-engine/          # v1: baseline | stubs: external patent tools
│  │  ├─ sink/                   # v1: latex-pdf | stubs: wiki-publish, venue, patent-filing
│  │  └─ novelty/                # v1: citation-pool + caw05 | stubs: live prior-art
│  └─ surfaces/                  # api, mcp, cli, ui (thin)
├─ config/                       # adapter selection + profiles (gate profiles, confidentiality)
├─ workspace/                    # PaperOrchestra subprocess working dir (gitignored)
├─ artifacts/                    # produced PDFs/patent drafts by path (gitignored)
└─ migrations/                   # SQLite governance schema
```

## Conventions

- `core` imports only `ports`; `adapters/*` import only `ports`; surfaces import the core's op API.
- Each adapter folder has v1 implementations and **documented stubs** side by side (stub = interface + not-implemented + config example).
- `workspace/` and `artifacts/` are gitignored; governance data + config are tracked.

## Open questions

Adapter discovery mechanism (entry-point groups vs config manifest) — [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks

[RB-000](../10-runbooks/phase-0-foundations/RB-000-repo-scaffold.md) scaffolds exactly this tree with empty ports +
fakes + lint/CI before any adapter.
