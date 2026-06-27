# Repo Structure — code + content layout

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./data-flow.md](./data-flow_ko.md)
  - [./tech-stack.md](./tech-stack_ko.md)
  - [../01-decisions/ADR-0001-product-surface-and-skill-interface.md](../01-decisions/ADR-0001-product-surface-and-skill-interface_ko.md)
  - [../01-decisions/ADR-0002-storage.md](../01-decisions/ADR-0002-storage_ko.md)
  - [../01-decisions/ADR-0003-knowledge-data-model.md](../01-decisions/ADR-0003-knowledge-data-model_ko.md)
  - [../01-decisions/ADR-0006-retrieval.md](../01-decisions/ADR-0006-retrieval_ko.md)
  - [../01-decisions/ADR-0007-import-export-contracts.md](../01-decisions/ADR-0007-import-export-contracts_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF_ko.md

## Purpose
이 문서는 **출시 제품으로서의 CAW-02의 디스크상 레이아웃**을 확정한다: `knowledge/` 콘텐츠 트리(markdown-in-git source of truth), `_events/` 원장, `src/` core + 얇은 adapter + reindex, 그리고 migration. ADR-0002(스토리지), ADR-0001(단일 core, 얇은 adapter), ADR-0003(엔티티 집합)을 구현한다. 이 문서는 필드 수준의 frontmatter schema(ADR-0003)나 wire 포맷(ADR-0007)을 정의하지 **않는다** — 그것들을 배치할 뿐이다.

## 최상위 레이아웃
두 가지 관심사가 나란히 존재하며 의도적으로 분리 가능하다: **콘텐츠**(`knowledge/`, source of truth, git으로 버전 관리)와 **코드**(`src/` 등, 폐기 가능한 index와 그 위의 표면을 빌드).

```
caw-02-knowledge-repository/
├── knowledge/                 # SOURCE OF TRUTH — markdown-in-git (ADR-0002)
├── design/                    # this design corpus (briefs, ADRs, architecture, runbooks)
├── src/                       # the product code (TS): core + adapters + reindex
├── migrations/                # numbered SQL: core (portable) + FTS/vector (droppable)
├── manifest/                  # the single op manifest the adapters are codegen'd from
├── schemas/                   # boundary envelope + frontmatter zod schemas
├── scripts/                   # operational scripts (reindex CLI entry, audits)
├── tests/                     # unit + invariant + portability-lint + golden-reindex tests
├── .index/                    # DERIVED, DISPOSABLE — index.sqlite (gitignored)
├── var/                       # runtime: quarantine/, vault/, exports/ (gitignored as policy dictates)
├── package.json               # TS workspace (versions pinned per tech-stack.md TODOs)
└── README.md
```

근거: 깔끔한 분리는 `knowledge/`를 코드와 독립적으로 clone, diff, audit할 수 있게 하고, index(`.index/`)를 언제든 삭제하고 재구축할 수 있게 한다(`reindex`). `var/`는 비-정규(non-canonical) 런타임 상태를 보유한다.

## `knowledge/` — 콘텐츠 (단일 source of truth)
엔티티당 하나의 `.md` = YAML frontmatter(머신 계약) + markdown body(사람용 노트). 디렉터리 == 엔티티 `kind`. 이 집합은 ADR-0003 엔티티 집합을 정확히 미러링한다.

```
knowledge/
├── sources/            # Source            (raw source: file/URI/DOI; content_hash, boundary)
├── claims/             # Claim             (must point to >=1 Evidence — the invariant)
├── evidence/           # Evidence          (extracted_from a concrete artifact; never prose)
├── notes/              # Note              (generated=true, cites claims; NEVER evidence)
├── concepts/           # Concept           (topical nodes; "poor-man's semantics" for FTS)
├── interests/          # Interest          (curator/team interest areas)
├── decisions/          # Decision          (recorded decisions linked to evidence)
├── open-questions/     # OpenQuestion      (incl. auto-raised on a refuting threat)
├── assumptions/        # Assumption        (stated assumptions linked to claims)
├── signals/            # RelatedWork / RadarSignal  (CAW-05 intake, typed — not loose summaries)
└── _events/            # append-only ledger (see below) — mirrors every skill-wrap write
```

import된 artifact 참조 `Trace`, `SimulationRun`, `Experiment`(ADR-0003)는 `evidence/` 엔티티로부터 **URI로 참조**되며, 물리적으로 `var/vault/`에 복사된다(content-addressed) — 여기서 실행되는 것이 아니라 목록화(catalogue)된다(brief §5).

### 엔티티 파일 명명과 형태
```
knowledge/claims/<id>.md
---
id: clm_2026... # TODO(open-question: ID scheme — content-hash vs sequential slug, ADR-0002)
kind: claim
boundary: internal        # public | internal | confidential   (default-deny)
visibility: team          # team | private                      (default-private)
trust: T1                 # T0..T3 | contested  (DERIVED, never caller-set; AI capped T2)
claim_type: empirical
status: accepted          # proposed | accepted | needs_evidence | rejected
supersedes: null          # append-only edits set this to the prior id
content_hash: sha256:...  # staleness check for the derived index
created_by: agent:extractor@v1
created_at: <RFC3339>
# edges live in a generic typed set; see ADR-0003 (one edge table, graph-upgrade-ready)
edges:
  - { rel: supports, dst: ev_... }   # >=1 required — the Claim->Evidence invariant
  - { rel: about_concept, dst: cpt_... }
---
Human-readable claim note (markdown body).
```

### `_events/` — append-only 원장
```
knowledge/_events/
└── <ts>-<op>.jsonl     # e.g. 2026...-attach_evidence.jsonl
```
모든 skill-wrap write는 한 줄을 append한다: `{seq, ts, op, node_id, actor, payload}`. 이것은 git history(서명된 commit/blame)와 나란히 존재하는 두 번째 append-only audit 원장이다. 이는 **콘텐츠**이며 git으로 버전 관리된다 — 결코 gitignore되지 않는다. `reindex`는 이를 replay하여 `event` 테이블을 재구축한다.

## `src/` — 코드 (단일 core, 얇은 adapter)
트랜잭션 core가 모든 로직을 소유한다. adapter는 얇으며 `manifest/`로부터 **codegen**된다(ADR-0001).

```
src/
├── core/                       # the ONE transactional product core
│   ├── ops/                    # one module per kr.* op (add_source, attach_evidence, search, ...)
│   ├── validate/               # frontmatter schema check (invariant layer 1)
│   ├── invariant/              # Claim->Evidence enforcement (layer 2; reindex re-check = layer 3)
│   ├── evidence-gate/          # artifact_ref must resolve; no prose field (ADR-0004)
│   ├── boundary/               # monotone boundary/visibility propagation (ADR-0004)
│   ├── trust/                  # derived T0..T3 + contested ladder; AI-cap T2
│   ├── audit/                  # _events append + git-commit driver (signed)
│   ├── store/                  # file read/write (gray-matter + yaml); write-order tx (ADR-0002 §6)
│   └── retrieval/              # FTS5 query + structured filter + chain hydration (ADR-0006)
│
├── index/                      # the DERIVED SQLite index layer
│   ├── schema/                 # portable-subset table defs (node, edge, event)
│   ├── reindex/                # deterministic, idempotent rebuild from knowledge/** (the safety net)
│   └── query/                  # portable SQL (recursive CTE traversal; SQLite==Postgres)
│
├── adapters/                   # THIN, codegen'd — add NO logic (ADR-0001)
│   ├── api/                    # HTTP adapter
│   ├── mcp/                    # MCP server (primary agent surface)
│   ├── cli/                    # CLI (humans + scripts; reindex, import/export, audits)
│   └── viewer/                 # optional read-only viewer over search()
│
├── boundary-io/                # import/export over file/API boundaries (ADR-0007)
│   ├── envelope/               # versioned envelope validator + semver gate
│   ├── redact/                 # re-redaction ruleset (import AND export)
│   ├── import-caw01/           # projection -> Evidence (quarantine, vault copy, kind-based trust)
│   ├── import-caw05/           # signal -> Source/Claim/RelatedWork/OpenQuestion (raw_summary != evidence)
│   └── export-caw03/           # fail-closed cited Claim+Evidence bundle (sign + digest)
│
└── codegen/                    # manifest -> adapters + JSON Schema generator
```

참고: `import-*`/`export-*`는 **검증된 `kr.*` skill op**(`kr.import_projection`, `kr.export_bundle`)로도 노출된다 — `boundary-io/`는 경계 메커니즘을 보유하지만, 모든 write는 `core/`를 거쳐 라우팅되므로 강제를 우회하는 raw 경로가 없다(ADR-0007 §6).

## `manifest/`과 `schemas/`
```
manifest/
└── ops.ts                  # the single op manifest: each kr.* op (zod in/out + metadata)

schemas/
├── frontmatter/            # zod schema per entity kind (invariant layer 1 contract)
└── boundary/               # envelope + payload schemas CAW-02 owns (ADR-0007; no shared registry)
```

## `migrations/`
FTS와 vector는 격리되어 있어 retrieval 선택이 portability를 결코 위협하지 않는다(ADR-0002 §3, ADR-0006).
```
migrations/
├── 0001_core.sql           # node, edge, event (PORTABLE subset: TEXT/INTEGER/TIMESTAMP, FK, CHECK)
├── 0002_fts.sql            # FTS5 virtual table + filter columns  (DROPPABLE)
└── 0003_vec.sql.reserved   # nullable node_vec sidecar — RESERVED, UNUSED in v0  (DROPPABLE)
```

## `var/` — 런타임, 비-정규
```
var/
├── quarantine/   # imports land here first; promoted to knowledge/ only after checks pass (ADR-0007)
├── vault/        # content-addressed copies of large imported artifacts (referenced by URI)
└── exports/      # signed bundles emitted to CAW-03 (CAW-02 emits; CAW-03 pulls)
```

## 정규(canonical) vs 도출(derived) — 핵심을 떠받치는 구분
| Path | Canonical? | In git? | Rebuildable? |
|---|---|---|---|
| `knowledge/**/*.md` | **Yes (SoT)** | Yes | No — 그것이 진실 그 자체 |
| `knowledge/_events/*.jsonl` | **Yes (ledger)** | Yes | Append-only; 재구축 안 함 |
| `.index/index.sqlite` | No (derived) | No (gitignored) | **Yes — `reindex`** |
| `var/vault/**` | 참조 복사본 | 정책 의존적 | Re-importable |
| `var/quarantine`, `var/exports` | No (transient) | No | 재생성됨 |

## Open Questions
- `TODO(open-question: ID scheme — content-addressed hash vs sequential slug, ADR-0002)`
- `TODO(open-question: monorepo tool / workspace layout for src subpackages, tech-stack.md)`
- `TODO(open-question: should var/vault be committed (LFS) or kept external; boundary/size tradeoff)`
- [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md)를 참고하라.

## 런북에 대한 함의
- **scaffold RB**는 이 트리를 생성한다(콘텐츠 디렉터리 + `src/` 스켈레톤 + `migrations/`)를 green 상태로 둔다.
- **reindex RB**는 `src/index/reindex/`에 위치하며 `knowledge/**`로부터 바이트 단위 동일 재구축을 증명한다.
- Ingest/skill-wrap RB는 `core/store/` + `core/audit/`에서 write 순서 트랜잭션을 구현한다.
- Boundary RB는 quarantine→`var/vault/`→`knowledge/` 승격과 fail-closed export를 갖춘 `boundary-io/`를 구현한다.
