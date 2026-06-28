# Novelty, Prior-Art & Venue

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md), [../01-decisions/](../01-decisions/) (ADR: ports & adapters — TODO; ADR: paper-ladder & novelty governance — TODO; ADR: patent module — TODO), [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This doc decides how CAW-03 (the Paper & Patent **harness**) governs **novelty and prior-art**: how it detects
when a claim is *novel* vs *threatened* vs needs **patent-first** handling, how the **CAW-05** radar (a separate
product) is consumed through a single **Novelty/Radar port**, and how venue-fit is evaluated. It delivers three
artifacts: (1) a **novelty / claim-boundary policy**, (2) the **P1/P2/P3 ladder governance** (claim typing +
paper sequence + patent-first gates), and (3) the **Novelty/Radar port surface** (interface + capability
descriptor + schemas) with the v1 adapters and documented stubs for future ones. It does **NOT** rebuild
PaperOrchestra's literature-review agent (that engine still discovers + verifies citations), re-own the claim
ledger (imported from CAW-02), or implement live prior-art connectors (port + stub only in v1).

## Scope boundary: engine vs harness vs radar
Three different things touch "related work", and conflating them is the main design risk.

| Concern | Who owns it | What it produces |
|---|---|---|
| **Citation discovery + verification** for a draft | PaperOrchestra `literature-review-agent` (the WritingEngine, Semantic Scholar-verified) | BibTeX + Intro/Related Work prose |
| **Trend / threat radar** over the field (continuous) | **CAW-05** (separate product) | classified signals (threat/support/neutral) per concept/claim |
| **Novelty governance**: is this claim still novel? does it need patent-first? | **CAW-03 harness** (this doc) | a **novelty verdict + claim-boundary decision** gating the draft |

CAW-03 does not crawl the field itself; it **imports** radar from CAW-05 and **queries** prior-art services
through one port, then **decides**. The decision is the value-add; discovery is delegated.

## Concept model: novelty states & claim-boundary
Each claim (typed in the imported ledger) carries a **novelty verdict** computed at draft time and re-checkable:

| Verdict | Meaning | Default gate action |
|---|---|---|
| `novel` | no prior-art/radar collision above threshold | proceed to draft |
| `threatened` | a related work overlaps but does not fully anticipate (partial scope collision) | narrow claim boundary or add differentiation; human review |
| `anticipated` | prior-art fully covers the claim (it is not new) | block paper claim as-is; demote to background/cite-it |
| `superseded` | a newer result beats our result | flag; may invalidate the paper's contribution framing |
| `patent-sensitive` | claim is patentable subject matter we may want to protect | route to **patent-first** path before any publication |

**Claim-boundary** = the explicit scope of an assertion (what is and is not claimed). The harness's job on a
`threatened` claim is to **propose a narrower boundary** that restores novelty (e.g., add the operating regime,
the constraint, the metric, or the mechanism that the prior art lacks) — and to record that boundary as a
first-class field so the engine drafts to it and the patent path can reuse it as a claim limitation.

## Prior-art / patent search landscape (grounding the PatentSearch sub-port)
Real services the future `live-prior-art` adapter can wrap; v1 ships the port + one cheap default + stubs.

| Service | Access | Coverage / notes | Fit for v1 adapter |
|---|---|---|---|
| **PatentsView** (USPTO open data) | Free REST API (~45 q/min), bulk download | US grants/apps, titles/abstracts, CPC, assignee/inventor | **v1 default** (free, no key, scriptable) |
| **Google Patents (BigQuery public dataset)** | GCP BigQuery | ~120M docs, 100+ offices, full text | strong future adapter (needs GCP billing) |
| **Lens.org Patent API** | Freemium (14-day trial, then paid) | ~140M records, USPTO/EPO/WIPO aggregated | future adapter (paid) |
| **EPO Open Patent Services (OPS)** | Free tier + key | EP/worldwide bibliographic, family data | future adapter (EU/family coverage) |
| **USPTO Patent Public Search (PE2E)** | Web tool, no clean API | examiner-grade search; hard to automate | manual fallback only |
| **PQAI (projectpq.ai)** | Open-source AI prior-art search | semantic/neural prior-art retrieval | future "semantic" adapter |

For **paper** prior-art (not patents), Semantic Scholar is already inside the engine; the harness reuses the
engine's verified pool rather than re-querying, and supplements with CAW-05 radar.

## Novelty detection approaches (what the v1 checker actually does)
LLM novelty scoring is an active research area (e.g. *OpenNovelty* agentic verifiable assessment arXiv:2601.01576;
*NovBench* arXiv:2604.11543; *SC4ANM* section-combination prediction arXiv:2505.16330). v1 stays deliberately
**conservative and explainable** rather than adopting a research scorer wholesale.

| Approach | Pros | Cons | v1 decision |
|---|---|---|---|
| **Overlap/retrieval signal** (embed claim, retrieve nearest related-work + radar, threshold) | cheap, explainable, no fabrication | crude; threshold tuning | **v1 baseline** |
| **LLM contradiction/anticipation judge** (does source S anticipate claim C?) | catches semantic overlap retrieval misses | LLM can hallucinate a verdict | v1 **as advisory only**, never sole gate |
| **Full agentic novelty scorer** (OpenNovelty-style) | strongest, citation-grounded | heavy, external dep, immature | **port-stub** (future adapter) |
| **Human verdict** | authoritative | slow | **required** for `threatened`/`patent-sensitive` |

**Rule:** a novelty verdict is `(retrieval_signal, llm_advisory, human_decision)`. Generated LLM text is **never
evidence** and never the sole basis for `anticipated`/`novel`; it only *flags* for human review (mirrors the
evidence-gate invariant from the brief). The harness records the inputs so the verdict is auditable.

## Venue-fit
Venue-fit is advisory metadata attached to a paper artifact, not a gate. Inputs and tools:

| Signal | Source | Use |
|---|---|---|
| Topical match | engine's verified citation pool + Semantic Scholar fields-of-study | suggest venues citing similar work |
| Deadlines / cycle | external CFP trackers (e.g. aideadlines.org, WikiCFP) via a thin fetch | timing the paper-ladder |
| Scope/format fit | venue's `conference_guidelines.md` (already a PaperOrchestra input) | page/format/anonymity constraints |
| Journal suggesters | Elsevier Journal Finder / Springer / IEEE recommenders | journal fallback |

v1 produces a ranked **venue-fit note** (top-N venues + rationale + next deadline) the human uses to pick;
auto-submission is a non-goal. Venue choice **feeds back** into the paper-ladder rung and the engine's guidelines
input.

## P1/P2/P3 ladder governance
The brief overloads "P1/P2/P3" as both a **claim type** and a **paper-ladder rung**; this doc fixes the mapping.

### Claim typing (imported from CAW-02 ledger, used by novelty/patent routing)
| Type | Meaning | Patent posture | Default publish posture |
|---|---|---|---|
| **P1** | core **method** claim (algorithm, technique) | usually publishable; patent optional | publish (P1 paper) |
| **P2** | **tool / system** claim (implementation, system result) | sometimes patentable | publish (P2 paper) after/with P1 |
| **P3** | **future-device** / forward-looking claim (projection of a device/product) | **patent-sensitive by default** | **patent-first**, publish only after filing decision |

### Paper ladder (the program paper sequence)
The ladder sequences the program's papers so each builds on the last and so disclosure order does not burn
patent rights: **P1 (method)** → **P2 (tool/system + results)** → **P3 (future-device / vision)**. Each rung has
a readiness gate (claims pass evidence gate + novelty verdict ≠ `anticipated` + confidentiality clears).

### Patent-first gate (the load-bearing rule)
| Claim type | Novelty verdict | Action |
|---|---|---|
| P1 / P2 | `novel` | draft paper; patent **optional** (human flag) |
| P1 / P2 | `threatened` | narrow boundary, re-check; then draft |
| P1 / P2 | `patent-sensitive` (human-flagged valuable) | **patent-first**: hold paper until filing decision |
| P3 | any | **patent-first by default**: no public draft until a file/abandon decision is recorded |
| any | `anticipated` | block as a contribution; demote to background |

**Patent-first** means: a publication-bound draft for that claim is **blocked** until a human records a decision
(`file` → patent path runs first; `abandon-protection` → publish allowed; `defer` → stays blocked). This is a
state on the artifact lifecycle, enforced by the harness, not a suggestion. Public disclosure before filing can
forfeit patent rights, so the gate **fails closed**.

## The Novelty/Radar port surface
One typed port; selected by config; core depends only on the interface. Sub-capabilities are declared in a
**capability descriptor** so the harness degrades gracefully when an adapter lacks one (e.g. CAW-05 import works
even if no live patent search is wired).

```python
# Port (stable contract). Adapters register against it; config picks them.
class NoveltyRadarPort(Protocol):
    def capabilities(self) -> CapabilityDescriptor: ...
    def check_novelty(self, req: NoveltyRequest) -> NoveltyVerdict: ...      # core gate input
    def search_prior_art(self, req: PriorArtQuery) -> list[PriorArtHit]: ... # optional capability
    def import_radar(self, bundle_uri: str) -> list[RadarSignal]: ...        # CAW-05 import

@dataclass
class CapabilityDescriptor:
    adapter_id: str
    supports: set[str]          # {"radar_import","paper_prior_art","patent_prior_art","llm_advisory"}
    boundary_max: str           # "public" | "internal" — confidentiality ceiling this adapter may touch
    rate_limit_qpm: int | None
    offline_ok: bool            # works from cached artifacts with no live calls
```

```json
// RadarSignal — REUSES the CAW-05 boundary envelope (CAW-02 already consumes the same shape).
// CAW-03 imports the SAME file artifact; it does not reach into CAW-05's store.
{
  "signal_id": "caw05:<opaque>",
  "signal_type": "paper | preprint | patent | blog | release",
  "source": { "title": "...", "authors": ["..."], "year": 2026, "doi": "...", "url": "https://...",
              "external_ids": { "arxiv": "...", "s2": "..." } },
  "classification": "threat | support | neutral | unknown",
  "relevance": { "score": 0.0, "rationale": "..." },
  "related_to": ["caw03-claim:<id>"],
  "boundary": "public",
  "raw_summary": "generated — NOT evidence"
}
```

```json
// NoveltyVerdict — what the gate consumes. Auditable, no fabricated evidence.
{
  "claim_id": "caw03:<id>",
  "claim_type": "P1 | P2 | P3",
  "verdict": "novel | threatened | anticipated | superseded | patent-sensitive",
  "retrieval_signal": { "top_hits": ["..."], "max_overlap": 0.0 },
  "llm_advisory": { "opinion": "...", "confidence": 0.0 },   // advisory only, never sole basis
  "proposed_boundary_narrowing": "string | null",
  "patent_first": true,
  "human_decision": "pending | confirmed | overridden",
  "inputs_digest": "sha256 over signals+hits (replayable)"
}
```

### v1 adapters vs port-only stubs
| Adapter | Status in v1 | Capability |
|---|---|---|
| **CAW-05 radar import** | implemented | `radar_import` (file-drop, same envelope CAW-02 uses) |
| **Engine-pool reuse** (paper prior-art from PaperOrchestra's verified BibTeX) | implemented | `paper_prior_art`, `offline_ok` |
| **Retrieval + LLM-advisory checker** | implemented | `llm_advisory` (flag-only) |
| **PatentsView** prior-art | implemented (thin, free) | `patent_prior_art` |
| Google Patents / Lens / EPO-OPS / PQAI | **stub** (interface + not-implemented marker + config example) | `patent_prior_art` |
| OpenNovelty-style agentic scorer | **stub** | `llm_advisory` (verifiable) |

A stub is a registered adapter that returns `NotImplemented` with a clear message and a config example, so wiring
the real connector later is one adapter, not a core change (brief §5 rule).

## Key tradeoffs
| Decision | Choice | Rationale | Rejected alternative |
|---|---|---|---|
| Novelty owner | harness **decides**, engine/radar **supply** | keeps governance independent of any one engine | bake novelty into PaperOrchestra (couples engine) |
| Radar coupling | **import CAW-05 file artifact** through port | no shared substrate; CAW-05 stays separate | live API into CAW-05 (violates independence) |
| Prior-art default | **PatentsView** free API + stubs | zero-cost, scriptable v1; richer later | require paid Lens/Google from day 1 |
| LLM novelty | **advisory flag only** | generated text is not evidence | LLM verdict as the gate (hallucination risk) |
| Patent-first | **fail-closed gate on P3 / patent-sensitive** | disclosure can forfeit rights | trust author to remember (rights leak) |
| Venue-fit | **advisory note, not a gate** | human picks; avoids over-automation | auto-submit (non-goal) |

## Open Questions
- TODO(open-question: overlap threshold + embedding model for `retrieval_signal` — tune on what corpus, and how
  to avoid a shared dependency with CAW-05's own scorer?)
- TODO(open-question: does CAW-05 emit `related_to` hints keyed to **CAW-03 claim ids**, or only to CAW-02
  concept/claim ids that CAW-03 must re-map through the imported ledger?)
- TODO(open-question: who is authoritative for "patent-sensitive" flagging — a human only, or may the harness
  auto-propose it from claim type + patent prior-art hits?)
- TODO(open-question: confidentiality — patent prior-art queries may reveal an internal idea to a third-party API;
  do we restrict `patent_prior_art` to `boundary=public` claim text only, and how is the query itself redacted?)
- TODO(open-question: how stale may an imported radar bundle be before a novelty verdict must be re-run prior to
  "submission-ready"? a freshness SLA on the gate?)
- TODO(open-question: venue-fit deadline data source — is scraping CFP trackers acceptable, or do we require a
  maintained list to avoid brittle scrapers?)
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks
- **RB (novelty-radar-port):** define `NoveltyRadarPort`, `CapabilityDescriptor`, and the verdict/signal schemas;
  config-driven adapter registry; core depends only on the port. Ship the four v1 adapters + stub markers.
- **RB (radar-import adapter):** CAW-05 file-drop importer reusing the shared envelope + re-redaction; map
  `related_to` to harness claim ids; dedup by `external_ids`; `raw_summary` excluded from evidence.
- **RB (novelty-checker):** retrieval signal over engine pool + radar; LLM advisory (flag-only); emit auditable
  `NoveltyVerdict`; never let generated text be sole basis for `novel`/`anticipated`.
- **RB (patent-first gate):** lifecycle state + fail-closed gate keyed on claim type (P3) and `patent-sensitive`;
  block publish-bound drafts until a human `file|abandon|defer` decision is recorded.
- **RB (prior-art adapter — PatentsView v1):** thin client (rate-limit aware), `PriorArtHit` mapping, redaction of
  query text; document the Google/Lens/EPO/PQAI stubs with config examples.
- **RB (paper-ladder + venue-fit):** ladder plan (P1→P2→P3) with per-rung readiness gates; venue-fit note
  generator feeding the engine's `conference_guidelines.md` input. Every action is a vetted skill-interface call so
  agents and humans share the same gates.
