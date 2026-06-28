# Radar Core — Synthesis & Output Formats

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - **Source of truth:** [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md) (§4 outputs, §5 synthesis, §12 generated≠evidence)
  - Conventions: [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS.md)
  - ADR-0001 product surface & outputs — [../01-decisions/ADR-0001-product-surface-and-outputs.md](../01-decisions/ADR-0001-product-surface-and-outputs.md) (the five formats, `FormatRenderer`)
  - ADR-0004 classification & triage — [../01-decisions/ADR-0004-classification-and-triage.md](../01-decisions/ADR-0004-classification-and-triage.md) (the `Finding` synthesis consumes; routing)
  - ADR-0007 export boundaries — [../01-decisions/ADR-0007-export-boundaries.md](../01-decisions/ADR-0007-export-boundaries.md) (paper-card/action-brief → bundles)
  - Research (rationale + skeletons): [../02-research/synthesis-and-formats.md](../02-research/synthesis-and-formats.md)
  - Siblings: [./export-boundaries.md](../05-radar-core/export-boundaries.md), [./ports-and-adapters.md](./ports-and-adapters.md)

## Purpose
This doc fixes the **core-level** synthesis contract: the synthesis stage of a `Run`, the `FormatRenderer` port
and its five adapters, and the **citation gate** that enforces *generated summary ≠ evidence* before any artifact
is emitted or exported. It is the authoritative core spec; the rationale, option tables, and full template
skeletons live in the research doc ([../02-research/synthesis-and-formats.md](../02-research/synthesis-and-formats.md))
and are **cross-linked, not duplicated**. It does NOT decide classification/triage (ADR-0004), the export wire
schema (ADR-0007 / [./export-boundaries.md](../05-radar-core/export-boundaries.md)), or the registry/stub mechanics
([./ports-and-adapters.md](./ports-and-adapters.md)).

**Non-negotiable invariant (brief §5, §12):** a finding's `source_ref` + verbatim `excerpts` are the only
evidence; everything synthesis writes is generated prose, marked `evidence:false`, machine-checkably cited, and
never presentable as an internal Samsung/SAIT claim.

## 1. Where synthesis sits in the Run
Synthesis is the `synthesize` stage of the `Run` pipeline `collect → dedup → classify → synthesize → export`
(ADR-0001 §Decision; [./ports-and-adapters.md](./ports-and-adapters.md) §Run). It consumes triaged, routed
`Finding`s and produces markdown artifacts plus the inputs the `export` stage packages into bundles.

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

**Auditable spine:** only step 3 is non-deterministic, and it is sandboxed to *generated slots* of the template.
Steps 1–2 and 4–6 are pure data ops, so "which source produced which output" is reconstructable without replaying
the LLM. `noise`-classified findings are **never synthesized** (ADR-0004) — they are logged and dropped.

## 2. The five formats behind `FormatRenderer`
Each format is a `FormatRenderer` adapter over the same triaged `Finding` set (ADR-0001 §5). A finding may appear
in several formats at once; the format is a *view*, not a copy.

| Format | Cardinality | Reader | Triggered by | Feeds |
|---|---|---|---|---|
| **memo** | 1 finding → 1 doc | Jimmy | a high-salience finding (esp. `novelty-threat`) | inline review; may spawn an action brief |
| **digest** | N → 1 doc | Jimmy + team | weekly cron `Run` (use case 1) | the standing digest archive |
| **slide-outline** | N → 1 outline | team (meeting) | on demand / weekly review | Marp/Pandoc render (downstream, out of v1 scope) |
| **paper-card** | 1 paper → 1 card | Jimmy, agents | a finding whose source is a paper/repo | **CAW-02** (Source/RelatedWork) + **CAW-03** (novelty) |
| **action-brief** | 1 finding → 1 brief | Jimmy, agents | a finding routed to task / open-question | **CAW-01** / **CAW-06** (open questions) |

Format correlates with classification but is not equal to it: `novelty-threat` → memo + paper-card + CAW-03;
`support`/`adjacent` → digest + paper-card; an `open-question` route → action-brief. Full skeletons (base
template + five children) are in [../02-research/synthesis-and-formats.md](../02-research/synthesis-and-formats.md) §6.

### 2.1 The `FormatRenderer` port (signatures are build guidance)
```python
class FormatRenderer(Protocol):
    capabilities: AdapterCapabilities      # port="format", id, produces=MARKDOWN, exports_to=[CAW-0x|none]
    def applies_to(self, group: FindingGroup) -> bool: ...     # cardinality / classification preconditions
    def render(self, group: FindingGroup, ctx: SynthContext) -> Artifact: ...  # runs steps 3–6 for this format
# v1 adapters: MemoRenderer, DigestRenderer, SlideOutlineRenderer, PaperCardRenderer, ActionBriefRenderer
# stub adapters: TweetThreadRenderer, … (registered, maturity="stub"; see ports-and-adapters.md §stubs)
```
`Artifact = {markdown, manifest, findings[], boundary, gate_result}`. The renderer owns *which slots are generated
vs extracted*; it never owns the banner/manifest conventions — those live once in the base template (§4).

## 3. The `Finding` synthesis consumes (input contract)
Synthesis reads the triaged `Finding` produced by ADR-0004 and may write **only** a generated layer over it. It
cannot mutate `source_ref`, `excerpts`, `trust`, or `boundary`. Minimum fields relied on (full schema owned by
triage — [../02-research/classification-and-triage.md](../02-research/classification-and-triage.md)):

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

## 4. Provenance carrying (manifest + in-body markers)
Two mandatory, complementary mechanisms — one for machines/exports, one for human readers.

### 4.1 Document manifest (YAML frontmatter on every artifact)
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
This mirrors the CAW-02 import envelope so a receiving product re-validates with no shared store (brief §8).

### 4.2 In-body markers (three labelled kinds of content)
| Marker | Meaning | Text source | Evidence? |
|---|---|---|---|
| `> [!quote]` + `[S#]` | verbatim excerpt | `finding.excerpts[].quote` | **pointer to evidence** (the source is) |
| plain prose | generated synthesis | `Synthesizer` (step 3) | **no — generated** |
| `[S#]` reference list | source anchors | `finding.source_ref` | the evidence anchors |

- A **standing banner** tops every artifact: `*Generated summary — not evidence. Verify against cited sources [S#].*`
- Every generated factual sentence carries a `[S#]` resolving to a manifest source.
- Quotes are reproduced verbatim and visually set off; generated paraphrase is never styled as a quote.

## 5. The citation gate (step 6) — generated ≠ evidence, enforced
The gate is the machine form of brief §5/§12 and runs **before emit and before export**. It is deterministic and
fail-closed: a failed gate aborts the artifact (and therefore any bundle built from it).

| # | Gate check | Fail action |
|---|---|---|
| G1 | every generated **factual** sentence resolves to a `[S#]` in the manifest | reject artifact |
| G2 | every `> [!quote]` locator resolves to a real `finding.excerpts[].locator` | reject artifact |
| G3 | no generated prose appears inside a quote span (no paraphrase-as-quote) | reject artifact |
| G4 | `manifest.evidence == false` and is present | reject artifact |
| G5 | `boundary == max(cited findings)` and `<= boundary_ceiling`; nothing non-public | reject + alert (should never happen, brief §8) |
| G6 | every `finding.id` rendered is listed in `manifest.findings` (no orphan citation) | reject artifact |
| G7 | `noise`-classified finding present in the group | reject (it must never reach synthesis) |

**Negative tests (must hold):** an uncited factual claim → reject (G1); an unsourced quote → reject (G2); a
non-public finding → reject + alert (G5); a `noise` finding rendered → reject (G7). These mirror the export-side
negative tests in [./export-boundaries.md](../05-radar-core/export-boundaries.md) §Negative tests — the gate is the first line,
the export adapter re-checks as defense-in-depth.

TODO(open-question: citation granularity — per-sentence vs per-paragraph `[S#]` for the gate to be enforceable
without being over-strict on synthesized prose. See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).)
TODO(open-question: entailment guard — beyond per-claim citation, do we add an NLI/quote-overlap check that each
generated factual sentence is entailed by its cited excerpt, or is the cite-gate + human review enough for v1?)

## 6. The supporting ports
Synthesis uses four small ports besides `FormatRenderer`; full contracts and the registry live in
[./ports-and-adapters.md](./ports-and-adapters.md).

| Port | Responsibility | v1 adapter | Stub / fallback |
|---|---|---|---|
| `Synthesizer` | fill generated slots under a strict "no new facts; cite every factual sentence" prompt | LLM via CAW-family model adapter | extractive rule-only fallback (no LLM) |
| `TemplateEngine` | deterministic data → markdown binding; owns base+child inheritance | Jinja2 (Python) / Handlebars (Node) | — |
| `ProvenanceStamper` | write manifest (§4.1) + markers (§4.2); compute `boundary` | shared lib | — |
| `FormatRenderer` | one per format (§2.1) | memo / digest / slide-outline / paper-card / action-brief | tweet-thread, … |

The `Synthesizer` prompt contract is fixed: *fill only the generated slots; titles/metadata/quotes are passed
in and must be reproduced verbatim, never re-generated; every factual sentence must cite a provided `[S#]`.* The
extractive fallback keeps the radar producing audit-clean digests even when no LLM is available.

## 7. Slide rendering (out of v1 scope beyond markdown)
The `slide-outline` renderer emits **Marp-compatible** markdown (`---` separators, theme front-matter) as the
canonical artifact. Rendering to PPTX/PDF via Marp or Pandoc is a downstream, optional, reader-run step — CAW-05
stays markdown-first (brief §4). See research §5.2.

## 8. Open Questions
Tracked in [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md):
- TODO(open-question: should the paper-card "novelty implication" slot be extractive-only to minimize
  hallucinated novelty claims feeding CAW-03's gate, rather than LLM-generated?)
- TODO(open-question: digest size/cadence caps — when a catch-up week absorbs multiple weeks, does the digest
  paginate or cap, and how does that interact with the recall-first floor?)
- TODO(open-question: template-engine default — Jinja2 vs Handlebars pending the pipeline-language ADR; the
  `TemplateEngine` port keeps it reversible.)
- Plus the granularity and entailment-guard questions in §5.

## 9. Implications for runbooks
- **RB (base + child templates):** base template carries the §4.1 manifest, §4.2 banner, and `[S#]` list; five
  child templates inherit it; generated vs extracted slots are distinguished *in the template* so no renderer can
  blur them.
- **RB (Synthesizer):** wire the `Synthesizer` port with the strict prompt contract above + an extractive
  fallback path.
- **RB (gate):** implement `ProvenanceStamper` + the step-6 citation gate (G1–G7); it must run before emit and is
  shared by every `FormatRenderer`.
- **RB (renderers):** the five `FormatRenderer` adapters over one `Finding` group; paper-card and action-brief
  hand their `Artifact` to the export stage ([./export-boundaries.md](../05-radar-core/export-boundaries.md)).
