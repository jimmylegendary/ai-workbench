# RB-002: Ports, adapter registry, and preflight

- Status: ready
- Phase: phase-0-foundations
- Depends on: [RB-001]
- Implements design: [../../05-harness-core/ports-and-adapters_ko.md](../../05-harness-core/ports-and-adapters_ko.md), [../../07-backend-api/adapter-registry-and-config_ko.md](../../07-backend-api/adapter-registry-and-config_ko.md), [../../01-decisions/ADR-0005-ports-and-adapters_ko.md](../../01-decisions/ADR-0005-ports-and-adapters_ko.md)
- Produces: 5개의 타입 지정 port + value object, config 기반 registry, capability preflight, 그리고 fake

## Objective

hexagonal seam을 빌드한다: 다섯 개의 port 인터페이스, config로 adapter를 선택하는 registry, capability-
descriptor preflight, documented-stub 패턴, 그리고 테스트용 fake adapter — 실제 adapter를 만들기 전에.

## Preconditions
- [ ] RB-001 완료.

## Steps
1. **Do:** [ports-and-adapters_ko.md](../../05-harness-core/ports-and-adapters_ko.md)에 따라 5개의 port(`SourceAdapter, WritingEngineAdapter, PatentEngineAdapter, SinkAdapter, NoveltyAdapter`) + value object(`Bundle, EngineInputs, DraftResult, Descriptor`)를 정의한다.
   **Verify:** `cmd: tsc --noEmit`.
2. **Do:** registry를 빌드한다: discover + select-by-config + **preflight**(`configSchema`, version/feature 호환성 검증; 비호환 시 거부). secret은 env ref를 통해 처리한다.
   **Verify:** `test:` preflight가 잘못된 config / 비호환 version을 가진 adapter를 거부하고, 정상인 것을 수락한다.
3. **Do:** **documented-stub** 패턴을 구현한다: stub은 `implemented:false`를 광고한다; 선택은 허용되지만 unavailable로 플래그된다(거버넌스를 떨어뜨리는 조용한 no-op은 절대 안 됨).
   **Verify:** `test:` stub을 선택하면 명확한 unavailable 결과를 반환한다; 거버넌스는 우회되지 않는다.
4. **Do:** downstream 테스트를 위해 port별 **fake** adapter를 제공한다(의도적으로 오작동하는 fake 포함).
   **Verify:** `test:` fake가 registry를 통해 로드된다.

## Acceptance criteria
- [ ] 5개 port가 컴파일된다; registry가 config로 선택한다; preflight가 비호환 adapter를 거부한다.
- [ ] Stub 패턴이 작동한다(선택 가능, 플래그됨, 안전함); fake가 사용 가능하다.

## Rollback / safety
인터페이스 + registry만; 롤백하려면 revert하라. 아직 실제 외부 호출 없음.

## Hand-off
이후 모든 adapter(v1 + stub)는 이 registry에 꽂힌다; core는 이 port들에만 의존한다.
