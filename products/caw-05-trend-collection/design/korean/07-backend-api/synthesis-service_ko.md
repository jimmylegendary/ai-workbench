# Synthesis Service — classify → route → synthesize → render formats

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./api-surface_ko.md](./api-surface_ko.md) (`classify`, `synthesize`, `render` op)
  - [./ingestion-service_ko.md](./ingestion-service_ko.md) (deduped finding 공급)
  - [./scheduler-and-persistence_ko.md](./scheduler-and-persistence_ko.md) (artifact 영속화, ledger append)
  - [../01-decisions/ADR-0001-product-surface-and-outputs_ko.md](../01-decisions/ADR-0001-product-surface-and-outputs_ko.md) (다섯 format, FormatRenderer)
  - [../01-decisions/ADR-0004-classification-and-triage_ko.md](../01-decisions/ADR-0004-classification-and-triage_ko.md) (taxonomy, cascade, routing)
  - [../01-decisions/ADR-0005-related-work-ledger_ko.md](../01-decisions/ADR-0005-related-work-ledger_ko.md) (ledger link)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적
Run의 후반부를 기술한다: deduped + scored finding이 어떻게 **classify**되고(recall 편향의 selective-review gate를
갖춘 LF→LLM→human 캐스케이드를 통한 two-axis taxonomy), 결정론적으로 **route**되며, 선택적으로 ledger에 링크되고,
이어서 `FormatRenderer` 포트 뒤에서 다섯 개의 markdown-first format으로 **synthesize**되고 **render**되는지. 이는
ADR-0004(classification/triage)와 ADR-0001 §C(format)에 따라 [./api-surface_ko.md](./api-surface_ko.md)의
`classify`/`synthesize`/`render` op를 구현한다. ingestion(형제), relevance 스코어(ADR-0002), ledger
스키마(ADR-0005), export-bundle wire 포맷(ADR-0007)은 정의하지 **않는다**. **생성된(generated) rationale이나
summary는 절대 evidence가 아니다.**

## Run에서의 위치
```
collect → dedup → relevance → classify+route (this doc) → [ledger] → synthesize+render (this doc) → export
```

## Stage 1 — Classify (two-axis taxonomy, LF→LLM→human 캐스케이드)
각 finding은 **두 개의 독립 축(axis)** 을 얻는다(ADR-0004):

| Axis | Values |
|---|---|
| novelty | `novelty-threat` \| `support` \| `adjacent` \| `noise` |
| signal | `signal` \| `hype` |

캐스케이드는 가장 저렴한 decider를 먼저 시도하고 **낮은 confidence에서 escalate한다** — recall 편향이며, 절대
precision 탐욕적이지 않다.

```text
classify(finding):
    lf = labeling_functions(finding)          # 1. deterministic rules + per-source trust prior
    if lf.confident: return decide(lf, by="LF")
    llm = llm_classify(finding)               # 2. LLM with structured rubric; rationale is generated
    if llm.confidence >= threshold: return decide(llm, by="LLM")
    return abstain(finding)                    # 3. selective-review gate → human queue
```

### Selective-review gate (recall 편향)
| Outcome | Condition | Action |
|---|---|---|
| auto-decided | LF confident OR LLM ≥ threshold | 결정론적으로 route |
| **abstain → human** | confidence threshold 미만 | `confirm`을 위해 큐에 적재; 절대 auto-discard 안 함 |
| floor override | relevance `floor_hit=true` (watch-list) | 절대 조용히 떨어뜨리지 않음; 최소 route = open-question |

```text
Classification = {
  novelty_axis, signal_axis, confidence,
  decided_by: "LF" | "LLM" | "human",
  version,                          # classification_version → export idempotency key
  rationale,                        # GENERATED — evidence:false ALWAYS; never an export claim
}
```
**Rationale-not-evidence 규칙:** LLM이 생성한 rationale은 *세계(world)* 가 아니라 *결정(decision)* 을 설명한다.
감사를 위해 저장되고, `evidence:false` 배너와 함께 표시되며, CAW-02/03으로의 claim으로는 절대 emit되지 않는다.

## Stage 2 — Route (결정론적, config 구동)
라우팅은 classification + config의 순수 함수다(ADR-0004) — 모델 호출 없음, 완전 재현 가능.

| novelty × signal | 기본 route | Export target (ADR-0007 경유) |
|---|---|---|
| novelty-threat × signal | `experiment` 또는 `open-question` + flag | CAW-03 (novelty RadarSignal) |
| support × signal | `knowledge` | CAW-02 (Source/Claim/RelatedWork) |
| adjacent × signal | `open-question` | CAW-01 / CAW-06 |
| any × hype | `task` (watch) 또는 `open-question` | — (보류; auto-export 안 함) |
| noise × any | `discard` | none; **절대 synthesize 안 함** |

```text
route(classification) -> Route   # deterministic lookup in routing.yaml; no LLM
```
**종단(terminal) route는 에이전트 surface에서 proposal-only다.** CAW-03으로의 `novelty-threat` route는 human
`confirm`을 요구한다(review gate, ADR-0001 §4 / ADR-0004 §5). MCP 에이전트는 pending gate event만 생성할 수 있다.

## Stage 3 — Ledger link (선택적, append-only)
finding이 `WatchedTarget`과 관련될 때, 코어는 Semantic Scholar 검증(Levenshtein 제목 gate + year±1 + multi-key
dedup) 후에 `LedgerLink`을 append한다. provenance-complete한 LedgerLink이 감사 가능한 유일한 기록이다(ADR-0005).
상세는 ADR-0005에 있다. 이 service는 `ledger_append`/`ledger_verify`만 호출한다.

## Stage 4 — Synthesize + Render (다섯 format, FormatRenderer 포트)
`synthesize(run_id)`는 모든 **non-noise** finding을 render한다. `render(finding, format)`은 요청 시 하나를 render한다.
모든 format은 공유 `Finding` 위의 markdown-first 어댑터이며, 하나의 base template을 상속한다(ADR-0001 §5).

```text
interface FormatRenderer:
  format_id() -> Format
  render(finding | finding_set, base_ctx) -> ArtifactRef     # writes markdown, returns path
ArtifactRef = { path, format, finding_ids[], evidence:false, provenance_manifest_path }
```

| Format | Scope | Audience / target | Notes |
|---|---|---|---|
| `memo` | 1 finding | Jimmy / team | 짧은 triage 노트 |
| `digest` | N findings (weekly) | team readers | 주된 주간 출력물 |
| `slide-outline` | N findings | presentations | Marp 호환 markdown |
| `paper-card` | 1 paper | → CAW-02 / CAW-03 | 구조화된 related-work 카드 |
| `action-brief` | 1 finding | → CAW-01 / CAW-06 | open-question / task 프레이밍 |

### Base template 보장 (모든 artifact)
1. **Provenance manifest** — 모든 claim은 자신의 source provenance 항목(origin, retrieved_at, native id)에
   링크된다.
2. **`evidence:false` 배너** — *"generated summary — not evidence"* 고지(brief §5, §12). 생성된 prose는
   source-verbatim metadata와 명확히 분리된다.
3. **`noise`는 절대 synthesize 안 함** — discard route는 artifact를 만들지 않는다.
4. **내부 claim 혼합 없음** — public-source synthesis는 내부 Samsung/SAIT claim을 절대 주장하지 않는다(brief §12).

```text
synthesize(run_id):
    for finding in findings(run_id) where finding.route != "discard":
        ctx = base_ctx(finding)          # provenance manifest + evidence:false banner
        for fmt in formats_for(finding.route):
            renderer = registry[fmt]; renderer.render(finding, ctx)
```

## 멱등성 & 재개 가능성
- finding 재렌더링은 artifact를 결정론적으로 덮어쓴다(같은 입력 ⇒ 같은 markdown).
- `classification_version`은 export 멱등성 key의 입력이므로(ADR-0006 §4), 재분류(re-classification)만이
  정당하게 재export하는 유일한 것이다.
- synthesize 단계는 checkpoint된다. 크래시는 이미 결정된 finding을 재분류하지 않고 재개한다.

## Negative tests (반드시 성립)
- `noise` finding은 artifact 0개, export 0개를 산출한다.
- 낮은 confidence의 finding은 human 큐로 `abstain`한다. 절대 auto-discard되지 않는다.
- watch-list(`floor_hit`) finding은 relevance 점수와 무관하게 항상 digest에 존재한다.
- 생성된 rationale은 CAW-02/03 export bundle에서 claim으로 절대 나타나지 않는다.

## Open Questions
- TODO(open-question: LLM confidence threshold + abstain rate target for the selective-review gate.)
- TODO(open-question: which labeling functions are reliable enough to auto-decide without LLM escalation?)
- TODO(open-question: paper-card field set required by CAW-02 vs CAW-03 — confirm at the export boundary.)
- [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md)를 참고하라.

## 런북에 대한 함의
- classifier + routing은 포트 뒤에. LF 모듈, LLM 모듈, human-review 큐는 분리 가능한 단위다.
- base template 하나 + 다섯 `FormatRenderer` 어댑터. base template이 provenance manifest +
  `evidence:false` 배너를 소유하므로 개별 renderer는 그것들을 누락할 수 없다.
- 라우팅 테이블은 코드가 아니라 config(`routing.yaml`)다. 따라서 재라우팅은 diff로 리뷰 가능하다.
