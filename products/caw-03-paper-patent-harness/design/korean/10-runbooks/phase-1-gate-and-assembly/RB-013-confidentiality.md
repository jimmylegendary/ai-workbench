# RB-013: Confidentiality (boundary + redaction)

- Status: ready
- Phase: phase-1-gate-and-assembly
- Depends on: [RB-010]
- Implements design: [../../04-data-layer/confidentiality-and-provenance_ko.md](../../04-data-layer/confidentiality-and-provenance_ko.md), [../../01-decisions/ADR-0007-confidentiality-and-boundary_ko.md](../../01-decisions/ADR-0007-confidentiality-and-boundary_ko.md)
- Produces: import + assembly + publish에서 사용되는 confidentiality 엔진(boundary×visibility, redaction)

## Objective

상속된 CAW-02 boundary×visibility 모델 + redaction을 구현하고, import, assembly, publish에서 fail-closed로
강제한다 — 특허를 위한 제안된 counsel/pre-filing tier 포함.

## Preconditions
- [ ] RB-010(import). redaction ruleset 사용 가능(vendored+pinned 또는 envelope-pinned — OQ-21 참조).

## Steps
1. **Do:** two-axis 모델(boundary {public/internal/confidential} × visibility {team/private}) + counsel tier hook을 구현한다.
   **Verify:** `test:` effective boundary가 계산됨; counsel tier가 특허 egress를 gate한다.
2. **Do:** target boundary로의 redaction을 구현한다; **fail-closed**(over-share 시 abort, 결코 조용히 emit하지 않음).
   **Verify:** `test:` T7 — public target으로 publish하면 public-safe로 redact되고; over-share는 abort된다.
3. **Do:** 검사를 import(quarantine), assembly(over-track 제외), publish(redact/abort)에 연결한다.
   **Verify:** `test:` 각 강제 지점이 over-boundary 콘텐츠를 거부한다.

## Acceptance criteria
- [ ] boundary×visibility + counsel tier가 모델링됨; redaction이 fail-closed(T7).
- [ ] import, assembly, publish에서 강제됨.

## Rollback / safety
불확실할 때 deny-by-default; 롤백하려면 revert한다. 결코 "warn only"로 약화하지 않는다.

## Hand-off
Publish(RB-040)와 patent(RB-022)가 이 엔진을 재사용한다; 어떤 export도 boundary를 넘지 않는다.
