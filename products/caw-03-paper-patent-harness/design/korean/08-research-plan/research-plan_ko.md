# Research Plan — CAW-03

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [validation-and-tests.md](./validation-and-tests_ko.md), [open-questions.md](./open-questions_ko.md), [../02-research/](../02-research/)
- **Source of truth:** ../_meta/PRODUCT-BRIEF_ko.md

## 목적

빌드와 병행하여 진행되는 불확실성 감소 backlog로, 각 항목은 ADR + phase에 연결된다.

## Research 트랙

| # | 트랙 | 질문 | 연결 대상 | 해결 시점 |
| --- | --- | --- | --- | --- |
| R1 | PaperOrchestra invocation | non-interactive entrypoint + LLM/web/vision 단계를 headless로 누가 실행하는가 | [ADR-0002](../01-decisions/ADR-0002-writing-engine-integration_ko.md) | phase-2 |
| R2 | PaperOrchestra versioning | suite pin + outline.json/citation_pool schema (EngineDescriptor.version) | ADR-0002 | phase-0/2 |
| R3 | Claim typing | P1/P2/P3 자동 추론(사람 확인) vs 사람이 직접 지정 | [ADR-0003](../01-decisions/ADR-0003-evidence-gate-and-claim-ledger_ko.md) | phase-1 |
| R4 | Gate thresholds | claim type별 + venue별 최소 trust/evidence | ADR-0003 | phase-1 |
| R5 | Jurisdiction & patent-first | grace vs absolute-novelty 기본값; provisional-first; counsel hand-off | [ADR-0004](../01-decisions/ADR-0004-patent-drafting_ko.md) | phase-2 |
| R6 | Source fan-in | 여러 SourceAdapter가 활성일 때 우선순위 + provenance 병합 | [ADR-0005](../01-decisions/ADR-0005-ports-and-adapters_ko.md) | phase-1 |
| R7 | Sync vs async engine | blocking draft() vs job-handle/poll (port 시그니처) | ADR-0005 | phase-2 |
| R8 | Novelty threshold | CAW-05의 scorer에 의존하지 않는 overlap threshold + embedding | [ADR-0006](../01-decisions/ADR-0006-paper-ladder-and-novelty_ko.md) | phase-3 |
| R9 | Prior-art confidentiality | 제3자 API에 보내기 전 query text redaction; public-only | ADR-0006/[ADR-0007](../01-decisions/ADR-0007-confidentiality-and-boundary_ko.md) | phase-3 |
| R10 | Redaction ruleset home | vendored+pinned vs envelope-pinned (공유 의존성 없음) | ADR-0007 | phase-0 |
| R11 | Storage shape | SQLite 단일 파일 vs dir-of-files; 거버넌스를 위한 md-first? | [ADR-0008](../01-decisions/ADR-0008-artifact-lifecycle-and-storage_ko.md) | phase-0 |

## 방법

- 각 트랙은 문서 업데이트(결정 기록) 또는 acceptance gate를 갖춘 spike runbook으로 해결된다.
- 발견 사항은 소유 ADR을 갱신하고 [open-questions.md](./open-questions_ko.md)의 해당 행을 정리한다.

## 빌드 대비 시퀀싱

```
phase-0  ── R2, R10, R11
phase-1  ── R3, R4, R6
phase-2  ── R1, R5, R7
phase-3  ── R8, R9
```

## runbook에 대한 함의

R1/R2는 engine adapter를 gate하고, R5는 patent path를 gate하며, R8/R9는 novelty runbook을 gate한다.
