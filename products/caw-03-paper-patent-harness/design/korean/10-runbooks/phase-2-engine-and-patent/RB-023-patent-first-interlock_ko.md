# RB-023: Patent-first interlock

- Status: ready
- Phase: phase-2-engine-and-patent
- Depends on: [RB-022]
- Implements design: [../../05-harness-core/patent-drafting-module_ko.md](../../05-harness-core/patent-drafting-module_ko.md), [../../05-harness-core/artifact-lifecycle_ko.md](../../05-harness-core/artifact-lifecycle_ko.md)
- Produces: publish를 기본 거부(default-deny)하는 patent-first interlock (핵심 로직)

## 목표

harness-core에 **patent-first interlock**을 구현한다: patent-sensitive 클레임을 포함한 논문은 patent gate가
해제될 때까지 publish될 수 없다. 이는 어댑터 로컬이 아니라 핵심 로직이다.

## 사전 조건
- [ ] RB-022 (patent 경로). Patent-sensitive 플래깅이 존재하거나 stub되어 있다 (RB-030에서 완전히 설정됨).

## 단계
1. **Do:** `InterlockState{claim_ref, patent_first, status: held|released}`를 모델링한다; 클레임이 patent-sensitive일 때 `held`로 설정한다.
   **Verify:** `test:` 클레임을 patent-sensitive로 플래깅하면 `held`로 설정된다.
2. **Do:** publish 경로에서 artifact의 GatedClaimSet 내 모든 클레임을 검사한다; 하나라도 `held`이면 이유와 함께 **기본 거부(default-deny)**한다.
   **Verify:** `test:` T3 — held 클레임이 있는 논문의 publish는 거부된다.
3. **Do:** 해제: interlock은 patent gate(human/counsel)가 filed/cleared로 표시할 때만 해제된다.
   **Verify:** `test:` 해제 후 publish가 진행된다.
4. **Do:** 어떤 surface/adapter로도 interlock을 우회할 수 없도록 보장한다 (core 강제).
   **Verify:** `test:` T4 스타일 — 가짜 sink가 held artifact를 publish할 수 없다.

## 수용 기준
- [ ] held interlock은 publish를 기본 거부한다 (T3); 해제 시 다시 활성화; surface/adapter 우회 없음.

## 롤백 / 안전성
deny-by-default이므로 revert로 롤백한다. interlock은 불확실할 때 안전하게(held) 실패한다.

## 인계(Hand-off)
RB-040 publish가 기밀성과 함께 이 interlock을 강제한다.
