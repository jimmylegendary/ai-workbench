# Open Questions (추적 목록) — CAW-03

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [research-plan.md](./research-plan_ko.md), [../01-decisions/](../01-decisions/)의 모든 ADR, [../02-research/](../02-research/)의 모든 research
- **Source of truth:** ../_meta/PRODUCT-BRIEF_ko.md

## 목적

research 문서 + ADR에서 취합한 단일 추적 목록.

## 추적 대상 질문

| ID | 질문 | Owner | 해결 시점 | 상태 |
| --- | --- | --- | --- | --- |
| OQ-01 | PaperOrchestra **non-interactive entrypoint** — headless PO CLI가 존재하는가, 아니면 CAW-03가 LLM/web/vision 단계를 위해 agent runner를 내장하는가? | [ADR-0002](../01-decisions/ADR-0002-writing-engine-integration_ko.md) | phase-2 | open |
| OQ-02 | PO **version/schema pinning** (outline.json / citation_pool.json) 정책 | ADR-0002 | phase-0 | open |
| OQ-03 | PO PlotOn/PlotOff 전반에 걸친 신뢰할 수 있는 **figure_id ↔ result_id** 바인딩 | ADR-0002 | phase-2 | open |
| OQ-04 | non-PO 엔진이 재사용할 수 있도록 하는 정확한 **engine-neutral IdeaDoc/ExpLog schema** | ADR-0002 | phase-1 | open |
| OQ-05 | PO 중간 산출물(outline.json 등)이 저장 전에 **confidentiality filter**를 거쳐야 하는가? | [ADR-0007](../01-decisions/ADR-0007-confidentiality-and-boundary_ko.md) | phase-2 | open |
| OQ-06 | **Claim typing** P1/P2/P3를 자동 추론(사람 확인)할 것인가, 사람이 직접 지정할 것인가 | [ADR-0003](../01-decisions/ADR-0003-evidence-gate-and-claim-ledger_ko.md) | phase-1 | open |
| OQ-07 | **venue별 최소 trust** (P1 paper claim에 T1이면 충분한가?) | ADR-0003 | phase-1 | open |
| OQ-08 | CAW-02 bundle이 대체되었을 때 진행 중인 산출물에 대한 **Re-gating** (poll/webhook/re-import) | ADR-0003 | phase-1 | open |
| OQ-09 | patent **§112 enablement** 검사는 누가 담당하는가 (harness rule / 사람 / PatentEngine)? | [ADR-0004](../01-decisions/ADR-0004-patent-drafting_ko.md) | phase-2 | open |
| OQ-10 | **Jurisdiction** (grace vs absolute-novelty) + provisional-first 전략 + counsel hand-off SLA/format | ADR-0004 | phase-2 | open |
| OQ-11 | harness가 **101/eligibility** 리스크를 플래그할 수 있는가, 아니면 전적으로 미룰 것인가? | ADR-0004 | phase-2 | open |
| OQ-12 | 여러 SourceAdapter 전반의 **Source fan-in** 우선순위 + provenance 병합 | [ADR-0005](../01-decisions/ADR-0005-ports-and-adapters_ko.md) | phase-1 | open |
| OQ-13 | **Sync vs async** 엔진 실행 (job-handle/poll) → WritingEngine port 시그니처 | ADR-0005 | phase-2 | open |
| OQ-14 | Adapter **discovery** (entry-point group vs manifest) + SemVer/compat 정책 | ADR-0005 | phase-0 | open |
| OQ-15 | 공유 substrate가 없다는 점을 고려한 adapter별 **secrets/auth** 모델 (env refs만?) | ADR-0005 | phase-1 | open |
| OQ-16 | **Novelty**는 단일 port인가, 아니면 분리(related-work vs threat/radar)되는가? | ADR-0005/[ADR-0006](../01-decisions/ADR-0006-paper-ladder-and-novelty_ko.md) | phase-3 | open |
| OQ-17 | CAW-05의 scorer에 의존하지 않는 Novelty **overlap threshold + embedding** | ADR-0006 | phase-3 | open |
| OQ-18 | CAW-05 신호가 **CAW-03 claim id에 맞물리는가, CAW-02 id에 맞물리는가** (re-map)? | ADR-0006 | phase-3 | open |
| OQ-19 | **Prior-art query confidentiality** — public-only claim text + query redaction | ADR-0006/ADR-0007 | phase-3 | open |
| OQ-20 | patent egress를 위한 'internal' 위의 **'counsel' tier** + 해당 redaction profile | ADR-0007 | phase-2 | open |
| OQ-21 | **Redaction-ruleset home** (vendored+pinned vs envelope-pinned; 공유 의존성 없음) | ADR-0007 | phase-0 | open |
| OQ-22 | **Reclassification authority** (local clearance vs CAW-02 re-import) | ADR-0007 | phase-2 | open |
| OQ-23 | **Storage shape** SQLite 단일 파일 vs dir-of-files; md-first 거버넌스? | [ADR-0008](../01-decisions/ADR-0008-artifact-lifecycle-and-storage_ko.md) | phase-0 | open |
| OQ-24 | **blocked claims**를 first-class backlog로 영속화 (yes로 기울어짐) | ADR-0003 | phase-1 | open (lean yes) |

## 프로세스

해당 질문을 소유하는 ADR/문서에 결정을 기록하고 Status를 `resolved`로 전환하여 질문을 종료한다.

## runbook에 대한 함의

Gating 질문(OQ-01/02 engine, OQ-10 patent-first, OQ-14 discovery, OQ-21/23 storage)은 의존 작업에 앞서 해당
phase의 첫 runbook에서 반드시 해결되어야 한다.
