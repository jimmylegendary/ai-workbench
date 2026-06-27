# Data Flow — write, retrieve, import/export

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./tech-stack.md](./tech-stack_ko.md)
  - [./repo-structure.md](./repo-structure_ko.md)
  - [../01-decisions/ADR-0001-product-surface-and-skill-interface.md](../01-decisions/ADR-0001-product-surface-and-skill-interface_ko.md)
  - [../01-decisions/ADR-0002-storage.md](../01-decisions/ADR-0002-storage_ko.md)
  - [../01-decisions/ADR-0005-ingestion-pipeline.md](../01-decisions/ADR-0005-ingestion-pipeline_ko.md)
  - [../01-decisions/ADR-0006-retrieval.md](../01-decisions/ADR-0006-retrieval_ko.md)
  - [../01-decisions/ADR-0007-import-export-contracts.md](../01-decisions/ADR-0007-import-export-contracts_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF_ko.md

## Purpose
이 문서는 CAW-02의 단일 트랜잭션 core를 통과하는 **런타임 데이터 흐름**을 추적한다: (1) skill-wrap **write** (파일 write → `_events` append → reindex), (2) **retrieval** (FTS + 필터 → provenance 하이드레이션 → citation), (3) **import/export** (quarantine→redact→map→nodes / select→redact→sign→bundle). ADR 결정들이 런타임에 어떻게 조합되는지 보여준다. 이 문서는 스토리지 레이아웃(ADR-0002), 엔티티/edge 모델(ADR-0003), wire 포맷(ADR-0007)을 재결정하지 **않는다** — 그것들을 순서대로 배열할 뿐이다. ASCII 시퀀스는 순서에 대해 규범적(normative)이며, 필드 목록은 예시이고 ADR을 따른다.

## 모든 흐름이 공유하는 actor 및 컴포넌트
| Component | Role |
|---|---|
| **Adapter** (API / MCP / CLI) | 얇으며 op manifest로부터 codegen됨. 요청을 파싱하고, 하나의 core op를 호출하며, 결과를 반환한다. 로직을 추가하지 않는다(ADR-0001). |
| **Core (skill-wrap)** | 유일한 트랜잭션 소유자: 검증, evidence gate, trust recompute, boundary 전파, audit append. 모든 표면이 여기로 라우팅된다. |
| **Files** | `knowledge/**/*.md` — 단일 source of truth (ADR-0002). |
| **`_events`** | Append-only `knowledge/_events/<ts>-<op>.jsonl` 원장(ledger), 모든 write를 미러링한다. |
| **Index** | 도출되며 폐기 가능한 SQLite: `node`, `edge`, `event`, FTS5, 예약된 `node_vec`. `reindex`로 재구축 가능. |
| **git** | 서명된 commit / blame = 두 번째 append-only audit 원장. |

황금률(ADR-0002 §6 write 순서): **file → index → `_events` → validate → commit**; 검증 실패는 **전체 트랜잭션을 abort**한다(고아(orphan) 파일/row/event 없음).

---

## Flow 1 — Skill-wrap write (예: `kr.attach_evidence`)
write는 append-only + supersedes다(update/delete 없음). agent의 write는 기본적으로 confirmation을 거친다(ADR-0001).

```
Caller (human/agent)
   │  op + payload (e.g. attach_evidence{claim_id, artifact_ref, stance})
   ▼
┌──────────┐  validated request   ┌───────────────────────────────────────────┐
│ Adapter  │ ───────────────────► │ CORE (skill-wrap, single transaction)       │
│ API/MCP/ │                      │                                             │
│  CLI     │ ◄─── confirm? ─────► │ 0. authz + confirmation gate (agent=ask)    │
└──────────┘   (agent default)    │ 1. SCHEMA validate frontmatter contract     │
                                  │ 2. EVIDENCE GATE: artifact_ref MUST resolve │
                                  │    to a real artifact; NO prose field       │
                                  │ 3. boundary/visibility MONOTONE propagate   │
                                  │ 4. trust recompute (T0..T3, AI-capped T2)   │
                                  │ 5. INVARIANT: every claim has >=1 supports  │
                                  │    edge to evidence  (layer 2 of 3)         │
                                  └───────────────┬─────────────────────────────┘
                                                  │ all checks pass
        ┌─────────────────────────────────────────┼───────────────────────────┐
        ▼ (a) write file                           ▼ (b) mirror index           ▼ (c) append event
  knowledge/evidence/<id>.md             node/edge upsert in SQLite     _events/<ts>-attach_evidence.jsonl
  (YAML frontmatter + body)              (content_hash recorded)        (op, node_id, payload, actor)
        │                                          │                           │
        └───────────────────────┬──────────────────┴───────────────────────────┘
                                 ▼ (d) post-write re-validate (layer 3: reindex re-check semantics)
                                 ▼ (e) git commit (signed)  ── COMMIT POINT ──
                                 ▼ failure at ANY step before (e) → ROLLBACK: discard file/rows/event
                                 ▼
                          Adapter ◄── {id, status, trust, boundary}  ──► Caller
```

### Notes
- **Append-only + supersedes:** "편집"은 `supersedes: <old_id>`를 가진 새 `.md`를 write한다. 기존 파일은 결코 변경되거나 삭제되지 않으므로, git blame과 `_events`는 충실한 원장으로 유지된다.
- **3계층 불변식(ADR-0003):** (1) frontmatter schema가 잘못된 형식의 계약을 거부; (2) core validator가 write 시점에 Claim→Evidence를 강제; (3) `reindex`가 파일로부터 동일한 규칙을 재검사 — SQLite/Postgres에서 동일. write 흐름은 layer 1–2를 수행하고, 흐름에 인접한 `reindex`가 layer 3을 수행한다.
- **Evidence gate(ADR-0004):** `attach_evidence`에는 prose 필드가 없다. `Note`/summary는 결코 `artifact_ref`가 될 수 없다. `artifact_ref`가 resolve되지 않으면 claim은 `needs_evidence`로 남고 결코 자동 승격되지 않는다.
- **Trust는 도출되며 결코 호출자가 설정하지 않는다:** 호출자는 `trust`를 전달할 수 없다. core가 이를 재계산한다(AI-authored은 T2로 상한). accepted claim에 도달한 `refutes` stance는 `OpenQuestion`을 자동으로 발생시킨다(ADR-0005 B5).

### reindex (안전망, ADR-0002)
`reindex`는 결정론적이고 멱등(idempotent)하다: SQLite 파일을 drop하고, `knowledge/**`를 순회하며, frontmatter를 재파싱하고, `node`/`edge`/`event`/FTS를 재구축하며, **Claim→Evidence 불변식을 재실행**한다. read 시 `content_hash` 불일치는 index가 오래되었음을 의미하므로 ⇒ 재구축한다. row는 결코 암묵적으로 신뢰되지 않는다.

```
reindex:  drop index.sqlite ─► scan knowledge/**/*.md ─► parse frontmatter ─► upsert node/edge
                            ─► replay _events for event table ─► build FTS5 ─► re-check invariant ─► fsync
result:   byte-identical query results vs prior good index (acceptance check)
```

---

## Flow 2 — Retrieval (`kr.search`)
Boundary/scope 필터는 랭킹 **이전에** 실행되므로 confidential 항목이 누출될 수 없다(ADR-0006 §2). 결과는 하이드레이션된 provenance 체인을 담는다. RAG는 citation 제약을 받는다.

```
Caller ──► Adapter ──► CORE.search(query, filters{boundary,visibility,kind,concept,trust})
                              │
                              ▼ 1. STRUCTURED FILTER (SQL WHERE) — applied BEFORE ranking
                              │      boundary <= caller_clearance AND visibility ok AND kind/concept/trust
                              ▼ 2. FTS5 BM25 rank over the filtered candidate set
                              ▼ 3. PROVENANCE HYDRATION via edge traversal (always on):
                              │      Source ──extracted_from──► Evidence ──supports──► Claim ──cites──► Note
                              ▼ 4. assemble RetrievalHit[] (chain + trust + boundary + locator + score)
                              │
            ┌─────────────────┴───────────────────────────┐
            ▼ default: return ranked hits (NO generation)  ▼ opt-in: citation-constrained synthesis
   RetrievalHit{item, chain,                       boundary filter FIRST → generate → every
     trust, boundary, scope,                       sentence cites >=1 evidence_id → uncited =>
     locator, score}                               flagged `unsupported`, never returned as fact
                                                   → kept synthesis stored as cited Note (generated=true),
                                                     NEVER as Evidence
            └─────────────────┬───────────────────────────┘
                              ▼
                       Adapter ──► Caller  (structured envelope, never an opaque string)
```

### Notes
- **v0에서는 embedding 없음**(ADR-0006). `node_vec` sidecar는 예약되어 있으나 사용되지 않는다. 측정된 trigger(A–D)가 발동될 때만 `sqlite-vec`/`pgvector`를 추가한다.
- retrieval은 명시적 "이 synthesis를 저장" 경로를 제외하고는 **상태를 결코 변경하지 않는다**. 그 경로는 **Flow 1**을 거쳐 다시 라우팅되어 cited `Note`를 영속화한다(따라서 저장된 답변조차 evidence gate를 따른다).
- `locator`는 evidence가 물리적으로 존재하는 위치(path/URI)를 가리키며, 독자가 LLM을 재실행하지 않고도 note→claim→evidence→source를 따라갈 수 있게 한다.

---

## Flow 3a — Import (CAW-01 projection / CAW-05 signal → nodes)
import 시 quarantine; producer의 주장과 무관하게 재-redact; node로 매핑; 생성된 summary를 결코 evidence로 신뢰하지 않음(ADR-0007). CAW-01/05는 **별개의 독립 제품**이다. 이것은 파일/API 경계이며 공유 store가 없다.

```
Foreign file (envelope.json / *.caw05.jsonl)   [from CAW-01 or CAW-05, separate products]
        │
        ▼ kr.import_projection / signal-intake (a vetted skill action — same checks as humans)
┌───────────────────────────────────────────────────────────────────────┐
│ 1. QUARANTINE: land in import quarantine; do NOT touch knowledge/ yet   │
│ 2. ENVELOPE VALIDATE: schema + semver (reject unknown MAJOR)            │
│ 3. SIGNATURE / payload_sha256 check; dedup by hash                      │
│ 4. CONFIDENTIALITY CHECK:                                               │
│      - boundary FLOOR: imported >= declared_boundary (clamp stricter)   │
│      - confidential-field scrub; jimmy-private never auto-shared        │
│      - RE-REDACT regardless of producer's redaction_applied            │
│      - leak scan (codename/fab/customer markers); internal-host URLs    │
│    indeterminate => keep in quarantine for curator, do NOT import       │
│ 5. VAULT COPY: content-addressed copy / stable URI CAW-02 controls      │
│ 6. MAP TO NODES (preserves invariant):                                  │
│      CAW-01 projection → Evidence (NEVER a Claim); curator writes claim │
│      CAW-05 signal     → Source (+ ClaimCandidate[]); raw_summary kept  │
│                          as kind=generated-summary, EXCLUDED as evidence│
│      classification threat|support → typed RelatedWork edge to Claim    │
│      threat on accepted Claim → auto-raise OpenQuestion + notify        │
└───────────────────────────────────┬───────────────────────────────────┘
                                     ▼ each mapped node flows through FLOW 1 (write order + invariant + audit)
                              knowledge/**/*.md  +  _events  +  index  +  git commit
```

---

## Flow 3b — Export (cited Claim+Evidence bundle → CAW-03)
monotone boundary 전파를 사용하는 fail-closed allow-list. CAW-02는 명시적 curator 행동에 따라 서명된 bundle을 **방출(emit)**하고, CAW-03이 이를 가져간다(pull). CAW-02는 결코 CAW-03에 write하지 않는다(ADR-0007 §4).

```
Curator: kr.export_bundle(claim_ids[], target_audience)
        │
        ▼
┌───────────────────────────────────────────────────────────────────────┐
│ 1. SELECT: resolve claims + their Evidence + cited Notes + bibliography │
│ 2. EVIDENCE CHECK: each Claim ships >=1 concrete Evidence;              │
│      a claim with no / only generated-summary evidence => REFUSED       │
│ 3. EFFECTIVE-BOUNDARY (monotone propagation, not row's own flag):       │
│      target_audience=public => DROP every entity whose effective        │
│      boundary != public; jimmy-private NEVER exported                   │
│ 4. REDACT SWEEP over text/locator/citation strings; conflation guard    │
│      (no fusing public Source + confidential projection as one evidence)│
│ 5. model-projection evidence keeps CI/unit (not presented as measure);  │
│      Notes tagged kind=synthesis, evidence=false                        │
│ 6. SIGN + provenance_digest over canonicalized payload                  │
│                                                                         │
│  ANY check indeterminate => item EXCLUDED.                              │
│  Empty bundle, OR an explicitly-requested confidential/jimmy-private    │
│  item in a public bundle => ABORT whole export + report offending ids.  │
└───────────────────────────────────┬───────────────────────────────────┘
                                     ▼
                       signed bundle file (envelope, boundary_kind=caw03-bundle)
                                     ▼  (CAW-03 pulls; CAW-02 logs a per-crossing audit entry)
```

### Notes
- 양방향 모두 **경계를 넘을 때마다 audit 로그 항목**을 write하고 동일한 envelope validator를 통과한다(ADR-0007 §1). 재-import는 `payload_sha256`으로 dedup한다.
- importer/exporter는 **검증된 skill action**(`kr.import_projection`, signal intake, `kr.export_bundle`)이다: 어떤 raw 경로도 confidentiality 강제를 우회하지 않는다(ADR-0007 §6) — 이들은 Flow 1의 write 순서와 audit을 재사용한다.

## Open Questions
- `TODO(open-question: confirmation-by-default UX for agent writes — per-op vs per-session; tracked in ADR-0001)`
- `TODO(open-question: how _events JSONL and git history reconcile if files are edited outside the skill interface — ADR-0002)`
- `TODO(open-question: signature scheme for export bundles — minisign/cosign/DSSE — ADR-0007)`
- [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md)를 참고하라.

## 런북에 대한 함의
- **write 순서** 시퀀스(file→index→`_events`→validate→commit, 실패 시 abort)는 모든 ingest/skill-wrap RB가 구현하는 계약이다. `reindex`는 그 안전망이자 acceptance check다(바이트 단위 동일 결과).
- **search** RB는 랭킹 이전 boundary/scope 필터 + 체인 하이드레이션을 거친 `RetrievalHit` envelope를 반환한다.
- Import/export RB는 quarantine→redact→map과 select→redact→sign→bundle을 fail-closed 동작으로 구현한다.
