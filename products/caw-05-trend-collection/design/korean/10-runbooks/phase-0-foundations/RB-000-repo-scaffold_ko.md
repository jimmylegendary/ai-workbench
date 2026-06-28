# RB-000: CAW-05 파이프라인 repo + files-as-truth 트리 스캐폴딩 (컴파일되는 skeleton)

- Status: ready
- Phase: phase-0-foundations
- Depends on: []
- Implements design: [../../03-architecture/repo-structure_ko.md](../../03-architecture/repo-structure_ko.md), [../../03-architecture/tech-stack_ko.md](../../03-architecture/tech-stack_ko.md), [../../01-decisions/ADR-0001-product-surface-and-outputs_ko.md](../../01-decisions/ADR-0001-product-surface-and-outputs_ko.md), [../../01-decisions/ADR-0006-storage-and-scheduling_ko.md](../../01-decisions/ADR-0006-storage-and-scheduling_ko.md)
- Produces: `caw05/` Python 프로젝트; 전체 패키지 트리(`core`, `ports`, `adapters/{sources,exports}`, `renderers`, `scheduler`, `surfaces`); `config/` (interests.yaml, sources.yaml, feeds.yaml, routing.yaml, watchlist.yaml); `data/` files-as-truth 레이아웃 (findings/, ledger/, state/, runs/, review/, out/, exports/, artifacts/); `caw05.config.toml`; `pyproject.toml`; `.gitignore`; 컴파일되는 no-op `caw05 run --dry-run` 진입점.

## Objective
[repo-structure_ko.md](../../03-architecture/repo-structure_ko.md)로 고정된 정확한 디렉터리 레이아웃을 갖춘, CAW-05를 그 자체의 독립 repo로 세웁니다(공유 런타임 기반 없음 — PRODUCT-BRIEF §1). "Done"의 의미: 패키지가 깔끔하게 import되고, `caw05 run --dry-run`이 아무것도 하지 않으면서 0을 반환하며(milestone M0의 no-op Run 형태), files-as-truth 트리가 `.gitkeep` placeholder와 함께 존재하고, 트리가 green(컴파일, lint 통과)입니다. port 로직, adapters, 실제 sources에 대한 I/O는 아직 없습니다 — 그것은 RB-002/RB-003과 Phase 1입니다. 이 runbook은 모든 후속 runbook이 알려진 위치에 파일을 떨굴 수 있도록 skeleton만 고정합니다.

## Preconditions
- [ ] ADR-0001, ADR-0006이 accepted 상태([milestones-and-phases_ko.md](../../09-roadmap/milestones-and-phases_ko.md) P0 진입 게이트 기준).
- [ ] CAW-05 전용의 빈 git repo가 존재함(독립 제품; 형제 제품 트리에 중첩되지 않음).
- [ ] Python 툴체인 사용 가능; dependency/lock 매니저 선택됨(`uv` 또는 Poetry — TODO(open-question: pin), [tech-stack_ko.md §2.1](../../03-architecture/tech-stack_ko.md) 기준).
- [ ] [repo-structure_ko.md §2](../../03-architecture/repo-structure_ko.md)의 레이어링 규칙을 읽었음: `surfaces → core → ports ← adapters`. 스캐폴딩 중 이를 위반하지 마세요.

## Steps

1. **프로젝트 + 패키징 메타데이터 초기화.**
   - Do: `pyproject.toml`(PEP 621)을 생성하되, 패키지 이름 `caw05`, src-layout `src/caw05/`, console-script 진입점 `caw05 = "caw05.surfaces.cli:main"`, 그리고 선언된(지금은 비어 있는) 진입점 GROUP들: `caw05.source_adapters`, `caw05.export_adapters`, `caw05.scheduler_adapters`, `caw05.format_renderers`, `caw05.classifiers`([tech-stack_ko.md §2.1](../../03-architecture/tech-stack_ko.md) 기준; TODO(open-question: confirm group names)). 의존성으로 `pydantic` v2, CLI 라이브러리(`typer` 또는 `click`), `jinja2`, `httpx`, `feedparser`, `rank-bm25`, `anthropic` SDK, 그리고 MCP SDK를 추가하되 버전 pin은 `TODO(open-question: pin ...)`로 남기세요. lockfile을 생성합니다.
   - Verify: `python -c "import tomllib,sys; tomllib.load(open('caw05/pyproject.toml','rb'))"`가 파싱됨; lockfile이 존재함.

2. **소스 패키지 트리 생성 (비어 있지만 import 가능).**
   - Do: [repo-structure_ko.md §1](../../03-architecture/repo-structure_ko.md)의 모든 패키지 디렉터리를 `__init__.py`와 함께 생성: `src/caw05/{core,core/model,ports,adapters,adapters/sources,adapters/exports,renderers,renderers/templates,scheduler,surfaces}`. 레이아웃 그대로의 이름을 가진 모듈 stub 파일(비어 있거나 모듈 docstring + `pass`)을 추가: `core/{run,pipeline,dedup,cursors,relevance,classify,route,ledger,synthesize,registry}.py`, `ports/{source,export,scheduler,renderer}.py`(Classifier port는 RB-002에서 추가), `surfaces/{cli,mcp}.py`. 여기서 본문(body)을 구현하지 마세요.
   - Verify: `python -c "import caw05, caw05.core.pipeline, caw05.ports.source, caw05.surfaces.cli"`가 오류 없이 import됨.

3. **시드 placeholder를 가진 config 트리 생성.**
   - Do: `config/{interests.yaml,sources.yaml,feeds.yaml,routing.yaml,watchlist.yaml}`을 최소한의 유효 YAML placeholder로 생성(실제 interest 스키마 + watch-list 시드는 RB-003; 라우팅 규칙은 Phase 3). 각 파일은 채워질 ADR을 명명하는 선두 주석을 담습니다. port당 하나의 `[adapters.<port>] active = []` 블록을 가진 `caw05.config.toml`을 생성(source/classifier/format/export/scheduler) — 유일한 wiring 파일([ports-and-adapters_ko.md §3](../../05-radar-core/ports-and-adapters_ko.md)).
   - Verify: 모든 `config/*.yaml`이 파싱됨; `caw05.config.toml`이 `tomllib`로 파싱됨.

4. **files-as-truth 데이터 트리 생성.**
   - Do: `data/{findings,ledger,state,runs,review,out,exports,exports/caw02,exports/caw03,exports/caw01,exports/caw06,artifacts}`를 각각 `.gitkeep`와 함께 생성. 이 디렉터리들은 CAW-05의 자체 store입니다(PRODUCT-BRIEF §7). `index.sqlite`나 `run.lock`은 생성하지 마세요(런타임/cache; RB-003에서 구축).
   - Verify: `find caw05/data -type d`가 위의 모든 디렉터리를 나열함.

5. **cache/lock/대용량 blob 페이로드용 `.gitignore` 작성.**
   - Do: [repo-structure_ko.md §3](../../03-architecture/repo-structure_ko.md)과 [storage-and-scheduling_ko.md §1](../../04-data-layer/storage-and-scheduling_ko.md)의 truth-vs-cache 계약에 따라 `data/index.sqlite`, `data/run.lock`, `data/artifacts/*` 페이로드를 제외하는 `.gitignore` 추가(`.gitkeep`는 유지). Findings/ledger/state/runs/exports 텍스트는 감사를 위해 git 추적 가능하게 유지합니다.
   - Verify: `git check-ignore data/index.sqlite data/run.lock`이 둘 다 ignored로 보고; `git check-ignore data/findings/.gitkeep`이 NOT ignored로 보고.

6. **no-op Run + 얇은 CLI 표면 구현 (M0 형태만).**
   - Do: `surfaces/cli.py`에서 `--dry-run` 플래그와 `--window` 옵션을 가진 `caw05 run`을 노출하는 `main()`을 정의하고, `core.run.Run`에 위임. `core/run.py`에서 `--dry-run` 시 ZERO findings에 대해 파이프라인 STAGE NAME(collect → dedup → classify → synth → export)을 거치고 깔끔하게 반환하는 `Run`을 구현 — adapter import 없음, I/O 없음. 코어는 ports/registry/model만 import하고, 구체적 adapter는 결코 import하지 않습니다([repo-structure_ko.md §2](../../03-architecture/repo-structure_ko.md)). `mcp.py`는 RB-001/이후 Phase가 연결할 때까지 `NotImplementedError`를 raise하는 import 가능한 stub일 수 있습니다.
   - Verify: `caw05 run --dry-run`이 0을 반환하고 각 stage 이름을 zero-findings 카운트와 함께 한 번씩 로깅; 두 번 실행해도 깔끔한 no-op.

7. **독립성 + files-as-truth 계약을 고정하는 README 추가.**
   - Do: CAW-05가 독립형 조기 경보 레이더(자체 core/data/surfaces, 공유 기반 없음)임을 기술하고 `design/`과 M0 dry-run 명령을 가리키는 `README.md` 작성. recall 우선 편향과, 생성된 요약이 결코 evidence가 아니라는 점(PRODUCT-BRIEF §12)을 명시하여 후속 runbook이 그 프레이밍을 상속하도록 합니다.
   - Verify: README가 dry-run 명령을 참조하고 design 트리를 링크함.

## Acceptance criteria
- [ ] `python -c "import caw05"` 및 `core.pipeline`, `ports.source`, `surfaces.cli` import가 모두 성공.
- [ ] `caw05 run --dry-run`이 0을 반환하고, zero findings에 대해 전체 파이프라인 형태를 순회하며, 네트워크 I/O를 수행하지 않음.
- [ ] 디렉터리 트리가 [repo-structure_ko.md §1](../../03-architecture/repo-structure_ko.md)과 정확히 일치(패키지, `config/`, `data/`).
- [ ] `.gitignore`가 `index.sqlite`, `run.lock`, `artifacts/` 페이로드를 제외; findings/ledger/state는 추적 가능.
- [ ] 레이어링 규칙 유지: `core/`가 구체적 adapter를 import하지 않음(grep으로 `core/` 내 `from caw05.adapters` 없음 확인).
- [ ] 트리 전체에서 Lint/format 통과(전체 게이트는 RB-001에서 연결; 여기서는 최소한 선택한 linter가 clean하게 실행).

## Rollback / safety
- 이 runbook 전체는 새 repo에서의 추가적(additive) 파일 생성입니다; 되돌리려면 `git clean -fdx` / 브랜치 폐기.
- 외부 sources에 접촉하지 않음(구성상 합법/ToS 적합 — 아직 fetch 코드가 없음).
- `caw05 run --dry-run`이 어떤 I/O라도 수행하거나 adapter를 import하면 그것은 레이어링 위반입니다 — acceptance 전에 수정하고 RB-001로 진행하지 마세요.

## Hand-off
RB-001이 가정해도 되는 것: 정확한 패키지/데이터 레이아웃을 가진 import 가능한 `caw05` 패키지, port당 `active` 블록을 가진 파싱 가능한 `caw05.config.toml`, no-op `caw05 run --dry-run`, 그리고 green 트리. RB-001은 tooling/CI, 경계 lint 규칙(core→ports만), 그리고 op-manifest를 추가합니다. RB-002는 ports + registry + preflight + stubs를 채웁니다. RB-003은 SQLite 인덱스와 interest/watch-list 스키마를 채웁니다.
