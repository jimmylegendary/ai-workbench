# RB-031: Build the five FormatRenderer outputs + the citation gate (generated ≠ evidence)

- Status: ready
- Phase: phase-3-ledger-and-synthesis
- Depends on: [RB-030-related-work-ledger, RB-200-classification-and-triage, RB-201-routing]
- Implements design:
  - [../../05-radar-core/synthesis-and-formats.md](../../05-radar-core/synthesis-and-formats.md)
  - [../../01-decisions/ADR-0001-product-surface-and-outputs.md](../../01-decisions/ADR-0001-product-surface-and-outputs.md)
  - [../../01-decisions/ADR-0004-classification-and-triage.md](../../01-decisions/ADR-0004-classification-and-triage.md)
  - [../../01-decisions/ADR-0007-export-boundaries.md](../../01-decisions/ADR-0007-export-boundaries.md) (paper-card/action-brief feed bundles)
- Produces: the `FormatRenderer` port + five adapters (`MemoRenderer`, `DigestRenderer`, `SlideOutlineRenderer`, `PaperCardRenderer`, `ActionBriefRenderer`); the `Synthesizer`/`TemplateEngine`/`ProvenanceStamper` ports; the base + five child markdown templates; and the deterministic **citation gate** (G1–G7).

## Objective
The `synthesize` stage of a `Run` turns triaged, routed `Finding`s into markdown `Artifact`s in **five formats** (memo, digest, slide-outline, paper-card, action-brief) behind one `FormatRenderer` port, where only the `Synthesizer` step is non-deterministic and is sandboxed to *generated slots*. Every artifact carries a manifest (`evidence: false`) plus in-body markers distinguishing verbatim excerpts from generated prose, and passes a **deterministic, fail-closed citation gate** before emit and before export. "Done" = the digest format renders a weekly multi-finding doc from real findings (M1's primary output); each generated factual sentence resolves to a `[S#]` source anchor; quotes resolve to real excerpt locators; a `noise` finding never reaches synthesis; and a failed gate aborts the artifact (and any bundle built from it). Generated summaries are NEVER emitted or exported as evidence.

## Preconditions
- [ ] RB-200/RB-201 produce triaged, routed `Finding`s with `source_ref{uri,retrieved_at,kind}`, verbatim `excerpts[{quote,locator}]`, `title`, `classification`, `signal_vs_hype`, `watchlist_hit`, `boundary=public`, `trust`, `relates_to`, `routed_to` (synthesis input contract, design §3).
- [ ] RB-030 ledger is available so paper-card/action-brief can reference `LedgerLink`s / foreign refs for export.
- [ ] A model adapter from the CAW-family is wired for the `Synthesizer`, AND an extractive (no-LLM) fallback path is available (design §6).
- [ ] Tree is green (compiles, lint-passes).

## Steps

### 1. Define the synthesize stage skeleton (deterministic spine)
- **Do:** Implement the six-step stage from design §1: (1) Select & Group, (2) Compose FormatRequest, (3) Generate (Synthesizer — the ONLY LLM step), (4) Bind template (TemplateEngine), (5) Stamp provenance (ProvenanceStamper), (6) Citation gate. Steps 1–2 and 4–6 are pure data ops. `noise`-classified findings are filtered out at Select & Group and never enter synthesis.
- **Verify:** A test runs the stage over a fixed `Finding` set and asserts the output is reproducible across runs except the step-3 generated slots; a `noise` finding in the input never appears in any artifact.

### 2. Implement the base template + manifest + banner
- **Do:** Author one base markdown template carrying: the YAML frontmatter manifest (design §4.1 — `format`, `generated_by{agent,model,run_id,produced_at}`, `evidence: false`, `boundary`, `findings[]`, `sources[]`, `classification_summary`, `contract_version`); the standing banner `*Generated summary — not evidence. Verify against cited sources [S#].*`; and the `[S#]` reference list. Generated vs extracted slots MUST be distinguished *in the template* so no renderer can blur them.
- **Verify:** A rendered artifact contains the banner, a manifest with `evidence: false`, and a resolvable `[S#]` list; a test asserts `boundary` equals `max()` over cited findings and can only be raised, never lowered.

### 3. Implement the supporting ports
- **Do:** Wire `Synthesizer` (strict prompt contract: *fill only generated slots; titles/metadata/quotes are passed in and reproduced verbatim, never re-generated; every factual sentence cites a provided `[S#]`*) with an **extractive rule-only fallback** when no LLM is available; `TemplateEngine` (deterministic data→markdown, base+child inheritance); `ProvenanceStamper` (writes manifest §4.1 + markers §4.2, computes `boundary`). See design §6.
- **Verify:** With the LLM adapter disabled, the extractive fallback still produces a gate-passing digest. A test asserts the `Synthesizer` cannot introduce a new source not present in the finding set.

### 4. Implement the five FormatRenderer adapters
- **Do:** Implement the port `FormatRenderer.applies_to(group)` + `render(group, ctx) -> Artifact` and five adapters over the **same** `Finding` group (a finding is a *view*, not a copy — design §2):
  - `MemoRenderer` — 1 finding → 1 doc (high-salience, esp. `novelty-threat`).
  - `DigestRenderer` — N → 1 doc (weekly cron; **M1's primary output** — build first).
  - `SlideOutlineRenderer` — N → 1 Marp-compatible outline (`---` separators, theme front-matter; PPTX/PDF render is downstream, out of v1 — design §7).
  - `PaperCardRenderer` — 1 paper/repo → 1 card; feeds CAW-02 + CAW-03.
  - `ActionBriefRenderer` — 1 finding routed to task/open-question → 1 brief; feeds CAW-01/CAW-06.
  Register stub renderers (e.g. tweet-thread) as `maturity="stub"`.
- **Verify:** Each adapter's `applies_to` enforces its cardinality/classification preconditions; a test renders a `novelty-threat` finding into memo + paper-card and a multi-finding set into a digest. `Artifact = {markdown, manifest, findings[], boundary, gate_result}` for all five.

### 5. Implement the in-body provenance markers
- **Do:** Render three labelled content kinds (design §4.2): `> [!quote]` + `[S#]` for verbatim excerpts (text from `finding.excerpts[].quote`, set off visually); plain prose for generated synthesis (each factual sentence carries `[S#]`); the `[S#]` reference list resolving to `finding.source_ref`. Generated paraphrase is NEVER styled as a quote.
- **Verify:** A test asserts every `> [!quote]` block's text matches a verbatim `finding.excerpts[].quote` and that no generated sentence is wrapped as a quote.

### 6. Implement the citation gate (G1–G7), fail-closed
- **Do:** Implement the deterministic gate run **before emit and before export** (design §5):
  - G1: every generated factual sentence resolves to a `[S#]` in the manifest → else reject.
  - G2: every `> [!quote]` locator resolves to a real `finding.excerpts[].locator` → else reject.
  - G3: no generated prose inside a quote span (no paraphrase-as-quote) → else reject.
  - G4: `manifest.evidence == false` and present → else reject.
  - G5: `boundary == max(cited findings)` and `<= boundary_ceiling`, nothing non-public → else reject + alert.
  - G6: every rendered `finding.id` is listed in `manifest.findings` (no orphan citation) → else reject.
  - G7: any `noise`-classified finding present → reject (must never reach synthesis).
  A failed gate aborts the artifact and therefore any bundle built from it.
- **Verify:** Negative tests hold: an uncited factual claim → reject (G1); an unsourced quote → reject (G2); a non-public finding → reject + alert (G5); a `noise` finding rendered → reject (G7). The gate is shared by every `FormatRenderer` and re-checked by the export adapter as defense-in-depth.

### 7. Wire artifacts to emit + export hand-off
- **Do:** On gate pass, write the markdown artifact to the synthesis output location; for `paper-card`/`action-brief`, hand the `Artifact` (with manifest mirroring the CAW-02 import envelope) to the export stage (ADR-0007 / RB-040+). On gate fail, write nothing and surface the `gate_result` with the failing check.
- **Verify:** A gate-failing render produces no artifact file and a non-zero/diagnostic result; a gate-passing paper-card produces a manifest a downstream consumer can re-validate with no shared store.

## Acceptance criteria
- [ ] Five `FormatRenderer` adapters render from one triaged `Finding` group; the digest renders a weekly multi-finding doc (M1 output).
- [ ] Only the `Synthesizer` step is non-deterministic; steps 1–2, 4–6 are reproducible; the extractive fallback produces a gate-passing digest with no LLM.
- [ ] Every artifact carries the §4.1 manifest with `evidence: false` and the standing banner; generated vs extracted slots are distinguished in the template.
- [ ] In-body markers separate verbatim quotes (`> [!quote]` + real locator) from generated prose (`[S#]`-cited); no paraphrase-as-quote.
- [ ] The citation gate G1–G7 runs before emit and before export, is fail-closed, and all four negative tests hold.
- [ ] `noise` findings never reach synthesis; generated summaries are never emitted or exported as evidence.
- [ ] `paper-card`/`action-brief` hand a re-validatable `Artifact` to the export stage; tree is green.

## Rollback / safety
- Synthesis writes only a generated layer over findings; it cannot mutate `source_ref`, `excerpts`, `trust`, or `boundary`. To roll back mid-way, delete the unverified/failed artifact files for the current run — findings and the ledger are untouched.
- The citation gate is the first line of defense (export re-checks); never disable it to "unblock" a render. A persistent gate failure is a content bug to fix, not a gate to bypass.
- `boundary` can only be raised by synthesis, never lowered; any non-public content aborts the artifact (G5) — CAW-05 ingests/synthesizes public only (brief §8, §12). Generated prose is never presentable as an internal Samsung/SAIT claim.

## Hand-off
The export runbooks (RB-040+) can assume: gate-passing markdown `Artifact`s with manifests mirroring the CAW-02 import envelope; that `paper-card` feeds CAW-02 (Source/RelatedWork) + CAW-03 (novelty) and `action-brief` feeds CAW-01/CAW-06; that evidence (`source_ref` + verbatim `excerpts`) is cleanly separated from generated prose (`evidence:false`, `[S#]`-cited); and that the citation gate has already enforced G1–G7, which export re-enforces as defense-in-depth before signing and dropping any bundle.
