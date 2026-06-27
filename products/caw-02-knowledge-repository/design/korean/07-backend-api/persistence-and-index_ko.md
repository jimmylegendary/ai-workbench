# Persistence & Index — md-git Repo, Reindex, Events Writer, Artifact Vault

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [./api-surface_ko.md](./api-surface_ko.md)
  - [./ingestion-service_ko.md](./ingestion-service_ko.md)
  - [./retrieval-service_ko.md](./retrieval-service_ko.md)
  - [../01-decisions/ADR-0002-storage_ko.md](../01-decisions/ADR-0002-storage_ko.md)
  - [../01-decisions/ADR-0003-knowledge-data-model_ko.md](../01-decisions/ADR-0003-knowledge-data-model_ko.md)
  - [../01-decisions/ADR-0004-provenance-and-trust_ko.md](../01-decisions/ADR-0004-provenance-and-trust_ko.md)
  - [../01-decisions/ADR-0006-retrieval_ko.md](../01-decisions/ADR-0006-retrieval_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF_ko.md

## Purpose
**코어 서비스들이 write를 거쳐 통과하는 persistence 계층**을 기술한다: markdown-in-git 파일 저장소(단일 진실의
원천), SQLite로의 결정론적 reindex(파생되고 폐기 가능한 index), append-only `_events` writer, 그리고
content-addressed artifact-by-path 저장소. ADR-0002를 부연하며 절대 재정의하지 않는다. 오퍼레이션 시그니처
([api-surface.md](./api-surface_ko.md) 참조), 파이프라인 동작([ingestion-service.md](./ingestion-service_ko.md)
참조), 또는 랭킹([retrieval-service.md](./retrieval-service_ko.md) 참조)은 정의하지 **않는다**.

## Layer model

```
                 ┌─────────────────────────────────────────────┐
core txn ──────▶ │ FileRepo  (knowledge/**.md)  = SOURCE OF TRUTH│ ── git: signed commits + blame (audit ledger #2)
                 └─────────────────────────────────────────────┘
                        │ mirror                 │ append
                        ▼                         ▼
                 ┌──────────────┐         ┌──────────────────────┐
                 │ SQLite Index │◀─reindex│ _events/*.jsonl       │ (audit ledger #1, hash-chained)
                 │ (disposable) │  (rebuild)└──────────────────────┘
                 └──────────────┘
                        ▲ artifact_uri
                 ┌──────────────────────┐
                 │ Artifact Vault (CAS) │  large blobs by sha256 (NOT inlined)
                 └──────────────────────┘
```

**파일이 정본(canonical)이다. SQLite는 누구에게도 권위가 아니다**(ADR-0002 §2): read 시 `content_hash`
불일치는 index가 stale함을 뜻한다 ⇒ rebuild; 절대 행(row)을 무조건 신뢰하지 않는다.

## 1. FileRepo — markdown over git

각 엔티티는 `knowledge/{sources,claims,evidence,notes,concepts,interests,decisions,open-questions,assumptions,signals}/`
아래의 **하나의 `.md` = YAML frontmatter(머신 계약) + markdown body(사람용 노트)**다(ADR-0002 §1).

```yaml
---
id: clm_0xab12                       # ADR-0002 ID scheme TODO(open-question)
kind: claim                          # one of the entity kinds (ADR-0003)
boundary: internal                   # public|internal|confidential (default-deny)
visibility: team                     # team|private (default-private)
trust: T2                            # DERIVED; written by reindex/recompute, not by hand
artifact_uri: null                   # path/URI for Source/Evidence; large blobs live in the vault
content_hash: sha256:...             # of canonicalized frontmatter+body; staleness check
created_at: 2026-01-01T00:00:00Z     # TODO(open-question: real timestamps at build time)
edges:                               # typed edges authored on the source node
  - { rel: supports, dst: evd_0x99 }
  - { rel: about,    dst: src_0x07 }
supersedes: null                     # append-only correction pointer (ADR-0001 §C)
---
The claim text / human note body.
```

`FileRepo` API (코어 txn이 소비):

```ts
interface FileRepo {
  write(node: NodeFile): { file_path: string; content_hash: string }  // canonicalize + write
  read(id: Id): NodeFile | null
  list(kind?: Kind): NodeFile[]
  commit(msg: string, files: string[]): { git_sha: string }           // signed commit (audit #2)
}
```

정규화(canonicalization)(안정적 키 순서, 정규화된 줄바꿈)는 `content_hash`를 결정론적으로 만들어 동일한 논리적
콘텐츠가 항상 동일하게 해시되도록 한다 — 이것이 reindex가 staleness를 검증하고 import가 hash로 dedup하게 해주는
것이다.

## 2. SQLite index — derived, disposable, portable-subset

코어 테이블은 SQLite∩Postgres 부분집합(`TEXT/INTEGER/TIMESTAMP`, surrogate `TEXT` id, FK, CHECK)만 사용하므로
schema가 변경 없이 Postgres로 이식된다(ADR-0002 §3). 제네릭 타입 `edge` 테이블이 graph-upgrade의 핵심 키스톤이다.

```sql
CREATE TABLE node (
  id           TEXT PRIMARY KEY,
  kind         TEXT NOT NULL,
  boundary     TEXT NOT NULL DEFAULT 'confidential'   -- default-deny
                 CHECK (boundary IN ('public','internal','confidential')),
  visibility   TEXT NOT NULL DEFAULT 'private'         -- default-private
                 CHECK (visibility IN ('team','private')),
  trust        TEXT NOT NULL DEFAULT 'T0'
                 CHECK (trust IN ('T0','T1','T2','T3','contested')),
  owner        TEXT,
  artifact_uri TEXT,
  file_path    TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  created_at   TIMESTAMP NOT NULL
);
CREATE TABLE edge (
  src_id TEXT NOT NULL REFERENCES node(id),
  dst_id TEXT NOT NULL REFERENCES node(id),
  rel    TEXT NOT NULL,
  PRIMARY KEY (src_id, dst_id, rel)
);
CREATE TABLE event (                                   -- mirror of _events JSONL
  seq     INTEGER PRIMARY KEY,
  ts      TIMESTAMP NOT NULL,
  op      TEXT NOT NULL,
  node_id TEXT,
  payload TEXT NOT NULL,                               -- JSON
  prev_hash TEXT, hash TEXT NOT NULL                   -- hash chain
);
```

FTS5와 예약된 `node_vec` vector sidecar는 **별도의 drop 가능한 migration**에 들어가므로 retrieval 선택이
portability를 절대 위협하지 않는다(ADR-0002 §3, ADR-0006 §1/§6). 이를 drop하고 rebuild하는 것은 항상 안전하다.

### index 내 Claim→Evidence invariant
portable FK는 "≥1개의 typed edge"를 표현할 수 없으므로, invariant는 **세 개의 보조를 맞춘 계층**에서
강제된다(ADR-0003): frontmatter schema, 코어 validator(ingest), 그리고 **reindex 재검사** — 모든
`kind='claim'`은 `evidence` node로의 `edge(rel='supports')`를 ≥1개 가져야 한다. durable claim이 evidence를
결여하면 reindex는 큰 소리로(fail loud) 실패한다.

## 3. Reindex — 결정론적, 멱등적 rebuild

`reindex`는 SQLite 파일을 drop하고 `knowledge/**`로부터 rebuild하여 쿼리 결과가 fresh build와 바이트 단위로
동일하도록 한다(ADR-0002 Implications). 설계 전체가 기대는 안전망이다.

```
reindex():
  1. drop + recreate schema (core tables, then FTS/vector migrations)
  2. for each .md in knowledge/**:
       parse frontmatter; recompute content_hash; assert matches stored hash (else WARN stale source)
       upsert node row; stage edges
  3. insert edges; verify referential integrity (no dangling dst)
  4. RE-CHECK Claim→Evidence invariant  → fail loud on violation (lists offending ids)
  5. recompute DERIVED trust per node (ladder T0–T3 + contested; AI-authored capped at T2 — ADR-0004)
  6. replay _events/*.jsonl into event table; verify hash chain continuity
  7. rebuild FTS5 from node text; leave node_vec empty (v0)
```

특성: **결정론적**(같은 파일 ⇒ 같은 DB), **멱등적**(재실행 ⇒ 같은 DB), **SoT에 비파괴적**(index만 drop). Trust와
FTS는 여기서 재계산되며, 절대 index로부터 신뢰되지 않는다.

## 4. `_events` writer — append-only audit ledger

모든 skill-wrap write는 `knowledge/_events/<ts>-<op>.jsonl`(한 줄당 하나의 JSON 객체)과 `event` 테이블로
mirror되며 hash-chained된다(ADR-0002 §1, [api-surface.md](./api-surface_ko.md)의 AuditService).

```json
{"seq":42,"ts":"2026-01-01T00:00:00Z","op":"attach_evidence",
 "node_id":"clm_0xab12","actor":{"kind":"agent","id":"..."},
 "payload":{"evidence_id":"evd_0x99","rel":"supports"},
 "prev_hash":"sha256:...","hash":"sha256:..."}
```

`hash = sha256(prev_hash + canonical(record_without_hash))` ⇒ 변조 감지(tamper-evidence); `verify_audit`가
chain을 순회한다(`AuditService.verify_audit`). Git history(서명된 commit, blame)가 **두 번째** append-only
원장이다; 둘은 고정된 write 순서로 보조를 맞춰 유지된다.

## 5. 고정된 write 순서 (the core txn)

ADR-0002 §6 — validation 실패는 전체 트랜잭션을 중단시킨다; 고아 파일 없음, 반쪽 index 없음, dangling event 없음.

```
1. FileRepo.write(node)               # canonicalize → file + content_hash
2. mirror to SQLite index (node/edge upsert)
3. append _events JSONL + event row (hash-chained)
4. VALIDATE: schema + evidence gate + Claim→Evidence + boundary monotonicity
5. on success: git commit (signed); on failure: roll back file + index + event  → Envelope.error
```

## 6. Artifact vault — path/URI로 참조하는 large blob

큰 import artifact(CAW-01 projection/trace)는 **절대 인라인되지 않는다**(ADR-0002 §7, ADR-0007 §1). CAW-02가
관리하는 content-addressed vault로 복사되고 `artifact_uri`로 참조된다; 나중 무결성 검사를 위해 `sha256`이
저장되므로, 재구성 가능성이 외부 시스템의 가동에 절대 의존하지 않는다.

```
artifacts/<sha256[:2]>/<sha256>      # content-addressed; dedups identical imports
node.artifact_uri = "artifact://<sha256>"   # or stable external URI
```

## Concurrency & failure model
v0 규모에서는 single-writer index lock; 팀 write 동시성은 Postgres 이식 전까지 파일에 대한 git PR/merge다
(ADR-0002 revisit trigger). skill 인터페이스 **밖**의 직접 파일 편집은 `_events`를 git으로부터 drift시킬 수 있다
— 알려진 위험; reindex의 hash-mismatch 경고가 이를 드러낸다. 업그레이드 경로는 engine/query 교체(Postgres
`tsvector`, 그다음 동일 `edge` 테이블 위의 Apache AGE openCypher)이지 데이터 재작성이 **아니다** — 파일은 매
단계에서 정본으로 남는다.

## Open Questions
- `TODO(open-question: ID scheme — content-addressed hash vs sequential slug — ADR-0002)`
- `TODO(open-question: team write-concurrency — git PR/merge vs serializing write-through API; Postgres-port trigger)`
- `TODO(open-question: reconcile _events JSONL vs git history when files are edited outside the skill interface)`
- `TODO(open-question: real timestamp source at build time; do not invent dates)`
- [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) 참조.

## Implications for runbooks
- **RB (reindex first):** `knowledge/**`로부터 결정론적·멱등적 rebuild; 바이트 단위로 동일한 쿼리 결과;
  Claim→Evidence 재검사는 큰 소리로 실패; portable-SQL lint를 수용 기준으로.
- **RB (FileRepo + canonicalization):** 엔티티당 하나의 `.md`; 안정적 content_hash; 서명된 commit.
- **RB (schema):** portable-subset 코어 테이블; FTS/vector는 별도의 drop 가능한 migration에.
- **RB (events writer):** hash-chained `_events` JSONL + event 테이블; `verify_audit`가 chain을 순회.
- **RB (artifact vault):** import 시 content-addressed 복사; 저장된 sha256으로 무결성 검사.
