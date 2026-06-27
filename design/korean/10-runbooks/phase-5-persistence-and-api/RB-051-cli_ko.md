# RB-051: CLI 표면

- Status: ready
- Phase: phase-5-persistence-and-api
- Depends on: [RB-033]
- Implements design: [mcp-and-cli-adapters_ko.md](../../07-backend-api/mcp-and-cli-adapters_ko.md), [api-surface_ko.md](../../07-backend-api/api-surface_ko.md)
- Produces: 명령을 `@caw/core` 작업으로 매핑하는 `apps/cli` (`caw`)

## 목표

web/MCP 표면과 동일한 핵심 작업을 노출하는 얇은 스크립트 가능 CLI(`caw`) — 도메인 로직 추가 없음.

## 전제조건

- [ ] `@caw/core` 서비스 구현됨. 다른 표면들과 DI 연결을 공유한다.

## 단계

1. **Do:** 명령 프레임워크로 `apps/cli`를 스캐폴딩하고, [mcp-and-cli-adapters_ko.md](../../07-backend-api/mcp-and-cli-adapters_ko.md)에 따라 명령을 매핑한다:
   `caw experiment …`, `caw run start|status --follow|stop`, `caw worktree save-item|save-all|branch|diff`, `caw evidence metrics|projection|trust`, `caw registry …`.
   **Verify:** `cmd: caw --help`가 명령들을 나열한다.
2. **Do:** Zod 계약을 통해 명령을 core에 연결한다. `run status --follow`는 스트리밍한다.
   **Verify:** `test:` 테스트용 core에 대해 `caw experiment create` → `caw run start` → `caw run status --follow`가 동작한다.
3. **Do:** 투영/메트릭에 대해 사람이 읽기 쉬운 출력(테이블/JSON 플래그)을 제공한다.
   **Verify:** `view:` `caw evidence projection --refs …`가 읽기 쉬운 비교를 출력한다(+ `--json`).

## 수용 기준

- [ ] CLI가 핵심 작업을 1:1로 매핑한다(도메인 로직 추가 없음).
- [ ] 생성/실행/follow/저장/증거가 터미널에서 동작한다.
- [ ] 출력이 사람이 읽기 쉬우며 JSON 옵션을 제공한다.

## 롤백 / 안전성

얇은 표면이므로 bin을 제거하면 롤백된다. 경계 규칙이 강제된다.

## 인계

이제 세 표면(web, MCP, CLI) 모두 하나의 `@caw/core` 위에 놓인다. CAW-01 v1 표면 세트가 완성된다.
