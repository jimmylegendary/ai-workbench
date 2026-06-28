# RB-001: tooling, CI, core→ports 경계 규칙, op-manifest 연결

- Status: ready
- Phase: phase-0-foundations
- Depends on: [RB-000]
- Implements design: [../../03-architecture/tech-stack_ko.md](../../03-architecture/tech-stack_ko.md), [../../03-architecture/repo-structure_ko.md](../../03-architecture/repo-structure_ko.md), [../../01-decisions/ADR-0001-product-surface-and-scout_ko.md](../../01-decisions/ADR-0001-product-surface-and-scout_ko.md), [../../05-ttt-research-core/ports-and-adapters_ko.md](../../05-ttt-research-core/ports-and-adapters_ko.md)
- Produces: 핀된 도구 설정(lint + format + type-check + test), 그것들을 실행하는 CI 워크플로우, 강제된 **경계 규칙**(`core/`는 `ports/`에만 의존, 결코 `adapters/`에 의존하지 않음), 그리고 일곱 개의 파이프라인 연산(scout, ingest, hypothesize, experiment, writeback, implication, export)을 입력/출력 레코드 종류 및 각각이 준수해야 할 게이트와 함께 선언하는 타입화된 **op-manifest**.

## Objective
P0의 녹색 트리 약속을 기계적으로 확인 가능하게 만들고, 어떤 stage가 빌드되기 전에 load-bearing 구조적 불변식을 고정합니다. "Done" = `lint`, `typecheck`, `test`가 모두 하나의 명령에서 그리고 CI에서 실행됨; `core/` 아래의 무언가가 `adapters/`에서 import하면 빌드를 실패시키는 자동 검사(코어는 포트에만 의존 — ADR-0001 / ports-and-adapters.md §1); 그리고 일곱 연산을 타입화된 시그니처(입력 종류 → 출력 종류)와 각각이 묶이는 no-overclaim / reproducibility / export-eligibility 게이트와 함께 명명하는 op-manifest 존재. 이 런북은 tech-stack.md의 `TODO(open-question: pin ...)` tooling 셀을 해결합니다; 어떤 연산도 구현하지 않습니다(그것은 RB-1XX..RB-4XX) — manifest는 타입화된 스펙일 뿐입니다.

## Preconditions
- [ ] RB-000 완료: `import caw06`가 작동; 모든 모듈 플레이스홀더 존재.
- [ ] 결정 사항(tech-stack `TODO`를 tooling 범위로 해결): lint+format 도구(예: ruff), 타입 체커(예: mypy), 테스트 러너(예: pytest), packaging/lock 도구(uv 또는 poetry). 선택된 핀을 기록; 설치할 수 없는 버전을 지어내지 마세요.

## Steps

1. **Do:** `pyproject.toml`에 dev 툴체인(lint/format, type-check, test)을 추가하고 핀하며 lockfile을 생성. 각 도구 설정: lint 규칙, formatter, 공개 시그니처의 누락된 타입을 잡을 만큼 충분히 strict한 모드의 type-checker, `tests/`를 가리키는 테스트 러너.
   **Verify:** `lint`, `format --check`, `typecheck`, `test`가 각각 RB-000 스켈레톤에서 실행되어 성공을 보고(빈/smoke suite 통과). lockfile에 정확한 핀 기록.

2. **Do:** `lint`, `typecheck`, `test`, 그리고 세 가지를 모두 실행하는 집계 `check`에 대한 task 단축키(`Makefile` 또는 `pyproject` script 항목)를 추가. 이는 중단된 빌드가 트리가 녹색인지 확인하는 데 사용하는 단일 명령.
   **Verify:** `make check`(또는 동등물)가 세 게이트를 모두 실행하고 현재 트리에서 0으로 종료.

3. **Do:** lockfile에서 설치하고 push/PR 시 `lint`, `typecheck`, `test`, 그리고 경계 검사(step 4)를 실행하는 CI 워크플로우(예: `.github/workflows/ci.yml`)를 생성.
   **Verify:** 워크플로우 파일이 파싱되고, 로컬에서 실행될 때(예: `act` 또는 step을 수동 실행) step 2와 동일한 녹색 결과를 재현.

4. **Do:** **경계 규칙**을 자동 검사로 구현: `src/caw06/core/` 아래의 어떤 모듈도 `src/caw06/adapters/`에서(직접 또는 전이적으로) import하지 않음을 단언하는 테스트(또는 lint 플러그인 / import-linter 계약). 코어는 `ports/`, `schemas/`, `lib/`를 import할 수 있음; 어댑터는 `ports/`/`schemas/`/`lib/`를 import할 수 있음; 표면은 `core/`를 import할 수 있음. 이는 ADR-0001의 "ONE core, gates inside the core"와 ports-and-adapters.md §5 "adapters cannot bypass the gates"를 인코딩.
   **Verify:** 현재 트리에서 검사가 통과; 임시 `core/` → `adapters/` import를 추가하고 검사가 FAIL함을 확인한 다음 제거.

5. **Do:** **op-manifest**를 타입화된 스펙으로 작성(Python 모듈 `core/op_manifest.py` 더하기 사람이 읽을 수 있는 `config/op-manifest.yaml`, 또는 단일 타입화된 dataclass/enum 모듈)하여 일곱 연산과 각각에 대해: 그 id, 그것이 다루는 파이프라인 stage(들), 입력 레코드 종류(들), 출력 레코드 종류(들), 그리고 그것이 준수해야 할 게이트(들)를 선언. data-model.md의 엔티티 이름을 정확히 사용. 일곱 항목:
   | op | stage | 입력 종류 | 출력 종류 | 준수해야 할 게이트 |
   |---|---|---|---|---|
   | `scout` | S1 discover | `ScoutQuery` | `SourceRef[]` | ToS-safe 소스만; 멱등 cursor |
   | `ingest` | S2–S5 import→dedup→extract→persist | `SourceRef` | `Source`, `Claim` | Claim `status=unverified`, `asserted_by` 설정; CAW-05 import는 claims-to-verify로 유지 |
   | `hypothesize` | hypothesis | `Claim[]` | `Hypothesis` | 기본값+하한 `status=hypothesis`, `confidence` 존재; status/uncertainty 없이 결코 직렬화되지 않음 |
   | `experiment` | run | `Hypothesis` | `ExperimentEntry`+`Result` | 사전 등록된 결정 규칙; 한 launch = 하나의 append-only 항목; reproducibility gate (config+seed+env) |
   | `writeback` | W | finding (`Result`/`Hypothesis`) | `WritebackTrafficSchema` (`wbtraffic.v0`) | 수치 기본값 `null`; `basis` modeled-vs-measured 표기; open_questions 첨부 |
   | `implication` | M | finding ref | `ImplicationMap` | `summary`는 generated로 표기(`evidence:false`); evidence_refs는 Result/Claim로 resolve, 결코 summary가 아님 |
   | `export` | X | `ImplicationMap`/`Claim`/`WritebackTrafficSchema` | `ExportBundle` | target별 `validate()` 게이트; generated evidence는 결코 status를 승격할 수 없음; 단방향 push, 공유 스토어 없음 |
   **Verify:** manifest가 import/파싱됨; 정확히 이 일곱 op id가 존재하고 각각이 비어있지 않은 입력 종류, 출력 종류, 최소 하나의 게이트를 선언함을 테스트가 단언; 레코드 종류 이름이 RB-003의 `schemas/` 모듈 이름과 일치(RB-003 안착 시 교차 확인).

6. **Do:** 모든 op의 선언된 게이트가 실제 게이트 개념(status/uncertainty, reproducibility, export-eligibility, 또는 ingest-provenance 게이트)을 참조하고, **evidence cap**("generated evidence는 결코 status를 승격할 수 없음")이 `writeback`, `implication`, `export`에 대해 기록되었음을 단언하는 manifest-consistency 테스트를 추가. 이는 no-overclaim 불변식을 P0부터 CI의 일부로 만듭니다.
   **Verify:** 테스트가 통과; 어떤 op의 게이트를 비우면 실패함.

## Acceptance criteria
- [ ] `lint`, `typecheck`, `test`가 핀되고, 하나의 `check` 명령에서 실행되며, 트리에서 통과(녹색 트리 약속 강제).
- [ ] CI가 push/PR 시 `lint` + `typecheck` + `test` + 경계 검사를 실행.
- [ ] 어떤 `core/` 모듈이 `adapters/`를 import하면 경계 검사가 FAIL하고 그렇지 않으면 PASS(ADR-0001 / ports-and-adapters.md §5).
- [ ] op-manifest가 정확히 일곱 op(scout, ingest, hypothesize, experiment, writeback, implication, export)를 선언하며, 각각 타입화된 입력/출력 레코드 종류와 최소 하나의 게이트를 가짐; 엔티티 이름이 data-model.md와 일치.
- [ ] evidence cap(generated evidence는 결코 status를 승격하지 않음)과 reproducibility gate가 manifest에 기록되고 테스트로 단언됨 — no-overclaim과 failures-useful이 P0부터 강제됨.
- [ ] 어떤 연산도 구현되지 않음(manifest는 스펙일 뿐); 트리는 녹색 유지.

## Rollback / safety
- 모든 변경은 추가적 config/스펙 파일 더하기 테스트. Rollback = `pyproject.toml` 도구 섹션 되돌리기, CI 워크플로우, 경계 검사 테스트, op-manifest 모듈/yaml 삭제.
- 선택된 도구 핀이 설치되지 않으면, 조용히 fallback 버전을 지어내지 마세요 — `TODO(open-question: pin <tool>)`를 기록하고 그 게이트를 stub로 남기되 경계/manifest 검사는 여전히 그 아래에서 실행되어 트리가 import 가능하게 유지.

## Hand-off
다음 런북들은 다음을 가정할 수 있음: 단일 명령 녹색 게이트(`check`)와 CI; 강제된 `core→ports` 경계로 이후 추가되는 어댑터가 코어에 정책을 누출할 수 없음; 그리고 일곱 연산과 각각이 준수해야 할 게이트를 명명하는 타입화된 op-manifest로 RB-002(포트 + 레지스트리)와 RB-003(스토어 + 스키마)이 안정적인 op/레코드 이름에 바인딩할 수 있음. 이후 phase 런북은 각 op를 그 포트 뒤에 구현하며, CI는 모든 체크포인트에서 경계 + no-overclaim 불변식을 강제 유지.
