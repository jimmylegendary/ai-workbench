# RB-011: 증거 게이트(evidence gate)

- Status: ready
- Phase: phase-1-gate-and-assembly
- Depends on: [RB-010]
- Implements design: [../../05-harness-core/evidence-gate-and-claim-ledger_ko.md](../../05-harness-core/evidence-gate-and-claim-ledger_ko.md), [../../01-decisions/ADR-0003-evidence-gate-and-claim-ledger_ko.md](../../01-decisions/ADR-0003-evidence-gate-and-claim-ledger_ko.md)
- Produces: `gate_claims` — 타입별, 프로파일 구성 가능, fail-closed 증거 게이트

## Objective

핵심 무결성 연산: 레저를 `GatedClaimSet`으로 게이팅한다. 타입별 임계값(P1/P2/P3),
프로파일 구성 가능, **fail-closed**, 그리고 완화 불가능한 단 하나의 불변식: **생성된 텍스트는 결코 증거가 아니다**.

## Preconditions
- [ ] RB-010 (레저). 게이트 프로파일이 `config/`에 정의되어 있어야 함.

## Steps
1. **Do:** `gate_claims(ledgerId, profile)` 구현: 청구항별로 `evidence_refs`가 실제 CAW-02 증거 아티팩트로 resolve되고 해당 claim_type에 대한 프로파일 임계값을 충족하는지 검사한다.
   **Verify:** `test:` 프로파일로부터 P1/P2/P3 임계값이 적용됨.
2. **Do:** 합성(synthesis)/요약(summary)이 게이트를 충족할 수 없도록 구조적으로 강제한다 (prose-evidence 경로 없음).
   **Verify:** `test:` 유일한 "증거"가 생성된 텍스트뿐인 청구항은 BLOCKED됨.
3. **Do:** Fail-closed: 차단된 청구항은 `GatedClaimSet`에 들어가지 않음; `gate_status=blocked` 백로그로 영속화.
   **Verify:** `test:` 차단된 청구항은 백로그에 나타남; 통과한 청구항만 GatedClaimSet에 들어감.
4. **Do:** 어떤 surface로도 우회 불가함을 증명: core + (가짜) MCP/CLI 경로로 호출.
   **Verify:** `test:` T1 — 게이트는 어떤 surface로도 우회될 수 없음.

## Acceptance criteria
- [ ] 게이트가 프로파일 구성 가능 + 타입별 + fail-closed임.
- [ ] generated-text-never-evidence가 유지됨(T2); 백로그가 영속됨; surface 우회 불가(T1).

## Rollback / safety
순수 core 로직; 롤백하려면 revert. 불확실할 때 게이트는 기본적으로 거부한다.

## Hand-off
RB-012는 GatedClaimSet에서만 엔진 입력을 어셈블한다.
