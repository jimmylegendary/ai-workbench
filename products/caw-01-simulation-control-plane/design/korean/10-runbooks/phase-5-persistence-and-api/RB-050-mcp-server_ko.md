# RB-050: MCP 서버 표면

- Status: ready
- Phase: phase-5-persistence-and-api
- Depends on: [RB-033]   # 핵심 op가 존재해야 함; phase-4 이후 완전한 가치
- Implements design: [mcp-and-cli-adapters_ko.md](../../07-backend-api/mcp-and-cli-adapters_ko.md), [api-surface_ko.md](../../07-backend-api/api-surface_ko.md), [../../01-decisions/ADR-0001-product-surface_ko.md](../../01-decisions/ADR-0001-product-surface_ko.md)
- Produces: `@caw/core` 작업을 MCP 도구로 노출하는 `apps/mcp`

## 목표

`@caw/core` 작업을 MCP 도구로 매핑하여 외부 에이전트와 도구가 CAW-01(독립 제품)을 구동할 수 있게 하는 얇은 MCP 서버 —
도메인 로직은 **추가하지 않는다**. 이는 CAW-01 고유의 자동화 표면이며, 다른 제품을 위한 공유 substrate가 아니다.

## 전제조건

- [ ] `@caw/core` 서비스 구현됨(phase-1/3). RB-040+가 실행을 유의미하게 만든다.

## 단계

1. **Do:** `apps/mcp`를 스캐폴딩하고, [mcp-and-cli-adapters_ko.md](../../07-backend-api/mcp-and-cli-adapters_ko.md)에 따라 핵심 op(`experiment.*`, `run.*`, `registry.*`, `worktree.*`, `evidence.*`)로 매핑되는 도구를 등록한다.
   **Verify:** `cmd:` MCP 서버가 기대되는 도구들을 나열한다.
2. **Do:** 도구 입출력을 Zod 계약에 연결한다. 변이(mutation)와 읽기는 core를 호출하고, 스트림은 실행 상태를 폴링/스트리밍한다.
   **Verify:** `test:` 테스트용 core에 대해 `experiment.create` + `run.start`/`run.status`가 MCP를 통해 동작한다.
3. **Do:** 도구 스코핑(읽기 전용 vs 변이)을 추가한다 — OQ-16을 해결하거나 문서화된 기본값을 적용한다.
   **Verify:** `view:` 스코핑이 문서화되고 OQ-16이 갱신된다.
4. **Do:** "skill" 패키징 노트(skill = 이 제품 고유의 연산/도구에 대한 재사용 가능한 워크플로)를 추가한다.
   **Verify:** `view:` 하나의 예시 skill 워크플로가 문서화된다.

## 수용 기준

- [ ] MCP 서버가 핵심 작업을 도구로 노출한다(도메인 로직 추가 없음).
- [ ] 생성/실행/상태/저장/증거가 MCP를 통해 도달 가능하다.
- [ ] 스코핑이 결정(OQ-16)되고 문서화된다.

## 롤백 / 안전성

얇은 표면이므로 서버를 비활성화하면 롤백된다. 경계 규칙이 로직을 core에 유지한다.

## 인계

외부 에이전트와 도구가 이제 CAW-01(독립 제품)을 프로그래밍적으로 구동할 수 있다. RB-051이 CLI를 추가한다.
