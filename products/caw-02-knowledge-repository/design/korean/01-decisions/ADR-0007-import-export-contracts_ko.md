# ADR-0007: CAW-01 / CAW-05 / CAW-03와의 import/export 계약

- **Status:** proposed
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [../_meta/PRODUCT-BRIEF_ko.md](../_meta/PRODUCT-BRIEF_ko.md)
  - [../02-research/import-export-boundaries_ko.md](../02-research/import-export-boundaries_ko.md)
  - [./ADR-0002-storage_ko.md](./ADR-0002-storage_ko.md)
  - [./ADR-0004-provenance-and-trust_ko.md](./ADR-0004-provenance-and-trust_ko.md)
  - [./ADR-0006-retrieval_ko.md](./ADR-0006-retrieval_ko.md)
  - [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적
CAW-02가 CAW-01(simulation projection)과 CAW-05(radar/related-work 신호)로부터 import하고 CAW-03(논문/특허
드래프팅)으로 export하는 **구체적인 file/API 경계 계약**과, 각 교차점에서의 **기밀성 검사**를 결정한다.
이는 [ADR-0004](./ADR-0004-provenance-and-trust_ko.md)의 trust/boundary 모델과 [ADR-0002](./ADR-0002-storage_ko.md)의
storage 모델을 소비한다. CAW-02 내부 구조나 CAW-01/03/05의 내부 구조는 정의하지 않는다(별개의 독립 제품).

## 배경
- CAW-01, CAW-03, CAW-05는 **별개의, 독립적으로 배포 가능한 제품**이다. CAW-02는 import/export 경계를 통해서만
  상호작용한다 — **공유 DB, registry, queue, runtime 없음**(brief §1, §7).
- import는 **기밀 데이터를 누출하지 않고** 외부 artifact를 카탈로그해야 한다(brief §7); 기밀성은 교차점에서,
  **양방향으로** 강제된다(brief §6, §10).
- 생성된 요약은 결코 evidence로 import되지 않는다(brief §5, §10).
- 외부 공개용 export는 public-safe만 가능해야 한다(brief §6, §10).

## 검토한 선택지
| 결정 | 선택지 | 장점 | 단점 | 적합성 |
|---|---|---|---|---|
| Transport | **버전이 지정된 file artifact 우선, 선택적 pull API** | diff/재생 가능, 라이브 결합 없음; md-first 저장소와 부합 | producer가 파일을 발행해야 함 | **Chosen** |
| Transport | 공유 DB / queue / registry | "라이브" 데이터 | 독립성 위반(brief §1, §7) | Rejected |
| Format | **JSON envelope + 신호용 JSONL** | 보편적, 스키마 검증 가능, 검사 가능 | 장황함 | **Chosen** |
| Format | PROV-XML | 표준 | 무겁고 덜 실용적 | Rejected |
| Boundary copy | **content-addressed 복사 / CAW-02가 제어하는 안정 URI** | 외부 시스템이 다운돼도 생존; dedup | 저장 비용 | **Chosen** |
| Boundary copy | 외부 저장소로의 라이브 참조 | 복사 없음 | 실패 격리를 깸; 재구성 가능성이 외부 시스템에 의존 | Rejected |
| Redaction 신뢰 | **import와 export 양쪽에서 재-redact** | 심층 방어 | 중복 작업 | **Chosen** |
| Redaction 신뢰 | producer의 `redaction_applied`를 신뢰 | 저렴 | 단일 실패 지점 | Rejected |
| Schema home | **CAW-02가 자신의 경계 스키마를 소유 + 검증** | 무엇을 ingest/emit하는지 우리가 제어 | 어댑터를 유지해야 함 | **Chosen** |
| Schema home | 공유 schema registry | DRY | 공유 substrate(brief §7에 의해 거부) | Rejected |

## 결정

### 1. 공유 저장소 없음; 공통 버전 envelope
모든 교차점은 버전이 지정된 file artifact(선호) 또는 pull-API 호출이다. 셋 모두 하나의 외부 envelope를 공유하여
동일한 validator, 서명 검사, 감사 로그가 어디서나 적용된다:
```json
{
  "contract_version": "1.0.0",                       // semver; reject unknown MAJOR
  "boundary_kind": "caw01-projection | caw05-signal | caw03-bundle",
  "source_product": "CAW-01",
  "produced_at": "<RFC3339>",
  "producer_run_id": "<opaque id in the SOURCE product>",  // breadcrumb, not a live handle
  "declared_boundary": "public | internal | confidential",
  "declared_audience": "team | jimmy-private",
  "payload_sha256": "<hash of canonicalized payload>",     // content-addressing + dedup
  "redaction_applied": ["rule ids the producer claims it stripped"],
  "payload": { "...boundary-specific..." }
}
```
- **Boundary는 라이브 참조가 아니라 복사다.** import된 artifact는 **CAW-02가 제어하는** content-addressed 복사 /
  안정 URI를 가리키는 `Evidence`로 카탈로그된다; provenance를 재구성하기 위해 외부 시스템이 켜져 있을 것에
  결코 의존하지 않는다.
- **`contract_version`은 semver이며 알 수 없는 MAJOR는 거부**되고 추측되지 않는다.
- **CAW-02가 자신의 경계 스키마를 소유하고 검증한다** — 공유 registry 없음.

### 2. IMPORT — CAW-01 simulation projection → `Evidence`
projection은 **`Evidence`가 되며 결코 `Claim`이 아니다**(claim 텍스트는 큐레이터/skill이 쓰고, projection은 claim이
가리키는 대상이다 — [ADR-0004](./ADR-0004-provenance-and-trust_ko.md) 불변식 보존). `kind: generated-summary`는
낮은 trust로 카탈로그되고 "not evidence-grade"로 플래그되며 claim의 **유일한 evidence가 될 수 없다**. 큰 artifact는
CAW-02의 content-addressed vault로 복사되거나([ADR-0002](./ADR-0002-storage_ko.md)에 따라 안정 URI로 참조) 이후
무결성 검사를 위해 hash가 저장된다.

**기밀성 검사:** boundary 하한(`imported >= declared_boundary`, 절대 하향 안 됨 — 더 엄격한 쪽으로 clamp);
confidential 필드 스크럽(`confidential_fields`가 설정되고 `public_safe_view`가 없으면 **오직** `confidential`로
저장 — 아니면 큐레이터를 위해 quarantine); **`redaction_applied`와 무관하게 재-redaction**; title/metric에 대한
codename/fab/customer 마커 자유 텍스트 누출 스캔; `jimmy-private` projection은 결코 team 뷰로 자동 공유되지 않음.

### 3. IMPORT — CAW-05 radar/related-work 신호 → 타입 엔티티, 결코 느슨한 요약 아님
Transport는 `*.caw05.jsonl`(한 줄에 신호 하나) 또는 pull이다. 외부 작업은 **`Source`**가 된다(`external_ids`/`doi`로
dedup, Levenshtein-title 폴백). `classification: threat|support`는 대상 `Claim`/`Concept`에 타입 **`RelatedWork`**
링크로 붙는다(그래서 "무엇이 claim X를 위협하는가"가 쿼리 가능). 각 `extracted_claims[*]`는 후보 `Claim`이 되며
그 `Evidence`는 `Source` + `evidence_locator`이다 — **결코 `raw_summary`가 아님**. `raw_summary`는 `Source`에
`kind=generated-summary`로 저장되고 evidence에서 제외된다. 긴장(tension)을 일으키는 신호는 `OpenQuestion`을
기록한다; **accepted claim에 대한 신뢰할 만한 threat**는 `OpenQuestion`을 자동 발생시키고 리뷰어에게 알린다.

**기밀성 검사:** provenance 분리(public source는 `boundary=public`으로 태깅되며 **결코** internal Samsung/SAIT
claim에 병합되지 않음); conflation 가드(claim은 public `Source`와 `confidential` projection을 하나의 evidence
항목으로 융합할 수 없음 — 별도 evidence 행으로 강제); URL/PII 검사(internal-host URL 거부, 추적 파라미터 제거);
`classification=unknown` → unverified(T0)로 저장, 자동 링크 안 함.

### 4. EXPORT — cited `Claim`+`Evidence` 번들을 CAW-03로(fail-closed)
CAW-02는 명시적 큐레이터 행위 시 서명되고 자체 완결적인 번들 파일을 **발행**하고; CAW-03가 그것을 pull한다.
CAW-02는 결코 CAW-03에 쓰지 않는다. export된 모든 `Claim`은 구체적 `Evidence` ≥1개와 함께 출하된다; evidence가
없거나(또는 `generated-summary` evidence만 있는) claim은 **거부**된다. 인용은 `bibliography`로 resolve되어
CAW-03가 CAW-02로부터 그 외엔 아무것도 필요로 하지 않는다. `model-projection` evidence는 CI/단위를 유지하여
projection이 측정으로 제시될 수 없게 한다. export된 Note는 `kind=synthesis, evidence=false`로 태깅되어 CAW-03가
synthesis를 evidence로 오인할 수 없게 한다.

**기밀성 검사(fail-closed allow-list, [ADR-0004](./ADR-0004-provenance-and-trust_ko.md) 전파 사용):**
audience gate(`target_audience=public`은 **실효** `boundary != public`인 모든 엔티티를 제거 — 행 자신의 플래그만이
아니라 단조 전파로 계산); **`jimmy-private` 항목은 audience와 무관하게 결코 export되지 않음**; artifact 공개
(`artifact_ref` blob은 `target_audience=internal`일 때만); text/locator/citation 문자열에 대한 redaction sweep;
conflation 가드; 서명 + `provenance_digest`. **어떤 검사라도 미결정이면 항목은 제외된다; 빈 번들이나, public
번들 안에 명시적으로 요청된 confidential/jimmy-private 항목은 전체 export를 중단**시키고 위반 id를 나열하는
리포트를 낸다 — 결코 부분적인 조용한 누출이 아니다.

### 5. 누출을 막는 기본값
**민감도는 default-deny, 범위는 default-private**([ADR-0004](./ADR-0004-provenance-and-trust_ko.md)에서). import는
*trust*를 낮출 수는 있으나 결코 *boundary*를 조용히 상향하지 않는다. export는 **fail closed**.

### 6. skill-wrap 동등성
각 importer/exporter는 **검증된 skill-interface 액션**(`kr.import_projection`, signal intake, `kr.export_bundle`)이며
에이전트는 사람과 정확히 동일한 기밀성 검사를 사용한다 — 강제를 우회하는 raw 경로는 없다.

## 결과
- **쉬워지는 것:** 각 제품이 독립적으로 진화하고 실패한다; 재import는 `payload_sha256`로 dedup된다; 경계가
  감사 가능하고 재생 가능하다; 과공유는 의도적 노력을 요하며 교차점에서 잡힌다.
- **어려운 것:** CAW-02는 얇은 어댑터 / 자신의 경계 스키마와 redaction 규칙집합을 유지한다; 재-redaction은
  일부 producer 작업을 중복한다(심층 방어로 수용); 정규(canonical) redaction 규칙집합은 공유 의존성이 되지 않으면서
  최신으로 유지되어야 한다.
- **후속:** RB import-CAW01(envelope 검증, vault 복사, 재-redact, `Evidence`/`SimulationRun` 카탈로그,
  kind 기반 trust); RB import-CAW05(JSONL reader, Source dedup, classification→`RelatedWork`/`Claim`/`OpenQuestion`,
  `raw_summary` 제외); RB export-CAW03(claim/evidence resolution, fail-closed audience allow-list, redaction sweep,
  bibliography, digest + signature, 빈 번들 거부); RB boundary-validation lib(envelope validator, semver gate,
  redaction 규칙집합, 교차점별 감사 로그 항목).

## 미해결 질문 / 재검토 트리거
- `TODO(open-question: signature scheme for export bundles — minisign/cosign/DSSE vs detached sig?)`
- `TODO(open-question: do CAW-01/05 emit our envelope natively, or does CAW-02 ship thin wrapping adapters?)`
- `TODO(open-question: pull-API auth between independent products — static token, mTLS, or signed-URL drop?)`
- `TODO(open-question: where the codename/fab/customer redaction regexes live, kept in sync without a shared dependency)`
- `TODO(open-question: dedup authority for CAW-05 Sources — DOI vs arXiv vs S2 id precedence?)`
- `TODO(open-question: honoring producer_run_id traceability without a live handle — is an opaque breadcrumb enough?)`
- See [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md).

## runbook에 대한 함의
- **RB (import-CAW01):** envelope 검증, content-addressed vault 복사, 재-redaction,
  `Evidence` 카탈로깅, kind 기반 trust를 갖는 projection importer.
- **RB (import-CAW05):** signal intake — Source dedup, classification→타입 링크, `raw_summary`는 evidence에서 제외,
  threat→OpenQuestion 에스컬레이션.
- **RB (export-CAW03):** fail-closed 번들 exporter — 실효 boundary 전파, redaction sweep, bibliography,
  digest + signature, 빈 번들 거부.
- **RB (boundary-validation lib):** 제품 내 envelope validator, semver gate, redaction 규칙집합, 교차점별 감사 로그.
- 모든 importer/exporter는 검증된 skill-interface 액션이다 — raw 경로가 기밀성 강제를 우회하지 않는다.
