# Milestones & Phases

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: review date)
- **Related:** [./dependency-graph_ko.md](./dependency-graph_ko.md), [./risks-and-mitigations_ko.md](./risks-and-mitigations_ko.md), [../01-decisions/ADR-0001-product-surface-and-outputs.md](../01-decisions/ADR-0001-product-surface-and-outputs_ko.md), [../01-decisions/ADR-0006-storage-and-scheduling.md](../01-decisions/ADR-0006-storage-and-scheduling_ko.md), [../01-decisions/ADR-0007-export-boundaries.md](../01-decisions/ADR-0007-export-boundaries_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
이 문서는 CAW-05 전달을 단계와 마일스톤으로 순서 짓고, 각각에 명시적 **entry/exit** gate를 두어, 중단된 빌드가
깨끗하게 재개되도록 한다(FILES-AS-TRUTH, ADR-0006에 따른 작고 resumable한 runbook). 어떤 순서로 **무엇**이
출시되는지를 정의한다; adapter 내부([../06-interfaces/](../06-interfaces/) 참조), ranking 수학
([../01-decisions/ADR-0002-interest-model.md](../01-decisions/ADR-0002-interest-model_ko.md)), 또는 runbook 단계
([../10-runbooks/](../10-runbooks/))는 정의하지 않는다. 여기의 phase 폴더는 runbook 번호 범위와 1:1로 매핑된다
(`RB-0XX` = Phase 0, 등).

## North star
**Milestone 1 = narrow weekly radar, end-to-end**: watch-list 소스 fetch → relevance → classify → weekly
digest, **적어도 하나**의 novelty-threat finding을 CAW-03으로 export. M1 이전의 모든 것은 enabling
scaffolding이다; M1 이후의 모든 것은 커버리지를 넓히고 export 타깃을 추가한다. PRODUCT-BRIEF §12에 따라, 우리는
broad horizontal scaffolding보다 thin vertical slice(narrow + weekly)를 선호한다.

## Phase map

| Phase | Folder / RB range | Theme | Milestone |
|-------|-------------------|-------|-----------|
| P0 | `RB-0XX` | Foundations: repo, ports, store, run skeleton | M0 |
| P1 | `RB-1XX` | Interest model + watch-list source adapters (ingest) | — |
| P2 | `RB-2XX` | Relevance (BM25-first, additive, recall-floor) | — |
| P3 | `RB-3XX` | Classification/triage cascade + routing | — |
| P4 | `RB-4XX` | Synthesis (digest first) + **M1 cut** | **M1** |
| P5 | `RB-5XX` | Ledger + Semantic Scholar verification + CAW-03 export | M2 |
| P6 | `RB-6XX` | Remaining exports (CAW-02/01/06) + more formats | M3 |
| P7 | `RB-7XX` | Scheduling hardening, embedding lane (alpha), stubs | M4 |

## Phase detail (entry → exit gates)

### P0 — Foundations (M0: 아무것도 하지 않지만 깨끗한 Run)
**하나의 pipeline core(a Run)**와 **세 개의 얇은 surface**(scheduled / CLI / MCP)를 no-op skeleton으로
세운다; 모든 **port**(SourceAdapter, classifier, routing, FormatRenderer, ExportAdapter, SchedulerAdapter)를
문서화된 stub으로 정의; **FILES-AS-TRUTH** layout + SQLite index를 생성.

- **Entry:** ADR 0001/0006/0007 accept; repo 생성됨.
- **Exit:** `caw05 run --dry-run`이 zero finding에 대해 전체 pipeline shape를 end-to-end로 실행; layout
  `interests.yaml`, `findings/*.json`, `ledger/*.jsonl`이 존재; SQLite index가 빌드됨; CLI + MCP 모두 core에
  도달; tree가 green(컴파일, lint 통과). 아직 어떤 adapter도 실제 데이터를 fetch하지 않음.

### P1 — Interest model + ingest (watch-list 소스 온라인)
PRODUCT-BRIEF §6 watch list에서 seed된, 큐레이션된 **typed interest artifact**(keyword/topic/entity/author/venue,
tier + polarity)를 작성. port 뒤에 v1 SourceAdapter를 구현: arXiv + Semantic Scholar + GitHub + 큐레이션된
blog RSS + HN-light, incremental cursor(date/ETag watermark) + CORE의 multi-layer dedup. Legal/ToS-safe만.

- **Entry:** P0 exit; ADR-0002 + ADR-0003 accept.
- **Exit:** `interests.yaml` v1 커밋됨 + human-gated/versioned; 실제 Run이 모든 v1 adapter로부터 raw finding을
  full provenance(origin/date/retrieval)와 함께 `findings/*.json`로 fetch; cursor가 persist되고 두 번째 Run이
  incremental(본 항목 re-fetch 없음); 반복 Run에서 dedup verified.

### P2 — Relevance (recall-first, explainable)
**recall-first floor**(drop하기보다 surface하는 게 낫다)를 가진 **BM25-first additive explainable** relevance
score를 구현. 점수화된 각 finding은 사람이 읽을 수 있는 score breakdown을 지닌다. Embedding lane은 OFF 유지
(P7, alpha).

- **Entry:** P1 exit (interest + ingested finding 필요).
- **Exit:** 모든 finding이 score + additive explanation을 받음; recall floor가 configurable; 수동
  watch-list spot-check에서 알려진 가까운 항목이 floor 아래로 drop되지 않음(TODO(open-question: labeled recall
  target)); ranking이 파일에서 재현 가능.

### P3 — Classification / triage + routing
recall-biased **selective-review** gate(낮은 confidence에서 abstain → 사람)를 가진 **LF → LLM → human
cascade**를 통해 **two-axis taxonomy**(novelty-threat/support/adjacent/noise × signal/hype)를 구현.
knowledge / task / experiment / open-question / discard로의 deterministic **config-driven routing**. 생성된
rationale은 기록되지만 **결코 증거가 아니다**.

- **Entry:** P2 exit.
- **Exit:** finding이 두 축 + confidence + cascade stage를 지님; 낮은 confidence 항목은 auto-decide가 아니라
  사람 검토로 queue됨; routing은 config로부터 deterministic; rationale은 별도 저장되고 non-evidence로 flag됨.

### P4 — Synthesis + **Milestone 1**
FormatRenderer port를 구현하고 **digest** 포맷을 먼저 출시(나머지 네 포맷은 준비된 stub). weekly cadence를
위해 scheduled surface를 연결. **M1 cut**: 단일 weekly Run이 narrow watch list를 커버하는 digest를 생성하고
**하나의 novelty-threat** finding을 CAW-03으로 emit.

- **Entry:** P3 exit; P5 CAW-03 export seam이 최소 형태로 사용 가능(병렬로 개발될 수 있음 — DAG 참조).
- **Exit (M1):** 하나의 command/cron Run이 실제 watch-list 소스로부터 weekly digest를 생성; ≥1 finding이
  novelty-threat로 분류되고 CAW-03 RadarSignal bundle이 export 경계 너머로 write됨; 전체 Run이 중단 후
  파일로부터 resumable.

### P5 — Ledger + verification + CAW-03 export (M2)
**Semantic Scholar verification**(Levenshtein title gate + year±1 + multi-key dedup)을 갖춘 **append-only
related-work ledger**(WatchedTarget, Finding/Signal, LedgerLink + verification record)를 구현.
provenance-complete LedgerLink가 단일 감사 가능한 record다. CAW-03 novelty export를 harden.

- **Entry:** M1 출시됨(digest가 pipeline을 증명).
- **Exit (M2):** export된 모든 novelty-threat가 verification record를 가진 provenance-complete LedgerLink로
  추적됨; ledger가 append-only(`ledger/*.jsonl`); CAW-03 bundle이 signed(ADR-0007).

### P6 — Remaining exports + formats (M3)
**CAW-02**(Source/Claim/RelatedWork)와 **CAW-01/CAW-06**(open question)를 위한 ExportAdapter를 추가; 나머지
네 출력 포맷(memo, slide outline, paper-card, action brief)을 채움. shared store 없음 — file/API bundle만,
signed.

- **Entry:** M2.
- **Exit (M3):** 네 v1 export 타깃 모두 단일 ExportAdapter seam을 통해 signed bundle을 emit; 다섯 포맷 모두
  하나의 finding에서 render; 비-v1 타깃에는 문서화된 stub이 남음.

### P7 — Hardening + alpha lanes (M4)
Scheduling hardening(retry, resumable cursor, rate-limit backoff); gated **alpha**로서의 **embedding
relevance lane**(default-on 전에 labeled eval set 필요); 안전하지 않은 ingestion을 활성화하지 않으면서
문서화된 stub(Reddit, SEC/EDGAR, newsletter)을 채움.

- **Entry:** M3.
- **Exit (M4):** weekly cron이 TODO(open-question: stability window)에 걸쳐 무인 실행; embedding lane이 eval
  gate를 가진 flag 뒤에 있음; stub이 문서화되고 기본 비활성.

## Milestone summary

| Milestone | Definition of done | Proves |
|-----------|--------------------|--------|
| M0 | 모든 surface에서 no-op Run; ports + store skeleton green | 아키텍처 seam이 유지됨 |
| **M1** | watch-list 소스로부터 weekly digest + 1 novelty-threat → CAW-03 | 레이더가 end-to-end로 동작 |
| M2 | 감사 가능한 ledger + verified, signed CAW-03 export | novelty 주장이 방어 가능 |
| M3 | 모든 v1 export + 다섯 포맷 모두 | 완전한 synthesis + boundary fan-out |
| M4 | 무인 weekly cron; alpha embedding lane; 안전한 stub | 운영 성숙도 |

## Open Questions
- recall floor와 embedding lane을 위한 labeled recall target + eval set — TODO(open-question) →
  [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md).
- weekly cadence 시작 요일/시각과 무인 stability window — TODO(open-question).

## Implications for runbooks
- phase당 하나의 runbook 범위(`RB-0XX`…`RB-7XX`); 각각은 Acceptance checkpoint에서 tree를 green으로 남김.
- M1이 hard slice다 — P0–P4 runbook을 작고 resumable하게 유지; breadth(추가 source/format/export)는 P5+로
  연기하여 build-budget 중단이 레이더를 pipeline 도중에 좌초시키지 않도록.
