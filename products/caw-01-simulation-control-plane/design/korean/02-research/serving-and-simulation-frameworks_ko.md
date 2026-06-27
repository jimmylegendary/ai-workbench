# 서빙(Serving) & 시뮬레이션 프레임워크

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [data-layer-options](./data-layer-options_ko.md), [ADR-0005 트레이스 파이프라인](../01-decisions/ADR-0005-trace-pipeline_ko.md), [L0 IR 스키마](../05-caw01-simulation-control-plane/l0-ir-schema_ko.md), [open questions](../08-research-plan/open-questions_ko.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## 목적(Purpose)

이 문서는 SOURCE-BRIEF 파이프라인에서 이름 붙은 네 개의 공개/소유 구성 요소 — **vLLM**,
**LLMServingSim**, **ASTRA-sim (+SST)**, **Chakra ET** — 와 내부 **syntorch** 패키지를 조사하고 비교하며,
세 가지 증거 축(실측 OTel / 합성 syntorch→Chakra / 시뮬레이션 LLMServingSim+ASTRA-sim)을 단일 메모리 주석
**L0 IR**로 공급하기 위해 **이들이 어떻게 조합되는지**를 결정한다.

이 문서가 결정하는 것: (a) 어떤 도구가 어떤 계층을 모델링하며 각각이 무엇을 소비/생산하는지, (b) **첫 번째
수직 슬라이스(vertical slice)**를 위한 권장 조합, 그리고 (c) 트레이스 파이프라인 런북이 구현해야 할
**통합 경계 계약(integration-boundary contracts)**. 이 문서는 IR 스키마 자체(그것은
[L0 IR 스키마](../05-caw01-simulation-control-plane/l0-ir-schema_ko.md)), 저장 스택
([data-layer-options](./data-layer-options_ko.md)), 또는 최종 파이프라인 배선(그것은
[ADR-0005](../01-decisions/ADR-0005-trace-pipeline_ko.md))을 명세하지 **않는다**; 그 결정들이 의지할 증거를 제공한다.

---

## 1. 왜 이 넷인가 (그리고 syntorch는 어디에 들어맞는가)

파이프라인 `input feeder -> LLMServingSim -> syntorch -> ASTRA-sim (+SST)`는 네 개의 추상화 계층에 걸쳐 있고,
각 공개 도구는 정확히 하나를 소유한다:

- **요청 / 서빙 동역학** — 누가 배치(batch)에 있고, 언제, 어떤 KV-cache 풋프린트로 → **vLLM**(실제 서빙)과 **LLMServingSim**(시뮬레이션 서빙).
- **torch 프론트엔드 아래의 연산자별(per-operator) 실행** — 커널, tiling, partitioning, 텐서 크기/수명 → **syntorch**(소유; vLLM의 torch 계층을 대체).
- **분산 시스템 타이밍** — 집합 통신(collective communication), 연산, 네트워크 → **ASTRA-sim**.
- **교환 형식** — ASTRA-sim이 소비하는 연산자 + 의존성의 그래프 → **Chakra ET**.

핵심 구조적 사실: vLLM과 LLMServingSim은 서빙 계층의 *형제(siblings)*이다(하나는 실제, 하나는 시뮬레이션);
syntorch는 *vLLM의 torch 프론트엔드 아래에 앉는 것*이다; Chakra는 syntorch/LLMServingSim과 ASTRA-sim 사이의
*와이어 포맷(wire format)*이다. 이들은 서로 대안이 아니다 — 쌓인다(stack).

---

## 2. vLLM

**무엇인가.** 고처리량 LLM 추론/서빙 엔진. 두 가지 아키텍처 아이디어가 지배한다:

- **PagedAttention** — KV cache가 고정 크기 *블록*(paged)으로 관리되어, 최대 시퀀스 길이 전체를 미리 예약하는
  대신 디코드 스텝마다 적시(just-in-time)에 메모리를 할당한다. 이것이 메모리 관리의 절반이다.
  ([PagedAttention 논문](https://arxiv.org/pdf/2309.06180))
- **연속(반복 수준) 배칭(Continuous/iteration-level batching)** — 중앙화된 **스케줄러**가 각 forward-pass 반복에서
  어떤 요청이 전진할지 결정하고; 새 요청은 합류하고 완료된 요청은 반복 사이에 떠나, GPU를 포화 상태로 유지한다.
  **V1 엔진**에서는 prefill과 decode가 같은 스텝에서 섞일 수 있다(chunked prefill이 스케줄러에 내장됨).
  ([vLLM 해부](https://www.aleksagordic.com/blog/vllm))

**계층화된 실행 경로(이것이 통합 표면이다).** vLLM은 다음으로 위임한다:
`Engine/Scheduler → Executor → Worker → ModelRunner → model.forward()`. **ModelRunner**는 입력 텐서
(`input_ids`, `positions`, KV 블록)를 준비하고, 모델의 forward pass를 호출하고, 샘플링을 실행한다. forward
pass는 `nn.Module` 레이어와 vLLM의 맞춤 attention/collective/activation 연산을 실행하며, 선택적으로 CUDA
graphs로 캡처되고 `torch.compile`로 컴파일된다.
([Worker/Executor 아키텍처](https://deepwiki.com/vllm-project/vllm/4.2-worker-and-executor-architecture))

**syntorch가 대체하는 torch 계층.** `model.forward()`부터 아래로 모든 것 — `nn.Module` 호출 체인,
attention/GEMM/collective 커널, 디바이스 런타임 — 이 "below-torch" 표면이다. SOURCE-BRIEF §7에 따라,
**syntorch는 drop-in torch 프론트엔드**이다: vLLM 안에 torch *대신* syntorch를 설치하고, vLLM의 ModelRunner는
동일한 API를 호출하며, 모든 sub-torch 실행은 실제 GPU로 디스패치되는 대신 syntorch에 의해 캡처된다.

**우리의 사용.** vLLM은 **레퍼런스 / 실제 서빙** 구현이다. 두 가지 역할:
1. 실제 하드웨어에서 정상적으로 실행될 때의 *실측* 원천(서빙 계층에서 OTel로 계측됨 — 요청 지연, 배치 구성,
   KV 점유).
2. 합성 sub-torch 트레이스를 캡처하기 위해 syntorch가 주입되는 **호스트**. syntorch가 "vLLM의 torch 계층"에
   상대적으로 정의되기 때문이다. Canvas 1/L0에서 우리가 모델링하는 서빙 루프 의미론(스케줄러, 배칭)은
   시뮬레이션 축과 실제 축이 비교 가능하도록 vLLM의 것과 일치해야 한다.

> 통합 위험: vLLM 내부(스케줄러, ModelRunner 시그니처, V1 vs V0)는 빠르게 변한다. 우리는 고정된 vLLM 내부가
> 아니라 *torch 프론트엔드 계약*에 의존한다. 트레이스 파이프라인 런북에서 vLLM 버전을 고정(pin)하고 업그레이드를
> 명시적 작업으로 취급하라.

---

## 3. LLMServingSim

**무엇인가.** LLM *추론 서빙*을 위한 시뮬레이션 인프라 — 서빙 시스템의 **요청 수준**을 모델링한다: 요청 큐,
스케줄러/배칭 정책, prefill/decode 단계, KV-cache 성장, 그리고 (2.0에서) prefill–decode 분리(disaggregation),
메모리 분리, MoE, 다계층 prefix caching, 그리고 전력/에너지 모델. KAIST CASYS 작품이다(2.0은 ISPASS 2026).
([LLMServingSim 2.0](https://arxiv.org/html/2602.23036),
[GitHub](https://github.com/casys-kaist/LLMServingSim))

**결정적으로: 수정된 ASTRA-sim + Chakra 위에 구축되어 있다.** LLMServingSim은 요청/서빙 동역학을 처리하고
*반복별 실행 그래프를 Chakra로 방출(emit)*하며, 그것을 임베드된 ASTRA-sim이 소비하여 타이밍/메모리를
스케줄러로 되돌려준다. 따라서 LLMServingSim은 ASTRA-sim의 동료가 아니라 — **ASTRA-sim을 구동하는 서빙 인지
프론트엔드(serving-aware front-end)**이며, 서빙 결정(배치 구성)이 매 반복마다 연산자 그래프를 바꾸는 루프를
닫는다.

- **입력:** 요청 트레이스(도착 시각, 입력/출력 길이), 모델 기술(description), 하드웨어/클러스터 config,
  스케줄링/병렬화 정책.
- **출력:** 요청 수준 메트릭(지연/처리량/TTFT/TBT), 메모리 점유, 에너지, 그리고 기저의 Chakra 그래프 +
  ASTRA-sim 타이밍.

**vLLM 및 ASTRA-sim에 대한 위치.** 그것은 **vLLM 서빙 루프의 시뮬레이션 쌍둥이**이고(동일한 개념적 역할 —
스케줄러 + 배칭 + KV 관리 — 이지만 실행이 아니라 예측됨) **ASTRA-sim의 구동자**이다(ASTRA-sim이 타이밍을 재는
워크로드를 생성한다).

**우리의 사용.** 그것은 **시뮬레이션 축의 엔진**이며 Canvas 1의 **input feeder → serving loop** 단계의
모델이다. 그것의 스케줄러/배칭 의미론은 또한 우리가 L0에서 agent-turn을 모델링하는 방식의 레퍼런스이다.
**미해결 설계 긴장:** SOURCE-BRIEF 흐름은 `LLMServingSim -> syntorch -> ASTRA-sim`을 두지만, LLMServingSim은
*이미 ASTRA-sim을 임베드한다*. 우리는 syntorch가 *LLMServingSim의 연산자별 비용 모델을 대체*하는지(동일한
ASTRA-sim에 더 풍부한 below-torch 연산 그래프를 공급) 또는 syntorch 경로를 병렬로 실행하는지 결정해야 한다.
미해결 질문 참조.

---

## 4. ASTRA-sim (+ SST)

**무엇인가.** **계층화된 아키텍처**를 가진 분산-ML *시스템* 시뮬레이터:

- **Workload layer** — DNN 모델, 병렬화 전략, 학습/추론 루프; 2.0+에서는 이것이 **Chakra ET**에 의해 구동되어
  임의의 워크로드가 지원된다.
- **System layer** — 집합 통신 알고리즘(all-reduce, all-to-all 등), 연산 대 통신의 스케줄링, 연산/통신
  **중첩(overlap)**.
- **Compute model** — 연산자 연산 시간에 대한 분석적(analytical) 또는 roofline/SCALE-sim 스타일 추정.
- **Network backend (플러그형, 다중 충실도):**
  - **Analytical / "Simple"** (β-model, Hockney) — 빠르고 낮은 충실도; 막대한 속도 향상(대규모 NPU 수에서
    Garnet 대비 ~756× 인용됨).
  - **Garnet** (gem5) — 사이클 수준 NoC.
  - **ns-3** — 패킷 수준, RDMA 트래픽 모델링.
  - **SST (Merlin)** — 스케일아웃 실행을 위한 Structural Simulation Toolkit 네트워크 백엔드.
  ([ASTRA-sim 문서](https://astra-sim.github.io/astra-sim-docs/index.html),
  [MICRO 2024 튜토리얼](https://astra-sim.github.io/tutorials/micro-2024))

**SST 관계.** SST는 **선택 가능한 하나의 네트워크 백엔드**(SST-Merlin 경유)이지 ASTRA-sim을 감싸는 래퍼가
아니다. ASTRA-sim은 *플러그 앤 플레이* 연산+네트워크 쌍 위에서 Chakra 연산자를 스케줄링한다; SST는 고충실도
스케일아웃 옵션이고, analytical이 빠른 기본값이다. 우리의 Canvas 3 하드웨어 설계는 궁극적으로 선택된 백엔드가
무엇이든 그것을 파라미터화한다.

**우리의 사용.** 합성 축과 시뮬레이션 축 모두를 위한 **타이밍/비용 엔진**. 연산자 그래프 + 하드웨어 토폴로지
(Canvas 3에서)를 연산/통신/네트워크 시간 및 트래픽으로 변환한다. 백엔드 선택은 컨트롤 플레인이 노출하는
**충실도 대 속도 다이얼**이다(빠른 스윕에는 analytical, 고충실도 검증에는 ns-3/SST).

---

## 5. Chakra (MLCommons Execution Trace / ET)

**무엇인가.** 분산 ML 워크로드를 **그래프**로 표현하기 위한 커뮤니티 표준(MLCommons): 정점 = 연산자,
간선 = 의존성. ASTRA-sim이 소비하는 **교환 형식**이며, 다른 시뮬레이터(예: SST) 및 독점 도구도 소비한다.
([Chakra 논문](https://arxiv.org/pdf/2305.14516))

**우리 파이프라인에서의 역할.** Chakra는 트레이스 파이프라인의 **단일 허리(single waist)**이다. SOURCE-BRIEF
§7.4에 따라, syntorch는 캡처된 sub-torch 트레이스를 Chakra로 변환하는 **Chakra 익스포터 계층**을 가진다;
LLMServingSim은 반복마다 Chakra를 방출한다. 따라서 Chakra는 **합성 축**과 **시뮬레이션 축**이 물리적으로
만나는 곳이며, L0로 낮추기(lowering) 전에 우리의 메모리 주석을 붙이기에 자연스러운 장소이다.

**중요한 경계 구분.** Chakra ET는 **타이밍/구조 지향적**이다(연산 + 의존성 + 지속시간). 우리의 **L0 IR**은
용량-피크(capacity-peak)와 트래픽 추정을 위해 추가로 **텐서 크기/수명(tensor size/lifetime)**이 필요하다
(SOURCE-BRIEF §1). Chakra는 충분한 연산자 구조를 운반하지만 그 자체로 메모리 주석 IR은 아니다 —
**Chakra→L0 낮추기** 단계가 텐서 크기/수명이 붙는 곳이다(syntorch의 커널/tiling 지식에서, 또는 OTel/서빙
경로의 경우 추정으로). 이것은 실제 엔지니어링 경계이지 통과(passthrough)가 아니다.

---

## 6. syntorch (소유 — 브리프가 명시한 것만)

SOURCE-BRIEF §7에 따라, syntorch는 다음과 같은 Python 패키지이다: (1) vLLM의 torch 계층과 동일하게 사용
가능한 **drop-in torch 프론트엔드**; (2) **partitioning/tiling을 명시적 코드/strategy id로** 갖춘 **torch 아래의
맞춤 커널/HW 로직**; (3) 모든 below-torch 트레이스를 캡처하기 위해 **vLLM 내부에 torch 대신 설치됨**; (4)
**Chakra 익스포터** 보유; (5) Canvas 3가 시각화하는 **HW 설계 계층**(chip→die→package→tray→rack→cluster)을
포함/관련.

이것이 조합에 대해 의미하는 바: syntorch는 **합성 실행 엔진**이다 — ASTRA-sim의 analytical 연산 모델이 결여한
텐서 및 tiling 정보를 *동반한* 연산자/커널 수준 트레이스를 생산하고, 그것을 Chakra로 내보낸다. 그것은 "지어지지
않은 디바이스 가정을 실행 가능하게" 만드는 다리이다. 우리는 위의 내용 너머의 어떤 syntorch API 표면도
가정하지 **않는다**; 구체적인 시그니처는 트레이스 파이프라인 ADR의 미해결 질문이다.

---

## 7. 비교 표

| 도구 | 모델링하는 계층 | 입력 | 출력 | 우리의 사용 |
|---|---|---|---|---|
| **vLLM** | 실제 서빙 루프(스케줄러, 연속 배칭, paged KV) + GPU에서의 실제 below-torch 실행 | 모델 가중치, 라이브/재생 요청, HW | 생성된 토큰; 서빙 메트릭; (OTel과 함께) 실제 트레이스 | 레퍼런스 서빙 의미론; **syntorch 주입의 호스트**; 실측 축 |
| **LLMServingSim** | *시뮬레이션* 서빙 루프(요청 큐, 배칭, P/D + 메모리 분리, prefix cache) | 요청 트레이스, 모델 기술, 클러스터/HW config, 정책 | 요청 수준 지연/처리량/에너지/메모리; Chakra 그래프 + ASTRA-sim 타이밍 | **시뮬레이션 축의 엔진**; agent-turn/L0 서빙 모델의 레퍼런스; input-feeder→serving 단계 |
| **syntorch** (소유) | torch 프론트엔드 **아래의 모든 것**: 커널, tiling/partitioning, 맞춤 HW 로직 | vLLM의 torch 계층이 받는 동일한 호출(forward pass) | sub-torch 연산/커널 트레이스(텐서 크기/수명, tiling id) → 익스포터 경유 **Chakra** | **합성 축의 엔진**; 지어지지 않은 디바이스 가정을 실행 가능하게; Canvas 3 HW 설계에 공급 |
| **ASTRA-sim (+SST)** | 분산 시스템 타이밍: 집합 통신, 연산, 네트워크(analytical/Garnet/ns-3/SST) | **Chakra ET** + system/network/HW config | 연산자별 + end-to-end 연산/통신/네트워크 시간, 트래픽, 중첩 | 합성 & 시뮬레이션 축을 위한 **타이밍/비용 엔진**; 충실도 다이얼(analytical→SST) |
| **Chakra ET** | 그래프로서의 워크로드 교환(연산자 + 의존성, 지속시간) | syntorch 익스포터 / LLMServingSim이 생산 | 표준 그래프 파일 | **교환 허리**; 합성+시뮬레이션 축의 만남점; L0로 낮춰짐(텐서 주석 추가됨) |
| **OTel** (맥락) | 실제 서빙 관측가능성(spans/metrics) | 라이브 계측 인프라 | 분산 트레이스/메트릭 | **실측 축**; 신뢰 사다리(trust ladder)의 검증 그라운드 트루스 |

---

## 8. 첫 번째 수직 슬라이스를 위한 권장 조합

**슬라이스의 목표:** *워크플로 의미론*을 증명한다(SOURCE-BRIEF §11: 넓은 스캐폴딩보다 작은 수직 슬라이스) —
서로 다른 두 증거 축이 **동일한 L0 IR**로 정규화되고 비교될 수 있음을. 전체 시뮬레이터 통합이 아니다.

**권장: "ServingSim-스타일 + syntorch-스타일을 하나의 L0 IR로" 슬라이스.**

1. **하나의 워크로드** = 하나의 작은 LLM 모델에 대한 하나의 agent turn(Canvas 1), 서빙 루프가 소비하는 요청으로
   표현됨(prefill 길이 + decode 길이).
2. **축 A — 시뮬레이션:** 그 요청을 최소 클러스터 config로 **LLMServingSim**을 통해 실행; 임베드된 ASTRA-sim이
   타이밍을 생산하게 하고; 방출된 **Chakra** 그래프 + 메트릭을 캡처.
3. **축 B — 합성:** *동일한* 모델 forward 경로를 **vLLM 형태의 하네스 아래에서 torch 프론트엔드로 syntorch를
   사용**하여 실행, sub-torch 트레이스를 캡처, **Chakra**로 내보냄.
4. **공통 낮추기:** 두 축 모두가 공급하는 **Chakra → L0 IR** 낮추기를 작성, 텐서 크기/수명을 붙여 L0(연산자
   수준 그래프 + 용량 피크 + 대략적 트래픽)를 생산. 두 Chakra 입력, 하나의 L0 스키마, 하나의 비교.
5. **비교:** 두 L0 IR을 하나의 재현 가능한 실험 행으로 나란히 보여줌
   `(workload, hw config, sim config) -> trace -> metric -> DB row`.

**왜 이 조합이 먼저인가:**
- **Chakra 허리**를 두 번(sim + synthetic) 운동시키는데, 이것이 일찍 위험을 제거해야 할 가장 중요한 단일
  계약이다.
- 가장 어렵고 가장 변동성 큰 통합(살아있는 vLLM *안에* syntorch 설치 및 전체 `LLMServingSim -> syntorch ->
  ASTRA-sim` 재배선)을 후속 슬라이스로 미룬다. 첫 슬라이스는 전체 vLLM이 아니라 **얇은 vLLM 형태의 하네스**
  (ModelRunner 유사 호출자) 아래에서 syntorch를 실행할 수 있다.
- 첫날부터 **신뢰 사다리**를 구체화한다: 실제 OTel 이전에도, 두 독립 축이 L0에서 연산 구조에 합의해야 하며,
  분기를 일찍 드러낸다.

**첫 슬라이스에서 명시적으로 제외:** 실제 OTel 축(축 C) 배선, ns-3/SST 고충실도 백엔드(ASTRA-sim
**analytical** 백엔드 사용), MoE/disaggregation, L1/L2 채움 수준, 그리고 단일 고정 클러스터 config를 넘어서는
Canvas 3 HW 계층 편집.

---

## 9. 통합 경계 노트 (런북이 구현해야 할 계약)

| 경계 | 계약 | 위험 / 노트 |
|---|---|---|
| **vLLM ↔ syntorch** | syntorch는 vLLM의 ModelRunner가 사용하는 torch API와 `import`-호환됨; torch 대신 syntorch 설치. | vLLM 버전별 torch 사용에 의존. **vLLM 고정**; torch-프론트엔드 표면(vLLM 내부가 아님)을 계약으로 취급. 첫 슬라이스는 전체 vLLM 대신 얇은 하네스 사용 가능. |
| **syntorch → Chakra** | syntorch 익스포터가 유효한 Chakra ET(연산자 + deps)를 방출하고, L0를 위한 **텐서 크기/수명 + tiling/strategy id의 사이드 채널**을 추가. | Chakra 단독으로는 타이밍 지향적; 텐서/수명 정보가 함께 실려야 함(확장 필드 또는 사이드카). Chakra 스키마 버전에 대해 검증. |
| **LLMServingSim → Chakra/ASTRA-sim** | 방출된 Chakra + 메트릭을 소비; 그 스케줄러를 재구현하지 말 것. 이미 수정된 ASTRA-sim을 임베드함. | 브리프의 `LLMServingSim -> syntorch -> ASTRA-sim` 순서는 LLMServingSim이 이미 ASTRA-sim을 소유하는 것과 충돌. 결정: syntorch가 그 **연산 비용 모델**을 대체하거나, 병렬 경로. **미해결 질문.** |
| **Chakra → ASTRA-sim** | 표준 ASTRA-sim Chakra 소비; 네트워크 백엔드 선택(analytical 우선). | 백엔드 = 컨트롤 플레인이 노출하는 충실도/속도 다이얼. Chakra/ASTRA-sim 버전을 함께 고정. |
| **Chakra → L0 IR** | 낮추기 패스: 연산자+deps → TensorNode/DataMovementEdge; 크기/수명 부착 → 용량 피크 + 대략적 트래픽. 동일 스키마, 채움 수준 L0. | 이것이 모든 축의 **정규화 지점**. 우리가 소유; 슬라이스의 실제 의미 작업. |
| **실제 인프라 → OTel → L0** | (나중) 서빙 계층 spans/metrics를 동일한 L0 스키마로 낮춤(더 거침; sub-torch가 아니라 서빙 입도). | OTel은 연산 수준 텐서가 아니라 서빙 수준 진실을 줌; OTel로부터의 L0는 부분적 — 버그가 아니라 의도적 채움 수준 간극으로 기록. |
| **ASTRA-sim ↔ SST/ns-3** | SST-Merlin / ns-3는 빌드타임/config 선택 가능한 대체 네트워크 백엔드. | 무거운 빌드 의존성; 충실도 다이얼 뒤에 유지; 첫 슬라이스 미포함. |
| **Canvas 3 HW 설계 → ASTRA-sim system/network config** | chip→…→cluster 계층을 ASTRA-sim system+network config(및 syntorch HW 로직)로 낮춤. | 하나의 HW 모델의 두 소비자(syntorch 커널 + ASTRA-sim 토폴로지)가 일관되게 유지되어야 함. |

---

## 10. 세 증거 축이 어떻게 조합되는가

| 축 | 경로 | 엔진 | L0로의 입도 | 신뢰 사다리 역할 |
|---|---|---|---|---|
| **실측(Real measurement)** | 실제 인프라 → **OTel** | 라이브 vLLM/서비스 | 서빙 수준(요청, 배치, KV 점유); 프로파일링된 경우에만 연산 수준 | **그라운드 트루스** — syntorch 트레이스가 검증되는 대상 |
| **합성 실행(Synthetic execution)** | vLLM(torch→**syntorch**) → sub-torch trace → **Chakra** | syntorch (+ 타이밍용 ASTRA-sim) | 텐서 크기/수명 + tiling id를 갖춘 연산/커널 수준 → 가장 풍부한 L0 | 신뢰되기 전 A100/OTel 증거에 대해 검증되어야 함 |
| **시뮬레이션(Simulation)** | input feeder → **LLMServingSim** → (syntorch) → **ASTRA-sim (+SST)** | LLMServingSim + ASTRA-sim | 방출된 Chakra로부터의 연산 수준; 서빙 동역학은 측정이 아니라 모델링 | 투영/what-if; sim이 synthetic+real에 얼마나 잘 맞는지에서 신뢰성을 상속 |

셋 모두 **채움 수준 L0의 동일한 메모리 주석 IR**(연산 수준 그래프 + 텐서 크기/수명 → 용량 피크 + 대략적
트래픽)로 정규화되어 **비교 가능한 투영**을 가능하게 한다. 컨트롤 플레인의 역할은 이 축들을 조합 가능하고,
실행 가능하고, 검사 가능하고, 증거로 보존 가능하게 만드는 것이다.

---

## 미해결 질문(Open Questions)

- **(OQ) LLMServingSim은 이미 ASTRA-sim을 임베드한다** — 브리프의 `LLMServingSim -> syntorch -> ASTRA-sim` 체인은 syntorch가 *그 사이에* 앉는다는 것을 함의한다. syntorch가 **LLMServingSim의 연산자별 비용 모델을 대체**하는가(동일한 ASTRA-sim에 더 풍부한 below-torch 그래프 공급), 아니면 병렬 syntorch 경로를 실행하는가? [ADR-0005](../01-decisions/ADR-0005-trace-pipeline_ko.md)에서 해결.
- **(OQ) syntorch ↔ vLLM 버전 계약** — syntorch가 정확히 어떤 torch API 표면을 만족해야 하며, 어떤 vLLM 버전(V0 vs V1 엔진)을 고정하는가? `TODO(open-question: confirm vLLM target + torch frontend surface)`.
- **(OQ) 텐서 크기/수명을 운반하는 Chakra** — Chakra ET(현재 스키마 버전)가 텐서 풋프린트/수명 필드를 가지는가, 아니면 L0를 위한 확장/사이드카가 필요한가? `TODO(open-question: Chakra schema version + memory annotation extension)`.
- **(OQ) LLMServingSim 1.x vs 2.0** — 2.0은 MoE/disaggregation/power를 추가하나 더 무겁다; 무엇을 먼저 통합하는가? 슬라이스를 위해서는 아마 1.x-동등 최소 경로.
- **(OQ) syntorch Chakra 익스포터 충실도** — ASTRA-sim이 직접 소비하는 동일한 Chakra 방언(dialect)을 방출하는가, 아니면 변환이 필요한가? `TODO(open-question: confirm syntorch exporter target dialect)`.
- **(OQ) OTel → L0 채움 수준** — 실제 축이 현실적으로 얼마만큼의 연산 수준 구조를 제공할 수 있으며, 그것을 누락된 데이터가 아니라 의도적 채움 수준 간극으로 어떻게 표현하는가?
- **(OQ) 네트워크 백엔드 기본값** — 슬라이스에는 analytical을 가정; 언제 ns-3/SST가 신뢰성을 위해 필수가 되는가?

(이것들을 [08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md)에 반영하라.)

## 런북에 대한 함의

- **phase-4-trace-pipeline** 런북을 구동: **Chakra → L0 낮추기**(정규화 허리)를 위한 `RB-4xx`, **syntorch 캡처 + Chakra 내보내기** 하네스(처음에는 얇은 vLLM 형태 호출자)를 위한 `RB-4xx`, **LLMServingSim → Chakra 수집(ingestion)**을 위한 `RB-4xx`.
- **phase-3-simulation-engine** 런북을 구동: 기본 충실도 계층으로 **analytical 백엔드**를 사용한 ASTRA-sim 호출, ns-3/SST는 config 플래그 뒤에.
- 버전 고정: 모든 트레이스 파이프라인 런북은 Preconditions에 고정된 **vLLM**, **LLMServingSim**, **ASTRA-sim**, **Chakra schema** 버전을 선언해야 함.
- [ADR-0005](../01-decisions/ADR-0005-trace-pipeline_ko.md)(트레이스 파이프라인 경계)에 공급하고, 낮추기 대상으로 [L0 IR 스키마](../05-caw01-simulation-control-plane/l0-ir-schema_ko.md)를 참조.

## 출처(Sources)

- vLLM PagedAttention 논문 — https://arxiv.org/pdf/2309.06180
- Inside vLLM (해부) — https://www.aleksagordic.com/blog/vllm
- vLLM Worker/Executor 아키텍처 — https://deepwiki.com/vllm-project/vllm/4.2-worker-and-executor-architecture
- LLMServingSim 2.0 — https://arxiv.org/html/2602.23036 ; repo https://github.com/casys-kaist/LLMServingSim
- LLMServingSim (원본) — https://arxiv.org/pdf/2408.05499
- ASTRA-sim 문서 — https://astra-sim.github.io/astra-sim-docs/index.html ; MICRO 2024 튜토리얼 https://astra-sim.github.io/tutorials/micro-2024
- Chakra 논문 — https://arxiv.org/pdf/2305.14516
