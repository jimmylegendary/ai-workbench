# 데이터 흐름 — CAW-01

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [system-architecture_ko.md](./system-architecture_ko.md), [../05-caw01-simulation-control-plane/trace-pipeline-syntorch-chakra_ko.md](../05-caw01-simulation-control-plane/trace-pipeline-syntorch-chakra_ko.md), [../05-caw01-simulation-control-plane/l0-ir-schema_ko.md](../05-caw01-simulation-control-plane/l0-ir-schema_ko.md), [../04-data-layer/work-tree-and-versioning_ko.md](../04-data-layer/work-tree-and-versioning_ko.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF_ko.md

## 목적

시스템의 종단 간(end-to-end) 흐름을 추적한다: 실험 구성, 여러 축(axes)에 걸친 실행, L0로의 정규화, 프로젝션(projection) 생성, 그리고 work-tree를 통한 저장. 저장 세부사항은 `04-*`에, 엔진 세부사항은 `05-*`에 있다.

## Flow A — compose → run → project

```
User (Canvas 1/2/3)
  │  edits  -> Zustand store -> Server Action
  ▼
@caw/core ExperimentService.create/update            (Zod-validated Experiment)
  │
  ▼  RunService.start(experimentId, runConfig)
@caw/core ───► engine-adapter ports ───► Python engine
                                          ├─ synthetic axis: syntorch capture ─► Chakra exporter ─► chakra.<rank>.et
                                          ├─ simulation axis: LLMServingSim ──────────────────────► chakra (per-iter)
                                          ├─ ASTRA-sim(analytical) times each ET ─► metrics + artifacts
                                          └─ L0 lowering: ET(s) ─► one L0 IR (+ capacity/traffic rollups)
  │  returns: artifact PATHS + metrics (never inline blobs)
  ▼
EvidenceService.registerArtifact / metrics / projection
  │
  ▼
Comparable projection rendered in control panel + canvases
```

세 개의 축은 문자 그대로의 체인이 아니라 **하나의 L0로 병렬로** 실행된다 ([ADR-0005](../01-decisions/ADR-0005-trace-pipeline_ko.md)).

## Flow B — save (work-tree)

```
Canvas edit ─► change_blob (content-addressed)
per-item save ─► WorkTreeService.saveItem(subtreePath, blob) ─► change_commit (subtree)
full save     ─► WorkTreeService.saveAll(message)            ─► change_commit (root_tree)
branch        ─► WorkTreeService.branch(fromRef, name)       ─► new ref
```

모든 commit은 `{author, surface, message, created_at, parents[]}`를 기록한다 ([ADR-0007](../01-decisions/ADR-0007-change-management-worktree_ko.md)).

## Flow C — 다운스트림(downstream)을 위한 증거/프로젝션

```
Experiment (refs) ─► EvidenceService.projection(refs[]) ─► Projection (comparable rows)
                  ─► EvidenceService.trustStatus(runId) ─► TrustLadderStatus
                  ─► export artifact (claims point to evidence) ─► CAW-03 paper/patent
```

## 아티팩트 처리 규칙

큰 blob(Chakra ET, OTel, raw sub-torch 덤프, raw InputTrace)은 엔진이 파일시스템/객체 저장소에 쓰고 Postgres 행에서 **path/URI**로 참조된다. 이들은 TS⇆Python 이음새를 가로질러 인라인으로 이동하지 않는다 ([ADR-0002](../01-decisions/ADR-0002-data-layer_ko.md)).

## 스트리밍(Streaming)

`RunService.status(runId)`는 스트리밍 가능하다. 웹 앱은 Route Handler(SSE/stream)를 통해 구독하고, 사람의 변경(mutation)은 Server Action을 거친다 ([ADR-0003](../01-decisions/ADR-0003-frontend-stack_ko.md)).

## 미해결 질문(Open questions)

LLMServingSim에 내장된 ASTRA-sim을 simulation 축에 직접 사용할지, 아니면 독립형(standalone) ASTRA-sim 호출로 대체할지 — Flow A 연결에 영향을 준다 ([../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md)).

## 런북(runbook)에 대한 함의

Flow A는 phase-3(엔진) + phase-4(트레이스 파이프라인) 런북의 척추다. Flow B는 phase-2의 work-tree 런북을 구동하고, Flow C는 증거/프로젝션 런북을 구동한다.
