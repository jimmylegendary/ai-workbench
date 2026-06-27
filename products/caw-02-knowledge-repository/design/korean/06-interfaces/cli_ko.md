# CLI — 코어 Op과 1:1로 매핑되는 서브커맨드

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: review date)
- **Related:**
  - [../_meta/PRODUCT-BRIEF_ko.md](../_meta/PRODUCT-BRIEF_ko.md)
  - [../01-decisions/ADR-0001-product-surface-and-skill-interface_ko.md](../01-decisions/ADR-0001-product-surface-and-skill-interface_ko.md)
  - [../02-research/agent-skill-interface-and-mcp_ko.md](../02-research/agent-skill-interface-and-mcp_ko.md)
  - [./api-and-mcp_ko.md](./api-and-mcp_ko.md)
  - [./knowledge-viewer_ko.md](./knowledge-viewer_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
이 문서는 **`kr` CLI**를 명세한다 — 단일 제품 코어 위에 놓인 세 번째 얇은 쓰기 어댑터(ADR-0001)로, Jimmy와 스크립트를
대상으로 한다. 여기서는 **서브커맨드 집합**(코어 op과 1:1), **플래그**, **사람용 대 `--json` 출력**, **idempotency**,
그리고 **exit code**를 확정한다. 가드레일, 스키마, audit을 재정의하지는 **않는다**(코어;
[ADR-0001](../01-decisions/ADR-0001-product-surface-and-skill-interface_ko.md)과
[skill-interface 연구](../02-research/agent-skill-interface-and-mcp_ko.md) 참고). API/MCP는
[api-and-mcp_ko.md](./api-and-mcp_ko.md)에, 읽기 전용 뷰어는 [knowledge-viewer_ko.md](./knowledge-viewer_ko.md)에
있다.

## 1. 입장(Stance)
CLI는 API 및 MCP와 **동일한 op manifest로부터 생성된다**(ADR-0001 §3). 코어 op당 하나의 서브커맨드, 검증을 위한 동일한
closed JSON Schema, 동일한 envelope 출력. CLI는 인자 파싱, 사람용 렌더러, 확인 프롬프트를 넘어 **어떤 로직도** 추가하지
않는다. CLI가 할 수 있는 것은 MCP와 API도 동일하게 할 수 있으며, 그 반대도 마찬가지다(parity는 관례가 아니라 계약
테스트다).

## 2. 서브커맨드 카탈로그 (코어 op과 1:1)

| Subcommand | Core op | Kind | Notes |
|---|---|---|---|
| `kr add-source` | add_source | write | 원시 source 인입; `sha256(content)`로 idempotent |
| `kr extract-claims` | extract_claims | write | source로부터 claim 후보; 기본적으로 검토(reviewed)됨(ADR-0005) |
| `kr attach-evidence` | attach_evidence | write | evidence gate: `--artifact-ref`만, **prose 플래그 없음** |
| `kr synthesize-note` | synthesize_note | write | 인용된 note; `generated=true`, 결코 evidence 아님 |
| `kr classify-signal` | classify_signal | write | RadarSignal/RelatedWork를 threat/support로 라벨링, 링크 |
| `kr record-decision` | record_decision | write | Decision/OpenQuestion/Assumption, evidence에 연결 |
| `kr link` | link | write | 타입이 지정된 edge; note-as-evidence 거부 |
| `kr import` | import_projection | write | CAW-01 projection 등 import; quarantine + boundary 검사 |
| `kr query` | search | read | FTS + 구조화 필터; provenance를 hydrate |
| `kr get` | get | read | 단일 엔티티 + provenance 체인 |
| `kr export` | export_bundle | read | CAW-03용 서명·재편집된 Claim+Evidence bundle |
| `kr verify-audit` | verify_audit | read | 해시 체인 재계산; 변조 보고 |

의도적으로 **`kr update` / `kr delete`는 없다**(append-only; G7). 정정: `kr add-source`/등으로 새 버전을 만든 다음,
`kr link --rel supersedes`.

## 3. 전역 플래그 (모든 서브커맨드)

| Flag | Meaning |
|---|---|
| `--json` | 표준 envelope을 stdout에 JSON으로 출력(머신 모드); 그렇지 않으면 사람용 테이블 |
| `--idempotency-key <k>` | retry-safe 키; op가 정의한 natural key가 있으면 그것으로 기본 설정 |
| `--yes` / `-y` | write op의 확인 프롬프트 건너뛰기(스크립트) |
| `--boundary <public\|internal\|confidential>` | 생성될 항목의 boundary(결코 강등하지 않음; G4) |
| `--visibility <team\|private>` | team 대 Jimmy-private(ADR-0004) |
| `--actor <id>` | audit에 기록될 actor 신원; 기본값은 OS 사용자 |
| `--quiet` / `--verbose` | 사람용 출력 억제 / 확장 |

write는 기본적으로 확인을 요구한다(MCP G6를 반영). `--yes`는 이를 건너뛴다. read는 결코 프롬프트하지 않는다.

## 4. 출력: 기본은 사람용, 머신은 `--json`
`--json` 본문은 API와 MCP가 반환하는 envelope과 **바이트 단위로 동일**하므로(ADR-0001 §6), 스크립트는 CLI 출력을 API가
사용될 곳 어디로든 파이프할 수 있다.

사람용(기본):
```
$ kr attach-evidence --claim clm_4a2 --artifact-ref source:src_91f --boundary internal
✓ evidence attached            ev_01J8…
  claim       clm_4a2  "GaN HEMT shows 30% lower Rds(on) vs Si"
  artifact    source:src_91f  (Source, internal)
  trust       reported → corroborated   (claim now has 2 evidence)
  audit       aud_01J8…   (chain ok)
```

JSON(`--json`):
```jsonc
{ "ok": true,
  "result": { "id": "ev_01J8…", "status": "created", "claim_id": "clm_4a2",
              "claim_trust": "corroborated" },
  "error": null, "txn_id": "txn_…", "audit_id": "aud_01J8…" }
```

가드레일 거부(사람용 + nonzero exit):
```
$ kr attach-evidence --claim clm_4a2 --artifact-ref note:nte_77c
✗ ERR_NOTE_AS_EVIDENCE  a generated Note can never be Evidence (G1/G2)
  exit 9
```

`kr query`의 사람용 출력은 **trust + boundary 배지**와 hydrate된 체인이 붙은 hit들의 테이블이며, `--json`은
`RetrievalHit` envelope을 반환한다(ADR-0006 retrieval 형태):
```
$ kr query "GaN reliability" --type claim --boundary internal --min-trust corroborated
TRUST         BOUND.    ID       CLAIM                                  EVIDENCE
corroborated  internal  clm_4a2  GaN HEMT 30% lower Rds(on) vs Si       2 (src_91f, sim_03a)
established    public    clm_1b8  GaN bandgap ≈ 3.4 eV                   3
```

## 5. Idempotency & exit code
- Idempotency 운반자: `--idempotency-key`(API는 header, MCP는 arg). 동일한 키 ⇒ 동일한 결과; 재요청은 원래 id와
  `status:"noop"`을 반환하는 no-op이다.
- Exit code(스크립트가 prose 파싱 없이 분기할 수 있도록):

| Exit | Meaning |
|---|---|
| 0 | `ok:true` (created or noop) |
| 2 | usage / bad flags |
| 5 | `ERR_VALIDATION` (closed-schema reject) |
| 7 | auth / scope failure |
| 9 | guardrail reject (`ERR_*`, e.g. evidence-not-artifact, boundary-downgrade) |
| 4 | referenced entity not found |

정확한 `error.code`는 항상 `--json`에서 얻을 수 있다. exit code는 셸 파이프라인을 위한 편의 장치다.

## 6. 예제 — 핵심 knowledge 트랜잭션
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
CLI는 Jimmy(또는 스크립트 actor)로 실행되며 API와 동일한 scope 집합을 사용한다(`kr:read/write/import/export`,
[api-and-mcp_ko.md §6](./api-and-mcp_ko.md) 참고). 자격 증명은 로컬 config/profile에서 온다
(TODO(open-question: CLI credential storage — keychain vs env vs config file)). CLI는 어떤 코어 가드레일도 우회할 수
없다. `--actor`는 audit 레코드에 라벨만 붙일 뿐, boundary 권한을 부여하지 않는다.

## Open Questions
- TODO(open-question: CLI credential/profile storage and multi-profile support).
- TODO(open-question: should `kr extract-claims` open an interactive review TUI, or stay batch + viewer-reviewed?).
- TODO(open-question: shell completion + a `kr replay <audit_id>` reconstructability helper).
- [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md) 참고.

## Implications for runbooks
- **RB (op manifest + codegen):** manifest에서 CLI 서브커맨드 생성; 공유 스키마; parity 테스트.
- **RB (CLI):** op별 서브커맨드; `--json`/`--idempotency-key`/`--yes`/`--boundary`/`--visibility`; envelope +
  exit-code 매핑; trust/boundary 배지를 갖춘 사람용 테이블 렌더러.
- **RB (negative tests):** note ref를 가진 `kr attach-evidence`는 9로 종료된다(`ERR_NOTE_AS_EVIDENCE`).
