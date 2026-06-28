# RB-042: ExperimentScout op-set 위에 CLI + MCP surface 구축

- Status: ready
- Phase: phase-4-export-and-schedule
- Depends on: [RB-041 (scout Run), RB-040 (ExportAdapter 이음새), RB-2XX (ledger), RB-3XX (implications + wbtraffic.v0)]
- Implements design: [../../06-interfaces/cli-and-mcp.md](../../06-interfaces/cli-and-mcp_ko.md), [../../06-interfaces/scout-pipeline.md](../../06-interfaces/scout-pipeline_ko.md), [../../01-decisions/ADR-0001-product-surface-and-scout.md](../../01-decisions/ADR-0001-product-surface-and-scout_ko.md), [../../01-decisions/ADR-0002-hypothesis-representation.md](../../01-decisions/ADR-0002-hypothesis-representation_ko.md), [../../01-decisions/ADR-0008-export-boundaries.md](../../01-decisions/ADR-0008-export-boundaries_ko.md)
- Produces: 공유 타입 코어 op-set 모듈, `caw06` CLI, MCP 서버, review-queue 명령어(`review`/`confirm`/`reject`), 양쪽 surface에서 강제되는 read/propose/gated op 분류.

## Objective
하나의 파이프라인 코어 위에 **두 개의 얇은 구동 surface**를 노출한다: `caw06` **CLI**(Jimmy + headless CI)와
**MCP 서버**(자율 ExperimentScout 에이전트). 둘 다 하나의 검증된 타입 op-set의 1:1 렌더링이다; **어떤 surface도
자기 자신의 불변식 로직을 지니지 않는다**. "Done"의 의미: 모든 op가 `read` / `propose` / `gated`로 분류됨; read op는
결코 변경하지 않음; propose op는 draft/floor-state 레코드만 append; **gated terminal 경로(status→supported,
export→CAW-01/02)는 Jimmy의 `confirm` 이후에만 실행**됨; MCP 서버는 `confirm`을 등록하지 **않고** `export`를
**stage 전용**으로 표시; 어떤 surface도 `status` + `confidence` 없이 hypothesis를 출력할 수 없음; 생성된 요약은
`generated`로 찍히고 결코 증거로 취급되지 않음.

## Preconditions
- [ ] RB-041 병합됨: `Run`(과 그 review-queue staging)이 단일 엔트리포인트에서 호출 가능.
- [ ] RB-040 병합됨: ExportAdapter 이음새가 stage vs commit을 지원.
- [ ] `store/review-queue/`이 ADR-0007에 따라 존재.
- [ ] 다섯 출력 종류에 대한 아티팩트 렌더러가 존재(P3 출력).

## Steps

1. **코어 op-set를 하나의 타입 모듈로 정의.**
   - Do: 각 op를 명시적 분류와 함께 한 번씩 구현:
     `run`/`extract-claims`/`propose-hypothesis`/`plan-experiment`/`run-experiment`/`log-result`/`map-implications`/`propose-status`
     = **propose**;
     `status`/`list-threads`/`show-thread`/`show-hypothesis`/`ledger`/`negative-results`/`render` = **read**;
     `confirm`/`export` = **gated**. CLI와 MCP는 얇은 래퍼다 — surface-local 규칙 없음.
   - Verify: 각 op가 정확히 하나의 분류 태그를 가짐; CLI subcommand와 MCP tool이 동일 op 함수에 1:1로 매핑됨을
     테스트가 assert.

2. **read op 구축 (변경 없음).**
   - Do: `status`, `list-threads`, `show-thread`, `show-hypothesis`, `ledger`, `negative-results`, `render`을
     구현. `show-hypothesis`와 모든 render 경로는 출력 전에 `status` + `confidence`가 존재함을 반드시 assert.
     `negative-results`는 기본으로 실패를 노출.
   - Verify: 어떤 read op를 실행해도 store 변경 없음(전후 store 해시); `show-hypothesis`는
     `status`/`confidence`가 없는 레코드의 출력을 거부; `negative-results`는 기본으로 refuted/invalid/aborted
     항목을 나열.

3. **propose op 구축 (floor state에 append).**
   - Do: propose op를 draft/proposal/ledger 레코드만 append하도록 구현. `propose-hypothesis`는
     `status=hypothesis`, `confidence=very-low`로 생성. `run-experiment`는 항상 ledger 항목을 씀(크래시 →
     `invalid` 포함). `propose-status --to supported`는 `StatusEvent`를 enqueue하고 **적용하지 않음**.
     `map-implications`는 요약을 `generated`로 표시.
   - Verify: `propose-status --to supported`는 queue 항목을 추가하지만 hypothesis는 현재 status에 머무름; 생성된
     요약은 `generated`로 찍히고 결코 `evidence[]` 목록에 들어가지 않음; 어떤 propose op도 승격하거나 export하지
     않음.

4. **사람 게이트 구축 (review queue).**
   - Do: `review`(증거 + diff와 함께 pending 항목 나열), `confirm <id>`(코어가 큐에 있는 승격/export 하나를 적용),
     `reject <id> --reason …`(폐기, 감사를 위해 보존)을 구현. 어떤 스케줄된 Run도 어떤 MCP 세션도 이 큐를
     비울 수 없다.
   - Verify: staged된 승격은 `confirm` 이후에만 효력 발생; `reject`는 활성 큐에서 제거하지만 감사를 위해 보존;
     Run이 큐를 비울 수 없음.

5. **CLI 구축 (`caw06`).**
   - Do: 모든 op를 텍스트/마크다운 테이블과 CI용 `--json` 모드를 가진 subcommand로 렌더링. 사람 운영자에게
     `confirm`과 `export … --commit`을 노출. `export <target> --id ID`를 번들을 **stage**하도록 배선하고
     `--commit`을 게이트를 통해 emit하도록 배선.
   - Verify: `caw06 export caw01-writeback --id WB-XXXX`가 pending 번들을 stage; `--commit`(또는 `confirm`)
     전까지 아무것도 emit되지 않음; `--json` 출력이 CI용으로 기계 파싱 가능.

6. **MCP 서버 구축 (proposal 전용).**
   - Do: 모든 `read`와 `propose` op를 MCP tool로 등록. **`confirm`을 등록하지 말 것.** `export`를
     `export.stage`로만 등록(pending 번들을 stage; commit 불가). 구조화된 JSON tool 결과 반환.
   - Verify: MCP tool 목록이 `confirm`을 제외; `export.stage`가 pending 번들을 산출하고 commit 경로가 없음;
     에이전트 세션이 review queue를 채울 수 있지만 비우거나 `supported` export를 emit할 수 없음.

7. **surface 전반에 걸쳐 독립성 + overclaim 금지 계약 assert.**
   - Do: export op가 **설정된 경계를 가로지르는 번들**(RB-040)만 쓰고 결코 형제 store에 쓰지 않음을 확인. 강력한
     경계선에 대한 cross-surface 테스트 추가: 어떤 read op도 변경하지 않고, 어떤 propose op도 승격/export하지
     않으며, 어떤 MCP 경로도 gated terminal 경로에 도달하지 않음.
   - Verify: 세 분류 모두 cli-and-mcp.md §"Read vs mutating" 테이블대로 동작; CAW-01/CAW-02는 export 경계로만
     도달 가능.

## Acceptance criteria
- [ ] 하나의 타입 op-set 모듈이 양쪽 surface를 뒷받침; CLI subcommand와 MCP tool이 그것과 1:1(ADR-0001).
- [ ] read op는 결코 변경하지 않음; propose op는 floor-state/draft 레코드만 append; gated op는 `confirm`
      이후에만 실행.
- [ ] MCP 서버는 `confirm`을 제외하고 `export`를 stage 전용으로 노출; CLI는 사람에게 `confirm` +
      `export --commit`을 노출.
- [ ] `show-hypothesis`/`render`는 출력 전 `status` + `confidence`를 assert; `negative-results`는 기본으로
      실패를 노출.
- [ ] 생성된 요약은 `generated`로 찍히고 결코 증거로 취급되지 않음.
- [ ] Export는 경계를 가로지르는 번들만 씀 — 결코 형제 제품의 store에 쓰지 않음.
- [ ] 트리 green(컴파일, lint 통과).

## Rollback / safety
- surface는 stateless 래퍼다; surface 변경을 롤백해도 store를 손상시킬 수 없다(모든 변경은 코어 op-set의
  append-only 경로를 통과).
- review queue는 brief §12에 대한 단일 강제 지점이다: 어떤 surface 경로라도 `confirm` 없이 승격/export를
  적용하면 그것을 결함으로 취급하고 출하 전에 되돌려라.
- `reject`는 폐기된 항목을 감사를 위해 보존; 결코 큐 항목을 hard-delete하지 말 것.

## Hand-off
- 이제 전체 ExperimentScout가 종단간 구동 가능: 스케줄/트리거되는 Run (RB-041) + 사람/에이전트 surface(이 RB) +
  export 이음새 (RB-040), Milestone 1 acceptance spine을 닫는다.
- 이후 단계(M2+)는 op-set/registry를 확장해 더 많은 SourceAdapter를 추가하고 export stub을 활성화한다 — 결코
  surface-local 로직을 추가함으로써가 아니라.
