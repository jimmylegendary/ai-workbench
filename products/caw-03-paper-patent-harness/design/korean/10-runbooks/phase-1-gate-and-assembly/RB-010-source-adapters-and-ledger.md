# RB-010: Source adapters + ledger import

- Status: ready
- Phase: phase-1-gate-and-assembly
- Depends on: [RB-002, RB-003]
- Implements design: [../../05-harness-core/evidence-gate-and-claim-ledger_ko.md](../../05-harness-core/evidence-gate-and-claim-ledger_ko.md), [../../05-harness-core/ports-and-adapters_ko.md](../../05-harness-core/ports-and-adapters_ko.md)
- Produces: v1 SourceAdapter(CAW-02 bundle, CAW-01 results) + `import_bundle`/`build_ledger`

## Objective

`SourceAdapter`를 통해 CAW-02 claim+evidence bundle과 CAW-01 result ref를 import하고, CAW-02를 **참조**하는
(결코 다시 소유하지 않는) `ClaimRef`들의 `ClaimLedger`를 빌드한다. 미래의 wiki/exp-server source는 같은 port 뒤의 stub이다.

## Preconditions
- [ ] RB-002(ports/registry), RB-003(store). 샘플 CAW-02 bundle + CAW-01 result fixture 사용 가능.

## Steps
1. **Do:** `SourceAdapter` 뒤로 `adapters/source/v1/caw02-bundle`과 `caw01-results`를 구현하고; 등록한다.
   **Verify:** `test:` registry가 이들을 선택하고; preflight가 통과한다.
2. **Do:** `import_bundle(sourceRef)`를 구현한다: quarantine + confidentiality 검사(boundary 운반), `Bundle` + provenance manifest ref persist.
   **Verify:** `test:` boundary를 초과하는 항목은 quarantine/거부되고; 유효한 bundle은 persist된다.
3. **Do:** `build_ledger(bundleId)`를 구현한다: `ClaimRef`들을 생성한다(claim_type, evidence_refs는 CAW-02 id로).
   **Verify:** `test:` ledger가 CAW-02 id를 참조하고; inline claim/evidence text가 복사되지 않는다.
4. **Do:** 미래 stub인 `adapters/source/stubs/internal-wiki`, `internal-experiment-server`를 추가한다(interface + `implemented:false` + config 예시).
   **Verify:** `test:` stub이 선택 가능하고, unavailable로 표시되며, governance를 결코 우회하지 않는다.

## Acceptance criteria
- [ ] CAW-02/CAW-01 import가 동작하고; ledger가 CAW-02를 참조한다(복사 아님).
- [ ] import 시 confidentiality가 적용되고; 미래 source stub이 존재하며 안전하다.

## Rollback / safety
adapter + op; 롤백하려면 revert한다. 여기서는 publish 없음.

## Hand-off
RB-011이 import된 ledger를 gate한다.
