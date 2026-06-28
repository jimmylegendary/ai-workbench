# TTT / Test-Time Compute 지형 (Landscape)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF_ko.md), [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS_ko.md), [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적

이 문서는 **test-time training (TTT)**와 **test-time compute** 변형들의 지형을 지도화하고 단 하나를 결정한다:
**어떤 변형이 추론(inference) 중에 실제로 가중치/state를 write back하는가, 그리고 그 writeback이 memory traffic에
대해 무엇을 함의하는가**(write bandwidth, gradient, optimizer state, updated-state residency, updated-weight
재사용). 그것은 **"writes back? what?" 열을 가진 taxonomy**와 변형별 memory-traffic 함의를 산출하여, CAW-06의
writeback-traffic 스키마와 CAW-01(별개의 제품 — 시뮬레이션 control plane)로의 export에 씨앗을 제공한다.

이 문서는 스키마 필드 집합을 결정하지 **않으며**(그것은 자체 설계 문서 / ADR이다), 실험을 실행하지 않고, 어떤 TTT
변형이 production workload이거나 그렇게 될 것이라고 주장하지 않는다. 여기의 모든 제품 간 참조는 **import/export
경계**이며, 결코 공유 저장소가 아니다. 아래의 생성된 요약은 **evidence가 아니다**; hypothesis는 명시적 uncertainty를
지니며 결코 확정된 클레임으로 제시되지 않는다.

## 1. 중요한 축: 추론이 WRITE BACK하는가?

Read-dominant LLM serving이 기준 baseline이다: 가중치는 **고정(frozen)**되어 있다; 요청당 늘어나는 유일한 state는
**KV cache**(read 위주이고, 생성 시 추가되는(append-on-generate) 구조)이다. 전략적 hypothesis(CAW-06 → CAW-01)는
일부 test-time 방법이 **추론 중에 가중치/state write를 발행함으로써** 이 가정을 깨고, read-dominant serving
프로파일이 포착하지 못하는 **write-traffic 축**을 만들어낸다는 것이다. *(Hypothesis — 확정된 것이 아니라 검증되어야
함.)*

우리는 일상적으로 혼동되는 두 가족을 분리한다:

- **Test-time SCALING / compute (TTS):** **가중치를 고정한 채** 추론 시 더 많은 compute를 소비한다(더 긴 chain,
  더 많은 sample, 탐색). Writeback = 가중치에 대해 없음; 비용은 **KV-cache 증가 + read bandwidth**이다.
- **Test-time TRAINING / adaptation (TTT/TTA):** gradient step(또는 RL 업데이트)을 통해 추론 중에 **파라미터
  또는 파라메트릭 state를 업데이트**한다. Writeback = **yes** — 질문은 *무엇을*(full weights, adapter, 작은 inner
  model, norm stats) 그리고 *얼마나 지속적으로*이다.

경계가 항상 깔끔한 것은 아니다: TTRL(test-time RL)과 아키텍처적 TTT layers는 scaling과 업데이트를 혼합한다.

## 2. Taxonomy — "writes back? what?" + memory-traffic 함의

> Bandwidth/endurance 수치는 제시되지 않는다(벤치마크를 지어내지 않음). *(uncertain)*으로 표시된 셀은 첫 research
> run에서 검증할 hypothesis이다. "Inner-loop" = 업데이트가 forward pass 내부에서 발생; "outer-loop" = 답변
> 전후/주변의 별도 adaptation 단계.

| # | Variant (representative work) | Update mechanism | **Writes back? What?** | Update scope / loop | Residency & reuse of the written state | **Memory-traffic implication** |
|---|---|---|---|---|---|---|
| 1 | **Test-time scaling** — CoT, self-consistency, ToT/MCTS; o1/R1-style (frozen-weight reasoning) | none (more tokens/samples/search) | **No weight writeback.** Only KV cache grows | n/a (read-only) | KV cache per request; discarded after request | Read-dominant; bottleneck = **KV-cache capacity + read BW**, not writes. This is the *baseline* the writeback axis is measured against |
| 2 | **TTT layers as architecture** — TTT-Linear / TTT-MLP (Sun et al. 2024, "RNNs with expressive hidden states") | inner-loop SGD step per token on a self-supervised loss; hidden state **is** a small model `W_t` | **Yes — the inner "fast-weight" model** `W_t = W_{t-1} − η∇ℓ`. A small linear/MLP weight matrix, updated every token | inner-loop, per-token, during forward pass | Lives for the sequence; **reused on the very next token** (high temporal reuse) | **High-frequency small writes** to fast-weight state every token; write volume scales with tokens × state size. Reads-then-writes the same buffer → favors **near-memory update** / on-chip residency *(uncertain: whether it spills to main memory at long context)* |
| 3 | **Neural long-term memory at test time** — Titans (Behrouz et al. 2025, "Learning to Memorize at Test Time") | gradient (surprise-gated) update to a small memory MLP while reading input | **Yes — the Neural Memory module weights only**; core/attention stay frozen | inner-loop, per-segment | Memory persists across segments within the context; **reused for long-past recall** | Sustained writes to a **bounded** memory module; write rate gated by "surprise" so traffic is **input-dependent / bursty** *(uncertain)*. Optimizer-like momentum may add state to keep resident |
| 4 | **Per-instance / per-task TTT fine-tuning** — ARC (Akyürek et al. 2024); few-shot TTT | outer-loop: train **task-specific LoRA adapters** on augmented in-context examples, then answer | **Yes — LoRA adapter weights** (low-rank ΔW); **discarded after the task** | outer-loop, per task/instance | Adapter resident only for that task; **little cross-task reuse** (thrown away) | **Bursty write + full optimizer state** (Adam moments ≈ 2× param size) during the adapt phase, then **read-only** during answer. Write-then-discard → low reuse, high churn; capacity dominated by **optimizer state**, not the small adapter |
| 5 | **Dynamic evaluation / online adaptation** — Krause et al.; "Revisiting Dynamic Evaluation" (2024) | gradient descent on recent history to adapt LM to local distribution | **Yes — full or partial base-model weights** (parameters become part of temporal state) | inner/online, rolling | Updated weights persist and **roll forward** with the stream; high reuse | Potentially **large write volume** (touches base weights), continuous. Worst case for the writeback axis: write BW ~ model size × update frequency *(uncertain whether full-param or subset in practice)* |
| 6 | **Test-time RL** — TTRL (Zuo et al. 2025); CG-TTRL on-device | RL (majority-vote / self-consistency reward) updates the **policy** at test time | **Yes — policy (model) weights**, plus rollout buffers + optimizer state | outer-loop, multi-rollout per query | Updated policy may persist (specialization) or reset; reuse varies | **Heaviest mixed traffic:** many sampled rollouts (read/KV) **plus** RL gradient writes + optimizer state + experience buffer. Both read- and write-heavy |
| 7 | **Test-time adaptation (TTA)** — TENT-style entropy min., BN-stat update; StreamAdapter | update **norm stats / a small parameter subset** to fit input distribution | **Yes — BatchNorm stats or a small subset** (affine/norm params) | inner/outer, lightweight | Often persists for the stream; cheap to recompute | **Low-volume writeback** (small param subset / running stats). Smallest memory-write footprint of the writeback family |
| 8 | **KV-binding TTT** — "Test-Time Training with KV Binding Is Secretly Linear Attention" (NVIDIA, 2026) | inner-loop KV-binding loss; framed as equivalent to linear attention | **Yes — inner-loop fast state** (interpretable as linear-attention state) | inner-loop, per-token | Sequence-scoped, high reuse | Similar profile to #2; the linear-attention framing suggests the "write" may be expressible as a **state-update recurrence** rather than explicit optimizer steps *(uncertain — equivalence claim to verify)* |

### 표 읽기 (클레임, uncertainty 포함)

- **가중치/state를 write back함:** 변형 **2, 3, 4, 5, 6, 7, 8**. **하지 않음:** 변형 **1**(test-time scaling)
  — read-dominant이며 비교 baseline이지, writeback 축의 일부가 아니다. *(read/write 구분에 대한 confidence는 높음;
  각 변형이 정확히 무엇을 쓰는지(written object)에 대한 confidence는 중간.)*
- **가장 작은 write footprint:** #7(norm stats)과 #2/#8(작은 fast-weight). **가장 크고 / memory에 가장 새로움:**
  #4(optimizer-state가 지배하는 burst)와 #5/#6(base-weight 또는 policy write). *(Hypothesis.)*
- **Optimizer state는 단지 가중치가 아니라 일급(first-class) memory 소비자이다**: Adam 스타일 moment는 adaptation
  동안 written-parameter footprint를 대략 두 배로 늘린다(#4, #6). ΔW만 세면 놓치기 쉽다.

### 변형별 노트 (각 행이 그 자리에 놓인 이유)

- **#1 Test-time scaling.** o1/R1-style 추론, self-consistency, tree/MCTS 탐색은 모두 가중치를 고정한 채로 두고
  *토큰과 sample*로 비용을 치른다. 늘어나는 유일한 state는 KV cache이며, 이는 read 위주이고 생성 시 추가된다.
  우리는 정확히 writeback 축이 측정되는 **read-dominant baseline**을 정의하기 위해 — 그리고 "test-time compute"가
  "writes back"으로 잘못 분류되는 것을 막기 위해 — 이것을 taxonomy에 둔다.
- **#2 TTT layers.** 개념적 전환점: RNN hidden state 자체가 **토큰당** 하나의 gradient step으로 가중치가
  업데이트되는 작은 모델이다. Writeback이 forward pass에 본질적이어서, 분할상환(amortize)으로 없앨 수 없다. 이것은
  즉각적 재사용을 가진 고빈도, 작은 페이로드 write 스트림의 가장 깔끔한 예이다.
- **#3 Titans / neural memory.** 테스트 시점에 bounded memory module만 학습된다; surprise gate가 write
  스트림을 **data-dependent**로 만들어, 정적(static) traffic 모델링을 복잡하게 한다. *(Uncertain: 실세계 write duty
  cycle.)*
- **#4 Per-task TTT (ARC).** 두 단계 프로파일 — *write-heavy adapt 단계*(LoRA + full optimizer state) 다음
  *read-only answer 단계* — 이후 쓰여진 adapter는 **폐기된다**. memory 이야기는 일시적(transient) optimizer state가
  지배하며, task 간 재사용은 본질적으로 0이다.
- **#5 Dynamic evaluation.** 여기서 가장 오래된 아이디어(pre-LLM 혈통)이자 write에 가장 공격적: 파라미터가 모델의
  temporal state의 일부가 되어 스트림과 함께 roll forward한다. base 가중치를 건드린다면 write bandwidth의 최악
  케이스. *(실용적 변형이 subset으로 제한하는지 uncertain.)*
- **#6 TTRL.** scaling과 training을 명시적으로 *결합*한다: 많은 rollout(read/KV heavy)이 self-rewarded RL
  업데이트(write + optimizer + buffer)를 공급한다. 동시에 read-heavy이고 write-heavy인 유일한 행.
- **#7 TTA.** 경량 adaptation(entropy minimization, norm-stat refresh) — writeback 가족의 *바닥(floor)*을
  표시하기 위해 포함; 실험에서 저비용 대조군으로 유용.
- **#8 KV-binding TTT.** 흥미로운 점은, linear-attention 등가성(equivalence)이 성립한다면 그 "training" write가
  **optimizer state 없는** state-update recurrence로 환원될 수 있다는 것 — 이는 비용 면에서 그것을 #2 옆으로
  옮길 것이다. 등가성이 검증해야 할 대상이다.

## 3. writeback 가족 전반의 tradeoff

| Dimension | Inner-loop fast-weight (#2,#3,#8) | Per-task adapter (#4) | Online full-weight (#5,#6) | Norm/subset TTA (#7) |
|---|---|---|---|---|
| Write frequency | per-token (high) | per-task burst | continuous/rolling | low |
| Written object size | small (state/MLP) | small ΔW **+ large optimizer state** | up to full model | tiny |
| Updated-state reuse | high (next token) | low (discarded) | high (rolls forward) | medium |
| Residency pressure | on-chip / near-memory candidate | optimizer state in HBM during adapt | model-sized, persistent | negligible |
| Endurance concern (if non-volatile) | high write count | bursty | high | low |
| Fit for read-only serving profile | poor | poor (adapt phase) | poor | marginal |

**함의:** 단일 "TTT" 라벨은 적어도 네 개의 **서로 다른 memory 프로파일**을 숨긴다. writeback-traffic 스키마(CAW-01
브리지)는 하나의 전역 "TTT = writes" 플래그가 아니라, 변형별 필드를 지녀야 한다.

## 4. 후보 writeback-traffic 스키마 씨앗 (export 힌트 → CAW-01)

이들은 writeback-traffic 스키마 문서/ADR이 정형화해야 할 **제안된 필드**이다; 여기서는 taxonomy가 함의하는 것으로만
나열된다. 확정된(committed) 스키마가 아니다.

- `written_object` ∈ {none, fast_weight_state, memory_module, lora_adapter, full_weights, norm_stats, policy}
- `update_loop` ∈ {none, inner_per_token, inner_per_segment, outer_per_task, online_rolling}
- `optimizer_state_factor` (×param footprint; 예: Adam의 경우 ~2) — *변형별 uncertain; verify*
- `write_frequency` (per-token | per-segment | per-task | per-stream)
- `updated_state_reuse` (next-token | within-context | cross-task=none | rolls-forward)
- `residency_target` (on-chip | HBM | spill) — *L0/L1에서 추상적으로 modelable한지 open question*
- `endurance_sensitivity` (non-volatile write-back media에 대해서만 의미 있음) — *hypothesis*

## 5. Open Questions

[../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md)에 기록됨:

- **OQ-1:** 각 "writes back" 변형에 대해, 토큰/세그먼트/태스크당 *실제* written-byte 볼륨은 얼마인가? 여기서 벤치마크
  수치는 주장되지 않는다. TODO(open-question: 최소 reproduction에서 write 볼륨 측정).
- **OQ-2:** KV-binding-TTT ⇄ linear-attention 등가성(#8)이 그 "write"가 단지 recurrence(optimizer state
  없음)일 만큼 정확한가? TODO(open-question: 등가성 클레임 검증).
- **OQ-3:** Inner-loop fast weights(#2/#3)는 긴 context에서 on-chip에서 main memory로 spill하는가, 그리고 어느
  context 길이에서? TODO(open-question).
- **OQ-4:** Per-task TTT(#4)의 경우, hypothesis대로 optimizer state(ΔW가 아니라)가 memory write footprint를
  지배하는가?
- **OQ-5:** writeback traffic을 syntorch/vLLM 통합 이전에 CAW-01의 **L0/L1** 추상화에서 모델링할 수 있는가?
  (PRODUCT-BRIEF에서 가져온 핵심 설계 질문.)
- **OQ-6:** 어떤 변형이 caching/residency 정책에 의미를 가질 만큼 충분히 강한 **updated-weight 재사용**을 보이는가,
  vs write-then-discard churn(#4)?
- **OQ-7:** Endurance/write-amplification는 updated state가 non-volatile media에 안착할 때만 중요하다 — 그것이
  현실적인 배포 가정인가, 아니면 항상 HBM/SRAM-resident인가? *(Hypothesis, 미검증.)*

## 6. 런북에 대한 시사점 (Implications for runbooks)

- **최소 reproduction 타깃:** 첫 두 toy 실험으로 **하나의 inner-loop 변형(TTT-Linear, #2)**과 **하나의 per-task
  변형(ARC LoRA TTT, #4)**을 고른다 — 이들은 write-frequency / optimizer-state tradeoff의 양 극단에 위치하며
  함께 대부분의 스키마 필드를 행사한다. write 볼륨 + optimizer-state 크기를 로깅; 실패(예: toy 셋업에서 write
  볼륨을 측정할 수 없는 경우)를 일급(first-class) 결과로 기록.
- **계측(Instrumentation):** 런북은 정확도뿐 아니라 *written-byte 카운트*, *update 빈도*, *optimizer-state 크기*를
  포착해야 한다. 이것들이 writeback-traffic 스키마가 필요로 하는 수치이다.
- **Export 규율:** taxonomy 행 + 스키마 씨앗 필드를 CAW-01에 **open questions + 초안 스키마**로, claim+evidence를
  CAW-02에 — 둘 다 명시적 파일 경계로, 공유 저장소 없음 — 방출한다. taxonomy 셀을 결코 확정된 CAW-01 workload
  요구사항으로 제시하지 말 것; 그것은 provenance를 가진 hypothesis이다.
- **Import:** CAW-05(별개의 제품)가 TTT 레이더 신호를 방출할 때, research 스레드를 열기 전에 먼저 이 taxonomy에
  슬롯한다(어느 행? 무엇을 write back?).

## 7. Provenance (참고한 소스; 요약은 evidence가 아님)

- Sun et al., *Learning to (Learn at Test Time): RNNs with Expressive Hidden States*, arXiv:2407.04620 (2024).
- Akyürek et al., *The Surprising Effectiveness of Test-Time Training for Abstract Reasoning / Few-Shot Learning*,
  arXiv:2411.07279 (2024).
- Behrouz et al., *Titans: Learning to Memorize at Test Time*, arXiv:2501.00663 (NeurIPS 2025).
- Zuo et al., *TTRL: Test-Time Reinforcement Learning*, arXiv:2504.16084 (2025); CG-TTRL, arXiv:2511.06430.
- Krause et al., *Dynamic Evaluation of Neural Sequence Models*; *Revisiting Dynamic Evaluation: Online Adaptation
  for LLMs*, arXiv:2403.01518 (2024).
- *Test-Time Training with KV Binding Is Secretly Linear Attention*, arXiv:2602.21204 (NVIDIA, 2026).
- *Inference-Time Hyper-Scaling with KV Cache Compression*, arXiv:2506.05345 (2025) — read-only baseline용.

> 알림: 이들은 변형이 존재한다는 것과 그것들이 무엇을 업데이트하는지를 확립한다; **변형별 byte 수준 memory-traffic
> 수치는 주장되지 않으며** CAW-06 자체의 최소 reproduction에서 나와야 한다.
