# RB-010: 소스 어댑터 + 레저 임포트

- Status: ready
- Phase: phase-1-gate-and-assembly
- Depends on: [RB-002, RB-003]
- Implements design: [../../05-harness-core/evidence-gate-and-claim-ledger_ko.md](../../05-harness-core/evidence-gate-and-claim-ledger_ko.md), [../../05-harness-core/ports-and-adapters_ko.md](../../05-harness-core/ports-and-adapters_ko.md)
- Produces: v1 SourceAdapters (CAW-02 bundle, CAW-01 results) + `import_bundle`/`build_ledger`

## Objective

CAW-02 청구항+증거 번들과 CAW-01 결과 참조를 `SourceAdapter`를 통해 임포트하고, CAW-02를 REFERENCE(소유권을 다시 갖지 않음)하는
`ClaimRef`들의 `ClaimLedger`를 구축한다. 향후의 wiki/exp-server 소스는 동일한 포트 뒤의 스텁(stub)으로 둔다.

## Preconditions
- [ ] RB-002 (ports/registry), RB-003 (store). 샘플 CAW-02 번들 + CAW-01 결과 픽스처가 준비되어 있어야 함.

## Steps
1. **Do:** `SourceAdapter` 뒤에 `adapters/source/v1/caw02-bundle`와 `caw01-results`를 구현하고 등록한다.
   **Verify:** `test:` 레지스트리가 이들을 선택함; preflight 통과.
2. **Do:** `import_bundle(sourceRef)` 구현: 격리(quarantine) + 기밀성 검사(경계 동반), `Bundle` + 출처(provenance) 매니페스트 참조 영속화.
   **Verify:** `test:` 경계를 넘는 항목은 격리/거부됨; 유효한 번들은 영속화됨.
3. **Do:** `build_ledger(bundleId)` 구현: `ClaimRef`들 생성 (claim_type, evidence_refs는 CAW-02 id로).
   **Verify:** `test:` 레저가 CAW-02 id를 참조함; 인라인 청구항/증거 텍스트는 복사되지 않음.
4. **Do:** 향후 스텁 `adapters/source/stubs/internal-wiki`, `internal-experiment-server` 추가 (인터페이스 + `implemented:false` + 설정 예시).
   **Verify:** `test:` 스텁이 선택 가능하고, unavailable로 표시되며, 절대 거버넌스를 우회하지 않음.

## Acceptance criteria
- [ ] CAW-02/CAW-01 임포트 동작; 레저가 CAW-02를 참조(복사 아님)함.
- [ ] 임포트 시 기밀성이 적용됨; 향후 소스 스텁이 존재하며 안전함.

## Rollback / safety
어댑터 + 연산(ops); 롤백하려면 revert. 여기서는 퍼블리시 없음.

## Hand-off
RB-011이 임포트된 레저를 게이팅한다.
