# Digest Outputs — the multi-format synthesis surface

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [cli-and-mcp.md](cli-and-mcp.md) (`render` produces these; the read view)
  - [scheduled-pipeline.md](scheduled-pipeline.md) (the synthesize stage that emits them)
  - [../01-decisions/ADR-0001-product-surface-and-outputs.md](../01-decisions/ADR-0001-product-surface-and-outputs.md) (the five formats + `FormatRenderer` port — **authoritative**)
  - [../01-decisions/ADR-0006-storage-and-scheduling.md](../01-decisions/ADR-0006-storage-and-scheduling.md) (files-as-truth layout; digests are derived)
  - [../01-decisions/ADR-0005-related-work-ledger.md](../01-decisions/ADR-0005-related-work-ledger.md) (the ledger the read view exposes)
  - [../01-decisions/ADR-0007-export-boundaries.md](../01-decisions/ADR-0007-export-boundaries.md) (paper-card → CAW-02/03; action-brief → CAW-01/06)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This doc describes the **output surface**: the five markdown-first synthesis formats, where they land on disk,
the shared base template (provenance manifest + "generated summary — not evidence" banner), and the optional
read view over the ledger + digest archive. It **elaborates** ADR-0001 §C/§5 (authoritative for the formats and
the `FormatRenderer` port); it does NOT redefine the formats, the export wire schema (ADR-0007), or the ledger
schema (ADR-0005). The load-bearing constraint: **a generated summary is never evidence** (brief §5, §12) — every
output carries that marking, and the underlying provenance, not the prose, is the auditable record.

## The five formats (one `Finding` set, many views)
All five are `FormatRenderer` adapters over the **shared triaged `Finding`** (ADR-0001 §5). A finding can appear
in several formats with one source of truth and one provenance manifest. `noise`-class findings are **never
synthesized**.

| Format | Scope | Audience / destination | Notes |
|---|---|---|---|
| `memo` | 1 finding | Jimmy / reader | the atomic unit; one finding, fully synthesized |
| `digest` | weekly, N findings | the team (weekly radar read) | the primary periodic output (brief §3 UC-1) |
| `slide-outline` | 1 finding or window | presentation | Marp-compatible markdown |
| `paper-card` | 1 paper | **export → CAW-02 (Source/Claim) / CAW-03 (novelty)** | structured card; export seam is ADR-0007 |
| `action-brief` | 1 finding | **export → CAW-01 / CAW-06 (open questions)** | proposes a task/question, not a decision |

All are **markdown-first** (brief §4); rich HTML/app rendering is downstream and optional (ADR-0001 §C). The
two export-shaped formats (`paper-card`, `action-brief`) feed the `ExportAdapter` but the **format itself is not
the export** — synthesis produces the markdown; export bundling/idempotency/signing is ADR-0007.

## Where outputs land (files-as-truth, derived)
Outputs are **derived, regenerable artifacts** under CAW-05's own tree (ADR-0006 §1). They are markdown, so
git-trackable for audit, but the **finding JSON + ledger remain the source of truth** — a digest can always be
re-rendered from findings. Layout (illustrative; finalize in runbook):

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

`caw05 render <format> <id|--window> [--out <path>]` writes here (see [cli-and-mcp.md](cli-and-mcp.md));
`render` is read-class for governance (it never mutates findings/ledger).

## The shared base template (every format inherits it)
Each `FormatRenderer` extends one base template that carries two non-negotiable elements (ADR-0001 §5):

1. **Provenance manifest** — source origin/date/retrieval, `canonical_id`, `boundary` (public/internal), trust,
   classification + version, relevance score with its **additive explanation** (ADR-0002). This is the
   auditable record.
2. **"Generated summary — not evidence" banner** — generated prose is marked `evidence:false`; it is a reading
   aid, never a claim. The provenance, not the synthesis, is what downstream products may cite.

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

## The digest (primary periodic output)
The weekly `digest` is the radar's headline read (brief §3 UC-1): the window's findings, grouped by the
two-axis taxonomy (novelty-threat / support / adjacent — `noise` omitted; signal vs hype), ordered by the
explainable relevance score (recall-floor watch-list hits surfaced first and never silently dropped). Each entry
links to its `memo` and its provenance manifest. The digest is regenerable from `findings/*.json`, so it is
disposable and re-renderable at any time.

## Optional read view (ledger + digest archive)
A read-mostly view (brief §4 secondary; ADR-0001 §6) over the **append-only ledger** (ADR-0005) + the digest
archive: browse `WatchedTarget → Finding/Signal → LedgerLink` with verification records, and the history of
weekly digests. It is **not load-bearing** and ships after the first slice — `caw05 status` + the digest archive
on disk may be enough for v1. It is a **read view only**: it never mutates the ledger and never performs an
export.

TODO(open-question: does the read view ship in v1, or are `caw05 status` + the digest archive sufficient? lean:
CLI/digest first, view later — ADR-0001 open question.)

## What this surface must never do
- Never present generated prose as evidence (banner + `evidence:false` are mandatory).
- Never synthesize `noise`-class findings.
- Never conflate public-source research with internal Samsung/SAIT claims (brief §12); `boundary` is stamped.
- Never let `render` perform an export — `paper-card`/`action-brief` are pre-export markdown; the export seam is
  the `ExportAdapter` (ADR-0007), gated by `confirm` for novelty-threats.

## Open Questions
- TODO(open-question: digest grouping/ordering details — exact sectioning and how recall-floor hits are pinned.)
- TODO(open-question: slide-outline tool target — Marp confirmed? any alternative renderer?)
- TODO(open-question: read-view shipping in v1 vs deferred — see ADR-0001.)
- TODO(open-question: digest archive retention/compaction alongside ledger retention — ADR-0006.)
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks
- **RB (base template + 5 renderers):** one base template (provenance manifest + not-evidence banner); five
  `FormatRenderer` adapters; `noise` excluded; markdown-first.
- **RB (digest):** weekly digest assembly grouped by two-axis taxonomy, ordered by explainable relevance,
  recall-floor hits pinned.
- **RB (read view, optional/deferred):** read-only ledger + digest-archive browser; no mutation, no export.
