# 마일스톤 & 단계(Milestones & Phases)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: review date)
- **Related:**
  - [./dependency-graph.md](./dependency-graph_ko.md)
  - [./risks-and-mitigations.md](./risks-and-mitigations_ko.md)
  - [../01-decisions/ADR-0001-product-surface.md](../01-decisions/ADR-0001-product-surface_ko.md)
  - [../01-decisions/ADR-0002-writing-engine-integration.md](../01-decisions/ADR-0002-writing-engine-integration_ko.md)
  - [../01-decisions/ADR-0003-evidence-gate-and-claim-ledger.md](../01-decisions/ADR-0003-evidence-gate-and-claim-ledger_ko.md)
  - [../01-decisions/ADR-0004-patent-drafting.md](../01-decisions/ADR-0004-patent-drafting_ko.md)
  - [../01-decisions/ADR-0005-ports-and-adapters.md](../01-decisions/ADR-0005-ports-and-adapters_ko.md)
  - [../01-decisions/ADR-0008-artifact-lifecycle-and-storage.md](../01-decisions/ADR-0008-artifact-lifecycle-and-storage_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적

이 문서는 CAW-03의 구축 작업을 runbook 폴더(`10-runbooks/phase-N-*`)와 일대일로 대응되는 **단계(phase)**로
순서화하고, PaperOrchestra를 래핑하여 생산되는 첫 번째 end-to-end evidence-gated *paper*를 **Milestone 1**로
고정한다. AI 빌더가 예산 중단 이후에도 깔끔하게 재개할 수 있도록 단계별 **진입/종료 기준(entry/exit
criteria)**을 정의한다. DAG를 엣지 단위로 정의하지는 않으며(([dependency-graph.md](./dependency-graph_ko.md)) 참고),
리스크를 열거하지도 않는다(([risks-and-mitigations.md](./risks-and-mitigations_ko.md)) 참고).

## 단계화 원칙(Phasing principle)

- **수직으로 슬라이스하고, 첫날부터 거버넌스를 적용한다.** 모든 단계는 트리를 green 상태로 남겨두어
  (컴파일됨, lint 통과, ops-manifest 유효) 중단된 빌드가 마지막으로 수락된 runbook부터 재개되도록 한다 —
  [DOC-CONVENTIONS §6](../_meta/DOC-CONVENTIONS_ko.md) 참고.
- **adapter보다 port 먼저, engine보다 거버넌스 먼저, publish보다 engine 먼저.** 이것이 DAG가 강제하는
  하중 지지(load-bearing) 순서다.
- **Milestone 1은 paper 전용이다.** Patent path, novelty 거버넌스, 그리고 향후 커넥터 stub은 후속 단계에
  안착한다. 이 모두를 위한 *seam(이음매)*은 Phase 1(ADR-0005)부터 존재하지만, M1에서는 paper adapter만 구현된다.

## 단계 → runbook 폴더 매핑

| Phase | Runbook 폴더 | 테마 | Milestone |
| --- | --- | --- | --- |
| 0 | `phase-0-foundations` | Repo, storage, ops-manifest 골격, config registry | — |
| 1 | `phase-1-ports-registry` | 5개의 driven port + capability descriptor + preflight + documented stub | — |
| 2 | `phase-2-gate-and-ledger` | CAW-02 ledger import, claim 타이핑, evidence gate (fail-closed) | — |
| 3 | `phase-3-assembly` | CAW-01 result import, engine-neutral input bundle, figure↔result provenance | — |
| 4 | `phase-4-writing-engine` | PaperOrchestra WritingEngineAdapter (subprocess), 출력 캡처 | — |
| 5 | `phase-5-review-publish` | Review 체크리스트 op + LaTeX/PDF Sink + public-safe export | **M1** |
| 6 | `phase-6-novelty-ladder` | CAW-05 Novelty/Radar adapter, P1/P2/P3 ladder, threatened 플래깅 | M2 |
| 7 | `phase-7-patent` | PatentEngine port + baseline drafter + patent-first publish interlock | M3 |
| 8 | `phase-8-surfaces` | 전체 API + MCP + CLI + 최소 review/status UI 하드닝 | M4 |
| 9 | `phase-9-stubs-future` | Wiki / experiment-server / venue / filing 커넥터 stub을 adapter로 구체화 | M5 |

> Phase 0–5는 M1까지의 임계 경로다. Phase 6–9는 M1의 핵심 port/registry가 존재하면 병렬화 가능하다.

## Milestone 1 — 첫 evidence-gated paper (핵심 목표)

**완료 정의(Definition of done):** 운영자가 단일 artifact에 대해 harness를 실행하면, 모든 claim이
evidence gate를 통과하고 CAW-02 claim → CAW-01 result → PDF 내 figure로 이어지는 provenance가 보존된,
컴파일되고 public-safe한 PDF를 얻는다.

M1 op-chain(각각은 ADR-0001 manifest의 governed op이며, 해당 동작을 수행하는 *유일한* 방법이다):

```
import_bundle      # CAW-02 SourceAdapter -> referenced claim ledger
  -> build_ledger  # typed claims P1/P2/P3, evidence links (refs only, never re-owned)
  -> gate_claims   # evidence gate, fail-closed; blocked claims -> backlog
  -> assemble_inputs   # GATED claims + CAW-01 result refs -> engine-neutral bundle
  -> draft_paper       # WritingEngineAdapter (PaperOrchestra, subprocess)
  -> review            # review checklist op (human gate)
  -> publish/export    # LaTeX/PDF Sink, public-safe only
```

**M1이 명시적으로 제외하는 것:** patent path, CAW-05 novelty import, paper-ladder 포트폴리오 자동화,
그리고 모든 향후 커넥터. 그들의 port는 존재하지만 adapter는 존재하지 않는다.

**M1 불변식 검사(반드시 성립해야 함):**
- 생성된 텍스트는 절대 evidence로 수락되지 않는다(gate가 범주적으로 거부한다).
- gate를 통과하지 못한 claim은 `assemble_inputs`에 도달할 수 없다(precondition이 차단한다).
- Export는 public-safe하다: confidentiality boundary가 CAW-02로부터 그대로 상속된다(ADR-0007).
- 양방향 provenance `figure_id ↔ result_id`가 figure/table manifest에서 왕복(round-trip)된다.

## 단계별 진입 / 종료 기준

### Phase 0 — Foundations
- **Entry:** PRODUCT-BRIEF + ADR 수락됨; 빈 repo.
- **Exit:** ops-manifest stub이 모든 governed op을 not-implemented로 나열함; CAW-03 소유 데이터
  (ledger ref, artifact state, manifest, registry)에 대한 SQLite/파일 storage 스키마가 컴파일됨;
  config registry가 로드됨. 트리 green.

### Phase 1 — Ports & registry
- **Entry:** Phase 0 종료.
- **Exit:** 5개의 driven port 모두(Source, WritingEngine, PatentEngine, Sink/Publish,
  Novelty/Radar)가 **capability descriptor**를 갖는 typed interface로 정의됨; config 기반
  registry가 port→adapter를 해석함; **preflight**가 필요한 capability가 descriptor에 없는 adapter를
  거부함; 모든 향후 adapter가 **documented stub**(interface + not-implemented 마커 + config 예시)으로
  존재함. Core는 port에만 의존한다.

### Phase 2 — Gate & ledger
- **Entry:** Phase 1 종료(SourceAdapter 계약 존재).
- **Exit:** `import_bundle`이 CAW-02 bundle을 id/URI로 가져옴(복사가 아닌 참조);
  `build_ledger`가 claim을 P1/P2 vs P3로 타이핑함; `gate_claims`가 profile 구성 가능하고
  타입별이며 **fail-closed**이고 완화 불가능한 단 하나의 불변식이 "생성된 텍스트는 절대 evidence가 아니다"인
  evidence gate를 강제함; 차단된 claim은 backlog로 지속됨. 단위 테스트됨.

### Phase 3 — Assembly
- **Entry:** Phase 2 종료; CAW-01 result-import 경로가 SourceAdapter에 stub됨.
- **Exit:** `assemble_inputs`가 GATED claim + CAW-01 result ref로부터 **engine-neutral input bundle**을
  생성함; figure/table manifest가 `figure_id ↔ result_id`를 기록함; gate가 하드 **precondition**임
  (un-gated claim은 진입 불가). engine 특정 필드가 bundle로 새어 들어가지 않음.

### Phase 4 — Writing engine
- **Entry:** Phase 3 종료.
- **Exit:** PaperOrchestra가 CAW-03 소유 workspace에서 **subprocess** 모드의 v1 WritingEngineAdapter로
  실행됨; `draft_paper`가 neutral bundle을 소비하고 출력(LaTeX, figure, citation_pool)을 다시 artifact로
  캡처함; adapter가 교체 가능함(다른 engine을 끼워 넣어도 core 변경 없음). PaperOrchestra는 수정되지 않는다.

### Phase 5 — Review & publish  → **Milestone 1**
- **Entry:** Phase 4 종료.
- **Exit:** `review` 체크리스트 op이 제출 준비 상태를 게이트함(인간 reviewer); `publish/export`가
  Sink adapter를 통해 public-safe 필터링과 함께 LaTeX + 컴파일된 PDF를 산출함; 위 M1 불변식 검사가
  실제 artifact에서 모두 통과함. **M1 도달.**

### Phase 6 — Novelty & ladder  → M2
- **Entry:** M1.
- **Exit:** Novelty/Radar adapter가 CAW-05 radar를 import함; harness(engine이 아님)가 novelty를
  결정하며, PaperOrchestra의 Semantic-Scholar로 검증된 citation_pool을 재질의 없이 paper prior-art로
  재사용함(ADR-0006); P1/P2/P3 paper-ladder 계획이 추적됨; threatened / patent-sensitive claim이 플래깅됨.

### Phase 7 — Patent  → M3
- **Entry:** M2(공유 front / GatedClaimSet 존재).
- **Exit:** PatentEngine port + v1 baseline patent drafter(config로 선택되며 WritingEngine과 병렬);
  `draft_patent` 경로 가동; **patent-first publish interlock**(default-deny)이 patent-sensitive claim에
  대해 인간/counsel gate가 해제될 때까지 `publish/export`를 차단함; provisional-first 전략
  (TODO(open-question: jurisdiction)). PaperOrchestra는 절대 patent를 작성하지 않는다.

### Phase 8 — Surfaces  → M4
- **Entry:** M3.
- **Exit:** API + MCP + CLI + 최소 review/status UI 네 가지 surface 모두가 *동일한* 유한 op-manifest를
  구동함; 어떤 surface도 governed op을 우회할 수 없음.

### Phase 9 — Future 커넥터 stub  → M5
- **Entry:** M4.
- **Exit:** wiki publish, internal experiment-server source, venue submission, patent-filing stub 각각이
  adapter 하나를 채우는 것만으로 업그레이드 가능함 — core는 손대지 않음(ADR-0005 설계 규칙 검증됨).

## 열린 질문(Open questions)
- Patent jurisdiction / provisional-first 순서 — TODO(open-question: ../08-research-plan/open-questions.md 참고).
- 더 엄격한 pre-filing/counsel confidentiality 등급이 별도의 단계인지 아니면 Phase 7에 포함되는지(ADR-0007).
- M1 수락 corpus: 어떤 단일 CAW-02 bundle + CAW-01 run 집합이 정규(canonical) smoke test인지 — TODO(open-question).

## runbook에 대한 함의
- 단계당 하나의 runbook 폴더; runbook 번호 `RB-NXX`는 phase N과 일치한다.
- M1 op-chain은 phase 2–5의 op당 하나의 runbook으로 매핑되며, 각각은 트리를 green 상태로 남긴다.
- Phase 1은 *모든* 향후 adapter에 대한 stub을 출시해야 하므로, 후속 단계가 "adapter 하나 채우기" 단위가 된다.
