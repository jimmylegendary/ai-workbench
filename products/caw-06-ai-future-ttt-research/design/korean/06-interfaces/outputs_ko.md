# Outputs — 다섯 가지 산출물 종류와 그들이 안착하는 곳

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF_ko.md) (§4 출력, §7 데이터, §12 가드레일)
  - [./cli-and-mcp_ko.md](./cli-and-mcp_ko.md) (`render` / `show-*` op)
  - [./scout-pipeline_ko.md](./scout-pipeline_ko.md) (어떤 단계가 어떤 산출물을 내보내는지)
  - [../01-decisions/ADR-0001-product-surface-and-scout.md](../01-decisions/ADR-0001-product-surface-and-scout_ko.md) (하나의 thread에 대한 뷰로서의 다섯 산출물)
  - [../01-decisions/ADR-0002-hypothesis-representation.md](../01-decisions/ADR-0002-hypothesis-representation_ko.md) (hypothesis 카드)
  - [../01-decisions/ADR-0003-experiment-ledger.md](../01-decisions/ADR-0003-experiment-ledger_ko.md) (ledger 항목)
  - [../01-decisions/ADR-0004-writeback-traffic-schema.md](../01-decisions/ADR-0004-writeback-traffic-schema_ko.md) (writeback 스키마 / CAW-01 브리지)
  - [../01-decisions/ADR-0006-implication-mapping.md](../01-decisions/ADR-0006-implication-mapping_ko.md) (implication map)
  - [../01-decisions/ADR-0007-storage-and-scheduling.md](../01-decisions/ADR-0007-storage-and-scheduling_ko.md) (저장소 레이아웃)
  - [../01-decisions/ADR-0008-export-boundaries.md](../01-decisions/ADR-0008-export-boundaries_ko.md) (export 어댑터)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적
CAW-06가 내보내는 **다섯 가지 출력 산출물 종류**(brief §4)를 열거하고, 각각이 **파일 저장소 어디에 안착하는지**
(ADR-0007), 각각이 어떤 **불변식**(과장 금지, 실패-유용성)을 지니는지, 그리고 어떤 것이 export로서 **제품 경계**를
가로지르는지를 정리한다. 산출물별 스키마를 재정의하지는 않는다 — 그것들은 각 행에 링크된 ADR이 소유한다. 이 문서는
카탈로그 + 안착 지도다. 다섯 가지 모두 **하나의 thread 저장소의 렌더링/파생물**이다(ADR-0001 §C): 하나의 발견은
카드, ledger 추적, implication map, export 번들로 나타나며, 하나의 provenance 매니페스트와 하나의 불확실성 값을 공유한다.

## 카탈로그

| # | 산출물 | 내보내는 단계 | 소유 ADR | 안착 위치 | 경계 가로지름? |
|---|---|---|---|---|---|
| 1 | **Research-thread record** | spine (모든 단계) | ADR-0001 | `store/threads/THR-XXXX.md` (+ 링크) | 아니오 — 내부 spine |
| 2 | **Small-experiment ledger entry** | log-result | ADR-0003 | `store/ledger/EXP-XXXX/` (+ 경로별 `artifacts/EXP-XXXX/`) | 아니오 (증거는 카드를 통해 export 가능) |
| 3 | **Hypothesis card** | hypothesize | ADR-0002 | `store/hypotheses/HYP-XXXX.md` | CAW-02 export 경유(gated) |
| 4 | **Implication map** | map-implications | ADR-0006 | `store/implications/IMP-XXXX.md` | export 전 라우팅 계층 |
| 5 | **Writeback-traffic schema artifact** | (TTT finding) | ADR-0004 | `store/writeback/WB-XXXX.json` | **예 → CAW-01** (gated, ADR-0008) |

저장소 레이아웃, append 전용 + supersede, 경로별 대형 산출물, 파생 인덱스는 모두
[ADR-0007](../01-decisions/ADR-0007-storage-and-scheduling_ko.md)에서 고정된다. Export receipt는 `store/exports/`에 안착한다.

## 1. Research-thread record (spine)
하나의 `source → claim → hypothesis → experiment → result → implication` 체인을 provenance, `status`/
`uncertainty`, `boundary`와 함께 연결한다(brief §2, §7). 이것이 영속 단위이며, 나머지 네 산출물은 여기에 매달린다.

```yaml
# store/threads/THR-0042.md (front-matter)
id: THR-0042
boundary: internal
provenance: {discovered_by: scout, run: RUN-0091, fetched_at: TODO}
source: SRC-0007            # → store/sources/
claim: CLM-0011            # → store/claims/
hypothesis: HYP-0042       # → store/hypotheses/
experiments: [EXP-0007]    # → store/ledger/
implication_map: IMP-0003  # → store/implications/
writeback: WB-0003         # → store/writeback/ (TTT threads only)
current_status: hypothesis  # resolver-computed; NEVER a bare claim
```

## 2. Small-experiment ledger entry
하나의 toy reproduction = **하나의 append 전용 항목**(ADR-0003). **사전 등록된 결정 규칙**과 엄격한
**reproducibility gate**(config+seed+env)로 게이트된 **4값 verdict**를 지닌다. **부정적 결과는 보존되고, 분류되며,
기본으로 표면화된다**([cli-and-mcp_ko.md](./cli-and-mcp_ko.md) `negative-results`).

```yaml
# store/ledger/EXP-0007/entry.md (front-matter)
id: EXP-0007
hypothesis: HYP-0042
verdict: supports | refutes | inconclusive | invalid   # against pre-registered rule
decision_rule: "metric M crosses T under config C"      # registered BEFORE the run
repro: {config: artifacts/EXP-0007/config.yaml, seed: 1234, env: artifacts/EXP-0007/env.lock}
artifacts_path: artifacts/EXP-0007/      # metrics/logs/plots by path, never inlined
negative: false                          # if true → still kept + surfaced
```

크래시/중단도 여전히 항목을 기록한다(`invalid`/`aborted`) — 실패는 조용히 누락될 수 없다
([scout-pipeline_ko.md](./scout-pipeline_ko.md) §failure handling).

## 3. Hypothesis card
`Hypothesis`의 렌더링으로, **`status` + `confidence`를 반드시 표시**하고 전체 run 이력을 표시한다(ADR-0002).
상류에 세 가지로 분리된 레코드 종류(Source / Claim / Hypothesis); `hypothesis`를 기본으로 하는 4상태 가역 라이프사이클.
**가설은 결코 확정된 주장으로 출력되지 않는다**; **생성된 증거는 status를 승격할 수 없다**(엄격한 evidence cap).

```yaml
# store/hypotheses/HYP-0042.md (front-matter)
id: HYP-0042
status: hypothesis | supported | refuted | inconclusive   # default hypothesis; reversible
confidence: very-low | low | moderate | high              # calibrated; ≤ evidence_strength
evidence: [EXP-0007]              # ledger links; generated summaries are NOT evidence
status_log: [{to: hypothesis, by: scout, run: RUN-0091}]  # append-only
claim: CLM-0011                  # kept separate from the hypothesis
```

## 4. Implication map
6단계 팬아웃: 발견당 하나의 map, **AI services, education, dev platforms, models, hardware, memory-centric** 도메인에
걸친 타입화되고 불확실성-태깅된 implication(ADR-0006). 그 **요약은 명시적으로 `generated`로 표시**되며 **증거가
아니다**(brief §12). 이것이 export 전 라우팅 계층이다.

```yaml
# store/implications/IMP-0003.md (front-matter)
id: IMP-0003
finding: THR-0042
summary_kind: generated          # NOT evidence
implications:
  - {domain: hardware, text: "...", uncertainty: low}
  - {domain: memory-centric, text: "...", uncertainty: very-low}
```

## 5. Writeback-traffic schema artifact (CAW-01 브리지 — LOAD-BEARING)
변형(variant)별 `wbtraffic.v0` 스키마(ADR-0004). **v1은 분석적 L0 추정치**로 생산되며(선택적으로 하나의 toy
reproduction으로 grounding), CAW-01의 기존 L0 객체 + open question 위에 내려놓은(lowered) **자기서술적 번들**로
export된다. 이는 TTT write traffic을 모델링한다; CAW-01의 IR 객체 이름을 가정하지 않는다(그것들은 **별개의 제품**인
CAW-01이 소유한다 — 재검증, 공유 저장소 없음).

```json
// store/writeback/WB-0003.json (wbtraffic.v0)
{
  "schema": "wbtraffic.v0",
  "variant": "TODO(open-question: which TTT variant; verify it actually writes back)",
  "level": "L0-analytic",
  "fields": {
    "write_bandwidth": "TODO(open-question)",
    "write_endurance": "TODO(open-question)",
    "near_memory_update": "TODO(open-question)",
    "updated_state_residency": "TODO(open-question)",
    "capacity_bandwidth_ratio": "TODO(open-question: over context length & update frequency)"
  },
  "grounding": "analytic | toy-repro:EXP-XXXX",
  "open_questions": ["..."],
  "boundary": "export:caw01"
}
```

벤치마크 수치는 발명되지 않는다 — 모든 필드는 분석적 모델 또는 ledger의 toy reproduction으로 grounding될 때까지
`TODO(open-question)`이다.

## 경계 & export (공유 저장소 없음)
Export는 오직 **`ExportAdapter`** 이음새(ADR-0008)를 통해서만, config 기반으로, 그리고 **사람 게이트**
([cli-and-mcp_ko.md](./cli-and-mcp_ko.md)) 이후에만 나간다:

| 번들 | Adapter (v1) | 운반물 | 경계 규칙 |
|---|---|---|---|
| Writeback 스키마 + open question → **CAW-01** | `Caw01WritebackAdapter` | CAW-01 L0 객체 위에 내려놓은 산출물 #5 | 자기서술적 파일 번들; 공유 저장소 **아님**; IR 이름 재검증 |
| Claim + 증거 → **CAW-02** | `Caw02ClaimAdapter` | status+evidence를 가진 산출물 #2/#3 | `status`/`uncertainty`가 제거된 채로는 아무것도 넘어가지 않음 |
| Novelty cue → CAW-03 등 | 문서화된 **스텁** | — | `HealthStatus="deferred"` 보고 |

**모든 경계에 걸친 불변식:** `status`/`uncertainty` 없이는 아무것도 나가지 않는다; 가설은 결코 확정된 주장으로 나가지
않는다; 생성된 요약은 표시되며 증거가 아니다(brief §12; ADR-0002, ADR-0008).

## 미해결 질문(Open Questions)
- TODO(open-question: which TTT variants actually write back — gates the writeback artifact; brief §6.)
- TODO(open-question: can writeback traffic be modeled at L0/L1 before full syntorch/vLLM integration? — ADR-0004.)
- TODO(open-question: retention/GC for large failure artifacts under `artifacts/` — ADR-0003/0007.)
  [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) 참조.

## 런북에 대한 함의
- RB: 하나의 thread 저장소 위 다섯 산출물 렌더러; 각각은 내보내기 전 자신의 ADR 불변식을 단언한다.
- RB: hypothesis-card 렌더러는 `status` + `confidence` 없이는 출력을 거부한다.
- RB: writeback exporter는 자기서술적 번들을 내보내며(CAW-01 객체 이름 가정 없음) `confirm` 뒤에 게이트된다.
- RB: negative-results 뷰는 ledger를 읽고 기본으로 `refutes`/`invalid`/negative 항목을 표면화한다.
