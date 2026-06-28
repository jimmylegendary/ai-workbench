# Writeback-Traffic Schema (`wbtraffic.v0`) — 코어 명세

- **Status:** draft (load-bearing)
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF_ko.md) (source of truth)
  - [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS_ko.md)
  - [../01-decisions/ADR-0004-writeback-traffic-schema_ko.md](../01-decisions/ADR-0004-writeback-traffic-schema_ko.md) (이 명세가 구현하는 결정)
  - [../01-decisions/ADR-0002-hypothesis-representation_ko.md](../01-decisions/ADR-0002-hypothesis-representation_ko.md) (uncertainty가 인라인으로 함께 이동)
  - [../01-decisions/ADR-0008-export-boundaries_ko.md](../01-decisions/ADR-0008-export-boundaries_ko.md) (`Caw01WritebackAdapter`가 유일한 이음새)
  - [./experiment-ledger_ko.md](./experiment-ledger_ko.md) (`writeback_observed`가 모델 추정치에 근거를 부여)
  - [../02-research/writeback-traffic-modeling_ko.md](../02-research/writeback-traffic-modeling_ko.md) (연구 뒷받침)
  - [../02-research/ttt-landscape_ko.md](../02-research/ttt-landscape_ko.md) (variant별 write 프로파일)
  - [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적
이것은 CAW-06의 `wbtraffic.v0` 스키마에 대한 **빌드 지향(build-facing) 명세**다: variant별 필드, v1 분석적
L0 추정기, 그리고 아티팩트를 CAW-01의 기존 IR 객체와 open question 목록 위로 **export**하는 L0/L1 브리지.
[ADR-0004](../01-decisions/ADR-0004-writeback-traffic-schema_ko.md)를 빌더가 구현할 수 있는 구체적 필드와
lowering 테이블로 변환한다. CAW-01의 IR을 결정하지 **않으며**(이는 별개 제품 CAW-01이 소유 — 아래
이름들은 사용 전 재검증 대상이며 여기서 권위가 없음), 실제 TTT를 대규모로 실행하지 않고(brief §11), TTT가
새 메모리 장치를 요구하는지 결판내지 않는다 — 그것은 태깅된 `Hypothesis`로 남는다
([ADR-0002](../01-decisions/ADR-0002-hypothesis-representation_ko.md)). 어떤 variant가 write back하는지에 대한
분류 체계는 [ttt-landscape_ko.md](../02-research/ttt-landscape_ko.md)에 있다; 상호 링크하고, 중복하지 말 것.

## 이 스키마가 봉사하는 hypothesis (전제가 아님)
TTT는 CAW-01의 *후보 미래 워크로드 축*이다: **write back**하는(weight delta, gradient, optimizer state,
updated-weight 재사용) 추론은 **read-dominant LLM 서빙 프로파일에 포착되지 않는 메모리 축**을 만들 수
있다 (brief §1, §5). 그 헤드라인은 확정된 claim이 아니라 **hypothesis**다. 따라서:
- 스키마는 **variant별** 필드를 지닌다 — 단일 "TTT = writes" 불리언은 CAW-01 축을 망가뜨린다. 왜냐하면
  "TTT" 아래에는 적어도 네 개의 서로 다른 메모리 프로파일이 숨어 있기 때문이다 (ttt-landscape §3).
- 모든 아티팩트는 필수 ADR-0002 `uncertainty` status를 지닌다; **modeled** 수치는 결코 증거가 아니며 그
  자체만으로는 결코 `supported`일 수 없다 (modeled ≠ measured; generated ≠ evidence).
- 브리지는 **파일 경계를 가로지르는 export**이며, 결코 CAW-01과의 공유 저장소가 아니다 (brief §8).

## `wbtraffic.v0` — 스키마
CAW-06의 자체(OWN) 아티팩트(markdown 카드 + JSON 트윈), 리서치 스레드 아래 TTT variant당 하나.
`provenance`와 `uncertainty`는 필수다. **모든 수치는 기본값 `null`**; 중요한 `null`은 지어낸 수치가 아니라
`TODO(open-question: …)`가 된다 (conventions §3).

```jsonc
{
  "schema_version": "wbtraffic.v0",
  "thread_id": "...",                  // CAW-06 research thread (source→claim→hypothesis→experiment)
  "ttt_variant": "ttt-linear|titans|lact|ttt-e2e|arc-lora|ttrl|tta|kv-binding|...",
  "provenance": { "claim_id": "...", "source_url": "..." },   // MANDATORY
  "uncertainty": "hypothesis|supported|refuted|inconclusive", // MANDATORY (ADR-0002); default hypothesis
  "basis": "modeled|measured|mixed",   // modeled = analytic L0 estimate; measured = from ledger run

  "fast_weights": {
    "param_count": null,               // # of updated (fast) params
    "dtype": "bf16",
    "fraction_of_model": null          // e.g. ~0.25 for TTT-E2E-style; null -> open question
  },
  "update": {
    "granularity": "token|chunk|sequence",
    "chunk_tokens": null,
    "updates_per_1k_tokens": null,     // derived update frequency
    "writes_optimizer_state": null,    // does the variant persist optimizer moments?
    "optimizer_state_bytes_per_param": null  // e.g. Adam fp32 m+v ~= 8; 0 if stateless update
  },
  "writeback": {
    "bytes_per_update": null,          // = fast_weights.param_count * dtype_bytes (+ optimizer if persisted)
    "write_bw_bytes_per_s": null,      // = bytes_per_update * update_rate (MODELED at v1)
    "updated_state_residency": "device|near_mem|host",
    "reuse_distance_tokens": null,     // read-after-write distance for updated weights
    "endurance_writes_per_run": null   // optional device-property rollup; abstract at L0
  },
  "ratio_curve": [                      // the HEADLINE: how read:write shifts with context/frequency
    { "context_tokens": null, "update_freq": null,
      "read_bytes": null, "write_bytes": null, "capacity_peak_bytes": null }
  ],
  "assumptions": ["dtype, model size, optimizer, update rate — list EVERY modeling assumption"],
  "open_questions": ["wbq-001", "..."]
}
```

### 필드 그룹 (각각 무엇을 포착하는가)
| Group | 포착 | 왜 중요한가 |
|---|---|---|
| `fast_weights` | 업데이트되는 weights의 크기/dtype/비율 | update당 write 페이로드를 결정 |
| `update` | granularity, frequency, optimizer-state 영속화 | optimizer state가 volume을 지배할 수 있음 (Adam fp32 ~8 B/param) |
| `writeback` | bytes/update, modeled write BW, residency, reuse distance, endurance | event별 write 프로파일 + state가 사는 곳 |
| `ratio_curve` | context × update freq에 따른 read vs write bytes + capacity peak | TTT를 read-dominant 서빙과 구별 |
| `assumptions` | 모든 모델링 입력 | modeled 수치는 이것만큼만 좋음 |
| `provenance`/`uncertainty`/`basis` | claim, source, status, modeled-vs-measured | 경계 전반의 무과장을 강제 |

## v1 생산 = 분석적 L0 추정치 (Option A)
CAW-01 인프라 없이, variant의 공개 논문 파라미터 + 나열된 가정으로부터 아티팩트를 **지금** 생산한다
(ADR-0004 §2):

```
bytes_per_update     = fast_weights.param_count * dtype_bytes
                       (+ param_count * optimizer_state_bytes_per_param  if writes_optimizer_state)
update_rate          = updates_per_1k_tokens / 1000        # updates per token
write_bw_bytes_per_s = bytes_per_update * update_rate * tokens_per_s   # tokens_per_s an explicit assumption
ratio_curve[i]       = for each (context_tokens, update_freq):
                         write_bytes = bytes_per_update * (updates over that context)
                         read_bytes  = TODO(open-question: read-side model — KV + weight reads)
                         capacity_peak_bytes = live(fast_weights + optimizer_state + ...)
```
- **Acceptance:** 동일 입력으로 재실행하면 결정적이며 모든 `assumption`을 방출한다.
- **근거 부여 (Option B, 후속):** [ledger](./experiment-ledger_ko.md)를 통한 하나의 toy reproduction이
  단일 variant에 대한 *measured* `bytes_per_update`를 공급한다; 해당 `null`을 덮어쓰고, 그 필드의
  `basis`를 `measured`로 뒤집으며, modeled 필드와 구별되게 플래그된다. measured 수치는 추정치에 근거를
  부여한다; 그것이 아티팩트 전체를 증거로 바꾸지는 않는다.
- **Option C 아님.** 완전한 syntorch/vLLM → trace → L0는 v1의 명시적 비목표(brief §11)이자 CAW-01의
  도메인이다; export는 그것 없이도 유용해야 한다.

> modeled `write_bw`는 실제 병목의 **증거가 아니다** — 그것은 모든 아티팩트에 명시된, 검증 가능한
> hypothesis다. `basis: modeled` + `uncertainty: hypothesis`가 기본값이다.

## CAW-01 L0/L1 브리지 (기존 객체 + open question 위로 export)
TTT writeback은 **새 L0 객체 타입이 필요 없다** — CAW-01의 기존 **op / tensor / movement** 객체로 표현
가능하다. 아래 객체 이름들은 **CAW-01(별개 제품)이 소유한다; 직렬화 전에 그들의 현재 IR에 대해 재검증할
것 — 여기서 권위가 없다**, 그리고 우리는 저장소를 공유하지 않는다.

| `wbtraffic.v0` 필드 | CAW-01 L0/L1 타깃 (재검증) | Level |
|---|---|---|
| update event | `op_class: "mem_store"`인 `op` | L0 |
| `writeback.bytes_per_update` | writeback `movement.bytes` (device → residency tier) | L0 |
| `fast_weights.param_count × dtype` | mutable `tensor.size_bytes` (update마다 재기록) | L0 |
| optimizer state | 추가로 live한 `tensor` (capacity peak 확대) | L0 |
| `updated_state_residency` | `tensor.residency` / `movement.to_tier` (L1에서 near_mem/host) | L0→L1 |
| `reuse_distance_tokens` | tensor lifetime + 재읽기 movements | L0→L1 |
| context에 따른 `update` freq | 시간 축을 따른 반복 store op | L0 |
| `ratio_curve` | 파생 rollup (Σ write `movement.bytes` vs Σ read) | L0 rollup |
| `endurance_writes_per_run` | tier별 누적 write rollup | L1 (제안) |

**브리지가 더하는 것은 방향성/비대칭성이다.** CAW-01의 무방향 "rough traffic = Σ movement bytes"는
**read vs write** rollup으로 분리되어야 하며, 그래야 read:write 비율과 context/frequency에 따른 그 드리프트가
일급이 된다. 그 분리 — 더하여 `near_mem`이 residency *tier*인지 *op 속성*인지, 그리고 endurance rollup을
추가할지 — 는 **CAW-01에 대한 export *요청*(open question)이며, 우리가 그들의 IR에 가하는 변경이 아니다**.

### export 번들 + 게이트
- `ExportAdapter` → `Caw01WritebackAdapter`([ADR-0008](../01-decisions/ADR-0008-export-boundaries_ko.md))를
  통해 **자기 기술 번들**로 운송된다: `{ schema_version, producer, content_hash, provenance, boundary:"export:caw-01",
  payload(L0-shaped objects), open_questions }`. 운송은 v1에서 **파일 드롭**; HTTP는 스텁 교체다.
- 번들은 **스키마 필드 AND 미지의 것들**을 함께 싣는다 — CAW-01은 자신의 IR에 대한 단언이 아니라
  *질문*을 받는다. 어떤 쓰기 전에든 `validate()`가 타깃별 게이트를 실행한다: writeback 페이로드 또는
  타입이 지정된 open question을 지닌 `domain ∈ {memory-centric-systems, hardware}` 함의만 승인한다.
- 실패한 export는 **로그되고 finding은 export 가능한 상태로 유지된다** (실패는 일급). CAW-06은 결코
  CAW-01의 저장소에 쓰지 않는다.

### 불확실성 + 사람 게이트
ADR-0002에 따라, `uncertainty` status는 필수이며 인라인으로 함께 이동한다:
| Status | 무엇이 export되는가 | 어떻게 |
|---|---|---|
| `hypothesis` | variant의 프로파일 | CAW-01에 대한 **open question**으로 |
| `supported` (사람 확인됨) | variant의 프로파일 | **후보 workload-axis 입력**으로, 여전히 `provisional` 플래그 |
| `refuted` / `inconclusive` | 부정적 결과 | open question / 닫힌 lead로 (실패도 유용) |

**modeled-only** 아티팩트는 `supported`일 수 없다 — ledger로부터 measured 근거가 필요하며, 그렇더라도
사람이 모든 `supported` export를 확인한다 (ADR-0001 검토 게이트).

## 트레이드오프 (수용됨)
| 결정 | 장점 | 단점 / 비용 |
|---|---|---|
| variant별 스키마, 수치 기본 `null` | ≥4개의 서로 다른 메모리 프로파일 포착; 지어낸 수치 금지 | 많은 필드가 `null`로 시작; 채울 것이 많음 |
| 분석적 L0 추정치 v1 | 오늘 export, CAW-01 인프라 제로 | 수치가 modeled → `hypothesis`로 태깅 필수 |
| 기존 L0 객체 위로 lowering | 새 객체 타입 없음; CAW-01 자체 검증과 전방 호환 | 충실한 lowering 테이블을 동기 유지 필요 |
| export 번들, 공유 저장소 아님 | 독립성 보존; 릴리스 주기 분리 | 방향성 분리는 CAW-01이 open-question 요청을 *수용*하는지에 의존 |

## Open Questions
[../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md)에서 추적:
- **wbq-001:** 어떤 TTT variant가 fast-weight delta만이 아니라 optimizer state를 *실제로* write back하는가
  (Titans / LaCT / TTT-E2E가 다름)? `TODO(open-question)`
- **wbq-002:** CAW-01이 "rough traffic"을 방향성 read/write rollup + endurance rollup으로 분리해야 하는가? (CAW-01에 대한
  export 요청 — 그들의 결정.) `TODO(open-question)`
- **wbq-003:** CAW-01의 모델에서 `near_mem`은 residency *tier*인가 *op 속성*(compute-at-write)인가? `TODO(open-question)`
- **wbq-004:** 실제 TTT 워크로드가 어떤 그럴듯한 tier에든 write-endurance 압력을 만드는가, 아니면 endurance가
  DRAM/HBM residency에 대해 비이슈인가? `TODO(open-question)`
- **wbq-005:** `reuse_distance_tokens`를 CAW-01 tensor lifetime처럼 DAG 순회로 도출할 수 있는가, 아니면 정적
  그래프에 없는 update-frequency 메타데이터가 필요한가? `TODO(open-question)`
- **wbq-006:** modeled `write_bw`가 긴 context에서 read bandwidth를 초과하는 일이 있는가 — 즉 writeback 축이
  언젠가 병목인가, 아니면 항상 2차적인가? (전체 브리지를 정당화하는 hypothesis.) `TODO(open-question)`

## 런북에 대한 함의
- **RB (schema):** 필수 `provenance` + `uncertainty` + `basis`를 갖춘 `wbtraffic.v0`(JSON + markdown 카드)을
  구현, 모든 수치는 `null`로 기본 설정.
- **RB (analytic estimator):** variant의 fast-weight param count, dtype, optimizer, chunk size가 주어지면 →
  `bytes_per_update`, `write_bw`, `ratio_curve`를 계산하고, 모든 `assumption`을 방출. Acceptance: 결정적 +
  가정 나열.
- **RB (`Caw01WritebackAdapter`):** 아티팩트를 L0-shaped 객체 + open-question 목록으로 명시적 파일 경계를
  가로질러 직렬화; 직렬화 시점에 CAW-01 객체 이름 재검증; 공유 저장소/레지스트리를 결코 가정하지 않음.
- **RB (one toy reproduction, Option B):** [ledger](./experiment-ledger_ko.md)를 통해 단일 variant의
  `bytes_per_update`를 측정; 실패는 일급 부정적 결과로 기록; measured vs modeled 플래그.

> **재검토 트리거:** 어떤 아티팩트가 modeled 수치를 `supported`로 export하거나, 스키마 셀을 확정된 CAW-01
> workload 요구사항으로 단언하면, 멈춰라 — "hypothesis, with provenance, not a premise"라는 load-bearing
> 불변식이 깨지고 있다.
> 독립성 상기: CAW-01은 **별개의 제품**이다; 이것은 export 경계이지 공유 기반이 아니다.
