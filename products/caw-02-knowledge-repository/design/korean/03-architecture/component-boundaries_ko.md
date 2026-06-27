# Component Boundaries — 모듈 소유권, op manifest, 핵심 서비스

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./system-architecture.md](./system-architecture_ko.md)
  - [../01-decisions/ADR-0001-product-surface-and-skill-interface.md](../01-decisions/ADR-0001-product-surface-and-skill-interface_ko.md)
  - [../01-decisions/ADR-0002-storage.md](../01-decisions/ADR-0002-storage_ko.md)
  - [../01-decisions/ADR-0003-knowledge-data-model.md](../01-decisions/ADR-0003-knowledge-data-model_ko.md)
  - [../01-decisions/ADR-0004-provenance-and-trust.md](../01-decisions/ADR-0004-provenance-and-trust_ko.md)
  - [../01-decisions/ADR-0005-ingestion-pipeline.md](../01-decisions/ADR-0005-ingestion-pipeline_ko.md)
  - [../01-decisions/ADR-0006-retrieval.md](../01-decisions/ADR-0006-retrieval_ko.md)
  - [../01-decisions/ADR-0007-import-export-contracts.md](../01-decisions/ADR-0007-import-export-contracts_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF_ko.md

## Purpose
CAW-02 내부의 **모듈 소유권 맵**을 확정한다. 즉, 어떤 모듈이 어떤 책임을 소유하는지, 세 가지 write 표면(surface)이 모두 codegen되는 **단일 op manifest**, 그리고 여섯 개 핵심 서비스(Ingest, Retrieve, Provenance/Trust, Boundary, Audit, ImportExport)와 reindex 컴포넌트의 **시그니처 수준** 계약을 정의한다. 이는 [system-architecture.md](./system-architecture_ko.md)(컨테이너 관점)에 대응하는 내부 문서다. 이 문서는 데이터 모델(ADR-0003), trust ladder 규칙(ADR-0004), 스토리지 레이아웃(ADR-0002)을 재정의하지 **않는다**. 이를 강제하는 모듈과 그들 사이의 경계(seam)에 이름을 붙일 뿐이다. 시그니처는 언어 중립적 의사 타입(pseudo-type)이며(빌드 가이드일 뿐 최종 코드가 아니다).

## 모듈 소유권 맵
| Module | Layer | Owns | MUST NOT |
|---|---|---|---|
| `adapters/api` `adapters/mcp` `adapters/cli` | C1 | transport ↔타입화된 op 매핑; envelope 렌더링 | 검증, gate, store 접근을 포함하는 것 |
| `manifest` | build-time | 단일 op 선언; adapter + schema codegen | 런타임 상태 보유 |
| `core/ingest` | C2 | 6단계 write 파이프라인; txn 오케스트레이션 | Provenance/Boundary/Audit 우회 |
| `core/retrieve` | C2 | 필터링 + 랭킹된 read; provenance 하이드레이션 | 불투명한 blob 반환; boundary 필터 건너뛰기 |
| `core/provenance` | C2 | evidence gate; trust ladder; lineage edge | 산문(prose)을 evidence로 수용 |
| `core/boundary` | C2 | boundary/visibility 전파(monotone) | synthesis 시 다운그레이드 |
| `core/audit` | C2 | append-only `_events` + 해시 체인 audit | 이전 항목 변경/삭제 |
| `core/importexport` | C6→C2 | 재-redaction; allow-list; envelope (역)직렬화 | `core/ingest` 외 경로로 node write |
| `store/files` | C3 | md read/write (frontmatter+body); `_events`; git | 불변식 강제(수동적) |
| `store/index` | C4 | SQLite node/edge/event + FTS; query 실행 | source of truth가 되는 것 |
| `reindex` | C5 | C3로부터 C4를 결정론적으로 재구축 + 불변식 재검사 | 콘텐츠 작성; validator layer 2와 다르게 동작 |

**의존성 방향(강제됨):** `adapters → core/* → store/*`. `core/ingest`는 `store/files` 다음 `store/index`로 **write**하는 유일한 모듈이며, 그 외 모든 write 경로는 버그다. `reindex`는 `store/index`에 write하는 유일한 비-core 작성자이며, 오직 재-도출(re-derive)만 한다.

## 단일 op manifest → codegen된 adapter
단일 선언적 manifest가 모든 operation의 source of truth다. 세 가지 write 표면, 그들의 input JSON Schema, API 라우트가 이로부터 **생성된다**. parity 계약 테스트가 그들이 동일한 operation 집합을 노출함을 단언한다(ADR-0001 §3).

```yaml
# manifest/ops.yaml  (one entry per operation — illustrative shape)
- op: attach_evidence            # canonical name; MCP=kr.attach_evidence, CLI=kr attach-evidence
  kind: write                    # write | read
  idempotent: true               # requires idempotency_key
  read_only_hint: false          # MCP annotation; reads => true (may auto-run)
  confirm: agent_default         # agent writes confirm by default (ADR-0001 §5)
  input_schema:                  # the ONLY place a field is declared
    claim_ref:   {type: node_ref, kind: claim, required: true}
    artifact_ref:{type: artifact_ref, required: true}   # NOTE: no prose/summary field exists
    stance:      {enum: [supports, challenges], required: true}
    locator:     {type: string, required: false}        # span/page; not the evidence itself
  errors: [ERR_EVIDENCE_NOT_ARTIFACT, ERR_NOTE_AS_EVIDENCE]
```

Codegen 대상(수작업 drift 없음):
| Generated artifact | From manifest field |
|---|---|
| MCP tool def + annotation | `op`, `read_only_hint`, `confirm`, `input_schema` |
| CLI subcommand + 플래그 (`--json`, `--idempotency-key`, `--yes`) | `op`, `kind`, `idempotent`, `input_schema` |
| API 라우트 (`POST /v1/<resource>`) | `op`, `kind`, `input_schema` |
| 공유 검증 schema (core가 사용) | `input_schema`, `errors` |
| Parity 계약 테스트 fixture | 전체 항목 |

Op 카탈로그(ADR-0001 §4): **writes** `add_source`, `extract_claims`, `attach_evidence`, `synthesize_note`, `classify_signal`, `record_decision`, `link`, `import_projection`; **reads** `search`, `get`, `export_bundle`, `verify_audit`. operation 추가 = manifest 편집이며, 세 표면을 수작업으로 패치하는 것이 결코 아니다.

## 공통 계약
```
TxnEnvelope   = { ok: bool, result?: any, error?: ErrCode, txn_id: str, audit_id: str }
NodeRef       = { kind: NodeKind, id: str }                 # resolves to a real node or fails
ArtifactRef   = { kind: source|trace|simulation_run|experiment|file_uri, ref: str }
WriteResult   = { node_id: str, version: int, status: NodeStatus, trust: Trust, boundary: Boundary }
RetrievalHit  = { node: Node, chain: ProvChain, trust: Trust, boundary: Boundary, score: float }
ProvChain     = Note? -cites-> Claim -evidence_for- Evidence -extracted_from-> Source|Trace|Sim|Exp
```
모든 op은 `TxnEnvelope`를 반환한다. `txn_id`는 재시도 안전성을 위해 호출자의 `idempotency_key`를 그대로 반향(echo)한다(ADR-0001 §6).

## 핵심 서비스 시그니처

### Ingest (`core/ingest`) — write txn 소유, ADR-0005
6단계 파이프라인을 오케스트레이션한다. 각 단계는 provenance를 부착하며 Claim→Evidence를 결코 위반하지 않는다.
```
add_source(payload, ctx)        -> TxnEnvelope<WriteResult>   # stage 1
extract_claims(source_ref, ctx) -> TxnEnvelope<[WriteResult]> # stage 3, candidates (reviewed by default)
attach_evidence(claim_ref, artifact_ref, stance, ctx) -> TxnEnvelope<WriteResult>  # stage 4 (the gate)
synthesize_note(claim_refs, ctx)-> TxnEnvelope<WriteResult>   # stage 5; generated=true, cited; NEVER evidence
classify_signal(signal_ref, ctx)-> TxnEnvelope<WriteResult>   # stage 6; supports/refutes → may raise OpenQuestion
record_decision(payload, ctx)   -> TxnEnvelope<WriteResult>
link(src_ref, dst_ref, rel, ctx)-> TxnEnvelope                # rejects illegal rels (e.g. note as evidence_for)
```
내부적으로 각 호출은 다음을 수행한다: schema-validate → `provenance.gate` → `boundary.propagate` → `provenance.recompute_trust` → `store.files.write` → `store.index.mirror` → `audit.append` → 불변식 재검사 → commit-or-abort (system-architecture write flow).

### Retrieve (`core/retrieve`) — ADR-0006
```
search(query, filters, ctx)     -> TxnEnvelope<[RetrievalHit]>
   # filters {boundary, visibility, type, trust, concept} applied BEFORE BM25 ranking
get(node_ref, ctx)              -> TxnEnvelope<RetrievalHit>     # hydrates full ProvChain
```
v0에서는 embedding 없음. vector sidecar는 예약되어 있다(ADR-0006). read는 `read_only_hint:true`다.

### Provenance / Trust (`core/provenance`) — gate 소유, ADR-0004 §2–§4
```
gate(claim_ref, artifact_ref)   -> Ok | ERR_EVIDENCE_NOT_ARTIFACT | ERR_NOTE_AS_EVIDENCE
   # STRUCTURAL: artifact_ref MUST resolve to a real artifact; a note/summary can NEVER be evidence
recompute_trust(node_ref)       -> Trust   # derived ladder T0..T3 | contested; AI-authored capped at T2
lineage(node_ref)               -> ProvChain
```
Trust는 **도출되는 것이며, 결코 호출자가 설정하지 않는다**(ADR-0003 공통 필드). gate는 이 제품의 심장부다.

### Boundary (`core/boundary`) — ADR-0004 §3
```
propagate(node_ref, parents)    -> {boundary, visibility}   # MONOTONE: synthesis never downgrades
check_export(node_set, target)  -> Ok | ERR_BOUNDARY_DOWNGRADE   # fail-closed allow-list
```
두 개의 직교 축: `boundary {public,internal,confidential}`와 `visibility {team,private}`, default-deny / default-private (ADR-0003).

### Audit (`core/audit`) — ADR-0001 §1, ADR-0002 §1
```
append(op, node_id, payload)    -> audit_id   # append-only _events JSONL + hash-chained entry
verify_audit(range?)            -> {ok, broken_at?}   # backs kr.verify_audit; recomputes hash chain
```
결코 갱신하거나 삭제하지 않는다. 정정은 `supersedes`로 연결된 새 버전이다(append-only, ADR-0001 §C).

### ImportExport (`core/importexport`) — C6, ADR-0007
```
import_projection(envelope, ctx)-> TxnEnvelope<[WriteResult]>
   # quarantine → confidentiality check → re-redact → map to nodes via core/ingest (NOT direct writes)
export_bundle(node_refs, target,ctx) -> TxnEnvelope<SignedBundle>
   # boundary.check_export (fail-closed) → re-redact → attach provenance manifest → sign
```
CAW-01/03/05를 참조하는 유일한 모듈이며, 독립적인 제품들 사이의 파일/타입화된 API 경계로서만 참조한다 — 공유 store는 없다(ADR-0007, brief §7).

## reindex 컴포넌트 (`reindex`, C5) — ADR-0002 §2, ADR-0003 layer 3
```
reindex(knowledge_dir) -> {nodes, edges, events, violations[]}
   1. drop & recreate SQLite index (node, edge, event, FTS)
   2. parse every knowledge/<kind>/*.md  (frontmatter = machine contract)
   3. mirror nodes + edges + replay _events
   4. RE-RUN Claim→Evidence invariant (validator layer 3) — fail loud on any violation
   5. recompute content_hash; mismatch ⇒ source file wins, index is rebuilt
```
**결정론 계약:** index를 drop하고 `reindex`를 재실행하면 **바이트 단위로 동일한 query 결과**가 나온다. 불변식 로직은 core validator layer 2와 *동일한 코드*다(두 번째 구현 없음). 따라서 파일과 index는 유효성에 대해 결코 불일치할 수 없다(ADR-0003 강제 테이블).

## 모듈 상호작용 매트릭스 (누가 누구를 호출할 수 있는가)
| caller ↓ \ callee → | adapters | core/* | store/files | store/index | reindex |
|---|---|---|---|---|---|
| adapters | — | ✅ ops | ✗ | ✗ | ✗ |
| core/ingest | ✗ | ✅ | ✅ write | ✅ mirror | ✗ |
| core/retrieve | ✗ | ✅ | ✗ | ✅ read | ✗ |
| core/importexport | ✗ | ✅ ingest | ✗ | ✗ | ✗ |
| reindex | ✗ | ✅ validator | ✅ read | ✅ rebuild | — |
| viewer | ✗ | ✅ reads | ✗ | ✗ | ✗ |

✗로 표시된 호출은 모두 아키텍처 위반이며 실패하는 acceptance check다.

## Open Questions
- `TODO(open-question: confirmation policy granularity — per-tool vs per-boundary vs per-actor allow-lists; owned with ADR-0004.)`
- `TODO(open-question: do importers persist rejected/quarantined candidates as nodes, and under what boundary? ADR-0005.)`
- [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md)를 참고하라.

## 런북에 대한 함의
- **RB (op manifest + codegen):** 단일 `manifest/ops.yaml` → MCP tools, CLI subcommands, API routes, 공유 schema; parity 계약 테스트를 acceptance로.
- **RB (core services):** 위 시그니처 뒤에 Ingest/Retrieve/Provenance/Boundary/Audit/ImportExport를 구현한다. gate와 trust recompute는 오직 `core/provenance`에만 존재한다.
- **RB (reindex):** core validator와 불변식 코드를 공유하고, 바이트 단위로 동일한 재구축을 단언한다.
- **RB (negative tests):** 상호작용 매트릭스를 단언한다 — 어떤 adapter/importer/viewer도 store에 직접 write하지 않는다.
