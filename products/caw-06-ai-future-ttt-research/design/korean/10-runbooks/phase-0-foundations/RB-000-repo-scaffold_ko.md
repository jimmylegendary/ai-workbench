# RB-000: CAW-06 파이프라인 프로젝트와 repo 트리 스캐폴딩

- Status: ready
- Phase: phase-0-foundations
- Depends on: []
- Implements design: [../../03-architecture/repo-structure_ko.md](../../03-architecture/repo-structure_ko.md), [../../03-architecture/tech-stack_ko.md](../../03-architecture/tech-stack_ko.md), [../../01-decisions/ADR-0001-product-surface-and-scout_ko.md](../../01-decisions/ADR-0001-product-surface-and-scout_ko.md), [../../01-decisions/ADR-0007-storage-and-scheduling_ko.md](../../01-decisions/ADR-0007-storage-and-scheduling_ko.md)
- Produces: 컴파일되는 Python 프로젝트 스켈레톤(`src/caw06/{core,ports,adapters/{sources,runners,exports},schemas,surfaces,lib}`), `store/{sources,claims,hypotheses,ledger,implications,writeback,threads,exports,cursors,index}` 트리, `artifacts/`, `exports_outbox/{caw-01,caw-02}`, `imports_inbox/caw-05`, `config/*.yaml` 플레이스홀더, 그리고 비어있지만 import 가능한 패키지.

## Objective
[repo-structure.md](../../03-architecture/repo-structure_ko.md)에 고정된 그대로 CAW-06 저장소 스켈레톤을 세웁니다: 세 구조 영역(`core/`는 로직 보유, `ports/` ⟂ `adapters/`, `schemas/`)을 가진 하나의 파이프라인 패키지(`src/caw06`), CAW-06-OWNED `store/` 파일 트리, 그리고 파일 경계 디렉터리(`exports_outbox/`, `imports_inbox/`). "Done" = 패키지가 import되고, 설계에 명명된 모든 모듈이 비어있지만 타입이 지정된 stub로 존재하며, 스토어 디렉터리 트리가 write/read를 라운드트립하고, 트리가 녹색임(import 가능; 구문 오류 없음). 비즈니스 로직, 어댑터, 스키마는 아직 구현되지 않음 — 그것들은 RB-001..RB-003과 이후 phase에서 옵니다. 이 런북은 중단된 빌드가 깔끔하게 재개되도록 트리만 깔아놓습니다.

## Preconditions
- [ ] ADR 0001–0008이 accept되었고 `_meta/PRODUCT-BRIEF.md`를 읽었음(milestone P0 entry gate 기준).
- [ ] Python 인터프리터가 사용 가능함(minor 버전 핀은 연기됨 — RB-001 / tech-stack `TODO(open-question: pin Python minor)` 참조).
- [ ] 구현용 repo 루트가 결정됨(repo-structure.md의 `TODO(open-question: impl co-located with design/ or sibling repo?)`). 기본값: `design/` 옆에 co-located.
- [ ] 기존 `src/caw06/` 패키지 없음(이 런북이 생성함).

## Steps

1. **Do:** 패키지 루트와 `src/caw06/` 아래 Python 소스 트리를 비어있는 하위 패키지 `core/`, `ports/`, `adapters/`, `adapters/sources/`, `adapters/runners/`, `adapters/exports/`, `schemas/`, `surfaces/`, `lib/`와 함께 생성. 각각이 패키지로 import되도록 `__init__.py`를 추가.
   **Verify:** `python -c "import caw06"`가 성공(`src/`가 path에 있거나 editable install 상태에서); 모든 하위 패키지 디렉터리에 `__init__.py` 존재.

2. **Do:** repo-structure.md §Directory tree에 나열된 `core/` 모듈에 대해 비어있는 모듈 stub(모듈 docstring + 설계가 명명한 심볼을 `...`/`pass` 플레이스홀더로만)을 생성: `pipeline.py`, `ingestion.py`, `hypotheses.py`, `experiments.py`, `ledger.py`, `implications.py`, `writeback.py`, `export.py`, `store.py`, `index.py`, `resolver.py`, `review_queue.py`. 각 모듈의 docstring은 그것이 구현하는 ADR을 인용(예: `store.py` → ADR-0007). 동작을 구현하지 마세요.
   **Verify:** `python -c "import caw06.core.pipeline, caw06.core.store, caw06.core.resolver"`(및 나머지)가 성공; 어떤 모듈도 플레이스홀더 이상의 로직을 포함하지 않음.

3. **Do:** `ports/` 아래 비어있는 포트 모듈 stub 생성: `source_adapter.py`, `runner_adapter.py`, `export_adapter.py`(인터페이스는 RB-002에서 채움). `adapters/{sources,runners,exports}/` 아래 각각 `_stubs.py`를 가진 어댑터 패키지 플레이스홀더 생성(구현은 이후 phase에 안착). `surfaces/{cli.py,mcp_server.py,scheduler.py}`와 `lib/` 플레이스홀더 생성.
   **Verify:** `python -c "import caw06.ports.source_adapter, caw06.ports.runner_adapter, caw06.ports.export_adapter"`가 성공; `adapters/{sources,runners,exports}/_stubs.py`가 모두 import됨.

4. **Do:** `schemas/` 아래 비어있는 스키마 모듈 stub 생성: `source.py`, `claim.py`, `hypothesis.py`, `ledger_entry.py`, `implication_map.py`, `wbtraffic_v0.py`, `export_bundle.py`(정의는 RB-003에 안착).
   **Verify:** `python -c "import caw06.schemas.source, caw06.schemas.wbtraffic_v0, caw06.schemas.export_bundle"`가 성공.

5. **Do:** CAW-06-OWNED 스토어 트리를 각각에 `.gitkeep`이 있는 빈 디렉터리로 생성: `store/{sources,claims,hypotheses,ledger,implications,writeback,threads,exports,cursors,index}`, 더하기 `artifacts/`, `exports_outbox/{caw-01,caw-02}`, `imports_inbox/caw-05`. 이는 [storage-and-scheduling.md](../../04-data-layer/storage-and-scheduling_ko.md) §2와 repo-structure.md §Directory tree와 일치.
   **Verify:** `ls store/`가 열 개의 타입 디렉터리를 모두 나열; `exports_outbox/caw-01`, `exports_outbox/caw-02`, `imports_inbox/caw-05`가 존재; 각각에 `.gitkeep` 있음.

6. **Do:** `config/sources.yaml`, `config/exports.yaml`, `config/runner.yaml`을 소유 ADR을 가리키는 헤더 주석(sources→ADR-0005/0007, exports→ADR-0008, runner→ADR-0003)과 각 연기된 값에 대한 `TODO(open-question: ...)`를 가진 플레이스홀더 파일로 생성. 실제 레지스트리 항목을 추가하지 마세요(그것은 RB-001/RB-002).
   **Verify:** 세 YAML 파일이 모두 유효한 YAML로 파싱됨(예: `python -c "import yaml,glob; [yaml.safe_load(open(f)) for f in glob.glob('config/*.yaml')]"`).

7. **Do:** 패키지를 선언하는 `pyproject.toml`(이름, `src/` 레이아웃, 빌드 백엔드)을 생성하되 의존성 목록은 tech-stack.md에 따라 `TODO(open-question: pin ...)` 주석으로 남김(여기서 버전 핀을 지어내지 마세요; RB-001이 도구 핀을 해결). 최소 `README.md`와 `store/index/` 내용 및 `artifacts/` 대용량 blob을 제외하되 `.gitkeep`은 유지하는 `.gitignore` 추가.
   **Verify:** `pyproject.toml`이 파싱됨; editable install(`pip install -e .` 또는 `uv pip install -e .`)이 수동 path 핵 없이 `import caw06`가 작동하게 함.

8. **Do:** `tests/` 트리(`tests/unit/`, `tests/adapters/`, `tests/fixtures/`)를 `import caw06`와 스토어 디렉터리 존재를 단언하는 단일 smoke 테스트와 함께 생성.
   **Verify:** smoke 테스트가 수집되고 러너가 연결되면 통과(러너 자체는 RB-001에서 핀; 그 전까지는 테스트 파일을 `python`으로 직접 실행하면 통과).

## Acceptance criteria
- [ ] `import caw06`와 모든 `core/`, `ports/`, `schemas/`, `surfaces/` 모듈의 import가 성공(트리 녹색, 구문 오류 없음) — P0 종료 "트리 녹색"과 일치.
- [ ] 스토어 트리 `store/{sources,claims,hypotheses,ledger,implications,writeback,threads,exports,cursors,index}`가 존재, 더하기 `artifacts/`, `exports_outbox/{caw-01,caw-02}`, `imports_inbox/caw-05` — storage-and-scheduling.md §2와 P0 종료 게이트 "store dirs create/round-trip"과 일치.
- [ ] `store/sources/`로의 사소한 write와 read-back이 라운드트립됨(OWNED 스토어가 쓰기 가능함을 증명; 완전한 reader/writer는 RB-003).
- [ ] `config/{sources,exports,runner}.yaml`이 존재, 파싱됨, 그리고 플레이스홀더 + `TODO(open-question)` 마커만 보유 — 지어낸 레지스트리 항목 없음, 지어낸 버전 핀 없음.
- [ ] 비즈니스 로직, 어댑터 구현, 스키마 정의가 아직 없음(그것들은 RB-001..RB-003과 이후 phase).
- [ ] `exports_outbox/`가 유일한 outbound 디렉터리이고 `imports_inbox/caw-05/`가 유일한 inbound — 어떤 경로도 형제 제품의 스토어로 쓰지 않음(독립성 / 공유 스토어 없음).

## Rollback / safety
- 전체 런북은 추가적(additive)이며 새 트리를 생성; rollback = 새로 생성된 `src/caw06/`, `store/`, `artifacts/`, `exports_outbox/`, `imports_inbox/`, `config/`, `tests/`, `pyproject.toml`, `README.md`, `.gitignore` 삭제.
- 중간에 중단되면 재실행은 멱등: 기존 디렉터리/파일 생성은 no-op; 비-플레이스홀더 파일을 절대 덮어쓰지 않음. 실제 레코드가 존재한 후에는 `store/` 아래 어떤 것도 삭제하지 마세요(append-only / failures-first-class, ADR-0007).

## Hand-off
다음 런북들은 다음을 가정할 수 있음: repo-structure.md에 명명된 모든 모듈이 플레이스홀더로 존재하는 import 가능한 `caw06` 패키지; CAW-06-OWNED `store/` 트리와 `exports_outbox/`/`imports_inbox/` 파일 경계 존재; 채워질 준비가 된 `config/*.yaml` 플레이스홀더. RB-001은 tooling/CI, core→ports 경계 규칙, op-manifest를 추가. RB-002는 세 포트 + 레지스트리 + stub 패턴을 채움. RB-003은 스토어 reader/writer와 모든 엔티티 + `wbtraffic.v0` 스키마를 채움.
