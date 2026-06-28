# RB-043: Documented stubs (future connectors)

- Status: ready
- Phase: phase-4-publish-interfaces-stubs
- Depends on: [RB-002]
- Implements design: [../../05-harness-core/ports-and-adapters_ko.md](../../05-harness-core/ports-and-adapters_ko.md), [../../01-decisions/ADR-0005-ports-and-adapters_ko.md](../../01-decisions/ADR-0005-ports-and-adapters_ko.md)
- Produces: internal wiki, experiment-server, venue submission, patent filing, live prior-art을 위한 문서화된 stub adapter

## Objective

brief가 요구하는 **open seam(개방 이음새)**을 문서화된 stub으로 제공하여, 향후 통합이 재설계가 아니라
"adapter 하나만 채우면 되는" 것이 되도록 한다. stub = interface impl + `implemented:false` descriptor +
config 예시 + README 노트.

## Preconditions
- [ ] RB-002 (ports/registry/preflight + stub 패턴).

## Steps
1. **Do:** stub adapter를 생성한다:
   - `source/stubs/internal-wiki`, `source/stubs/experiment-server`
   - `sink/stubs/internal-wiki-publish`, `sink/stubs/venue-submission`, `sink/stubs/patent-filing`
   - `novelty/stubs/live-prior-art`
   각각에 port interface, `implemented:false` capability descriptor, config 예시, 그리고 완성 방법을 설명하는 README를 포함한다.
   **Verify:** `test:` 각 stub이 discoverable + selectable하다; preflight가 `implemented:false`를 보고한다.
2. **Do:** stub을 선택해도 governance를 절대 우회하지 않고, 조용히 성공하지 않도록(명확한 unavailable 신호) 보장한다.
   **Verify:** `test:` T5 — stub source/sink는 안전한 unavailable 결과를 낸다; gate/confidentiality는 유지된다.
3. **Do:** 각 adapter 폴더에 실제 connector 구현이 정확히 무엇을 수반하는지(seam contract)를 문서화한다.
   **Verify:** `view:` 각 stub은 port contract를 참조하는 "to implement" 노트를 갖는다.

## Acceptance criteria
- [ ] 나열된 모든 stub이 존재하고, selectable하며, `implemented:false`로 표시되고, governance-safe(T5)하다.
- [ ] 각각이 실제 connector 완성 방법을 문서화한다.

## Rollback / safety
stub은 비활성(inert)이다; 제거하여 롤백한다. governance를 누락시키는 조용한 no-op으로 동작해서는 절대 안 된다.

## Hand-off
나중에 실제 internal wiki / experiment-server / venue / filing connector를 연결하는 것 = 그 adapter 하나를 구현하는 것;
core는 손대지 않는다.
