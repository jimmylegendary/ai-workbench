# Persistence — 파일 저장소, append-only ledger, 스키마, id에 의한 제품 간 참조

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [./api-surface_ko.md](./api-surface_ko.md)
  - [./scout-service_ko.md](./scout-service_ko.md)
  - [./experiment-runner-service_ko.md](./experiment-runner-service_ko.md)
  - [../01-decisions/ADR-0007-storage-and-scheduling_ko.md](../01-decisions/ADR-0007-storage-and-scheduling_ko.md)
  - [../01-decisions/ADR-0002-hypothesis-representation_ko.md](../01-decisions/ADR-0002-hypothesis-representation_ko.md)
  - [../01-decisions/ADR-0003-experiment-ledger_ko.md](../01-decisions/ADR-0003-experiment-ledger_ko.md)
  - [../01-decisions/ADR-0008-export-boundaries_ko.md](../01-decisions/ADR-0008-export-boundaries_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적
CAW-06 **자체**의 파일 기반 저장소(ADR-0007)를 정의한다: 디스크 레이아웃, 엔티티별 레코드 스키마, append-only ledger +
`supersede` 모델, 파생 인덱스, 그리고 레코드가 **경계를 넘어 CAW-01/CAW-02/CAW-05를 id로 참조하는** 방식(공유 저장소
절대 아님). 이 문서는 op([api-surface_ko.md](./api-surface_ko.md)), 파이프라인([scout-service_ko.md](./scout-service_ko.md)),
runner 내부([experiment-runner-service_ko.md](./experiment-runner-service_ko.md))를 정의하지 않는다.

## 원칙 (ADR-0007)
- **디스크의 파일이 진실의 원천(source of truth)** — markdown/JSON 레코드 + 경로로 참조되는 큰 산출물. git 추적 가능,
  diff 가능, 데이터베이스 인프라 제로(brief §7).
- **supersede가 있는 append-only** — ledger(ADR-0003)와 hypothesis `status_log`(ADR-0002)는 append-only다.
  정정은 `lineage.supersedes`가 있는 새 레코드이며, 제자리(in-place) 편집이 절대 아니다. **"current" 리졸버**가
  최신 상태 뷰를 계산한다. 아무것도 삭제되지 않는다(실패 보존, brief §5).
- **선택적 파생 인덱스** — 파일로부터 재빌드되는 폐기 가능한 SQLite/JSON 인덱스가 negative-results, hypothesis별 이력,
  thread 쿼리를 구동한다. 이를 삭제해도 잃는 것은 없다.
- **모든 레코드는** front-matter에 `provenance`, `status`/`uncertainty`, `boundary`를 담는다(brief §7, §12).
- **공유 기반(substrate) 없음** — 제품 간 링크는 불투명 id + `boundary` 태그다. CAW-06는 절대 다른 제품의 저장소를
  읽거나 쓰지 않는다(brief §8).

## 레이아웃
```
store/
  sources/SRC-XXXX.md            # Source (ADR-0005); boundary=internal | import:caw-05
  claims/CLM-XXXX.md             # Claim / CandidateClaim (ADR-0002/0005)
  hypotheses/HYP-XXXX.md         # Hypothesis + append-only status_log (ADR-0002)
  ledger/EXP-XXXX/entry.json     # one run = one append-only entry (ADR-0003)
  ledger/EXP-XXXX/REPRO.md       # reproducibility gate output (runner service)
  implications/IMP-XXXX.md       # ImplicationMap (ADR-0006)
  writeback/WB-XXXX.json         # wbtraffic.v0 artifact (ADR-0004)
  exports/EXP-RCPT-XXXX.json     # export receipts (ADR-0008)
  threads/THR-XXXX.md            # thread spine: source→claim→hyp→exp→impl chain
artifacts/EXP-XXXX/              # configs, metrics, logs, checkpoints, plots (by path; never inlined)
index/                          # disposable derived index (rebuildable from store/)
sources.yaml                    # schedule + adapter registry (ADR-0007/0005)
```
Id 체계: `SRC/CLM/HYP/EXP/IMP/WB/THR-XXXX`, 0으로 패딩, 단조 증가, 절대 재번호 부여 안 함.

## 공통 front-matter (모든 레코드)
```yaml
id: HYP-0007
kind: hypothesis
provenance: { created_by: ExperimentScout, run_id: RUN-0031, source_refs: [SRC-0003] }
status: hypothesis            # ADR-0002: hypothesis|supported|refuted|inconclusive (reversible; default hypothesis)
uncertainty: { confidence: very-low }   # calibrated qualitative; confidence <= evidence_strength (HARD cap)
boundary: internal            # internal | import:caw-05 | export:caw-01 | export:caw-02
generated: false              # true => generated text; generated is NOT evidence (brief §12)
lineage: { supersedes: null, derived_from: [CLM-0012] }
```

## 엔티티 스키마 (핵심 필드)
### Source / Claim
```yaml
# SRC-XXXX  (boundary=import:caw-05 when imported from CAW-05, a separate product)
kind: source
content_hash: <sha256>         # dedup key (S3 canonicalize+dedup)
ref: { url: <tos-safe>, title, authors, venue }
external_ref: { product: caw-05, id: "SIG-0419" }   # opaque id across boundary; NO shared store
```
```yaml
# CLM-XXXX
kind: claim                    # CandidateClaim until reviewed; candidate carries generated:true
statement: "<verbatim or quoted claim>"
checkable: true
source_ref: SRC-0003
```

### Hypothesis (append-only status_log)
```yaml
kind: hypothesis
statement: "<the proposed, uncertain proposition>"   # NEVER printed as a settled claim
claim_ref: CLM-0012
evidence: [ { kind: experiment, ref: EXP-0021, strength: low },
            { kind: generated, ref: GEN-..,  strength: none } ]   # generated cannot promote
status_log:                    # append-only; each StatusEvent reversible; proposals stay pending until human-confirmed
  - { at: TODO, to: hypothesis, by: ExperimentScout, evidence_ref: null }
  - { at: TODO, to: supported,  by: PENDING-REVIEW, evidence_ref: EXP-0021 }   # not applied until Jimmy confirms
```

### Ledger 항목 (one run = one append-only entry — ADR-0003)
```json
{
  "id": "EXP-0021",
  "hypothesis_id": "HYP-0007",
  "claim_ref": "CLM-0012",
  "prediction": { "metric": "accuracy", "baseline": "<ref>",
                  "expected_direction": ">", "decision_rule": ">= +2pp on >=2/3 seeds" },
  "repro": { "spec_hash": "<sha256>", "seeds": [11,23,42], "code_rev": {}, "env": {}, "repro_md": "REPRO.md" },
  "results": { "per_seed": [], "summary": null, "artifacts_path": "artifacts/EXP-0021/" },
  "verdict": "invalid",
  "failure_mode": "setup-error",
  "writeback_observed": null,
  "lineage": { "supersedes": null, "derived_from": null }
}
```
`launch()`는 이를 `verdict=running`으로 쓴 후 마무리한다. 크래시는 `invalid`/`aborted`를 남긴다 — 실패는 절대
조용히 버려지지 않는다. verdict는 repro 게이트를 통과한 후에만 채택 가능하다(아니면 강제로 `invalid`).

### Writeback 산출물 (wbtraffic.v0 — ADR-0004)
```json
{
  "id": "WB-0004", "schema_version": "wbtraffic.v0",
  "provenance": { "claim_id": "CLM-0012", "source_url": "<url>" },
  "uncertainty": { "status": "hypothesis" },
  "fast_weights": { "param_count": null, "dtype": null, "fraction_of_model": null },
  "update": { "granularity": null, "updates_per_1k_tokens": null, "optimizer_state_bytes_per_param": null },
  "writeback": { "bytes_per_update": null, "write_bw_bytes_per_s": null, "updated_state_residency": null },
  "ratio_curve": null,
  "assumptions": [], "open_questions": ["wbq-001","wbq-006"]
}
```
모든 수치는 기본값이 `null`이다. 하중을 받는(load-bearing) 미지값은 `TODO(open-question: …)`가 되며, 절대 지어낸 숫자가 아니다.

### Export 영수증 (ADR-0008)
```json
{ "id": "EXP-RCPT-0002", "target": "caw-01", "adapter": "Caw01WritebackAdapter",
  "bundle": { "content_hash": "<sha256>", "boundary": "export:caw-01" },
  "payload_status": "hypothesis", "gate": "passed", "committed": false,
  "lowered_refs": ["caw-01:op", "caw-01:movement"] }
```
`Caw01WritebackAdapter`는 `wbtraffic.v0`을 CAW-01의 기존 L0 객체 + open-question 목록으로 내리고(lower) 자기
기술적 번들을 **파일 경계** 너머로 보낸다. `Caw02ClaimAdapter`는 claim+evidence를 CAW-02로 export한다. CAW-01/02/05
객체/id 이름은 **그 제품들이 소유한다**(export마다 재검증). 공유 저장소 없음, 외부 쓰기 없음.

## Append-only + "current" 리졸버
- 쓰기는 새 레코드/버전을 **추가(append)**만 한다. `lineage.supersedes`가 정정을 체인으로 연결한다.
- 리졸버는 "hypothesis별 현재 verdict"와 "현재 status"를 위해 각 체인의 헤드를 반환한다. 전체 이력(실패 포함)은
  디스크에 남아 negative-results 뷰를 공급한다.
- 어댑터별 `FetchCursor`(arXiv 워터마크, Semantic Scholar 페이지, 마지막 CAW-05 `bundle_id`)가 영속화되어
  스케줄된 재실행이 증분적이고 멱등적이다.

## 제품 간 참조 (id에 의한, 경계를 넘는)
| 방향 | 메커니즘 | 저장소 결합 |
|---|---|---|
| CAW-05로부터 import | `external_ref{product:caw-05,id}` + `boundary:import:caw-05` | 없음 (불투명 id) |
| CAW-01로 export | 자기 기술적 번들 + 영수증; `lowered_refs`가 CAW-01 L0 객체 명명 | 없음 (파일 드롭) |
| CAW-02로 export | claim+evidence 번들 + 영수증 | 없음 (파일 드롭) |

## 미해결 질문(Open Questions)
- TODO(open-question: index backend — SQLite vs flat JSON; does v1 query volume justify SQLite; ADR-0007.)
- TODO(open-question: retention/GC for large failure artifacts — keep forever by path vs summarize+prune; ADR-0003/0007.)
- TODO(open-question: per-thread file locks for concurrent scheduled runs; ADR-0007.)
- [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md) 참고.

## 런북에 대한 함의
- RB: 파일 저장소 + id 할당기 + front-matter 검증기(provenance/status/boundary 필수).
- RB: append-only writer + `lineage` supersede + "current" 리졸버.
- RB: negative-results/thread 쿼리를 구동하는 파생 인덱스 빌더(재빌드 가능).
- RB: `store/exports/` 아래 export 영수증 writer(ADR-0008).
