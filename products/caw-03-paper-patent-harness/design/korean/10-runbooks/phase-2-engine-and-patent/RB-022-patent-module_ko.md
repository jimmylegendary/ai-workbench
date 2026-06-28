# RB-022: Patent drafting 모듈

- Status: ready
- Phase: phase-2-engine-and-patent
- Depends on: [RB-021]
- Implements design: [../../05-harness-core/patent-drafting-module_ko.md](../../05-harness-core/patent-drafting-module_ko.md), [../../01-decisions/ADR-0004-patent-drafting_ko.md](../../01-decisions/ADR-0004-patent-drafting_ko.md)
- Produces: `PatentEngine` port + v1 baseline 어댑터 + `draft_patent`; counsel(법무) 인계

## 목표

patent 경로: 별도의 `PatentEngine` 어댑터(PaperOrchestra는 patent에 결코 사용되지 않음)로, 공유된
GatedClaimSet 전단(front)을 함께 쓰며, human/counsel gate를 위한 출원 준비(ready-for-filing) draft를 생성한다.

## 사전 조건
- [ ] RB-021 (오케스트레이션). 기본값을 정하기 전에 OQ-10 (관할권/provisional-first) + OQ-09 (§112 소유권)을 해결한다.

## 단계
1. **Do:** `PatentEngineAdapter` port + v1 baseline 어댑터(LLM 보조: claims/spec/prior-art 골격)를 정의하고, 동일한 registry에 등록한다.
   **Verify:** `test:` registry가 patent engine을 선택하고, preflight가 통과한다.
2. **Do:** 공유된 GatedClaimSet을 재사용하여 `draft_patent(artifactId)`를 구현하고, Artifact를 patent tail(`drafted → reviewed → filing-gate`)로 분기한다.
   **Verify:** `test:` patent artifact가 `filing-gate`에 도달하고, PaperOrchestra가 아닌 PatentEngine을 사용한다.
3. **Do:** counsel/pre-filing 기밀 등급을 적용하고, 출원 준비 인계 패키지(형식 TBD, OQ-10)를 생성한다.
   **Verify:** `test:` counsel-tier 콘텐츠가 gate되고, 인계 패키지가 조립된다.
4. **Do:** 자율 출원 없음 — 종단 상태는 human/counsel을 기다리는 `filing-gate`이다.
   **Verify:** `test:` harness는 결코 `filing-gate`를 자동으로 넘어 전이하지 않는다.

## 수용 기준
- [ ] PatentEngine port + v1 어댑터; `draft_patent`가 `filing-gate`에 도달; PaperOrchestra는 결코 patent를 draft하지 않는다.
- [ ] counsel tier 적용; 자율 출원 없음.

## 롤백 / 안전성
어댑터 + op이므로 revert로 롤백한다. 법적 판단은 인간을 위해 플래그될 뿐 결정되지 않는다.

## 인계(Hand-off)
RB-023이 patent-sensitive 클레임에 대해 paper publish를 차단하는 patent-first interlock을 연결한다.
