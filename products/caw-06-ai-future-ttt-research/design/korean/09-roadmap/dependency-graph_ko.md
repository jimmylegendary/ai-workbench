# 의존성 그래프(Dependency Graph)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [./milestones-and-phases_ko.md](./milestones-and-phases_ko.md), [./risks-and-mitigations_ko.md](./risks-and-mitigations_ko.md), [../01-decisions/ADR-0001-product-surface-and-scout_ko.md](../01-decisions/ADR-0001-product-surface-and-scout_ko.md), [../01-decisions/ADR-0004-writeback-traffic-schema_ko.md](../01-decisions/ADR-0004-writeback-traffic-schema_ko.md), [../01-decisions/ADR-0008-export-boundaries_ko.md](../01-decisions/ADR-0008-export-boundaries_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적
런북이 안전하게 순서화되고 병렬화될 수 있도록 CAW-06 컴포넌트 간의 빌드 순서 DAG를 정의한다. 이것은 엄격한
순서 제약을 인코딩한다: **어댑터 이전에 port + store; 실험 이전에 ingestion + hypothesis; export 이전에 실험 +
writeback; 어떤 CAW-01 export 이전에도 writeback 스키마.** 이 문서는 날짜를 할당하거나 컴포넌트 범위를 재정의하지
않는다(ADR 참조).

## 순서 제약 (규칙)

| # | Rule | Why |
|---|------|-----|
| R1 | 모든 것 이전에 Store layout + record schemas | 모든 컴포넌트가 CAW-06 소유 store를 읽고/쓴다(ADR-0007) |
| R2 | 어댑터 이전에 Port | 어댑터는 port 계약을 구현한다; stub이 먼저 문서화됨(ADR-0001, ADR-0008) |
| R3 | 실험 이전에 Ingestion(S1–S5) + hypothesis | 실험은 source에서 온 claim에서 유도된 hypothesis를 시험한다(ADR-0002, ADR-0005) |
| R4 | export 이전에 실험 ledger + writeback 스키마 | 존재하는 결과/추정치만 export할 수 있다(ADR-0003, ADR-0004) |
| R5 | `Caw01WritebackAdapter` 이전에 `wbtraffic.v0` 스키마 | CAW-01 브리지는 스키마 bundle을 export한다; 스키마 없으면 lowering할 것 없음(ADR-0004, ADR-0008) |
| R6 | finding이 존재한 후 Implication map | map은 finding의 도메인을 상세화한다(ADR-0006) |

## DAG (ASCII)

```
                         +------------------------+
                         |  Store layout + record |   (R1, ADR-0007)
                         |  schemas (Source/Claim/|
                         |  Hypothesis/Ledger/Impl)|
                         +-----------+------------+
                                     |
                 +-------------------+-------------------+
                 v                   v                   v
        +----------------+  +-----------------+  +------------------+
        | SourceAdapter  |  | ExperimentRunner|  | ExportAdapter    |  (R2: ports
        | PORT (+stubs)  |  | Adapter PORT    |  | PORT (+stubs)    |   before
        +-------+--------+  +--------+--------+  +---------+--------+   adapters)
                |                    |                     |
                v                    |                     |
   +-------------------------+       |                     |
   | Ingestion pipeline      |       |                     |
   | S1 Discover -> S2 Import |       |                     |
   | (CAW-05) -> S3 Canon/   |       |                     |
   | Dedup -> S4 Extract     |       |                     |
   | claims -> S5 Persist    |       |                     |
   +-----------+-------------+       |                     |
               |                     |                     |
               v                     |                     |
   +-------------------------+       |                     |
   | Hypothesis records      |       |                     |
   | (4-state status,        |       |                     |
   |  uncertainty, ev. cap)  |       |                     |
   +-----------+-------------+       |                     |
               |   (R3)             |                     |
               +---------+----------+                     |
                         v                                |
              +-----------------------+                   |
              | Experiment ledger     |                   |
              | EXP-XXXX append-only, |                   |
              | pre-reg rule, verdict,|                   |
              | reproducibility gate  |                   |
              +-----+-----------+-----+                   |
                    |           |                         |
          (R6)      v           v  (R4)                   |
        +-------------------+  +------------------------+  |
        | ImplicationMap    |  | wbtraffic.v0 schema    |  |
        | (gen-summary flag)|  | analytic L0 estimate   |  |
        +---------+---------+  | (+ open questions)     |  |
                  |           +-----------+------------+  |
                  |                       | (R5)          |
                  |                       v               v
                  |            +-------------------------------+
                  +----------> | ExportAdapter v1 (registry)   |
                               |  - Caw01WritebackAdapter ===>  ]==> CAW-01
                               |  - Caw02ClaimAdapter      ===>  ]==> CAW-02
                               |  - Caw03Novelty (stub)        |  (separate
                               +-------------------------------+   products,
                                                                   boundary only)
```

## 경계 노트 (공유 저장소 없음)
CAW-01과 CAW-02로 들어가는 `===>` 화살표는 **export 경계**다: 구성된 경로에 기록된 자기 기술적 bundle이며,
그 다음 그 독립 제품들이 소비한다. CAW-06는 결코 형제 제품의 내부 store를 읽거나/쓰지 않으며, CAW-01 IR 객체
이름은 **CAW-01이 소유한다** — 가정하지 말고 재검증하라(ADR-0004, ADR-0008).

## 병렬화 가능 대 직렬

| Can build in parallel | Strictly serial |
|-----------------------|-----------------|
| 세 port 인터페이스(R1 이후) | Hypothesis → Experiment (R3) |
| `SourceAdapter` v1 ⟂ `ExperimentRunnerAdapter` v1 | Experiment → ImplicationMap (R6) |
| ImplicationMap ⟂ wbtraffic.v0 (둘 다 finding 필요) | wbtraffic.v0 → Caw01WritebackAdapter (R5) |

## Milestone 1까지의 임계 경로(critical path)
```
store/schemas -> SourceAdapter port+v1 -> ingestion S1..S5 -> hypothesis
   -> ExperimentRunner port+v1 -> ledger entry (verdict) -> wbtraffic.v0 (L0)
   -> ExportAdapter port -> Caw01WritebackAdapter -> [boundary] CAW-01
```
ImplicationMap은 finding에 매달려 있으며 M1 체크리스트가 닫히기 전에 합류하지만, schema→CAW-01 임계 경로 위에는
있지 않다.

## 미해결 질문(Open Questions)
- S2의 CAW-05 import가 먼저 안정적인 signal 스키마를 요구하는가? `../08-research-plan/open-questions_ko.md`에서 추적.

## 런북에 대한 함의
- 이 DAG로 런북을 위상 정렬(topologically sort)하라; 런북은 오직 상류 노드만 `Depends on:` 할 수 있다.
- 두 export 어댑터는 P4의 마지막 런북이다; 그 전제 조건은 R4+R5가 충족된 것이다.
