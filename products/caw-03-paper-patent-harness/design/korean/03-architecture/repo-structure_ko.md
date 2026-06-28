# 저장소 구조(Repo Structure) — CAW-03

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [component-boundaries.md](./component-boundaries_ko.md), [tech-stack.md](./tech-stack_ko.md), [../10-runbooks/phase-0-foundations/RB-000-repo-scaffold.md](../10-runbooks/phase-0-foundations/RB-000-repo-scaffold_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적

런북이 구축해 나가는 harness 자체의 코드 레이아웃.

## 디렉터리 트리

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

## 규약(Conventions)

- `core`는 오직 `ports`만 import한다. `adapters/*`도 오직 `ports`만 import한다. surfaces는 core의 op API를 import한다.
- 각 adapter 폴더에는 v1 구현과 **문서화된 stub**이 나란히 존재한다(stub = 인터페이스 + 미구현(not-implemented) + config 예시).
- `workspace/`와 `artifacts/`는 gitignore 대상이며, governance 데이터 + config는 추적(track)된다.

## 미해결 질문(Open questions)

Adapter 탐색(discovery) 메커니즘(entry-point group vs config manifest) — [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md).

## 런북에 대한 함의(Implications for runbooks)

[RB-000](../10-runbooks/phase-0-foundations/RB-000-repo-scaffold_ko.md)은 어떤 adapter보다 먼저 비어 있는 port + fake + lint/CI를 갖춘 이 트리를 정확히 스캐폴딩한다.
