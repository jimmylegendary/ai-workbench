# RB-002: Ports, adapter registry, and preflight

- Status: ready
- Phase: phase-0-foundations
- Depends on: [RB-001]
- Implements design: [../../05-harness-core/ports-and-adapters_ko.md](../../05-harness-core/ports-and-adapters_ko.md), [../../07-backend-api/adapter-registry-and-config_ko.md](../../07-backend-api/adapter-registry-and-config_ko.md), [../../01-decisions/ADR-0005-ports-and-adapters_ko.md](../../01-decisions/ADR-0005-ports-and-adapters_ko.md)
- Produces: 5개의 타입이 지정된 port + value object, config 기반 registry, capability preflight, 그리고 fake

## Objective

hexagonal seam을 빌드한다: 다섯 개의 port interface, config로 adapter를 선택하는 registry, capability-
descriptor preflight, documented-stub 패턴, 그리고 test용 fake adapter를 — 실제 adapter를 만들기 전에.

## Preconditions
- [ ] RB-001 완료.

## Steps
1. **Do:** [ports-and-adapters_ko.md](../../05-harness-core/ports-and-adapters_ko.md)에 따라 5개 port(`SourceAdapter, WritingEngineAdapter, PatentEngineAdapter, SinkAdapter, NoveltyAdapter`) + value object(`Bundle, EngineInputs, DraftResult, Descriptor`)를 정의한다.
   **Verify:** `cmd: tsc --noEmit`.
2. **Do:** registry를 빌드한다: discover + select-by-config + **preflight**(`configSchema`, version/feature 호환성 검증; 비호환은 거부). secret은 env ref로.
   **Verify:** `test:` preflight가 잘못된 config / 비호환 version의 adapter를 거부하고; 정상인 것은 수락한다.
3. **Do:** **documented-stub** 패턴을 구현한다: stub은 `implemented:false`를 광고한다; 선택은 허용되지만 unavailable로 표시된다(governance를 떨어뜨리는 조용한 no-op은 절대 아님).
   **Verify:** `test:` stub을 선택하면 명확한 unavailable 결과를 반환하고; governance가 우회되지 않는다.
4. **Do:** downstream test를 위해 port마다 **fake** adapter를 제공한다(의도적으로 오작동하는 fake 포함).
   **Verify:** `test:` fake가 registry를 통해 load된다.

## Acceptance criteria
- [ ] 5개 port가 컴파일되고; registry가 config로 선택하고; preflight가 비호환 adapter를 거부한다.
- [ ] stub 패턴이 동작한다(선택 가능, 표시됨, 안전); fake가 사용 가능하다.

## Rollback / safety
interface + registry만; 롤백하려면 revert한다. 아직 실제 외부 호출 없음.

## Hand-off
이후의 모든 adapter(v1 + stub)가 이 registry에 plug-in되고; core는 이 port들에만 의존한다.
