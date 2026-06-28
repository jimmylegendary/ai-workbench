# Storage & Scheduling — 파일 기반 자체 저장소, append-only 원장, scout 자동화

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [data-model_ko.md](data-model_ko.md) (이 레이아웃이 영속화하는 엔티티)
  - [provenance-and-uncertainty_ko.md](provenance-and-uncertainty_ko.md) (append-only `status_log`, supersede 의미)
  - [../01-decisions/ADR-0007-storage-and-scheduling.md](../01-decisions/ADR-0007-storage-and-scheduling_ko.md) (이것이 상술하는 결정)
  - [../01-decisions/ADR-0003-experiment-ledger.md](../01-decisions/ADR-0003-experiment-ledger_ko.md) (append-only 원장 + repro gate)
  - [../01-decisions/ADR-0005-source-and-claim-ingestion.md](../01-decisions/ADR-0005-source-and-claim-ingestion_ko.md) (`FetchCursor`, `sources.yaml`)
  - [../01-decisions/ADR-0008-export-boundaries.md](../01-decisions/ADR-0008-export-boundaries_ko.md) (`store/exports/` receipts)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적
이 문서는 **CAW-06의 레코드가 디스크 어디에 사는지**와 **ExperimentScout가 그것들을 어떻게 스케줄로 실행하는지**를 고정한다. ADR-0007을 상술한다: 유형화된 파일 저장소 레이아웃, append-only-with-supersede 변경 모델, 폐기 가능한 derived index, `FetchCursor` 영속화, 그리고 human-in-the-loop gate를 가진 cron 유사 + 이벤트 트리거 스케줄러. 엔티티 스키마(see [data-model_ko.md](data-model_ko.md))나 uncertainty 규칙(see [provenance-and-uncertainty_ko.md](provenance-and-uncertainty_ko.md))을 다시 결정하지는 **않는다**. 이 저장소는 **CAW-06의 자체(OWN)**다 — CAW-01/CAW-02/CAW-05와 공유 런타임, 저장소, 레지스트리가 없다(brief §1, §8).

## 1. 왜 파일인가 (데이터베이스가 아니라)
ADR-0007(채택)과 brief §7에 따라: markdown/JSON 레코드 + 경로로 참조되는 artifact, git으로 추적 가능.

| Force | 파일이 충족하는 방식 |
|---|---|
| 패밀리 일관성 (brief §7) | markdown/JSON + 작은 원장, diff 가능, 인프라 없음 |
| 감사 가능성 + append-only | 모든 레코드가 git에서 diff됨; 원장 + `status_log`는 in-place 편집 안 함 |
| 실패의 내구성 (brief §5) | 아무것도 삭제 안 됨; `supersede`가 교체된 실패를 유지 |
| 멱등 자동화 | adapter는 영속화된 `FetchCursor`에서 재개; 재실행이 중복 안 만듦 |
| 독립성 (brief §1, §8) | 저장소와 스케줄러는 CAW-06 자체; 공유 기반(substrate) 없음 |

기각: source of truth로서의 SQLite(바이너리, diff 가능성 상실, 패밀리에서 이탈). derived index는 허용되지만 **폐기 가능**하다 — §4 참조.

## 2. 저장소 레이아웃

```
caw-06/
├─ store/                          # canonical source of truth (git-tracked, diffable)
│  ├─ sources/      SRC-0001.md            # Source records (front-matter + body)
│  ├─ claims/       CLAIM-0011.md          # extracted, attributable Claims
│  ├─ hypotheses/   HYP-0003.md            # Hypothesis + append-only status_log
│  ├─ ledger/
│  │  └─ EXP-0007/  entry.md  result.json  # one dir per run (one run = one entry)
│  ├─ implications/ IMAP-0002.md           # ImplicationMap (summary marked generated)
│  ├─ writeback/    WBT-0001.{md,json}     # wbtraffic.v0 artifacts (CAW-01 payloads)
│  └─ exports/      EXB-0005.json          # ExportBundle receipts (ADR-0008)
├─ artifacts/                      # LARGE files, referenced BY PATH — never inlined
│  └─ EXP-0007/     config.yaml  env.lock  metrics.json  REPRO.md  logs/  plots/
├─ index/                         # DISPOSABLE derived index (rebuildable from store/)
│  └─ index.sqlite | index.json
├─ cursors/                       # FetchCursor per adapter (resumable scout)
│  └─ arxiv.json  semantic-scholar.json  caw05.json
├─ queue/                         # review queue: staged promotions + supported exports
│  └─ pending/  approved/
└─ sources.yaml                   # adapter registry + schedule (doubles as schedule registry)
```

규칙:
- **엔티티당 markdown/JSON 레코드 하나**, envelope는 front-matter에(data-model_ko.md §2).
- **큰 artifact는 경로로만**(config, metrics, logs, checkpoint, plot은 `artifacts/EXP-XXXX/` 아래).
- ID는 prefix별로 stable + monotonic(`SRC/CLAIM/HYP/EXP/IMAP/WBT/EXB`).

## 3. supersede가 있는 append-only
원장 entry(ADR-0003)와 Hypothesis `status_log`(ADR-0002)는 **append-only**다. 정정은 in-place 편집이 아니라 `lineage.supersedes`를 가진 새 레코드/이벤트다.

| 연산 | 방법 | 보존하는 것 |
|---|---|---|
| 새 발견 | 새 레코드 작성 | — |
| run 정정/정제 | `lineage.supersedes: EXP-MMMM`를 가진 새 `EXP-NNNN` | superseded된 실패가 디스크에 남음 |
| status 변경 | `status_log`에 `StatusEvent` append | 완전한 가역 이력(provenance doc) |
| 삭제 | **절대 안 함** | 실패는 first-class(brief §5) |

**"current" resolver**는 최신 상태 뷰를 계산한다(hypothesis별 "current verdict" = superseded되지 않은 최신 entry; "current status" = 최신 `StatusEvent`). resolver는 `store/`에 대한 순수 함수이며, `index/`를 삭제해도 아무것도 잃지 않는다.

## 4. derived index (폐기 가능)
재구축 가능한 index(SQLite 또는 평면 JSON 파일)는 평면 파일이 값싸게 할 수 없는 쿼리를 구동한다: **negative-results 뷰**(모든 `refuted`/`inconclusive`/non-null `failure_mode`, `hypothesis_id` + `failure_mode`로 그룹화), hypothesis별 run 이력, thread 쿼리. 파일이 정규로 남고, `index/`는 전체 스캔으로 재생성되며 언제든 wipe될 수 있다.
- `TODO(open-question: index backend — SQLite vs flat JSON; does v1 query volume justify SQLite?)` (ADR-0007).

## 5. FetchCursor (멱등, 재개 가능한 scout)
스케줄러는 각 adapter의 불투명한 `FetchCursor`를 `cursors/` 아래에 영속화하여 스케줄된 재실행이 증분적이게 한다(ADR-0005, ADR-0007 §4):

| Adapter | Cursor 내용 |
|---|---|
| `ArxivAdapter` | watermark / resumptionToken + 마지막 `retrieved_at` |
| `SemanticScholarAdapter` | page offset / continuation token |
| `CAW05ImportAdapter` | 마지막으로 소비한 `bundle_id`(import watermark) |

변경되지 않은 cursor로 재실행하면 다운스트림 중복이 발생하지 않는다. dedup(DOI ▸ arXiv id ▸ normalized title)는 재발견을 하나의 `Source`로 병합한다(ADR-0005 §4).

## 6. 스케줄링 & 자동화
ExperimentScout는 세 개의 얇은 표면(pipeline + CLI + MCP, ADR-0001) 뒤에 있는 하나의 제품 코어다. 스케줄링 = **cron 유사 + 이벤트 트리거**, `sources.yaml`이 `family → adapter + query + schedule`을 바인딩하는 config 주도 방식.

```yaml
# sources.yaml (registry + schedule)
families:
  - id: ttt-arxiv
    adapter: ArxivAdapter
    query: "test-time training OR test-time compute ..."
    schedule: "cron: 0 6 * * *"        # scheduled scouting (brief §4)
    rate_limit: "1 req / 3 s"
  - id: caw05-signals
    adapter: CAW05ImportAdapter
    trigger: "event: bundle-arrival"    # file drop / pull from CAW-05 (separate product)
```

| Trigger | 발화 조건 | 실행하는 것 |
|---|---|---|
| Scheduled (cron 유사) | 타이머 | due한 family에 대한 ingestion S1–S5 |
| Event | CAW-05 bundle 도착(file drop / pull); CLI/MCP 호출 | 표적 ingestion / 단일 experiment |
| Manual | operator CLI/MCP 명령 | 요청 시 임의 단계 |

규율:
- 스케줄러는 각 adapter의 `rate_limit`을 존중하고 **유형화된 실패(typed failures)**에 반응한다(일시적이면 retry; 종착이면 halt + 보고) — ADR-0005의 여섯 가지 adapter 의무.
- Experiment run(`ExperimentRunnerAdapter`, ADR-0003)은 동일하게 스케줄/트리거되며 **모든 launch마다 반드시 원장 entry를 생성해야 한다** — 크래시 포함(→ `invalid`/`aborted`) — 그래야 실패가 조용히 버려질 수 없다.
- `TODO(open-question: scheduler host — long-running daemon vs OS cron invoking a CLI entrypoint?)` (ADR-0007).
- `TODO(open-question: concurrency — can two scheduled runs touch one thread; do we need per-thread file locks?)`.

## 7. Human-in-the-loop gate
자동화는 **제안만(proposal only)**이다(brief §12; ADR-0007 §6). scout는 다음을 할 수 있다:
- `status=hypothesis`, `confidence=very-low`로 `Hypothesis` 생성;
- 원장 verdict로부터 `StatusEvent` 제안;
- `queue/pending/`에 `ExportBundle` 스테이징.

그러나 **`supported`로의 승격과 모든 `supported` export의 emit은 Jimmy의 리뷰를 요구한다**(`queue/approved/`로 이동). 자동 승격 없음; CAW-05 힌트와 verdict의 자동 융합 없음. 이 gate는 전략적 산출물이 제품을 떠나기 전에 지연을 더한다 — 수용된 비용. export receipt는 ok/rejected와 무관하게 `store/exports/`에 도착한다(rejected된 export도 exportable로 남음 — ADR-0008 §6).

## 8. 보존(Retention)
아무것도 삭제되지 않는다; 큰 실패 artifact는 경로로 유지된다.
- `TODO(open-question: retention/GC for large failure artifacts — keep forever by path, or summarize + prune after N days keeping metrics?)` (ADR-0003, ADR-0007).

## Open Questions
- Index backend; scheduler host; concurrency/locking; artifact GC(위; [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md)에서 추적).
- **재검토 시점:** 파일 저장소의 쿼리 비용이 병목이 될 때(index를 primary로 승격), 또는 두 번째 operator가 합류할 때(locking/merge 정책) — ADR-0007.

## 런북에 대한 함의
- **RB (파일 저장소 + resolver):** 위의 유형화된 레이아웃; append-only writer; `supersede` + "current" resolver.
- **RB (derived index):** 재구축 가능한 index + negative-results 뷰 + hypothesis별 run 이력.
- **RB (스케줄러):** cron + 이벤트 트리거, `FetchCursor` 영속화, rate-limit + 유형화된 실패 처리.
- **RB (runner 규율):** 모든 experiment launch마다 원장 entry를 강제.
- **RB (review queue):** 모든 `supported` export 전에 `queue/pending` → `queue/approved` gate; receipt는 `store/exports/`로.
