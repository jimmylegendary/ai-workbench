# 데이터 흐름 — the Run 파이프라인 (fetch → dedup → rank → classify → route → ledger → synthesize → export)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./tech-stack.md](./tech-stack_ko.md), [./repo-structure.md](./repo-structure_ko.md)
  - [../01-decisions/ADR-0001-product-surface-and-outputs.md](../01-decisions/ADR-0001-product-surface-and-outputs_ko.md) (Run + surface + 포맷)
  - [../01-decisions/ADR-0002-interest-model.md](../01-decisions/ADR-0002-interest-model_ko.md) (관련성 rank)
  - [../01-decisions/ADR-0003-source-adapters-and-ingestion.md](../01-decisions/ADR-0003-source-adapters-and-ingestion_ko.md) (fetch + dedup)
  - [../01-decisions/ADR-0004-classification-and-triage.md](../01-decisions/ADR-0004-classification-and-triage_ko.md) (classify + route)
  - [../01-decisions/ADR-0005-related-work-ledger.md](../01-decisions/ADR-0005-related-work-ledger_ko.md) (ledger + verification)
  - [../01-decisions/ADR-0006-storage-and-scheduling.md](../01-decisions/ADR-0006-storage-and-scheduling_ko.md) (Run wrapper, cursor, dedup, idempotency)
  - [../01-decisions/ADR-0007-export-boundaries.md](../01-decisions/ADR-0007-export-boundaries_ko.md) (export bundle)
  - [../02-research/scheduling-and-ports.md](../02-research/scheduling-and-ports_ko.md) (포트 + 라이프사이클)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적
이 문서는 레이더의 **단일 Run** 동안 **데이터가 어떻게 이동하는지**를 기술한다: 순서가 정해진 stage,
각 stage 경계를 넘는 value object, 상태를 읽고 쓰는 위치, 그리고 각 stage가 지켜야 하는 recall/idempotency
불변식. 이는 [repo-structure.md](./repo-structure_ko.md)의 정적 레이아웃과 [tech-stack.md](./tech-stack_ko.md)의
도구 선택에 대응하는 런타임 동반 문서다. 이 문서는 interest 모델, classification 루브릭, ledger 스키마,
export 계약을 재결정하지 않는다 — 그것들은 각자의 ADR이며, 이 문서는 그것들이 어떻게 조합되는지를 보여준다.
파이프라인은 세 surface 모두의 뒤에 있는 **단일 코어**다(스케줄된 cron / CLI / MCP — ADR-0001); surface는
Run을 *시작*만 한다.

## 1. 한눈에 보는 the Run (ASCII)

```
                         caw05 run --window weekly         (cron | CLI | MCP — ADR-0001)
                                    │
                       ┌────────────▼─────────────┐
                       │  RUN WRAPPER (ADR-0006)   │  single-flight lock · preflight · checkpoints
                       │  acquire run.lock         │  refuse if held · resume at last stage
                       └────────────┬─────────────┘
                                    │
   interests.yaml (ADR-0002) ─────► │ ◄───── sources.yaml / caw05.config.toml (registry, ADR-0003)
                                    │
   ┌────────────────────────────────────────────────────────────────────────────────────────┐
   │ STAGE 1  COLLECT  (SourceAdapter.discover/fetch — driven port)                           │
   │   arXiv+S2 │ GitHub │ blog RSS │ HN-light        stubs: Reddit · EDGAR · newsletters      │
   │   read state/<source>.cursor ──► fetch only new ──► advance cursor ON SUCCESS only        │
   │   emits RawFinding[]  (provenance: origin · retrieved_at · native_id · boundary=public)   │
   └───────────────────────────────────────────┬────────────────────────────────────────────┘
                                                ▼  RawFinding[]
   ┌────────────────────────────────────────────────────────────────────────────────────────┐
   │ STAGE 2  DEDUP  (core — ADR-0003 §5 / ADR-0006 §4)                                        │
   │   L1 canonical id (DOI▸arXiv▸url-norm▸repo+sha)  L2 SHA-256(title+body)  L3 SimHash(flag) │
   │   merge same item across sources → ONE finding, MANY provenance entries                   │
   │   read/write state/seen.idx          recall-safe default: when unsure, KEEP BOTH          │
   └───────────────────────────────────────────┬────────────────────────────────────────────┘
                                                ▼  Finding[] (deduped, multi-provenance)
   ┌────────────────────────────────────────────────────────────────────────────────────────┐
   │ STAGE 3  RANK / RELEVANCE  (ADR-0002)                                                     │
   │   BM25 over FTS5 index + ADDITIVE EXPLAINABLE score (keyword/topic/entity/author/venue)   │
   │   tiers + polarity from interests.yaml      RECALL-FIRST floor: low score ≠ dropped       │
   │   optional embedding lane (alpha, gated)    attaches score + per-term contribution        │
   └───────────────────────────────────────────┬────────────────────────────────────────────┘
                                                ▼  ScoredFinding[] (score + explanation)
   ┌────────────────────────────────────────────────────────────────────────────────────────┐
   │ STAGE 4  CLASSIFY  (cascade — ADR-0004)                                                   │
   │   LF (labeling functions) ─► LLM ─► HUMAN     two axes: relevance × signal/hype           │
   │   recall-biased SELECTIVE-REVIEW gate: low confidence ⇒ abstain ⇒ queue for human         │
   │   writes generated rationale, marked kind=generated  (NEVER evidence — brief §5/§12)      │
   └───────────────────────────────────────────┬────────────────────────────────────────────┘
                                                ▼  ClassifiedFinding[] (label + confidence + rationale)
   ┌────────────────────────────────────────────────────────────────────────────────────────┐
   │ STAGE 5  ROUTE  (deterministic config-driven — ADR-0004)                                  │
   │   knowledge · task · experiment · open-question · discard                                 │
   │   route is a pure function of (label, confidence, config) → RoutedSignal[]                │
   └───────────────────────────────────────────┬────────────────────────────────────────────┘
                                                ▼  RoutedSignal[]
   ┌────────────────────────────────────────────────────────────────────────────────────────┐
   │ STAGE 6  LEDGER  (append-only — ADR-0005)                                                 │
   │   WatchedTarget ◄─link─ Finding/Signal      Semantic Scholar verification                 │
   │   (Levenshtein title gate + year±1 + multi-key dedup) → verification record               │
   │   append LedgerLink to ledger/*.jsonl       provenance-complete = single auditable record │
   └───────────────────────────────────────────┬────────────────────────────────────────────┘
                                                ▼  LedgerLink[] (verified, provenance-complete)
   ┌────────────────────────────────────────────────────────────────────────────────────────┐
   │ STAGE 7  SYNTHESIZE  (FormatRenderer port — ADR-0001)                                     │
   │   memo · digest · slide-outline · paper-card · action-brief   (markdown-first)            │
   │   every generated block marked kind=generated (not evidence); links back to LedgerLink    │
   └───────────────────────────────────────────┬────────────────────────────────────────────┘
                                                ▼  rendered artifacts (out/*.md)
   ┌────────────────────────────────────────────────────────────────────────────────────────┐
   │ STAGE 8  EXPORT  (ExportAdapter port — ADR-0007, ONLY export seam)                        │
   │   CAW-02 Source/Claim/RelatedWork · CAW-03 novelty RadarSignal · CAW-01/06 open-questions │
   │   idempotency_key = hash(finding_id + target + classification_version) → re-emit = no-op   │
   │   signed bundle written across boundary — NO shared store                                  │
   └───────────────────────────────────────────┬────────────────────────────────────────────┘
                                                ▼
                       ┌────────────────────────────────────────────┐
                       │ DONE → write runs/<run_id>.receipt.json     │  heartbeat / dead-man's-switch
                       │ {window, per_source:{fetched,new,dup},      │  missing receipt > cadence+grace
                       │  classified_counts, exports[], status}      │  ⇒ ALERT "radar went dark"
                       └────────────────────────────────────────────┘
```

## 2. Stage 계약 표

| # | Stage | Owner / port | 읽기 | 쓰기 | 출력 value object | 핵심 불변식 |
|---|---|---|---|---|---|---|
| 1 | Collect | `SourceAdapter` (ADR-0003) | `state/<src>.cursor`, config | 성공 시 cursor 전진 | `RawFinding` | provenance 완전; cursor는 **전체 성공 시에만** 전진 |
| 2 | Dedup | core (ADR-0003/0006) | `state/seen.idx` | `seen.idx` 갱신 | `Finding` (multi-provenance) | recall-safe: 불확실하면 둘 다 유지; arXiv 버전은 distinct-but-linked 유지 |
| 3 | Rank | interest 모델 (ADR-0002) | `interests.yaml`, FTS5 index | 점수 cache | `ScoredFinding` | 가산적 + 설명가능; **recall-first floor — 낮은 점수도 결코 누락 안 됨** |
| 4 | Classify | cascade (ADR-0004) | model/LF config | review queue, rationale | `ClassifiedFinding` | 낮은 confidence는 abstain→human; rationale `kind=generated` ≠ evidence |
| 5 | Route | router (ADR-0004) | routing config | — | `RoutedSignal` | (label, conf, config)의 결정론적 순수 함수 |
| 6 | Ledger | ledger (ADR-0005) | `ledger/*.jsonl`, S2 | `LedgerLink` append | `LedgerLink` | append-only; Levenshtein+year±1 verification; provenance-complete |
| 7 | Synthesize | `FormatRenderer` (ADR-0001) | finding + ledger | `out/*.md` | rendered artifact | markdown-first; 생성 블록은 non-evidence 표기 |
| 8 | Export | `ExportAdapter` (ADR-0007) | routed signal | boundary bundle | `ExportReceipt` | idempotency key → 중복 방출 없음; 서명됨; shared store 없음 |

## 3. 두꺼워지는(thickens) value object
각 stage는 하나의 운반(carrier) 객체에 **추가**하며 결코 조용히 누락하지 않는다(recall 자세). 객체는 다음을
누적한다:

```
RawFinding         = canonical_id · provenance[] · title · authors · body/summary · body_is_full_text
  └► Finding       + merged provenance[] (cross-source) · dedup_keys{id, sha256, simhash?}
      └► ScoredFinding   + relevance{score, floor_hit, contributions[{term, tier, polarity, weight}]}
          └► ClassifiedFinding + label{relevance_axis, signal_hype_axis} · confidence · review_state · rationale(kind=generated)
              └► RoutedSignal      + route ∈ {knowledge,task,experiment,open-question,discard} · target[]
                  └► LedgerLink        + watched_target_ref · verification{method, score, matched_paper_id} · run_id
```

`discard` route도 여전히 레코드를 생성한다(ledger / `seen` 메모리의 tombstone). 따라서 재실행이 그것을 다시
수면 위로 올리지 않는다 — discard는 잊히는 것이 아니라 *감사된다*(ADR-0006 보존 정책은 열린 질문).

## 4. Run당 건드리는 상태 (files-as-truth + SQLite cache — ADR-0006)

| Artifact | 역할 | Stage |
|---|---|---|
| `interests.yaml` | 타입화된 interest artifact, tier + polarity (버전 관리됨) | 3 |
| `sources.yaml` / `caw05.config.toml` | 어댑터 레지스트리 + 배선 | 1, 8 (preflight) |
| `state/<source>.cursor` | source별 증분 watermark | 1 |
| `state/seen.idx` | content-addressed dedup index | 2 |
| `index.sqlite` (FTS5 + seen + ledger projection) | BM25 + 조회용 **재구축 가능** cache | 2, 3, 6 |
| `findings/*.json` | finding당 레코드 하나 (truth) | 2–6 |
| `ledger/*.jsonl` | append-only LedgerLink (truth) | 6 |
| `out/<run_id>/*.md` | rendered 포맷 | 7 |
| `exports/<target>/*.bundle` | 서명된 cross-boundary bundle | 8 |
| `runs/<run_id>.receipt.json` | heartbeat + stage별 count | done |

계약 (ADR-0006): **파일이 truth이고, `index.sqlite`는 폐기 가능한 cache다.** DB를 삭제하고 파일을 재생하면
FTS5, `seen` 집합, ledger projection이 재현된다.

## 5. 실패, 재개(resume), idempotency
- **stage 중간 크래시** → wrapper는 마지막으로 완료된 checkpoint를 유지하며, 다음 트리거는 그 stage에서
  재진입한다(ADR-0006 §2.3). stage 순서는 재진입이 안전하도록 정해져 있다: dedup이 겹치는 재-fetch를 흡수한다.
- **동일 window의 재실행** → cursor 불변 ⇒ collect는 `new=0`을 산출; dedup은 `dup=all`을 보고; export
  idempotency key가 재방출을 no-op으로 만든다. 음성 테스트(반드시 성립): `done` Run을 재실행해도 아무것도
  바뀌지 않는다.
- **빠진 주(missed week)** → 다음 Run의 window가 단순히 더 긴 기간을 포함한다(시계가 아니라 watermark를 통한
  catch-up). receipt 없이 건너뛴 주는 조용한 no-op이 아니라 alert를 일으킨다.
- **single-flight** → Run이 `run.lock`을 보유 중일 때 두 번째 트리거는 거부된다(로깅됨), 쌓이지 않는다.

## 6. 흐름 전반의 recall & evidence 규율
- **source에서 결코 누락하지 않음**(Stage 1)과 **낮은 relevance에서 결코 누락하지 않음**(Stage 3 floor):
  필터링은 *사람이 검토할 수 있는* 나중의 행위이지, 조용한 이른 행위가 아니다. 유일한 프로그램적 누락은
  classify *이후*의 `discard`이며, 그것도 기록된다.
- **생성 ≠ evidence, 종단 간:** LLM rationale(Stage 4), 합성된 산문(Stage 7), export bundle의 모든 요약
  (Stage 8)은 전부 `kind=generated`로 표기된다. 감사 가능한 evidence는 provenance-complete한
  `LedgerLink`(Stage 6)이지, 생성된 텍스트가 결코 아니다(brief §5, §12; ADR-0004, ADR-0005).
- **공유 기반(substrate) 없음:** Stage 8은 *경계를 넘는 bundle*을 쓴다; 레이더는 제안할 뿐, 형제 제품의
  저장소에 결코 쓰지 않는다(brief §1, §8; ADR-0007).

## 열린 질문(Open Questions)
`../08-research-plan/open-questions.md`에서 추적:
- TODO(open-question: is a Run one synchronous process or resumable stage-jobs with a job handle? — affects the
  crash-resume model above and the CLI/MCP `status` contract.)
- TODO(open-question: discard-tombstone retention/TTL — how long must dedup remember a discard?)
- TODO(open-question: when two sources surface the same item, which provenance is canonical on merge, and is the
  non-canonical source still recorded for audit?)
- TODO(open-question: does Stage 6 verification run inline or as a deferred batch when S2 is rate-limited?)

## 런북에 대한 함의
- **RB (코어/Run-wrapper):** stage별 checkpoint로 8-stage 파이프라인을 배선한다; run-receipt를 방출한다.
- **RB (stage 2–3):** dedup core + `interests.yaml`과 FTS5 index를 읽는 relevance rank.
- **RB (stage 4–5):** LF→LLM→human cascade + 결정론적 router; rationale을 non-evidence로 표기.
- **RB (stage 6–8):** ledger append + S2 verification; FormatRenderer 세트; idempotency가 있는 ExportAdapter bundle.
- 운반 value object(`RawFinding`→`LedgerLink`)를 타입화하고 가산적으로 유지하여 어떤 stage도 finding을 조용히
  누락할 수 없게 한다.
