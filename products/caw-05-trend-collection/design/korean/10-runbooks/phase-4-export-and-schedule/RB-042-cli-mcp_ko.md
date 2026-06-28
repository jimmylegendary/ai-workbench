# RB-042: 단일 파이프라인 코어 위에 CLI와 MCP 표면 구축 (read vs mutating)

- Status: ready
- Phase: phase-4-export-and-schedule
- Depends on: [RB-041 (Run wrapper + receipts), RB-040 (ExportAdapter + idempotency), RB-032 (FormatRenderer/digest), RB-021 (classification review gate), RB-003 (core op-set)]
- Implements design: [../../06-interfaces/cli-and-mcp_ko.md](../../06-interfaces/cli-and-mcp_ko.md), [../../01-decisions/ADR-0001-product-surface-and-outputs_ko.md](../../01-decisions/ADR-0001-product-surface-and-outputs_ko.md), [../../06-interfaces/scheduled-pipeline_ko.md](../../06-interfaces/scheduled-pipeline_ko.md), [../../01-decisions/ADR-0007-export-boundaries_ko.md](../../01-decisions/ADR-0007-export-boundaries_ko.md)
- Produces: `caw05` CLI(사람/CI용)와 MCP 서버(에이전트용) — 둘 다 동일한 검증된 typed op-set의 얇은 wrapper: `run`/`backfill`/`status`/`list-findings`/`show-finding`/`render`/`mark-feedback`/`confirm`/`export`; read-vs-mutating 계약; MCP의 proposal-only terminal 규칙.

## Objective
두 표면 — 사람/CI용 CLI와 AI 에이전트용 MCP 서버 — 이 **동일한 코어 연산(core operations)** 을 통해 radar를
구동·점검한다. 따라서 규칙(dedup, recall floor, review gate, provenance 스탬핑, `evidence:false` 마킹)이 두 표면
사이에서 어긋날 수 없다. "Done" = 두 표면이 동일한 op-set을 호출하고; read 연산은 절대 mutate하지 않으며;
mutating terminal(`confirm`/`export`)은 CLI에서 실행되지만(operator가 게이트) **MCP에서는 proposal-only**
(에이전트는 확정되지 않은 novelty-threat를 CAW-03로 export할 수 없음); `render`는 항상 "generated summary — not
evidence" 배너를 스탬핑하고; `status`는 dead-man "radar went dark" 상태를 노출한다.

## Preconditions
- [ ] RB-003가 typed core op-set을 확정함; 두 표면 모두 이를 호출하고 로직을 재구현하지 않는다.
- [ ] RB-041이 Run(`run`/`backfill`) + `run-receipt`(`status`/dead-man용)를 제공한다.
- [ ] RB-040이 idempotency key를 가진 gated `export`를 제공한다.
- [ ] RB-021이 review gate(`confirm`이 이를 완료)와 `mark-feedback`(버전드 interest 업데이트에 반영, ADR-0002 §3)을 제공한다.
- [ ] RB-032가 digest tree 위의 `render`를 제공한다; tree는 green 상태.

## Steps

### 1. 공유 op-set 바인딩 정의
- **Do:** 9개 연산을 단일 코어 함수에 바인딩한다: `run`(mutating), `backfill`(mutating), `status`(read), `list-findings`(read), `show-finding`(read), `render`(read*), `mark-feedback`(mutating), `confirm`(mutating, gated), `export`(mutating, gated) — cli-and-mcp.md의 "operation set"대로. 두 표면이 이를 import하며, 어느 쪽도 분기 로직을 추가하지 않는다. 표면이 op-set에 없는 로직을 필요로 하면 **표면이 아니라 op-set을 확장**한다(ADR-0001 revisit trigger).
- **Verify:** CLI와 MCP가 연산별로 동일한 코어 함수에 dispatch함을 테스트로 단언(예: 공유 dispatch table); 어떤 연산도 표면 고유 비즈니스 로직을 갖지 않는다.

### 2. CLI read 연산 구현
- **Do:** `caw05 status [--run <id>] [--json]`(마지막 receipt + dead-man 상태), `caw05 list-findings [--window][--class][--quality][--min-score][--unreviewed][--json]`(redacted 뷰; recall-floor hit는 절대 숨기지 않음), `caw05 show-finding <id> [--json]`(전체 provenance manifest), `caw05 render <format> <id|--window> [--out]`를 구현한다. `render`는 digest tree에 파생/재생성 가능한 산출물을 쓰므로 거버넌스상 read-class다. 모든 read 연산에 `--json`.
- **Verify:** read 연산은 cursor를 전진시키거나 ledger에 append하거나 bundle을 emit하지 않는다(상태 변화 없음으로 단언). `render` 출력은 항상 "generated summary — not evidence" 배너를 포함. `list-findings`는 recall-floor hit를 절대 숨기지 않는다.

### 3. CLI mutating 연산 구현
- **Do:** `caw05 run [--window weekly][--dry-run][--resume][--source ...]`, `caw05 run --since <date>`(backfill, cursor 무시), `caw05 mark-feedback <id> --label ... [--note]`(버전드 interest-feedback 레코드), `caw05 confirm <id>`(review gate 완료), `caw05 export <id> --target <caw-02|caw-03|caw-01|caw-06> [--dry-run]`를 구현한다. CLI에서는 `confirm`/`export`가 **실행**된다(operator가 곧 human gate) — 단 코어는 여전히 export idempotency key를 강제하므로 반복은 no-op이며 결코 이중 라우팅되지 않는다.
- **Verify:** `run`은 single-flight lock을 잡는다; `mark-feedback`은 버전드 레코드를 쓴다; confirmed novelty-threat에 대한 CLI `export`는 정확히 하나의 bundle을 emit하고 반복은 no-op.

### 4. CLI exit-code 맵 구현
- **Do:** exit code를 매핑(cli-and-mcp.md): `0` ok; `2` lock held(다른 Run 진행 중, 쌓지 않고 거부); `3` dead-man alert(최근 receipt 없음); `4` gated op refused(확정되지 않은 terminal); `5` source/adapter error. `TODO(open-question: finalize codes on review.)`
- **Verify:** 각 조건이 매핑된 코드를 반환(table-driven test): 동시 run→2, stale receipt→3, 미확정 terminal→4, adapter error→5.

### 5. MCP 서버 구현 (연산당 tool 1개)
- **Do:** 각 연산을 typed input/output schema를 가진 MCP **tool** 하나로 노출(`caw05.run`, `caw05.backfill`, `caw05.status`, `caw05.list_findings`, `caw05.show_finding`, `caw05.render`, `caw05.mark_feedback`, `caw05.confirm`, `caw05.export`). tool은 검증된 typed 연산이며 — **generic CRUD나 free-form prompt가 아니다**(generic seam은 invariant를 누설한다). 서버측에서 강제: redaction(confidential/internal 데이터는 절대 유출 안 됨; brief §12), review gate, proposal-only terminal 규칙. 출력 행은 generated 필드에 `evidence:false`와 additive `relevance.explanation`(ADR-0002)을 담는다.
- **Verify:** 각 tool에 typed schema가 있다; free-form/비검증 호출은 거부된다. `list_findings` 출력은 generated 필드를 `evidence:false`로 표시하고 additive relevance explanation을 포함한다. redaction은 반환 전 모든 비공개 필드를 제거한다.

### 6. MCP의 proposal-only terminal 규칙 구현
- **Do:** MCP에서 `novelty-threat`에 대한 `confirm`과 `export`는 **terminal route를 절대 실행하지 않는다** — *pending human-gate event*를 생성하고 핸들을 반환한다(`{status:"pending-human-gate", gate_event_id, finding_id, target, idempotency_key, note}`); Jimmy가 CLI `confirm`/`export`로 완료한다(brief §11; ADR-0004 §1/§5). 이것이 가장 중요한 표면 invariant다: 에이전트는 확정되지 않은 novelty-threat를 CAW-03로 export해선 안 된다. `TODO(open-question: gate notification channel given no shared substrate; per-tool auth scoping.)`
- **Verify:** novelty-threat에 대한 MCP `caw05.export`는 `pending-human-gate`를 반환하고 bundle을 emit하지 않는다; 동일 finding은 operator의 CLI `confirm`/`export` 이후에만 경계를 넘는다. MCP를 통한 read 연산은 영향받지 않는다.

### 7. observability 표면(`status`) 연결
- **Do:** `status`는 최신 `run-receipt`(RB-041)를 읽어 window, source별 `{fetched,new,dup}`, classified counts, exports, 그리고 **dead-man 상태**를 보고한다: `cadence + grace`를 지나도 receipt가 없으면 "radar went dark" alert를 반환(CLI에선 non-zero exit; MCP에선 alert 필드).
- **Verify:** 신선한 receipt면 `status`가 counts를 보고; stale/missing receipt면 dead-man alert를 반환(CLI exit 3).

## Acceptance criteria
- [ ] CLI와 MCP가 동일한 core op-set을 호출; 어느 표면에도 비즈니스 로직 없음.
- [ ] read 연산(`status`/`list-findings`/`show-finding`/`render`)은 cursor/ledger/exports를 절대 mutate하지 않음; 모든 read에 `--json`.
- [ ] `render`는 항상 "generated summary — not evidence"를 스탬핑; generated 필드는 `evidence:false`.
- [ ] CLI `confirm`/`export`는 실행(operator가 게이트) + idempotency; MCP `confirm`/`export`의 novelty-threat는 proposal-only(pending gate event, emit 없음).
- [ ] MCP tool은 검증된 typed 연산; free-form/generic 호출 거부; 서버측 redaction 강제.
- [ ] CLI exit-code 맵 구현(0/2/3/4/5).
- [ ] `status`가 receipt로부터 dead-man "radar went dark" alert를 노출.
- [ ] `list-findings`는 recall-floor hit를 절대 숨기지 않음; tree는 green.

## Rollback / safety
- 두 표면 모두 얇은 wrapper다; MCP 서버 비활성화나 CLI 서브커맨드 제거는 코어 Run(cron)을 그대로 둔다.
- proposal-only terminal 규칙은 하드 안전 경계다 — 테스트 통과를 위해 MCP `confirm`/`export`가 novelty-threat route를 실행하게 만들지 말 것; 에이전트 경로는 항상 pending-gate다.
- redaction과 `evidence:false` 마킹은 코어에서 강제되므로, 버그 있는 표면도 confidential 데이터를 유출하거나 generated summary를 evidence로 통과시킬 수 없다.
- read 연산은 부작용이 없다; 중단된 read는 되돌릴 상태를 남기지 않는다.

## Hand-off
- operator와 CI는 이제 CLI로 radar를 구동하고; AI 에이전트는 MCP read 연산으로 signal을 소비하며 proposal-only terminal로 route를 요청한다.
- M2+(RB-05x/06x)는 export 대상과 포맷을 추가한다; 두 표면 모두 표면 변경 없이 op-set을 통해 이를 받는다(표면이 아니라 op-set을 확장).
- 전체 M1 슬라이스가 이제 사람(CLI)과 에이전트(MCP) 모두에 의해, 단일 cron 스케줄 Run 위에서 end-to-end로 운용 가능하다.
