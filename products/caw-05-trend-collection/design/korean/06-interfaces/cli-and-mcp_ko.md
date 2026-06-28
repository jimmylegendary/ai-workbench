# CLI & MCP — 레이더를 구동하고 점검하기

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [scheduled-pipeline_ko.md](scheduled-pipeline_ko.md) (cron으로 발화되는 Run을 이 CLI/MCP도 발화함)
  - [digest-outputs_ko.md](digest-outputs_ko.md) (`render`가 내보내는 포맷들과 읽기 뷰)
  - [../01-decisions/ADR-0001-product-surface-and-outputs.md](../01-decisions/ADR-0001-product-surface-and-outputs_ko.md) (op-set은 여기서 고정됨)
  - [../01-decisions/ADR-0006-storage-and-scheduling.md](../01-decisions/ADR-0006-storage-and-scheduling_ko.md) (Run 생명주기, lock, receipt)
  - [../01-decisions/ADR-0004-classification-and-triage.md](../01-decisions/ADR-0004-classification-and-triage_ko.md) (`confirm` 뒤의 review gate)
  - [../01-decisions/ADR-0007-export-boundaries.md](../01-decisions/ADR-0007-export-boundaries_ko.md) (유일한 export 이음새)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적
이 문서는 하나의 파이프라인 코어 위에 놓이는 **두 개의 사람/에이전트 대면 표면(surface)**을 명세한다: **CLI**(사람 + CI)와
**MCP 서버**(AI 에이전트)다. 둘 다 ADR-0001 §D에서 고정된 **동일하게 검증되고 타입이 정해진 op-set** 위의 얇은 래퍼다.
이 문서는 각 연산, 그것의 읽기 대 변경(read-vs-mutating) 분류, 인자와 출력 형태, 그리고 종단(terminal) 변경 연산에 대한
**proposal-only(제안 전용)** 제약을 정의한다. Run의 내부(see
[scheduled-pipeline_ko.md](scheduled-pipeline_ko.md)), 출력 템플릿(see [digest-outputs_ko.md](digest-outputs_ko.md)),
또는 export 와이어 스키마(ADR-0007)는 정의하지 **않는다**. 거버넌스는 **코어**에 있으며, 이 표면들은 그것을 요청만 한다.

## 원칙: 하나의 op-set, 두 개의 전송 경로
CLI와 MCP는 **증명 가능하게 동등하다** — 둘 다 동일한 코어 연산을 호출하므로, 규칙(dedup, recall floor, review
gate, provenance 스탬핑, `evidence:false` 표시)이 둘 사이에서 어긋날 수 없다. 표면은 경로를 *요청*할 수 있고,
오직 코어만이 review gate를 거친 후 export를 수행한다. 표면이 op-set으로 표현되지 않는 로직을 필요로 한다면,
**표면이 아니라 op-set을 확장하라**(ADR-0001 revisit trigger).

## 연산 집합

| Op | Kind | CLI form | MCP tool | One invariant it carries |
|---|---|---|---|---|
| `run` | mutating | `caw05 run --window weekly` | `caw05.run` | single-flight lock; resumable stages |
| `backfill` | mutating | `caw05 run --since <date>` | `caw05.backfill` | ignores cursors; one-off historical sweep |
| `status` | read | `caw05 status [--run <id>]` | `caw05.status` | last receipt; "radar went dark" alert state |
| `list-findings` | read | `caw05 list-findings [filters]` | `caw05.list_findings` | redacted view; recall-floor hits never hidden |
| `show-finding` | read | `caw05 show-finding <id>` | `caw05.show_finding` | full provenance manifest |
| `render` | read* | `caw05 render <format> <id\|--window>` | `caw05.render` | emits with "generated summary — not evidence" banner |
| `mark-feedback` | mutating | `caw05 mark-feedback <id> --label …` | `caw05.mark_feedback` | feeds interest update (ADR-0002 §3); versioned |
| `confirm` | mutating (gated) | `caw05 confirm <id>` | `caw05.confirm` | **proposal-only on MCP**; human-gate event |
| `export` | mutating (gated) | `caw05 export <id> --target <caw>` | `caw05.export` | **proposal-only on MCP**; idempotency key |

`render`는 finding/ledger를 절대 변경하지 않는다는 의미에서 read이며, digest 트리에 *출력 산출물(artifact)을 기록*한다
(see [digest-outputs_ko.md](digest-outputs_ko.md)) — 이는 파생되고 재생성 가능한 파일이므로, 거버넌스 관점에서는
read 등급으로 취급된다.

## 읽기 대 변경 — 계약

### 읽기 연산 (누구에게나, 어느 표면에서나 안전)
`status`, `list-findings`, `show-finding`, `render`. 이들은 cursor를 절대 전진시키지 않고, ledger에 절대 append하지 않으며,
export 번들을 절대 내보내지 않는다. 이들이 기본 에이전트 대면 표면이다: AI 리더는 `list-findings` + `show-finding` +
`render`를 통해 signal을 소비하며, 결코 write를 통하지 않는다.

### 변경 연산 (코어 거버넌스 대상)
`run`/`backfill`는 cursor, `seen` 인덱스, finding, ledger를 변경한다; `mark-feedback`는 버전 관리되는
interest-feedback 레코드를 기록한다; `confirm`/`export`는 제품 경계를 넘을 수 있는 **종단(terminal)** 변경 연산이다.

### proposal-only 규칙 (종단 연산)
**MCP**에서 `novelty-threat` finding의 `confirm`과 `export`는 **종단 경로를 절대 실행하지 않는다**. 이들은
*대기 중 human-gate 이벤트(pending human-gate event)*를 생성하고 핸들을 반환한다; Jimmy가 CLI의 `confirm`/`export`로
완료한다(brief §11; ADR-0004 §1/§5). 이것이 가장 중요한 단일 표면 불변식이다: 에이전트는 확인되지 않은
novelty-threat를 CAW-03으로 export할 수 있어서는 안 된다. **CLI**에서는 운영자 *자신이* human gate이므로
`confirm`/`export`가 실행된다 — 하지만 코어는 여전히 export idempotency key(ADR-0006 §4.4)를 강제하므로 반복은
이중 경로(double-route)가 아니라 no-op이 된다.

| Surface | `run` | read ops | `mark-feedback` | `confirm` / `export` |
|---|---|---|---|---|
| **CLI** (human/CI) | executes | executes | executes (versioned) | **executes** (operator is the gate) |
| **MCP** (agent) | executes (still single-flight) | executes | executes (versioned) | **proposal-only** → pending gate event |

## CLI 형태

```text
caw05 run        [--window weekly] [--dry-run] [--resume] [--source <name>...]
caw05 run        --since <YYYY-MM-DD>          # backfill: ignore cursors
caw05 status     [--run <run_id>] [--json]     # last receipt + dead-man state
caw05 list-findings [--window weekly] [--class novelty-threat|support|adjacent|noise]
                    [--quality signal|hype] [--min-score <f>] [--unreviewed] [--json]
caw05 show-finding  <finding_id> [--json]      # full provenance manifest
caw05 render        <memo|digest|slide-outline|paper-card|action-brief>
                    <finding_id | --window weekly> [--out <path>]
caw05 mark-feedback <finding_id> --label <relevant|irrelevant|threat|...> [--note <s>]
caw05 confirm       <finding_id>               # complete the review gate
caw05 export        <finding_id> --target <caw-02|caw-03|caw-01|caw-06> [--dry-run]
```

종료 코드(예시; runbook에서 확정): `0` 정상; `2` lock 점유됨(다른 Run이 진행 중 — 쌓지 않고 거부); `3` dead-man
알림(최근 receipt 없음); `4` gated op 거부(확인되지 않은 종단 연산); `5` source/adapter 오류. CI/에이전트
파싱을 위해 모든 read 연산에 `--json` 제공.

## MCP 서버 형태
위의 각 연산은 타입이 정해진 입력/출력 스키마를 가진 하나의 MCP **tool**이다. 서버는 서버 측에서 다음을 강제한다:
redaction(기밀/내부 데이터는 절대 외부로 나가지 않음; brief §12), review gate, 그리고 proposal-only 종단 규칙.
Tool은 **검증되고 타입이 정해진 op**이며, 결코 일반(generic) CRUD나 자유 형식 프롬프트가 아니다(ADR-0001 §D) —
일반적인 이음새는 불변식을 누출시킬 것이다.

```jsonc
// caw05.list_findings — input
{ "window": "weekly", "class": ["novelty-threat","support"],
  "quality": "signal", "min_score": 0.0, "unreviewed": false, "limit": 50 }
// caw05.list_findings — output (one row)
{ "finding_id": "f_…", "title": "…", "class": "novelty-threat", "quality": "signal",
  "relevance": { "score": 7.4, "explanation": ["bm25:…","keyword-tier1:…"] },  // ADR-0002 additive/explainable
  "source": { "family": "arxiv", "canonical_id": "arXiv:…" },
  "reviewed": false, "evidence": false }            // generated fields are evidence:false
```

```jsonc
// caw05.export — MCP (agent) result is ALWAYS a proposal, never an emit
{ "status": "pending-human-gate", "gate_event_id": "g_…",
  "finding_id": "f_…", "target": "caw-03",
  "idempotency_key": "hash(finding_id+target+classification_version)",
  "note": "agent-requested; awaiting Jimmy confirm on CLI" }
```

## 관측 가능성 표면 (`status`)
`status`는 가장 최근의 `run-receipt`(ADR-0006 §3)를 읽어 다음을 보고한다: window, source별 `{fetched,new,dup}`,
classified count, export, 그리고 **dead-man 상태** — `cadence + grace`를 지나도 receipt가 존재하지 않으면 `status`는
"radar went dark"(레이더가 어두워짐) 알림을 반환한다(CLI에서는 0이 아닌 종료 코드). 이것이 운영자나 에이전트가
파일을 열지 않고도 레이더가 살아 있는지 확인하는 방법이다.

## Open Questions
- TODO(open-question: is `run` synchronous (blocks until `done`) or does it return a run handle that `status`
  polls? affects the CLI/MCP `status` contract — mirrors ADR-0006 open question.)
- TODO(open-question: does MCP `confirm`/`export` notification reach Jimmy via the heartbeat sink or a separate
  channel, given "no shared substrate"?)
- TODO(open-question: per-tool auth/scoping on the MCP server — is read-only a separate token from mutating?)
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md).

## runbook에 대한 함의
- **RB (CLI):** 코어 op-set 위의 얇은 래퍼; read에 `--json`; exit-code 맵; `--resume`/`--dry-run`.
- **RB (MCP server):** op당 하나의 tool; 타입이 정해진 스키마; 서버 측 redaction + review gate; **proposal-only
  종단**; 검증되지 않은/자유 형식 호출은 거부.
- 둘 다 ADR-0001(op-set)과 ADR-0006(Run 생명주기, lock, receipt)으로 다시 연결된다.
