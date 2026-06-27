# ADR-0005: 트레이스 파이프라인 — syntorch 캡처 → Chakra exporter → ASTRA-sim, L0 IR로 정규화

- Status: proposed
- Owner: Jimmy
- Last-reviewed: TODO
- Related:
  - Research: [serving-and-simulation-frameworks](../02-research/serving-and-simulation-frameworks_ko.md), [trace-capture-and-chakra](../02-research/trace-capture-and-chakra_ko.md)
  - [ADR-0001 제품 표면(Product surface)](./ADR-0001-product-surface_ko.md) (TS⇆Python 경계, 엔진 포트)
  - [ADR-0002 데이터 계층(Data layer)](./ADR-0002-data-layer_ko.md) (artifact/IR가 저장되는 위치)
  - [ADR-0004 캔버스 렌더링(Canvas rendering)](./ADR-0004-canvas-rendering_ko.md) (C1 노드 ↔ L0 IR; C3 HW 구성 → ASTRA-sim)
  - [l0-ir-schema](../05-caw01-simulation-control-plane/l0-ir-schema_ko.md)
  - [open-questions](../08-research-plan/open-questions_ko.md)
- Source of truth: [../_meta/SOURCE-BRIEF.md](../_meta/SOURCE-BRIEF_ko.md)

## 목적

트레이스 파이프라인의 **통합 경계(integration boundaries)**를 결정한다. 즉 syntorch가 어디에서 캡처하는지, Chakra
exporter가 무엇을 방출하는지, ASTRA-sim(+SST)이 그것을 어떻게 소비하는지, 그리고 세 가지 증거 축(실측 OTel / 합성
syntorch→Chakra / 시뮬레이션 LLMServingSim+ASTRA-sim)이 모두 **어떻게 동일한 메모리 주석(memory-annotated) L0 IR로
정규화되는지**를 결정한다 (SOURCE-BRIEF §1, §8). 이 ADR은 전체 L0/L1/L2 스키마를 정의하지 **않으며**(그것은
[l0-ir-schema](../05-caw01-simulation-control-plane/l0-ir-schema_ko.md)), 저장소 기술
([ADR-0002](./ADR-0002-data-layer_ko.md))이나 TS⇆Python 경계의 프로세스/전송 메커니즘
([ADR-0001](./ADR-0001-product-surface_ko.md))도 정의하지 않는다. 이 문서는 **각 경계에서의 계약(contract)**을 고정한다.

## 배경

- brief의 파이프라인 `input feeder -> LLMServingSim -> syntorch -> ASTRA-sim (+ SST)`는 네 개의
  계층에 걸쳐 있으며, 각 계층은 하나의 도구가 담당한다: 서빙 동역학(vLLM 실측 / LLMServingSim 시뮬레이션), torch 아래
  실행(**syntorch**), 분산 시스템 타이밍(**ASTRA-sim**), 그래프 교환 포맷(**Chakra ET**). 이들은 **누적(stack)**되는
  것이지 서로 대체재가 아니다.
- **syntorch** (SOURCE-BRIEF §7)는 torch를 대체하는 drop-in *프런트엔드*로, torch *아래의* 모든 것(커널, HW 로직,
  **명시적 전략 id로서의 타일링/파티셔닝**)을 커스텀하며, vLLM 안에서 torch 대신 설치되고 **Chakra exporter 계층**을
  갖는다. §7을 넘어서는 내부 구현은 **날조해서는 안 된다**.
- **Chakra ET**는 ASTRA-sim 2.0+가 `et_feeder`를 통해 소비하는 MLCommons 표준 DAG이다. COMP/COMM/MEM 노드,
  `data_deps`/`ctrl_deps`, `num_ops`, `tensor_size`, `comm_type`/`comm_size`를 담지만,
  **메모리 계층 상주 정보(L1)도, 타일링 스케줄(L2)도, 디바이스/토폴로지도 담지 않는다**(토폴로지는 ASTRA-sim의
  system/network config에 존재한다).
- **Chakra ET ≈ 우리의 L0**이지만, L0는 추가로 **텐서 수명(tensor lifetime)**(용량 피크 산정용)도 필요로 하는데 Chakra는
  이를 저장하지 않는다. L1/L2는 더 풍부한 주석으로 proto에 **들어맞지 않는다**.
- **OTel**(실측 축)은 op DAG가 아니라 거친 span 트리(요청/단계)이며, ASTRA-sim에 입력될 수 없다.
- **긴장 관계:** brief의 `LLMServingSim -> syntorch -> ASTRA-sim` 순서는 **LLMServingSim이 이미 수정된 ASTRA-sim을
  내장하고 있다**는 사실과 충돌한다.
- TS 측은 torch 하위 내부를 절대 파싱하지 않으며, 엔진은 포트 뒤의 Python이다
  ([ADR-0001](./ADR-0001-product-surface_ko.md)); 큰 artifact는 경로(path)로서 경계를 넘는다
  ([ADR-0002](./ADR-0002-data-layer_ko.md)).

## 검토한 선택지

| 경계 결정 | 옵션 A | 옵션 B | 선택 |
|---|---|---|---|
| **캡처 고도(Capture altitude)** | 프런트엔드 아래의 `__torch_dispatch__` / 커스텀 디스패처 — 실제 `aten` 수준 op 스트림, 구체적 shape/dtype→바이트, 그리고 syntorch 고유의 커널/타일링/전략 id를 본다 | `torch.fx` 정적 그래프 — 저렴하지만 동적 shape가 없다 | **A** — 서빙은 동적이며, 바이트 산정을 위해 실제 shape가 필요하다; syntorch가 torch 아래를 소유하므로, 일반 디스패처가 합성할 수 없는 op 스트림 + 전략 id를 기록한다 |
| **Exporter 대상** | 표준 Chakra `.et`를 직접 방출 | syntorch 네이티브 트레이스를 방출 후 전용 **exporter 계층**에서 변환 | **B** — SOURCE-BRIEF §7.4 문구와 일치; ASTRA-sim 계약을 안정적으로 유지; 워크벤치는 하나의 안정적 artifact를 읽는다 |
| **L1/L2 주석** | Chakra `attr`에 강제로 넣음 | **op id를 키로 하는 사이드 채널(side-channel)**로 IR에 넣음 | 사이드 채널 — 교환 표준을 절대 오염시키지 않는다 |
| **OTel 역할** | 시뮬레이터에 입력 | **검증 앵커(validation anchor) 전용** | 앵커 — 입도(granularity) 불일치로 인해 입력은 무의미하다 |
| **공개 툴체인 재사용** | 전부 fork | **`et_feeder` + `et_def.proto` 재사용**; 캡처+export만 syntorch 고유 | 재사용 — ASTRA-sim은 이미 Chakra를 이해한다 |
| **LLMServingSim 대 syntorch** | 지금 당장 `LLMServingSim -> syntorch -> ASTRA-sim`을 문자 그대로 재연결 | 축들을 **하나의 L0로 수렴하는 병렬 경로**로 실행; 루프 내 재연결은 연기 | 병렬 우선(Decision 참조) |
| **네트워크 백엔드** | 기본값으로 ns-3 / SST 고충실도 | **ASTRA-sim 분석적(analytical, Simple/Hockney) 기본값**, 충실도는 다이얼로 올림 | 분석적 기본값 — 빠른 스윕; SST/ns-3는 플래그 뒤에 |

## 결정

**torch 아래에서 캡처하고, 표준 Chakra ET로 export하고, ASTRA-sim(분석적 기본값)에서 타이밍을 산정하며, Chakra→L0
변환(lowering)을 단일 정규화 병목(waist)으로서 소유한다. OTel은 검증 앵커이며 절대 입력이 아니다. 첫 슬라이스는
`LLMServingSim -> syntorch -> ASTRA-sim`을 문자 그대로 사슬로 연결하기보다 축들을 병렬로 하나의 L0에 흘려보낸다.**

1. **캡처(합성 축):** syntorch는 drop-in 프런트엔드 아래의 **torch 하위 op 스트림**을
   `__torch_dispatch__`/커스텀 디스패처 고도에서 기록한다. op마다 다음을 기록한다: 안정적 op id, 이름,
   op 클래스(compute / mem-load / mem-store / P2P / collective), 텐서 IO(shape×dtype→**바이트**),
   data+ctrl deps, comm 유형+크기, 그리고 명시적 **타일링/파티셔닝 전략 id**.
2. **Export:** **Chakra exporter 계층**(syntorch 소유)이 네이티브 레코드를 Chakra `NodeType` + 속성 이름에
   매핑하고 **rank별 `chakra.<rank>.et` protobuf**를 쓴다 — `chakra_trace_link` + `chakra_converter`와 유사하다.
   syntorch는 선택된 타일링과 커스텀 HW 구조(Canvas 3)를 알기 때문에, 측정된 GPU 실행이 아니라 **제1원리 /
   합성 실행**으로부터 `num_ops`/`tensor_size`/`comm_size`를 채운다.
3. **L1/L2는 op id를 키로 하는 사이드 채널(확장/사이드카)에 실린다**, `.et` proto에는 싣지 **않는다**.
4. **시뮬레이션:** ASTRA-sim은 **재사용된 `et_feeder`**를 통해 `.et`를 수집한다; **분석적(Simple/
   Hockney) 백엔드가 기본 충실도 등급(default fidelity tier)**이다; **SST-Merlin / ns-3는 제어 평면의
   충실도 다이얼 뒤에서 config로 선택 가능한** 더 높은 충실도이다. Canvas 3의 HW 계층은 ASTRA-sim의
   **system/network config**(및 syntorch의 HW 로직)로 변환된다 — 하나의 HW 모델을 두 소비자가 일관되게
   유지해야 한다.
5. **정규화 → L0 IR(워크벤치 소유 병목):** 두 Chakra 생산자(합성 *및* 시뮬레이션)가 모두 공급하는
   **Chakra → L0 변환** 패스:
   - 토폴로지 → `data_deps`/`ctrl_deps`로부터 `TensorNode` + `DataMovementEdge`;
   - 텐서 크기 → 캡처된 `inputs`/`outputs`(`tensor_size`);
   - **텐서 수명** → DAG 순회(최초 write에서 최종 read까지)로 도출 — L0가 추가하는 주석;
   - 용량 피크 → 동시 생존 텐서 바이트의 최대값; 대략적 트래픽 → Σ `comm_size` + `MEM_*`.
   ASTRA-sim은 동일 노드의 **타이밍/경합(contention)** 필드를 채운다; syntorch의 커널/타일링 지식은
   **동일한 스키마**를 L1/L2 방향으로 심화한다(스키마 전환 없음 — SOURCE-BRIEF §1).
6. **OTel(실측 축)은 검증 앵커 전용이다:** OTel GenAI span(지연시간, 토큰, 모델 식별)은 op별 L0 노드가
   아니라 **워크로드 식별 수준**(에이전트 한 턴 / 요청 = Canvas 1의 단위)에 부착된다. L0에서 도출된 투영(projection)은
   신뢰되기 전 **신뢰 사다리(trust ladder)** 안에서 OTel 측정 증거와 대조 조정되어야 한다. OTel→L0의 부분성은
   버그가 아니라 의도적인 채움 수준(fill-level) 간극이다.
7. **첫 슬라이스 구성(LLMServingSim/ASTRA-sim 긴장 해소):** **축 A(시뮬레이션)** = LLMServingSim + 그 내장
   ASTRA-sim을 통과하는 요청을 실행하여 방출된 Chakra + 메트릭을 캡처; **축 B(합성)** = **얇은 vLLM 형태 하니스
   아래의 syntorch**(전체 vLLM이 아님)로 동일 모델의 forward 경로를 Chakra로 export; **두 Chakra 입력을 모두
   하나의 Chakra→L0 변환에 공급**하여 비교한다. 이는 **Chakra 병목을 두 번** 실행하며, 변동성 높은 루프 내
   `LLMServingSim -> syntorch -> ASTRA-sim` 재연결(syntorch가 LLMServingSim의 op별 비용 모델을 *대체*하는가,
   아니면 병렬로 도는가?)은 이후 슬라이스로 연기한다 — 미해결 질문으로 기록한다.
8. **버전 고정(version pinning)은 필수다:** 모든 트레이스 파이프라인 runbook은 전제 조건에 고정된 **vLLM**,
   **LLMServingSim**, **ASTRA-sim**, **Chakra `et_def.proto`** 버전을 명시한다. 우리는 vLLM 내부가 아니라
   **torch 프런트엔드 계약**에 의존한다.

## 결과(Consequences)

- **쉬워지는 것:** ASTRA-sim이 우리 ET를 변경 없이 소비한다(재사용된 feeder/proto); 합성 축이 가장 풍부한
  L0를 산출한다(명시적 바이트 + 전략 id); 분석적 기본값이 빠른 what-if 스윕을 가능하게 한다; Chakra→L0
  변환이 모든 축이 수렴하여 비교 가능한 투영을 만드는 단일 지점이다; 신뢰 사다리가 첫날부터 구체적이다(OTel이
  존재하기도 전에 두 축이 op 구조에 대해 합의해야 한다).
- **어려운 것 / 수용하는 것:** Chakra→L0 변환(수명 도출, 용량/트래픽 롤업)은 우리가 소유하는 실제 엔지니어링이다;
  L1/L2 사이드 채널은 `.et`와 키로 연결되고 일관되게 유지되어야 한다; syntorch의 실제 캡처 고도와 exporter
  방언은 미확인이다(미해결 질문이 exporter 계약을 결정한다); LLMServingSim+syntorch의 루프 내 재연결은 연기된다;
  vLLM/sim/Chakra 버전 표류는 명시적 유지보수 작업이다.
- **저장소/경계 결과:** `.et` 파일, OTel 트레이스, 원시 torch 하위 덤프는 artifact 저장소의 블롭이며 경로는
  PG에 있다([ADR-0002](./ADR-0002-data-layer_ko.md)); TS 측은 Chakra ET / IR / 메트릭을 불투명하지만 타입이
  있는 artifact로 취급한다([ADR-0001](./ADR-0001-product-surface_ko.md)); 전략 id는 산문이 아니라 식별자로서
  경계를 넘는다.

## 미해결 질문 / 재검토 트리거

1. `TODO(open-question)` 캡처 고도 — `__torch_dispatch__`인가, 그 아래의 커스텀 디스패처인가, 아니면
   syntorch 자체 레코더인가? exporter 계약을 결정한다.
2. `TODO(open-question)` syntorch가 표준 Chakra `.et`를 직접 방출하는가, 아니면 네이티브 후 exporter인가
   (brief는 후자를 암시함)? 안정적 artifact 경계를 확정하라.
3. `TODO(open-question)` rank별 파일 / process-group 관례, 그리고 syntorch가 PyTorch-distributed ET처럼
   토폴로지 힌트를 인코딩하는지 여부.
4. `TODO(open-question)` 텐서 수명 — 순수 DAG 순회인가, 아니면 syntorch가 alloc/free 이벤트를 방출하는가?
5. `TODO(open-question)` 어느 Chakra `et_def.proto` 리비전이 통합 대상인가 — 고정하라.
6. `TODO(open-question)` syntorch가 **LLMServingSim의 op별 비용 모델을 대체**하는가, 아니면 병렬 경로로
   도는가? (brief의 사슬 대 LLMServingSim의 ASTRA-sim 내장)
7. `TODO(open-question)` vLLM 대상(V0 대 V1 엔진) + syntorch가 충족하는 정확한 torch 프런트엔드 표면.
8. `TODO(open-question)` prefill/decode 입도를 위한 OTel GenAI 기본 제공 대 커스텀 span.
9. `TODO(open-question)` L1 메모리 계층 세부를 위해 SST가 ASTRA-sim에 상대적으로 어디에 부착되며, 어느
   config가 Canvas 3의 메모리 계층을 담는가.

## runbook에 대한 함의

- **phase-4-trace-pipeline** — **Chakra → L0 변환**(정규화 병목)을 위한 RB; **syntorch 캡처 + Chakra export**
  하니스(얇은 vLLM 형태 호출자 먼저)를 위한 RB; **LLMServingSim → Chakra 수집**을 위한 RB. 어떤 syntorch
  배선보다 **먼저** `et_feeder` + 참조 `chakra.<rank>.et`의 ASTRA-sim 왕복을 세워라(계약을 증명한다).
- **phase-3-simulation-engine** — **분석적 백엔드** 기본값으로 ASTRA-sim을 호출하고, SST/ns-3는 config
  플래그 뒤에 두는 RB.
- **IR 채움(fill)** — Chakra-ET → L0 로더(`TensorNode`/`DataMovementEdge`), 수명 계산, 용량 피크 + 트래픽
  롤업을 위한 RB; ASTRA-sim 메트릭 + OTel 검증 증거를 동일한 `WorkloadModel`에 부착.
- **실측 축(real axis)** — 신뢰 사다리를 위한 OTel GenAI 계측 + 워크로드 식별 정렬 RB.
- 모든 그러한 RB는 고정된 vLLM / LLMServingSim / ASTRA-sim / Chakra 버전을 명시한다; 대상은
  [l0-ir-schema](../05-caw01-simulation-control-plane/l0-ir-schema_ko.md)이며 저장은
  [ADR-0002](./ADR-0002-data-layer_ko.md)를 따른다.
