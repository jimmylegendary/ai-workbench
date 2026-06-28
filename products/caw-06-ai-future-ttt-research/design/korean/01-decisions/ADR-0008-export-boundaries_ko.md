# ADR-0008: Export 경계 — 유일한 export 이음새로서의 ExportAdapter (CAW-01 + CAW-02)

- **Status:** proposed
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF_ko.md) (§8 export 경계, §9 ExportAdapter, §11 타 제품의 저장소가 아님, §12 과대 주장 금지)
  - [../02-research/implication-mapping-and-export_ko.md](../02-research/implication-mapping-and-export_ko.md) (권위 있는 설계 서술)
  - [../02-research/writeback-traffic-modeling_ko.md](../02-research/writeback-traffic-modeling_ko.md) (CAW-01 payload의 L0/L1 lowering)
  - [./ADR-0004-writeback-traffic-schema_ko.md](./ADR-0004-writeback-traffic-schema_ko.md) (이것이 export하는 `wbtraffic.v0` 산출물)
  - [./ADR-0002-hypothesis-representation_ko.md](./ADR-0002-hypothesis-representation_ko.md) (인라인으로 동반되는 status/uncertainty), [./ADR-0003-experiment-ledger_ko.md](./ADR-0003-experiment-ledger_ko.md), [./ADR-0006-implication-mapping_ko.md](./ADR-0006-implication-mapping_ko.md) (이 이음새로 라우팅)
  - [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Context

CAW-06은 다른 **독립 제품들**로 export 한다(brief §8): **writeback-traffic 스키마 + future-workload open
questions → CAW-01**(L0/L1 메모리 주석이 달린 IR 브리지, brief §5 핵심), 그리고 **claims + evidence →
CAW-02**(knowledge repo); novelty cue → CAW-03은 선택/stub이다. 이 ADR은 **하나의 export 이음새**와
대상별 번들 형태 + 게이트를 고정한다. ADR-0006이 implication을 여기로 라우팅하고, 이 ADR이 그것들이 어떻게 떠나는지를
결정한다.

힘(forces):
- **독립성(brief §1, §8, §11):** 각 대상은 자체 저장소/배포를 가진 별도 제품이다. CAW-06은 파일/API 경계를 넘어
  **번들**을 쓰고 핸드오프를 기록한다; **결코 다른 제품의 저장소에 쓰지 않고, 공유 스키마 레지스트리나 런타임을
  가정하지 않으며, 타 제품의 저장소가 아니다**(단방향 push).
- **디커플링:** 버전 관리 + 검증은 번들 **내부**에 동반된다(`schema_version`, `producer`, `content_hash`),
  따라서 양측 모두 공유 레지스트리에 의존하지 않는다.
- **과대 주장 금지(brief §12):** hypothesis는 결코 확정된 claim으로 export되지 않는다; 생성된 요약은 증거가
  아니다; 모델링된 수치는 측정된 수치와 구별되어 플래그된다(ADR-0004); CAW-05의 판단은 결코 우리 것과 혼동되지
  않는다(ADR-0005).
- **실패는 일급 시민(brief §5):** 실패/거부된 export는 기록되며 발견은 **export 가능 상태로 유지된다**.

## Options considered

| Decision point | Option | Pros | Cons | Fit |
|---|---|---|---|---|
| Seam | **단일 `ExportAdapter` 포트; 설정 레지스트리를 통한 대상별 어댑터** | 하나의 검증된 이음새; stub 문서화(brief §9); 교체 가능한 transport | 간접성 | **chosen** |
| | 대상별 임시(ad-hoc) export 코드 | 직접적 | 중복된 게이트/검증 로직; 표류 | rejected |
| Transport | **파일 드롭(v1) + stub-swap 어댑터로서의 HTTP POST** | 파일 = 가장 단순한 디커플드 경계; 제품들이 독립 배포 | 파일 드롭은 합의된 위치/계약 필요 | **chosen** |
| Bundle coupling | **자기 기술(self-describing) 번들(`schema_version`+`producer`+`content_hash`)** | 제품 간 공유 레지스트리 없음 | 양측이 독립적으로 검증 | **chosen** |
| Direction | **CAW-06으로부터의 단방향 push** | CAW-06은 타 제품의 저장소가 아님(brief §11) | 읽기 회신(read-back) 없음; 영수증은 로컬 | **chosen** |
| Gating | **모든 write 이전에 `validate()` 내부에서 실행되는 대상별 적격성 게이트** | CAW-01은 open question 허용; CAW-02는 증거 요구; 경계에서 §12 강제 | 게이트에서 걸러진 번들은 emit 안 됨(의도됨) | **chosen** |
| Idempotency | **`bundle_id` + `content_hash`; 재emit = id 기준 upsert** | scout의 안전한 재실행(ADR-0007) | content-hash가 안정적이어야 함 | **chosen** |

## Decision

1. **`ExportAdapter`가 유일한 export 이음새다(brief §9).** 하나의 포트; 대상별 어댑터; 설정 기반 레지스트리.
   v1 빌드 = `Caw01WritebackAdapter` + `Caw02ClaimAdapter`. **문서화된 stub:** `Caw03NoveltyAdapter`
   (novelty cue, brief §8)와 `HttpExportAdapter`(파일 드롭에 대한 transport swap) — 등록되고 포트를 구현하되
   결코 빌드되지 않는다. 포트:
   - `validate(bundle) -> ValidationReport` — **모든 write 이전에 대상별 게이트(아래 §gate) + 스키마 검사**를
     실행한다; 게이트를 통과하지 못한 번들은 기록되고 **결코 emit되지 않는다**.
   - `emit(bundle) -> ExportReceipt` — 파일 드롭(v1) / POST; `bundle_id`+`content_hash` 기준 **멱등적**
     (재emit = upsert). 영수증은 줄기에 대해 저장된다(ADR-0007 `store/exports/`) — 감사용.
   - `health() -> AdapterStatus` — 도달 가능한가? 경로에 쓸 수 있는가?
2. **자기 기술 `ExportBundle`**은 `bundle_id`, `target`, `schema_version`(semver, 번들 내부),
   `producer="caw-06"`, `content_hash`(payload에 대해), `payload`(대상별), 그리고 `provenance`
   (`thread_id`, `source_ids`, `boundary`)를 담는다. **공유 저장소 없음, 공유 레지스트리 없음** — 버전 관리는
   대역 내(in-band)로 동반된다.
3. **대상별 게이트**(경계에서 brief §12 강제):

   | Target | Eligibility gate | Rejects |
   |---|---|---|
   | **CAW-01** | implication `domain ∈ {memory-centric-systems, hardware}` AND `writeback_payload`를 가짐 OR 타입이 지정된 open question임 | writeback/workload 관련성 없는 claim |
   | **CAW-02** | implication이 resolve되는 `evidence_ref` ≥1개 AND `status ∈ {supported, refuted, inconclusive}` AND provenance 존재 | 맨(bare) hypothesis; 요약만 있는 항목 |

   CAW-02 게이트는 brief §12를 기계 검사 가능하게 만든다: **`status: hypothesis` 항목은 거부된다 — 그것은
   CAW-02 claim이 될 수 없다**; refuted/inconclusive는 **export 가능하다**(부정적 결과도 지식이다).
4. **CAW-01 번들 = writeback-traffic 스키마 + open questions**(brief §5 브리지). Payload는 ADR-0004의
   `wbtraffic.v0` 형태 산출물이다: `kind: "writeback-traffic-schema"`, `ttt_variant`, `fields` 블록
   (write_bandwidth, write_endurance, updated_state_residency, optimizer_state_bytes, updated_weight_reuse,
   capacity/bw-ratio-vs-context), 그리고 일급(first-class) `open_questions[]`. **수치 필드는 기본적으로
   `null`이며 `basis`로 `TODO(open-question: …)`를 가진다** — 재현이 채울 때까지. 우리는 스키마와 미지의 것들을
   export하며, 결코 만들어낸 수치를 export하지 않는다(DOC-CONVENTIONS §3). **모델링된** 추정치는 **측정된** 것과
   구별되어 플래그된다(ADR-0004). CAW-01은 그 IR에 대한 단언이 아니라 *질문*을 받는다.
5. **CAW-02 번들 = claim + evidence + uncertainty.** Payload: `kind: "claim-with-evidence"`, `claim`,
   `status`(supported|refuted|inconclusive — 결코 맨 `hypothesis`가 아님), `confidence`, `evidence[]`
   (ledger 결과 ADR-0003 / 외부 소스로 resolve), 명시적 `not_evidence[]` 목록(예: 생성된 요약 — 경계에서
   소스/요약 분리를 기계 검사 가능하게 함), 그리고 `uncertainty_notes`. Status + confidence는 **인라인**으로
   동반된다 — 어떤 것도 불확실성이 벗겨진 채로 경계를 넘지 않는다(ADR-0002 §7).
6. **감사 + 실패 처리(brief §5).** 모든 `emit`은 줄기에 저장되는 영수증을 반환한다. 실패/거부된 export는
   일급 레코드로 기록되며, **발견은 나중의 재시도를 위해 export 가능 상태로 유지된다**.

## Consequences

- **쉬움:** export 대상 추가(어댑터 작성, 등록); scout를 안전하게 재실행(멱등적 upsert); 게이트 로직을 건드리지
  않고 file→HTTP transport 교체; 어떤 hypothesis도 claim으로 떠나지 않았고 어떤 만들어낸 수치도 CAW-01로 떠나지
  않았음을 경계에서 증명.
- **어려움 / 감수하는 비용:** 파일 드롭 계약(위치/auth)은 각 수신 제품과 합의되어야 한다(open question);
  `content_hash` 안정성은 payload 직렬화를 제약한다; 단방향 push는 CAW-06이 로컬 영수증 외에 전달 확인을 받지
  못함을 의미한다; CAW-01의 IR이 아직 `null`+`basis` 필드를 받아들이지 못할 수 있다(open question).
- **후속:** runbook이 포트 + 레지스트리, 두 개의 v1 어댑터(게이트 포함), CAW-03/HTTP stub, 그리고 영수증
  저장(ADR-0007)을 구현한다. CAW-01 어댑터는 payload를 L0 형태 객체(`mem_store` ops + writeback `movements` +
  mutable `tensors`)로 lowering 한다(ADR-0004 기준) — **파일 경계를 넘어서, 결코 CAW-01의 저장소로 들어가지 않음**.

## Open questions / revisit triggers

- `TODO(open-question: is file-drop or HTTP the right v1 transport given CAW-01/CAW-02 deploy independently — and what is the agreed drop location/auth per target?)`.
- `TODO(open-question: minimal field set CAW-01's L0/L1 IR can ingest — does it accept null+basis fields and a separate read/write traffic split? — export ask wbq-002)`.
- `TODO(open-question: should refuted implications also export to CAW-01 as "axis not observed" signals? — shared with ADR-0006)`.
- `TODO(open-question: how does CAW-02 want uncertainty encoded — status/confidence enums vs a calibrated score? map at the adapter boundary?)`.
- `TODO(open-question: do we need signing/verification on outbound bundles (mirroring CAW-05's signed import) for downstream trust?)`.
- **재검토 시점:** 세 번째 export 대상이 가동될 때(CAW-03 stub 승격), 또는 수신 제품이 pull(읽기 회신)
  인터페이스를 요구할 때 — 이는 단방향 push 입장에 도전이 될 것이다(brief §11).
