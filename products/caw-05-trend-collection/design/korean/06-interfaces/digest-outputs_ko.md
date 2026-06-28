# Digest Outputs — 다중 포맷 종합(synthesis) 표면

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [cli-and-mcp_ko.md](cli-and-mcp_ko.md) (`render`가 이것들을 생산함; 읽기 뷰)
  - [scheduled-pipeline_ko.md](scheduled-pipeline_ko.md) (이것들을 내보내는 synthesize 단계)
  - [../01-decisions/ADR-0001-product-surface-and-outputs.md](../01-decisions/ADR-0001-product-surface-and-outputs_ko.md) (다섯 가지 포맷 + `FormatRenderer` 포트 — **권위 있음**)
  - [../01-decisions/ADR-0006-storage-and-scheduling.md](../01-decisions/ADR-0006-storage-and-scheduling_ko.md) (files-as-truth 레이아웃; digest는 파생됨)
  - [../01-decisions/ADR-0005-related-work-ledger.md](../01-decisions/ADR-0005-related-work-ledger_ko.md) (읽기 뷰가 노출하는 ledger)
  - [../01-decisions/ADR-0007-export-boundaries.md](../01-decisions/ADR-0007-export-boundaries_ko.md) (paper-card → CAW-02/03; action-brief → CAW-01/06)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적
이 문서는 **출력 표면(output surface)**을 기술한다: 다섯 가지 markdown 우선 종합 포맷, 그것들이 디스크의 어디에 떨어지는지,
공유 기반 템플릿(provenance manifest + "generated summary — not evidence" 배너), 그리고 ledger + digest 아카이브 위의
선택적 읽기 뷰다. 이 문서는 ADR-0001 §C/§5(포맷과 `FormatRenderer` 포트에 대해 권위 있음)를 **부연**한다; 포맷,
export 와이어 스키마(ADR-0007), 또는 ledger 스키마(ADR-0005)를 재정의하지 **않는다**. 하중을 지는 제약:
**생성된 요약은 결코 증거(evidence)가 아니다**(brief §5, §12) — 모든 출력은 그 표시를 담고 있으며, 산문이 아니라
기저의 provenance가 감사 가능한 기록이다.

## 다섯 가지 포맷 (하나의 `Finding` 집합, 여러 뷰)
다섯 가지 모두 **공유된 triage 처리된 `Finding`**(ADR-0001 §5) 위의 `FormatRenderer` 어댑터다. 하나의 finding이
하나의 source of truth와 하나의 provenance manifest를 가지고 여러 포맷으로 나타날 수 있다. `noise` 등급 finding은
**결코 종합되지 않는다**.

| Format | Scope | Audience / destination | Notes |
|---|---|---|---|
| `memo` | 1 finding | Jimmy / reader | the atomic unit; one finding, fully synthesized |
| `digest` | weekly, N findings | the team (weekly radar read) | the primary periodic output (brief §3 UC-1) |
| `slide-outline` | 1 finding or window | presentation | Marp-compatible markdown |
| `paper-card` | 1 paper | **export → CAW-02 (Source/Claim) / CAW-03 (novelty)** | structured card; export seam is ADR-0007 |
| `action-brief` | 1 finding | **export → CAW-01 / CAW-06 (open questions)** | proposes a task/question, not a decision |

모두 **markdown 우선**(brief §4)이다; 풍부한 HTML/앱 렌더링은 다운스트림이며 선택적이다(ADR-0001 §C). export 형태의
두 포맷(`paper-card`, `action-brief`)은 `ExportAdapter`에 공급되지만 **포맷 자체가 export는 아니다** — synthesis는
markdown을 생산하고; export 번들링/idempotency/서명은 ADR-0007이다.

## 출력이 떨어지는 곳 (files-as-truth, 파생됨)
출력은 CAW-05 자신의 트리 아래에 있는 **파생되고 재생성 가능한 산출물**이다(ADR-0006 §1). markdown이므로 감사를 위해
git으로 추적 가능하지만, **finding JSON + ledger가 source of truth로 남는다** — digest는 언제나 finding으로부터
재렌더링될 수 있다. 레이아웃(예시; runbook에서 확정):

```text
$CAW05_HOME/
  findings/*.json                      # source of truth (ADR-0006)
  ledger/*.jsonl                       # append-only related-work ledger (ADR-0005)
  digests/
    weekly/<window>/digest.md          # the weekly radar read
    weekly/<window>/memos/<id>.md
    weekly/<window>/slides/<id>.md
    cards/<finding_id>.paper-card.md   # pre-export markdown (→ CAW-02/03)
    briefs/<finding_id>.action-brief.md# pre-export markdown (→ CAW-01/06)
  exports/<target>/<bundle>.json       # signed bundles (ADR-0007) — NOT a shared store
```

`caw05 render <format> <id|--window> [--out <path>]`가 여기에 기록한다(see [cli-and-mcp_ko.md](cli-and-mcp_ko.md));
`render`는 거버넌스 관점에서 read 등급이다(finding/ledger를 절대 변경하지 않음).

## 공유 기반 템플릿 (모든 포맷이 상속)
각 `FormatRenderer`는 협상 불가능한 두 요소를 담은 하나의 기반 템플릿을 확장한다(ADR-0001 §5):

1. **Provenance manifest** — source 출처/날짜/검색(retrieval), `canonical_id`, `boundary`(public/internal), trust,
   classification + version, **가산적 설명(additive explanation)**이 붙은 relevance score(ADR-0002). 이것이
   감사 가능한 기록이다.
2. **"Generated summary — not evidence" 배너** — 생성된 산문은 `evidence:false`로 표시된다; 그것은 읽기
   보조물이며, 결코 주장(claim)이 아니다. 다운스트림 제품이 인용할 수 있는 것은 synthesis가 아니라 provenance다.

```markdown
<!-- caw05:base — generated summary, NOT evidence -->
> **Generated summary — not evidence.** Provenance below is the auditable record.

# <title>
- **Class:** novelty-threat · **Quality:** signal        <!-- ADR-0004 two-axis -->
- **Relevance:** 7.4  —  bm25:… + keyword-tier1:… + author:…  <!-- ADR-0002 additive/explainable -->
- **Source:** arXiv:… · retrieved <ts> · boundary=public · trust=…
- **Ledger:** LedgerLink <link-id> → WatchedTarget <…>      <!-- ADR-0005 -->

## Synthesis  (evidence:false)
<generated body>
```

## digest (주요 주기적 출력)
주간 `digest`는 레이더의 헤드라인 읽을거리다(brief §3 UC-1): 해당 window의 finding들을 두 축 분류 체계(novelty-threat /
support / adjacent — `noise`는 생략; signal 대 hype)로 그룹화하고, 설명 가능한 relevance score로 정렬한다
(recall-floor watch-list 적중이 먼저 표면화되며 결코 조용히 누락되지 않음). 각 항목은 자신의 `memo`와 provenance
manifest로 연결된다. digest는 `findings/*.json`으로부터 재생성 가능하므로, 일회성이고 언제든 재렌더링할 수 있다.

## 선택적 읽기 뷰 (ledger + digest 아카이브)
**append-only ledger**(ADR-0005) + digest 아카이브 위의 읽기 위주(read-mostly) 뷰(brief §4 부차적; ADR-0001 §6):
검증 레코드와 함께 `WatchedTarget → Finding/Signal → LedgerLink`를 탐색하고, 주간 digest의 이력을 본다. 이는
**하중을 지지 않으며** 첫 슬라이스 이후에 출시된다 — v1에는 `caw05 status` + 디스크 상의 digest 아카이브로
충분할 수 있다. 이는 **읽기 뷰 전용**이다: ledger를 절대 변경하지 않고 export를 절대 수행하지 않는다.

TODO(open-question: does the read view ship in v1, or are `caw05 status` + the digest archive sufficient? lean:
CLI/digest first, view later — ADR-0001 open question.)

## 이 표면이 결코 해서는 안 되는 것
- 생성된 산문을 증거로 제시하지 말 것(배너 + `evidence:false`는 필수).
- `noise` 등급 finding을 종합하지 말 것.
- 공개 source 연구와 내부 Samsung/SAIT 주장을 절대 혼동하지 말 것(brief §12); `boundary`가 스탬핑됨.
- `render`가 export를 수행하게 하지 말 것 — `paper-card`/`action-brief`는 export 이전(pre-export) markdown이다;
  export 이음새는 `ExportAdapter`(ADR-0007)이며, novelty-threat에 대해서는 `confirm`으로 gate된다.

## Open Questions
- TODO(open-question: digest grouping/ordering details — exact sectioning and how recall-floor hits are pinned.)
- TODO(open-question: slide-outline tool target — Marp confirmed? any alternative renderer?)
- TODO(open-question: read-view shipping in v1 vs deferred — see ADR-0001.)
- TODO(open-question: digest archive retention/compaction alongside ledger retention — ADR-0006.)
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md).

## runbook에 대한 함의
- **RB (base template + 5 renderers):** 하나의 기반 템플릿(provenance manifest + not-evidence 배너); 다섯 개의
  `FormatRenderer` 어댑터; `noise` 제외; markdown 우선.
- **RB (digest):** 두 축 분류 체계로 그룹화하고 설명 가능한 relevance로 정렬하며 recall-floor 적중을 고정한
  주간 digest 조립.
- **RB (read view, optional/deferred):** 읽기 전용 ledger + digest-아카이브 브라우저; 변경 없음, export 없음.
