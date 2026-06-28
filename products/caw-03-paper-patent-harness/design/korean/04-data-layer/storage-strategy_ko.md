# 저장 전략(Storage Strategy) — CAW-03

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [data-model.md](./data-model_ko.md), [../01-decisions/ADR-0008-artifact-lifecycle-and-storage.md](../01-decisions/ADR-0008-artifact-lifecycle-and-storage_ko.md), [../03-architecture/system-architecture.md](../03-architecture/system-architecture_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적

무엇이 어디에 사는가: CAW-03 자체의 governance 데이터 vs 참조(references) vs 대용량 artifact vs engine workspace.

## 배치(Placement)

| 데이터 | Store | 이유 |
| --- | --- | --- |
| Governance 엔티티 (ClaimRef, Bundle, GatedClaimSet, Artifact, EngineRun, ReviewResult, NoveltyFinding, PaperLadder, AdapterConfig, InterlockState) | **SQLite (또는 md+SQLite)** | 작고, 쿼리 가능하며, 형제 제품들과 일관됨 |
| CAW-01 results / CAW-02 claims+evidence | **id/URI로 참조됨** | 해당 독립 제품들이 소유하며, 복제하지 않음 |
| 산출된 artifact (PDF, patent draft, LaTeX) | **path 기반 filesystem** (`artifacts/`) | 대용량 blob은 결코 row에 넣지 않음 |
| Engine 작업 파일 (PaperOrchestra subprocess) | **`workspace/`** (휘발성, gitignored) | engine run을 위한 스크래치 |
| Config / gate profiles / confidentiality rules | **tracked config files** | 리뷰 가능, 버전 관리됨 |

## 방향성 (ADR-0008에서 결정)

- v1은 **SQLite single-file** governance DB + filesystem artifacts 쪽으로 기운다. governance state의 사람 친화적 diff(human-diff)가
  가치 있어지면 md-first를 재검토한다. (열린 질문.)
- 이후의 Postgres 이전이 기계적인 작업이 되도록 dialect-portable하게 유지한다(CAW-01/02와 일관됨).

## import된 출처(Imported provenance)

`Bundle` import는 **provenance manifest reference** 를 저장하여, artifact의 계보(claim → evidence → result)가
공유 store 없이도 import boundary를 가로질러 재구성될 수 있게 한다 ([confidentiality-and-provenance.md](./confidentiality-and-provenance_ko.md)).

## 수명주기 및 정리(Lifecycle & cleanup)

- `workspace/`는 run마다 비워진다. `artifacts/`는 artifact마다 보존된다.
- 재작성(Re-drafts)은 새로운 `EngineRun`을 생성한다. outputs는 run 단위로 불변(immutable)이다.

## 열린 질문(Open questions)

SQLite single-file vs directory-of-files; redaction-ruleset의 거처(vendored vs envelope-pinned) —
[../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) 참조.

## 런북(runbook)에 대한 함의

Phase-0이 governance store + `workspace/`/`artifacts/` 관례를 설정하고, engine 런북이 그 안에 기록한다.
