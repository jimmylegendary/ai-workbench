# 의존성 그래프 — CAW-03

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [milestones-and-phases.md](./milestones-and-phases_ko.md), [../10-runbooks/README.md](../10-runbooks/README_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적

runbook이 유효한 순서로 실행되도록 단계(phase)/컴포넌트 간의 의존성 DAG를 정의한다.

## 단계(Phase) DAG

```
phase-0 (core skeleton + ports + registry/preflight + governance store + fakes)
   │
   ▼
phase-1 (ledger import + GATE + assembly + confidentiality)         ← gate before anything drafts
   │
   ▼
phase-2 (WritingEngine=PaperOrchestra adapter + orchestration; Patent path + patent-first interlock)
   │
   ├──► phase-3 (novelty + paper ladder; CAW-05 import)
   │
   ▼
phase-4 (publish/sink + lifecycle + review; documented stubs: wiki/exp-server/venue/filing)
```

## 컴포넌트 의존성

```
ports + registry/preflight ──► every adapter
GATE + claim ledger ──► input assembly ──► engine draft ──► review ──► publish
confidentiality ──► import AND publish (fail-closed)
patent-first interlock ──► publish (default-deny)         ← interlock must exist before any publish
citation_pool (engine output) + CAW-05 import ──► novelty ──► claim flags ──► interlock
SourceAdapter (CAW-02/01) ──► ledger ; future wiki/exp-server = stubs behind same port
```

## Milestone 1까지의 임계 경로(critical path)

```
phase-0 ─► phase-1 (gate+assembly) ─► phase-2 (PaperOrchestra adapter + orchestration)
        ─► review ─► publish(PDF)        = one evidence-gated paper (UC-1 / T8)
```

Patent path, novelty/ladder, 그리고 향후 커넥터 stub은 Milestone-1의 임계 경로에서 벗어나 있다.

## 하드 게이트(Hard gates)

| Gate | 차단 대상 |
| --- | --- |
| ports + registry + lint/CI (phase-0) | 모든 adapter |
| GATE implemented + tested (phase-1) | 모든 assembly/draft |
| patent-first interlock (phase-2) | 모든 publish |
| confidentiality fail-closed (phase-1) | 모든 export |

## 열린 질문(Open questions)

엔진 결합도를 고려할 때 phase-3 (novelty)가 phase-2와 완전히 병렬로 진행될 수 있는지 —
[../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) 참고.

## runbook에 대한 함의

각 runbook의 `Depends on:`은 이 DAG를 반영해야 한다. 어떤 publish runbook도 interlock + confidentiality 이전에 출시되지 않는다.
