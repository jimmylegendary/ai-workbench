# RB-030: Novelty + radar import

- Status: ready
- Phase: phase-3-novelty-and-ladder
- Depends on: [RB-020, RB-010]
- Implements design: [../../05-harness-core/paper-ladder-and-novelty_ko.md](../../05-harness-core/paper-ladder-and-novelty_ko.md), [../../01-decisions/ADR-0006-paper-ladder-and-novelty_ko.md](../../01-decisions/ADR-0006-paper-ladder-and-novelty_ko.md)
- Produces: `Novelty/RadarAdapter` (CAW-05 import) + `run_novelty` (citation_pool 재사용) + 클레임 플래깅

## 목표

PaperOrchestra의 `citation_pool`(재질의가 아니라 재사용) + Novelty/Radar port를 통해 import된 CAW-05 radar
신호를 사용하여 클레임을 novel / threatened / patent-sensitive로 플래깅한다. harness가 결정하고, source는 공급만 한다.

## 사전 조건
- [ ] RB-020 (draft 실행으로부터 citation_pool 사용 가능), RB-010 (import). OQ-17/18/19를 해결한다.

## 단계
1. **Do:** port 뒤에 `adapters/novelty/v1/caw05-radar`를 구현한다; radar 신호를 import한다 (키를 ledger로 매핑 — OQ-18).
   **Verify:** `test:` radar 신호가 import되고 ClaimRefs로 매핑된다.
2. **Do:** `run_novelty(ledgerId)`를 구현한다: citation_pool + radar를 결합하고, 각 클레임을 novel/threatened/patent-sensitive로 플래깅한다.
   **Verify:** `test:` 알려진 overlap → threatened; 깨끗하면 → novel.
3. **Do:** patent-sensitive 플래그는 RB-023을 통해 interlock(`held`)을 설정한다.
   **Verify:** `test:` patent-sensitive 플래그가 interlock을 held로 만든다.
4. **Do:** 외부 prior-art 질의는 public-boundary 클레임 텍스트로 제한하고 질의를 redact(편집/마스킹)한다 (OQ-19); stub `adapters/novelty/stubs/live-prior-art`를 추가한다.
   **Verify:** `test:` 질의는 public 텍스트만 담는다; stub이 선택 가능/플래그됨.

## 수용 기준
- [ ] novelty 플래그가 citation_pool + CAW-05로부터 계산된다; patent-sensitive가 interlock을 설정한다.
- [ ] prior-art 질의는 public-only; live-search stub 존재.

## 롤백 / 안전성
어댑터 + op이므로 revert로 롤백한다. 불확실할 때는 "threatened/patent-sensitive"를 기본값으로 한다 (안전 실패).

## 인계(Hand-off)
RB-031이 플래그된 클레임을 P1/P2/P3 ladder에 배치한다.
