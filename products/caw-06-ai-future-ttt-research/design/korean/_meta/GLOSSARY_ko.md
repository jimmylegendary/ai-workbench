# GLOSSARY — Ubiquitous Language (CAW-06)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [PRODUCT-BRIEF.md](./PRODUCT-BRIEF_ko.md)
  - [DOC-CONVENTIONS.md](./DOC-CONVENTIONS_ko.md)
  - [ADR-0001 Surface](../01-decisions/ADR-0001-product-surface-and-scout_ko.md)
  - [ADR-0002 Hypothesis representation](../01-decisions/ADR-0002-hypothesis-representation_ko.md)
  - [ADR-0003 Experiment ledger](../01-decisions/ADR-0003-experiment-ledger_ko.md)
  - [ADR-0004 Writeback-traffic schema](../01-decisions/ADR-0004-writeback-traffic-schema_ko.md)
  - [ADR-0005 Ingestion](../01-decisions/ADR-0005-source-and-claim-ingestion_ko.md)
  - [ADR-0006 Implication mapping](../01-decisions/ADR-0006-implication-mapping_ko.md)
  - [ADR-0007 Storage & scheduling](../01-decisions/ADR-0007-storage-and-scheduling_ko.md)
  - [ADR-0008 Export boundaries](../01-decisions/ADR-0008-export-boundaries_ko.md)
  - [ttt-landscape.md](../02-research/ttt-landscape_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

이 문서는 CAW-06의 **ubiquitous language(보편 언어)**를 고정한다: 모든 설계 문서, ADR, runbook이 반드시
사용해야 하는 정확한 용어와 각각에 대한 하나의 권위 있는 정의다. 이것은 결정이 아니라 참조 문서다: 어떤 용어가
선택을 담고 있는 경우 그 구속력 있는 근거는 링크된 ADR에 있다. PRODUCT-BRIEF가 고정한 것은 **재정의하지 않는다**;
정교화하고 모호함을 해소할 뿐이다. 여기의 용어와 ADR이 어긋나면 ADR이 이긴다; ADR과 brief가 어긋나면 brief가 이긴다.

아래 거의 모든 정의에 두 개의 횡단(cross-cutting) 규칙이 색을 입히므로, 먼저 읽어라:

- **no-overclaim** — hypothesis는 결코 확정된 claim으로 제시되지 않는다; 경계를 넘는 모든 것은 명시적 status +
  불확실성(uncertainty)을 지닌다 (ADR-0002).
- **failures-useful** — 부정적 결과는 일급(first-class)이며, 기본적으로 보존되고 분류되며 노출된다
  (ADR-0003).

---

## 1. 핵심 워크플로 & 표면(surface)

| Term | Definition |
| --- | --- |
| **ExperimentScout** | CAW-06의 단일 파이프라인 core: 여섯 단계 source discovery → claim extraction → hypothesis generation → small-experiment planning → result logging → implication mapping을 실행하는 하나의 **Run**. 그것을 실행하는 AI 에이전트의 페르소나 이름이기도 하다. |
| **ExperimentScout Run** | 파이프라인 core의 한 번의 호출. 멱등(idempotent)이고 재개 가능(resumable)하다. 정확히 세 개의 얇은 surface — scheduled/triggered pipeline, CLI, MCP — 를 통해 도달하며, 이들은 하나의 core를 공유한다 (ADR-0001). |
| **Research thread** | 가치의 단위: 추적되는 하나의 사슬 `source → claim → hypothesis → small experiment → result (incl. failure) → implication`으로, 출처(provenance)와 명시적 불확실성을 끝에서 끝까지(end-to-end) 지닌다. thread store에 영속화되며, 다섯 가지 출력 artifact 종류는 이것으로부터 파생된다. |
| **Thread store** | 다섯 가지 artifact 종류 전부가 파생되어 나오는 CAW-06 자신의 파일 기반 저장소. 다른 어떤 제품과도 공유하지 않는다. 레이아웃은 §7. |
| **Five artifact kinds** | 파생된 출력물: (1) research-thread 레코드, (2) small-experiment ledger, (3) hypothesis card, (4) implication map, (5) writeback-traffic schema 번들 (ADR-0001). |

## 2. Source / Claim / Hypothesis (세 가지 레코드 종류)

이들은 결코 병합되지 않는 **세 개의 분리된 레코드 종류**다. 출처는 한 방향으로 흐른다: Source는 Claim의 근거가
되고, Claim은 Hypothesis의 근거가 된다. status/uncertainty가 벗겨진 채로 경계를 넘는 것은 금지된다 (ADR-0002).

| Term | Definition |
| --- | --- |
| **Source** | 수집된 공개 artifact(논문, preprint, repo, 또는 import된 CAW-05 radar signal)에 대한 출처 레코드. origin, 식별자, 검색(retrieval) 메타데이터, `boundary`를 담는다. Source는 증거 재료다 — claim도 결론도 아니다. |
| **Claim** | 하나 이상의 Source로부터 추출된 개별 주장(assertion)으로, 그 Source(들)로 되돌아가는 링크를 가진다. Claim은 그 출처에 귀속되며 CAW-06이 저작한 것이 아니다. hypothesis와 구별된다: Claim은 source가 말하는 것이고, Hypothesis는 우리가 검증하자고 제안하는 것이다. |
| **Hypothesis** | Claim들로부터 생성된 검증 가능한 명제로, `status`, 보정된(calibrated) `uncertainty`, 증거 링크를 지닌다. 기본 status는 `hypothesis`다. **결코** 확정된 claim이 아니다 (no-overclaim). **hypothesis card**로 노출된다. |
| **Hypothesis card** | Hypothesis의 렌더링된 artifact 형태: 명제 + status + uncertainty + 증거 링크 + 그것에 관계되는 experiment(들). |

### 2.1 Status 생애주기(lifecycle)

**4상태 가역(reversible)** 생애주기. 기본이자 진입 상태는 `hypothesis`다. 전이는 가역적이다 —
새로운 증거가 hypothesis를 되돌릴 수 있다 (ADR-0002).

| Status | Meaning |
| --- | --- |
| `hypothesis` | 제안됨, 아직 판정되지 않음. 기본 상태. |
| `supported` | 증거가 명제와 일관됨("proven"이 아님). |
| `refuted` | 증거가 명제와 모순됨. |
| `inconclusive` | 증거를 찾았으나 판별하지 못함. 실재하고 보존되는 결과 — 공백(gap)이 아님. |

### 2.2 Uncertainty, confidence 그리고 evidence cap

| Term | Definition |
| --- | --- |
| **Uncertainty / confidence** | Hypothesis에 붙는 **보정된 질적(qualitative)** 라벨로, 증거가 그것에 얼마나 강하게 관계되는지를 표현한다. 설계상 질적이다; 조작된 수치 점수는 없다(수치가 필요하면 `TODO(open-question)`로 표시). |
| **Evidence cap** | HARD 규칙: **generated**된 증거(생성된 요약, L0 analytic estimate, LLM 근거)는 `status`를 승급시키거나 confidence를 상한 너머로 올릴 수 없다. 오직 외부/재현된 증거만 status를 움직일 수 있다. no-overclaim을 강제한다. |
| **generated-not-evidence** | CAW-06이 생산한 모든 요약, 근거, analytic estimate는 명시적으로 **generated**로 표시되며, hypothesis를 승급시키거나 claim을 확정하는 증거로 **계산되지 않는다**는 원칙. |

## 3. Small-experiment ledger

| Term | Definition |
| --- | --- |
| **Small-experiment ledger** | 최소 재현(minimal reproduction) / 토이 실험에 대한 append-only 레코드. 한 번의 run = 하나의 항목. `store/ledger/EXP-XXXX` 아래에 저장된다 (ADR-0003, ADR-0007). |
| **Small experiment / minimal reproduction** | 하나의 claim을 점검하는 토이 규모(toy-scale) 실험. v1 범위에 한정 — 대규모나 실규모(real-at-scale) TTT 훈련은 없음 (brief §11). |
| **Verdict** | **사전 등록된 decision rule**에 의해 게이트되는 실험의 **4값(four-value)** 결과: verdict를 결정하는 규칙은 run 이전에 고정된다. 값: `TODO(open-question: confirm the four verdict labels)` — supports / refutes / inconclusive / invalid에서 도출됨. verdict는 hypothesis의 status에 관계되지만 그 자체도 evidence cap의 적용을 받는다. |
| **Pre-registered decision rule** | 실행 이전에 ledger 항목에 선언된 성공/실패 기준으로, verdict가 결과에 끼워 맞춰질 수 없도록 한다. |
| **Reproducibility gate** | HARD gate: **config + seed + env**를 기록하지 않은 항목은 미완성이다. repro 메타데이터가 없으면 → 허용 가능한 verdict도 없다 (ADR-0003). |
| **Negative result** | 실패하거나 refute하는 실험. 일급(first-class)이다: 기본적으로 보존되고 분류되며 노출된다 (failures-useful). 결코 조용히 버려지지 않는다. |

## 4. TTT 도메인 용어

| Term | Definition |
| --- | --- |
| **TTT (test-time training)** | 고정된 weight를 읽기만 하는 대신 **추론(inference) 중에 모델 weight 또는 state를 갱신**하는 기법. CAW-06의 핵심 테마. 어떤 TTT 변종이 실제로 write back 하는지는 그 자체가 하나의 연구 질문이다 (ttt-landscape.md). |
| **Test-time compute** | 추론 시점에 쓰는 연산(검색, 샘플링, 적응). TTT와 관련되지만 더 넓다; 메모리 write traffic을 함의하는 경우에 관련된다. |
| **Writeback traffic** | 추론이 **write back** 할 때 생성되는 메모리 트래픽 — weight 갱신, gradient, optimizer state, updated-state 재사용. read-dominant LLM-serving 프로파일이 포착하지 못하는, CAW-01을 위한 후보 미래 **workload 축(axis)**. |
| **Memory-centric hypothesis** | TTT-class workload가 read-dominant inference-serving 가정과 다른 메모리 장치 속성을 필요로 한다는, 조사 대상인(확정되지 않은) 명제. |

## 5. Writeback-traffic schema (CAW-01 다리)

LOAD-BEARING(하중 지지). 변종별(per-variant) **`wbtraffic.v0`** 스키마로, **analytic L0 estimate**로
생산되며(선택적으로 하나의 토이 재현으로 grounding됨), **CAW-01의 기존 L0 객체 + open question 위로 내려진(lowered)
자기 기술적(self-describing) 번들**로 export된다. 공유 저장소가 아니라 **export**를 통해 다리를 놓는다 (ADR-0004).

| Field / term | Definition |
| --- | --- |
| **`wbtraffic.v0`** | TTT 변종의 writeback 메모리 특성을 기술하는, 버전이 매겨진 변종별 스키마 인스턴스. |
| **Write bandwidth** | 변종이 생성하는 writeback 바이트의 비율(토큰당 / 갱신당). |
| **Write endurance** | workload 전반에 걸쳐 메모리 장치에 함의되는 write-volume / 마모(wear) 요구. |
| **Near-memory update** | state 갱신이 메모리 근처에서/안에서 일어나는지 여부와 방식(near-memory / in-memory 최적화). |
| **Updated-state residency** | 갱신된 weight/optimizer state가 얼마나 오래, 어디에 상주하고 재사용되어야 하는지. |
| **Capacity/bandwidth ratio** | context 길이와 갱신 빈도에 따라 capacity-to-bandwidth 균형이 어떻게 이동하는지. |
| **L0 estimate** | 완전한 통합 없이 도출된 거친 analytic 값; **generated-not-evidence**이며 evidence cap의 적용을 받는다. |
| **L0/L1 bridge** | wbtraffic 번들을 CAW-01의 L0 객체와 open question 위로 내리는(lowering) 것. 완전한 syntorch/vLLM 통합 이전에 L0/L1에서 모델링된다. CAW-01 IR 객체 이름은 **CAW-01이 소유한다**(별도 제품) — 재검증하라; 공유 저장소 없음. |

```yaml
# wbtraffic.v0 — illustrative shape (field semantics fixed by ADR-0004; values are TODO)
schema: wbtraffic.v0
variant: <ttt-variant-id>
grounding: analytic-L0            # or: toy-reproduction
generated: true                   # generated-not-evidence; subject to evidence cap
fields:
  write_bandwidth:        TODO(open-question)
  write_endurance:        TODO(open-question)
  near_memory_update:     TODO(open-question)
  updated_state_residency: TODO(open-question)
  capacity_bandwidth_ratio:
    over_context_length:   TODO(open-question)
    over_update_frequency: TODO(open-question)
boundary: export:caw-01           # lowered onto CAW-01 L0 objects + open questions
```

## 6. Implication mapping

| Term | Definition |
| --- | --- |
| **ImplicationMap** | 한 finding의 결과를 여러 도메인에 걸쳐 매핑하는, finding 하나당 하나씩 생산되는 모델: AI 서비스, 교육, 개발 플랫폼, 모델, 하드웨어, memory-centric 시스템 (ADR-0006). |
| **Implication-map summary** | ImplicationMap의 서사적 종합(roll-up). 명시적으로 **generated**로 표시됨 — 증거가 아님 (generated-not-evidence). |

## 7. Storage & scheduling

| Term | Definition |
| --- | --- |
| **File-based store** | CAW-06 자신의 저장소; 엔티티별 markdown/JSON; 큰 artifact는 경로로(by path) (ADR-0007). |
| **Store layout** | `store/{sources,claims,hypotheses,ledger/EXP-XXXX,implications}`. |
| **Scheduled / triggered scout** | schedule 또는 trigger에 따라 ExperimentScout Run을 시작하는 자동화 surface. 자동 scouting은 제안/hypothesis 생성만 한다; 전략적 결정은 Jimmy가 검토한다. |
| **`boundary`** | 모든 엔티티에 요구되는 필드로, 그것이 internal인지, import된 것인지, 명명된 export로 향하는 것인지를 기록한다 — no-shared-store 계약을 데이터 수준으로 구현한 것. |

## 8. Ports & adapters

**문서화된 stub**을 갖춘 Ports & adapters: 모든 이음매(seam)를 설계하되 v1만 빌드한다 (brief §9, ADR-0005, ADR-0008).

| Term | Definition |
| --- | --- |
| **SourceAdapter** | 수집(ingestion) source를 위한 port. v1 = arXiv/Semantic Scholar + CAW-05 signal import; 그 외는 문서화된 stub. 5단계 수집 파이프라인 뒤에 위치한다 (ADR-0005). |
| **ExperimentRunnerAdapter** | 실험 실행을 위한 port. v1 = 최소한의 로컬 토이 실험 runner; 외부 compute / HW는 stub. |
| **ExportAdapter** | 유일한 export 이음매; 설정 기반(config-driven) 레지스트리. ExportAdapter 바깥에서는 어떤 export도 일어나지 않는다 (ADR-0008). |
| **Caw01WritebackAdapter** | `wbtraffic.v0` 번들 + future-workload open question을 CAW-01 위로 내리는 v1 ExportAdapter. 공유 저장소가 아닌 export. |
| **Caw02ClaimAdapter** | claim + 증거를 CAW-02로 export하는 v1 ExportAdapter. |
| **Documented stub** | 계약(contract)이 문서화되어 재설계 없이 추가될 수 있는, 명명되었으나 빌드되지 않은 adapter(예: `Caw03Novelty`). |

### 8.1 수집 단계(Ingestion stages) (ADR-0005)

`S1 Discover → S2 Import from CAW-05 → S3 Canonicalize + Dedup → S4 Extract claims → S5 Persist`. SourceAdapter
port 뒤에 있는, 멱등 + 재개 가능한 하나의 파이프라인.

## 9. CAW-0X 패밀리 (제품 간 경계)

CAW-06은 **독립적**이다. 형제 제품에 대한 참조는 **import/export 경계**다 — 결코 공유 저장소, 레지스트리,
런타임 기반(substrate)이 아니다. 다른 제품이 소유한 IR/객체 이름은 import하지 않고 재검증한다.

| Product | CAW-06과의 관계에서의 역할 |
| --- | --- |
| **CAW-01** | 시뮬레이션 control plane. CAW-06은 writeback-traffic schema + future-workload open question을 그것으로 **export**한다 (L0/L1 bridge). TTT = CAW-01을 위한 후보 미래 workload 축. |
| **CAW-02** | 지식 저장소(repo). CAW-06은 검증된 claim + 증거를 그것으로 **export**한다. |
| **CAW-03** | Novelty (문서화된 stub export 대상, 예: novelty cue). |
| **CAW-05** | Radar. CAW-06은 그것으로부터 TTT radar signal을 **import**한다 (S2). |
| **CAW-0X** | 6개 제품 `ai-workbench` 패밀리의 임의의 형제 제품에 대한 일반 자리표시자(placeholder). |

## Open Questions

- 네 개의 `verdict` 라벨 (§3) — ADR-0003 문구와 대조 확인. `TODO(open-question)`
- 각 `wbtraffic.v0` 필드의 수치 의미/단위. `TODO(open-question)`
- 번들이 내려지는 정확한 CAW-01 L0 객체 이름(CAW-01이 소유; 재검증). `TODO(open-question)`
- [08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) 참조.

## Implications for runbooks

- Runbook은 이 정확한 용어 이름을 반드시 사용해야 한다 (DOC-CONVENTIONS §7). 새 도메인 용어는 여기에 먼저 추가된다.
- 경계를 넘는 모든 artifact는 `status` + `uncertainty`를 반드시 지니고 **evidence cap**을 존중해야 한다.
- 생성된 콘텐츠는 영속화되거나 export되는 곳마다 generated로 반드시 태그되어야 한다 (generated-not-evidence).
