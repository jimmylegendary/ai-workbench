# 데이터 모델(Data Model) — CAW-03

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [storage-strategy.md](./storage-strategy_ko.md), [confidentiality-and-provenance.md](./confidentiality-and-provenance_ko.md), [../05-harness-core/artifact-lifecycle.md](../05-harness-core/artifact-lifecycle_ko.md), [../01-decisions/ADR-0008-artifact-lifecycle-and-storage.md](../01-decisions/ADR-0008-artifact-lifecycle-and-storage_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적

CAW-03 자체(OWN)의 최소한의 governance 데이터 모델. CAW-03은 CAW-01 results와 CAW-02 claims/evidence를
id/URI로 **참조(references)** 할 뿐, 절대 복제하지 않는다. 저장 위치는 [storage-strategy.md](./storage-strategy_ko.md)에 있다.

## 원칙

governance가 필요로 하는 것만 소유하고, 나머지는 모두 참조한다. 여기에 knowledge repo는 없으며(그건 CAW-02의 몫), runs도 없다
(그건 CAW-01의 몫).

## 엔티티(Entities)

| Entity | Key fields | Notes |
| --- | --- | --- |
| `ClaimRef` | claim_id (CAW-02), bundle_id, claim_type(P1/P2/P3), gate_status, evidence_refs[] | import된 CAW-02 ledger로의 참조; gate 결과는 캐시됨 |
| `Bundle` | id, source_adapter, imported_at, boundary, provenance_manifest_ref | SourceAdapter로부터의 한 번의 import |
| `GatedClaimSet` | id, claim_refs[], profile, gated_at | paper와 patent의 공유 front |
| `Artifact` | id, type(paper\|patent), state, gated_set_id, confidentiality_track, engine_run_id, review_id, output_ref | governance 하의 paper 하나 또는 patent 하나 |
| `EngineRun` | id, engine_adapter, workspace_path, inputs_ref, outputs_ref(LaTeX/PDF/scores), provenance(figure↔result) | draft run 하나 |
| `FigureTableManifest` | artifact_id, items[]{figure_id, result_id(CAW-01), caption} | outputs를 CAW-01 results에 결속 |
| `ReviewResult` | artifact_id, checklist[], scores, verdict | review checklist + autorater 점수 |
| `NoveltyFinding` | claim_ref, novel\|threatened\|patent_sensitive, evidence[](citation_pool/radar) | Novelty/Radar에서 도출 |
| `PaperLadderEntry` | paper_id(P1/P2/P3), claim_refs[], readiness, threats[] | ladder governance |
| `AdapterConfig` | port, adapter_id, version, config, enabled | config 기반 registry |
| `InterlockState` | claim_ref, patent_first, status(held\|released) | patent-first interlock |

## 복사가 아닌 참조(References, not copies)

```
ClaimRef.claim_id        → CAW-02 claim (id/URI)
ClaimRef.evidence_refs   → CAW-02 evidence (id/URI)
FigureTableManifest.result_id → CAW-01 result/projection (id/URI)
Artifact.output_ref      → file path (PDF / patent draft)
```

## 불변식(Invariants)

- `Artifact`는 `GatedClaimSet` 안의 claim만 참조할 수 있다(ungated claim은 작성되지 않음).
- claim set에 `InterlockState=held`가 하나라도 있는 artifact에 대한 `publish`는 거부된다 ([ADR-0004](../01-decisions/ADR-0004-patent-drafting_ko.md)).
- 모든 `ClaimRef.evidence_refs`는 CAW-02 evidence id를 가리킨다 — 절대 생성된 텍스트를 inline하지 않는다.

## 열린 질문(Open questions)

차단된(blocked) claim을 일급(first-class) `ClaimRef(gate_status=blocked)` 백로그로 유지할지 여부(yes 쪽으로 기울고 있음) —
[../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) 참조.

## 런북(runbook)에 대한 함의

governance store를 구축하는 phase가 이 테이블/파일들을 생성하고, gate + assembly + publish 런북이 위 불변식을
시행한다.
