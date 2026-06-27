# Import/Export Boundaries

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [../_meta/PRODUCT-BRIEF_ko.md](../_meta/PRODUCT-BRIEF_ko.md), [../01-decisions/](../01-decisions/) (ADR: import/export contracts — TODO), [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF_ko.md

## 목적
이 문서는 CAW-02(독립적인 Knowledge Repository)가 다른 세 개의 독립 제품과 데이터를 교환하는 **구체적인 file/API
contract**를 결정한다. 즉, **CAW-01**(별도 제품)으로부터 시뮬레이션 projection/evidence를 **import**하고, **CAW-05**
(별도 제품)로부터 radar/related-work 신호를 **import**하며, **CAW-03**(별도 제품)으로 인용된 claim+evidence 번들을
**export**한다. 이 문서는 boundary 스키마와 각 crossing(경계 넘기)에 적용되는 **confidentiality(기밀성) 검사**를 제안한다.
CAW-02의 내부 저장소(storage ADR — TODO), 전체 데이터 모델(data-model ADR — TODO), 또는 CAW-01/03/05의 내부 구현은
정의하지 *않는다*.

## 협상 불가능한 boundary 원칙
1. **공유 substrate 없음.** 모든 교환은 버전이 매겨진 **file artifact**(선호) 또는 **pull API** 호출이다. 공유 DB,
   registry, queue, runtime은 없다. CAW-02는 결코 다른 제품의 store에 손을 뻗지 않으며 그 반대도 마찬가지다. 이는 각
   제품이 독립적으로 배포 가능하고 독립적으로 장애 격리(failure-isolated)되도록 유지한다.
2. **boundary는 복사본이지, 살아 있는 시스템에 대한 참조가 아니다.** import된 artifact는 CAW-02가 제어하는
   **content-addressed 복사본 또는 안정적인 URI**를 가리키는 `Evidence`로 카탈로그화된다. provenance를 재구성하기 위해
   외부 시스템이 가동 중이어야 한다는 의존을 결코 두지 않는다.
3. **confidentiality는 crossing 지점에서 양방향으로 강제된다.** 모든 레코드는 `boundary`(`public | internal |
   confidential`)와 `audience`(`team | jimmy-private`)를 지닌다. import는 trust를 *downgrade*할 수는 있어도 결코 조용히
   boundary를 *upgrade*할 수 없다. export는 allow-list 필터를 적용하며 **fail closed(실패 시 차단)** 한다.
4. **생성된 텍스트는 결코 evidence로 import되지 않는다.** 요약/projection은 그 artifact가 raw 측정값인지, 모델
   projection인지, 생성된 요약인지를 표시하는 `kind`와 함께 카탈로그화되어 — 요약은 evidence가 아니라는 브리프의
   invariant를 보존한다.
5. **contract는 버전이 매겨진다.** 각 envelope는 `contract_version`(semver)을 지닌다. CAW-02는 알 수 없는 major
   버전을 추측하지 않고 거부한다.

## 공통 envelope
세 boundary 모두 동일한 validator, signature 검사, audit log가 모든 곳에 적용되도록 바깥쪽 envelope를 공유한다.
attestation 스타일의 envelope(subject + predicate + provenance)를 모델로 했으며, in-toto / W3C PROV 번들의 정신을
따르되 의도적으로 최소화되고 자기완결적이다.

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
  "redaction_applied": ["field paths or rule ids stripped before emit"],
  "payload": { "...boundary-specific..." }
}
```

- `producer_run_id`은 **opaque(불투명)** 하다: 사람이 발원 제품 내부로 추적해 들어갈 수 있게 하지만 살아 있는 handle은
  아니다.
- `payload_sha256`은 artifact를 content-addressable로 만들어 CAW-02가 복사본 하나만 저장하고 재import를 dedupe하게 한다.
- `redaction_applied`은 생산자가 이미 무엇을 제거했는지에 대한 선언이다. CAW-02는 그래도 다시 검사한다(심층 방어 —
  생산자의 redaction만 결코 신뢰하지 않음).

---

## Boundary A — IMPORT: CAW-01 simulation projections/evidence

**방향:** CAW-01(별도 제품) → CAW-02. **Transport:** file drop(`*.caw01.json` + 경로/URI에 의한 선택적 대용량
artifact) 또는 CAW-01 export 엔드포인트로부터의 인증된 pull. **매핑 대상:** `Evidence`(+ 참조된 `SimulationRun` /
`Experiment` 카탈로그 항목), 기존 또는 신규 `Claim`에 첨부 가능.

### Payload 스키마
```json
{
  "projection": {
    "artifact_id": "caw01:<opaque>",
    "kind": "raw-measurement | model-projection | generated-summary",
    "title": "string",
    "metric": "string",            // e.g. "throughput@p95"
    "value": { "point": 0.0, "ci_low": 0.0, "ci_high": 0.0, "unit": "string" },
    "method_ref": "caw01:<sim-config-id, opaque>",
    "artifact_uri": "file:///… | s3://… | caw02-vault://<sha>",
    "artifact_sha256": "…",
    "boundary": "public | internal | confidential",
    "confidential_fields": ["fab params", "customer ids"],  // declared sensitive
    "public_safe_view": { "metric": "…", "value": {…} }      // optional pre-redacted projection
  }
}
```

### Import 규칙
- projection은 `Claim`이 아니라 **`Evidence`** 가 된다. importer/curator가 `Claim` 텍스트를 작성하며, projection은
  claim이 *가리키는* 대상이다(claim→evidence invariant 보존).
- `kind: generated-summary`는 `trust=low`로 카탈로그화되고 "not evidence-grade"로 표시된다. 그것은 `Claim`의 유일한
  evidence가 될 수 없다(UI/skill이 경고).
- 대용량 artifact는 **CAW-02의 vault로 복사**(content-addressed)되거나 안정적인 URI로 참조된다. 나중의 fetch가
  무결성 검사될 수 있도록 hash를 저장한다.

### Confidentiality 검사 ("기밀 데이터 누출 없이" 요구사항)
| 검사 | 규칙 | 실패 시 |
|---|---|---|
| Boundary floor | import된 항목은 `boundary >= declared_boundary`를 상속; import 시 절대 downgrade 안 됨 | 더 엄격한 쪽으로 clamp |
| Confidential field scrub | `confidential_fields`가 비어 있지 않고 `public_safe_view`가 없으면 **오직** `confidential` boundary로만 저장 | quarantine, curator 요구 |
| Re-redaction | CAW-02는 `redaction_applied`와 무관하게 payload에 대해 자체 redaction ruleset을 다시 실행 | strip + delta 로그 |
| Free-text leak scan | `title`/`metric` 문자열에서 internal marker(프로젝트 codename, fab/customer regex) 스캔 | review 대상 표시 |
| Audience | `jimmy-private` projection은 결코 team view로 자동 공유되지 않음 | private partition으로 라우팅 |

---

## Boundary B — IMPORT: CAW-05 radar / related-work 신호

**방향:** CAW-05(별도 제품) → CAW-02. **Transport:** file drop(`*.caw05.jsonl`, 한 줄당 신호 하나) 또는 pull.
**매핑 대상:** `Source`(인용된 paper/post), 그리고 분류에 따라 → `RelatedWork`, `Claim`, 및/또는 `OpenQuestion`.
느슨한 요약은 결코 아님.

### Payload 스키마 (신호당)
```json
{
  "signal": {
    "signal_id": "caw05:<opaque>",
    "signal_type": "paper | preprint | patent | blog | release",
    "source": {
      "title": "string", "authors": ["…"], "venue": "string",
      "year": 2026, "doi": "string|null", "url": "https://…",
      "external_ids": { "arxiv": "…", "s2": "…" }   // for dedup against existing Sources
    },
    "classification": "threat | support | neutral | unknown",
    "relevance": { "score": 0.0, "rationale": "string" },
    "related_to": ["caw02-concept:<id>", "caw02-claim:<id>"],  // optional hints
    "extracted_claims": [
      { "text": "what the source asserts", "evidence_locator": "p.4 §3.2 / fig 2" }
    ],
    "raw_summary": "generated abstract — NOT evidence"
  }
}
```

### Import 규칙
- 외부 연구물은 **`Source`** 가 된다. radar 재실행이 중복 Source를 만들지 않도록 `external_ids`/`doi`로 dedupe
  (Levenshtein 제목 fallback)한다.
- `classification: threat|support`는 자유 텍스트가 아니라 대상 `Claim`/`Concept`에 대한 타입이 지정된
  **`RelatedWork`** 링크로 첨부되어, "claim X를 위협하는 것은 무엇인가"를 query할 수 있게 한다.
- 각 `extracted_claims[*]`은 후보 **`Claim`** 이 되며 그 `Evidence`는 `Source` + `evidence_locator`(artifact로의
  구체적 포인터, `raw_summary`가 결코 아님)이다.
- 신호가 해결되지 않은 긴장을 제기하면 curator/skill이 Source에 연결된 **`OpenQuestion`** 을 기록한다.
- `raw_summary`는 context로서 `kind=generated-summary`와 함께 `Source`에 저장되며 evidence에서 **제외**된다.

### Confidentiality 검사
| 검사 | 규칙 | 실패 시 |
|---|---|---|
| Provenance separation | external/public source는 `boundary=public`으로 태깅; internal Samsung/SAIT claim에 **병합되어서는 안 됨**(브리프 guardrail) | cross-tag link 차단 |
| Conflation guard | `Claim`은 public `Source`와 `confidential` projection을 하나의 융합된 evidence 항목으로 동시에 인용할 수 없음 | 별도 evidence 행으로 강제 |
| URL/PII sanity | `url`이 internal host로 resolve되는 신호는 거부; tracking param 제거 | 필드 drop, 로그 |
| Classification trust | `classification=unknown` → `RelatedWork`는 unverified로 저장, claim에 자동 연결 안 됨 | curator review |

---

## Boundary C — EXPORT: CAW-03으로 인용된 claim+evidence 번들

**방향:** CAW-02 → CAW-03(별도 제품, paper/patent 작성). **Transport:** CAW-02가 명시적 curator 액션 시 서명된 번들
파일(`*.caw03-bundle.json`)을 *방출*하며, CAW-03이 그것을 pull/ingest한다. CAW-02는 결코 CAW-03에 쓰지 않는다.
**매핑 출처:** 선택된 `Claim` 집합과 그 `Evidence` chain을, 자기완결적이고 **public-safe** 한 패키지로 resolve한 것.

### Bundle 스키마
```json
{
  "bundle": {
    "bundle_id": "caw02:<uuid>",
    "purpose": "paper | patent | internal-memo",
    "target_audience": "public | internal",          // gates the redaction profile
    "claims": [
      {
        "claim_id": "caw02:<id>",
        "text": "the assertion (resolved, no internal codenames if public)",
        "trust": "high | medium | low",
        "boundary": "public | internal",
        "evidence": [
          {
            "evidence_id": "caw02:<id>",
            "kind": "raw-measurement | model-projection | external-source",
            "locator": "p.4 §3.2 / metric throughput@p95",
            "citation": { "title": "…", "authors": ["…"], "year": 2026, "doi": "…", "url": "…" },
            "artifact_ref": "caw02-vault://<sha>|null",   // included only if audience permits
            "value": { "point": 0.0, "ci_low": 0.0, "ci_high": 0.0, "unit": "…" }
          }
        ]
      }
    ],
    "bibliography": [ /* deduped citation list for CAW-03 to emit BibTeX */ ],
    "provenance_digest": "sha256 over claims+evidence (tamper-evident)"
  }
}
```

### Export 규칙
- **경계를 넘어 운반되는 invariant:** export되는 모든 `Claim`은 ≥1개의 구체적 `Evidence`와 함께 출하된다. evidence가
  없거나 `generated-summary` evidence만 있는 claim은 export가 **거부**된다.
- citation은 `bibliography`로 resolve되어 CAW-03이 CAW-02로 콜백하지 않고도 reference를 만들 수 있게 한다.
- `model-projection` evidence는 그 CI/unit을 유지하여 CAW-03이 projection을 측정값으로 조용히 제시할 수 없게 한다.
- 번들은 **자기완결적**이다: CAW-03은 작성 + 인용에 CAW-02로부터 다른 무엇도 필요로 하지 않는다.

### Confidentiality 검사 (fail-closed allow-list)
| 검사 | 규칙 | 실패 시 |
|---|---|---|
| Audience gate | `target_audience=public` → `boundary != public`인 모든 `Claim`/`Evidence`를 drop | 제외 + drop된 id 보고 |
| Private partition | `jimmy-private` 항목은 audience와 무관하게 **결코** export 안 됨 | 선택되면 번들을 강하게 거부 |
| Artifact disclosure | `artifact_ref`(raw projection blob)는 `target_audience=internal`일 때만 포함 | ref 제거, value 유지 |
| Redaction sweep | 모든 `text`/`locator`/`citation` 문자열에 public-safe redaction 실행(codename, fab/customer regex) | 하나라도 적중하면 export 중단 |
| Conflation guard | export되는 claim은 public-source + confidential evidence를 융합할 수 없음 | export 중단 |
| Sign + digest | `provenance_digest` 계산, envelope 서명; 빈 번들(전부 drop)은 거부 | error, 아무것도 방출 안 함 |

**Fail-closed 기본값:** 어떤 검사가 미결정(indeterminate)이면 항목은 제외된다. 결과 번들이 비거나
`jimmy-private`/`confidential` 항목이 public 번들에 명시적으로 요청되었다면 **전체 export가 중단**되고 보고가
나온다 — 결코 부분적인 조용한 누출은 없다.

---

## Cross-cutting 설계 선택

| 결정 | 선택 | 근거 | 대안 (기각됨) |
|---|---|---|---|
| Transport | **file artifact 우선**, 선택적 pull API | diff/replay 가능, live 결합 없음; md-first store와 부합 | 공유 DB/queue (독립성 위반) |
| Format | **JSON envelope + 신호용 JSONL** | 보편적, 스키마 검증 가능, 사람이 검사 가능 | XML/PROV-XML (더 무겁고 덜 ergonomic) |
| Integrity | **sha256 content-addressing + 서명된 export** | 재import dedup; 변조 증거 있는 export | 생산자 메타데이터 신뢰 (안전하지 않음) |
| Redaction trust | **import & export 시 재-redact** | 심층 방어; 외부 redaction을 결코 신뢰 안 함 | `redaction_applied` 신뢰 (단일 장애점) |
| Versioning | **semver `contract_version`, 알 수 없는 major 거부** | 독립 제품은 따로 진화 | 암묵적/버전 없음 (조용한 breakage) |
| Schema home | **CAW-02가 자신의 boundary 스키마를 소유 + 검증** | 우리가 ingest/emit하는 것을 제어 | 공유 schema registry (공유 substrate) |

## Open Questions
- TODO(open-question: export 번들의 서명 체계 — minisign/cosign/DSSE envelope 대 단순 detached sig?)
- TODO(open-question: CAW-01/05가 우리의 envelope를 native하게 방출하는가, 아니면 CAW-02가 그들의 native export를 감싸는
  얇은 adapter를 출하하는가? adapter는 우리를 decouple하지만 유지보수가 필요한 translation layer를 추가한다.)
- TODO(open-question: 독립 제품 간 pull-API 인증 모델 — static token, mTLS, 또는 signed-URL drop?)
- TODO(open-question: 정본 redaction ruleset — codename/fab/customer regex는 어디에 살며, 공유 의존성이 되지 않으면서
  어떻게 동기화 상태로 유지되는가?)
- TODO(open-question: CAW-05에서 import된 Source의 dedup 권위 — DOI 대 arXiv 대 S2 id 우선순위?)
- TODO(open-question: 발원 제품으로의 live handle 없이 `producer_run_id` 추적성은 어떻게 존중되는가 — opaque하고 사람이
  읽을 수 있는 breadcrumb이 audit에 충분한가?)
- [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md) 참조.

## 런북에 대한 함의
- **RB (import-CAW01):** projection importer 구축 — envelope 검증, content-addressed vault 복사, re-redaction
  pass, `Evidence`/`SimulationRun` 카탈로그화, `kind` 기반 trust 할당.
- **RB (import-CAW05):** signal intake 구축 — JSONL reader, Source dedup, classification→`RelatedWork`/
  `Claim`/`OpenQuestion` 매핑, evidence에서 `raw_summary` 제외.
- **RB (export-CAW03):** bundle exporter 구축 — claim/evidence resolution, fail-closed audience allow-list,
  redaction sweep, bibliography 조립, digest + signature, 빈 번들 거부.
- **RB (boundary-validation lib):** 공유(제품 내부) envelope validator, semver gate, redaction ruleset, 그리고
  crossing당 **audit log** 항목(in/out, id, drop된 항목, redaction delta).
- 각 importer/exporter는 **검증된 skill-interface 액션**이어야 하며, 그래서 에이전트가 사람과 동일한 검사를 사용한다
  (confidentiality 강제를 우회하는 raw 경로 없음).
