# RB-001: Tooling, CI, and the op-manifest

- Status: ready
- Phase: phase-0-foundations
- Depends on: [RB-000]
- Implements design: [../../03-architecture/component-boundaries_ko.md](../../03-architecture/component-boundaries_ko.md), [../../07-backend-api/api-surface_ko.md](../../07-backend-api/api-surface_ko.md)
- Produces: lint/boundary 규칙, test, CI, 그리고 op-manifest → 타입이 지정된 op contract

## Objective

boundary를 기계로 강제하고, test runner + CI를 연결하며, 모든 surface가 매핑될 Zod 타입 IO를 갖춘
**op-manifest**(governance 대상 연산의 유한 집합)를 정의한다.

## Preconditions
- [ ] RB-000 완료.

## Steps
1. **Do:** ESLint + strict TS + boundary 규칙: `core`는 `ports`만 import 가능; `adapters/*`는 `ports`만 import 가능; surface는 core op API를 import한다.
   **Verify:** `cmd: pnpm lint`이 의도적인 `core→adapters` import에서 실패하고, 제거하면 통과한다.
2. **Do:** op-manifest(`import_bundle, build_ledger, gate_claims, assemble_inputs, draft_paper, draft_patent, run_novelty, review, publish`)를 `core`에 Zod 타입 op spec으로 정의한다(아직 구현 없음).
   **Verify:** `test:` 각 op spec이 샘플 입력을 검증하고/잘못된 것을 거부한다.
3. **Do:** Vitest(unit) + contract-test harness(ports) + e2e placeholder를 추가하고, 각각 사소한 통과 test 하나씩.
   **Verify:** `cmd: pnpm test`이 0으로 종료된다.
4. **Do:** CI: install → typecheck → lint(+boundary) → test on push.
   **Verify:** `cmd:` CI config가 검증되고; 첫 실행이 green이다.

## Acceptance criteria
- [ ] boundary 규칙이 금지된 import를 차단한다(증명됨).
- [ ] op-manifest가 타입 spec으로 존재; `pnpm typecheck && lint && test`가 green; CI가 gate를 실행한다.

## Rollback / safety
config + spec만; 롤백하려면 revert한다.

## Hand-off
이후 runbook들이 boundary 규칙이 강제된 상태에서 타입이 지정된 manifest 뒤로 각 op를 구현한다.
