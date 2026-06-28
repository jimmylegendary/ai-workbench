# 런북 — CAW-06 (AI Future / TTT 연구 자동화)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [./runbook-conventions_ko.md](./runbook-conventions_ko.md), [../09-roadmap/milestones-and-phases_ko.md](../09-roadmap/milestones-and-phases_ko.md), [../09-roadmap/dependency-graph_ko.md](../09-roadmap/dependency-graph_ko.md), [../_meta/PRODUCT-BRIEF_ko.md](../_meta/PRODUCT-BRIEF_ko.md), [../_meta/DOC-CONVENTIONS_ko.md](../_meta/DOC-CONVENTIONS_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적
이 폴더는 **AI 빌더가 실행하는 빌드 지침**을 담고 있으며, 이를 통해 CAW-06 — 독립적인 AI-future / TTT 연구 자동화 제품 — 을 구축합니다. 각 런북(`RB-XXX`)은 [DOC-CONVENTIONS §6](../_meta/DOC-CONVENTIONS_ko.md)의 STRICT 형식을 따르는 하나의 응집된, 검증 가능한 빌드 단위입니다. 이 README는 **인덱스 + 실행 순서 + 게이트 맵**입니다. 설계(`../01-decisions/`의 ADR 참조)나 스키마(`../05-ttt-research-core/` 참조)를 결정하지는 않습니다. 빌더가 실제 코드를 작성하며, 런북의 코드 블록은 가이드일 뿐입니다.

## 이 런북들이 구축하는 것
하나의 파이프라인 코어 — **ExperimentScout Run**: `discover → import (CAW-05로부터) → dedup → extract claims → hypothesize → plan + run toy experiment → log → implication map → writeback schema → export` — 을 **3개의 얇은 표면**(스케줄/트리거 파이프라인, CLI, MCP) 뒤에 두고, **5종의 출력 산출물**(research-thread 레코드, experiment ledger 항목, hypothesis 카드, implication map, writeback-traffic 스키마 번들)을 생성합니다. 스토어는 **CAW-06 자체의 것**이며, 모든 export는 **공유 스토어 없이(no shared store)** 명시적 경계를 넘습니다.

## 실행 순서 & 게이트
런북은 [dependency-graph.md](../09-roadmap/dependency-graph_ko.md)에 따라 위상 정렬됩니다. 번호 오름차순으로 실행하며, 한 런북은 DAG 상류의 런북만 `Depends on:`할 수 있습니다. **이전 phase의 종료 게이트([milestones-and-phases.md](../09-roadmap/milestones-and-phases_ko.md)에 있음)가 녹색이 되기 전까지는 다음 phase를 시작하지 마세요.** 중단된 빌드가 깔끔하게 재개되도록, 모든 Acceptance 체크포인트에서 트리가 컴파일 + lint 통과 상태로 유지되게 하세요.

DAG에서 도출된 엄격한 순서 규칙:
- **R1** 모든 것에 앞서 스토어 레이아웃 + 레코드 스키마.
- **R2** 어댑터에 앞서 포트(먼저 stub을 문서화하고, `NotImplemented` 스타일 가드를 발생시킴).
- **R3** experiment에 앞서 ingestion(S1–S5) + hypothesis.
- **R4** export에 앞서 experiment ledger + writeback 스키마.
- **R5** `Caw01WritebackAdapter`에 앞서 `wbtraffic.v0` 스키마.
- **R6** finding이 존재한 이후에 implication map.

## Phase 표

| Phase | 폴더 | 테마 | 런북 | 종료 게이트 (요약) |
|-------|--------|-------|----------|---------------------|
| P0 Foundations | `phase-0-foundations/` (`RB-0XX`) | 스토어 레이아웃, 도메인 레코드, 포트(어댑터 없음) | RB-001 스토어 레이아웃; RB-002 레코드 스키마 + 검증기(Source/Claim/Hypothesis/Ledger/Implication); RB-003 세 개의 포트 인터페이스 + 문서화된 stub | `store/{sources,claims,hypotheses,ledger,implications}` 라운드트립; 모든 레코드 종류가 스키마+검증기 보유; 3개 포트가 `NotImplemented`를 발생시키는 stub로 컴파일; 트리 녹색 (ADR-0007, ADR-0001) |
| P1 Ingestion + Hypothesis | `phase-1-ingestion-and-hypothesis/` (`RB-1XX`) | S1–S5 파이프라인; claim → hypothesis | RB-101 `SourceAdapter` v1 (arXiv/Sem.Scholar + CAW-05 import); RB-102 ingestion S1–S5 (discover→import→dedup→extract→persist), 멱등 + 재개 가능; RB-103 hypothesis 레코드 (4-state status, 보정된 불확실성, evidence cap) | 실제 소스로부터 하나의 thread가 persist됨; Hypothesis 기본값 `hypothesis` + 정성적 불확실성; 재실행 시 중복 없음; status/uncertainty가 제거된 채로 경계를 넘는 것 없음 (ADR-0002, ADR-0005) |
| P2 Experiment | `phase-2-experiment/` (`RB-2XX`) | 사전 등록된 toy 실험 | RB-201 `ExperimentRunnerAdapter` v1 (최소 로컬 러너); RB-202 ledger 항목 (사전 등록된 결정 규칙 → 4-value verdict, append-only); RB-203 reproducibility gate (config+seed+env) + 네거티브 결과 분류/노출 | 사전 등록된 규칙, 4-value verdict, 통과하는 reproducibility gate를 갖춘 하나의 `ledger/EXP-XXXX` append-only 항목; 의도적으로 실패하는 run이 기록 + 분류 + 기본 노출됨 (ADR-0003) |
| P3 Writeback + Implication | `phase-3-writeback-and-implication/` (`RB-3XX`) | Implication map; `wbtraffic.v0` L0 추정 | RB-301 ADR-0006 도메인 전반의 ImplicationMap (generated-summary 플래그); RB-302 `wbtraffic.v0` analytic L0 추정 (모든 필드 존재, 수치 기본값 `TODO(open-question)`, basis 표기, open questions, CAW-01 IR 이름 재확인) | 하나의 ImplicationMap + 하나의 자기 기술적 writeback 번들, modeled-vs-measured 표기, CAW-01에 대해 CAW-01 IR 이름 재확인 (ADR-0006, ADR-0004) |
| P4 Export + Schedule | `phase-4-export-and-schedule/` (`RB-4XX`) | ExportAdapter v1; 표면 강화 | RB-401 ExportAdapter 레지스트리 + `Caw01WritebackAdapter` (번들 + open questions → 경계 경로); RB-402 `Caw02ClaimAdapter` (claims + evidence → 경계 경로) + 비활성 문서화 stub; RB-403 스케줄/트리거 scout + CLI + MCP 표면을 하나의 코어 위에 | 두 어댑터가 경계 번들을 단방향으로(공유 스토어 없이) 방출; stub은 등록되었으나 비활성; 표면이 동일한 코어를 감쌈; M1 체크리스트 완전 녹색 (ADR-0008, ADR-0001) |

> phase 내 런북 번호는 빌더의 로컬 시퀀스이며, 이 표는 최소 단위를 나열합니다. 단위를 분할하는 것은 각 분할이 트리를 녹색으로 유지하고 원자적으로 검증 가능할 때만 하세요.

## Milestone 1 — 검증 슬라이스 (LOAD-BEARING)
M1은 RB-1XX..RB-4XX를 관통하는 수용(acceptance) 척추입니다: 하나의 검증 가능한 TTT claim이 전체 thread를 거쳐, CAW-01(별개의 제품)을 위한 exported `wbtraffic.v0` analytic 추정을 생성합니다. 체인:

```
RB-001/002/003 (store + schemas + ports)
  → RB-101 SourceAdapter v1 → RB-102 ingest S1..S5 → RB-103 hypothesis (status=hypothesis)
  → RB-201 runner v1 → RB-202 ledger entry (verdict) + RB-203 reproducibility gate
  → RB-301 ImplicationMap (generated-summary flagged)  +  RB-302 wbtraffic.v0 (analytic L0)
  → RB-401 Caw01WritebackAdapter → [boundary path] CAW-01
```

M1은 **toy experiment가 claim을 refute하거나 에러를 내더라도 성공합니다** — thread, 기록된 네거티브 결과, 그리고 open-question을 동반한 추정이 산출물이며, 긍정적 finding이 아닙니다. ImplicationMap은 finding에 매달려 있으며 체크리스트가 닫히기 전에 합류하지만, 스키마→CAW-01 임계 경로 밖에 있습니다. 전체 done-체크리스트는 [milestones-and-phases.md §Milestone 1](../09-roadmap/milestones-and-phases_ko.md)에 있습니다.

## 빌더 규율 (런북 실행 전 필독)
전체 규칙은 [runbook-conventions.md](./runbook-conventions_ko.md)를 참조하세요. 타협 불가 사항:
- **No overclaim** — 4-state status 생애주기를 준수; hypothesis는 결코 확정된 claim이 아님.
- **Evidence cap** — generated evidence는 결코 hypothesis의 status를 승격할 수 없음.
- **Failures useful** — 네거티브 결과는 보존, 분류, 기본 노출됨.
- **Reproducibility gate** — config+seed+env가 캡처되지 않으면 ledger 항목 없음.
- **Writeback은 CAW-01로의 export** — CAW-01의 L0 객체 + open questions 위로 lower되는 자기 기술적 번들; 단방향 push, 공유 스토어 없음, CAW-01 IR 이름 재확인.
- **Generated summary는 evidence가 아님** — generated로 표기.
- **Stub은 `NotImplemented`** — 문서화, 등록, 비활성.
- 모든 Acceptance 체크포인트에서 **트리를 녹색으로 유지**.

## 예산 규율
넓은 스캐폴딩보다 **가장 작은 수직 슬라이스**를 선호하세요(brief §12). 각 런북에서: phase 표에 명명된 v1 단위만 빌드하고, 폭(여러 SourceAdapter, 5–10개 테마, toy-grounded 그라운딩, 추가 export stub)은 M2–M4로 미룹니다. 수치, 날짜, 벤치마크 값을 지어내지 마세요 — 미지의 것은 `TODO(open-question: ...)`입니다. Toy experiment는 최소 재현일 뿐이며, v1은 대규모 학습이나 실제 TTT를 대규모로 수행하지 않습니다. 모든 compute 바이트와 모든 모델 호출은 하나의 M1 체크박스를 닫는 데 기여해야 합니다.
