# RB-001: 툴링, CI, core→ports 경계 규칙, 그리고 op-manifest

- Status: ready
- Phase: phase-0-foundations
- Depends on: [RB-000]
- Implements design: [../../03-architecture/repo-structure_ko.md](../../03-architecture/repo-structure_ko.md), [../../05-publishing-core/ports-and-adapters_ko.md](../../05-publishing-core/ports-and-adapters_ko.md), [../../01-decisions/ADR-0004-import-and-ports_ko.md](../../01-decisions/ADR-0004-import-and-ports_ko.md)
- Produces: lint + typecheck + test 툴체인; 모든 커밋을 green으로 게이트하는 CI 파이프라인; 강제되는 아키텍처 경계 규칙(core→ports만, adapters→ports만); 그리고 여섯 개의 operation(import, recheck, gate, version, build, publish, unpublish)을 NotImplemented 본문을 가진 spec으로 선언하는 타입화된 **op-manifest**.

## Objective

리포지토리가 품질 게이트와 operation 계약을 갖추게 된다. Lint, typecheck, 그리고 test runner가 연결되어 모든 push마다 CI에서 실행되며, 각 acceptance 체크포인트에서 트리는 green을 유지해야 한다([DOC-CONVENTIONS §6](../../_meta/DOC-CONVENTIONS_ko.md)). 헥사곤이 썩지 않도록 **아키텍처 경계 규칙**이 기계적으로 강제된다: `src/core/**`는 `src/core/**`와 `src/ports/**`에서만 import할 수 있고(절대 `src/adapters/**`에서는 안 됨), `src/adapters/**`는 `src/ports/**` + `src/core/**`의 공유 타입을 import할 수 있지만 adapter끼리는 서로 import하지 않는다. **op-manifest**가 추가된다: 여섯 개의 파이프라인 operation을 그 input/output value-object 타입 및 순서와 함께 열거하는 단일 타입화된 모듈로, 이후 runbook들이 고정된 계약에 맞춰 본문을 채우고 어떤 operation도 단계를 건너뛰며 추가될 수 없도록 한다. "Done" = CI가 green이고, 경계 규칙이 위반 시 빌드를 실패시키며, op-manifest가 타입 체크를 통과하는 것.

## Preconditions

- [ ] RB-000 완료: 트리가 컴파일되고, `tsc --noEmit`가 통과하며, lockfile이 고정됨.
- [ ] `src/ports/`, `src/core/`, `src/adapters/` 디렉터리가 존재함.

## Steps

1. **고정된 config로 linter + formatter 추가.**
   - Do: ESLint(TypeScript 인식) + formatter 추가; 버전을 정확히 고정; `lint`, `format` 스크립트 추가. Astro + TS 프로젝트에 맞게 구성.
   - Verify: `lint`가 RB-000 스켈레톤에서 깨끗하게 실행됨.

2. **typecheck + test runner 스크립트 추가.**
   - Do: `typecheck`(`tsc --noEmit` / `astro check`)와 test runner(예: Vitest)를 `test` 스크립트와 `tests/` 아래 사소하게 통과하는 smoke test 하나와 함께 추가.
   - Verify: `typecheck`와 `test`가 모두 통과.

3. **core→ports 경계 규칙을 기계적으로 강제.**
   - Do: 다음을 인코딩하는 import-boundary lint 규칙(예: `eslint-plugin-boundaries` 또는 `no-restricted-imports` zone)을 추가:
     - `src/core/**` → `src/core/**`, `src/ports/**`만 import 가능. **`src/adapters/**` import은 오류.**
     - `src/adapters/**` → `src/ports/**`와 `src/core/model/**`의 공유 타입을 import 가능; **다른 adapter 디렉터리 import은 오류.**
     - `src/pages/**`(build/serialize)는 `src/core/**` + `src/lib/**`를 import 가능; `_audit/**`는 import하면 안 됨(served-vs-audit 방화벽, repo-structure §Layout-rule 1).
   - Verify: `src/core/`에 `src/adapters/`에서 import하는 임시 파일을 추가 → `lint`가 실행 가능한 메시지와 함께 FAIL; 제거하면 → `lint` 통과.

4. **경계 규칙에 대한 회귀 테스트 추가.**
   - Do: 경계 lint 규칙이 구성되어 있음을 단언하는 테스트(예: config zone을 snapshot)를 `tests/` 아래 추가하여 규칙이 조용히 삭제될 수 없도록 함.
   - Verify: `test`가 통과; zone을 삭제하면 테스트가 실패.

5. **op-manifest를 타입화된 spec으로 작성.**
   - Do: 여섯 개의 operation을 고정된 파이프라인 순서로 그 value-object 시그니처와 함께 선언하는 `src/core/op-manifest.ts`를 생성(타입은 `src/core/model/**`에서 import; 전체 타입 본문은 RB-002/RB-003에서 도착 — 타입 체크만 통과하면 여기서는 placeholder도 괜찮음):

     ```ts
     // src/core/op-manifest.ts — the fixed operation contract; the ONLY sanctioned pipeline.
     // Order mirrors the hexagon (ports-and-adapters §1); no op may be reordered or skipped.
     export type Op =
       | "import"     // ContentSourceAdapter.fetch -> CandidateItem            (source port)
       | "recheck"    // CORE public-safe re-check: CandidateItem -> RecheckVerdict (deny-by-default)
       | "gate"       // CORE curator approval: Verdict + Candidate -> Acceptance (Jimmy approves)
       | "version"    // CORE: assign semver + compute content-digest -> PublishableItem
       | "build"      // CORE serialize: PublishableItem -> static artifact inputs (projection strips sidecar)
       | "publish"    // PublishSinkAdapter.publish -> PublishReceipt              (sink port)
       | "unpublish"; // PublishSinkAdapter.unpublish -> 410 tombstone receipt    (sink port)

     export interface OpSpec<I, O> {
       op: Op;
       stage: "source-port" | "core" | "sink-port";
       /** ops that MUST have run before this one (enforces no-bypass) */
       requires: Op[];
       run(input: I): Promise<O>;   // NotImplemented body in phase 0
     }
     ```
     각각에 주석 달기: `recheck`, `gate`, `version`, `build`는 `stage: "core"`; `import`만 `source-port`; `publish`/`unpublish`는 `sink-port`. 주석에서 강조: **public-safe re-check는 CORE op이며 절대 adapter 안에 있지 않다; 상류 경계는 증거(evidence)일 뿐이다; audit 필드는 `build` 단계에서 projection을 통해 제거된다; version은 일단 생성되면 불변이다.**
   - Verify: `typecheck` 통과; 본문은 `NotImplemented`를 throw.

6. **op-manifest 순서 불변식 테스트 추가.**
   - Do: `requires` 그래프가 다음을 강제함을 단언하는 테스트를 추가: `gate` 전에 `recheck`, `version` 전에 `gate`, `build`/`publish` 전에 `version`, 그리고 `publish`가 전체 core 체인(`import → recheck → gate → version`)을 요구함. 이것은 "어떤 adapter도 gate를 우회할 수 없다"(dependency-graph §Invariants)의 테스트 수준 표현이다.
   - Verify: 테스트 통과; `publish` 전의 `recheck`를 빼도록 `OpSpec.requires`를 변형하면 실패.

7. **CI 연결.**
   - Do: 모든 push/PR마다 `install (frozen lockfile) → lint → typecheck → test → astro build`를 실행하는 CI workflow 추가; 어떤 단계든 0이 아닌 종료 시 파이프라인 실패.
   - Verify: CI가 현재 트리에서 green으로 실행; lint/boundary 위반을 도입하면 CI가 red가 됨.

## Acceptance criteria

- [ ] `lint`, `typecheck`, `test`, `astro build`가 모두 로컬과 CI에서 통과.
- [ ] `src/adapters/**`를 import하는 `src/core/**` 파일이 `lint`를 실패시키고(경계 규칙 강제됨), 테스트가 규칙의 존재를 보호함.
- [ ] `_audit/**`를 import하는 `src/pages/**`가 lint를 실패시킴(served-vs-audit 방화벽).
- [ ] `src/core/op-manifest.ts`가 여섯 개의 operation(import, recheck, gate, version, build, publish/unpublish)을 모두 `stage`와 `requires`와 함께 선언; recheck/gate/version/build는 `stage:"core"`.
- [ ] 순서 불변식 테스트가 `import → recheck → gate → version → build/publish`를 강제; `requires` 엣지를 빼면 실패.
- [ ] CI가 green; 의도적 위반이 red로 만듦.

## Rollback / safety

- 모든 추가 사항은 config/test 스캐폴딩이며, `git`으로 RB-000 커밋으로 revert.
- 경계 규칙을 절대 "warn"으로 완화하지 말 것 — CI를 실패시키는 **error**여야 하며, 그렇지 않으면 adapter가 core gate를 우회하는 경로를 키울 수 있다.
- op-manifest `requires` 엣지는 load-bearing safety 제약이다; 이후 runbook에서 약화시키지 말 것 — 우회로가 아니라 본문을 추가하라.

## Hand-off

다음 runbook들은 다음을 가정할 수 있다: 강제된 lint/typecheck/test를 갖춘 green CI; 기계적으로 강제된 헥사곤 경계; 그리고 유일하게 승인된 파이프라인 순서를 정의하는 고정된 타입화된 op-manifest로, 여기에 RB-002(ports/registry)와 RB-003(schemas/versioning), 그리고 phase-1+ runbook들이 실제 본문을 채운다. re-check, gate, version, build op은 **core** 단계로 예약되어 있다.
