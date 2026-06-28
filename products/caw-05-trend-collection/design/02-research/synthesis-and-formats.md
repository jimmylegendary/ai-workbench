# Synthesis & Output Formats

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md), [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS.md), [./classification-and-triage.md](./classification-and-triage.md) (TODO), [./export-boundaries.md](../05-radar-core/export-boundaries.md) (TODO), [../01-decisions/](../01-decisions/) (ADR: synthesis & output formats — TODO), [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This doc decides **how CAW-05 turns triaged findings into its five output formats** (memo, digest, slide
outline, paper-card, action brief) and **how provenance and the "generated summary != evidence" invariant
travel through synthesis into every artifact**. It specifies a per-format template set, the synthesis pipeline
(ports & adapters), and the provenance-carrying rules. It does **NOT** decide the classification/triage logic
(see [classification-and-triage.md](./classification-and-triage.md) — TODO), the interest model, source
ingestion, storage format (md vs SQLite — storage ADR), or the wire schema of the export bundles themselves
(that is owned by the export-boundaries ADR; this doc fixes only what synthesis must hand it).

The non-negotiable invariant (brief §5, §10, §12): **a finding's `source`/quoted excerpt is evidence-bearing;
the synthesized prose is NOT evidence. Every generated artifact must make that distinction machine-readable, and
must never present public-source research as an internal Samsung/SAIT claim.**

## 1. The five formats — what each is, for whom, when emitted
All formats are **markdown-first** (brief §4). They are views over the same triaged `Finding` set, not separate
data. One finding can appear in several formats simultaneously.

| Format | Cardinality | Primary reader | Triggered by | Routed/exports to |
|---|---|---|---|---|
| **memo** | 1 finding → 1 doc | Jimmy | a single high-salience finding (esp. `novelty-threat`) | inline review; may spawn action brief |
| **digest** | N findings → 1 doc | Jimmy + team | weekly cron run (use case 1) | the standing digest archive |
| **slide outline** | N findings → 1 deck outline | team (meeting) | on demand / weekly review | Marp/Pandoc render (§5) |
| **paper-card** | 1 paper → 1 card | Jimmy, AI agents | a finding whose source is a paper/repo | **CAW-02** (Source/RelatedWork), **CAW-03** (novelty signal) |
| **action brief** | 1 finding → 1 brief | Jimmy, AI agents | finding routed to task/open-question | **CAW-01** / **CAW-06** (open questions) |

Format ≠ classification, but they correlate: `novelty-threat` → memo + paper-card + CAW-03 signal;
`support`/`adjacent` → digest + paper-card; an `open-question` routing → action brief. `noise` is **never**
synthesized (it is logged and dropped) — synthesizing noise wastes the reader and dilutes recall signal.

## 2. The Finding — synthesis input contract
Synthesis consumes the triaged `Finding` exactly as classification produces it; it adds nothing to the evidence
layer, only generated prose over it. Minimum fields synthesis relies on (full schema owned by triage doc):

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

**Rule:** synthesis may read every field but may only *write* into a generated layer. It cannot mutate
`source_ref`, `excerpts`, `trust`, or `boundary`. Quoted `excerpts` are reproduced verbatim and labelled as
quotes; everything synthesis writes around them is labelled generated.

## 3. Synthesis pipeline (ports & adapters)
Ports & adapters per brief §9: formats plug in as `FormatRenderer` adapters; the template engine and the LLM are
adapters too, so neither is load-bearing in the core.

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

### Port contracts (signatures are build guidance; the builder writes the code)
| Port | Responsibility | v1 adapter | Stubs |
|---|---|---|---|
| `FormatRenderer` | one per format; owns the skeleton + which slots are generated vs extracted | memo, digest, slide-outline, paper-card, action-brief | future formats (e.g. tweet-thread) |
| `Synthesizer` | fill generated slots from findings under a strict "no new facts" prompt contract | LLM via CAW-family model adapter | rule-only/extractive fallback (no LLM) |
| `TemplateEngine` | deterministic data → markdown binding | **Jinja2** (Python pipeline) or **Handlebars** (Node) — pick per stack (§5) | — |
| `ProvenanceStamper` | write manifest + markers; compute boundary; recompute nothing it isn't given | shared lib | — |
| `Exporter` | package routed outputs into per-target bundles | CAW-01/02/03/06 bundles | others |

**Separation that matters:** steps 1–2 are deterministic data ops; step 3 is the *only* non-deterministic stage
and it is sandboxed to generated slots; steps 4–6 are deterministic again. This keeps the auditable spine
(which source produced which output) free of LLM nondeterminism.

## 4. Provenance carrying & the "generated != evidence" marking
Two complementary mechanisms: a **document manifest** (machine-readable, for agents/exports) and **in-body
markers** (human-readable, so a reader can never mistake synthesis for evidence). Both are mandatory.

### 4.1 Document manifest (YAML frontmatter on every artifact)
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
This mirrors the CAW-02 import envelope so a receiving product re-validates without a shared store (brief §8;
[CAW-02 import/export](../../../caw-02-knowledge-repository/design/02-research/import-export-boundaries.md), a
separate product). `evidence: false` is the single most important field — it is the export-side guard against
synthesis being catalogued as evidence.

### 4.2 In-body markers (three labelled spans)
Every synthesized artifact distinguishes exactly three kinds of content:

| Marker | Meaning | Source of the text | Is it evidence? |
|---|---|---|---|
| `> [!quote]` + `[S#]` cite | verbatim excerpt from a source | `finding.excerpts[].quote` | **pointer to evidence** (the source is) |
| plain prose | generated synthesis | LLM (step 3) | **no — generated** |
| `[S#]` reference list | the source anchors | `finding.source_ref` | the evidence anchors |

- A **standing banner** at the top of every artifact: `*Generated summary — not evidence. Verify against cited
  sources [S#].*`
- **Every generated sentence that makes a factual claim must carry a `[S#]` citation** resolving to a source in
  the manifest. Step-6 gate **rejects** an artifact with an uncited factual claim or a quote whose locator does
  not resolve. (This is the synthesis-side analogue of CAW-02's evidence gate.)
- Quotes are reproduced verbatim and visually set off; generated paraphrase is never styled as a quote.

### 4.3 Boundary rule
CAW-05 ingests **public** sources only (brief §8), so artifacts are normally `public`. The stamper still
computes `boundary = max()` over cited findings and **fails loud** if anything non-public appears (defense in
depth; should never happen in v1). Synthesis can never downgrade a boundary — there is no "launder by summary"
path (consistent with the CAW-02 propagation rule).

## 5. Key decisions

### 5.1 Template engine
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Jinja2** | mature, template inheritance (base + per-format children), rich filters, Python-native | Python runtime | **chosen if pipeline is Python** — inheritance lets the manifest/banner live in one base template |
| **Handlebars** | logicless, pre-compilable, Node-native | no inheritance; partials only | chosen if pipeline is Node |
| hand-rolled f-strings | zero deps | every format re-implements markers/manifest → drift, leak risk | rejected |

**Decision:** use a real template engine with inheritance/partials so the **banner + manifest + marker
conventions are defined once in a base template** and cannot drift per format. Engine choice follows the
implementation stack (Jinja2 / Handlebars); the `TemplateEngine` port keeps it swappable.

### 5.2 Slide rendering (for the slide-outline format)
The slide *outline* is markdown; rendering to a deck is a separate, optional downstream step.

| Tool | Input | Output | Note |
|---|---|---|---|
| **Marp** | CommonMark + directives | HTML/PDF/**PPTX** | simplest; CLI + VS Code; good default for a team deck |
| **Pandoc** | markdown | reveal.js/Beamer/**PPTX** | best when slides are part of a larger doc pipeline |
| **reveal.js / Slidev** | md + HTML/Vue | rich HTML decks | overkill for an outline; for interactive decks only |

**Decision:** emit a **Marp-compatible** markdown outline (`---` slide separators, front-matter theme) as the
canonical artifact; document Pandoc as the alternate renderer. Rendering is **out of v1 scope** beyond emitting
render-ready markdown — keep CAW-05 markdown-first (brief §4) and let the reader run Marp/Pandoc.

### 5.3 Where summaries get marked as non-evidence
| Option | Pros | Cons | Fit |
|---|---|---|---|
| frontmatter manifest only | machine-clean | a human skimming body can miss it | insufficient alone |
| in-body banner only | human-obvious | not machine-checkable on export | insufficient alone |
| **both (manifest + banner + per-claim cite)** | human- and machine-safe; gate-enforceable | slightly more template work | **chosen** |

## 6. Per-format template set (skeletons)
All inherit a base template providing the §4.1 frontmatter, the §4.2 banner, and the `[S#]` source list.
Generated slots are marked `{{...}}`; extracted (non-generated) fields are marked `[[...]]`.

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

### 6.2 digest (weekly)
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
Grouping is by classification then watchlist term; `noise` is excluded (it never reaches synthesis).

### 6.3 slide outline (Marp-compatible)
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
The paper-card is the synthesis surface that feeds the **export bundle** to CAW-02 (as Source/RelatedWork) and
CAW-03 (novelty signal). The bundle carries the §4.1 manifest with `evidence:false`; the receiving product
re-classifies and never stores the card prose as evidence.

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
Action briefs are **proposals**, never autonomous decisions (brief §11, §12): the brief states the suggested
task/open-question and the human routes it.

## 7. Open Questions
See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).
- TODO(open-question: do the generated slots need per-sentence citation granularity, or is per-paragraph `[S#]`
  enough for the gate to be both enforceable and not over-strict on synthesized prose?)
- TODO(open-question: exact export-bundle wire schema for paper-card → CAW-02/CAW-03 and action-brief →
  CAW-01/CAW-06 — owned by the export-boundaries ADR; this doc fixes only the manifest fields that must survive.)
- TODO(open-question: should the LLM synthesizer be allowed at all for the paper-card "novelty implication", or
  should that field be extractive-only to minimize hallucinated novelty claims feeding CAW-03?)
- TODO(open-question: hallucination guard — beyond per-claim citation, do we need an automated check that every
  generated factual sentence is entailed by a cited excerpt (NLI/quote-overlap), or is the cite-gate + human
  review sufficient for v1?)
- TODO(open-question: digest cadence/size caps and template-engine default (Python/Jinja2 vs Node/Handlebars,
  pending the pipeline-language ADR; the `TemplateEngine` port keeps it reversible) and whether slide rendering
  (Marp vs Pandoc) is invoked in v1 or left to the reader.)

## 8. Implications for runbooks
- **Template runbook:** create the **base template** carrying frontmatter manifest (§4.1), banner, and `[S#]`
  list; then the five child templates (§6). Generated vs extracted slots must be distinguished in the template
  itself so no renderer can blur them.
- **Synthesizer runbook:** wire the `Synthesizer` port with a strict "no new facts; fill only generated slots;
  every factual sentence must cite a provided `[S#]`" prompt contract; provide an **extractive fallback** path
  for when the LLM is unavailable.
- **Provenance/gate runbook:** implement `ProvenanceStamper` + the **step-6 gate** that rejects artifacts with
  uncited factual claims, unresolved quote locators, or `boundary > ceiling`. The gate is the machine form of
  brief §5/§12 and must run before emit.
- **Export runbook:** package paper-card → CAW-02/CAW-03 and action-brief → CAW-01/CAW-06 bundles with the §4.1
  manifest (`evidence:false`); fail loud if a non-public boundary appears. No shared store (brief §8).
- **Render runbook (optional):** document Marp/Pandoc invocation over the slide-outline markdown; not required to
  keep the tree green.

## References
- [Marp — Markdown Presentation Ecosystem](https://marp.app/)
- [Pandoc — slide-show formats](https://pandoc.org/MANUAL.html#slide-shows)
- [reveal.js](https://revealjs.com/) · [Slidev](https://sli.dev/)
- [Jinja2 — template inheritance](https://jinja.palletsprojects.com/en/3.1.x/templates/#template-inheritance)
- [Handlebars.js](https://handlebarsjs.com/)
- [W3C PROV-O](https://www.w3.org/TR/prov-o/) (provenance manifest backbone)
