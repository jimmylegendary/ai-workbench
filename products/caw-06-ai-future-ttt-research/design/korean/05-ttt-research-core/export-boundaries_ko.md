# Export Boundaries — `ExportAdapter` 이음새(seam) (CAW-01 + CAW-02)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./implication-mapping.md](./implication-mapping_ko.md) (이 이음새로 라우팅되는 것)
  - [./ports-and-adapters.md](./ports-and-adapters_ko.md) (port + registry 패턴)
  - [../01-decisions/ADR-0008-export-boundaries.md](../01-decisions/ADR-0008-export-boundaries_ko.md) (결정)
  - [../01-decisions/ADR-0004-writeback-traffic-schema.md](../01-decisions/ADR-0004-writeback-traffic-schema_ko.md) (`wbtraffic.v0` 페이로드)
  - [../01-decisions/ADR-0002-hypothesis-representation.md](../01-decisions/ADR-0002-hypothesis-representation_ko.md) (status/uncertainty를 인라인으로 운반)
  - [../01-decisions/ADR-0007-storage-and-scheduling.md](../01-decisions/ADR-0007-storage-and-scheduling_ko.md) (receipt 저장)
  - [../02-research/implication-mapping-and-export.md](../02-research/implication-mapping-and-export_ko.md), [../02-research/writeback-traffic-modeling.md](../02-research/writeback-traffic-modeling_ko.md)
  - [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적
이 문서는 CAW-06에서 나가는 **유일한 익스포트 이음새**를 명세한다: `ExportAdapter` port, 자기 기술적
(self-describing) `ExportBundle`, target별 gate, 그리고 두 개의 v1 번들 형태 — **writeback-traffic 스키마
+ open question → CAW-01** 과 **claim + evidence → CAW-02**. 이 문서는 port 레지스트리 메커니즘을 깊이
정의하지 **않으며**([./ports-and-adapters.md](./ports-and-adapters_ko.md) 참조), implication 모델
([./implication-mapping.md](./implication-mapping_ko.md))이나 내부 writeback-필드 물리(ADR-0004)도 정의하지 않는다.
모든 익스포트는 **독립 제품 간 파일/API 경계**다 — 공유 저장소 없음, 공유 레지스트리 없음, 공유 런타임 없음.
CAW-01과 CAW-02는 별개 제품이다; 그들의 IR/스키마 이름은 **그들의 것**이다(재검증할 것;
CAW-06은 그 안의 어떤 것도 소유하지 않음).

## 1. 입장: 제품 경계를 넘는 단방향 push
| 관심사 | 결정 | 이유 |
|---|---|---|
| Seam | 단일 `ExportAdapter` port; target adapter는 config 레지스트리를 통해 | 검증된 단일 이음새; 스텁은 문서화(brief §9) |
| Transport | file drop (v1) + stub-swap adapter로서의 HTTP POST | file = 가장 단순한 디커플드 경계 |
| Coupling | 자기 기술적 번들(`schema_version`+`producer`+`content_hash`) | 제품 간 공유 레지스트리 없음 |
| Direction | CAW-06에서의 **단방향 push** | CAW-06은 타인을 위한 저장소가 아님(brief §11) |
| Gating | 어떤 write보다 **앞서** `validate()` 내부에서 target별 gate | 경계에서 과대주장 금지를 강제 |
| Idempotency | `bundle_id` + `content_hash`; 재방출 = id 기준 upsert | ExperimentScout의 안전한 재실행 |
| Failure | 실패/거부된 익스포트 로깅; 발견은 **익스포트 가능 상태 유지** | 실패는 일급 시민(brief §5) |

**독립성 계약:** CAW-06은 경계를 넘어 번들을 쓰고 핸드오프를 로컬에 기록한다. **절대** 다른 제품의 저장소에
쓰지 않으며, **절대** 공유 스키마 레지스트리/런타임을 가정하지 않고, **어떤** read-back도 받지 않는다 —
receipt는 로컬 전용이다.

## 2. `ExportAdapter` 계약
하나의 port; target별 adapter; config 기반 레지스트리. v1 빌드 = `Caw01WritebackAdapter` +
`Caw02ClaimAdapter`. 나머지 모든 것은 **문서화된 스텁**(등록되어 port를 구현하지만 빌드되지 않음)이다.

```python
class ExportBundle(Protocol):
    bundle_id: str        # stable, idempotent key
    target: str           # "caw-01" | "caw-02"
    schema_version: str   # semver, INSIDE the bundle
    producer: str         # "caw-06"
    content_hash: str     # over payload, for upsert/dedup
    payload: dict         # target-specific (see §4, §5)
    provenance: dict      # thread_id, source_ids, boundary

class ExportAdapter(Protocol):
    target: str
    def validate(self, bundle: ExportBundle) -> ValidationReport: ...  # gate (§3) + schema check, BEFORE write
    def emit(self, bundle: ExportBundle) -> ExportReceipt: ...         # file drop / POST; idempotent
    def health(self) -> AdapterStatus: ...                             # reachable? path writable?
```

- `validate()`는 어떤 write보다 **앞서** target별 gate를 실행해야 한다(MUST); gate를 통과하지 못한 번들은
  로깅되고 **절대 방출되지 않는다**.
- `emit()`은 `bundle_id`+`content_hash`로 **멱등**이다(재방출 = upsert). thread에 대해 저장된
  `ExportReceipt`를 반환한다(ADR-0007 `store/exports/`) — 감사용.
- adapter는 status/uncertainty gate를 **우회할 수 없다** —
  [./ports-and-adapters.md](./ports-and-adapters_ko.md) §5 참조.

## 3. Target별 gate(과대주장 금지를 기계 검사 가능하게)
| Target | 적격성 gate | 거부 |
|---|---|---|
| **CAW-01** | implication `domain ∈ {memory-centric-systems, hardware}` AND `writeback_payload`를 가짐 OR 타입화된 open question임 | writeback / 워크로드 연관성이 없는 claim |
| **CAW-02** | implication이 해소하는 `evidence_ref` ≥1개 AND `status ∈ {supported, refuted, inconclusive}` AND provenance 존재 | **맨 `hypothesis`**; 요약 전용 항목 |

CAW-02 gate는 brief §12를 강제 가능하게 만든다: **`status: hypothesis` 항목은 거부된다 — 그것은 CAW-02
claim이 될 수 없다.** Refuted/inconclusive는 익스포트 **가능**하다(부정적 결과는 지식이다). CAW-01 gate는
`null` 필드를 가진 *질문*을 의도적으로 수용한다 — 우리는 스키마와 미지(unknowns)를 익스포트하며, 결코
지어낸 수치를 익스포트하지 않는다.

## 4. CAW-01 번들 — writeback-traffic 스키마 + open question (LOAD-BEARING)
Target: CAW-01의 L0/L1 메모리 주석 IR(**별개 제품**). CAW-06은 시뮬레이션이 아닌 **스키마 필드 + open
question**을 익스포트한다. 페이로드는 ADR-0004 `wbtraffic.v0` 형태의 산출물이다.

```json
{
  "bundle_id": "wb-2026-0007-a", "target": "caw-01", "schema_version": "0.1.0",
  "producer": "caw-06", "content_hash": "…",
  "payload": {
    "kind": "writeback-traffic-schema",
    "workload_axis": "writeback",
    "ttt_variant": "per-task-LoRA",
    "estimate_level": "L0-analytic",
    "fields": {
      "write_bandwidth":            { "unit": "GB/s",          "value": null, "basis": "TODO(open-question)" },
      "write_endurance":            { "unit": "writes/cell",   "value": null, "basis": "TODO(open-question)" },
      "near_memory_update":         { "unit": "ops/update",    "value": null, "basis": "TODO(open-question)" },
      "updated_state_residency":    { "unit": "tokens|s",      "value": null, "basis": "TODO(open-question)" },
      "optimizer_state_bytes":      { "unit": "bytes/param",   "value": null, "basis": "TODO(open-question)" },
      "updated_weight_reuse":       { "unit": "reuses/update", "value": null, "basis": "TODO(open-question)" },
      "capacity_bw_ratio_vs_context": { "curve": [], "basis": "TODO(open-question)" }
    },
    "modeled_not_measured": true,
    "open_questions": [
      "Can writeback traffic be modeled at L0/L1 before syntorch/vLLM integration? (brief §5)",
      "Which TTT variants write weights vs. only KV/state? (arXiv:2411.07279 vs 2602.21204)"
    ]
  },
  "provenance": { "thread_id": "th-0007", "source_ids": ["arxiv:2411.07279"], "boundary": "export:caw-01" }
}
```

- **숫자 필드는 기본적으로 `null` + `TODO(open-question)`의 `basis`** 를 가지며, toy 재현이 그것을 채울
  때까지 유지된다(DOC-CONVENTIONS §3). **모델링된** 추정치(`modeled_not_measured: true`)는 측정된 것과
  구분되게 플래그된다(ADR-0004).
- `open_questions[]`는 일급 익스포트다 — CAW-01은 자신의 IR에 대한 단언이 아니라 **질문**을 받는다.
  adapter는 페이로드를 파일 경계를 넘어 CAW-01의 기존 L0 객체 위로 **lowering**한다; CAW-01이 그 IR 객체
  이름을 소유한다(재검증, 공유 저장소 없음).
- 필드 물리 + L0/L1 lowering: [../02-research/writeback-traffic-modeling.md](../02-research/writeback-traffic-modeling_ko.md).

## 5. CAW-02 번들 — claim + evidence + uncertainty
Target: CAW-02 지식 저장소(**별개 제품**). claim, evidence 링크, 그리고 명시적 uncertainty를 운반하여
수신자가 source/claim/conclusion을 분리 유지하도록 한다(brief §12).

```json
{
  "bundle_id": "cl-2026-0007-a", "target": "caw-02", "schema_version": "0.1.0",
  "producer": "caw-06", "content_hash": "…",
  "payload": {
    "kind": "claim-with-evidence",
    "claim": "Per-instance TTT (LoRA-per-task) improves ARC few-shot accuracy vs frozen finetune.",
    "status": "supported",
    "confidence": "medium",
    "evidence": [
      { "ref_id": "EXP-0007#res-02", "kind": "reproduction-result", "verdict": "supported" },
      { "ref_id": "arxiv:2411.07279", "kind": "external-source" }
    ],
    "not_evidence": ["generated_summary:summ-0007"],
    "uncertainty_notes": "Single toy reproduction; cost/traffic not measured."
  },
  "provenance": { "thread_id": "th-0007", "source_ids": ["arxiv:2411.07279"], "boundary": "export:caw-02" }
}
```

- `status` ∈ `supported|refuted|inconclusive` — **절대 맨 `hypothesis`가 아님**(gate에서 거부됨).
- `not_evidence[]`는 source/summary 분리를 경계에서 기계 검사 가능하게 만든다 — 생성된 요약은 명시적으로
  제외된다.
- `status` + `confidence`는 **인라인으로** 이동한다; 어떤 것도 uncertainty를 벗긴 채 경계를 넘지 않는다(ADR-0002).

## 6. 문서화된 스텁(등록됨, v1에서 빌드되지 않음)
| Adapter | 번들 | Status |
|---|---|---|
| `Caw01WritebackAdapter` | writeback-traffic 스키마 + open question | **v1** |
| `Caw02ClaimAdapter` | claim + evidence + uncertainty | **v1** |
| `Caw03NoveltyAdapter` | novelty cue (brief §8) | stub — port 구현, 빌드 안 됨 |
| `HttpExportAdapter` | 임의(file drop의 transport 교체) | stub |

스텁은 `ExportAdapter` port를 구현하고 레지스트리에 있으므로, 승격은 config + 빌드일 뿐 — 결코 이음새의
재설계가 아니다.

## 7. End-to-end
```
finding (result / hypothesis / claim)
  └─ ImplicationMap (fan-out by domain, uncertainty-tagged)   [./implication-mapping.md]
       ├─ memory-centric/hardware + writeback_payload ──validate(caw-01)──► CAW-01 bundle (schema + open Qs)
       └─ evidence-backed + status≠hypothesis ─────────validate(caw-02)──► CAW-02 bundle (claim + evidence)
  receipts stored on thread (ADR-0007); failed/rejected exports logged, finding stays exportable
```

## Open Questions
[../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md)에서 추적:
- `TODO(open-question: is file-drop or HTTP the right v1 transport, and what is the agreed drop location/auth per target?)`
- `TODO(open-question: minimal field set CAW-01's L0/L1 IR can ingest — does it accept null+basis fields and a read/write split? — ask wbq-002)`
- `TODO(open-question: should refuted implications also export to CAW-01 as "axis not observed" signals?)`
- `TODO(open-question: how does CAW-02 want uncertainty encoded — status/confidence enums vs a calibrated score?)`
- `TODO(open-question: do we need signing/verification on outbound bundles for downstream trust?)`

## 런북에의 함의
- `ExportAdapter` port + config 기반 레지스트리 구현; v1 = `Caw01WritebackAdapter` +
  `Caw02ClaimAdapter`; `Caw03NoveltyAdapter` + `HttpExportAdapter`는 문서화된 스텁.
- `validate()`는 어떤 write보다 **앞서** target별 gate를 실행; 게이팅으로 걸러진 번들은 로깅되고 절대 방출 안 됨.
- CAW-01 adapter는 `null`+`basis` 필드와 `open_questions`를 가진 `wbtraffic.v0`를 방출; **파일 경계를 넘어**
  CAW-01의 L0 객체 위로 lowering — 결코 CAW-01의 저장소 안으로가 아님.
- CAW-02 adapter는 맨 hypothesis + 요약 전용 항목을 거부; refuted/inconclusive는 허용; `not_evidence`를 운반.
- thread별 `ExportReceipt` 저장(ADR-0007 `store/exports/`); 거부/실패 익스포트를 일급 레코드로 로깅.
