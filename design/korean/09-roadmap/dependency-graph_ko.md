# 의존성 그래프(Dependency Graph) — CAW-01

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [milestones-and-phases.md](./milestones-and-phases_ko.md), [../10-runbooks/README.md](../10-runbooks/README_ko.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## 목적

단계들과 주요 구성요소 간의 의존성 DAG를 정의하여, runbook이 유효한 순서로 실행되고 병렬 작업이
가시화되도록 한다.

## 단계 DAG

```
phase-0 (foundations: monorepo, @caw/core, data layer, design system)
   │
   ▼
phase-1 (app shell: nav, 1:9 layout, store, run/save wiring)
   │
   ├───────────────► phase-2 (canvases: C1/C2, C3 spike→build, work-tree UI)
   │
   └───────────────► phase-3 (engine: L0 IR, lowering, projection)
                          │
                          ▼
                       phase-4 (trace pipeline: syntorch capture, Chakra exporter, ASTRA-sim)
                          │
                          ▼
                       phase-5 (MCP + CLI surfaces)
```

phase-2와 phase-3는 phase-1 이후 **병렬**로 진행할 수 있다(UI가 엔진을 막지 않고 그 반대도 마찬가지).
이들은 Milestone 1에서 수렴한다.

## 구성요소 수준 의존성

```
@caw/core contract ──► everything (single contract)
data layer (phase-0) ──► work-tree UI, runs, IR storage
L0 IR schema ──► Chakra→L0 lowering ──► projection ──► evidence export
Chakra reference round-trip (T1) ──► syntorch capture ──► Chakra exporter ──► ASTRA-sim integration
Canvas-3 3D spike (OQ-08) ──► Canvas-3 build
hardware config (Canvas 3) ──► ASTRA-sim/SST run
serving grammar (Canvas 2) ──► SimulationConfig ──► RunService.start
```

## Milestone 1까지의 임계 경로(critical path)

```
phase-0 ─► phase-1 ─► phase-3 (L0 + lowering + projection)
                   └─► phase-4 (T1 round-trip ─► syntorch ─► Chakra ─► ASTRA-sim)
   ─► T2 L0 round-trip ─► comparable projection ─► UC-1 demo
```

Canvas-3 3D 및 MCP/CLI는 Milestone-1 임계 경로 **밖**에 있다(의도적으로 연기됨).

## 하드 게이트(Hard gates)

| 게이트 | 차단 대상 |
| --- | --- |
| Boundary/CI lint (phase-0) | 모든 기능 코드 |
| T1 Chakra→ASTRA-sim 라운드트립 | syntorch 배선(phase-4) |
| Canvas-3 3D 스파이크 (OQ-08) | Canvas-3 빌드 |
| T2 L0 라운드트립 | Milestone 1 사인오프 |

## 미해결 질문

단일 빌더의 예산을 고려할 때 phase-2가 phase-3와 완전히 병렬화될 수 있는지 — TODO(open-question),
[risks-and-mitigations.md](./risks-and-mitigations_ko.md) 참조.

## runbook에 대한 함의

runbook의 `Depends on:` 필드는 이 DAG를 정확히 반영해야 한다. 어떤 runbook도 자신의 게이트가 통과되기 전에는
시작하지 않는다.
