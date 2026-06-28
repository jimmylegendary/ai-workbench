# Provenance & Boundaries — origin/date/retrieval, public/internal, trust, generated-summary-not-evidence

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: 리뷰 시 설정)
- **Related:**
  - [./data-model_ko.md](./data-model_ko.md) (`provenance` 블록 + 엔티티별 필드)
  - [./storage-and-scheduling_ko.md](./storage-and-scheduling_ko.md) (provenance가 어디에 영속되는가)
  - [../01-decisions/ADR-0004-classification-and-triage.md](../01-decisions/ADR-0004-classification-and-triage_ko.md) (rationale_note.evidence=false)
  - [../01-decisions/ADR-0005-related-work-ledger.md](../01-decisions/ADR-0005-related-work-ledger_ko.md) (evidence_locator vs generated_summary)
  - [../01-decisions/ADR-0007-export-boundaries.md](../01-decisions/ADR-0007-export-boundaries_ko.md) (export가 provenance를 어떻게 지니는가)
  - [../02-research/related-work-ledger.md](../02-research/related-work-ledger_ko.md) (export envelope 상세)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적
이 문서는 [data-model](./data-model_ko.md)에 정의된 provenance/경계/신뢰 필드에 대한 **규칙**을 확정한다:
각 provenance 필드의 의미와 언제 필수인지, public/internal 경계 계약, source별 신뢰가 어떻게 부여되고
지녀지는지(절대 재유도하지 않음), **generated-summary는 evidence가 아니다**라는 불변식과 그것이 정확히 어떻게
표시되는지, 그리고 **ExportBundle이 제품 경계를 넘어 provenance를 어떻게 지니는가**. 이 문서는 레코드
스키마(data-model)나 저장 path(storage-and-scheduling)를 정의하지 않으며 — 의미와 강제(enforcement)를
다스린다.

## 1. 타협 불가 세 가지 (brief로부터)
1. **Provenance-complete.** 모든 레코드는 WHERE(origin), WHEN(published + retrieved), HOW(adapter + run)를
   지닌다 — 독립적으로 재위치(re-locate)하고 재검증(re-verify)하기에 충분하다(brief §7).
2. **Public/internal 분리.** Finding은 `boundary=public`이며, radar는 public finding을 internal Samsung/SAIT
   claim과 절대 융합하지 않는다. Internal target은 불투명 URI로 *참조*될 뿐, 텍스트로 복사되지 않는다(brief §12).
3. **생성된 요약은 결코 evidence가 아니다.** LLM이 만든 abstract/digest/rationale은 link나 claim을 *유발*하거나
   *설명*할 수 있어도, 결코 *뒷받침(back)*하지 않는다. 뒷받침은 항상 verified source + 구체적 locator다(brief
   §5/§12).

## 2. Provenance 필드 계약
공유 `provenance` 블록(data-model §2)은 생성되는 모든 레코드에 필수다. 필드 규칙:

| Field | 의미 | 필수 | 규칙 |
|---|---|---|---|
| `origin` | 출처가 된 source family | yes | 등록된 `SourceAdapter`로부터; free-text 금지 |
| `origin_ref` | origin에서의 canonical locator | yes | 재fetch 가능(DOI/arXiv/URL/repo@sha) |
| `retrieved_at` | CAW-05가 fetch한 시점 | yes | RFC3339; collect stage 시계가 설정 |
| `published_at` | source가 주장한 publish/update 날짜 | 있을 때 | source가 주지 않으면 `null` — **절대 지어내지 않음** |
| `run_id` | 생성한 Run | yes | 레코드를 receipt에 묶음(감사 추적) |
| `adapter` | stage/adapter + version | yes | adapter 변경에 걸친 재현성을 위해 |
| `boundary` | public \| internal | yes | v1은 public만 ingest; 모든 emit에서 gate |
| `trust_prior` | high \| medium \| low | yes | source별 prior(§4), 재유도하지 않고 지님 |

**날짜 규율:** `retrieved_at ≠ published_at`. Cursor(storage §5)는 `retrieved_at` 기준으로 전진하고,
recall/recency 추론은 `published_at`을 사용한다. 누락된 날짜는 `null`이며 `unknown`으로 흘러간다 — 날짜를
날조하지 않음(DOC-CONVENTIONS §3).

## 3. 경계 계약 (public vs internal)
| boundary | 레코드 출처 | store에 허용 | ExportBundle에 허용 |
|---|---|---|---|
| `public` | public ToS-safe ingestion (brief §12) | yes | yes (유일하게 export 가능한 경계) |
| `internal` | 참조된 WatchedTarget의 의미 (ingest된 콘텐츠 아님) | `foreign_ref` + label로만 | **절대** 텍스트로는 안 됨 — 불투명 ref만 |

이음매(seam): `WatchedTarget`은 `foreign_ref`(`caw03://claim/CLM-2031`)를 통해 internal CAW-03 claim을
*가리킬* 수 있으나, radar는 불투명 ref + human `label`만 저장하고 internal claim 텍스트는 저장하지 않는다.
따라서 LedgerLink는 internal 텍스트를 public 레코드에 융합하지 않고 `public` finding을 internal *참조*에
결합한다. Export는 `foreign_ref`를 투영하여 소비자가 자신의 namespace에서 해소하도록 한다 — 독립성
보존(brief §8).

**Fail-closed:** export redaction sweep은 non-`public` payload 필드가 하나라도 있으면 bundle을 중단한다
(다층 방어; 소비자도 다시 redact함). 빈 bundle은 거부되며, 조용한 빈 파일로 절대 기록되지 않는다.

## 4. 신뢰 모델
`trust_prior`는 **source별 prior**로, source 레지스트리가 한 번 부여하고 classifier가 **재유도하지 않고
지닌다**(ADR-0004). signal-vs-hype 축을 seed하지만 결코 recall floor를 무시하지 않는다.

| trust_prior | Source families (ADR-0003) | 효과 |
|---|---|---|
| high | arXiv / conference / Semantic Scholar | signal 축을 높게 seed; novelty-threat은 여전히 human-gated |
| medium | lab blog RSS / GitHub | 중립 seed; signal 축은 저렴한 feature(has-code/numbers)로 조정 |
| low | HN / Reddit (stub) / newsletters (stub) | signal을 낮게 seed; watch-list hit은 절대 auto-discard 안 함 |

신뢰는 *triage의 입력*이지 gate가 아니다: tier-1 watch term에 hit한 low-trust HN post도 여전히 surface된다
(recall floor, ADR-0002/0004). 신뢰는 provenance이지 evidence가 아니다 — 결코 claim을 뒷받침하지 않는다.

## 5. Generated-summary-is-not-evidence — 정확한 표시
생성된 텍스트는 모든 계층에서 evidence와 **물리적으로 분리**된다:

| Layer | Evidence 필드 (뒷받침) | Generated 필드 (절대 뒷받침 아님) |
|---|---|---|
| Classification | source `abstract` (raw) | `rationale_note { evidence: false, model }` (ADR-0004) |
| LedgerLink | `verified_source_ref` + `evidence_locator` (source INTO pointer) | `generated_summary_ref` → `kind=generated-summary` (ADR-0005) |
| Digest | locator를 동반한 finding/link ref | 렌더링된 prose body (generated로 명확히 표시) |
| ExportBundle | `source` + `extracted_claims[].evidence_locator` | `raw_summary: "generated — NOT evidence"` |

강제 규칙 (어떤 profile도 완화 불가 — ADR-0004 §6):
- 모든 레코드의 generated 필드는 `evidence:false` 또는 `kind=generated-summary`를 지닌다; schema validator는
  evidence 필드의 generated 문자열을 거부한다.
- `evidence_locator`는 *source INTO*의 구체적 pointer(page/section/figure/abstract)여야 하며, 결코 요약
  텍스트가 아니다.
- link의 뒷받침으로 제시된 generated summary → **거부**(negative test N1, ADR-0005).

## 6. Export가 경계를 넘어 provenance를 지니는 방법
`ExportBundle`(ADR-0007)은 제품 라인을 넘는 유일한 것이며, 소비자가 CAW-05의 store에 손대지 않고도 감사할 수
있도록 두 수준에서 provenance를 지닌다(공유 substrate 없음).

```json
{
  "boundary_kind": "caw05-signal",
  "source_product": "CAW-05",
  "producer_run_id": "caw05:run-2026-26",   // ties back to a CAW-05 run receipt
  "produced_at": "<RFC3339>",
  "declared_boundary": "public",            // bundle-level boundary assertion
  "idempotency_key": "hash(finding_id + target + classification_version)",
  "payload_sha256": "<hash>",               // content-addressed; consumer dedups re-imports
  "signature": "<scheme TBD>",              // signed; align across family
  "payload": { "signals": [ {
    "signal_id": "caw05:lnk-7f3a",
    "source": { "title": "…", "doi": "…", "url": "https://…", "external_ids": { "arxiv": "…", "s2": "…" } },
    "verification": { "status": "verified|ambiguous|unverified", "match_ratio": 0.0, "canonical_key": "doi:…" },
    "extracted_claims": [ { "text": "…", "evidence_locator": "p.4 §3.2" } ],
    "related_to": ["caw03-claim:<id>"],     // WatchedTarget foreign_ref, in the CONSUMER's namespace
    "raw_summary": "generated abstract — NOT evidence"   // kind=generated-summary, excluded from evidence
  } ] }
}
```

소비자가 bundle만으로 검증할 수 있는 것:
- **Origin & 재위치 가능성** — `source.url`/`doi`/`external_ids` + `verification.canonical_key`로 해당
  연구를 다시 찾음.
- **Verification 정도** — `verification.status`/`match_ratio`가 서지적 identity가 얼마나 신뢰되는지 말함.
- **Evidence vs generation** — `extracted_claims[].evidence_locator`는 뒷받침; `raw_summary`는 generated로
  태그되고 evidence에서 제외됨(소비자가 import 시 재강제).
- **경계 & 무결성** — `declared_boundary=public`, `payload_sha256`, signature; non-public 필드는 emit 전에
  bundle을 중단시킴.
- **Idempotency** — `idempotency_key` + `payload_sha256`로 소비자가 주간 재import를 dedup; 재emit은 no-op
  (CAW-03에 novelty-threat이 이중 routing되지 않음).

CAW-05는 파일을 emit하고, 소비자는 **pull**한다. CAW-05는 CAW-02/03/01/06 store에 절대 쓰지 않는다(brief §8).

## Negative tests (반드시 유지)
- link/claim 뒷받침으로 제시된 generated summary → 거부(N1).
- export payload의 non-`public` 필드 → bundle 중단(N3).
- source에 `published_at` 부재 → `null`로 저장, 절대 추측 날짜 아님.
- 동일한 `idempotency_key`/`payload_sha256`을 재import하는 소비자 → dedup, 쌍둥이 없음.

## Open Questions
- TODO(open-question: export envelope의 signature scheme — 하나의 verifier가 family 전체에서 동작하도록
  CAW-02(minisign/cosign/DSSE)와 정렬. — ADR-0007/research §4.)
- TODO(open-question: `WatchedTarget.foreign_ref`는 누가 유지하며, CAW-02/03 rename 시 stale ref를 어떻게
  탐지하는가 — handshake vs drift 수용. — ADR-0005.)
- TODO(open-question: `unknown`으로 flag된 `ambiguous`/`unverified` link를 curator 리뷰를 위해 CAW-02에
  export하는가, 아니면 보류하는가? CAW-03의 gate로는 절대 보내지 않음. — research §4/ADR-0005.)
- [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) 참조 (생성 예정).

## Runbook에 대한 함의(Implications)
- **RB (provenance validator):** 필수 provenance 필드가 빠진 레코드 거부; evidence 필드의 generated 문자열
  거부; 모든 ingest 레코드에 `boundary=public` 단언.
- **RB (boundary/redaction sweep):** emit 전 fail-closed 검사(non-public → 중단; empty → 거부); internal
  참조가 불투명 `foreign_ref`뿐인지 확인.
- **RB (export provenance):** envelope + signal별 provenance/verification/evidence-locator 채우기;
  `raw_summary`를 generated로 태그; sign + content-address; 위 negative test N1/N3.
