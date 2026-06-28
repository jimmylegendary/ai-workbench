# RB-013: 기밀성 (경계 + 편집/마스킹)

- Status: ready
- Phase: phase-1-gate-and-assembly
- Depends on: [RB-010]
- Implements design: [../../04-data-layer/confidentiality-and-provenance_ko.md](../../04-data-layer/confidentiality-and-provenance_ko.md), [../../01-decisions/ADR-0007-confidentiality-and-boundary_ko.md](../../01-decisions/ADR-0007-confidentiality-and-boundary_ko.md)
- Produces: 임포트 + 어셈블리 + 퍼블리시에서 사용되는 기밀성 엔진 (boundary×visibility, redaction)

## Objective

상속받은 CAW-02 boundary×visibility 모델 + redaction을 구현하고, 임포트, 어셈블리, 퍼블리시에서 fail-closed로 강제한다 —
특허를 위한 제안된 counsel/pre-filing 계층을 포함하여.

## Preconditions
- [ ] RB-010 (임포트). Redaction 룰셋이 준비되어 있어야 함 (vendored+pinned 또는 envelope-pinned — OQ-21 참조).

## Steps
1. **Do:** 2축 모델 (boundary {public/internal/confidential} × visibility {team/private}) + counsel 계층 훅을 구현한다.
   **Verify:** `test:` 유효 경계(effective boundary)가 계산됨; counsel 계층이 특허 egress를 게이팅함.
2. **Do:** 목표 경계로의 redaction을 구현한다; **fail-closed** (과다 공유 시 중단, 절대 조용히 방출하지 않음).
   **Verify:** `test:` T7 — public 대상으로 퍼블리시 시 public-safe로 redaction됨; 과다 공유는 중단됨.
3. **Do:** 검사를 임포트(격리), 어셈블리(트랙 초과 제외), 퍼블리시(redaction/중단)에 배선한다.
   **Verify:** `test:` 각 강제 지점이 경계를 넘는 콘텐츠를 거부함.

## Acceptance criteria
- [ ] Boundary×visibility + counsel 계층이 모델링됨; redaction fail-closed (T7).
- [ ] 임포트, 어셈블리, 퍼블리시에서 강제됨.

## Rollback / safety
불확실할 때 기본 거부(deny-by-default); 롤백하려면 revert. 절대 "경고만(warn only)"으로 약화하지 않는다.

## Hand-off
퍼블리시(RB-040)와 특허(RB-022)가 이 엔진을 재사용한다; 어떤 export도 경계를 넘지 않는다.
