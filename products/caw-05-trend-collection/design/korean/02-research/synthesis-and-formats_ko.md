# 종합(Synthesis) & 출력 포맷

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF_ko.md), [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS_ko.md), [./classification-and-triage.md](./classification-and-triage_ko.md) (TODO), [./export-boundaries.md](../05-radar-core/export-boundaries_ko.md) (TODO), [../01-decisions/](../01-decisions/) (ADR: synthesis & output formats — TODO), [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
이 문서는 **CAW-05가 triage된 finding을 다섯 가지 출력 포맷**(memo, digest, slide outline, paper-card, action brief)**으로 어떻게 바꾸는가**, 그리고 **provenance와 "생성된 요약 != evidence" 불변식이 어떻게 synthesis를 거쳐 모든 artifact로 전달되는가**를 결정한다. per-format 템플릿 set, synthesis 파이프라인(ports & adapters), provenance-carrying 규칙을 명세한다. classification/triage 로직 ([classification-and-triage.md](./classification-and-triage_ko.md) — TODO 참조), interest 모델, source ingestion, storage 포맷(md vs SQLite — storage ADR), 또는 export 번들 자체의 wire 스키마(export-boundaries ADR이 소유; 이 문서는 synthesis가 넘겨야 할 것만 고정)는 결정하지 **않는다(NOT)**.

타협 불가 불변식 (brief §5, §10, §12): **finding의 `source`/인용 발췌(excerpt)는 evidence를 담는다; 종합된 산문은 evidence가 아니다(NOT). 모든 생성된 artifact는 그 구별을 machine-readable하게 만들어야 하며, 공개 소스 research를 내부 Samsung/SAIT 주장으로 절대 제시해서는 안 된다.**

## 1. 다섯 포맷 — 각각 무엇이며, 누구를 위한 것이고, 언제 방출되는가
모든 포맷은 **markdown-first**다 (brief §4). 이들은 별도 데이터가 아니라 같은 triage된 `Finding` set에 대한 view다. 하나의 finding이 여러 포맷에 동시에 나타날 수 있다.

| 포맷 | 카디널리티 | 주 독자 | 트리거 | 라우팅/export 대상 |
|---|---|---|---|---|
| **memo** | finding 1 → doc 1 | Jimmy | 단일 고-salience finding (특히 `novelty-threat`) | inline review; action brief를 낳을 수 있음 |
| **digest** | finding N → doc 1 | Jimmy + team | 주간 cron run (use case 1) | 상시 digest 아카이브 |
| **slide outline** | finding N → deck outline 1 | team (회의) | on demand / 주간 review | Marp/Pandoc 렌더 (§5) |
| **paper-card** | paper 1 → card 1 | Jimmy, AI agent | source가 paper/repo인 finding | **CAW-02** (Source/RelatedWork), **CAW-03** (novelty signal) |
| **action brief** | finding 1 → brief 1 | Jimmy, AI agent | task/open-question으로 라우팅된 finding | **CAW-01** / **CAW-06** (open question) |

포맷 ≠ 분류, 하지만 상관됨: `novelty-threat` → memo + paper-card + CAW-03 signal; `support`/`adjacent` → digest + paper-card; `open-question` 라우팅 → action brief. `noise`는 **절대** 종합되지 않음 (로깅되고 폐기됨) — noise를 종합하는 것은 독자를 낭비하고 recall signal을 희석한다.

## 2. Finding — synthesis 입력 계약
synthesis는 classification이 생산한 그대로의 triage된 `Finding`을 소비한다; evidence 계층에 아무것도 추가하지 않고, 그 위에 생성된 산문만 더한다. synthesis가 의존하는 최소 필드 (전체 스키마는 triage 문서가 소유):

```yaml
finding:
  id:            ULID                         # stable, cited by every output
  source_ref:    {uri, retrieved_at, kind}    # arXiv id / repo URL / report path — THE evidence anchor
  excerpts:      [{quote, locator}]           # verbatim spans (evidence-bearing pointers, NOT generated)
  title:         str                          # from source metadata (extracted, not generated)
  authors/venue: ...                          # extracted metadata
  classification: novelty-threat|support|adjacent|noise
  signal_vs_hype: signal|hype
  watchlist_hit: [term, ...]                  # which narrow-radar terms matched (brief §6)
  boundary:      public                       # CAW-05 ingests public sources only (brief §8)
  trust:         T0..T3                        # from triage; carried, not minted by synthesis
  relates_to:    [{claim_or_strategy_id, relation: threatens|supports}]  # ledger link
  routed_to:     [CAW-01|CAW-02|CAW-03|CAW-06]
```

**규칙:** synthesis는 모든 필드를 읽을 수 있지만 생성된 계층에만 *쓸* 수 있다. `source_ref`, `excerpts`, `trust`, 또는 `boundary`를 변경(mutate)할 수 없다. 인용된 `excerpts`는 verbatim으로 재현되고 quote로 라벨링된다; synthesis가 그 주변에 쓰는 모든 것은 generated로 라벨링된다.

## 3. Synthesis 파이프라인 (ports & adapters)
brief §9에 따른 Ports & adapters: 포맷은 `FormatRenderer` adapter로 plug-in되고; 템플릿 엔진과 LLM도 adapter이므로 둘 다 core에서 load-bearing이 아니다.

```
triaged Findings
   │
   ▼
[1 Select & Group]──► relevance/recency/classification filter; group by topic/watchlist term
   │                  (digest/slides need grouping; memo/paper-card/brief are per-finding)
   ▼
[2 Compose]────────► build a FormatRequest{format, findings[], audience, boundary_ceiling}
   │
   ▼
[3 Generate]───────► Synthesizer port → LLM adapter fills ONLY the generated slots of the template
   │                  (titles/metadata/quotes come from Finding fields, never re-generated)
   ▼
[4 Bind template]──► TemplateEngine adapter renders the per-format skeleton (§6) with data + generated slots
   │
   ▼
[5 Stamp]──────────► ProvenanceStamper writes frontmatter manifest + per-block markers (§4)
   │
   ▼
[6 Gate]───────────► reject if any generated block lacks a citation, or boundary > ceiling, or a quote is unsourced
   │
   ▼
[7 Emit]───────────► markdown artifact (+ optional render) + export bundle for routed targets
```

### 포트 계약 (시그니처는 빌드 가이드; builder가 코드를 작성)
| 포트 | 책임 | v1 adapter | Stubs |
|---|---|---|---|
| `FormatRenderer` | 포맷당 하나; skeleton + 어느 slot이 generated vs extracted인지 소유 | memo, digest, slide-outline, paper-card, action-brief | 미래 포맷 (예: tweet-thread) |
| `Synthesizer` | 엄격한 "no new facts" 프롬프트 계약 하에 finding으로부터 generated slot 채움 | CAW-family model adapter를 통한 LLM | rule-only/extractive fallback (LLM 없음) |
| `TemplateEngine` | 결정론적 data → markdown 바인딩 | **Jinja2** (Python 파이프라인) 또는 **Handlebars** (Node) — 스택별 선택 (§5) | — |
| `ProvenanceStamper` | manifest + marker 작성; 주어지지 않은 것은 재계산하지 않음 | 공유 lib | — |
| `Exporter` | 라우팅된 출력을 target별 번들로 패키징 | CAW-01/02/03/06 번들 | 기타 |

**중요한 분리:** step 1–2는 결정론적 data 연산; step 3은 *유일한* 비결정론적 stage이며 generated slot에 sandbox됨; step 4–6은 다시 결정론적. 이로써 감사 가능한 척추(어느 source가 어느 output을 생산했는가)가 LLM 비결정성에서 자유롭게 유지된다.

## 4. Provenance carrying & "generated != evidence" 표시
상보적인 두 메커니즘: **document manifest**(machine-readable, agent/export용)와 **in-body marker**(human-readable, 독자가 synthesis를 evidence로 절대 오인할 수 없게). 둘 다 필수.

### 4.1 Document manifest (모든 artifact의 YAML frontmatter)
```yaml
caw05_artifact:
  format: memo|digest|slide-outline|paper-card|action-brief
  generated_by: {agent: caw05-synth, model: "<id>", run_id: ULID, produced_at: <RFC3339>}
  evidence: false                      # the synthesized prose is NEVER evidence
  boundary: public                     # max() over cited findings; never downgraded by synthesis
  findings: [<finding id>, ...]        # every finding this artifact rests on
  sources:  [{finding: id, source_ref: uri, retrieved_at: ...}]   # the evidence anchors
  classification_summary: {novelty_threat: n, support: n, adjacent: n}
  contract_version: "1.0.0"
```
이것은 CAW-02 import envelope을 반영하므로 수신 제품이 공유 저장소 없이 재검증한다 (brief §8; [CAW-02 import/export](../../../../caw-02-knowledge-repository/design/korean/02-research/import-export-boundaries_ko.md), 별도 제품). `evidence: false`가 가장 중요한 단일 필드다 — synthesis가 evidence로 분류되는 것에 대한 export-side 가드다.

### 4.2 In-body marker (라벨링된 세 span)
모든 종합된 artifact는 정확히 세 종류의 콘텐츠를 구별한다:

| Marker | 의미 | 텍스트의 출처 | evidence인가? |
|---|---|---|---|
| `> [!quote]` + `[S#]` cite | source에서의 verbatim 발췌 | `finding.excerpts[].quote` | **evidence로의 포인터** (source가 evidence) |
| plain prose | 생성된 synthesis | LLM (step 3) | **아니오 — generated** |
| `[S#]` reference list | source anchor | `finding.source_ref` | evidence anchor |

- 모든 artifact 상단의 **상시 배너(standing banner)**: `*Generated summary — not evidence. Verify against cited sources [S#].*`
- **사실 주장을 하는 모든 생성된 문장은 manifest의 source로 해소되는 `[S#]` citation을 담아야 한다.** Step-6 gate는 미인용 사실 주장 또는 locator가 해소되지 않는 quote가 있는 artifact를 **거부**한다. (이는 CAW-02의 evidence gate의 synthesis-side 유사물이다.)
- Quote는 verbatim으로 재현되고 시각적으로 구별됨; 생성된 paraphrase는 절대 quote로 스타일링되지 않음.

### 4.3 Boundary 규칙
CAW-05는 **공개** 소스만 수집하므로 (brief §8), artifact는 보통 `public`이다. 그래도 stamper는 cited finding에 대해 `boundary = max()`를 계산하고 non-public이 나타나면 **크게 실패(fail loud)**한다 (defense in depth; v1에서는 절대 일어나면 안 됨). synthesis는 절대 boundary를 강등할 수 없다 — "요약으로 세탁(launder)"하는 경로는 없다 (CAW-02 전파 규칙과 일관).

## 5. 핵심 결정

### 5.1 템플릿 엔진
| 옵션 | 장점 | 단점 | 적합성 |
|---|---|---|---|
| **Jinja2** | 성숙, 템플릿 상속 (base + per-format child), 풍부한 filter, Python 네이티브 | Python 런타임 | **파이프라인이 Python이면 선택** — 상속으로 manifest/banner가 하나의 base 템플릿에 살 수 있음 |
| **Handlebars** | logicless, pre-compilable, Node 네이티브 | 상속 없음; partial만 | 파이프라인이 Node이면 선택 |
| hand-rolled f-string | 무의존성 | 모든 포맷이 marker/manifest를 재구현 → drift, leak 위험 | 거부 |

**결정:** 상속/partial을 가진 진짜 템플릿 엔진을 사용하여 **banner + manifest + marker 규약이 base 템플릿에 한 번 정의**되고 포맷별로 drift할 수 없게 한다. 엔진 선택은 구현 스택을 따름 (Jinja2 / Handlebars); `TemplateEngine` 포트가 교체 가능하게 유지한다.

### 5.2 Slide 렌더링 (slide-outline 포맷용)
slide *outline*은 markdown이다; deck으로 렌더링하는 것은 별도의 선택적 downstream 단계다.

| 도구 | 입력 | 출력 | 비고 |
|---|---|---|---|
| **Marp** | CommonMark + directive | HTML/PDF/**PPTX** | 가장 단순; CLI + VS Code; 팀 deck의 좋은 기본값 |
| **Pandoc** | markdown | reveal.js/Beamer/**PPTX** | slide가 더 큰 doc 파이프라인의 일부일 때 최적 |
| **reveal.js / Slidev** | md + HTML/Vue | 풍부한 HTML deck | outline에는 과함; 인터랙티브 deck 전용 |

**결정:** **Marp-호환** markdown outline (`---` slide 구분자, front-matter theme)을 canonical artifact로 방출; Pandoc을 대체 렌더러로 문서화. 렌더링은 render-ready markdown 방출을 넘어 **v1 범위 밖** — CAW-05를 markdown-first로 유지하고 (brief §4) 독자가 Marp/Pandoc을 실행하게 한다.

### 5.3 요약을 non-evidence로 표시하는 위치
| 옵션 | 장점 | 단점 | 적합성 |
|---|---|---|---|
| frontmatter manifest만 | machine-clean | 본문을 훑는 사람이 놓칠 수 있음 | 단독으로는 불충분 |
| in-body banner만 | human-obvious | export 시 machine-checkable 아님 | 단독으로는 불충분 |
| **둘 다 (manifest + banner + per-claim cite)** | human- 및 machine-safe; gate-enforceable | 템플릿 작업이 약간 더 | **선택** |

## 6. Per-format 템플릿 set (skeleton)
모두 §4.1 frontmatter, §4.2 banner, `[S#]` source list를 제공하는 base 템플릿을 상속한다. 생성된 slot은 `{{...}}`로 표시; 추출된(non-generated) 필드는 `[[...]]`로 표시.

### 6.1 memo
```markdown
# Memo: [[finding.title]]
*Generated summary — not evidence. Verify against cited sources.*  ([S#])
**Classification:** [[classification]] · **Signal/Hype:** [[signal_vs_hype]] · **Trust:** [[trust]]
**Watchlist hit:** [[watchlist_hit]]

## Why this matters now
{{2–4 sentences: relation to our novelty/strategy, each claim cited [S#]}}
## What it says
> [!quote] [[excerpts[0].quote]]  ([S1])
{{neutral paraphrase of the contribution, cited}}
## Threat / opportunity to our work
{{relation to relates_to[].claim_or_strategy_id — threatens|supports, cited}}
## Suggested routing
{{e.g. → CAW-03 novelty check; → action brief}}

[S1]: [[source_ref.uri]] (retrieved [[retrieved_at]])
```

### 6.2 digest (주간)
```markdown
# Weekly Radar Digest — week of [[week]]
*Generated summary — not evidence.* Findings: [[count]] · novelty-threats: [[n]]

## 🔴 Novelty threats
- **[[title]]** — {{one-line why-it-threatens}} ([S#]) · → [[routed_to]]
## 🟡 Support / corroboration
- **[[title]]** — {{one-line}} ([S#])
## 🔵 Adjacent / context
- **[[title]]** — {{one-line}} ([S#])

## Sources
[[ enumerated S# → source_ref for every finding above ]]
```
그룹핑은 classification 후 watchlist term으로; `noise`는 제외됨 (절대 synthesis에 도달하지 않음).

### 6.3 slide outline (Marp-호환)
```markdown
---
marp: true
theme: default
---
# Radar — week of [[week]]
*Generated outline — not evidence.*
---
## Novelty threats
{{≤5 bullets, one per top finding, each with (S#)}}
---
## What to do
{{routing bullets → CAW-01/02/03/06}}
---
## Sources
[[ S# list ]]
```

### 6.4 paper-card (→ CAW-02 / CAW-03)
```markdown
# Paper Card: [[title]]
*Generated card — fields marked {{}} are synthesis, not evidence.*
- **Authors / venue:** [[authors]] · [[venue]]      <!-- extracted -->
- **Link:** [[source_ref.uri]]  · **Retrieved:** [[retrieved_at]]
- **Watchlist:** [[watchlist_hit]] · **Classification:** [[classification]] · **Trust:** [[trust]]
- **Core claim (quoted):** > [[excerpts[0].quote]] ([S1])
- **Relation to our work:** {{threatens|supports which strategy_id, cited}}
- **Novelty implication:** {{1–2 sentences for CAW-03, cited}}
```
paper-card는 **export 번들**을 CAW-02(Source/RelatedWork로)와 CAW-03(novelty signal)으로 공급하는 synthesis 표면이다. 번들은 `evidence:false`인 §4.1 manifest를 담는다; 수신 제품은 재분류하고 card 산문을 evidence로 절대 저장하지 않는다.

### 6.5 action brief (→ CAW-01 / CAW-06)
```markdown
# Action Brief: [[finding.title]]
*Generated brief — not evidence.*
- **Trigger:** [[classification]] finding on [[watchlist_hit]] ([S#])
- **Proposed action:** {{task or open question — a PROPOSAL, Jimmy decides (brief §11)}}
- **Open question:** {{phrased for CAW-01/CAW-06}}
- **Evidence to check:** [S#] (the source the reader must verify)
- **Routing:** → [[routed_to]]
```
Action brief는 자율적 결정이 아니라 **제안(proposal)**이다 (brief §11, §12): brief는 제안된 task/open-question을 진술하고 사람이 그것을 라우팅한다.

## 7. Open Questions
[../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) 참조.
- TODO(open-question: 생성된 slot이 문장별(per-sentence) citation 단위가 필요한가, 아니면 단락별(per-paragraph) `[S#]`로 gate가 enforceable하면서도 종합된 산문에 과도하게 엄격하지 않기에 충분한가?)
- TODO(open-question: paper-card → CAW-02/CAW-03 및 action-brief → CAW-01/CAW-06의 정확한 export-bundle wire 스키마 — export-boundaries ADR이 소유; 이 문서는 살아남아야 할 manifest 필드만 고정.)
- TODO(open-question: paper-card "novelty implication"에 LLM synthesizer를 아예 허용해야 하는가, 아니면 CAW-03으로 공급되는 환각된 novelty 주장을 최소화하기 위해 그 필드를 extractive-only로 해야 하는가?)
- TODO(open-question: 환각 가드 — per-claim citation을 넘어, 모든 생성된 사실 문장이 cited excerpt에 의해 함의(entailed)되는지 자동 점검(NLI/quote-overlap)이 필요한가, 아니면 cite-gate + 사람 review가 v1에 충분한가?)
- TODO(open-question: digest cadence/size cap 및 템플릿 엔진 기본값 (Python/Jinja2 vs Node/Handlebars, 파이프라인 언어 ADR 대기 중; `TemplateEngine` 포트가 가역적으로 유지) 및 slide 렌더링(Marp vs Pandoc)이 v1에서 호출되는지 아니면 독자에게 맡기는지.)

## 8. Runbook에 대한 함의
- **Template runbook:** frontmatter manifest(§4.1), banner, `[S#]` list를 담는 **base 템플릿** 생성; 그 다음 다섯 child 템플릿(§6). generated vs extracted slot은 어떤 렌더러도 흐릴 수 없도록 템플릿 자체에서 구별되어야 함.
- **Synthesizer runbook:** 엄격한 "no new facts; generated slot만 채움; 모든 사실 문장은 제공된 `[S#]`을 인용해야 함" 프롬프트 계약으로 `Synthesizer` 포트 wiring; LLM이 사용 불가일 때를 위한 **extractive fallback** 경로 제공.
- **Provenance/gate runbook:** `ProvenanceStamper` + 미인용 사실 주장, 미해소 quote locator, `boundary > ceiling`인 artifact를 거부하는 **step-6 gate** 구현. gate는 brief §5/§12의 machine 형태이며 emit 전에 실행되어야 함.
- **Export runbook:** paper-card → CAW-02/CAW-03 및 action-brief → CAW-01/CAW-06 번들을 §4.1 manifest(`evidence:false`)와 함께 패키징; non-public boundary가 나타나면 크게 실패. 공유 저장소 없음 (brief §8).
- **Render runbook (선택):** slide-outline markdown 위의 Marp/Pandoc 호출 문서화; 트리를 green으로 유지하는 데 필수 아님.

## References
- [Marp — Markdown Presentation Ecosystem](https://marp.app/)
- [Pandoc — slide-show formats](https://pandoc.org/MANUAL.html#slide-shows)
- [reveal.js](https://revealjs.com/) · [Slidev](https://sli.dev/)
- [Jinja2 — template inheritance](https://jinja.palletsprojects.com/en/3.1.x/templates/#template-inheritance)
- [Handlebars.js](https://handlebarsjs.com/)
- [W3C PROV-O](https://www.w3.org/TR/prov-o/) (provenance manifest backbone)
