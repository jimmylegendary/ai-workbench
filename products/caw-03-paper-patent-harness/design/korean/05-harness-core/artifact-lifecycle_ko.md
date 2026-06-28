# Artifact Lifecycle — CAW-03

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [../04-data-layer/data-model_ko.md](../04-data-layer/data-model_ko.md), [patent-drafting-module_ko.md](./patent-drafting-module_ko.md), [../01-decisions/ADR-0008-artifact-lifecycle-and-storage_ko.md](../01-decisions/ADR-0008-artifact-lifecycle-and-storage_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF_ko.md

## 목적

`Artifact`(통제 대상인 하나의 paper 또는 하나의 patent)에 대한 상태 기계(state machine). `drafted`까지는 공유되고, 그 이후 `artifact_type`에 따라 분기한다.

## 상태

```
                       ┌────────────── paper ───────────────┐
gated → assembled → drafting → drafted → reviewed → published
                       └────────────── patent ──────────────┐
gated → assembled → drafting → drafted → reviewed → filing-gate → (filed | held)
                                              ▲
                                  patent-first interlock can HOLD publish/filing
```

| 상태 | 의미 |
| --- | --- |
| `gated` | GatedClaimSet이 존재함 (gate 통과) |
| `assembled` | engine-neutral 입력 구성됨 (papers) / patent 입력 구성됨 |
| `drafting` | engine subprocess 실행 중 |
| `drafted` | DraftResult 캡처됨 (LaTeX/PDF/scores 또는 PatentDraft) + provenance |
| `reviewed` | review 체크리스트 + 점수 기록됨 |
| `published` (paper) | Sink을 통해 emit됨 (public-safe), interlock 해제됨 |
| `filing-gate` (patent) | filing 준비됨; 사람/counsel 대기 |
| `held` | patent-first interlock 또는 confidentiality fail-closed로 차단됨 |

## 전이별 불변식

- `gated → assembled`: gate를 거치지 않은 claim을 거부한다.
- `drafted → published`: confidentiality redaction (fail-closed) **그리고** held 상태의 interlock이 없을 것 ([../04-data-layer/confidentiality-and-provenance_ko.md](../04-data-layer/confidentiality-and-provenance_ko.md)).
- `reviewed → filing-gate`: 절대 자동 filing하지 않는다; 사람/counsel이 필요하다.

## Provenance & 불변성(immutability)

각 `drafting` 실행은 새로운 `EngineRun`이다; 출력은 실행별로 불변(immutable)이다. artifact는 `GatedClaimSet`, `FigureTableManifest`, review 결과를 유지하여 완전한 재구성 가능성을 확보한다.

## 미해결 질문

CAW-02 번들이 대체될 때 진행 중(in-flight)인 artifact의 re-gating (poll/webhook/re-import-on-build) — [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md)를 참고하라.

## runbook에 대한 함의

lifecycle/publish runbook은 상태 기계 + 전이별 불변식(gate, interlock, confidentiality)을 구현한다.
