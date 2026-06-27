# RB-001: Tooling, CI, op manifest, 그리고 얇은 adapter의 codegen

- Status: ready
- Phase: phase-0-foundations
- Depends on: [RB-000]
- Implements design: [component-boundaries.md §"one op manifest → codegen'd adapters"](../../03-architecture/component-boundaries_ko.md), [tech-stack.md §"one op manifest → codegen'd thin adapters"](../../03-architecture/tech-stack_ko.md), [repo-structure.md §manifest/schemas](../../03-architecture/repo-structure_ko.md)
- Produces: lint + typecheck + test runner 설정; CI 파이프라인(build + lint + test + schema-validate); `manifest/ops.yaml`(단일 op 선언); manifest로부터 MCP tool def + CLI subcommand + API route + 공유 JSON-Schema/zod를 생성하는 `src/codegen/`; `adapters → core/* → store/*`를 강제하는 boundary(import 방향) lint; parity contract 테스트 stub

## Objective
리포지토리가 품질 gate와 단일 operation truth를 얻는다. `manifest/ops.yaml`은 `kr.*` op 카탈로그를 선언한다(각 op은 한 번씩: name, kind, idempotency, confirm policy, input schema, errors). `src/codegen/`의 codegen 단계가 그 manifest를 세 개의 얇은 adapter surface(MCP/CLI/API)와 공유 validation schema로 변환한다 — adapter는 로직을 갖지 않는다. boundary lint는 의존성 방향을 위반하는 모든 import를 실패시킨다. parity contract 테스트 stub은 세 surface가 동일한 op 집합을 노출함을 단언한다. "Done" = CI가 lint + typecheck + test + schema-validate를 green으로 실행하고, codegen이 deterministic하며(재실행 시 diff 없음), boundary lint가 심어둔 위반을 잡아냄. 실제 op body는 여기서 구현하지 않는다 — manifest, generator, gate만.

## Preconditions
- [ ] RB-000 완료: 컴파일되는 TS workspace, `manifest/`, `src/codegen/`, `schemas/`, `tests/`가 존재.
- [ ] `zod`, `zod-to-json-schema`, MCP SDK, CLI 라이브러리, HTTP 프레임워크에 대한 버전 pin이 선택됨(이제 `tech-stack.md`의 `TODO(open-question)` pin을 resolve; `README.md`에 기록).
- [ ] `component-boundaries.md`의 op 카탈로그를 읽었음(write: `add_source, extract_claims, attach_evidence, synthesize_note, classify_signal, record_decision, link, import_projection`; read: `search, get, export_bundle, verify_audit`).

## Steps

1. **Lint + format + typecheck 설정.**
   - Do: ESLint + formatter와 `import/order` 가능 plugin 추가; typecheck 스크립트로 `tsc --noEmit` 추가. `lint`, `typecheck`, `format:check` npm 스크립트 추가.
   - Verify: scaffold에서 `npm run lint`, `npm run typecheck`, `npm run format:check`가 각각 0으로 종료.

2. **Test runner.**
   - Do: test runner(예: `vitest`/`node:test` — 스택에 맞게 pin)를 `tests/**`와 inline `*.test.ts`를 발견하는 `test` 스크립트와 함께 추가.
   - Verify: `npm test`가 실행되고(0개 테스트 또는 사소하게 통과하는 테스트) 0으로 종료.

3. **op manifest 작성.**
   - Do: 위 카탈로그의 op당 한 항목으로 `manifest/ops.yaml`을 작성하되, `component-boundaries.md`의 예시 형태를 사용: `op`, `kind: write|read`, `idempotent`, `read_only_hint`, `confirm: agent_default`(write), `input_schema`(field가 선언되는 유일한 곳), `errors`. 결정적으로 evidence gate를 structural하게 인코딩하라: `attach_evidence`는 `claim_ref`, `artifact_ref`(필수), `stance`, 선택적 `locator`를 가지며 — prose/summary field는 없음; `errors: [ERR_EVIDENCE_NOT_ARTIFACT, ERR_NOTE_AS_EVIDENCE]`.
   - Verify: manifest-load 테스트가 `ops.yaml`을 파싱하고 카탈로그 집합이 예상 op 이름과 같음을 단언; `attach_evidence.input_schema`에 `prose`/`summary`/`text` 키가 없음.

4. **Codegen: manifest → 공유 schema.**
   - Do: `src/codegen/`에서 op input당 공유 zod schema와 `zod-to-json-schema` JSON Schema(core가 소비할 validation 계약)를 방출하는 generator를 빌드. 생성 디렉터리(예: `src/codegen/_generated/` 또는 `schemas/_generated/`)로 출력.
   - Verify: codegen 실행이 op당 schema 하나를 생성; 생성된 출력에서 `npx tsc --noEmit` 통과.

5. **Codegen: manifest → 세 개의 얇은 adapter.**
   - Do: MCP tool def + annotation(`op`, `read_only_hint`, `confirm`, `input_schema`로부터), CLI subcommand + flag(`--json`, `--idempotency-key`, `--yes`), API route(write는 `POST /v1/<resource>`, read는 문서화된 대로)를 생성. 생성된 adapter 코드는 반드시 transport ↔ typed op call을 `core/*`로 marshal만 해야 함 — validation/gate/store 접근 없음(Step 7에서 강제).
   - Verify: MCP, CLI, API 전반에 걸쳐 모든 op에 대한 생성된 adapter 파일이 존재; 그것들은 core op entrypoint(stub) + 생성된 schema에서만 import.

6. **Codegen determinism gate.**
   - Do: 임시 위치로 재생성하고 commit된 생성 파일과 diff하는 `codegen:check` 스크립트 추가; CI는 drift 시 실패(adapter는 재생성될 뿐 손으로 편집하지 않음 — ADR-0001).
   - Verify: `npm run codegen` 후 `npm run codegen:check`가 0으로 종료; 생성 파일을 수동 편집하면 `codegen:check`가 실패.

7. **Boundary(import 방향) lint.**
   - Do: `component-boundaries.md`의 매트릭스를 강제하는 lint 규칙(ESLint `no-restricted-imports`/`import/no-restricted-paths` 또는 `scripts/`의 작은 AST 검사) 추가: `adapters/**`는 `core/**` op entrypoint + 생성된 schema를 import할 수 있지만 `store/**`, `index/**`, 또는 `core/*/{validate,evidence-gate,...}` 내부는 import할 수 없음; `core/**`는 `store/**`/`index/**`를 import할 수 있음; 어떤 것도 `adapters`로 거슬러 올라가 import하지 않음. `core/ingest`만 `store/files`→`store/index`를 통해 write할 수 있음(문서화됨; 이후 phase에서 추가 강제).
   - Verify: lint가 깨끗하게 통과; `adapters/cli` 안에 심어둔 `store/index` `import`가 명확한 메시지와 함께 lint를 실패시킴; 심어둔 것을 제거.

8. **Parity contract 테스트 stub.**
   - Do: `tests/`에 `manifest/ops.yaml`을 로드하고 각 surface(MCP tool list, CLI subcommand list, API route table)가 manifest에서 파생된 동일한 op 집합을 노출함을 단언하는 parity 테스트 추가. 지금은 stub(라이브 서버가 아니라 생성된 metadata를 구동)이지만 surface가 op을 누락하면 반드시 실패해야 함.
   - Verify: parity 테스트가 통과; 한 생성된 surface에서 op 하나를 삭제하면 실패; 복원.

9. **CI 파이프라인.**
   - Do: 다음을 순서대로 실행하는 CI(예: GitHub Actions) 추가: install → `codegen:check` → `typecheck` → `lint`(boundary lint 포함) → `test`(parity 포함) → schema-validate(fixture를 생성된 JSON Schema에 대해 검증; fixture는 RB-002까지 비어 있거나 placeholder일 수 있음). push/PR에서 실행되도록 연결.
   - Verify: CI 설정이 유효; 로컬 `act`/스크립트 실행(또는 나열된 스크립트가 순서대로 실행)이 모두 0으로 종료.

## Acceptance criteria
- [ ] `npm run lint`, `typecheck`, `test`, `format:check`가 모두 green.
- [ ] `manifest/ops.yaml`이 전체 read+write op 카탈로그를 선언; `attach_evidence`에 prose field 없음(structural gate 인코딩됨).
- [ ] Codegen이 공유 zod/JSON-Schema + MCP/CLI/API adapter를 생성; `codegen:check`가 0으로 종료하고 손편집을 감지.
- [ ] Boundary lint가 깨끗하게 통과하고 심어둔 `adapters → store` import를 거부.
- [ ] Parity contract 테스트가 세 surface 전반에 동일한 op 집합을 단언하고 op 누락 시 실패.
- [ ] CI가 build + lint + test + schema-validate를 순서대로 실행하고 현재 트리에서 green.
- [ ] 생성된 adapter가 validation/gate/store 로직을 포함하지 않음.

## Rollback / safety
- 모든 artifact는 code/config이며 정규 데이터는 건드리지 않음. `git reset --hard <pre-RB-001>`로 revert. 생성된 파일은 `npm run codegen`으로 manifest에서 재현 가능하므로 삭제해도 안전.

## Hand-off
- RB-002는 다음을 가정할 수 있다: 동작하는 test runner + CI, 공유 schema generator, 그리고 자신이 추가하는 frontmatter zod schema가 schema-validate CI 단계에 의해 픽업됨.
- Phase-1(core) RB는 op manifest가 존재하고 adapter가 `core/*` op entrypoint를 호출하는 codegen된 얇은 shell임을 가정할 수 있다; 그들은 그 entrypoint 뒤의 op body를 구현한다.
- boundary lint와 parity 테스트는 이제 이후의 모든 RB가 green으로 유지해야 하는 상시 gate이다.
