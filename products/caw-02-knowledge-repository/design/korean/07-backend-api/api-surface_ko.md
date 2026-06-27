# Backend API — 제품 코어 오퍼레이션 계약

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [./ingestion-service_ko.md](./ingestion-service_ko.md)
  - [./retrieval-service_ko.md](./retrieval-service_ko.md)
  - [./persistence-and-index_ko.md](./persistence-and-index_ko.md)
  - [../01-decisions/ADR-0001-product-surface-and-skill-interface_ko.md](../01-decisions/ADR-0001-product-surface-and-skill-interface_ko.md)
  - [../01-decisions/ADR-0003-knowledge-data-model_ko.md](../01-decisions/ADR-0003-knowledge-data-model_ko.md)
  - [../01-decisions/ADR-0004-provenance-and-trust_ko.md](../01-decisions/ADR-0004-provenance-and-trust_ko.md)
  - [../01-decisions/ADR-0006-retrieval_ko.md](../01-decisions/ADR-0006-retrieval_ko.md)
  - [../01-decisions/ADR-0007-import-export-contracts_ko.md](../01-decisions/ADR-0007-import-export-contracts_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF_ko.md

## Purpose
이 문서는 **제품 코어의 타입이 지정된 오퍼레이션 계약**, 즉 ADR-0001이 모든 surface 뒤에 두는 단일 트랜잭션
서비스를 정의한다. 핵심 서비스(`IngestService`, `RetrieveService`, `ProvenanceTrustService`, `BoundaryService`,
`AuditService`, `ImportExportService`)와 그 오퍼레이션, 그리고 시그니처 수준의 입출력을 나열한다. 이 문서는
ingestion 파이프라인 내부 동작([ingestion-service.md](./ingestion-service_ko.md) 참조), retrieval 랭킹
([retrieval-service.md](./retrieval-service_ko.md) 참조), 또는 파일/index/event 메커니즘
([persistence-and-index.md](./persistence-and-index_ko.md) 참조)을 정의하지 **않는다**. 이것은 codegen된
MCP/CLI/API 어댑터가 호출하는 boundary이며, 어댑터는 아무것도 추가하지 않는다(ADR-0001 §1).

## 횡단 계약 (모든 오퍼레이션)

모든 write 오퍼레이션은 **검증된 트랜잭션(vetted transaction)**이며, append-only이고, 하나의 **타입이 지정된
envelope**를 반환한다(ADR-0001 §6):

```ts
type Envelope<R> = {
  ok: boolean
  result?: R
  error?: { code: ErrCode; message: string; offending_ids?: Id[] }
  txn_id: string        // echoes caller idempotency_key; retry-safe
  audit_id: string      // hash-chained audit entry (AuditService)
}

type ErrCode =
  | "VALIDATION"          // schema / data-model violation
  | "EVIDENCE_GATE"       // prose-as-evidence or unresolvable artifact_ref (ADR-0004)
  | "INVARIANT"           // Claim has no supporting Evidence (ADR-0003)
  | "BOUNDARY"            // would downgrade boundary / leak across crossing (ADR-0004/0007)
  | "CONFLICT"            // idempotency / supersedes target mismatch
  | "NOT_FOUND"
  | "QUARANTINED"         // import held for curator (ADR-0007)
  | "CONFIRM_REQUIRED"    // agent write awaiting confirmation (ADR-0001 §5)
```

아래에서 사용하는 공유 스칼라/값 타입:

```ts
type Id        = string                                   // entity id (ADR-0002 ID scheme TODO)
type Kind      = "source"|"claim"|"evidence"|"note"|"concept"|"interest"
               | "open-question"|"decision"|"assumption"
               | "trace"|"simulation-run"|"experiment"|"related-work"|"radar-signal"
type Boundary  = "public"|"internal"|"confidential"       // sensitivity axis (ADR-0004)
type Scope     = "team"|"private"                          // visibility axis (ADR-0004)
type Trust     = "T0"|"T1"|"T2"|"T3"|"contested"          // derived ladder (ADR-0004)
type Rel       = "supports"|"refutes"|"about"|"derived-from"|"supersedes"|"related-work"|"answers"
type Actor     = { kind: "human"|"agent"; id: string }
type WriteOpts = { idempotency_key: string; actor: Actor; confirm?: boolean }
type ArtifactRef = { uri: string; sha256?: string; location?: string } // path/URI; NEVER prose
```

**Write 순서는 고정되어 있다**(ADR-0002 §6): file → index mirror → `_events` append → validate → commit; 어떤
실패든 전체 트랜잭션을 중단시킨다(고아 파일 없음). 아래의 모든 서비스 메서드는 그 단일 코어 txn 안에서 실행된다.

## Service map

| Service | 책임 | Read/Write | Backing doc |
|---|---|---|---|
| `IngestService` | 6단계 파이프라인 + review queue를 통한 엔티티 append | write | [ingestion-service.md](./ingestion-service_ko.md) |
| `RetrieveService` | FTS + 구조화 필터 + provenance hydration + citation 조립 | read | [retrieval-service.md](./retrieval-service_ko.md) |
| `ProvenanceTrustService` | edge 연결, trust 재계산, supersedes, invariant 재검사 | write/read | ADR-0003/0004 |
| `BoundaryService` | boundary+visibility 계산 및 단조(monotone) 전파 | read (pure) | ADR-0004 |
| `AuditService` | append-only `_events` + hash-chained audit; 검증 | write/read | [persistence-and-index.md](./persistence-and-index_ko.md) |
| `ImportExportService` | quarantine import + 제품 boundary 간 fail-closed export | write/read | ADR-0007 |

## IngestService

skill-wrap write 도구들(ADR-0001 §4). 각각은 정확히 하나의 invariant를 강제한다. 전체 stage 동작은
[ingestion-service.md](./ingestion-service_ko.md)에 있다.

```ts
interface IngestService {
  add_source(in: {
    title: string; body?: string; artifact?: ArtifactRef
    boundary: Boundary; scope: Scope; external_ids?: string[]
  }, o: WriteOpts): Envelope<{ id: Id }>

  extract_claims(in: {
    source_id: Id; candidates: { text: string }[]
  }, o: WriteOpts): Envelope<{ claim_candidate_ids: Id[]; review_ticket: Id }>

  // EVIDENCE GATE: no prose field; artifact_ref MUST resolve to a real artifact node/uri.
  attach_evidence(in: {
    claim_id: Id; artifact_ref: ArtifactRef | { node_id: Id }; rel?: "supports"|"refutes"
  }, o: WriteOpts): Envelope<{ evidence_id: Id; edge_id: Id }>

  // synthesis is a cited Note, generated=true — NEVER evidence
  synthesize_note(in: {
    body: string; cites: Id[]; about?: Id[]; generated: boolean
    boundary?: Boundary; scope?: Scope
  }, o: WriteOpts): Envelope<{ note_id: Id }>

  classify_signal(in: {
    signal_id: Id; classification: "threat"|"support"|"unknown"; target_id?: Id
  }, o: WriteOpts): Envelope<{ related_work_id?: Id; open_question_id?: Id }>

  record_decision(in: {
    title: string; body: string; cites?: Id[]; boundary: Boundary; scope: Scope
  }, o: WriteOpts): Envelope<{ id: Id }>

  // review queue (ADR-0005: agent submissions reviewed by default)
  review_accept(in: { review_ticket: Id; ids?: Id[] }, o: WriteOpts): Envelope<{ accepted: Id[] }>
  review_reject(in: { review_ticket: Id; ids?: Id[]; reason: string },
                o: WriteOpts): Envelope<{ rejected: Id[]; retained_for_audit: boolean }>
}
```

여기서 강제되는 invariant(그리고 reindex 시 재검사, ADR-0002 §5 / ADR-0003): `claim`은 `evidence`로의
`supports` edge가 ≥1개 생기기 전까지 durable하지 않다; `attach_evidence`는 `note`/`generated-summary` 대상을
거부한다(`EVIDENCE_GATE`); `generated:true`인 `synthesize_note`는 절대 evidence로 인용될 수 없다.

## ProvenanceTrustService

```ts
interface ProvenanceTrustService {
  link(in: { src_id: Id; dst_id: Id; rel: Rel }, o: WriteOpts): Envelope<{ edge_id: Id }>

  supersede(in: { old_id: Id; new_id: Id; reason: string },
            o: WriteOpts): Envelope<{ edge_id: Id }>     // append-only correction (ADR-0001 §C)

  recompute_trust(in: { id: Id }, o: WriteOpts): Envelope<{ trust: Trust }>
  // derived ladder T0–T3 + contested; AI-authored capped at T2 (ADR-0004)

  get_chain(in: { id: Id; max_depth?: number }):
    Envelope<{ chain: { id: Id; kind: Kind; rel?: Rel }[] }>   // read; hydrated provenance
}
```

`recompute_trust`는 **derived(파생)이며 호출자가 설정하지 않는다**: evidence 개수/종류, contestation edge
(`refutes`), 그리고 authorship를 읽는다; AI `actor`는 결과를 `T2`로 제한한다. `claim`으로 들어가는 `supports`
edge의 `link`는 동일 txn 내에서 그 claim에 대한 trust 재계산을 유발한다.

## BoundaryService (pure, read-only)

Boundary 로직은 저장이 아니라 계산이다; surface와 다른 서비스들은 무언가를 반환하거나 write하기 전에 이를
호출한다(ADR-0004 두 개의 직교 축 + 단조 전파).

```ts
interface BoundaryService {
  effective_boundary(in: { id: Id }): Envelope<{ boundary: Boundary; scope: Scope; derived_from: Id[] }>
  // monotone: synthesis is >= max(boundary of cited inputs); never downgrades

  can_release(in: { ids: Id[]; target_audience: Boundary; target_scope: Scope }):
    Envelope<{ allowed: Id[]; excluded: { id: Id; reason: string }[] }>
  // fail-closed: indeterminate => excluded (ADR-0007 §4)

  check_write_boundary(in: { id: Id; proposed: Boundary }):
    Envelope<{ ok: boolean }>   // rejects downgrades (BOUNDARY error)
}
```

## AuditService

```ts
interface AuditService {
  // called inside every write txn; mirrors the skill-wrap write to _events JSONL + hash chain
  append(in: { op: string; node_id?: Id; payload: object; actor: Actor }):
    Envelope<{ audit_id: string; seq: number; prev_hash: string; hash: string }>

  verify_audit(in: { from_seq?: number; to_seq?: number }):
    Envelope<{ ok: boolean; broken_at?: number }>     // hash-chain integrity (kr.verify_audit)

  history(in: { id: Id }): Envelope<{ events: { seq: number; ts: string; op: string }[] }>
}
```

audit는 보조를 맞춰 동작하는 두 개의 append-only 원장(ledger)이다: `knowledge/_events/<ts>-<op>.jsonl`과
서명된 git commit(ADR-0002 §1). `verify_audit`는 hash chain을 검증한다; git blame이 두 번째 증인이다.
메커니즘은 [persistence-and-index.md](./persistence-and-index_ko.md)에 있다.

## RetrieveService (read-only)

```ts
interface RetrieveService {
  search(in: {
    q: string
    filters?: { boundary?: Boundary[]; scope?: Scope[]; kind?: Kind[]; trust?: Trust[]; concept?: Id[] }
    limit?: number
    viewer: Actor & { max_boundary: Boundary; scope: Scope }   // pre-ranking boundary gate
  }): Envelope<{ hits: RetrievalHit[] }>

  get(in: { id: Id; viewer: Actor }): Envelope<{ hit: RetrievalHit }>

  // citation-constrained synthesis; uncited claims rejected/flagged (ADR-0006 §5)
  answer(in: { q: string; viewer: Actor; persist_as_note?: boolean }):
    Envelope<{ answer_claims: { text: string; cites: Id[] }[]
               evidence: { id: Id; source: string; boundary: Boundary; trust: Trust; locator: string }[]
               unsupported: { text: string }[]; note_id?: Id }>
}
```

`RetrievalHit`은 ADR-0006 §4의 envelope이다(item + hydrate된 `Source→Claim→Evidence→Note` chain + trust +
boundary + locator + score). Boundary/scope 필터는 랭킹과 조립 **이전에** 실행된다. 자세한 내용은
[retrieval-service.md](./retrieval-service_ko.md)에 있다.

## ImportExportService

```ts
interface ImportExportService {
  import_projection(in: { envelope: Caw01Envelope }, o: WriteOpts):
    Envelope<{ evidence_id?: Id; simulation_run_id?: Id; quarantined?: boolean }>

  import_signals(in: { jsonl_path: string }, o: WriteOpts):
    Envelope<{ source_ids: Id[]; claim_candidate_ids: Id[]; open_question_ids: Id[] }>

  export_bundle(in: {
    claim_ids: Id[]; target_audience: Boundary; target_scope: Scope
  }, o: WriteOpts):
    Envelope<{ bundle_path: string; provenance_digest: string; excluded: { id: Id; reason: string }[] }>
}
```

세 가지 모두 **검증된 skill 액션(vetted skill actions)**이다(ADR-0007 §6): 동일한 envelope validator, semver
gate, 재-redaction, boundary 검사가 agent와 human에게 똑같이 적용된다. `export_bundle`은 **fail-closed**이다
— 빈 bundle이거나, `public` bundle에 명시적으로 요청된 confidential/`private` 항목이 있으면 `BOUNDARY`와
`offending_ids`와 함께 `ok:false`를 반환하며, 절대 부분적인 silent leak을 내지 않는다. `import_projection`은
curator가 confidentiality를 판정해야 할 때 (오류가 아니라) `quarantined:true`를 반환한다.

## Parity & manifest

위의 모든 오퍼레이션은 **op manifest**(ADR-0001 §3)의 한 행이다: `{ name, json_schema, idempotency, kind:
read|write, mcp_annotations }`. MCP 도구, CLI 하위 명령, API 라우트는 이로부터 codegen되며; 계약 테스트가 세
surface가 동일한 schema를 노출함을 검증한다. Read op는 `readOnlyHint:true`를 설정하고 자동 실행될 수 있다;
agent write는 호출자가 `confirm:true`를 전달하기 전까지 기본적으로 `CONFIRM_REQUIRED`이다(ADR-0001 §5).

## Open Questions
- `TODO(open-question: confirmation granularity per-tool vs per-boundary vs per-actor — ADR-0001)`
- `TODO(open-question: API auth model between independent products — ADR-0001 / ADR-0007)`
- `TODO(open-question: ID scheme content-hash vs slug affects Id type — ADR-0002)`
- [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) 참조.

## Implications for runbooks
- manifest로부터 어댑터를 생성한다; 코어는 이 인터페이스들을 한 번 구현한다.
- 부정 테스트: Note에 대한 `attach_evidence`는 MCP/CLI/API 전반에서 `EVIDENCE_GATE`로 실패한다.
- 모든 write는 `{txn_id, audit_id}`를 반환한다; `audit_id` 누락은 빌드 실패다.
