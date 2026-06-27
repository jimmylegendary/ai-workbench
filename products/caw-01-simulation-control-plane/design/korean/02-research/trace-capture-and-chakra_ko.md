# 트레이스 캡처 & Chakra 파이프라인

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [data-layer-options](./data-layer-options_ko.md), [ADR-0005 트레이스 파이프라인](../01-decisions/ADR-0005-trace-pipeline_ko.md), [L0 IR 스키마](../05-caw01-simulation-control-plane/l0-ir-schema_ko.md), [SOURCE-BRIEF](../_meta/SOURCE-BRIEF_ko.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## 목적(Purpose)

이 문서는 torch 계층 아래에서 실행 트레이스를 캡처하고, 그것을 ASTRA-sim이 시뮬레이션할 수 있으며 워크벤치가
메모리 주석 L0 IR로 정규화할 수 있는 형태로 변환하는 *기술적 메커니즘*을 설명한다. `syntorch`가 "모든
sub-torch 트레이스를 캡처하는 drop-in torch 프론트엔드"이고 그것을 "Chakra 익스포터 계층"을 통해 변환한다는
SOURCE-BRIEF의 주장을 근거 짓는다. 다루는 내용: (1) PyTorch 연산을 어떻게 가로챌(intercept) 수 있는가,
(2) Chakra 실행 트레이스(ET) 스키마와 컨버터/피더(feeder) 툴체인, (3) 실측 축을 위한 OTel 트레이스 형태,
그리고 (4) 각 단계가 운반하는 데이터를 동반한 단계별 파이프라인 `capture -> normalize -> Chakra ET ->
ASTRA-sim`.

이 문서는 저장 기술을 결정하지 **않고**([data-layer-options](./data-layer-options_ko.md) 참조), 전체 L0/L1/L2
스키마를 정의하지 **않으며**([l0-ir-schema](../05-caw01-simulation-control-plane/l0-ir-schema_ko.md) 참조),
SOURCE-BRIEF 너머의 `syntorch` 내부를 지어내지 **않는다**. *통합 경계* 결정은
[ADR-0005](../01-decisions/ADR-0005-trace-pipeline_ko.md)에 안착한다.

---

## 1. PyTorch를 어디서 가로챌 수 있는가 (캡처 계층)

"sub-torch 트레이스를 캡처하는 drop-in torch 프론트엔드"는 *모든* 텐서 연산을 볼 수 있을 만큼 낮으면서도
의미(연산 이름, shape, dtype, collective 유형)를 유지할 만큼 높은 수준에서 PyTorch에 후킹해야 한다. PyTorch는
여러 가로채기 지점을 제공하며, 각각 고도(altitude)가 다르다:

| 메커니즘 | 고도 | 보는 것 | syntorch를 위한 트레이드오프 |
|---|---|---|---|
| `torch.fx` symbolic trace | Python 모듈 그래프 | `call_function`/`call_module` 노드, *정적* 그래프 | 데이터 의존 제어 흐름을 놓침; ShapeProp 없이는 실제 shape 없음; eager 아님. 정적 그래프 내보내기에 좋고, 서빙에는 약함. |
| `__torch_function__` (subclass / `TorchFunctionMode`) | 공개 Python API (`torch.*`, `nn.functional.*`) | 분해(decomposition) 이전의 고수준 호출 | `F.scaled_dot_product_attention`을 그 아래의 aten 프리미티브가 아니라 하나의 연산으로 봄. 메모리 트래픽에는 너무 거침. |
| `__torch_dispatch__` (`TorchDispatchMode`, tensor subclass) | **aten/dispatcher 수준** | 디스패치된 모든 `aten::*` 연산(예: `aten.addmm`, `aten.t`), factory 함수 포함 | 분해 이후의 "진짜" 연산 스트림; 구체적 shape/dtype/stride를 읽을 수 있음. sub-torch 캡처에 자연스러운 고도. |
| PyTorch **ExecutionTraceObserver** (PARAM/Chakra 경로) | aten dispatcher, 네이티브 C++ 옵저버 | 입출력 텐서 메타데이터, ID, parent/child + 제어 deps를 갖춘 연산 그래프; collectives 메타데이터 | *Chakra-연결 가능한 ET 방출*을 위해 목적 제작됨. 공개 Chakra 툴체인의 레퍼런스 캡처 경로. |
| Kineto / `torch.profiler` | CUPTI / 디바이스 타임라인 | GPU 커널 지속시간, CUDA 런타임, *타이밍*을 갖춘 comm 커널 | 연산별 실제 wall-clock 제공; ET와 병합되어 `start_time`/`duration` 추가. |

**빌더를 위한 핵심 구분:** `__torch_function__`은 *프론트엔드* API(vLLM 코드가 호출하는 것)이고;
`__torch_dispatch__`는 그 *아래*, PyTorch가 핵심 `aten` 연산으로 분해/재디스패치한 이후이다. SOURCE-BRIEF는
syntorch가 "vLLM의 torch 계층과 동일하게 사용되는" 프론트엔드이지만 "torch 아래의 모든 것이 맞춤형"이라고
말한다. 그것은 이 2계층 현실에 깔끔하게 매핑된다: syntorch는 vLLM이 기대하는 동일한 `torch.*` /
`__torch_function__` 표면을 제시하고, 그 아래에 자신의 구현(과 트레이스 레코더)을 치환한다 — 정확히
`__torch_dispatch__` / 맞춤 dispatcher가 앉을 곳이다. syntorch는 프론트엔드 아래의 모든 것을 *소유*하므로,
PyTorch의 eager dispatcher에 국한되지 않는다: 연산 스트림에 더해 자신의 맞춤 커널/tiling/partitioning 결정
(stock `TorchDispatchMode`로는 합성할 수 없는 것)을 기록할 수 있다.

### 캡처가 연산별로 기록해야 하는 것

메커니즘에 관계없이, Chakra와 L0 IR 둘 다에 공급하려면 캡처된 각 연산은 다음이 필요하다:

- **identity**: 안정적 연산 id, 연산 이름(`aten::matmul`, collective 이름, 맞춤 syntorch 커널 id).
- **dependencies**: 어떤 이전 연산이 그 입력을 생산했는지(data deps)와 순서/제어 deps.
- **tensor IO**: 입력/출력별 — shape, dtype, 요소 수 → **바이트**(메모리 주석의 기반).
- **op class**: compute / memory-load / memory-store / point-to-point comm / collective comm.
- **comm metadata** (comm인 경우): collective 유형, 바이트 단위 메시지 크기, process group / 참여자.
- **timing** (합성이 아니라 측정된 경우): start + duration, Kineto/디바이스로부터.
- **syntorch 전용**: 대상 맞춤 HW에서 그 연산에 대해 선택된 명시적 tiling/partitioning **strategy id**(SOURCE-BRIEF §7.2에 따라). 이것이 "지어지지 않은 디바이스 가정을 실행 가능하게" 만드는 것이다.

> `TODO(open-question: does syntorch capture at __torch_dispatch__ granularity, at a custom dispatcher below it, or via its own recorder? The SOURCE-BRIEF only says "all traces below torch are captured." Confirm before fixing the exporter contract in ADR-0005.)`

---

## 2. Chakra 실행 트레이스(ET) — 교환 스키마

[Chakra](https://github.com/mlcommons/chakra)는 분산 AI 워크로드의 MLCommons 표준 그래프 표현이다. 그것은
노드가 compute / communication / memory 연산이고 간선이 data + control 의존성인 **DAG**이다. ASTRA-sim
2.0+는 Chakra ET를 주요 워크로드 입력으로 채택했다([ASTRA-sim 문서](https://astra-sim.github.io/astra-sim-docs/workload-layer/overview.html)).

### 2.1 노드 스키마 (`et_def.proto`)

Chakra protobuf 스키마에서, `NodeType`은 다음을 열거한다:

| NodeType | 의미 | ASTRA-sim에서 매핑되는 곳 |
|---|---|---|
| `METADATA_NODE` | 그래프/전역 메타데이터 | 설정(setup), 시뮬레이션되는 작업 아님 |
| `MEM_LOAD_NODE` / `MEM_STORE_NODE` | (원격/로컬) 메모리 이동 | 메모리 트래픽 사이클 |
| `COMP_NODE` | compute 연산 (예: GEMM, elementwise) | compute roofline (FLOPs/cycles) |
| `COMM_SEND_NODE` / `COMM_RECV_NODE` | point-to-point comm | 네트워크 계층 P2P |
| `COMM_COLL_NODE` | collective comm | 네트워크/시스템 collective 모델 |
| `INVALID_NODE` | 센티넬 | — |

각 `Node`는 다음을 운반한다: `id` (uint64), `name`, `type`, `ctrl_deps` (repeated uint64), `data_deps`
(repeated uint64), `start_time_micros`, `duration_micros`, `inputs`/`outputs` (텐서 IO 정보), 그리고 `attr`
(repeated `AttributeProto` — 타입이 있는 key/value, 스칼라 또는 임의의 numeric/bool/string/bytes의 리스트).

`attr`에 운반되는 표준 속성에는 다음이 포함된다(이름은 Chakra 스키마/툴링에 따름): `is_cpu_op`, `num_ops`
(compute의 연산/FLOP 수), `tensor_size`, 그리고 collectives의 경우 `comm_type`(`CollectiveCommType` enum 중
하나: `ALL_REDUCE`, `REDUCE`, `ALL_GATHER`, `GATHER`, `SCATTER`, `BROADCAST`, `ALL_TO_ALL`,
`REDUCE_SCATTER`, `REDUCE_SCATTER_BLOCK`, `BARRIER`), `comm_size`(와이어 상의 바이트), 그리고
process-group 라우팅을 위한 `comm_priority`/`pg_name`.

### 2.2 Chakra ET가 의도적으로 운반하지 **않는**것

- 메모리 계층(tier) 거주(residency)나 계층별 이동 바이트 없음(그것은 우리 IR의 L1).
- 커널 수준 tiling 스케줄 / 커널 내(intra-kernel) 재사용 없음(그것은 L2).
- 일급 디바이스/토폴로지 명세 없음 — 토폴로지는 ET가 아니라 ASTRA-sim의 *system* + *network* config에 산다.

이것이 중요하다: **Chakra ET ≈ 우리의 L0**(연산 그래프 + 텐서 크기 + 의존성 + comm 바이트). L1/L2는 워크벤치가
그 위에 쌓는 더 풍부한 주석으로, syntorch의 맞춤 커널 지식과 HW 설계 계층에서 출처를 가진다 — 그것들은 stock
Chakra로 표현 불가능하며, proto에 억지로 넣는 대신 IR 확장으로 운반되어야 한다.

### 2.3 공개 컨버터 / 피더 툴체인

레퍼런스(비-syntorch) 경로는 우리가 모방하는 형태의 증명이다:

1. **Collect** — PyTorch `ExecutionTraceObserver`가 호스트 ET(연산 그래프, deps, 텐서 IO)를 방출;
   `torch.profiler`/Kineto가 디바이스 트레이스(커널 타이밍)를 방출.
2. **`chakra_trace_link`** — 호스트 ET + Kineto 디바이스 트레이스를 병합하여 GPU 커널 지속시간이 올바른 ET
   연산에 부착되도록 함(실제 타이밍을 그래프에 인코딩).
3. **`chakra_converter`** — 병합된 JSON을 받아 의존성을 해소/인코딩하고, Chakra ET를 **protobuf**로 방출,
   보통 rank당 한 파일(예: `chakra.<rank>.et`).
4. **`et_feeder`** — `.et` 파일을 파싱하고 시뮬레이터에 **의존성-없는 노드**(deps가 만족된 노드)를 건네는 C++
   라이브러리, 그 후 시뮬레이션이 시간을 진행함에 따라 그것들을 은퇴(retire)시키고 후속(successor)을 해제.

출처: [Chakra USER_GUIDE](https://github.com/mlcommons/chakra/blob/main/USER_GUIDE.md), [trace-link/merge 가이드](https://github.com/mlcommons/chakra/wiki/Chakra-Execution-Trace-Collection-%E2%80%90-A-Comprehensive-Guide-on-Merging-PyTorch-and-Kineto-Traces).

### 2.4 ASTRA-sim이 그것을 어떻게 수집하는가

ASTRA-sim의 **workload layer**는 `et_feeder`를 사용하여 DAG를 순회한다: 의존성-없는 노드를 끌어오고, 각각에
대해 유형별로 라우팅한다 — `COMP_NODE` → compute 모델(설정된 roofline에 대해 `num_ops`로부터 사이클),
`COMM_COLL_NODE` → system+network 계층(`comm_type`/`comm_size`를 사용하여 토폴로지 위에서 collective 알고리즘),
`MEM_*` → 메모리 트래픽 사이클. 노드가 완료되면(시뮬레이션된 사이클 이후) 그 의존자들이 자격을 얻는다.
토폴로지, 링크 대역폭, collective 알고리즘은 ET가 **아니라** ASTRA-sim의 별도 system/network config에서
온다. ([ASTRA-sim workload layer](https://astra-sim.github.io/astra-sim-docs/workload-layer/overview.html); [ASTRA-sim × Chakra MICRO-2024 튜토리얼](https://astra-sim.github.io/tutorials/micro-2024)).

---

## 3. syntorch의 "Chakra 익스포터 계층"이 앉는 곳

```
   vLLM (unchanged serving code)
        │  calls torch.* exactly as before
        ▼
   ┌──────────────────────────────────────────────┐
   │  syntorch  (drop-in torch FRONTEND)           │  ← same API surface as torch
   │   ├─ custom kernels / HW logic (below torch)  │  ← "custom everything below"
   │   ├─ explicit tiling/partitioning strategy ids│
   │   └─ sub-torch TRACE RECORDER                 │  ← captures op stream + tensor IO + comm + strategy id
   └──────────────────────────────────────────────┘
        │  raw sub-torch trace (syntorch-native)
        ▼
   ┌──────────────────────────────────────────────┐
   │  Chakra EXPORTER LAYER  (syntorch tooling)    │  ← converts raw trace → Chakra ET (.et protobuf)
   └──────────────────────────────────────────────┘
        │  Chakra ET (per rank)
        ▼
   ASTRA-sim (+ SST)   ── via et_feeder ──►  cycles/metrics
```

익스포터 계층은 `chakra_trace_link` + `chakra_converter`의 syntorch-소유 유사물(analogue)이다: syntorch의
네이티브 연산 레코드를 Chakra `NodeType` 분류 체계와 속성 이름에 매핑하여, ASTRA-sim의 기존 피더가 변경 없이
수집하도록 한다. 결정적으로, syntorch는 선택된 tiling/partitioning과 맞춤 HW 구조(Canvas 3)도 *알기* 때문에,
익스포터는 측정된 GPU 실행이 아니라 **제1원리(first principles) / 합성 실행**으로부터 compute `num_ops`,
memory `tensor_size`, collective `comm_size`를 채울 수 있다 — 이것이 정확히 SOURCE-BRIEF의 "합성 실행 축"이다.
동일한 연산 레코드는 proto에 맞지 않는 추가 L1/L2 주석도 운반한다; 그것들은 `.et` 파일을 통해서가 아니라 연산
id로 키가 지정된 사이드 채널을 통해 IR로 흐른다.

> `TODO(open-question: does syntorch emit standard Chakra .et protobuf directly, or a syntorch-native trace that a separate exporter converts? "exporter layer" implies the latter; confirm the boundary in ADR-0005 so the workbench reads a stable artifact.)`
> `TODO(open-question: per-rank file convention and whether syntorch encodes process groups/topology hints the way PyTorch-distributed ET does.)`

---

## 4. 실측 축: OTel 트레이스 형태

실측 축([SOURCE-BRIEF §8](../_meta/SOURCE-BRIEF_ko.md))은 실제 서빙 인프라로부터 **OpenTelemetry** 트레이스로
온다 — Chakra와는 근본적으로 다른 형태이다. OTel은 세밀한 연산 DAG가 아니라 **spans**의 트리(요청 →
하위 연산)이다.

각 OTel span은 다음을 운반한다([OTel traces spec](https://opentelemetry.io/docs/concepts/signals/traces/)):
`trace_id` (16 바이트), `span_id` (8 바이트), `parent_span_id`, `name`, `span_kind`
(Server/Client/Internal/Producer/Consumer), `start_time`/`end_time` (ns), `status`, `attributes` (타입이 있는
k/v), 그리고 `events`(타임스탬프가 찍힌 인라인 마커).

LLM 서빙의 경우, **GenAI semantic conventions**([OTel GenAI spans](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/))가
속성을 표준화한다: `gen_ai.operation.name`, `gen_ai.request.model`, `gen_ai.provider.name`,
`gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`, `gen_ai.response.finish_reasons`. 이들은 지연,
토큰 수, 모델 정체성에 대한 요청별 *그라운드 트루스*를 준다.

### OTel vs Chakra — 정규화 간극

| 측면 | OTel (실제) | Chakra ET (합성/시뮬레이션) |
|---|---|---|
| 입도 | 요청 / 단계(phase) spans (거침) | 연산별 DAG (세밀) |
| 시간 | 실제 wall-clock ns | sim 사이클, 또는 Kineto 연결 시 측정된 µs |
| 구조 | span 트리 (parent_span_id) | DAG (data_deps + ctrl_deps) |
| 메모리/comm 바이트 | 네이티브 아님 (도출/계측 필요) | 명시적 (`tensor_size`, `comm_size`) |
| 강점 | 신뢰 앵커 / 검증 | 지어지지 않은 HW에 대한 what-if |

OTel은 ASTRA-sim에 *공급될* 수 없다; 대신 그것은 **신뢰 사다리 앵커**이다(SOURCE-BRIEF §1): 동일한 워크로드의
syntorch/Chakra 투영은 실제 하드웨어(예: A100)에서 OTel-측정된 지연/토큰과 화해(reconcile)해야 한다. 따라서
정규화 단계는 축들을 **agent-turn / 요청 수준**(Canvas 1의 단위)에서 정렬한다 — OTel spans와 Chakra-도출 연산
그래프를 *동일한 워크로드 정체성*에 매핑하여, 내부 입도가 다르더라도 메트릭이 비교 가능하게 한다.

---

## 5. 단계별 파이프라인과 각 단계가 운반하는 데이터

```
[CAPTURE] ─► [NORMALIZE] ─► [CHAKRA ET] ─► [ASTRA-sim (+SST)] ─► [METRICS] ─► [L0 IR fill]
   ▲ syntorch     ▲ workbench     ▲ exporter      ▲ feeder            ▲              ▲
   └ OTel (real)  └ align by workload identity (agent turn / request)
```

| 단계 | 입력 | 변환 | 출력 (운반 데이터) |
|---|---|---|---|
| **1. Capture (합성)** | syntorch 프론트엔드를 갖춘 vLLM 실행 | drop-in 프론트엔드 아래의 sub-torch 연산 레코더 | 원시 연산 스트림: 연산 id, 이름, op-class, 텐서 IO (shape/dtype→바이트), data/ctrl deps, comm 유형+크기, tiling/partition **strategy id** |
| **1'. Capture (실제)** | 실제 서빙 인프라 | OTel SDK / GenAI 계측 | span 트리: trace/span/parent id, 타이밍(ns), `gen_ai.*` 속성, 지연, 토큰 |
| **2. Normalize** | 원시 연산 스트림 + OTel spans | 둘 다를 하나의 **워크로드 정체성**(= 하나의 agent turn / 요청, Canvas 1)에 바인딩; 바이트/시간 단위 정규화; 안정적 연산 id 부여 | 정규(canonical) 연산 그래프(합성) + 측정된 요청 프로파일(실제), 동일한 `WorkloadModel`에 키 지정 |
| **3. Chakra ET 내보내기** | 정규화된 합성 연산 그래프 | `NodeType` + 속성 이름에 매핑; deps 인코딩; rank별 protobuf 작성 | `chakra.<rank>.et`: COMP/COMM/MEM 노드, `data_deps`/`ctrl_deps`, `num_ops`, `tensor_size`, `comm_type`/`comm_size` |
| **4. ASTRA-sim (+SST)** | `.et` 파일 + system/network/memory config | `et_feeder`가 의존성-없는 노드 발행; compute/network/memory 모델이 사이클 진행; 상세 메모리/네트워크에는 SST | 노드별 및 집계 사이클, 지연, comm 시간, 대역폭/점유, 용량 피크 |
| **5. Metrics → IR** | sim 메트릭 + OTel 측정 프로파일 + 캡처된 텐서/strategy 데이터 | 축 화해; 메모리 주석 | `Metric`/`ResultSet`의 행; **메모리 주석 L0 IR** 채워짐 |

### 모든 축이 메모리 주석 L0 IR로 어떻게 정규화되는가

L0는 (SOURCE-BRIEF §1) **연산 수준 그래프 + 텐서 크기/수명 → 용량 피크 + 대략적 트래픽**으로 정의된다. 그것은
Chakra ET 내용에 텐서 *수명*을 더한 것과 거의 정확히 같다:

- **그래프 토폴로지** → `TensorNode`들(연산 출력 텐서 / 연산당 하나)과 `DataMovementEdge`들은 Chakra
  `data_deps`/`ctrl_deps`에서 직접 온다.
- **텐서 크기** → 캡처된 `inputs`/`outputs` shape×dtype(= `tensor_size`)에서.
- **텐서 수명** → DAG를 순회하여 도출: 연산 순서에 걸친 first-write에서 last-read까지의 범위. (Chakra는 수명을
  저장하지 않음; 워크벤치가 의존성 그래프로부터 그것을 계산 — 이것이 L0가 원시 ET 너머에 추가하는 "주석"이다.)
- **용량 피크** → 스케줄에 걸쳐 동시에 살아있는(live) 텐서 바이트의 최대치.
- **대략적 트래픽** → `comm_size`(collectives/P2P) + `MEM_*` 이동의 합.

세 축은 이 단일 스키마로 수렴한다:
- **합성 (syntorch→Chakra)**은 L0를 구조적으로 채우며 *주요(primary)* L0 원천이다(명시적 바이트 + strategy id를
  가짐).
- **시뮬레이션 (ASTRA-sim)**은 동일한 노드의 *타이밍/경합(contention)* 필드를 채운다("대략적 트래픽"을
  사이클 정확 트래픽으로 전환; 메모리 계층 config가 부착되면 L1 이동 바이트를 가능하게).
- **실제 (OTel)**는 연산별 L0 노드를 채우지 않는다; 워크로드 정체성 수준에서 **검증 증거**로 부착된다 —
  L0-도출 투영이 신뢰되기 전 신뢰 사다리 내에서 일치해야 하는 측정된 지연/토큰.

L0/L1/L2가 "다른 완전성의 동일한 스키마"이므로(SOURCE-BRIEF §1), 파이프라인은 결코 스키마를 전환하지 않는다:
Chakra가 L0를 채우고; ASTRA-sim + 메모리 계층 config가 L1을 향해 깊어지고(계층별 거주/이동); syntorch의 맞춤
커널/tiling 지식이 Chakra proto에 맞지 않는 사이드 채널 주석을 통해 L2를 향해 깊어진다(tiling 스케줄, 커널 내
재사용).

---

## 6. 빌더가 존중해야 할 트레이드오프

| 결정 | 옵션 A | 옵션 B | 기울기(Lean) |
|---|---|---|---|
| 캡처 고도 | `__torch_dispatch__`/맞춤 dispatcher (세밀, 진짜 바이트) | `torch.fx` 정적 그래프 (저렴하나 동적 shape 없음) | A — 서빙은 동적; 바이트를 위해 실제 shape 필요 |
| 익스포터 대상 | 표준 Chakra `.et`를 직접 방출 | syntorch-네이티브 방출, 익스포터에서 변환 | SOURCE-BRIEF 표현("exporter layer")에 따라 B; ASTRA-sim 계약을 안정적으로 유지 |
| L1/L2 주석 | Chakra `attr`에 억지로 넣음 | 연산 id로 키 지정된 사이드 채널로 IR에 | 사이드 채널 — 교환 표준을 오염시키지 말 것 |
| OTel 역할 | 시뮬레이터에 공급 | 검증 앵커로만 | 앵커로만 — 입도 불일치로 수집이 무의미 |
| 공개 툴체인 재사용 | `chakra_converter`/`et_feeder` 포크 | syntorch 전용 익스포터를 처음부터 작성 | `et_feeder`/proto 재사용 (ASTRA-sim이 이미 그것을 말함); *앞단*(캡처+내보내기)만 syntorch-고유 |

---

## 미해결 질문(Open Questions)

([`08-research-plan/open-questions.md`](../08-research-plan/open-questions_ko.md)에 반영하라.)

1. syntorch는 어느 고도에서 캡처하는가 — `__torch_dispatch__`, 그 아래의 맞춤 dispatcher, 또는 자체 레코더? 익스포터 계약을 결정한다.
2. syntorch는 표준 Chakra `.et` protobuf를 직접 방출하는가, 아니면 네이티브 트레이스 + 별도 익스포터인가? 브리프는 "exporter layer"라고 함(후자를 함의) — 워크벤치를 위한 안정적 아티팩트 경계를 확인하라.
3. syntorch ET의 rank별 파일/process-group 관례, 그리고 토폴로지 힌트가 PyTorch-distributed ET처럼 인코딩되는지 여부.
4. L0를 위해 텐서 **수명**은 어떻게 계산되는가 — 순전히 DAG 의존성 순회로부터인가, 아니면 syntorch가 allocation/free 이벤트를 직접 방출하는가?
5. 통합 대상이 되는 Chakra 스키마 버전 / `et_def.proto` 리비전은 무엇인가(스키마는 MLCommons 아래에서 여전히 진화 중)? ADR-0005에서 고정하라.
6. 실제 축의 경우, vLLM을 OTel GenAI semantic conventions로 기본 제공(out-of-the-box) 계측하는가, 아니면 단계별(prefill/decode) 입도를 얻기 위해 맞춤 span 계측이 필요한가?
7. 메모리 계층 상세(L1 이동 바이트)를 위해 SST는 ASTRA-sim에 대해 어디에 부착되며, 어떤 config가 Canvas 3로부터 메모리 계층 구조를 운반하는가?

## 런북에 대한 함의

- **RB(phase: trace pipeline)** — capture→export→feeder→ASTRA-sim 툴체인 구현: Chakra 스키마 설치/고정, 어떤 syntorch 배선 이전에 `et_feeder` + 레퍼런스 `chakra.<rank>.et` 라운드트립을 ASTRA-sim으로 세움(계약 증명).
- **RB(phase: syntorch integration)** — syntorch drop-in 프론트엔드를 vLLM 실행에 배선하고 원시 sub-torch 트레이스를 방출; syntorch 레코드 → `NodeType`/attrs를 매핑하는 Chakra 익스포터 계층 구축.
- **RB(phase: IR fill)** — Chakra-ET → L0 IR 로더(`TensorNode`/`DataMovementEdge`), 텐서-수명 계산, 용량-피크 + 트래픽 롤업 구현; ASTRA-sim 메트릭과 OTel 검증 증거를 동일한 `WorkloadModel`에 부착.
- **RB(phase: real axis)** — 실측 경로의 OTel GenAI 계측과 신뢰 사다리에 사용되는 워크로드-정체성 정렬.
- 위의 모든 것은 [ADR-0005](../01-decisions/ADR-0005-trace-pipeline_ko.md)(통합 경계)에 의해 게이팅되며 [l0-ir-schema](../05-caw01-simulation-control-plane/l0-ir-schema_ko.md)에 공급된다.

## 출처(Sources)

- [MLCommons Chakra repo](https://github.com/mlcommons/chakra) 및 [USER_GUIDE](https://github.com/mlcommons/chakra/blob/main/USER_GUIDE.md)
- [Chakra ET 수집: PyTorch + Kineto 병합](https://github.com/mlcommons/chakra/wiki/Chakra-Execution-Trace-Collection-%E2%80%90-A-Comprehensive-Guide-on-Merging-PyTorch-and-Kineto-Traces)
- [Chakra 논문 (arXiv:2305.14516)](https://arxiv.org/pdf/2305.14516)
- [ASTRA-sim workload layer](https://astra-sim.github.io/astra-sim-docs/workload-layer/overview.html), [ASTRA-sim × Chakra MICRO-2024](https://astra-sim.github.io/tutorials/micro-2024)
- [What and Why is `__torch_dispatch__`](https://dev-discuss.pytorch.org/t/what-and-why-is-torch-dispatch/557), [TorchDispatchMode](https://dev-discuss.pytorch.org/t/torchdispatchmode-for-debugging-testing-and-more/717), [DebugMode tutorial](https://docs.pytorch.org/tutorials/recipes/debug_mode_tutorial.html)
- [OTel traces](https://opentelemetry.io/docs/concepts/signals/traces/), [OTel GenAI spans](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/)
