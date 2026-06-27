# Ingestion Service — 6단계 파이프라인 + Review Queue

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [./api-surface_ko.md](./api-surface_ko.md)
  - [./persistence-and-index_ko.md](./persistence-and-index_ko.md)
  - [./retrieval-service_ko.md](./retrieval-service_ko.md)
  - [../01-decisions/ADR-0005-ingestion-pipeline_ko.md](../01-decisions/ADR-0005-ingestion-pipeline_ko.md)
  - [../01-decisions/ADR-0003-knowledge-data-model_ko.md](../01-decisions/ADR-0003-knowledge-data-model_ko.md)
  - [../01-decisions/ADR-0004-provenance-and-trust_ko.md](../01-decisions/ADR-0004-provenance-and-trust_ko.md)
  - [../01-decisions/ADR-0007-import-export-contracts_ko.md](../01-decisions/ADR-0007-import-export-contracts_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF_ko.md

## Purpose
**`IngestService` 뒤의 서비스**([api-surface.md](./api-surface_ko.md))를 기술한다: 6단계 ingestion 파이프라인
(ADR-0005), 각 stage의 provenance 부수효과(side-effect), evidence gate, 그리고 curator가 수락하기 전까지 agent
제출물을 보류하는 **review queue**. 타입이 지정된 오퍼레이션 시그니처([api-surface.md](./api-surface_ko.md)
참조), 파일/event writer([persistence-and-index.md](./persistence-and-index_ko.md) 참조), 또는 import/export
confidentiality 규칙(ADR-0007 참조)은 정의하지 **않는다**. 이 문서는 ADR-0005를 부연하며, 절대 재정의하지 않는다.

## 6개의 stage

각 stage는 provenance를 부착하고 **`Claim→Evidence`를 절대 위반하지 않는** append-only 단계다(ADR-0005).
generated summary는 어느 stage에서도 **절대** evidence가 아니다.

| # | Stage | Op (api-surface) | 생성물 | Provenance 부수효과 | Gate |
|---|---|---|---|---|---|
| 1 | add-source | `add_source` | `Source` (+ 선택적 `ArtifactRef`) | node + `boundary`/`scope` 스탬프; artifact는 vault로 복사 | boundary floor |
| 2 | parse | internal | Source 상의 파싱된 text/anchor | raw artifact로의 `derived-from`; locator 기록 | raw에 대한 node 변형 없음 |
| 3 | extract Claim-candidates | `extract_claims` | 후보 `Claim`들 (보류됨) | Source로의 `about` 링크; 큐에 들어감, durable 아님 | review queue |
| 4 | attach Evidence | `attach_evidence` | `Evidence` + `supports` edge | 구체 artifact/source node로의 edge | **evidence gate** |
| 5 | synthesize Note (cited) | `synthesize_note` | `Note` (`generated`) | evidence/claim으로의 `cites` edge | note ≠ evidence |
| 6 | classify/link signal | `classify_signal` | `RelatedWork`/`OpenQuestion` 링크 | `threat`/`support`/`unknown` 타입 edge | unknown이면 T0 |

```
add_source ─▶ parse ─▶ extract_claims ─▶ attach_evidence ─▶ synthesize_note ─▶ classify_signal
   (1)         (2)          (3)              (4)                (5)                 (6)
                            │ candidates                 every Claim is
                            ▼ enter review queue         non-durable until
                       [review_accept / review_reject]   it has ≥1 supports→Evidence
```

### Stage 1 — add-source
`{title, body?, artifact?, boundary, scope, external_ids?}`로부터 `Source` node를 생성한다. 큰 artifact는
**인라인되지 않는다**; content-addressed vault로 복사되고 `artifact_uri`로 참조된다(ADR-0002 §7,
[persistence-and-index.md](./persistence-and-index_ko.md)). boundary는 **floor(하한)**이다 — 나중에 올릴 수는
있지만 write는 절대 그것을 낮출 수 없다(ADR-0004). `external_ids`/`doi`는 signal import 시 dedup을 가능하게
한다(CAW-05 intake의 Stage 3, ADR-0007 §3).

### Stage 2 — parse
이후 citation을 위해 source artifact로부터 text + **locator**(page/section/line anchor)를 결정론적으로 추출한다.
parse는 파싱된 콘텐츠에서 raw artifact로 향하는 `derived-from` edge를 write하고 locator를 저장한다; raw
artifact를 **절대** 변형하거나 교체하지 않는다(재구성 가능성). parse 출력은 internal이다 — 공개 op 없음.

### Stage 3 — extract Claim-candidates
파싱된 text를 후보 `Claim`들로 바꾼다. 후보는 write되지만 **non-durable**로 표시되고 `review_ticket`에 부착된다.
이 stage에서 evidence가 없는 후보 `Claim`은 예상된 것이다 — 사실로 retrieve될 수 없고 gate와 review를 통과하기
전까지 export될 수 없다. 각 후보는 자신의 `Source`로 향하는 `about` edge를 얻는다.

### Stage 4 — attach Evidence (the gate)
**구조적 evidence gate**(ADR-0004 §2.3, ADR-0001 §5). `attach_evidence`는:
- **prose/summary 필드가 없다**;
- `artifact_ref`는 기존 `Source/Trace/SimulationRun/Experiment` node 또는 실제 `file_uri`로 resolve되어야 한다;
- `Note` 또는 `kind=generated-summary`를 부착하면 `EVIDENCE_GATE`로 **거부된다**.

성공 시 `Evidence` node + `Claim`으로의 `supports`(또는 `refutes`) edge를 생성한 뒤, 그 claim에 대한 trust 재계산
(`ProvenanceTrustService.recompute_trust`)을 유발한다.

### Stage 5 — synthesize Note (cited)
`{body, cites[], generated}`로부터 `Note`를 생성한다. 모든 synthesize된 Note는 **citation을 담고 있으며**,
`generated:true`일 때는 **구조적으로 evidence가 되는 것이 차단된다** — `evidence=false`를 지니며
`attach_evidence` 대상과 export-as-evidence에서 제외된다(ADR-0006 §5, ADR-0007 §4). boundary는 **단조적으로
(monotonically)** 전파된다: Note의 effective boundary ≥ max(인용된 입력들의 boundary)
(`BoundaryService.effective_boundary`).

### Stage 6 — classify/link signal
intake(CAW-05) signal에 대해: `classification: threat|support|unknown`을 부착한다. `threat`/`support`는 대상
`Claim`/`Concept`으로의 타입이 지정된 `RelatedWork` edge가 되고; `unknown`은 signal을 `T0`로 미검증 저장하며
auto-link하지 **않는다**. accepted claim에 대한 신뢰성 있는 **threat은 자동으로 `OpenQuestion`을 발생시키고**
reviewer에게 알린다(ADR-0007 §3).

## Review queue (agent 제출물은 기본적으로 review 대상)

ADR-0005: v0에서는 **silent auto-accept가 없다**. agent가 작성한 후보는 review queue에 들어가고; curator(또는
allow-list된 actor)가 수락하거나 거부한다.

```ts
type ReviewTicket = {
  id: Id
  actor: Actor                 // who submitted (agent vs human)
  stage: 3 | 5 | 6             // which stage produced the held items
  items: { id: Id; kind: Kind; summary: string }[]
  state: "open" | "accepted" | "rejected" | "partial"
  created_at: string
}
```

| Path | Trigger | 효과 |
|---|---|---|
| auto-hold | `actor.kind == "agent"` (기본) | 후보는 non-durable; `review_ticket`과 함께 `CONFIRM_REQUIRED` 반환 |
| human direct | `actor.kind == "human"` + `confirm:true` | confirmation 정책에 따라 hold를 우회할 수 있음 `TODO(open-question)` |
| `review_accept` | curator | 항목이 durable해짐; durability가 `Claim→Evidence` invariant를 재검사 |
| `review_reject` | curator + `reason` | 항목은 삭제되지 않음 — **audit를 위해 보존**(append-only, ADR-0005); `rejected`로 표시 |

수락이 validation을 건너뛰지는 않는다: 수락 시점에 코어는 `Claim→Evidence` invariant와 boundary 검사를 다시
실행하므로, 오래된(stale) 후보가 evidence 없이 durable해질 수 없다.

## Provenance & trust on ingest

- 모든 stage는 `AuditService.append`를 통해 `_events` 레코드와 hash-chained audit entry를 방출한다
  ([persistence-and-index.md](./persistence-and-index_ko.md)).
- Trust는 **derived(파생)**이며 제출자가 주장하지 않는다; AI가 작성한 엔티티는 `T2`로 제한된다(ADR-0004).
  `generated-summary` evidence만 가진 claim은 "not evidence-grade" floor 위로 올라갈 수 없으며 단독 인용될 수 없다.
- stage가 생략하면 boundary는 **default-deny**, scope는 **default-private**이다(ADR-0004 §5).

## Transaction & failure behavior
각 op는 고정된 write 순서(file → index → `_events` → validate → commit, ADR-0002 §6)를 갖는 하나의 코어
txn이다. 어느 stage에서든 validation 실패는 **전체 트랜잭션을 중단시킨다**: 고아 파일 없음, 반쯤 write된 edge
없음, 중단된 op에 대한 audit entry 없음. 멱등성(Idempotency): 반복된 `idempotency_key`는 원래의
`txn_id`/result를 반환한다(`CONFLICT`는 다른 payload로 키가 재사용된 경우에만).

## Error taxonomy (이 서비스)

| Code | Stage | 원인 |
|---|---|---|
| `EVIDENCE_GATE` | 4 | prose 필드 존재, resolve 불가능한 `artifact_ref`, 또는 Note/summary 대상 |
| `INVARIANT` | 3→accept | `supports`→`Evidence`가 ≥1개 없이 `Claim`이 durable화됨 |
| `BOUNDARY` | 1,5 | write가 boundary를 낮추거나, Note boundary < 인용 입력 |
| `CONFIRM_REQUIRED` | 3,5,6 | agent 제출물이 review 보류됨 |
| `QUARANTINED` | (import) | ADR-0007 / ImportExportService 참조 |

## Open Questions
- `TODO(open-question: confirmation/allow-list granularity for which agent actors may bypass review — ADR-0001/0004)`
- `TODO(open-question: parse anchor/chunk unit for long sources — ADR-0006)`
- `TODO(open-question: retention window/format for rejected candidates kept for audit — ADR-0005)`
- [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) 참조.

## Implications for runbooks
- **RB (ingest core):** stage 1–6을 각각 abort-on-fail하는 하나의 코어 txn으로 구현; evidence gate를 unit test로.
- **RB (review queue):** ticket 모델, audit 보존 reject를 포함한 accept/reject, accept 시 재검증.
- **RB (negative tests):** Note-as-evidence, evidence 없는 claim의 durability, boundary downgrade — 모두 실패해야 함.
- **RB (signal intake):** accepted claim에 대한 threat → 자동 `OpenQuestion` + reviewer 알림.
