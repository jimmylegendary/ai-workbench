# 기술 스택 — CAW-01

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [system-architecture_ko.md](./system-architecture_ko.md), [repo-structure_ko.md](./repo-structure_ko.md), [../01-decisions/](../01-decisions/)의 모든 ADR
- **Source of truth:** ../_meta/SOURCE-BRIEF_ko.md

## 목적

각 계층(tier)별로 선택한 구체적 기술과, 그 이유 및 고정(pin)할 버전. 고정 버전은 phase-0 런북이 lockfile을 잠글 때까지 TODO(open-question)이다.

## 스택 표

| Tier | 선택(Choice) | 이유(Why) | Pin |
| --- | --- | --- | --- |
| Monorepo | pnpm workspaces + Turborepo | CAW-01 자체 product core 위에 여러 패키지/surface | TODO |
| Language (app) | TypeScript (strict) | surface 전반에 걸친 단일 타입 계약 | TODO |
| Web framework | Next.js (App Router) | 서버 셸 + 클라이언트 아일랜드; Server Actions ([ADR-0003](../01-decisions/ADR-0003-frontend-stack_ko.md)) | TODO |
| UI state | Zustand (single store) | 캔버스 간 조정 ([ADR-0004](../01-decisions/ADR-0004-canvas-rendering_ko.md)) | TODO |
| Validation | Zod | `@caw/core` 계약 | TODO |
| Canvas 1 & 2 | @xyflow/react (React Flow v12) | 노드/엣지 그래프, 타입이 지정된 핸들 | TODO |
| Canvas 3 | react-three-fiber + drei (3D) | LOD/instancing을 갖춘 HW 계층 구조; Konva 2D 폴백은 spike 결과에 따라 게이팅 ([ADR-0004](../01-decisions/ADR-0004-canvas-rendering_ko.md)) | TODO |
| Design system | shadcn/ui + Radix + Tailwind v4 + DTCG tokens | "open design" 코드를 출처로 삼기(code-as-source-of-truth) ([ADR-0006](../01-decisions/ADR-0006-design-system-open-design_ko.md)) | TODO |
| Core | `@caw/core` (TS, zero next) | CAW-01 자체 product core: 도메인 로직 + 포트 ([ADR-0001](../01-decisions/ADR-0001-product-surface_ko.md)) | n/a |
| Surfaces | Next.js / MCP server / CLI | Web 우선; MCP+CLI는 CAW-01 자체 자동화 surface | TODO |
| Engine | Python service | syntorch, LLMServingSim, ASTRA-sim, L0 lowering | TODO |
| Engine deps | syntorch (internal), vLLM (harness), LLMServingSim, ASTRA-sim (+SST flag), Chakra toolchain | 세 개의 축 ([ADR-0005](../01-decisions/ADR-0005-trace-pipeline_ko.md)) | TODO — vLLM V0/V1, Chakra et_def.proto 리비전, ASTRA-sim 리비전 고정 |
| System of record | Postgres (prod) / **SQLite first, PG-portable** | 다언어(polyglot) 척추 ([ADR-0002](../01-decisions/ADR-0002-data-layer_ko.md)) | TODO |
| Semantic search | pgvector (in-DB, 필요할 때) | 이 규모에서는 두 번째 저장소 불필요 | TODO |
| Artifact store | filesystem / object store | path/URI 기반의 큰 트레이스 blob | TODO |
| Tests | Vitest (TS), pytest (engine), Playwright (e2e) | 런북을 위한 계층별 검증 | TODO |

## 핵심 버전 고정 (phase-0/연구에서 반드시 해결)

- **vLLM 엔진 버전** (V0 vs V1) 및 syntorch가 충족해야 하는 정확한 torch API 표면.
- **Chakra `et_def.proto` 리비전** (스키마가 MLCommons 아래에서 여전히 진화 중).
- **ASTRA-sim 리비전** 및 어떤 네트워크 백엔드가 연결되는지(analytical 기본값).

## 경계 리마인더

`@caw/core`는 `next` 의존성이 전혀 없고, Python 엔진은 Next.js 프로세스에서 절대 실행되지 않는다 ([system-architecture_ko.md](./system-architecture_ko.md)).

## 미해결 질문(Open questions)

객체 저장소 선택(로컬 FS 대 MinIO/S3)은 규모가 요구할 때로 연기 — TODO(open-question).

## 런북(runbook)에 대한 함의

Phase-0 런북은 이 표를 실제 `package.json`/`pyproject.toml` + lockfile로 바꾸고, 해결된 고정값을 이 문서에 다시 기록한다.
