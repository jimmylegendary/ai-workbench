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

## What it enforces (the governance, not a chatbot)

- **Evidence gate (ADR-0003):** a claim can be drafted only if it carries enough
  *admissible* evidence. Only a typed, resolvable ref (`caw02_evidence` / `caw01_result`)
  counts. **Generated/prose text is NEVER evidence** — the one invariant no gate
  profile can relax (enforced in `core/gate.py`; also declared in `schema/ledger.cue`).
- **Structural block (ADR-0003 §6):** `core/assemble.py` refuses to assemble inputs
  for any claim that did not pass the gate. There is no ungated → engine code path.
- **Patent-first interlock (slice form):** `P3` (future-device) claims are
  default-denied for *paper* drafting until an interlock is released.
- **Ports & adapters + preflight (ADR-0005):** 5 driven ports, a config-driven
  registry, a capability preflight that **refuses to run a documented stub** while active.
- **Provenance:** `Artifact → GatedClaimSet → ClaimRef → evidence_refs → result_id`
  is reconstructable in the SQLite ledger.

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

### Verify (smoke test, stdlib only)

```bash
cd products/caw-03-paper-patent-harness/impl
python -m unittest discover -s tests -v
```

The test drives the whole slice in a temp dir and asserts: the gate passes c1/c2 and
blocks c3, an ungated claim cannot be assembled, and a valid `%PDF` file is produced.

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

## Not built in this slice (by design)

Patent screening/drafting logic, novelty/radar, the confidentiality tiering +
public-safe export scrubber, and the API/MCP/UI surfaces are **stubs or absent** —
they are later runbooks. The slice's job is only to make the gated-claim → PDF spine
real and correct. See `../design/10-runbooks/`.
