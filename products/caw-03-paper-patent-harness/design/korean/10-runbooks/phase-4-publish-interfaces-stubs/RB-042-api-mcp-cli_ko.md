# RB-042: API + MCP + CLI surfaces

- Status: ready
- Phase: phase-4-publish-interfaces-stubs
- Depends on: [RB-040, RB-041]
- Implements design: [../../06-interfaces/api-and-mcp_ko.md](../../06-interfaces/api-and-mcp_ko.md), [../../06-interfaces/cli_ko.md](../../06-interfaces/cli_ko.md), [../../01-decisions/ADR-0001-product-surface_ko.md](../../01-decisions/ADR-0001-product-surface_ko.md)
- Produces: op-manifest 위에 얇은 API + MCP + CLI surface

## Objective

op-manifest를 API + MCP + CLI로 노출한다 — 로직을 추가하지 않는 얇은 adapter로, human-gate op
(`publish`, patent filing)에는 확인 절차를 둔다.

## Preconditions
- [ ] core op 구현 완료(phase 1–4). RB-001의 op-manifest.

## Steps
1. **Do:** op-manifest로부터 MCP tool catalog + REST route handler를 생성한다; core op에 1:1로 매핑한다.
   **Verify:** `test:` 테스트용 core에 대해 MCP/REST를 통해 `import_bundle`→`publish`에 도달 가능하다.
2. **Do:** 1:1로 매핑되는 CLI(`caw3 ...`)를 구축한다; human + `--json` 출력.
   **Verify:** `test:` fixture에 대해 UC-1(import→gate→assemble→draft→review→publish)의 CLI e2e.
3. **Do:** `publish`/filing op에 확인 절차를 강제한다; governance가 surface가 아닌 core에서 여전히 실행됨을 검증한다.
   **Verify:** `test:` 확인 없는 agent MCP `publish`는 거부된다; interlock/confidentiality는 여전히 적용된다.

## Acceptance criteria
- [ ] 세 surface 모두 op-manifest를 매핑한다; surface에 도메인 로직이 없다; human-gate op는 확인된다.

## Rollback / safety
얇은 surface; 제거하여 롤백한다. governance는 영향받지 않는다(core에 존재).

## Hand-off
이제 Milestone 1은 CLI로 데모 가능하다; RB-043은 future-connector stub을 추가한다.
