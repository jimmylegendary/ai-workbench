# Import / Export Flows — 독립 제품 간 경계(boundary)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [../_meta/PRODUCT-BRIEF_ko.md](../_meta/PRODUCT-BRIEF_ko.md) (source of truth)
  - [../01-decisions/ADR-0007-import-export-contracts_ko.md](../01-decisions/ADR-0007-import-export-contracts_ko.md)
  - [../01-decisions/ADR-0004-provenance-and-trust_ko.md](../01-decisions/ADR-0004-provenance-and-trust_ko.md)
  - [../01-decisions/ADR-0002-storage_ko.md](../01-decisions/ADR-0002-storage_ko.md)
  - [../01-decisions/ADR-0003-knowledge-data-model_ko.md](../01-decisions/ADR-0003-knowledge-data-model_ko.md)
  - [../02-research/import-export-boundaries_ko.md](../02-research/import-export-boundaries_ko.md)
  - [./skill-wrap-interface_ko.md](./skill-wrap-interface_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF_ko.md

## Purpose
이 문서는 CAW-02와 세 개의 다른 **독립 제품(independent products)** 간 경계를 가로질러 지식을 옮기는 **구체적이고 실행 가능한 flow**를 제시한다: CAW-01 simulation projection import, CAW-05 radar/related-work 신호 import, 그리고 인용된 Claim+Evidence 번들을 CAW-03으로 export. 단계별 파이프라인(import의 경우 quarantine → confidentiality check → 노드로 매핑; export의 경우 select → re-redact → sign → 버전드 envelope)과, 각 단계가 어떻게 Claim→Evidence 불변식과 boundary 모델을 보존하는지를 보여준다. 이 문서는 contract 포맷이나 옵션 트레이드오프를 다시 결정하지 않는다 — 그것들은 [ADR-0007](../01-decisions/ADR-0007-import-export-contracts_ko.md)에 고정되어 있다. 두 flow 모두 검증된 skill-wrap 동작([skill-wrap-interface_ko.md](./skill-wrap-interface_ko.md))으로**만** 실행되며; 검사를 우회하는 raw path는 없고, 다른 어떤 제품과도 **공유 store, registry, queue, runtime이 없다**.

## 1. Boundary 원칙 (ADR-0007에서 가져옴)
1. **공유 substrate 없음.** 모든 경계 통과는 버전드 **파일 artifact**(선호) 또는 pull-API 호출이다.
2. **live reference가 아닌 복사(Copy).** import된 artifact는 **CAW-02가 통제하는** content-addressed 복사본 / 안정적 URI를 가리키는 `Evidence`가 된다 — 재구성은 외부 시스템이 살아 있는지에 결코 의존하지 않는다.
3. **양방향 모두 경계 통과 지점에서 기밀성 강제.** import는 *trust*를 낮출 수는 있지만 *boundary*를 조용히 올리지는 않는다; export는 fail-closed allow-list를 적용한다.
4. **생성된 텍스트는 evidence로 import되지 않으며** evidence로 export되지도 않는다(`kind=generated-summary`는 evidence 등급이 아니라 flag만 됨).
5. 생산자의 `redaction_applied` 주장과 무관하게 **모든 경계 통과 지점에서 재-redact(re-redact)**한다(심층 방어).
6. **버전드 계약(Versioned contracts).** `contract_version`은 semver이다; 알 수 없는 MAJOR는 추측하지 않고 **거부**한다.

## 2. 공유 envelope
세 경계 통과 모두 하나의 외부 envelope를 공유하므로, 하나의 validator, 하나의 서명 검사, 하나의 경계-통과별 audit 항목이 모든 곳에 적용된다(전체 필드 노트는 [ADR-0007](../01-decisions/ADR-0007-import-export-contracts_ko.md) §1):

```json
{
  "contract_version": "1.0.0",
  "boundary_kind": "caw01-projection | caw05-signal | caw03-bundle",
  "source_product": "CAW-01",
  "produced_at": "<RFC3339>",
  "producer_run_id": "<opaque id in the SOURCE product>",
  "declared_boundary": "public | internal | confidential",
  "declared_audience": "team | jimmy-private",
  "payload_sha256": "<hash of canonicalized payload>",
  "redaction_applied": ["rule ids the producer claims it stripped"],
  "payload": { "...boundary-specific..." }
}
```

## 3. IMPORT A — CAW-01 simulation projection → `Evidence`
**방향:** CAW-01(별개 제품) → CAW-02. **전송:** `*.caw01.json` 파일 드롭(+ 선택적으로 path/URI로 된 대용량 artifact) 또는 인증된 pull. **Skill-wrap op:** `kr.import_projection` (`(source_product, export_id)`에 대해 idempotent). **매핑 대상:** `Evidence` (+ `SimulationRun`/`Experiment` ref 카탈로그), 기존 또는 새 `Claim`에 부착 가능.

### Flow
```
[1] receive envelope ─▶ [2] semver gate (reject unknown MAJOR)
        │
        ▼
[3] QUARANTINE: stage in an isolated partition; nothing is queryable yet
        │
        ▼
[4] verify payload_sha256; copy large artifact into the content-addressed vault (caw02-vault://<sha>)
        │
        ▼
[5] CONFIDENTIALITY CHECKS (table below) ── any fail ─▶ keep quarantined, raise to curator
        │ pass
        ▼
[6] MAP TO NODES: create Evidence(kind, value, locator, boundary) + SimulationRun/Experiment refs
        │                 (curator/skill writes the Claim text; projection is what it POINTS AT)
        ▼
[7] commit via core txn ─▶ markdown file(s) + hash-chained event + per-crossing audit entry
```

projection은 **`Claim`이 아니라 `Evidence`가 된다** — 이것이 Claim→Evidence 불변식을 보존한다([ADR-0003](../01-decisions/ADR-0003-knowledge-data-model_ko.md)): 사람/skill이 claim을 작성하고, projection은 그것이 인용하는 artifact이다. `kind=generated-summary`는 낮은 trust로 카탈로그되고 "evidence 등급 아님"으로 flag되며, claim의 **유일한 evidence가 될 수 없다**. `model-projection` evidence는 자신의 CI/단위(unit)를 유지하여 나중에 measurement로 제시되는 일이 결코 없도록 한다.

### Confidentiality checks ("기밀 데이터를 유출하지 않으면서" 요구사항)
| Check | Rule | On failure |
|---|---|---|
| Boundary floor | import된 `boundary >= declared_boundary`; 결코 낮추지 않음 — 더 엄격한 쪽으로 clamp | clamp |
| Confidential-field scrub | `confidential_fields`가 설정되어 있고 `public_safe_view`가 없으면 **오직** `confidential`로만 저장 | quarantine, curator |
| Re-redaction | `redaction_applied`와 무관하게 CAW-02 자체 ruleset을 재실행 | strip + log delta |
| Free-text leak scan | `title`/`metric`에서 codename/fab/customer 마커를 스캔 | flag for review |
| Audience | `jimmy-private` projection은 team view로 결코 자동 공유되지 않음 | route to private partition |

## 4. IMPORT B — CAW-05 radar/related-work 신호 → typed 노드
**방향:** CAW-05(별개 제품) → CAW-02. **전송:** `*.caw05.jsonl`(한 줄당 신호 하나) 또는 pull. **Skill-wrap op:** signal intake → `kr.classify_signal` / `kr.extract_claims` / `kr.record_decision`. **매핑 대상:** `Source`, 더하여 분류에 따른 `RelatedWork` / `Claim` / `OpenQuestion` — **결코 느슨한 요약이 아님**.

### Flow
```
[1] read JSONL line ─▶ [2] envelope semver gate
        │
        ▼
[3] QUARANTINE the signal (unverified, not yet linked)
        │
        ▼
[4] DEDUP: match existing Source by external_ids/doi (Levenshtein-title fallback)
        │
        ▼
[5] CONFIDENTIALITY CHECKS (table below) ── fail ─▶ curator review
        │ pass
        ▼
[6] MAP TO NODES:
      • Source (boundary=public for external work)
      • classification threat|support  ─▶ typed RelatedWork link to targeted Claim/Concept
      • each extracted_claims[*]        ─▶ candidate Claim, Evidence = Source + evidence_locator
      • raw_summary                     ─▶ stored on Source as kind=generated-summary (EXCLUDED from evidence)
      • tension / threat-on-accepted    ─▶ OpenQuestion (auto-raised; reviewer notified)
        │
        ▼
[7] commit via core txn ─▶ markdown + hash-chained event + per-crossing audit
```

후보 `Claim`의 `Evidence`는 항상 `Source` + 구체적인 `evidence_locator`(예: `p.4 §3.2 / fig 2`)이며, **결코** `raw_summary`가 아니다. agent가 제출한 후보는 기본적으로 리뷰된다(v0에서 조용한 자동 수락 없음, [ADR-0005](../01-decisions/ADR-0005-ingestion-pipeline_ko.md)); `classification=unknown`은 미검증(T0)으로 남고 자동 연결되지 않는다.

### Confidentiality checks
| Check | Rule | On failure |
|---|---|---|
| Provenance separation | public source는 `boundary=public`으로 태그됨; 내부 Samsung/SAIT claim에 **결코** 병합되지 않음 | block cross-tag link |
| Conflation guard | Claim은 public `Source`와 `confidential` projection을 하나의 evidence 항목으로 융합할 수 없음 | force separate evidence rows |
| URL/PII sanity | `url`이 내부 호스트인 신호는 거부; tracking param은 제거 | drop field, log |
| Classification trust | `unknown` → 미검증(T0)으로 저장, 자동 연결 안 함 | curator review |

## 5. EXPORT — 인용된 `Claim`+`Evidence` 번들 → CAW-03 (fail-closed)
**방향:** CAW-02 → CAW-03(별개 제품, 논문/특허 작성). **전송:** CAW-02가 서명된 `*.caw03-bundle.json`을 **방출(emits)**하고; CAW-03이 그것을 pull한다. CAW-02는 **결코** CAW-03에 쓰지 않는다. **Skill-wrap op:** `kr.export_bundle` (read-only이지만 boundary 필터링 및 서명됨).

### Flow
```
[1] SELECT claims (explicit curator action) ─▶ resolve each Claim's Evidence chain
        │
        ▼
[2] INVARIANT GATE: every Claim must ship ≥1 concrete Evidence;
        a claim with no evidence OR only generated-summary evidence is REFUSED
        │
        ▼
[3] EFFECTIVE-BOUNDARY propagation (monotone, ADR-0004) per entity — not just the row's own flag
        │
        ▼
[4] AUDIENCE GATE (fail-closed allow-list, table below) ── indeterminate ─▶ EXCLUDE item
        │
        ▼
[5] RE-REDACT sweep over text/locator/citation strings (codename/fab/customer) ── any hit ─▶ ABORT
        │
        ▼
[6] resolve citations into a self-contained `bibliography`; tag Notes kind=synthesis, evidence=false
        │
        ▼
[7] compute provenance_digest ─▶ SIGN ─▶ wrap in the versioned envelope (boundary_kind=caw03-bundle)
        │
        ▼
[8] emit file + per-crossing audit entry (selected ids, dropped ids, redaction deltas)
```

### Confidentiality checks (fail-closed allow-list)
| Check | Rule | On failure |
|---|---|---|
| Audience gate | `target_audience=public`은 **effective** `boundary != public`인 모든 entity를 드롭 | exclude + report ids |
| Private partition | `jimmy-private` 항목은 어떤 audience에도 **결코** export되지 않음 | hard refuse bundle |
| Artifact disclosure | raw `artifact_ref` blob은 `target_audience=internal`일 때만 포함 | strip ref, keep value |
| Redaction sweep | 모든 문자열에 대해 public-safe redaction | abort export on any hit |
| Conflation guard | export되는 claim은 public-source + confidential evidence를 융합할 수 없음 | abort export |
| Sign + digest | `provenance_digest` 계산, 서명; **빈 번들(전부 드롭됨)은 거부됨** | error, nothing emitted |

**Fail-closed 기본값:** 어떤 검사라도 불확정(indeterminate)이면 항목은 제외된다; 결과 번들이 비거나, `jimmy-private`/`confidential` 항목이 public 번들에 명시적으로 요청되면, **export 전체가 중단(abort)**되며 문제가 된 id를 나열하는 보고서를 낸다 — 결코 부분적인 조용한 유출은 없다.

### Bundle payload (발췌)
```json
{
  "bundle_id": "caw02:<uuid>",
  "purpose": "paper | patent | internal-memo",
  "target_audience": "public | internal",
  "claims": [
    { "claim_id": "caw02:<id>", "text": "the assertion (no internal codenames if public)",
      "trust": "T0|T1|T2|T3", "boundary": "public | internal",
      "evidence": [
        { "evidence_id": "caw02:<id>", "kind": "raw-measurement | model-projection | external-source",
          "locator": "p.4 §3.2 / metric throughput@p95",
          "citation": { "title": "…", "authors": ["…"], "year": 0, "doi": "…", "url": "…" },
          "artifact_ref": "caw02-vault://<sha>|null",
          "value": { "point": 0.0, "ci_low": 0.0, "ci_high": 0.0, "unit": "…" } } ] }
  ],
  "bibliography": [ /* deduped citations for CAW-03 to emit BibTeX */ ],
  "provenance_digest": "sha256 over claims+evidence"
}
```

## 6. 방향 & 노드-매핑 요약

| Crossing | Counterparty | Transport | Skill-wrap op | Maps to | Default posture |
|---|---|---|---|---|---|
| Import A | CAW-01 (별개) | `*.caw01.json` + vault | `kr.import_projection` | Evidence (+SimulationRun/Experiment) | quarantine → re-redact |
| Import B | CAW-05 (별개) | `*.caw05.jsonl` | signal intake + `kr.classify_signal` | Source, RelatedWork, Claim, OpenQuestion | quarantine → review |
| Export | CAW-03 (별개) | emitted `*.caw03-bundle.json` | `kr.export_bundle` | signed bundle of Claim+Evidence | fail-closed |

## 7. 왜 이것이 독립을 유지하는가
각 경계 통과는 **CAW-02가 소유하고 검증하는 파일 또는 pull-API 호출**이다; CAW-02는 자체 boundary 스키마를 유지하고(공유 registry 없음), 외부 artifact를 자체 vault로 복사하며(live reference 없음), 양쪽에서 재-redact한다(외부 redaction을 신뢰하지 않음). 제품들은 독립적으로 진화하고 실패한다; 재-import는 `payload_sha256`로 dedup된다; 모든 경계 통과는 감사 가능하고 재현 가능하다. 과공유(Over-sharing)는 의도적 행위를 요구하며 경계에서 잡힌다.

## Open Questions
- `TODO(open-question: signature scheme for export bundles — minisign/cosign/DSSE vs detached sig?)`
- `TODO(open-question: do CAW-01/05 emit our envelope natively, or does CAW-02 ship thin wrapping adapters?)`
- `TODO(open-question: pull-API auth between independent products — static token, mTLS, or signed-URL drop?)`
- `TODO(open-question: where the codename/fab/customer redaction regexes live, kept in sync without a shared dependency.)`
- `TODO(open-question: dedup authority for CAW-05 Sources — DOI vs arXiv vs S2 id precedence?)`
- `TODO(open-question: honoring producer_run_id traceability without a live handle — is an opaque breadcrumb enough?)`
- See [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md).

## Implications for runbooks
- **RB (import-CAW01):** projection importer — envelope + semver 검증, content-addressed vault 복사, 재-redaction, `Evidence`/`SimulationRun` 카탈로그, kind 기반 trust, quarantine partition.
- **RB (import-CAW05):** signal intake — JSONL reader, Source dedup, classification→`RelatedWork`/`Claim`/`OpenQuestion`, `raw_summary`를 evidence에서 제외, threat→OpenQuestion 에스컬레이션, 기본 리뷰(review-by-default).
- **RB (export-CAW03):** fail-closed 번들 exporter — effective-boundary 전파, redaction sweep, bibliography 조립, `provenance_digest` + 서명, 빈 번들 거부.
- **RB (boundary-validation lib):** in-product envelope validator, semver gate, redaction ruleset, 경계-통과별 audit log 항목(in/out, ids, dropped items, redaction deltas).
- 모든 importer/exporter는 검증된 skill-wrap 동작이다 — 어떤 raw path도 기밀성 강제를 우회하지 않는다([skill-wrap-interface_ko.md](./skill-wrap-interface_ko.md)).
