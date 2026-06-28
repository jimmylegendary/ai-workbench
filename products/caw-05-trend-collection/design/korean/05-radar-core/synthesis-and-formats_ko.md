# Radar Core — Synthesis & Output Formats (종합 & 출력 포맷)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - **Source of truth:** [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF_ko.md) (§4 outputs, §5 synthesis, §12 generated≠evidence)
  - Conventions: [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS_ko.md)
  - ADR-0001 product surface & outputs — [../01-decisions/ADR-0001-product-surface-and-outputs_ko.md](../01-decisions/ADR-0001-product-surface-and-outputs_ko.md) (다섯 포맷, `FormatRenderer`)
  - ADR-0004 classification & triage — [../01-decisions/ADR-0004-classification-and-triage_ko.md](../01-decisions/ADR-0004-classification-and-triage_ko.md) (synthesis가 소비하는 `Finding`; 라우팅)
  - ADR-0007 export boundaries — [../01-decisions/ADR-0007-export-boundaries_ko.md](../01-decisions/ADR-0007-export-boundaries_ko.md) (paper-card/action-brief → bundle)
  - Research (근거 + skeleton): [../02-research/synthesis-and-formats_ko.md](../02-research/synthesis-and-formats_ko.md)
  - Siblings: [./export-boundaries_ko.md](../05-radar-core/export-boundaries_ko.md), [./ports-and-adapters_ko.md](./ports-and-adapters_ko.md)

## Purpose
이 문서는 **core 레벨**의 synthesis 계약을 확정한다: `Run`의 synthesis stage, `FormatRenderer` 포트와 그
다섯 어댑터, 그리고 어떤 artifact가 emit되거나 export되기 전에 *생성된 요약 ≠ 근거*를 강제하는 **citation gate**.
이것은 권위 있는 core 스펙이다. 근거, 옵션 표, 그리고 전체 템플릿 skeleton은 research 문서
([../02-research/synthesis-and-formats_ko.md](../02-research/synthesis-and-formats_ko.md))에 살며 **상호 링크로
연결될 뿐 중복되지 않는다**. 이 문서는 분류/triage(ADR-0004), export wire 스키마(ADR-0007 /
[./export-boundaries_ko.md](../05-radar-core/export-boundaries_ko.md)), 또는 레지스트리/stub 메커니즘
([./ports-and-adapters_ko.md](./ports-and-adapters_ko.md))을 결정하지 **않는다**.

**타협 불가 불변식 (brief §5, §12):** finding의 `source_ref` + verbatim `excerpts`만이 유일한 근거다.
synthesis가 쓰는 모든 것은 생성된 산문(prose)이며, `evidence:false`로 표시되고, 기계적으로 검증 가능하게
인용되며, 내부 Samsung/SAIT claim으로 절대 제시될 수 없다.

## 1. Synthesis가 Run 안에서 위치하는 지점
synthesis는 `Run` 파이프라인 `collect → dedup → classify → synthesize → export`의 `synthesize` stage이다
(ADR-0001 §Decision; [./ports-and-adapters_ko.md](./ports-and-adapters_ko.md) §Run). 이것은 triage되고 라우팅된
`Finding`을 소비하여 markdown artifact와 `export` stage가 bundle로 패키징하는 입력을 생산한다.

```
routed Findings (from classify)
        │
   ┌────▼─────────────────────────────────────────────┐
   │ synthesize stage                                  │
   │  1 Select & Group   (deterministic)               │
   │  2 Compose FormatRequest (deterministic)          │
   │  3 Generate         (Synthesizer port — ONLY LLM) │
   │  4 Bind template    (TemplateEngine — determ.)    │
   │  5 Stamp provenance (ProvenanceStamper — determ.) │
   │  6 CITATION GATE    (reject or pass — determ.)    │
   └────┬──────────────────────────────────────────────┘
        ▼
   markdown artifact  ──►  export stage (bundles, see export-boundaries.md)
```

**감사 가능한 척추(spine):** step 3만이 비결정적이며, 그것은 템플릿의 *생성된 슬롯(generated slot)*에 sandbox된다.
step 1–2와 4–6은 순수 데이터 연산이므로 "어떤 source가 어떤 출력을 생산했는가"는 LLM을 재실행하지 않고도 재구성
가능하다. `noise`로 분류된 finding은 **절대 synthesize되지 않는다**(ADR-0004) — 로깅되고 버려진다.

## 2. `FormatRenderer` 뒤의 다섯 포맷
각 포맷은 동일한 triage된 `Finding` 집합 위의 `FormatRenderer` 어댑터이다(ADR-0001 §5). 하나의 finding이 여러
포맷에 동시에 나타날 수 있다. 포맷은 복사본이 아니라 *view*이다.

| Format | Cardinality | Reader | Triggered by | Feeds |
|---|---|---|---|---|
| **memo** | 1 finding → 1 doc | Jimmy | high-salience finding (특히 `novelty-threat`) | inline review; action brief를 낳을 수 있음 |
| **digest** | N → 1 doc | Jimmy + team | weekly cron `Run` (use case 1) | the standing digest archive |
| **slide-outline** | N → 1 outline | team (meeting) | on demand / weekly review | Marp/Pandoc render (downstream, v1 범위 밖) |
| **paper-card** | 1 paper → 1 card | Jimmy, agents | source가 논문/repo인 finding | **CAW-02** (Source/RelatedWork) + **CAW-03** (novelty) |
| **action-brief** | 1 finding → 1 brief | Jimmy, agents | task / open-question으로 라우팅된 finding | **CAW-01** / **CAW-06** (open questions) |

포맷은 분류와 상관관계가 있지만 동일하지는 않다: `novelty-threat` → memo + paper-card + CAW-03;
`support`/`adjacent` → digest + paper-card; `open-question` 라우트 → action-brief. 전체 skeleton(base
템플릿 + 다섯 children)은 [../02-research/synthesis-and-formats_ko.md](../02-research/synthesis-and-formats_ko.md) §6에 있다.

### 2.1 The `FormatRenderer` 포트 (시그니처는 빌드 가이드)
```python
class FormatRenderer(Protocol):
    capabilities: AdapterCapabilities      # port="format", id, produces=MARKDOWN, exports_to=[CAW-0x|none]
    def applies_to(self, group: FindingGroup) -> bool: ...     # cardinality / classification preconditions
    def render(self, group: FindingGroup, ctx: SynthContext) -> Artifact: ...  # runs steps 3–6 for this format
# v1 adapters: MemoRenderer, DigestRenderer, SlideOutlineRenderer, PaperCardRenderer, ActionBriefRenderer
# stub adapters: TweetThreadRenderer, … (registered, maturity="stub"; see ports-and-adapters.md §stubs)
```
`Artifact = {markdown, manifest, findings[], boundary, gate_result}`. renderer는 *어떤 슬롯이 생성되고 어떤
것이 추출되는지*를 소유한다. 그것은 절대 banner/manifest 규약을 소유하지 않는다 — 그것들은 base 템플릿(§4)에 한 번
산다.

## 3. Synthesis가 소비하는 `Finding` (입력 계약)
synthesis는 ADR-0004가 생산한 triage된 `Finding`을 읽고 그 위에 생성된 레이어**만** 쓸 수 있다. 그것은
`source_ref`, `excerpts`, `trust`, `boundary`를 변경할 수 없다. 의존하는 최소 필드(전체 스키마는 triage가 소유 —
[../02-research/classification-and-triage_ko.md](../02-research/classification-and-triage_ko.md)):

```yaml
finding:
  id:             ULID                        # stable; cited by every output
  source_ref:     {uri, retrieved_at, kind}   # THE evidence anchor (extracted, not generated)
  excerpts:       [{quote, locator}]           # verbatim spans — evidence pointers, never generated
  title:          str                          # source metadata (extracted)
  authors/venue:  ...                          # extracted metadata
  classification: novelty-threat|support|adjacent|noise
  signal_vs_hype: signal|hype
  watchlist_hit:  [term, ...]                  # narrow-radar terms matched (brief §6)
  boundary:       public                       # CAW-05 ingests public only (brief §8)
  trust:          T0..T3                        # carried from triage, not minted here
  relates_to:     [{claim_or_strategy_id, relation: threatens|supports|neutral}]  # ledger link
  routed_to:      [CAW-01|CAW-02|CAW-03|CAW-06]
```

## 4. Provenance 운반 (manifest + in-body marker)
두 개의 필수적이고 상호 보완적인 메커니즘 — 하나는 기계/export용, 하나는 인간 독자용.

### 4.1 Document manifest (모든 artifact의 YAML frontmatter)
```yaml
caw05_artifact:
  format: memo|digest|slide-outline|paper-card|action-brief
  generated_by: {agent: caw05-synth, model: "<id>", run_id: ULID, produced_at: <RFC3339>}
  evidence: false                     # the synthesized prose is NEVER evidence — the single export-side guard
  boundary: public                    # max() over cited findings; synthesis can only raise, never lower
  findings: [<finding id>, ...]       # every finding this artifact rests on
  sources:  [{finding: id, source_ref: uri, retrieved_at: ...}]   # the evidence anchors
  classification_summary: {novelty_threat: n, support: n, adjacent: n}
  contract_version: "1.0.0"
```
이것은 CAW-02 import envelope를 미러링하므로 수신 제품이 공유 store 없이 재검증한다(brief §8).

### 4.2 In-body marker (세 가지 라벨링된 콘텐츠 종류)
| Marker | Meaning | Text source | Evidence? |
|---|---|---|---|
| `> [!quote]` + `[S#]` | verbatim excerpt | `finding.excerpts[].quote` | **근거에 대한 pointer** (source가 근거) |
| plain prose | generated synthesis | `Synthesizer` (step 3) | **no — generated** |
| `[S#]` reference list | source anchors | `finding.source_ref` | the evidence anchors |

- **standing banner**가 모든 artifact 최상단에 온다: `*Generated summary — not evidence. Verify against cited sources [S#].*`
- 생성된 모든 사실 문장은 manifest source로 해결되는 `[S#]`를 담는다.
- 인용문은 verbatim으로 재현되고 시각적으로 구별된다. 생성된 paraphrase는 절대 quote로 스타일링되지 않는다.

## 5. The citation gate (step 6) — generated ≠ evidence, 강제됨
gate는 brief §5/§12의 기계 형태이며 **emit 전 그리고 export 전**에 실행된다. 그것은 결정적이며
fail-closed이다: 실패한 gate는 artifact를(따라서 그것으로 만들어진 어떤 bundle도) abort시킨다.

| # | Gate check | Fail action |
|---|---|---|
| G1 | 모든 생성된 **사실** 문장이 manifest의 `[S#]`로 해결됨 | reject artifact |
| G2 | 모든 `> [!quote]` locator가 실제 `finding.excerpts[].locator`로 해결됨 | reject artifact |
| G3 | quote span 안에 생성된 산문이 나타나지 않음 (paraphrase-as-quote 없음) | reject artifact |
| G4 | `manifest.evidence == false`이고 존재함 | reject artifact |
| G5 | `boundary == max(cited findings)`이고 `<= boundary_ceiling`; non-public 없음 | reject + alert (절대 발생해선 안 됨, brief §8) |
| G6 | 렌더된 모든 `finding.id`가 `manifest.findings`에 나열됨 (orphan citation 없음) | reject artifact |
| G7 | group에 `noise`로 분류된 finding 존재 | reject (synthesis에 절대 도달해선 안 됨) |

**Negative test (반드시 성립):** 인용되지 않은 사실 주장 → reject (G1); 출처 없는 quote → reject (G2);
non-public finding → reject + alert (G5); `noise` finding 렌더 → reject (G7). 이들은
[./export-boundaries_ko.md](../05-radar-core/export-boundaries_ko.md) §Negative tests의 export-side negative
test를 미러링한다 — gate가 1차 방어선이고, export 어댑터가 defense-in-depth로 재확인한다.

TODO(open-question: citation granularity — gate가 synthesize된 산문에 과도하게 엄격하지 않으면서 강제 가능하도록
per-sentence vs per-paragraph `[S#]`. See [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md).)
TODO(open-question: entailment guard — per-claim citation을 넘어, 생성된 각 사실 문장이 인용된 excerpt에 의해
함의(entail)되는지 NLI/quote-overlap 체크를 추가할 것인가, 아니면 v1에는 cite-gate + human review로 충분한가?)

## 6. The supporting ports
synthesis는 `FormatRenderer` 외에 네 개의 작은 포트를 사용한다. 전체 계약과 레지스트리는
[./ports-and-adapters_ko.md](./ports-and-adapters_ko.md)에 산다.

| Port | Responsibility | v1 adapter | Stub / fallback |
|---|---|---|---|
| `Synthesizer` | 엄격한 "no new facts; cite every factual sentence" 프롬프트 하에 생성된 슬롯을 채움 | CAW-family model 어댑터를 통한 LLM | extractive rule-only fallback (LLM 없음) |
| `TemplateEngine` | 결정적 data → markdown 바인딩; base+child 상속을 소유 | Jinja2 (Python) / Handlebars (Node) | — |
| `ProvenanceStamper` | manifest(§4.1) + marker(§4.2) 작성; `boundary` 계산 | shared lib | — |
| `FormatRenderer` | 포맷당 하나(§2.1) | memo / digest / slide-outline / paper-card / action-brief | tweet-thread, … |

`Synthesizer` 프롬프트 계약은 고정되어 있다: *생성된 슬롯만 채워라; 제목/메타데이터/인용문은 전달되며 verbatim으로
재현되어야 하고 절대 재생성되지 않는다; 모든 사실 문장은 제공된 `[S#]`를 인용해야 한다.* extractive fallback은 LLM이
없을 때조차 radar가 audit-clean digest를 계속 생산하게 한다.

## 7. Slide rendering (markdown 너머는 v1 범위 밖)
`slide-outline` renderer는 **Marp 호환** markdown(`---` 구분자, theme front-matter)을 canonical artifact로
emit한다. Marp나 Pandoc을 통한 PPTX/PDF 렌더링은 downstream의, 선택적인, reader-run 단계이다 — CAW-05는
markdown-first로 유지된다(brief §4). research §5.2를 보라.

## 8. Open Questions
[../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md)에서 추적한다:
- TODO(open-question: paper-card의 "novelty implication" 슬롯이 CAW-03의 gate로 들어가는 환각된 novelty 주장을
  최소화하기 위해 LLM-generated가 아니라 extractive-only여야 하는가?)
- TODO(open-question: digest size/cadence cap — catch-up 주가 여러 주를 흡수할 때 digest가 페이지네이션하는가
  cap하는가, 그리고 그것이 recall-first floor와 어떻게 상호작용하는가?)
- TODO(open-question: template-engine 기본값 — pipeline-language ADR을 기다리는 Jinja2 vs Handlebars;
  `TemplateEngine` 포트가 이를 되돌릴 수 있게 유지함.)
- 더하여 §5의 granularity와 entailment-guard 질문.

## 9. 런북에 대한 함의
- **RB (base + child templates):** base 템플릿이 §4.1 manifest, §4.2 banner, `[S#]` list를 담음; 다섯
  child 템플릿이 이를 상속; 생성된 vs 추출된 슬롯이 *템플릿 안에서* 구별되므로 어떤 renderer도 이를 흐리게 할 수 없음.
- **RB (Synthesizer):** 위의 엄격한 프롬프트 계약 + extractive fallback 경로로 `Synthesizer` 포트를 연결.
- **RB (gate):** `ProvenanceStamper` + step-6 citation gate(G1–G7) 구현; emit 전에 실행되어야 하며 모든
  `FormatRenderer`가 공유.
- **RB (renderers):** 하나의 `Finding` group 위의 다섯 `FormatRenderer` 어댑터; paper-card와 action-brief는
  자신의 `Artifact`를 export stage로 넘김([./export-boundaries_ko.md](../05-radar-core/export-boundaries_ko.md)).
