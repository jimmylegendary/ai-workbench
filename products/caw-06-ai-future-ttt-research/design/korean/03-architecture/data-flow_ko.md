# 데이터 흐름 — ExperimentScout Run

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./tech-stack_ko.md](./tech-stack_ko.md), [./repo-structure_ko.md](./repo-structure_ko.md)
  - [../01-decisions/ADR-0001-product-surface-and-scout.md](../01-decisions/ADR-0001-product-surface-and-scout_ko.md) (하나의 파이프라인 core, 세 개의 서피스, 다섯 개의 아티팩트)
  - [../01-decisions/ADR-0005-source-and-claim-ingestion.md](../01-decisions/ADR-0005-source-and-claim-ingestion_ko.md) (S1–S5 ingestion)
  - [../01-decisions/ADR-0002-hypothesis-representation.md](../01-decisions/ADR-0002-hypothesis-representation_ko.md) (status/불확실성)
  - [../01-decisions/ADR-0003-experiment-ledger.md](../01-decisions/ADR-0003-experiment-ledger_ko.md) (one run = one append-only entry)
  - [../01-decisions/ADR-0006-implication-mapping.md](../01-decisions/ADR-0006-implication-mapping_ko.md) (ImplicationMap)
  - [../01-decisions/ADR-0004-writeback-traffic-schema.md](../01-decisions/ADR-0004-writeback-traffic-schema_ko.md) (wbtraffic.v0 + CAW-01 브리지)
  - [../01-decisions/ADR-0007-storage-and-scheduling.md](../01-decisions/ADR-0007-storage-and-scheduling_ko.md) (file store + scheduling)
  - [../01-decisions/ADR-0008-export-boundaries.md](../01-decisions/ADR-0008-export-boundaries_ko.md) (ExportAdapter 이음새)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적
**하나의 ExperimentScout Run의 end-to-end 데이터 흐름**을 설명한다 — 하나의 리서치 thread가 source
discovery에서 시작해 claim 추출, hypothesis 생성, toy experiment, 결과 로깅(실패 포함), implication mapping,
`wbtraffic.v0` 생산을 거쳐 제품 경계를 가로지르는 export까지 어떻게 이동하는가. 이 문서는 *데이터가 거치는 경로와
어디에 영속화되는지*를 설명한다; 레코드 스키마를 재정의하지 *않으며*(이는 위에 링크된 ADR이 소유), 툴링
(see [tech-stack_ko.md](./tech-stack_ko.md))이나 레이아웃([repo-structure_ko.md](./repo-structure_ko.md))을
결정하지 않는다.

이것은 **고정된 결정의 정교화**이며, 결코 재정의가 아니다. 아래의 모든 화살표를 지배하는 두 가지 불변식:
**과대 주장 없음**(hypothesis가 결코 확정된 claim으로 발행되지 않는다; *modeled* 숫자가 결코 *measured*로
발행되지 않는다)과 **실패는 일급 시민**(모든 run은 성공이든 아니든 지속적이고 발견 가능한 레코드를 생산한다)이다.

## 한눈에 보는 Run

Run은 0개 이상의 thread에 대한 파이프라인 core(ADR-0001)의 한 번의 패스다. 세 개의 얇은 서피스 —
**scheduled/triggered pipeline**, **CLI**, **MCP** — 중 어느 것에 의해서든 호출되며, 이들은 모두 동일한 core로
진입한다. 각 스테이지는 CAW-06의 OWN file store(ADR-0007)에서 읽고 쓰며; 다른 제품과는 아무것도 공유하지 않는다.

```
                       SURFACES (thin; one core)
        ┌────────────────┬─────────────────┬──────────────────┐
        │ scheduled /    │      CLI         │      MCP         │
        │ triggered      │  (run/inspect)   │ (run/inspect)    │
        └───────┬────────┴────────┬─────────┴────────┬─────────┘
                └─────────────────┼──────────────────┘
                                  v
   ============================ PIPELINE CORE (the Run) ============================

   [S1 DISCOVER]        SourceAdapter(arXiv / Semantic Scholar)
        │               FetchCursor watermark  ──► store/cursors/
        v
   [S2 IMPORT]          SourceAdapter(CAW-05 signal) — file drop / pull
        │               (CAW-05 is a SEPARATE product; signal != our claim)
        v
   [S3 CANONICALIZE     dedup by DOI/arXiv-id/content-hash
       + DEDUP]         ──► store/sources/SRC-XXXX.{md,json}   (provenance)
        │
        v
   [S4 EXTRACT CLAIMS]  CandidateClaim per source span
        │               ──► store/claims/CLM-XXXX.{md,json}    (status-bearing)
        v
   [S5 PERSIST]         thread opened/extended: source→claim
        │               ──► store/threads/THR-XXXX (index of refs)
        v
   [H GENERATE          Hypothesis @ status=hypothesis, confidence=very-low
      HYPOTHESES]       ──► store/hypotheses/HYP-XXXX.{md,json}  (status_log)
        │               (generated; never auto-promoted — ADR-0002/0007 gate)
        v
   [E PLAN + RUN        pre-register decision rule  ──► ledger entry (open)
      TOY EXPERIMENT]   ExperimentRunnerAdapter(PyTorch toy)
        │               repro gate: config + seed + env captured
        v               artifacts (metrics/logs/plots) by path ──► artifacts/EXP-XXXX/
   [R LOG RESULT]       ONE run = ONE append-only entry; four-value verdict
        │  ┌──────────────────────────────┐
        │  │ verdict ∈ {supports, refutes, │  negative + invalid results RETAINED
        │  │  inconclusive, invalid}       │  and surfaced by default (failures useful)
        │  └──────────────────────────────┘
        │               ──► store/ledger/EXP-XXXX/entry.{md,json}
        │               proposes StatusEvent on the hypothesis (review-gated)
        v
   [M MAP IMPLICATIONS] ImplicationMap (one per finding) across domains
        │               summary marked GENERATED (not evidence)
        │               ──► store/implications/IMP-XXXX.{md,json}
        v
   [W PRODUCE           wbtraffic.v0: analytic L0 estimate from variant params
      WRITEBACK SCHEMA] + assumptions; numerics default null (modeled != measured)
        │               optionally grounded by one toy reproduction (E/R above)
        │               ──► store/writeback/WBT-XXXX.{md,json}
        v
   [X EXPORT]           ExportAdapter (ONLY export seam) — validate() gate BEFORE write
        │   ├─ Caw01WritebackAdapter ─► wbtraffic.v0 + open-questions  ──► file drop ─► CAW-01
        │   └─ Caw02ClaimAdapter     ─► claim + evidence (status != bare hypothesis) ─► CAW-02
        │               receipts ──► store/exports/  (failed export logged; finding stays exportable)
        v
   ============================ end of Run ============================
```

## 스테이지별 설명

| # | 스테이지 | 입력 | 출력(store 경로) | 지배 ADR | 멱등성 키 |
|---|---|---|---|---|---|
| S1 | Discover | query + `FetchCursor` | `store/sources/` (raw refs) | ADR-0005 | `FetchCursor` watermark |
| S2 | Import (CAW-05) | signal bundle (file drop) | `store/sources/` (tagged import) | ADR-0005 | last `bundle_id` |
| S3 | Canonicalize + dedup | raw refs | `store/sources/SRC-XXXX` | ADR-0005/0007 | DOI / arXiv-id / `content_hash` |
| S4 | Extract claims | canonical source | `store/claims/CLM-XXXX` | ADR-0005 | (source_id, span_hash) |
| S5 | Persist thread | source+claim refs | `store/threads/THR-XXXX` | ADR-0007 | thread_id |
| H | Generate hypotheses | claim(s) | `store/hypotheses/HYP-XXXX` | ADR-0002 | (claim_id, hypothesis_hash) |
| E | Plan + run experiment | hypothesis + decision rule | `artifacts/EXP-XXXX/` | ADR-0003 | EXP id (one run = one entry) |
| R | Log result | run artifacts + verdict | `store/ledger/EXP-XXXX/` | ADR-0003 | EXP id (append-only) |
| M | Map implications | finding (verdict) | `store/implications/IMP-XXXX` | ADR-0006 | (finding_id) |
| W | Produce wbtraffic.v0 | variant params + ledger | `store/writeback/WBT-XXXX` | ADR-0004 | (variant, content_hash) |
| X | Export | bundle | `store/exports/` (receipts) | ADR-0008 | `bundle_id` + `content_hash` |

### S1–S5 Ingestion(멱등적, 재개 가능)
다섯 개의 ingestion 스테이지는 **SourceAdapter** 포트(ADR-0005) 뒤에서 실행된다. 이들은 **멱등적이고
재개 가능**하다: 각 어댑터가 `FetchCursor`를 영속화하므로(S1: arXiv resumptionToken / Semantic Scholar 페이지;
S2: 마지막 CAW-05 `bundle_id`) 재실행이 결코 재import하거나 중복하지 않는다. Dedup(S3)은 두 어댑터를 통해 도착한
동일 논문을 DOI / arXiv-id / content-hash로 하나의 `Source`로 병합한다. **CAW-05 signal은 import이지 우리의
판단이 아니다** — 경계에서 태깅되며 결코 CAW-06 claim이나 verdict과 혼동되지 않는다.

### H Hypothesis 생성(과대 주장 없음, 자동 승격 없음)
추출은 `CandidateClaim`을 산출하고; hypothesis 생성은 **기본값 `status=hypothesis`, `confidence=very-low`**
(ADR-0002)인 `Hypothesis` 레코드를 생산한다. 네 상태 lifecycle(hypothesis / supported / refuted /
inconclusive)은 가역적이다. scout는 **제안 전용**(ADR-0007 §6)이다: `StatusEvent`를 *제안*할 수는 있으나,
`supported`로의 승격은 review queue를 통한 Jimmy의 검토를 요구한다. **generated evidence는 status를 승격할 수
없다**(hard evidence cap, ADR-0002).

### E + R 계획, 실행, 로깅(실패는 일급 시민)
실행 전에 **decision rule이 사전 등록**(ADR-0003)되므로, verdict이 사후에 합리화될 수 없다. run은
**ExperimentRunnerAdapter**(v1 = 로컬 PyTorch toy runner; [tech-stack_ko.md](./tech-stack_ko.md) 참조)를 거친다.
**hard reproducibility gate**가 config + seed + env를 캡처한다; 이를 충족할 수 없는 entry는 조용히 버려지지 않고
`invalid`로 기록된다. **One run = one append-only ledger entry**이며, 크래시 시에도(→ `invalid`/`aborted`)
그렇다. 네 값 verdict은 `{supports, refutes, inconclusive, invalid}`이다.
**Negative 및 invalid 결과는 기본적으로 보존되고, 분류되며, 노출된다** — negative-results 뷰는 이들로부터
구축된다. 큰 아티팩트는 경로로 `artifacts/EXP-XXXX/` 아래에 존재하고; ledger entry가 이를 참조한다.

### M Implication 매핑(summary != evidence)
finding당 하나의 `ImplicationMap`(ADR-0006)이 결과를 도메인 전반으로 투영한다: AI services, education,
dev platforms, models, hardware, memory-centric systems. 맵의 서술적 summary는 **명시적으로 generated로
표시**되며 **evidence가 아니다**; 결코 claim으로서 경계를 넘지 않는다.

### W wbtraffic.v0 생산(CAW-01 브리지 페이로드)
TTT variant에 대해, **analytic L0 estimator**(ADR-0004 Option A)는 variant의 fast-weight 파라미터 +
나열된 `assumptions`로부터 `bytes_per_update`, `write_bw`, `ratio_curve`를 계산한다. **모든 수치는 기본값
`null`**이다; 중요한 `null`은 지어낸 숫자가 아니라 `TODO(open-question: …)`가 된다. toy reproduction(E/R)이
값을 측정했다면, 그 필드를 채우고 **measured**로 플래그된다(**modeled**와 구별됨). 아티팩트는 필수
`provenance` + `uncertainty`(ADR-0002)를 운반한다. modeled estimate는 그 자체로 **결코** `supported`가
될 수 없다(modeled ≠ measured; generated ≠ evidence).

### X Export(유일한 이음새; write 전 gate; 공유 store 없음)
모든 출력은 단일 **ExportAdapter** 포트(ADR-0008)를 통해 떠난다. `validate()`는 **어떤 write보다 먼저
타깃별 gate**를 실행한다:

| 타깃 | 어댑터 | 허용 | 거부 |
|---|---|---|---|
| CAW-01 | `Caw01WritebackAdapter` | `{memory-centric-systems, hardware}` 내의 implication이고 `writeback_payload`를 갖거나 typed open question | writeback/workload 관련성이 없는 항목 |
| CAW-02 | `Caw02ClaimAdapter` | `status ∈ {supported, refuted, inconclusive}` + ≥1 `evidence_ref` + provenance | 맨 `hypothesis`; summary-only 항목 |

CAW-01 번들은 **자기 기술적** `wbtraffic.v0` 페이로드 **더하기 일급 `open_questions[]`**이다 —
CAW-01은 *자신의 IR에 대한 단언이 아니라 질문*을 받는다. **이것은 file 경계를 가로지르는 export이지 공유 store가
아니다**: CAW-06은 결코 CAW-01(또는 CAW-02)의 store에 쓰지 않고, 공유 레지스트리를 가정하지 않으며,
read-back을 받지 않는다(단방향 push). Receipt는 `store/exports/`에 떨어진다; **실패/거부된 export는 일급으로
로깅되고 finding은 이후 재시도를 위해 export 가능 상태로 유지된다**.

## 데이터 영속성 & 재개
모든 스테이지는 CAW-06의 OWN file store(ADR-0007)에 **append-only + supersede**로 쓴다 — 수정은 제자리
편집이 아니라 새 레코드/`StatusEvent`를 추가한다. 선택적 파생 인덱스(재구축 가능, 폐기 가능)가 thread 및
negative-results 쿼리를 구동하고; 파일은 정본으로 남는다. 각 스테이지가 멱등성 키(위 표)를 갖고 커서를
영속화하므로, **중단된 Run은 마지막 지속 레코드에서 깔끔하게 재개**된다.

## 미해결 질문
[../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) 참조. 흐름 관련:
- `TODO(open-question: concurrency — can two scheduled Runs touch the same thread; per-thread file locks? — ADR-0007)`
- `TODO(open-question: does every ExperimentRunnerAdapter launch — even out-of-band manual runs — force a ledger entry, to de-bias silent drops? — ADR-0003)`
- `TODO(open-question: should refuted implications also export to CAW-01 as "axis not observed" signals? — ADR-0006/0008)`
- `TODO(open-question: retention/GC for large failure artifacts under artifacts/EXP-XXXX — ADR-0007)`

## 런북에 대한 함의
- 스테이지 경계당 하나의 런북; 각각은 트리를 green으로 남기고 멱등성 키/커서를 영속화한다.
- E→R 경계는 크래시가 run을 떨어뜨릴 수 없도록 launch 시(verdict 전에) 반드시 ledger entry를 생성해야 한다.
- W와 X 런북은 `modeled` vs `measured` 플래그와 `null`+`basis`를 end-to-end로 온전히 유지해야 한다.
- export 런북은 어떤 write보다 먼저 `validate()`(gate)를 실행하고 결과와 무관하게 receipt를 저장해야 한다.
