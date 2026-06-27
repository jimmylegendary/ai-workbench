# RB-041: core op에 1:1 매핑되는 `kr` CLI 구축

- Status: ready
- Phase: phase-4-interfaces
- Depends on: [RB-040 (op manifest + codegen + parity test), RB-021 (core txn), RB-031 (trust/boundary labels)]
- Implements design:
  - [../../06-interfaces/cli.md](../../06-interfaces/cli_ko.md)
  - [../../06-interfaces/api-and-mcp.md](../../06-interfaces/api-and-mcp_ko.md) (shared envelope, scopes)
  - [../../01-decisions/ADR-0001-product-surface-and-skill-interface.md](../../01-decisions/ADR-0001-product-surface-and-skill-interface_ko.md)
  - [../../09-roadmap/milestones-and-phases.md](../../09-roadmap/milestones-and-phases_ko.md) (P4 / M3)
- Produces: 동일한 op manifest로부터 생성된 `kr` CLI — core op당 하나의 서브커맨드; 전역 플래그(`--json`, `--idempotency-key`, `--yes`, `--boundary`, `--visibility`, `--actor`, `--quiet/--verbose`); trust/boundary 배지가 있는 사람용 테이블 렌더러; 엔벌로프 + exit-code 매핑; 서피스 간 패리티 테스트에 등록된 CLI.

## 목표
"완료(Done)" = 각 서브커맨드가 core op에 1:1로 매핑되고 API/MCP와 **동일한 op manifest로부터 생성되는**(세 번째 검증 경로 없음, 추가 로직 없음) `kr` CLI가 존재한다. 동일한 closed JSON Schema에 대해 검증하고, 동일한 `core.invoke`를 호출하며, `--json`에서는 **동일한** 정규 엔벌로프(API/MCP가 반환하는 것과 바이트 단위로 동일)를 방출하고, 기본적으로는 사람용 테이블을 렌더링한다. Write는 기본적으로 확인을 요청한다(`--yes`로 생략); read는 절대 요청하지 않는다. Exit code는 스크립트가 산문을 파싱하지 않고도 분기하게 해준다. CLI는 패리티 계약 테스트에 합류하여 op 집합 + 스키마가 다른 서피스와 절대 어긋날 수 없게 한다.

## 사전 조건
- [ ] RB-040이 반영되었다: op manifest, 공유 스키마, `core.invoke`, 타입 지정 엔벌로프, 패리티 테스트 하니스가 존재한다.
- [ ] core가 `search`/`get`에서 trust + boundary + visibility 라벨과 hydrate된 provenance chain을 반환한다(RB-031, RB phase-3 retrieval).
- [ ] Tree가 green이다.

## 단계

1. **manifest로부터 서브커맨드를 생성한다.**
   - 할 일: [cli.md §2](../../06-interfaces/cli_ko.md)의 카탈로그를 사용해 op당 하나의 서브커맨드를 방출한다: `kr add-source, extract-claims, attach-evidence, synthesize-note, classify-signal, record-decision, link, import, query, get, export, verify-audit`. 각 서브커맨드 이름을 그 `op`에 매핑한다(`kr query`→`search`, `kr import`→`import_projection`, `kr export`→`export_bundle`). `update`/`delete` 서브커맨드는 **추가하지 않는다**(append-only; 수정은 새 버전 + `kr link --rel supersedes`로). 각 서브커맨드는 인자만 파싱하고, op의 공유 스키마에 대해 검증한 뒤, `core.invoke(op, args, actor)`를 호출한다.
   - 검증: `kr --help`는 정확히 12개 서브커맨드를 나열한다; `kr update`/`kr delete`는 존재하지 않는다; `kr add-source --help`는 op 스키마에서 도출된 플래그를 보여준다.

2. **전역 플래그를 구현한다.**
   - 할 일: [cli.md §3](../../06-interfaces/cli_ko.md)에 따라 `--json`, `--idempotency-key <k>`(정의된 곳에서는 op의 natural key를 기본값으로), `--yes/-y`, `--boundary <public|internal|confidential>`, `--visibility <team|private>`, `--actor <id>`(기본값은 OS 사용자; audit에만 라벨링 — 어떤 클리어런스도 부여하지 않음), `--quiet/--verbose`를 추가한다. evidence 서브커맨드는 `--artifact-ref <kind:ref>`를 노출하며 산문 플래그가 **없다**.
   - 검증: `kr attach-evidence --help`는 `--artifact-ref`를 보여주고 `--text`/`--summary`는 없다; 모든 서브커맨드에서 플래그가 파싱된다.

3. **idempotency + 공유 엔벌로프를 연결한다.**
   - 할 일: idempotency를 `--idempotency-key`로 전달한다(CLI의 운반체 vs API 헤더 / MCP 인자). 결과 엔벌로프를 그대로 통과시킨다; `--json`에서는 수정 없이 stdout에 출력한다.
   - 검증: 동일한 `--idempotency-key`로 write를 두 번 실행하면 두 번째에 `status:"noop"`와 원래 id가 나온다; 동일한 op + 인자에 대한 `--json` 본문은 API 응답과 바이트 단위로 동일하게 diff된다.

4. **write에 대한 기본 확인.**
   - 할 일: 모든 `kind:write` op을 실행하기 전에 확인을 요청한다(MCP G6 미러링); `--yes`는 이를 생략한다(스크립트용). Read는 절대 요청하지 않는다. 거부된 프롬프트는 아무것도 쓰지 않고 0이 아닌 값으로 종료한다(usage/abort).
   - 검증: `--yes` 없는 `kr synthesize-note ...`는 확인을 요청한다; 거부하면 `knowledge/`에 아무것도 쓰지 않는다; `--yes`는 진행하여 `_events` 한 줄을 추가한다.

5. **trust/boundary 배지가 있는 사람용 렌더러.**
   - 할 일: [cli.md §4](../../06-interfaces/cli_ko.md)에 따라 기본 사람용 렌더러를 구축한다: 성공 시 id, 주요 필드, trust 전이(예: `reported → corroborated`), `audit ... (chain ok)`를 표시한다. `kr query`는 `TRUST`와 `BOUND.` 배지 컬럼 및 hydrate된 evidence chain이 있는 테이블을 렌더링한다; Note는 생성된 노트로 렌더링되며 **절대** evidence로 배지가 붙지 않는다. `--json`은 `RetrievalHit` 엔벌로프를 변경 없이 반환한다.
   - 검증: `kr query "GaN reliability" --type claim --boundary internal --min-trust corroborated`는 배지 테이블을 출력한다; 동일 명령에 `--json`을 붙이면 구조화된 `RetrievalHit` 집합을 반환한다; confidential 항목은 클리어런스가 부족한 actor에게는 절대 나타나지 않는다(동일한 boundary 필터링 read 경로).

6. **exit-code 매핑.**
   - 할 일: [cli.md §5](../../06-interfaces/cli_ko.md)에 따라 결과를 exit code로 매핑한다: `0` ok/noop, `2` usage/잘못된 플래그, `5` `ERR_VALIDATION`, `7` auth/scope, `9` guardrail reject(`ERR_*`), `4` 참조된 엔티티 없음. 정확한 `error.code`는 `--json`에서 항상 사용 가능하다.
   - 검증: `kr attach-evidence --claim clm_x --artifact-ref note:nte_77c`는 `ERR_NOTE_AS_EVIDENCE`와 함께 `9`로 종료한다; 잘못된 플래그는 `2`로 종료한다; 없는 claim은 `4`로 종료한다.

7. **전체 트랜잭션 스모크 테스트 + 패리티 등록.**
   - 할 일: [cli.md §6](../../06-interfaces/cli_ko.md)의 핵심 knowledge 트랜잭션을 스크립트화한다: `add-source → extract-claims → attach-evidence → synthesize-note` 후 `kr export`. CLI 서브커맨드 카탈로그를 RB-040 패리티 계약 테스트에 등록하여 세 서피스 모두 op 집합 + 스키마를 공유함을 단언하게 한다.
   - 검증: 스모크 스크립트가 끝까지 완료되어 `knowledge/` 아래에 유효한 md와 서명된 bundle을 생성한다; 확장된 패리티 테스트(API + MCP + CLI)가 green이다; manifest에서 서브커맨드를 빼면 패리티가 실패한다.

## 수용 기준
- [ ] core op당 하나의 서브커맨드, 동일한 manifest로부터 생성; `update`/`delete` 없음; arg-parse + render + confirm을 넘어선 로직 없음.
- [ ] `--json` 출력은 동일한 op + 인자에 대해 API/MCP 엔벌로프와 바이트 단위로 동일하다.
- [ ] Write는 기본 확인; `--yes`는 생략; read는 절대 요청하지 않음.
- [ ] `kr query`/`kr get`은 trust + boundary 배지와 hydrate된 provenance chain을 렌더링한다; Note는 절대 Evidence로 표시되지 않는다; confidential 항목은 클리어런스 부족 actor에게 절대 새지 않는다.
- [ ] Exit code는 문서화된 표를 따른다; note ref가 있는 `attach-evidence`는 `9`(`ERR_NOTE_AS_EVIDENCE`)로 종료한다.
- [ ] CLI가 패리티 계약 테스트에 등록되고 CI가 green이다.
- [ ] 이 체크포인트에서 tree가 green이다.

## 롤백 / 안전
- CLI는 생성된다; 생성된 CLI 모듈을 삭제하고 코드 생성을 다시 실행하면 알려진 상태로 복원된다. 어떤 CLI 단계도 `core.invoke`를 통하지 않고는 store를 변경하지 않으므로, 실패하거나 거부된 명령은 `knowledge/`와 인덱스를 건드리지 않은 채로 둔다(append-only: 부분 엔티티 없음).
- CLI가 검증이나 비즈니스 로직을 추가하는 것이 발견되면, 되돌리고 로직을 어댑터가 아닌 core로 옮긴다.

## 인계
- RB-042(viewer)는 CLI의 `kr query`/`kr get`과 동일한 안정적 read 경로(boundary 필터링, hydrate된 chain, trust/boundary 배지)를 가정할 수 있으며, 동일한 엔벌로프/`RetrievalHit` 형태를 재사용할 수 있다.
- 하류 import/export runbook(phase-5)은 `kr import`와 `kr export`가 `kr:import`/`kr:export` scope로 core의 `import_projection`/`export_bundle` op을 감싼 얇은 래퍼로 존재한다고 가정할 수 있다.
