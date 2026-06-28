# 함의 매핑 & 익스포트(Implication Mapping & Export)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF_ko.md)
  - [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS_ko.md)
  - `01-decisions/ADR-XXXX-implication-mapping.md` (TODO)
  - `01-decisions/ADR-XXXX-export-boundaries.md` (TODO)
  - `08-research-plan/open-questions.md` (TODO)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적
이 문서는 **CAW-06가 연구 발견의 함의(implication)를 도메인 전반에 매핑하는 방법**과 **제품 경계를 가로질러
익스포트하는 방법**을 결정한다. 이 문서는 (a) `ImplicationMap` 모델, (b) `ExportAdapter` 계약, (c) 두 v1 익스포트
대상에 대한 **번들 형태(bundle shape)**를 정의한다: **writeback-traffic 스키마 + 미래-워크로드 open questions →
CAW-01**(시뮬레이션 컨트롤 플레인, 별개 제품)과 **claims+evidence → CAW-02**(지식 저장소, 별개 제품). 이 문서는
가설 표현, 실험 원장, 또는 writeback-traffic 스키마 필드의 내부 물리학을 정의하지 **않는다** — 그것들은 각자의
문서/ADR에 있다. 이 문서는 모든 익스포트를 **독립 제품 간의 파일/API 경계**로 취급한다 — 공유 저장소 없음, 공유
레지스트리 없음, 공유 런타임 없음. 생성된 요약은 증거가 아니다; 가설은 결코 확정된 주장으로 익스포트되지 않는다.

## 1. "함의 매핑"이란 무엇인가(그리고 무엇이 아닌가)
하나의 발견(로깅된 결과, supported/refuted 가설, 또는 추출된 주장)은 고립되어서는 거의 중요하지 않다. **함의 맵
(implication map)**은 다음을 묻는 stage-6 아티팩트다: *이것이 성립한다면, 다운스트림에서 누가 관심을 가지며, 우리는
얼마나 확신하는가?* 그것은 하나의 발견으로부터 하나 이상의 **도메인**으로의 **타입이 부여되고 불확실성이 태깅된 함의들의
fan-out**이며, 각각은 발원한 스레드로 거슬러 올라가는 provenance를 지닌다.

- 그것은 예측 엔진이 **아니며** 증거도 **아니다**. 각 함의는 그 자신의 `confidence`와 `status`를 가진
  *결과에-대한-주장(claim-about-consequences)*이며, 결코 확정된 것으로 주장되지 않는다(brief §12).
- 그것은 익스포트 전의 **라우팅 계층**이다: `writeback-traffic` 페이로드와 함께 `domain: memory-centric-systems`로
  태깅된 함의가 CAW-01 번들이 되는 것이고; 검증된 증거로 뒷받침되는 함의가 CAW-02 번들이 되는 것이다.

### 도메인(고정 어휘, brief §3 유스케이스 3)
| Domain id | 범위 | 전형적 익스포트 대상 |
|---|---|---|
| `ai-services` | TTT 추론의 서빙/제품 경제성 | CAW-02 (claim) |
| `education` | 사용자별 적응을 통한 튜터링/개인화 | CAW-02 (claim) |
| `dev-platforms` | 테스트 타임에 적응하는 툴링/에이전트 플랫폼 | CAW-02 (claim) |
| `models` | 모델-아키텍처 결과(fast-weights, LoRA-per-task) | CAW-02 (claim) |
| `hardware` | 쓰기 트래픽의 가속기/HW 결과 | CAW-01 (open question) + CAW-02 |
| `memory-centric-systems` | 선도 축: writeback 대역폭/내구성(endurance)/residency | **CAW-01 (writeback schema)** |

## 2. `ImplicationMap` 모델
발견당 맵 1개; 맵당 다수의 `implications`. CAW-06의 자체(OWN) 저장소에 JSON/markdown(brief §7); 대형 아티팩트는
경로로. 형태(예시용, 최종 wire 포맷 아님):

```json
{
  "map_id": "im-2026-0007",
  "finding_ref": { "thread_id": "th-0007", "kind": "result|hypothesis|claim", "ref_id": "res-0007-02" },
  "provenance": { "source_ids": ["arxiv:2411.07279"], "boundary": "internal" },
  "summary": "Per-task LoRA TTT writes back small adapter deltas per ARC task (NOT generated evidence).",
  "implications": [
    {
      "impl_id": "im-2026-0007-a",
      "domain": "memory-centric-systems",
      "statement": "Per-instance TTT creates a write-then-reuse pattern absent from read-dominant serving.",
      "status": "hypothesis|supported|refuted|inconclusive",
      "confidence": "low|medium|high",
      "evidence_refs": ["res-0007-02"],
      "writeback_payload_ref": "wb-0007-a",      // present only for CAW-01-bound implications
      "export_targets": ["caw-01"]
    }
  ]
}
```

규칙:
- `status`와 `confidence`는 **독립적**이다 — supported 함의도 익스포트 시 여전히 low-confidence일 수 있다.
- `evidence_refs`는 반드시 원장 결과 또는 추출된 주장으로 해석되어야 한다(MUST); 요약 문자열은 결코 증거가 아니다.
- 그 `evidence`가 대상별 게이트(§4)를 통과한 함의만 번들로 묶일 자격이 있다.

## 3. 근거(실제 TTT 작업, 그래서 맵이 검증 가능함)
맵의 어휘는 출판된 TTT/test-time-compute 작업에서 시드되며, 확정된 사실이 아니라 *재현할 소스*로 유지된다:
- **ARC에 대한 Per-task TTT**(Akyürek 외, 2024, arXiv:2411.07279): **task별 분리된 LoRA params**, 소수의 증강된
  in-context 예제로 훈련 — `memory-centric-systems` 도메인에 공급되는 구체적인 **write-back-per-task** 패턴.
  큰 정확도 향상을 보고했으나, 비용/트래픽은 미해결 부분이다.
- **Fast-weights / sequence-as-training TTT**(예: "Test-Time Training Done Right", arXiv:2505.23884;
  TTT-as-linear-attention, arXiv:2602.21204): 추론 시 컨텍스트가 **동적 레이어 가중치**로 압축됨 — updated-state
  residency + write bandwidth 함의. 보고된 낮은 FLOPs 활용률(작은 온라인 미니배치)은 그 자체로 병목이 컴퓨트가 아니라
  **메모리/쓰기**일 수 있다는 신호다. `TODO(open-question: which TTT variants actually write back weights vs.
  only KV/state?)`
- 벤더/2차(secondary) 주장(TTT-E2E 속도 향상 등)은 증거가 아니라 **검증할 주장**으로 임포트된다.

## 4. 익스포트 경계 — 설계 입장
각 대상은 **별개의 독립 제품**이다. CAW-06는 경계를 가로질러 **번들**(파일 또는 API 페이로드)을 쓰고 핸드오프를
기록한다; 그것은 결코 다른 제품의 저장소에 쓰지 않으며 공유 스키마 레지스트리를 가정하지 않는다. 버전 관리 + 검증은
번들 **안에서(inside)** 함께 이동하여 경계가 디커플드 상태로 유지된다.

| 관심사 | 결정 | 이유 |
|---|---|---|
| 전송(Transport) | 파일 드롭(v1) + 선택적 HTTP POST 어댑터 | 파일 = 가장 단순한 디커플드 경계; HTTP는 스텁 교체 |
| 결합(Coupling) | 번들이 자기 기술적(`schema_version`, `producer`) | 제품 간 공유 레지스트리 없음 |
| 방향(Direction) | CAW-06로부터의 단방향 push | CAW-06는 익스포트함; 타 제품의 저장소가 아님(brief §11) |
| 게이트(Gate) | 방출 전 대상별 적격성 게이트 | CAW-01은 open question 허용; CAW-02는 증거 요구 |
| 멱등성(Idempotency) | `bundle_id` + content hash; 재방출 = id로 upsert | ExperimentScout 파이프라인의 안전한 재실행 |
| 실패(Failure) | 실패한 익스포트는 로깅, 발견은 익스포트 가능 상태 유지 | 실패는 일급(brief §5) |

### 대상별 게이트
| 대상 | 적격성 게이트 | 거부 |
|---|---|---|
| **CAW-01** | 함의 `domain ∈ {memory-centric-systems, hardware}` AND `writeback_payload` 보유 OR 타입 부여된 open question | writeback/워크로드 관련성 없는 주장 |
| **CAW-02** | 함의가 해석되는 `evidence_ref` ≥1개 보유 AND `status ∈ {supported, refuted, inconclusive}` AND provenance 존재 | 맨 가설, 요약-전용 항목 |

CAW-02 게이트는 brief §12를 강제한다: 어떤 가설도 확정된 주장으로 익스포트되지 않는다; refuted/inconclusive는
익스포트 가능**하다**(음성 결과는 지식이다).

## 5. `ExportAdapter` 계약
Ports & adapters(brief §9). 하나의 port, 대상별 어댑터, config 주도 레지스트리. v1 빌드 = CAW-01 + CAW-02;
그 외 모든 것은 문서화된 스텁이다.

```python
class ExportBundle(Protocol):
    bundle_id: str          # stable, idempotent
    target: str             # "caw-01" | "caw-02"
    schema_version: str     # semver, inside the bundle
    producer: str           # "caw-06"
    content_hash: str       # over payload, for upsert/dedup
    payload: dict           # target-specific (see §6, §7)
    provenance: dict        # source_ids, thread_id, boundary

class ExportAdapter(Protocol):
    target: str
    def validate(self, bundle: ExportBundle) -> ValidationReport: ...  # gate (§4) + schema check
    def emit(self, bundle: ExportBundle) -> ExportReceipt: ...         # file drop / POST; idempotent
    def health(self) -> AdapterStatus: ...                             # reachable? path writable?

# Registry (config-driven; stubs documented, not built)
EXPORT_ADAPTERS = {
  "caw-01": Caw01WritebackAdapter,   # v1
  "caw-02": Caw02ClaimAdapter,       # v1
  "caw-03": StubAdapter,             # novelty cues (brief §8) — stub
}
```

`validate()`는 반드시 어떤 쓰기보다 **먼저** 대상별 게이트를 실행해야 한다(MUST); 게이트를 통과하지 못한 번들은
로깅되며 결코 방출되지 않는다. `emit()`은 CAW-06가 감사를 위해 스레드에 대해 저장하는 영수증(receipt)을 반환한다.

| 어댑터 | v1? | 번들 | 비고 |
|---|---|---|---|
| `Caw01WritebackAdapter` | yes | writeback-traffic 스키마 + open questions | L0/L1 브리지 대상 |
| `Caw02ClaimAdapter` | yes | claim + evidence + uncertainty | 지식 저장소 |
| `Caw03NoveltyAdapter` | stub | novelty cues | brief §8 선택 |
| `HttpExportAdapter` | stub | any | 파일 드롭의 전송 교체 |

## 6. CAW-01 번들 — writeback-traffic 스키마 + open questions
대상: CAW-01의 **L0/L1 메모리-주석 IR**(별개 제품). CAW-06는 시뮬레이션이 아니라 **스키마 필드 + open questions**를
익스포트한다. 이것이 brief의 하중을 견디는(load-bearing) 브리지다(§5).

```json
{
  "bundle_id": "wb-2026-0007-a", "target": "caw-01", "schema_version": "0.1.0",
  "producer": "caw-06", "content_hash": "…",
  "payload": {
    "kind": "writeback-traffic-schema",
    "workload_axis": "writeback",
    "ttt_variant": "per-task-LoRA",
    "fields": {
      "write_bandwidth": { "unit": "GB/s", "value": null, "basis": "TODO(open-question)" },
      "write_endurance": { "unit": "writes/cell", "value": null, "basis": "TODO" },
      "updated_state_residency": { "unit": "tokens|s", "value": null, "basis": "TODO" },
      "optimizer_state_bytes": { "unit": "bytes/param", "value": null },
      "updated_weight_reuse": { "unit": "reuses/update", "value": null },
      "capacity_bw_ratio_vs_context": { "curve": [], "basis": "TODO" }
    },
    "open_questions": [
      "Can writeback traffic be modeled at L0/L1 before syntorch/vLLM integration? (brief §5)",
      "Which TTT variants write weights vs. only KV/state? (arXiv:2411.07279 vs 2602.21204)"
    ]
  },
  "provenance": { "thread_id": "th-0007", "source_ids": ["arxiv:2411.07279"], "boundary": "export:caw-01" }
}
```

- 수치 필드는 재현이 채울 때까지 `basis`를 `TODO(open-question: …)`로 하여 기본값 `null`이다 — 우리는 **스키마와
  미지의 것을** 익스포트하지, 결코 지어낸 수치를 익스포트하지 않는다(DOC-CONVENTIONS §3).
- `open_questions`는 일급 익스포트다: CAW-01은 그 IR에 대한 주장이 아니라 *질문*을 받는다.

## 7. CAW-02 번들 — claim + evidence + uncertainty
대상: CAW-02 지식 저장소(별개 제품). 받는 제품이 소스/주장/결론을 분리 유지할 수 있도록 **주장, 그 증거 링크, 명시적
불확실성**을 지닌다(brief §12).

```json
{
  "bundle_id": "cl-2026-0007-a", "target": "caw-02", "schema_version": "0.1.0",
  "producer": "caw-06", "content_hash": "…",
  "payload": {
    "kind": "claim-with-evidence",
    "claim": "Per-instance TTT (LoRA-per-task) improves ARC few-shot accuracy vs frozen finetune.",
    "status": "supported",                 // supported|refuted|inconclusive (never bare 'hypothesis')
    "confidence": "medium",
    "evidence": [
      { "ref_id": "res-0007-02", "kind": "reproduction-result", "verdict": "supported" },
      { "ref_id": "arxiv:2411.07279", "kind": "external-source" }
    ],
    "not_evidence": ["generated_summary:summ-0007"],   // explicitly excluded
    "uncertainty_notes": "Single toy reproduction; cost/traffic not measured."
  },
  "provenance": { "thread_id": "th-0007", "source_ids": ["arxiv:2411.07279"], "boundary": "export:caw-02" }
}
```

- `not_evidence`는 소스/요약 분리를 명시적이고 경계에서 기계 검증 가능하게 만든다.
- `status: hypothesis` 항목은 **게이트에 의해 거부된다** — 그것은 CAW-02 주장이 될 수 없다.

## 8. 종단간(end-to-end) (하나의 스레드 → 익스포트)
```
finding (result/hypothesis/claim)
   └─ ImplicationMap (fan-out by domain, uncertainty-tagged)
        ├─ memory-centric/hardware + writeback_payload ──validate(caw-01)──► CAW-01 bundle (schema + open Qs)
        └─ evidence-backed + status≠hypothesis ─────────validate(caw-02)──► CAW-02 bundle (claim + evidence)
   receipts stored on thread; failed/rejected exports logged, finding stays exportable
```

## 미해결 질문(Open Questions)
[`08-research-plan/open-questions.md`](../08-research-plan/open-questions_ko.md)에서 추적(TODO):
- `TODO(open-question: can writeback traffic be modeled at L0/L1 before full syntorch/vLLM integration?)` (brief §5).
- `TODO(open-question: which TTT variants actually write back weights vs. only update KV/state?)` (2411.07279 vs 2602.21204).
- `TODO(open-question: what is the minimal field set CAW-01's IR can ingest at L0/L1 — does it accept null+basis fields?)`
- `TODO(open-question: is file-drop or HTTP the right v1 transport given CAW-01/CAW-02 deploy independently?)`
- `TODO(open-question: should refuted implications also export to CAW-01 as "axis not observed" signals?)`
- `TODO(open-question: how does CAW-02 want uncertainty encoded — enum vs. calibrated score?)`

## 런북에 대한 함의(Implications for runbooks)
- **RB (함의 매핑):** `ImplicationMap` 모델 + 고정 `domain` 어휘 구축; `evidence_refs` 해석 및 `summary`≠증거 강제;
  status/confidence 독립.
- **RB (익스포트 port):** `ExportAdapter` port + config 주도 레지스트리 구현; CAW-01 및 CAW-02용 v1 어댑터;
  CAW-03 + HTTP는 문서화된 스텁(brief §9).
- **RB (CAW-01 번들):** `null`+`basis` 필드와 `open_questions`를 가진 writeback-traffic 스키마 번들을 방출;
  대상별 게이트에 대해 검증; 결코 CAW-01의 저장소에 쓰지 않음(파일 드롭 / POST만).
- **RB (CAW-02 번들):** claim+evidence 번들 방출; 게이트가 맨 가설과 요약-전용 항목을 거부; refuted/inconclusive는 허용.
- **RB (감사):** 스레드별 `ExportReceipt` 저장; 거부/실패한 익스포트를 일급 레코드로 로깅.
- 모든 번들은 `schema_version` + `provenance` + `content_hash`를 지닌다; 경계는 디커플드 상태로 유지된다(공유 저장소 없음).
