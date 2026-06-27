# 레포 구조 — CAW-01

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [component-boundaries_ko.md](./component-boundaries_ko.md), [tech-stack_ko.md](./tech-stack_ko.md), [../10-runbooks/phase-0-foundations/RB-000-repo-scaffold_ko.md](../10-runbooks/phase-0-foundations/RB-000-repo-scaffold_ko.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF_ko.md

## 목적

런북들이 구축해 나가는 모노레포 레이아웃. 경계/소유권의 근거는 [component-boundaries_ko.md](./component-boundaries_ko.md)에 있으며, 이 문서는 물리적 디렉터리 지도다.

## 디렉터리 트리

```
caw01-workbench/
├─ package.json                 # pnpm workspace root + turbo
├─ pnpm-workspace.yaml
├─ turbo.json
├─ packages/
│  ├─ core/                     # @caw/core — domain services, Zod schemas, PORT + repo interfaces (zero next)
│  │  ├─ src/services/          # ExperimentService, RunService, RegistryService, WorkTreeService, EvidenceService
│  │  ├─ src/schemas/           # Zod schemas = the one contract
│  │  └─ src/ports/             # engine-adapter + repository interfaces
│  ├─ db/                       # @caw/db — repo impls, migrations, artifact-store client (Postgres/SQLite)
│  │  └─ migrations/
│  ├─ engine-adapters/          # @caw/engine-adapters — TS side of the Python seam
│  └─ design-tokens/            # DTCG *.tokens.json + build to Tailwind theme (open-design)
├─ apps/
│  ├─ web/                      # Next.js App Router (primary surface)
│  │  ├─ app/(simulation)/      # Simulation screen: 1:9 layout
│  │  ├─ app/(module-design)/   # Module Design menu
│  │  ├─ components/canvases/   # canvas-1 (React Flow), canvas-2 (React Flow), canvas-3 (r3f)
│  │  ├─ components/control-panel/
│  │  ├─ components/work-tree/
│  │  └─ store/                 # single Zustand store
│  ├─ mcp/                      # MCP server over @caw/core
│  └─ cli/                      # CLI over @caw/core
├─ engine/                      # Python engine service (out-of-process)
│  ├─ syntorch_capture/
│  ├─ chakra_export/
│  ├─ servingsim/
│  ├─ astrasim/
│  └─ l0_lowering/
├─ artifacts/                   # local artifact store (gitignored) — trace blobs by path
└─ design/                      # THIS design set (docs + runbooks)
```

## 관례(Conventions)

- TS 패키지는 `@caw/*`이며, surface는 `apps/` 아래에 위치한다.
- Python 엔진은 npm 패키지가 아니라 형제(sibling) 서비스다. TS 쪽은 오직 `@caw/engine-adapters`를 통해서만 엔진과 통신한다 ([system-architecture_ko.md](./system-architecture_ko.md)의 이음새).
- `artifacts/`는 DB 행에서 path/URI로 참조되는 큰 blob을 담으며, gitignore된다.
- 일회성 spike에서 생성/스캐폴딩된 UI는 명확하게 표시된 폐기용(throwaway) 디렉터리에 두며, 출처가 되는(source-of-truth) 컴포넌트를 절대 덮어쓰지 않는다 ([ADR-0006](../01-decisions/ADR-0006-design-system-open-design_ko.md)).

## 미해결 질문(Open questions)

`engine/`을 같은 레포(모노레포)에 포함할지, 아니면 고정된 인터페이스를 가진 형제 레포로 둘지 — v1에서는 모노레포 쪽으로 기울고 있다; TODO(open-question).

## 런북(runbook)에 대한 함의

[RB-000-repo-scaffold](../10-runbooks/phase-0-foundations/RB-000-repo-scaffold_ko.md)는 어떤 기능 런북이 실행되기 전에 빈 인터페이스 파일 + lint/CI 가드와 함께 정확히 이 트리를 생성한다.
