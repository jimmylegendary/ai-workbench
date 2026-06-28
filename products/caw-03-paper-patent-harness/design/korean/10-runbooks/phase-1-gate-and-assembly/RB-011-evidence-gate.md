# RB-011: Evidence gate

- Status: ready
- Phase: phase-1-gate-and-assembly
- Depends on: [RB-010]
- Implements design: [../../05-harness-core/evidence-gate-and-claim-ledger_ko.md](../../05-harness-core/evidence-gate-and-claim-ledger_ko.md), [../../01-decisions/ADR-0003-evidence-gate-and-claim-ledger_ko.md](../../01-decisions/ADR-0003-evidence-gate-and-claim-ledger_ko.md)
- Produces: `gate_claims` — type-specific하고 profile로 설정 가능하며 fail-closed인 evidence gate

## Objective

핵심 무결성 op: ledger를 `GatedClaimSet`으로 gate한다. type-specific threshold(P1/P2/P3), profile로 설정 가능,
**fail-closed**, 그리고 완화 불가능한 단 하나의 불변식: **생성된 텍스트는 결코 evidence가 아니다**.

## Preconditions
- [ ] RB-010(ledger). gate profile이 `config/`에 정의됨.

## Steps
1. **Do:** `gate_claims(ledgerId, profile)`를 구현한다: claim마다 `evidence_refs`가 실제 CAW-02 evidence artifact로 resolve되고 해당 claim_type에 대한 profile threshold를 충족하는지 검사한다.
   **Verify:** `test:` P1/P2/P3 threshold가 profile로부터 적용된다.
2. **Do:** synthesis/summary가 gate를 충족할 수 없도록 구조적으로 강제한다(prose-evidence 경로 없음).
   **Verify:** `test:` 유일한 "evidence"가 생성된 텍스트인 claim은 BLOCK된다.
3. **Do:** fail-closed: blocked claim은 `GatedClaimSet`에 진입하지 않고; `gate_status=blocked` backlog로 persist한다.
   **Verify:** `test:` blocked claim이 backlog에 나타나고; 통과한 claim만 GatedClaimSet에 있다.
4. **Do:** surface 우회가 없음을 증명한다: core + (fake) MCP/CLI 경로로 호출한다.
   **Verify:** `test:` T1 — gate가 어떤 surface로도 우회될 수 없다.

## Acceptance criteria
- [ ] gate가 profile로 설정 가능 + type-specific + fail-closed.
- [ ] generated-text-never-evidence가 유지됨(T2); backlog가 persist됨; surface 우회 없음(T1).

## Rollback / safety
순수 core 로직; 롤백하려면 revert한다. 불확실할 때 gate는 기본적으로 거부한다.

## Hand-off
RB-012가 GatedClaimSet에서만 engine input을 assemble한다.
