# RB-011: typed node + 하나의 generic edge 테이블 + 3-layer Claim→Evidence invariant 구현

- Status: ready
- Phase: phase-1-core
- Depends on: [RB-010 (product core + op dispatch), RB-002 (frontmatter schemas), RB-003 (node/edge SQLite schema + reindex)]
- Implements design:
  - [../../04-data-layer/data-model.md](../../04-data-layer/data-model_ko.md)
  - [../../05-knowledge-core/entity-and-edge-model.md](../../05-knowledge-core/entity-and-edge-model_ko.md)
  - [../../05-knowledge-core/claim-evidence-and-evidence-gate.md](../../05-knowledge-core/claim-evidence-and-evidence-gate_ko.md)
  - [../../01-decisions/ADR-0003-knowledge-data-model.md](../../01-decisions/ADR-0003-knowledge-data-model_ko.md)
- Produces: typed-node 모델(닫힌 `kind` 어휘 + 공통 + kind별 field), endpoint-legality 매트릭스를 가진 하나의 generic `edge(src_id,dst_id,rel)` 테이블, 그리고 **3개의 lockstep layer에서 강제되는 Claim→Evidence(≥1) invariant**(frontmatter schema, core validator, reindex re-check).

## Objective
CAW-02는 모든 것을 typed node로, 모든 관계를 하나의 generic typed edge로 모델링한다 — 설계가 고정한 그대로. 제품의 척추 — *Claim은 그 `extracted_from`이 구체적 artifact로 resolve되는 Evidence로부터의 `evidence_for` edge가 ≥1일 때에만 유효하며, 어떤 Note도 evidence chain을 뒷받침할 수 없다* — 는 SAME core 로직을 실행하는 세 곳에서 동일하게 강제된다: (1) YAML frontmatter schema, (2) core transaction validator(RB-010 validate phase), (3) `knowledge/**`에 대한 reindex re-check. "Done" = node/edge 계약이 인코딩되고, legality 매트릭스가 illegal triple을 거부하며, negative 테스트 N1, N4, N5 플러스 bare-Claim 케이스가 시끄럽게 실패하는 한편 happy path가 통과함. (structural evidence gate 본체 — prose field 없음, artifact resolution, trust — 는 RB-012.)

## Preconditions
- [ ] RB-010 core, dispatcher, validate-phase hook이 존재하고 green.
- [ ] `node`, `edge`, `provenance_event` 테이블이 존재(portable SQLite∩Postgres subset, [data-model §5](../../04-data-layer/data-model_ko.md)).
- [ ] 모든 `kind`에 대한 kind별 frontmatter schema 파일이 존재.

## Steps

1. **닫힌 `kind` 어휘와 공통 node field 인코딩.**
   - Do: enum `source claim evidence note concept interest open_question decision assumption trace simulation_run experiment related_work radar_signal` 정의. 공통 frontmatter([data-model §3](../../04-data-layer/data-model_ko.md)) 인코딩: `id, kind, schema_version, boundary, visibility, status, generated, trust, artifact_uri, created_by, attributed_to, created_via, supersedes, content_hash, created_at`. `trust`(및 effective `boundary`/`visibility`)를 **derived**로 표시: caller가 그것들을 다르게 설정하면 거부.
   - Verify: 모든 `kind`의 fixture node가 validate됨; 알 수 없는 `kind`는 거부됨; caller가 `trust:T3`를 제공하는 node는 `VALIDATION`으로 거부됨.

2. **kind별 type-specific field 인코딩.**
   - Do: [data-model §4](../../04-data-layer/data-model_ko.md)의 kind별 field 추가: `source{source_type,title,origin_uri,imported_from}`, `claim{statement,claim_type}`, `evidence{stance,artifact_uri,locator}`(prose field 없음), `note{generated,title}`, `concept/interest`, `open_question/decision/assumption`, `_refs{artifact_uri,origin,checksum}`, signal `{external_ref,classification,imported_from}`.
   - Verify: `summary`/`text`/`prose` 키를 가진 `evidence` fixture가 schema validation을 실패; `filename == id`가 강제됨(불일치 거부).

3. **generic typed edge 계약 생성.**
   - Do: `edge(src_id, dst_id, rel, created_via, PRIMARY KEY(src_id,dst_id,rel))` 확인. edge는 source node의 frontmatter `links: [{rel,to}]` 블록에 존재하며 reindex에 의해 `edge` 테이블로 1:1 project됨. 어떤 edge도 자유로운 frontmatter field가 아님.
   - Verify: `links` 블록을 가진 `evd_*` fixture가 reindex 후 link당 정확히 하나의 `edge` row를 project; 중복 `(src,dst,rel)`은 idempotent(하나의 row).

4. **endpoint-legality 매트릭스를 core link validator에 생성.**
   - Do: [entity-and-edge-model.md §4.1](../../05-knowledge-core/entity-and-edge-model_ko.md)의 `(kind, rel, kind)` triple 인코딩: `evidence_for: evidence→claim`, `challenges: evidence→claim`, `extracted_from: evidence→{source,trace,simulation_run,experiment}`, `cites: note→{claim,evidence}`, `derived_from: {note,claim}→{source,claim}`, `about_concept: {claim,source,note}→concept`, `addresses: {claim,evidence}→{open_question,decision,assumption}`, `supports/refutes: {related_work,radar_signal}→claim`, `supersedes: X→X`, `attributed_to: *→agent`. 매트릭스에 없는 triple은 `ERR_EDGE_ENDPOINT_ILLEGAL`(envelope `INVARIANT`/`VALIDATION`)로 거부.
   - Verify: legal한 `evidence_for: evidence→claim`은 수용됨; illegal한 `cites: claim→source`는 `ERR_EDGE_ENDPOINT_ILLEGAL`로 거부됨.

5. **hard structural bar 인코딩: Note는 결코 evidence edge의 src가 아니다.**
   - Do: link validator에서 `src.kind=note AND rel ∈ {evidence_for, extracted_from}`인 모든 edge를 거부 → `ERR_NOTE_AS_EVIDENCE`.
   - Verify: negative 테스트 **N4** — `note` src로 `evidence_for`를 생성하면 `ERR_NOTE_AS_EVIDENCE`로 거부됨; 아무것도 write되지 않음.

6. **Layer 2 — core validator: commit 이전 Claim→Evidence(≥1) invariant.**
   - Do: RB-010 validate phase에서, commit 전 검사([claim-evidence-and-evidence-gate.md §2/§4](../../05-knowledge-core/claim-evidence-and-evidence-gate_ko.md)): `status=needs_evidence`를 넘어 promote된(`accepted`/`trust>T0`로) `claim`은 `evidence` node로부터의 `evidence_for`가 ≥1이고, 그러한 각 Evidence의 `extracted_from` target이 resolve됨. bare Claim은 일급 `needs_evidence`/`T0` 상태이며, 숨겨야 할 error가 아니다. 실패 → `ERR_TRUST_WITHOUT_EVIDENCE`(envelope `INVARIANT`), 전체 txn abort.
   - Verify: negative 테스트 **N1** — 0-evidence Claim을 `accepted`로 promote하면 `ERR_TRUST_WITHOUT_EVIDENCE` 반환, 아무것도 write 안 됨; positive — `needs_evidence`/`T0`에 evidence 0개로 남겨진 Claim은 수용되고 visible.

7. **Layer 1 — frontmatter schema가 structural fact를 다시 진술.**
   - Do: schema(RB-002)가 첫 gate임을 보장: `evidence`에 prose field 없음(step 2); `claim`은 link 없이 `needs_evidence`로 태어날 수 있음. 이는 [claim-evidence-and-evidence-gate.md §4](../../05-knowledge-core/claim-evidence-and-evidence-gate_ko.md)에 따른 invariant의 layer 1이다.
   - Verify: corpus의 schema-validate가 통과; `evidence`-with-prose fixture가 schema layer에서 실패(core와 독립적으로).

8. **Layer 3 — `knowledge/**`에 대한 reindex re-check.**
   - Do: source-of-truth md 파일에 대해 FULL invariant(steps 4–6)를 재실행하도록 `reindex`(RB-003) 확장; 어떤 위반이든 offending id를 명명하며 reindex를 시끄럽게 abort(`reindex: INVARIANT_VIOLATION`); index는 갱신되지 않음.
   - Verify: negative 테스트 **N5** — `.md`를 손으로 편집하여 Evidence가 Note를 가리키게 하고 reindex 실행 → id를 명명하며 시끄럽게 실패, index 변경되지 않음.

9. **Reconstructability traversal.**
   - Do: `edge`에 대한 recursive CTE로 traversal `note --cites--> claim --evidence_for(in)--> evidence --extracted_from--> source|trace|simulation_run|experiment` 구현([data-model §7](../../04-data-layer/data-model_ko.md)).
   - Verify: happy-path corpus에서 Note로부터의 traversal이 구체적 artifact node까지의 전체 chain을 반환.

## Acceptance criteria
- [ ] 닫힌 `kind` 어휘 + 공통 + kind별 field가 인코딩됨; derived field는 caller-set 시 거부됨.
- [ ] 하나의 generic `edge` 테이블; frontmatter `links`가 1:1 project; 중복은 idempotent.
- [ ] endpoint-legality 매트릭스가 강제됨; illegal triple ⇒ `ERR_EDGE_ENDPOINT_ILLEGAL`.
- [ ] N1(bare Claim promote) ⇒ `ERR_TRUST_WITHOUT_EVIDENCE`; N4(note-as-evidence) ⇒ `ERR_NOTE_AS_EVIDENCE`; N5(손편집) ⇒ id를 명명하는 reindex `INVARIANT_VIOLATION`.
- [ ] bare Claim이 일급 `needs_evidence`/`T0`로 수용됨(error 아님).
- [ ] invariant가 세 layer(schema, validator, reindex) 모두에서 동일하게 실행됨.
- [ ] Reconstructability traversal이 happy path에서 전체 chain을 반환.
- [ ] 트리가 green(build + lint + schema-validate + N1/N4/N5 테스트 + happy path).

## Rollback / safety
- 모든 강제가 RB-010 transaction 안에서 실행되므로, 거부된 write는 orphan node/file/event를 남기지 않는다. Layer 3가 backstop이다: layer 1–2를 우회하는 out-of-band 손편집조차 reindex에서 잡히며, reindex는 시끄럽게 실패하고 broken state를 index하기를 거부한다. 롤백하려면 validator 등록과 reindex re-check hook을 제거; node/edge schema와 corpus는 영향받지 않는다.

## Hand-off
- RB-012는 이 invariant 위에 structural evidence gate(prose field 없음은 여기서 이미 자리 잡음; artifact_ref resolution + trust derivation)를 추가한다.
- RB-013은 같은 `edge` 그래프 위에 boundary/visibility propagation과 hash-chained audit을 추가한다.
- reconstructability traversal은 P5 retrieval hydration과 P6 export bundle에서 재사용된다.
