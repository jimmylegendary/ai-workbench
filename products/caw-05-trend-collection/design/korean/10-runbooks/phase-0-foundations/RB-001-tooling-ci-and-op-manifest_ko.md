# RB-001: Tooling, CI, core→ports 경계 규칙, 그리고 타입화된 op-manifest

- Status: ready
- Phase: phase-0-foundations
- Depends on: [RB-000]
- Implements design: [../../03-architecture/tech-stack_ko.md](../../03-architecture/tech-stack_ko.md), [../../03-architecture/repo-structure_ko.md](../../03-architecture/repo-structure_ko.md), [../../01-decisions/ADR-0001-product-surface-and-outputs_ko.md](../../01-decisions/ADR-0001-product-surface-and-outputs_ko.md)
- Produces: `ruff` + `mypy`(strict) + `pytest` 설정; lint/typecheck/test를 실행하는 CI 워크플로; `core/`가 오직 `ports`/`model`/`registry`만 import함(구체적 adapter는 절대 아님)을 단언하는 자동화된 **경계 규칙(boundary rule)**; **op-manifest** — CLI + MCP 표면이 공유하는 여덟 개 파이프라인 연산(`run, ingest, rank, classify, route, ledger, synthesize, export`)의 타입화된 입력/출력 명세.

## Objective
DOC-CONVENTIONS §6이 요구하는 대로 모든 후속 runbook이 "트리를 green으로 남기도록" 품질 게이트를 잠그고, 아키텍처의 핵심 불변식 — 코어는 인터페이스에만 의존함([repo-structure_ko.md §2](../../03-architecture/repo-structure_ko.md)) — 을 관례가 아니라 기계로 강제되게 만듭니다. 또한 **op-manifest**를 고정합니다: Run이 노출하는 여덟 연산의 단일 타입화 선언으로, CLI와 MCP 표면(ADR-0001)이 하나의 계약 위의 얇은 뷰가 되어 어긋날(drift) 수 없게 합니다. "Done"의 의미: CI가 lint/type/test 오류에 실패하고, core→adapter import에 실패하며, op-manifest 타입 명세가 import되고 검증됩니다. 연산 본문(BODY)은 여기서 구현하지 않습니다(그것은 Phase 1+); 타입화된 시그니처/명세만 다룹니다.

## Preconditions
- [ ] RB-000 완료: import 가능한 `caw05`, no-op `caw05 run --dry-run`, green 트리.
- [ ] [tech-stack_ko.md §2.1](../../03-architecture/tech-stack_ko.md) 기준으로 Linter/typechecker/test runner 선택됨(`ruff`, `mypy` strict, `pytest`); pin은 TODO로 남김.
- [ ] `pydantic` v2 사용 가능(op-manifest 명세는 pydantic 모델).

## Steps

1. **lint + format + strict typing 설정.**
   - Do: `src/caw05`와 `tests`를 커버하는 `ruff` config(lint + format)와 strict 모드 `mypy` config 추가. import-sorting과 unused-import 규칙 활성화. 버전 pin은 [tech-stack_ko.md](../../03-architecture/tech-stack_ko.md)과 일관되게 `TODO(open-question: pin)`으로 기록.
   - Verify: RB-000 skeleton에서 `ruff check .`와 `mypy src/caw05`가 모두 통과.

2. **fakes-first 관례로 test runner 설정.**
   - Do: `pytest` config 추가; `tests/fakes/`(RB-002에서 구축할 `FakeSourceAdapter`/`FakeExportAdapter`/`FakeScheduler`용 placeholder)와 `caw05 run --dry-run`이 zero findings에 대해 0을 반환함을 단언하는 smoke test를 가진 `tests/` 생성.
   - Verify: `pytest`가 smoke test를 수집하고 통과.

3. **경계 규칙을 실행 가능한 테스트로 구현.**
   - Do: `src/caw05/core/**`의 import 문을 정적으로 스캔하여 어떤 모듈이라도 `caw05.adapters`, `caw05.renderers`, `caw05.scheduler`, 또는 구체적 adapter 모듈에서 import하면 FAIL하는 `tests/test_boundaries.py` 추가 — [repo-structure_ko.md §2](../../03-architecture/repo-structure_ko.md)의 레이어링 표를 강제(코어는 오직 `ports`, `core.model`, `core.registry`만 import 가능). 또한 `ports/**`가 `core`/`adapters`를 import하지 않음을 단언. import 파싱에는 `ast`를 사용(모듈을 실행하지 마세요).
   - Verify: 테스트가 지금 통과; `core/` 모듈에 `from caw05.adapters.sources import arxiv_s2`를 임시로 추가하면 FAIL(그 뒤 되돌림).

4. **CI 연결.**
   - Do: CI 워크플로(예: GitHub Actions — TODO(open-question: confirm CI host))를 추가하되, lockfile에서 설치하고 순서대로 `ruff check`, `ruff format --check`, `mypy`, `pytest`를 실행하는 하나의 job으로. CI는 CAW-05 자체의 것 — 공유 기반 없음. 0이 아닌 exit에 빌드 실패.
   - Verify: 푸시된 브랜치에서 CI가 green; 의도적 lint 오류가 red로 만듦(그 뒤 되돌림).

5. **op-manifest 값 타입 정의.**
   - Do: `core/model/`에 op-manifest용 pydantic 모델 추가: 여덟 연산 `run, ingest, rank, classify, route, ledger, synthesize, export`의 `Op` enum/literal, 그리고 각 연산에 대해 `inputs`, `outputs`, `side_effects`(읽고/쓰는 files-as-truth 경로), `idempotent: bool`을 선언하는 타입화된 `OpSpec`. [ports-and-adapters_ko.md §1](../../05-radar-core/ports-and-adapters_ko.md)과 [storage-and-scheduling_ko.md §3](../../04-data-layer/storage-and-scheduling_ko.md)의 파이프라인 stage에 연산을 매핑: `ingest`=collect, `rank`=relevance, `classify`+`route` = triage 척추(spine), `ledger`, `synthesize`, `export`; `run` = 전체 체크포인트된 Run. 명세에 `classify`가 finding을 human review로 라우팅하는 **abstain** 판정을 낼 수 있다는 점(ADR-0004)과, `synthesize`/`export`가 **non-evidence**로 플래그되어 결코 evidence로 export되지 않는 `generated_rationale` 필드를 운반한다는 점(PRODUCT-BRIEF §12)을 인코딩하세요.
   - Verify: `python -c "from caw05.core.model import OP_MANIFEST; assert {o for o in OP_MANIFEST} >= {'run','ingest','rank','classify','route','ledger','synthesize','export'}"`.

6. **op-manifest를 양쪽 표면에 노출 (로직 없음).**
   - Do: `surfaces/cli.py`가 자신의 서브커맨드를, `surfaces/mcp.py`가 자신의 도구 목록을 op-manifest로부터 도출하게 하여, CLI와 MCP가 하나의 코어 위에서 증명 가능하게 동일한 계약이 되도록(ADR-0001). 본문은 여전히 아직 구현되지 않은 core 함수에 위임(P0에서 비-`run` 연산은 `NotImplementedError` raise); `run --dry-run`만 엔드투엔드로 동작.
   - Verify: `caw05 --help`가 여덟 연산을 나열; 한 테스트가 MCP 도구 이름이 op-manifest 연산 집합과 같음을 단언.

7. **manifest 일관성 테스트 추가.**
   - Do: 모든 연산이 inputs/outputs/side_effects를 선언함을, `run`이 idempotent/resumable로 표시됨을([storage-and-scheduling_ko.md §3](../../04-data-layer/storage-and-scheduling_ko.md) 기준), 그리고 `export`가 idempotency key 필드를 선언함을([storage-and-scheduling_ko.md §6](../../04-data-layer/storage-and-scheduling_ko.md) layer 4 기준, 재시도가 결코 이중 라우팅하지 않도록) 단언하는 `tests/test_op_manifest.py` 추가.
   - Verify: `pytest tests/test_op_manifest.py`가 통과.

## Acceptance criteria
- [ ] `ruff check`, `ruff format --check`, `mypy`(strict), `pytest`가 로컬과 CI에서 모두 통과.
- [ ] 경계 테스트가 통과하며, `core/`가 어떤 구체적 adapter라도 import하면 명백히 실패함(그 뒤 green으로 되돌림).
- [ ] op-manifest가 여덟 연산을 모두 타입화된 inputs/outputs/side_effects로 정의; CLI와 MCP 모두 그것으로부터 도출.
- [ ] `run`이 idempotent/resumable로 표시됨; `export`가 idempotency key를 운반; `classify`가 `abstain→human`을 낼 수 있음.
- [ ] 생성된 rationale의 non-evidence 플래그가 synthesize/export 명세에 존재.
- [ ] 브랜치에서 CI가 green.

## Rollback / safety
- 모든 변경은 config + 테스트 + 타입 명세입니다; 브랜치를 폐기하여 되돌림. 런타임/데이터 변경 없음.
- 경계 규칙은 동작 변경이 아니라 가드레일입니다 — 그것이 후속 runbook을 막는다면 그 runbook이 레이어링 계약을 위반하는 것입니다; 규칙을 약화시키지 말고 runbook을 고치세요.
- sources에 접촉하지 않음; 여기의 어떤 것도 네트워크 I/O를 수행하지 않음.

## Hand-off
RB-002가 가정해도 되는 것: green CI 게이트, strict typecheck, 강제된 core→ports 경계, `tests/fakes/` 슬롯, 그리고 ports + registry가 충족해야 하는 op-manifest 타입 명세. RB-002는 다섯 ports, registry, preflight, 문서화된 stub 패턴, 그리고 smoke/boundary 테스트가 참조하는 fakes를 구현합니다.
