# CLI — Subcommands Mapping 1:1 to Core Ops

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: review date)
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md)
  - [../01-decisions/ADR-0001-product-surface-and-skill-interface.md](../01-decisions/ADR-0001-product-surface-and-skill-interface.md)
  - [../02-research/agent-skill-interface-and-mcp.md](../02-research/agent-skill-interface-and-mcp.md)
  - [./api-and-mcp.md](./api-and-mcp.md)
  - [./knowledge-viewer.md](./knowledge-viewer.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This doc specifies the **`kr` CLI** — the third thin write adapter over the single product core (ADR-0001), aimed at
Jimmy and scripts. It fixes the **subcommand set** (1:1 with core ops), **flags**, **human vs `--json` output**,
**idempotency**, and **exit codes**. It does NOT redefine guardrails, schemas, or audit (core; see
[ADR-0001](../01-decisions/ADR-0001-product-surface-and-skill-interface.md) and the
[skill-interface research](../02-research/agent-skill-interface-and-mcp.md)). API/MCP are in
[api-and-mcp.md](./api-and-mcp.md); the read-only viewer in [knowledge-viewer.md](./knowledge-viewer.md).

## 1. Stance
The CLI is **generated from the same op manifest** as API and MCP (ADR-0001 §3). One subcommand per core op, the
same closed JSON Schema for validation, the same envelope output. The CLI adds **no logic** beyond argument parsing,
a human renderer, and a confirmation prompt. Anything the CLI can do, MCP and API can do identically — and vice
versa (parity is a contract test, not a convention).

## 2. Subcommand catalog (1:1 with core ops)

| Subcommand | Core op | Kind | Notes |
|---|---|---|---|
| `kr add-source` | add_source | write | ingest raw source; idempotent by `sha256(content)` |
| `kr extract-claims` | extract_claims | write | claim candidates from a source; reviewed by default (ADR-0005) |
| `kr attach-evidence` | attach_evidence | write | evidence gate: `--artifact-ref` only, **no prose flag** |
| `kr synthesize-note` | synthesize_note | write | cited note; `generated=true`, never evidence |
| `kr classify-signal` | classify_signal | write | label RadarSignal/RelatedWork threat/support, link |
| `kr record-decision` | record_decision | write | Decision/OpenQuestion/Assumption, linked to evidence |
| `kr link` | link | write | typed edge; rejects note-as-evidence |
| `kr import` | import_projection | write | import CAW-01 projection etc.; quarantine + boundary check |
| `kr query` | search | read | FTS + structured filters; hydrates provenance |
| `kr get` | get | read | one entity + provenance chain |
| `kr export` | export_bundle | read | signed, re-redacted Claim+Evidence bundle for CAW-03 |
| `kr verify-audit` | verify_audit | read | recompute hash chain; report tamper |

There is intentionally **no `kr update` / `kr delete`** (append-only; G7). Corrections: `kr add-source`/etc. a new
version, then `kr link --rel supersedes`.

## 3. Global flags (every subcommand)

| Flag | Meaning |
|---|---|
| `--json` | emit the canonical envelope as JSON to stdout (machine mode); otherwise human table |
| `--idempotency-key <k>` | retry-safe key; defaults to a natural key where the op defines one |
| `--yes` / `-y` | skip the confirmation prompt for write ops (scripts) |
| `--boundary <public\|internal\|confidential>` | boundary for the created item (never downgrades; G4) |
| `--visibility <team\|private>` | team vs Jimmy-private (ADR-0004) |
| `--actor <id>` | actor identity recorded in audit; defaults to the OS user |
| `--quiet` / `--verbose` | suppress / expand human output |

Writes prompt for confirmation by default (mirrors MCP G6); `--yes` skips it. Reads never prompt.

## 4. Output: human by default, `--json` for machines
The `--json` body is **byte-for-byte the same envelope** the API and MCP return (ADR-0001 §6), so a script can pipe
CLI output anywhere the API would be used.

Human (default):
```
$ kr attach-evidence --claim clm_4a2 --artifact-ref source:src_91f --boundary internal
✓ evidence attached            ev_01J8…
  claim       clm_4a2  "GaN HEMT shows 30% lower Rds(on) vs Si"
  artifact    source:src_91f  (Source, internal)
  trust       reported → corroborated   (claim now has 2 evidence)
  audit       aud_01J8…   (chain ok)
```

JSON (`--json`):
```jsonc
{ "ok": true,
  "result": { "id": "ev_01J8…", "status": "created", "claim_id": "clm_4a2",
              "claim_trust": "corroborated" },
  "error": null, "txn_id": "txn_…", "audit_id": "aud_01J8…" }
```

Guardrail rejection (human + nonzero exit):
```
$ kr attach-evidence --claim clm_4a2 --artifact-ref note:nte_77c
✗ ERR_NOTE_AS_EVIDENCE  a generated Note can never be Evidence (G1/G2)
  exit 9
```

`kr query` human output is a table of hits with **trust + boundary badges** and the hydrated chain; `--json`
returns the `RetrievalHit` envelope (ADR-0006 retrieval shape):
```
$ kr query "GaN reliability" --type claim --boundary internal --min-trust corroborated
TRUST         BOUND.    ID       CLAIM                                  EVIDENCE
corroborated  internal  clm_4a2  GaN HEMT 30% lower Rds(on) vs Si       2 (src_91f, sim_03a)
established    public    clm_1b8  GaN bandgap ≈ 3.4 eV                   3
```

## 5. Idempotency & exit codes
- Idempotency carrier: `--idempotency-key` (vs API header, MCP arg). Same key ⇒ same result; a repeat is a no-op
  returning the original id and `status:"noop"`.
- Exit codes (so scripts branch without parsing prose):

| Exit | Meaning |
|---|---|
| 0 | `ok:true` (created or noop) |
| 2 | usage / bad flags |
| 5 | `ERR_VALIDATION` (closed-schema reject) |
| 7 | auth / scope failure |
| 9 | guardrail reject (`ERR_*`, e.g. evidence-not-artifact, boundary-downgrade) |
| 4 | referenced entity not found |

The exact `error.code` is always available in `--json`; exit codes are a convenience for shell pipelines.

## 6. Examples — the core knowledge transaction
```bash
# 1. add a raw source (idempotent by content hash)
src=$(kr add-source --uri https://example.org/paper.pdf --boundary public --json | jq -r .result.id)

# 2. extract claim candidates (reviewed by default — ADR-0005)
kr extract-claims --source "$src" --boundary public

# 3. attach evidence — artifact ref ONLY, no prose path exists
kr attach-evidence --claim clm_4a2 --artifact-ref source:"$src" --boundary public

# 4. synthesize a cited note (generated=true, never evidence)
kr synthesize-note --cite clm_4a2 --cite clm_1b8 --title "GaN switching summary" --boundary internal

# import a CAW-01 simulation projection as evidence (separate product; file boundary)
kr import --from caw-01 --bundle ./projection-export.krx --boundary confidential

# export a cited bundle to CAW-03 (re-redacted, signed, public-safe)
kr export --claim clm_1b8 --to caw-03 --out ./bundle.krx
```

## 7. Auth & scoping
The CLI runs as Jimmy (or a script actor) and uses the same scope set as the API (`kr:read/write/import/export`,
see [api-and-mcp.md §6](./api-and-mcp.md)). Credentials come from a local config/profile
(TODO(open-question: CLI credential storage — keychain vs env vs config file)). The CLI cannot bypass any core
guardrail; `--actor` only labels the audit record, it does not grant boundary clearance.

## Open Questions
- TODO(open-question: CLI credential/profile storage and multi-profile support).
- TODO(open-question: should `kr extract-claims` open an interactive review TUI, or stay batch + viewer-reviewed?).
- TODO(open-question: shell completion + a `kr replay <audit_id>` reconstructability helper).
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks
- **RB (op manifest + codegen):** CLI subcommands generated from the manifest; shared schemas; parity test.
- **RB (CLI):** subcommand-per-op; `--json`/`--idempotency-key`/`--yes`/`--boundary`/`--visibility`; envelope +
  exit-code mapping; human table renderer with trust/boundary badges.
- **RB (negative tests):** `kr attach-evidence` with a note ref exits 9 (`ERR_NOTE_AS_EVIDENCE`).
