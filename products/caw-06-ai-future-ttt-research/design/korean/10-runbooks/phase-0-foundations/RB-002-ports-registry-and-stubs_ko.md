# RB-002: 세 포트, config 기반 레지스트리, preflight, 문서화된 stub 정의

- Status: ready
- Phase: phase-0-foundations
- Depends on: [RB-000, RB-001]
- Implements design: [../../05-ttt-research-core/ports-and-adapters_ko.md](../../05-ttt-research-core/ports-and-adapters_ko.md), [../../01-decisions/ADR-0001-product-surface-and-scout_ko.md](../../01-decisions/ADR-0001-product-surface-and-scout_ko.md), [../../01-decisions/ADR-0005-source-and-claim-ingestion_ko.md](../../01-decisions/ADR-0005-source-and-claim-ingestion_ko.md), [../../01-decisions/ADR-0003-experiment-ledger_ko.md](../../01-decisions/ADR-0003-experiment-ledger_ko.md), [../../01-decisions/ADR-0008-export-boundaries_ko.md](../../01-decisions/ADR-0008-export-boundaries_ko.md)
- Produces: 세 포트 인터페이스(`SourceAdapter`, `ExperimentRunnerAdapter`, `ExportAdapter`), 포트+키로 resolve하는 config 기반 `ADAPTERS` 레지스트리, 각 어댑터의 health를 보고하는 preflight, 문서화된 stub 패턴(`health()=not-built`, 호출 시 ADR을 가리키는 `NotImplementedError` 발생), 그리고 테스트용 인메모리 fake.

## Objective
전체 파이프라인이 의존하는 세 통합 이음새(seam)를, 아직 실제 외부 어댑터 없이 깔아둡니다. "Done" = 각 포트가 ports-and-adapters.md §2–§4와 일치하는 타입화된 인터페이스(Protocol)임; config 기반 레지스트리가 `(seam, key) → adapter class`를 매핑하며 모든 v1 슬롯이 문서화된 stub으로 점유됨; preflight가 네트워크 호출 없이 각 등록된 어댑터의 `health()`(real/stub/not-built)를 노출; 문서화된 stub 패턴이 균일함(등록 + import 가능, `health()`가 `not-built` 반환, 어떤 운영 호출도 소유 ADR을 인용하는 `NotImplementedError` 발생); 그리고 이후 phase가 실제 I/O 없이 코어를 실행할 수 있도록 결정적 인메모리 **fake**가 테스트용으로 존재. 코어는 포트에만 의존(RB-001 경계 규칙). 이 런북은 인터페이스 + wiring + stub + fake만 구현 — 실제 어댑터(arXiv/S2, CAW-05 import, 로컬 toy runner, CAW-01/02 export)는 이후 phase.

## Preconditions
- [ ] RB-001 완료: `check`가 녹색; `core→ports` 경계 규칙과 op-manifest 존재.
- [ ] 스키마 레코드 타입은 아직 존재하지 않을 수 있음(RB-003); 포트는 레코드 종류를 경량 타이핑/forward ref 또는 op-manifest 이름으로 참조하며, RB-003 안착 시 강화됨.

## Steps

1. **Do:** ports-and-adapters.md §2에 따라 `ports/source_adapter.py` 정의: `name: str`, `discover(query) -> list[SourceRef]`(S1), `fetch(ref) -> RawSource`(S2), `health() -> AdapterStatus`를 가진 `SourceAdapter` Protocol. canonicalization/dedup/extraction은 어댑터가 아닌 파이프라인의 일(S3–S5)이며, CAW-05 신호는 경계를 넘어 claims-to-verify로 진입(결코 공유 스토어가 아님)함을 문서화.
   **Verify:** 모듈이 import됨; `typecheck`가 Protocol을 수용; docstring이 ADR-0005를 인용.

2. **Do:** §3에 따라 `ports/runner_adapter.py` 정의: `name`, `plan(hypothesis_ref) -> ExperimentPlan`(결정 규칙 사전 등록), `run(plan) -> RunResult`(config+seed+env 캡처), `health()`를 가진 `ExperimentRunnerAdapter` Protocol. **reproducibility gate는 어댑터가 아닌 ledger writer가 강제**하며, runner는 결과를 자가 인증하거나 실패를 조용히 누락할 수 없음을 문서화(ADR-0003; brief §5).
   **Verify:** 모듈이 import됨; `typecheck` 통과; docstring이 게이트가 어댑터가 아닌 core/ledger 소유임을 명시.

3. **Do:** §4에 따라 `ports/export_adapter.py` 정의: `name`, `validate(bundle) -> ValidationResult`(target별 eligibility + 스키마 게이트), `emit(bundle) -> Receipt`(단방향 push), `health()`를 가진 `ExportAdapter` Protocol. `validate()`가 통과하지 않으면 `emit()`은 도달 불가, generated evidence는 결코 status를 승격할 수 없음, 어떤 어댑터도 다른 제품의 스토어를 읽거나 쓰지 않음을 문서화(ADR-0008).
   **Verify:** 모듈이 import됨; `typecheck` 통과; docstring이 `emit`이 `validate` 뒤에 게이트됨을 명시.

4. **Do:** 공유 `AdapterStatus` 타입(예: `ok | degraded | not-built`)과 세 포트 모두가 사용하는 `health()` 계약을 추가하여, CLI/MCP 표면이 이후 stub을 균일하게 보고할 수 있게 함(ports-and-adapters.md의 균일한 not-built health 계약에 관한 open question).
   **Verify:** 세 포트 모두 `AdapterStatus`를 import; 테스트가 enum에 `not-built`이 포함됨을 단언.

5. **Do:** 각 `adapters/{sources,runners,exports}/_stubs.py`에 문서화된 stub 베이스를 구현: 자신의 포트를 구현하는 stub 클래스로, `health()`는 `not-built`을 반환하고 모든 운영 메서드는 소유 ADR을 가리키는 메시지(예: "StubSourceAdapter not built — see ADR-0005")와 함께 `NotImplementedError`를 발생. 이는 ports-and-adapters.md §4 "documented stub contract"를 충족.
   **Verify:** 각 stub이 import됨, `health()`가 `not-built` 반환, 운영 메서드 호출 시 ADR을 명명하는 메시지를 가진 `NotImplementedError` 발생.

6. **Do:** config 기반 레지스트리 `core/registry.py` 더하기 `config/adapters.yaml`(또는 기존 `config/*.yaml`에 통합)을 생성하여 ports-and-adapters.md §4의 `ADAPTERS` 맵 보유: seam `source`/`runner`/`export`, 각 키가 클래스에 바인딩됨 — P0에서 모든 v1 키(`arxiv`, `caw-05`, `local-toy`, `caw-01`, `caw-02`)가 자신의 문서화된 stub을 가리키고, 나열된 stub 키(`rss`, `external`, `caw-03`, `http`)도 마찬가지. 레지스트리는 `(seam, key)`로 resolve; 파이프라인 코어는 그것을 통해서만 resolve(레지스트리가 어댑터가 명명되는 유일한 곳).
   **Verify:** `registry.resolve("source","arxiv")`가 인스턴스를 반환; 알 수 없는 키 resolve 시 명확한 오류 발생; 테스트가 코어는 결코 어댑터 모듈을 직접 import하지 않음을 단언(RB-001 경계 검사로 커버).

7. **Do:** 모든 등록된 어댑터를 순회하며 어떤 네트워크/디스크 부작용 없이 `health()`를 수집하여 리포트(`seam, key, status`)를 반환하는 `preflight()`(`core/registry.py` 또는 `surfaces`에)를 구현. 이는 표면과 P4 entry gate가 의존하는 "registry config present / health surfaced" 기반.
   **Verify:** `preflight()`가 오프라인으로 실행되고 P0에서 모든 어댑터에 대해 `not-built`을 보고; 테스트가 등록된 키당 한 행을 반환하고 I/O를 하지 않음을 단언(예: no-network fake clock/monkeypatch 통해).

8. **Do:** `tests/fixtures/`(또는 `tests/adapters/`) 아래 결정적 인메모리 **fake** 추가: `FakeSourceAdapter`(고정 `SourceRef`/`RawSource` 반환), `FakeRunner`(고정 `RunResult` 반환, 네거티브 결과를 테스트 가능하도록 강제-실패 변형 포함), `FakeExportAdapter`(방출된 번들 기록, 요청 시 `validate()` pass/fail 가능). 이는 이후 phase가 실제 I/O 없이 코어+게이트를 테스트할 수 있게 함.
   **Verify:** 테스트가 각 fake를 레지스트리를 통해 연결하고 호출을 라운드트립; `FakeRunner` 실패 변형이 ledger가 네거티브 결과로 분류할 결과를 생성(P2에서 완전히 단언).

## Acceptance criteria
- [ ] `SourceAdapter`, `ExperimentRunnerAdapter`, `ExportAdapter` Protocol이 존재하고 ports-and-adapters.md §2–§4의 시그니처와 일치; `typecheck` 통과.
- [ ] `ADAPTERS` 레지스트리가 `(seam, key)`로 resolve; 그것이 어댑터가 명명되는 유일한 곳; 코어는 그것을 통해서만 resolve(RB-001 경계 검사 여전히 녹색).
- [ ] 모든 v1 및 stub 슬롯이 `health()`가 `not-built`을 반환하고 운영 호출이 ADR을 인용하는 `NotImplementedError`를 발생시키는 문서화된 stub으로 점유됨.
- [ ] `preflight()`가 각 어댑터의 health를 오프라인으로 보고(네트워크/디스크 부작용 없음) — 등록된 키당 한 행.
- [ ] 게이트 소유권이 각 포트에 문서화됨: reproducibility는 ledger writer(runner 아님), export-eligibility는 `validate()`(아니면 emit 도달 불가), status/uncertainty + evidence cap은 코어 — 어댑터는 transport+shape일 뿐, 결코 정책이 아님.
- [ ] 인메모리 fake(강제-실패 runner 포함)가 테스트용으로 존재; 트리는 녹색 유지(P0 종료: "three ports compile with stub implementations that raise NotImplemented-style guards").

## Rollback / safety
- 모든 변경은 추가적(포트 모듈, 레지스트리, stub, fake, 하나의 config 파일). Rollback = 세 `ports/*.py`를 RB-000 플레이스홀더로 되돌리기, `core/registry.py`, `config/adapters.yaml`, `_stubs.py` 본문, fake 삭제.
- 안전: stub은 운영 호출 시 반드시 발생해야 함(결코 조작된 데이터를 반환하지 않음)으로, 우발적으로 활성화된 stub이 fake source/result/export를 방출하기보다 큰 소리로 실패하게 함. 이 런북에서 실제 네트워크 어댑터를 절대 등록하지 마세요.

## Hand-off
다음 런북들은 다음을 가정할 수 있음: 세 안정적 포트 인터페이스, 포트+키로 resolve하는 config 기반 레지스트리, 오프라인 preflight health를 가진 균일한 문서화 stub 계약, 그리고 테스트용 결정적 fake. RB-003은 포트가 참조하는 레코드 + `wbtraffic.v0` 스키마와 스토어 reader/writer를 채움. Phase-1+ 런북은 각각 자신의 포트 뒤에 정확히 하나의 실제 어댑터를 추가하고 그 레지스트리 키를 stub에서 real로 전환하며, 세 게이트는 이미 코어가 소유하고 RB-001의 경계 검사로 강제됨.
