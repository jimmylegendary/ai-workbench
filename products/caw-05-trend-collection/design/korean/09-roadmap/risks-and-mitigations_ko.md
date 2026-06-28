# Risks & Mitigations

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: review date)
- **Related:** [./milestones-and-phases_ko.md](./milestones-and-phases_ko.md), [./dependency-graph_ko.md](./dependency-graph_ko.md), [../01-decisions/ADR-0002-interest-model.md](../01-decisions/ADR-0002-interest-model_ko.md), [../01-decisions/ADR-0003-source-adapters-and-ingestion.md](../01-decisions/ADR-0003-source-adapters-and-ingestion_ko.md), [../01-decisions/ADR-0004-classification-and-triage.md](../01-decisions/ADR-0004-classification-and-triage_ko.md), [../01-decisions/ADR-0007-export-boundaries.md](../01-decisions/ADR-0007-export-boundaries_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
이 문서는 CAW-05의 전달 + 운영 리스크와 설계에 내장된 구체적 완화책을 열거한다. 핵심 ADR 선택들(recall-first,
legal-only 소스, 생성-요약≠증거, stub을 가진 ports, export 경계, resumable runbook)이 *왜* 존재하는지를
설명한다. 그 결정들을 재유도하지 않는다 — 그것들로 링크한다.

## Risk register

| ID | Risk | Likelihood | Impact | Mitigation (design hook) |
|----|------|-----------|--------|--------------------------|
| R1 | **가까운 paper/repo를 놓침 → novelty 손실**(BRIEF §1에 따라 존재론적) | Med | **Critical** | High-recall 태세: recall-first relevance floor + recall-biased selective-review gate; watch-list 커버리지 감사 |
| R2 | **소스 ToS / rate limit / 차단** | Med | High | Legal/ToS-safe만 adapter; source별 rate budget + backoff; incremental cursor; 위험 소스에 대한 문서화된 stub |
| R3 | **Hype false positive**(요란하지만 알맹이 없는 signal이 threat로 route됨) | High | Med | 두 번째 taxonomy 축(signal vs hype); LF→LLM→human cascade; export 전 사람이 novelty-threat를 확정 |
| R4 | **Export coupling**(shared substrate로의 drift) | Low | High | 단일 ExportAdapter seam; signed file/API bundle; shared store 없음(ADR-0007); 독립성 계약 |
| R5 | **Build-budget 중단**이 절반만 지어진 pipeline을 좌초시킴 | High | Med | 작은 resumable runbook; FILES-AS-TRUTH + append-only ledger; 각 Acceptance checkpoint에서 green tree |
| R6 | **생성 요약을 증거로 오인** | Med | High | rationale 별도 저장, non-evidence로 flag; LedgerLink는 요약이 아니라 source provenance를 지님 |
| R7 | **False novelty export**(잘못된/중복 paper가 CAW-03으로 전송됨) | Med | High | Semantic Scholar verification(Levenshtein title gate + year±1 + multi-key dedup); provenance-complete LedgerLink 필수 |
| R8 | **Interest drift / stale watch list** | Med | Med | 큐레이션된 typed interest artifact; human-gated VERSIONED 업데이트; narrow watch list에서 seed |
| R9 | **run 간 중복/노이즈 finding** | High | Low | CORE의 multi-layer dedup + run 간 cursor watermark |
| R10 | **cascade의 LLM 비용/지연** | Med | Med | LF stage가 LLM 전에 필터; LLM은 불확실한 항목에만; digest-first 범위가 볼륨을 narrow하게 유지 |
| R11 | **Embedding lane의 과대 약속**(불투명하고 검증되지 않은 ranking) | Med | Med | Embedding lane은 alpha, labeled eval set에 flag-gated; BM25 explainable score가 기본 유지 |

## load-bearing 리스크 상세

### R1 — Novelty 손실 (레이더가 존재하는 이유 전부)
단 하나의 놓친 가까운 결과가 control-plane / paper 전략의 novelty를 지울 수 있다. 설계는 모든 recall/precision
trade-off를 **recall** 쪽으로 편향시킨다:
- **Relevance:** **recall-first floor**를 가진 additive explainable score — borderline 항목은 drop이 아니라
  surface된다(ADR-0002).
- **Triage:** recall-biased **selective-review** gate — 낮은 confidence 항목은 **abstain → 사람**, 결코 silent
  discard 아님(ADR-0004).
- **Coverage:** Run당 watch-list 커버리지 검사가 각 PRODUCT-BRIEF §6 타깃이 v1 source 집합 전반에 걸쳐
  query되었음을 확인. TODO(open-question: recall target + labeled eval set 정의) →
  [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md).
- **수용한 trade:** 더 많은 노이즈/사람 검토 볼륨; R3/R10 control로 완화됨.

### R2 — 소스 ToS & rate limit
- 법적/ToS-safe ingestion만(BRIEF §12). 유료 / ToS 위반 소스는 **out** — 활성화된 adapter가 아니라 문서화된
  stub이 된다(ADR-0003).
- 각 SourceAdapter는 rate budget을 선언; CORE가 backoff + retry를 강제; incremental cursor(date/ETag)가 요청
  볼륨을 최소화.
- 소스가 어두워지면 우아하게 degrade(다른 adapter는 계속 실행); Run이 어떤 소스가 건너뛰어졌는지 기록.

### R3 — Hype false positive
- taxonomy의 **signal vs hype** 축은 정확히 요란하지만 알맹이 없는 항목을 잡기 위해 존재한다.
- **LF → LLM → human cascade**는 novelty-threat export가 사람에 의해 확정됨을 의미한다; 생성된 rationale은
  기록되지만 **결코 증거가 아니다**(R6).

### R4 — Export coupling
- ExportAdapter가 **유일한** export seam이다; CAW-02/03/01/06로의 bundle은 signed되며 명시적 file/API 경계
  너머로 write된다. shared store, registry, runtime substrate 없음(ADR-0007, 독립성 계약).
- Revisit 트리거: 다른 제품의 DB를 직접 읽으려는 모든 제안 = 중단, 경계 위반이다.

### R5 — Build-budget 중단
- runbook은 작고, 단일 목적이며, [dependency graph](./dependency-graph_ko.md)로 순서 지어진다; 각각은
  Acceptance checkpoint에서 tree를 green으로 남긴다.
- 상태는 FILES-AS-TRUTH(`interests.yaml`, `findings/*.json`, append-only `ledger/*.jsonl`) + rebuildable
  SQLite index이므로, Run — 그리고 빌드 — 은 메모리가 아니라 디스크에서 재개된다(ADR-0006).
- M1은 의도적으로 가장 작은 end-to-end slice여서 중단이 결코 레이더를 동작 불능 상태로 남기지 않는다.

## Revisit triggers
- recall 감사가 알려진 가까운 항목이 drop되었음을 보임 → floor를 조이거나 소스 추가(R1).
- 소스가 ToS/rate 경고를 발행 → stub으로 demote, 문서화(R2).
- 사람 검토 queue 볼륨이 용량 초과 → recall floor가 아니라 cascade threshold를 재튜닝(R1/R3/R10).
- cross-product 직접 읽기가 제안됨 → 거부; export 경계 재확인(R4).

## Open Questions
- recall target + labeled eval set(relevance + embedding lane과 공유) — TODO(open-question).
- selective-review gate를 위한 사람 검토 SLA / queue 용량 — TODO(open-question).
- export 경계 너머의 bundle signing 메커니즘 + key 처리 — TODO(open-question).

## Implications for runbooks
- 모든 runbook의 **Rollback / safety** 섹션은 FILES-AS-TRUTH + append-only ledger에 의존한다(R5).
- Adapter runbook은 rate budget + ToS note를 인코딩해야 하며 위험 소스는 비활성 stub으로 출시해야 한다(R2).
- novelty-export runbook은 CAW-03 bundle을 write하기 전에 provenance-complete, S2-verified LedgerLink에서
  block해야 한다(R7).
