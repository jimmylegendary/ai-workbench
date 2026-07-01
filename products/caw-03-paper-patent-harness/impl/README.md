# CAW-03 — Paper & Patent Writing Harness (v1 vertical slice)

The first implementation slice of CAW-03: **`gated claim → PDF`, end-to-end**, proving
the governance spine before any breadth is added.

It is a **custom hexagonal core** (the decision from
[`../design/02-research/oss-foundation-research.md`](../design/02-research/oss-foundation-research.md)):
no orchestration platform is adopted; each of the 5 driven ports sits behind a
config-selected adapter. The slice runs on the **Python standard library only** — no
pip, no LaTeX, no LLM, no network required — so it is deterministic and instantly
runnable. PaperOrchestra is wired as the real writing engine behind its port; the
zero-dependency `minimal-latex` engine is the slice default so the pipeline always
produces an openable PDF.

## Verifying the work (for the reviewer)

Every phase adds re-runnable proof; you never have to take "it works" on trust.

```bash
bash products/caw-03-paper-patent-harness/impl/verify.sh
```

`verify.sh` compiles the package, runs the full test suite, and drives every acceptance
scenario end-to-end through the CLI, printing a PASS/FAIL board mapped to the governance
guarantee each check proves (exit 0 = all green). Requires only Python 3.10+.

Three layers of verification, all in the repo you pull:

1. **Tests are the contract** — `python -m unittest discover -s tests -v`. Each phase adds
   tests that encode its invariants (evidence gate, `decide()` matrix, fail-closed, egress
   re-sweep, hash chain, …). Green = the invariants hold, independently checkable.
2. **CLI is the human-legible proof** — run the scenarios yourself (`caw03 run`, `status`,
   `events`, `interlocks`) and read the output.
3. **git diff is the code review** — the whole implementation is small, stdlib-only, and
   commented against the ADRs it implements.

## What it enforces (the governance, not a chatbot)

- **Evidence gate (ADR-0003):** a claim can be drafted only if it carries enough
  *admissible* evidence. Only a typed, resolvable ref (`caw02_evidence` / `caw01_result`)
  counts. **Generated/prose text is NEVER evidence** — the one invariant no gate
  profile can relax (enforced in `core/gate.py`; also declared in `schema/ledger.cue`).
- **Structural block (ADR-0003 §6):** `core/assemble.py` refuses to assemble inputs
  for any claim that did not pass the gate. There is no ungated → engine code path.
- **Patent-first interlock (ADR-0004, L3a):** a patent-sensitive claim (`P3`) gets a
  **HELD** interlock at gate time and is default-denied for *paper* drafting; a human
  `release-interlock` (the patent has been filed/cleared) lets it pass the next gate.
  The release is a human-attributed, hash-chained audit event (`caw03 interlocks` /
  `release-interlock`).
- **Confidentiality gate (ADR-0007, L6):** CAW-02 `boundary`(public⊂internal⊂confidential)
  × `visibility`(team|private) labels, inherited verbatim and **fail-closed** (missing
  label ⇒ confidential/private). Two enforcement points: **ingest classification**
  (lattice-max over claims → track) and the load-bearing **egress gate** =
  `decide(artifact, audience)` (total, default-deny) **+ a redaction re-sweep** over
  every string the engine emitted. A public sink is hard-blocked for non-public content;
  internal spans are dropped from a public-target assembly *before the engine sees them*;
  and a synthesized codename the allow-list can't see is still caught at egress.
- **Ports & adapters + preflight (ADR-0005):** 5 driven ports, a config-driven
  registry, a capability preflight that **refuses to run a documented stub** while active.
- **Provenance + audit:** `Artifact → GatedClaimSet → ClaimRef → evidence_refs → result_id`
  is reconstructable in the SQLite ledger, and every state transition is recorded in a
  **hash-chained lifecycle event log** (`caw03 events` → `verify_lifecycle`).

## Run the slice

```bash
cd products/caw-03-paper-patent-harness/impl

python -m caw03 run examples/bundle_demo/bundle.json \
  --template   examples/bundle_demo/template.tex \
  --guidelines examples/bundle_demo/conference_guidelines.md \
  --title "CAW-03 Demo Paper"
```

Expected: `c1` (P1) and `c2` (P2) **pass**; `c3` (P3) is **blocked** (its only
"evidence" is generated text, *and* P3 is patent-sensitive). A PDF is produced at:

```
.caw03/workspace/demo-2026-07/final/paper.pdf
.caw03/artifacts/art-demo-2026-07/paper.pdf   # published copy
```

### Individual ops (same governed core the API/MCP will call)

```bash
python -m caw03 adapters                                   # registry + preflight
python -m caw03 import-bundle examples/bundle_demo/bundle.json
python -m caw03 gate   demo-2026-07
python -m caw03 assemble demo-2026-07 \
    --template examples/bundle_demo/template.tex \
    --guidelines examples/bundle_demo/conference_guidelines.md \
    --title "CAW-03 Demo Paper"
python -m caw03 draft  demo-2026-07
python -m caw03 review demo-2026-07
python -m caw03 status
```

### Confidentiality (L6) demos

```bash
# internal claim, public target → BLOCKED before drafting (no leak reaches the engine)
python -m caw03 run examples/bundle_internal/bundle.json \
  --template examples/bundle_demo/template.tex \
  --guidelines examples/bundle_demo/conference_guidelines.md --audience public

# public-labeled claim that carries a codename → decide() passes, the egress
# redaction re-sweep BLOCKS it (defense in depth)
python -m caw03 run examples/bundle_redaction/bundle.json \
  --template examples/bundle_demo/template.tex \
  --guidelines examples/bundle_demo/conference_guidelines.md --audience public

python -m caw03 events   # hash-chained lifecycle log + verify_lifecycle
```

### Verify (smoke test, stdlib only)

```bash
cd products/caw-03-paper-patent-harness/impl
python -m unittest discover -s tests -v
```

The tests drive the whole slice in a temp dir and assert: the gate passes c1/c2 and
blocks c3, an ungated claim cannot be assembled, a valid `%PDF` is produced, the
confidentiality `decide()` matrix holds, an internal claim is blocked from a public
assembly, the egress re-sweep catches an embedded codename, and the lifecycle hash
chain verifies.

## Swapping in the real writing engine (PaperOrchestra)

PaperOrchestra sits behind the same `writing_engine` port. Point config at a runner:

```json
{
  "adapters": {
    "writing_engine": {
      "id": "paperorchestra",
      "enabled": true,
      "config": { "po_command": ["paper-orchestra", "run", "--workspace", "{workspace}"] }
    }
  }
}
```

```bash
python -m caw03 --config caw03.config.json run ... 
```

The core assembles PaperOrchestra's exact input tuple
(`inputs/{idea.md, experimental_log.md, template.tex, conference_guidelines.md, figures/}`,
ADR-0002) and captures `final/{paper.tex, paper.pdf}` + scores. Nothing in the core
changes when you swap engines.

## Optional: CUE defense-in-depth

If the [`cue`](https://cuelang.org) binary is on PATH, the gate additionally runs
`cue vet schema/ledger.cue <snapshot>` as a second, declarative check. The Python
gate stays authoritative; CUE is skipped cleanly when absent.

## Layout

```
caw03/
  ports/        # 5 driven-port Protocols + capability descriptors (the seams)
  core/
    models.py   # domain dataclasses + enums (Pydantic-swappable later)
    ledger.py   # SQLite projection over a CAW-02 bundle + provenance
    gate.py     # authoritative evidence gate (+ optional cue vet)
    confidentiality.py # boundary/visibility labels, decide(), redaction ruleset
    assemble.py # gated claims → engine-neutral inputs (refuses ungated)
    registry.py # config-driven adapter registry + capability preflight
    pdf.py      # dependency-free PDF writer (last-resort renderer)
    harness.py  # the op-manifest core; governance lives here
  adapters/     # v1 adapters + documented stubs (future connectors)
  profiles/     # config-selected gate profiles (neurips-paper.json)
  schema/       # ledger.cue (optional invariants)
  cli.py        # thin surface over the op-manifest
examples/bundle_demo/   # a CAW-02-style bundle fixture (gated-passable + a blocked claim)
```

## Built so far

- **Slice spine (L1/L2/L4):** ports+registry+preflight, evidence gate + claim ledger,
  input assembly, `minimal-latex`/`paperorchestra` engines, gated-claim → PDF.
- **L6 confidentiality:** boundary/visibility labels, two-point gate (ingest classify +
  egress `decide()` + redaction re-sweep), fail-closed, hash-chained lifecycle log.
- **L3a patent-first interlock:** HELD-by-default for patent-sensitive claims + human
  `release-interlock`, audited.

## Not built yet (later runbooks)

Real patent **screening/drafting** (L3b — prior-art + patentability + a draft path; only
the interlock exists), novelty/radar (L5 — PaperQA2/OpenAlex), and the API/MCP/review-UI
surfaces (L8 — only the CLI exists). Work order: **L6 ✓ → L3(a) ✓ → L5 novelty → L3(b)
patent drafting → L8 surfaces.** See `../design/10-runbooks/`.
