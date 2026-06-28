# Writeback-Traffic 모델링 (CAW-01 브리지)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF_ko.md), [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적

이 문서는 TTT-급(class) workload를 위한 **writeback-traffic 스키마**를 제안하고, CAW-06이 그것을 **CAW-01의
L0/L1 memory-annotated IR**에 매핑되도록 어떻게 **export**할 수 있는지를 명세한다(CAW-01은 별개의 제품이다; 이것은
import/export 경계이며, **공유 저장소가 아니다**). 그것은 하나의 핵심 설계 질문에 답한다: *TTT write traffic을 전체
syntorch/vLLM 통합 이전에 L0/L1에서 추상적으로 모델링할 수 있는가?* 그것은 CAW-01의 IR을 결정하지 **않으며**
(CAW-01이 소유), 실제 TTT를 대규모로 실행하지 **않고**, TTT가 실제로 새로운 memory device를 요구하는지를 확정하지
**않는다** — 그것은 태깅된 hypothesis로 남는다.

## 배경: 왜 writeback 축인가 (근거 있음, 확정 아님)

Read-dominant LLM serving 프로파일은 추론을 read-heavy로 취급한다: 가중치는 한 번 로드되어 재사용된다; 뜨거운
mutable 구조는 KV cache이다. **TTT(test-time training / test-time compute)는 이 가정을 깬다**: 파라미터의 부분집합
— **"fast weights"** — 이 *추론 중에 gradient descent로 업데이트된다*. 따라서 추론 자체가 read-dominant
프로파일이 포착하지 못하는 **write traffic**(updated weights, gradients, optimizer state)을 방출한다.

hypothesis에 씨앗을 주고(그리고 경계 짓는 데) 사용된 공개 작업 — 아래의 생성된 요약은 **단서(leads)이지 evidence가
아니다**; 각각은 사용 전에 provenance를 가진 클레임으로서 ledger에 들어가야 한다:

| Source (lead) | What it suggests for writeback | Caveat |
| --- | --- | --- |
| Titans, *Learning to Memorize at Test Time* (arXiv:2501.00663) | A neural long-term memory module updated at test time → recurring weight writes | Variant-specific; verify what is written and how often |
| *Test-Time Training Done Right* / LaCT (arXiv:2505.23884) | Fast weights are MLP layers; **large-chunk** updates raise GPU util (orig TTT often <5% FLOPs) → update **frequency** is a tunable axis | Chunk size trades latency vs write burst size |
| TTT-E2E (test-time-training.github.io e2e) | Updates only **final ~25% of MLP**; static/dynamic split → bounds **updated-state residency** size | Numbers are public claims, reproduce before trusting |
| TNT, chunkwise TTT (arXiv:2511.07343) | Chunkwise memorization → write granularity ≠ token granularity | — |
| Adam optimizer state (general) | First+second moment ≈ 8 bytes/param (fp32) → **optimizer-state residency** can dominate writeback volume | Optimizer choice changes the multiplier |

> Uncertainty 태그: **HYPOTHESIS**. "TTT-급 workload는 read-dominant serving과 다른 memory-device 속성을
> 필요로 한다"는 *조사 대상*이지, 확정된 클레임이 아니다. Open Questions 참조.

## 여기서 "writeback traffic"이 의미하는 것

TTT 변형에 대해, update 이벤트당 우리는 **무엇이 쓰이는지, 얼마나, 얼마나 자주, 어디에 사는지, 그리고 얼마나 자주
다시 읽히는지**에 관심을 둔다. 구체적으로:

- **Write bandwidth** — 추론 중에 write back되는 bytes/s(fast-weight delta + gradient + optimizer state).
- **Write volume per update** — update 이벤트당 bytes(fast-weight param count × dtype의 함수).
- **Update frequency** — token / chunk / sequence당 update(chunk size가 knob).
- **Updated-state residency** — updated weights + optimizer state가 어디에 사는지(device / near-memory / host tier).
- **Updated-weight reuse** — read-after-write 거리: updated weight가 얼마나 빨리/자주 다시 읽히는지.
- **Write endurance pressure** — 한 run 동안 한 영역에 누적되는 write(*device 속성* 관심사, 예: updated state가
  endurance-limited media에 안착하는 경우; L0에서는 추상적/선택적).
- **Capacity/bandwidth-ratio shift** — read:write byte 비율과 live-capacity peak이 **context 길이와 update
  빈도의 함수로서** 어떻게 변하는지(TTT를 read-dominant와 구별하는 대표(headline) 지표).

## 제안된 writeback-traffic 스키마 (CAW-06 export 아티팩트)

CAW-06 자체의 아티팩트(markdown/JSON + ledger, 브리프 §7에 따라). 각 필드가 CAW-01 L0 객체로 깔끔하게
**lower(내려)**지도록 설계됨. `uncertainty`와 `provenance`는 필수이다(overclaim 없음).

```jsonc
{
  "schema_version": "wbtraffic.v0",
  "thread_id": "…",                  // CAW-06 research thread (source→claim→hypothesis→experiment)
  "ttt_variant": "lact|titans|ttt-e2e|…",
  "provenance": { "claim_id": "…", "source_url": "…" },
  "uncertainty": "hypothesis|supported|refuted|inconclusive",

  "fast_weights": {
    "param_count": 0,                // # of updated (fast) params
    "dtype": "bf16",
    "fraction_of_model": null        // e.g. ~0.25 for TTT-E2E-style; null if unknown -> open question
  },
  "update": {
    "granularity": "token|chunk|sequence",
    "chunk_tokens": null,            // null until measured/known
    "updates_per_1k_tokens": null,   // derived update frequency
    "writes_optimizer_state": true,  // does the variant persist optimizer moments?
    "optimizer_state_bytes_per_param": 8   // e.g. Adam fp32 m+v; 0 if stateless update
  },
  "writeback": {
    "bytes_per_update": null,        // = fast_weights.param_count * dtype_bytes (+ optimizer if persisted)
    "write_bw_bytes_per_s": null,    // bytes_per_update * update_rate  (modeled, not measured at v1)
    "updated_state_residency": "device|near_mem|host",
    "reuse_distance_tokens": null,   // read-after-write distance for updated weights
    "endurance_writes_per_run": null // optional device-property rollup; abstract at L0
  },
  "ratio_curve": [                   // the headline: how the picture shifts with context/frequency
    { "context_tokens": 8192,  "update_freq": "chunk@2048",
      "read_bytes": null, "write_bytes": null, "capacity_peak_bytes": null }
  ],
  "assumptions": ["dtype, model size, optimizer — list every modeling assumption"],
  "open_questions": ["wbq-001", "…"]
}
```

모든 수치 필드는 `null`로 기본 설정되고 **모델링된 추정치**(v1, 가정을 나열함) 또는 small-experiment ledger의
**reproduction 결과** 중 하나에서 채워진다. 중요한 `null`은 `TODO(open-question: …)`가 되며, 결코 지어낸 숫자가
아니다.

## CAW-01 L0/L1로의 매핑 (export, 공유 저장소 아님)

CAW-01의 L0 IR은 세 가지 객체 타입을 가진다: **op**, **tensor** (`TensorNode`), **movement**
(`DataMovementEdge`), 그리고 promotion 규칙 "memory traffic / capacity / lifetime에 대한 인과 chain을
바꾸는 경우에만 일급(first-class)"을 가진다(CAW-01의 `l0-ir-schema.md`, 별개 제품의 문서 참조). TTT writeback은
다음과 같이 매핑된다:

| Writeback field | CAW-01 L0/L1 target | How it lowers | Level |
| --- | --- | --- | --- |
| update event | `op` with `op_class: "mem_store"` | one update → one (or chunked) store op | L0 |
| `bytes_per_update` | `movement.bytes`, `from_tier: "device" → to_tier: residency` | a writeback `DataMovementEdge` | L0 |
| `fast_weights.param_count × dtype` | `tensor.size_bytes` (updated-weight TensorNode) | a mutable tensor re-written each update | L0 |
| optimizer state | extra `tensor` (residency = updated_state_residency) | persisted moments as live tensors → capacity peak | L0 |
| `updated_state_residency` | `tensor.residency` / `movement.to_tier` | "device" at L0; **near_mem/host tier at L1** | L0→L1 |
| `reuse_distance_tokens` | `tensor.allocated_at`/`freed_at` lifetime + re-read movements | read-after-write lifetime; deepens with L1 tiers | L0→L1 |
| `update_freq` over context | repeated store ops along the time axis | drives the **write-traffic rollup** | L0 |
| `ratio_curve` | derived rollup (Σ write `movement.bytes` vs Σ read) | new "writeback" companion to CAW-01's "rough traffic" | L0 rollup |
| `endurance_writes_per_run` | per-tier cumulative write rollup | a *new* device-property rollup CAW-01 may add | L1 (proposed) |

**핵심 적합성(Key fit):** TTT writeback은 **새로운 L0 객체 타입이 필요 없다** — 그것은 `mem_store` op +
writeback `movements` + mutable `tensors`로 표현 가능하다. 그것이 *추가하는* 것은 **방향/비대칭(direction/
asymmetry)**이다: CAW-01의 "rough traffic = Σ movement bytes"는 **read vs write** rollup으로 분할되어
read:write 비율과 그것의 context/frequency에 따른 drift가 일급이 되어야 한다. 그 분할이 구체적인 **CAW-01에 대한
export 요청(ask)**이다(우리가 하는 변경이 아니라, 그들을 위한 open question).

### 진짜 새로운 것 vs 이미 다뤄진 것

| Aspect | Already in CAW-01 L0 | New for TTT writeback |
| --- | --- | --- |
| store ops, movement bytes, tensor lifetime | yes | reuse as-is |
| capacity peak (live tensors) | yes | optimizer-state tensors enlarge it |
| traffic volume | yes (undirected) | **direction (write share) + endurance rollup** |
| residency tiers | L1 reserves them | near-memory **update** site (compute-at-write) as a tier hint |

## 전체 syntorch/vLLM 통합 이전에 write traffic을 L0/L1에서 모델링할 수 있는가?

**제안된 답: 예, 추상적으로 — 통합 이전에, 명확히 표시된 L0 *추정치(estimate)*로서.** 브리프(§5, §11)는
writeback을 먼저 L0/L1에서 추상적으로 모델링하는 것을 명시적으로 허용한다.

| Option | Pros | Cons | Fit for v1 |
| --- | --- | --- | --- |
| **A. Analytic L0 estimate** (this doc): compute `bytes_per_update`, `write_bw`, `ratio_curve` from variant params + assumptions | no infra; fast; forces explicit assumptions; produces the export artifact now | numbers are modeled, not measured → must be tagged `inconclusive`/`hypothesis` | **v1 (chosen)** |
| B. Toy reproduction → real counters (small-experiment ledger) | grounds a few numbers with a minimal run | limited to tiny models; still not syntorch/vLLM | v1 follow-on for 1 checkable claim |
| C. Full syntorch/vLLM trace → Chakra → L0 | real op/tensor/movement trace | heavy; explicit **non-goal** for CAW-06 v1 | deferred / CAW-01's domain |

**결정:** v1 = Option A가 모델링된 추정치 + 가정과 함께 스키마 아티팩트를 산출하며, 선택적으로 하나의 Option-B toy
reproduction으로 뒷받침된다. 유용한 writeback-traffic export를 방출하기 위해 CAW-01의 syntorch/vLLM
파이프라인(Option C)을 **요구하지 않는다**. 아티팩트는 uncertainty를 지닌 **제안/hypothesis**이며, CAW-01이
나중에 Option C로 *검증할 수 있도록* L0 객체로 내려진다 — 하지만 브리지는 그것에 블록되지 않는다.

Caveat: analytic 추정치는 `assumptions`만큼만 좋다. 모델링된 `write_bw`는 실제 memory bottleneck의
**evidence가 아니다**; 그것은 검증 가능한 hypothesis이다. 이것은 모든 export된 아티팩트에 명시되어야 한다.

## Open Questions

[../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) 참조. 하중을 견디는 것들:

- **wbq-001:** 어떤 TTT 변형이 추론 중에 fast-weight delta만이 아니라 optimizer state를 *실제로* write back하는가?
  (Titans / LaCT / TTT-E2E가 다르다.) TODO(open-question).
- **wbq-002:** CAW-01은 "rough traffic"을 방향성 read/write rollup + endurance rollup으로 분할해야 하는가?
  이것은 **CAW-01에 대한 export 요청**이다(그들의 결정). TODO(open-question).
- **wbq-003:** CAW-01의 모델에서 `near_mem`은 residency *tier*인가 *op 속성*(compute-at-write)인가?
  near-memory update가 `movement.to_tier`에 매핑되는지 `op.attr`에 매핑되는지에 영향. TODO(open-question).
- **wbq-004:** 실제 TTT workload가 어떤 그럴듯한 tier에든 write endurance pressure를 만드는가, 아니면 endurance가
  DRAM/HBM residency에는 비-이슈인가? (Endurance는 특정 media에 대해서만 중요하다.) TODO(open-question).
- **wbq-005:** `reuse_distance_tokens`는 CAW-01 tensor lifetime처럼 DAG walk로부터 유도될 수 있는가, 아니면
  정적 그래프에 없는 update-frequency 메타데이터가 필요한가? TODO(open-question).
- **wbq-006:** 모델링된 `write_bw`가 긴 context에서 read bandwidth를 초과하는 일이 있는가 — 즉, writeback 축이
  bottleneck인 적이 있는가, 아니면 항상 second-order인가? (전체 브리지를 정당화하는 hypothesis.) TODO(open-question).

## 런북에 대한 시사점 (Implications for runbooks)

- phase-2 런북은 **`wbtraffic.v0` 스키마**를 필수 `provenance` + `uncertainty`를 가진 CAW-06 아티팩트(JSON +
  markdown card)로 구현하며, 모든 수치는 `null`로 기본 설정된다.
- 런북은 **analytic L0 estimator**(Option A)를 구현한다: 변형의 fast-weight param count, dtype, optimizer,
  chunk size가 주어지면 → `bytes_per_update`, `write_bw`, `ratio_curve`를 계산하고 모든 `assumption`을 방출한다.
  수락(Acceptance): 동일한 입력으로 재실행하면 결정적(deterministic)이고 가정을 나열한다.
- 런북은 **ExportAdapter → CAW-01**을 구현한다: 아티팩트를 L0 모양의 객체(`mem_store` op + writeback
  `movements` + mutable `tensors`)로 직렬화하고 **plus** open-question 목록을, 명시적 파일 경계를 가로질러.
  CAW-01과의 어떤 공유 저장소/레지스트리도 가정해서는 안 된다.
- small-experiment-ledger 런북(Option B)은 단일 변형에 대해 `bytes_per_update`를 측정하는 **하나의** toy
  reproduction을 계획한다; 실패는 일급(first-class) 부정적 결과로 기록.
- 모든 export는 uncertainty 태그를 지녀야 한다; *모델링된* 숫자의 export는 *측정된* 것과 구별되게 표시된다.
