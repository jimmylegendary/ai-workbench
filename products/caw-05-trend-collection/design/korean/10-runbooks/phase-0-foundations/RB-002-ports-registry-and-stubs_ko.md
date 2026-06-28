# RB-002: 다섯 ports, config 기반 registry, preflight, 문서화된 stubs, 그리고 fakes

- Status: ready
- Phase: phase-0-foundations
- Depends on: [RB-000, RB-001]
- Implements design: [../../05-radar-core/ports-and-adapters_ko.md](../../05-radar-core/ports-and-adapters_ko.md), [../../03-architecture/repo-structure_ko.md](../../03-architecture/repo-structure_ko.md), [../../01-decisions/ADR-0003-source-adapters-and-ingestion_ko.md](../../01-decisions/ADR-0003-source-adapters-and-ingestion_ko.md), [../../01-decisions/ADR-0004-classification-and-triage_ko.md](../../01-decisions/ADR-0004-classification-and-triage_ko.md), [../../01-decisions/ADR-0007-export-boundaries_ko.md](../../01-decisions/ADR-0007-export-boundaries_ko.md)
- Produces: 다섯 개의 `Protocol` ports(`SourceAdapter`, `Classifier`, `FormatRenderer`, `ExportAdapter`, `SchedulerAdapter`); 공유 값 객체(`RawFinding`, `Verdict`, `FindingGroup`, `Artifact`, `RoutedSignal`, `Cursor`, `AdapterCapabilities`, descriptor들); `AdapterRegistry`(decorator + entry-point discovery); `caw05.config.toml` 로더; **preflight**(capability + ToS + 활성 stub 없음 검증); 모든 brief-§9 문서화된 stub; 모든 port용 fakes; no-adapter-bypass 가드 테스트.

## Objective
ports-and-adapters seam을 실제로 만들어, seam 테스트([ports-and-adapters_ko.md §6](../../05-radar-core/ports-and-adapters_ko.md))에 따라 새로운 source/export/scheduler가 `core/`의 어떤 것도 건드리지 않는 "adapter 파일 하나 + config 블록 하나"가 되도록 합니다. "Done"의 의미: 다섯 개의 타입화된 ports가 컴파일되고 op-manifest 값 타입과 일치; registry가 내장(decorator) 및 외부(entry-point) adapter를 발견; preflight가 I/O 이전에 stub/무능력/ToS-위험/오설정 wiring을 실행 가능한 메시지와 함께 거부; 모든 brief-§9 stub이 등록·발견 가능하며 active로 만들면 거부됨; fakes가 no-op Run이 모든 port를 통과하게 함; 그리고 가드 테스트가 어떤 adapter 경로도 classify→route→review-gate를 통과하지 않고는 synth/export에 도달하지 못함을 증명. 여기서 실제 네트워크 adapter는 구축하지 않습니다(Phase 1).

## Preconditions
- [ ] RB-001 완료: green CI, strict typing, op-manifest 타입 명세, 강제된 core→ports 경계.
- [ ] choke-point 불변식([ports-and-adapters_ko.md §1](../../05-radar-core/ports-and-adapters_ko.md))을 읽었음: adapter는 오직 `RawFinding`을 생성하거나 `RoutedSignal`을 소비할 뿐이며, classify/route/review-gate를 우회(short-circuit)할 수 없음 — 이것이 생성된 요약이 evidence로 export되는 것과 리뷰되지 않은 novelty-threat가 CAW-03에 도달하는 것을 막습니다.
- [ ] `pydantic` v2 사용 가능; RB-000의 `pyproject.toml`에 entry-point 그룹 선언됨.

## Steps

1. **공유 값 객체 정의.**
   - Do: `core/model/`에 모든 레코드에 provenance와 boundary를 운반하는 pydantic 값 객체 추가: `RawFinding`(source 태그됨, `boundary=public`, 대용량 artifact는 inline이 아니라 경로로 참조), `Cursor`, `Verdict`(두 축: novelty-threat/support/adjacent/noise × signal/hype, 더하기 `confidence`와 `abstain` 상태, 더하기 명시적으로 `kind=generated` / non-evidence 타입의 `generated_rationale` 필드), `FindingGroup`, `Artifact`(markdown, `kind=generated`, non-evidence 배너), `RoutedSignal`(destination + idempotency key), 그리고 [ports-and-adapters_ko.md §4](../../05-radar-core/ports-and-adapters_ko.md) 그대로의 `AdapterCapabilities` + `AdapterDescriptor`.
   - Verify: 모델이 import됨; 한 테스트가 `Verdict`가 `abstain`을 지원하고 `generated_rationale`/`Artifact`가 non-evidence로 플래그됨을 단언.

2. **다섯 ports를 타입화된 Protocol로 정의 (I/O 없음).**
   - Do: `ports/`에 [ports-and-adapters_ko.md §2](../../05-radar-core/ports-and-adapters_ko.md)의 시그니처로 다섯 `Protocol` 작성: `SourceAdapter`(`discover/fetch/health`), `Classifier`(`classify` → `Verdict`, 신뢰도가 낮으면 ADR-0004에 따라 abstain→human), `FormatRenderer`(`applies_to/render`), `ExportAdapter`(`can_accept/export` → idempotent file-drop), `SchedulerAdapter`(`install/status/uninstall`). `ports/classifier.py`(RB-000에서 만들지 않은 Classifier port) 추가. 각각은 `capabilities: AdapterCapabilities`를 노출. Ports는 stdlib + `core.model`만 import.
   - Verify: `mypy` strict 통과; 경계 테스트가 여전히 유지됨(ports가 core/adapters를 import하지 않음).

3. **AdapterRegistry 구현 (2계층 discovery).**
   - Do: `core/registry.py`에 `AdapterRegistry.register/get/list`를 (1) `@register(port=..., id=...)` decorator를 통한 내장 등록과 (2) `importlib.metadata`를 통한 `caw05.*_adapters` / `caw05.format_renderers` / `caw05.classifiers` 그룹에 대한 entry-point discovery로 구현. `list(port)`는 preflight/CLI/MCP용으로 id + capability descriptor를 반환. registry는 core에 살지만 오직 `Protocol` 참조만 보유 — 구체적 import 없음.
   - Verify: `@register`로 데코레이트된 fake adapter가 `registry.list("source")`에 그 descriptor와 함께 나타남.

4. **config 로더 구현.**
   - Do: `caw05.config.toml`(stdlib `tomllib`)을 port당 타입화된 `AdapterConfig`로 파싱: port당 `active` 목록/id, per-adapter 블록(예: `[adapters.source.arxiv-s2]`), 그리고 stub에 대한 `enabled=false`. port당 하나의 블록이 유일한 wiring 표면([ports-and-adapters_ko.md §3](../../05-radar-core/ports-and-adapters_ko.md)).
   - Verify: RB-000 `caw05.config.toml`을 로드하면 port당 `active` 집합이 나옴; 알 수 없는 port 키는 명확한 오류.

5. **preflight 구현 (capability + ToS + 활성 stub 없음 — I/O 없음).**
   - Do: 모든 Run 이전에 각 `active` id를 resolve하고 그 descriptor를 읽어 I/O 없이 검증하는 `preflight()`를 core에 추가([ports-and-adapters_ko.md §4](../../05-radar-core/ports-and-adapters_ko.md)): 모든 export가 Run이 라우팅할 signal kind를 `accepts`함; 모든 source가 합법적인 `tos_class`와 cursor kind를 선언함; 필요한 auth/config 존재; 그리고 **어떤 `active` adapter도 `maturity="stub"`이 아님**. `tos-restricted` source는 명시적으로 clear되지 않는 한 거부됨(PRODUCT-BRIEF §12). 각 실패는 고칠 파일을 명명하는 실행 가능한 메시지를 반환. `caw05 run`이 preflight를 먼저 호출하도록 연결.
   - Verify: stub을 강제로 `active`로 만들면 preflight가 그 stub 파일을 가리키며 실패; clearance 없는 ToS-restricted source `active`는 실패; clean한 v1-only wiring은 통과.

6. **문서화된 stub 출하 (brief §9).**
   - Do: 모든 brief-§9 미래 adapter에 대해 [ports-and-adapters_ko.md §5](../../05-radar-core/ports-and-adapters_ko.md) 패턴을 따르는 등록된 config-비활성 stub 파일 생성(실제 인터페이스, docstring 계약 + config 예시, `maturity="stub"`, 메서드는 `NotImplementedError` raise, `health()`는 not-implemented 반환): Source — `hn-reddit`, `securities`(SEC/EDGAR ≤10 req/s, no key), `newsletter`, `internal-feed`; Scheduler — `systemd-timer`, `github-actions`, `cloud-scheduler`, `airflow`; Export — `_stub_target`; FormatRenderer — 미래 포맷(예: `tweet-thread`); Classifier — embedding-lane classifier(alpha, gated). 각 docstring은 활성화 전에 합법/ToS가 확인되어야 함을 명시.
   - Verify: 각 stub이 `registry.list(<port>)`에 나타남; `caw05 adapters`(CLI)가 그것들을 `stub`으로 나열; preflight가 각각을 `active`로 만들면 거부.

7. **모든 port용 fakes 구축.**
   - Do: `tests/fakes/`에 `FakeSourceAdapter`(provenance를 가진 미리 준비된 `RawFinding` 반환), `FakeClassifier`(결정론적 `Verdict`, 신뢰도 낮은 `abstain` 케이스 포함), `FakeFormatRenderer`, `FakeExportAdapter`(idempotency key 기록, 반복 시 no-op), `FakeScheduler` 구현. 이것들은 Run이 네트워크 없이 모든 port를 행사하게 합니다.
   - Verify: `caw05 run --dry-run`(또는 fakes를 연결한 test harness)이 fake findings에 대해 collect→dedup→classify→route→synth→export로 흐르고, abstain 케이스가 `data/review/`로 라우팅되며, green.

8. **no-bypass 가드 테스트 추가.**
   - Do: 모든 adapter 경로가 classify→route→review-gate 이후에만 synth/export에 도달함을 증명하는 `tests/test_no_bypass.py` 추가([ports-and-adapters_ko.md §8](../../05-radar-core/ports-and-adapters_ko.md) bypass 가드): 파이프라인이 `Verdict`가 없는 finding을 거부함을, 그리고 `abstain` 판정이 review로 감(자동 라우팅/export되지 않음)을 단언. 또한 생성된 rationale / `Artifact`가 결코 export evidence 필드에 들어가지 않음을 단언.
   - Verify: `pytest tests/test_no_bypass.py`가 통과; gate를 삭제하면 실패(그 뒤 되돌림).

## Acceptance criteria
- [ ] 다섯 ports가 `mypy` strict에서 컴파일되고 `core.model` 값 객체만 사용.
- [ ] `AdapterRegistry`가 decorator 등록 및 entry-point adapter를 모두 발견; `list()`가 descriptor를 반환.
- [ ] preflight가 I/O 없이 실행되고 다음을 거부: `active` stub, ToS-restricted/위험 source, config 누락 또는 무능력 export — 각각 파일을 명명하는 실행 가능 메시지와 함께.
- [ ] 모든 brief-§9 stub이 등록되고 `registry.list()`/`caw05 adapters`에 표시되며 강제로 `active`로 하면 거부됨.
- [ ] 다섯 ports 모두에 대한 fakes 존재; Run이 fakes를 통해 모든 port를 통과하며 `abstain→human`이 `data/review/`로 라우팅되고 export되지 않음.
- [ ] no-bypass 가드 테스트 통과: 어떤 경로도 classify→route→review-gate 없이 synth/export에 도달하지 않음; 생성된 rationale은 결코 evidence 필드가 아님.
- [ ] CI green; core→ports 경계 여전히 강제됨.

## Rollback / safety
- 모든 추가는 인터페이스, registry, fakes, 비활성 stub입니다 — 실제 fetching 없음, 따라서 구성상 여전히 합법/ToS 적합(stub은 어떤 I/O보다 먼저 raise).
- preflight가 stub이나 ToS-restricted source를 실행하게 한다면 STOP — 그것은 PRODUCT-BRIEF §12를 깨뜨립니다; acceptance 전에 preflight를 고치세요.
- no-bypass 가드는 "생성된 요약은 결코 evidence가 아니다"의 구조적 보장입니다 — 후속 runbook을 통과시키려고 결코 약화시키지 마세요.
- 브랜치를 폐기하여 되돌림; `data/review/` 아래 테스트 fixture 외에 데이터 트리 변경 없음(teardown에서 정리).

## Hand-off
RB-003이 가정해도 되는 것: provenance/boundary를 가진 타입화된 ports + 값 객체, 작동하는 registry + config 로더 + preflight, fakes, 그리고 no-bypass 보장. RB-003은 files-as-truth store + 재구축 가능한 SQLite 인덱스/ledger-cache를 구축하고 interest artifact 스키마 + watch-list 시드를 채웁니다. 이후 Phase 1이 v1 source/classifier/format/export/scheduler adapter를 바로 이 ports + registry에 구현합니다.
