# ADR-0007: 저장소(md/JSON + experiment/result ledger) & ExperimentScout 스케줄링

- **Status:** proposed
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF_ko.md) (§4 표면(surface), §7 데이터, §12 리뷰어 가드레일)
  - [../02-research/experiment-ledger_ko.md](../02-research/experiment-ledger_ko.md) (이 ADR이 영속화하는 ledger 항목 모델)
  - [./ADR-0001-product-surface-and-scout_ko.md](./ADR-0001-product-surface-and-scout_ko.md) (이것이 스케줄링하는 ExperimentScout 파이프라인 + CLI/MCP)
  - [./ADR-0002-hypothesis-representation_ko.md](./ADR-0002-hypothesis-representation_ko.md), [./ADR-0003-experiment-ledger_ko.md](./ADR-0003-experiment-ledger_ko.md)
  - [./ADR-0005-source-and-claim-ingestion_ko.md](./ADR-0005-source-and-claim-ingestion_ko.md) (이것이 영속화하는 `FetchCursor` 워터마크), [./ADR-0006-implication-mapping_ko.md](./ADR-0006-implication-mapping_ko.md), [./ADR-0008-export-boundaries_ko.md](./ADR-0008-export-boundaries_ko.md)
  - [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Context

다른 모든 CAW-06 ADR은 레코드를 생산한다 — `Source`/`CandidateClaim`(ADR-0005), `Hypothesis`/`Claim`/`Evidence`
(ADR-0002), ledger 항목(ADR-0003), `ImplicationMap`(ADR-0006), writeback 산출물(ADR-0004), export
영수증(ADR-0008). 이 ADR은 **그것들이 어디에 사는지**와 **ExperimentScout가 그것들을 어떻게 스케줄에 따라 실행하는지**를
고정한다. Brief §7: CAW-06 고유 저장소, markdown/JSON + 작은 experiment/result ledger, 대용량 산출물은 경로로.
모든 항목은 provenance, uncertainty/status, `boundary`를 지닌다. Brief §4: 파이프라인 + CLI + MCP 뒤의
하나의 제품 코어; 공유 기반(substrate) 없음.

힘(forces):
- **패밀리 일관성(brief §7):** markdown/JSON + ledger, diff 가능, git 친화적 — 데이터베이스 서버가 아니다.
- **감사 가능성(Auditability) + append-only:** ledger(ADR-0003)와 hypothesis `status_log`(ADR-0002)는
  append-only다; 수정은 덮어쓰지 않고 supersede(대체)한다. 실패는 내구성 있게 보존되고 발견 가능해야 한다(brief §5).
- **멱등적 자동화:** 탐색 어댑터(ADR-0005)는 영속화된 `FetchCursor`에서 재개한다; 재실행이 중복을 만들면 안 된다.
  scout는 **제안/hypothesis 생성이며, 전략적 결정의 리뷰어는 Jimmy다**(brief §12) — 자동화는 결코 status를
  자동 승격하거나 `supported` export를 자동 emit해서는 안 된다.
- **독립성(brief §1, §8):** CAW-01/02/05와 공유 런타임/저장소 없음; 스케줄러는 CAW-06 고유의 것이다.

## Options considered

| Decision point | Option | Pros | Cons | Fit |
|---|---|---|---|---|
| Store backend | **디스크상의 파일: markdown/JSON 레코드 + 경로별 산출물, git 추적 가능** | brief §7 + 패밀리와 일치; diff 가능; 인프라 제로; provenance가 front-matter에 동반 | 인덱스 없이는 풍부한 쿼리 불가 | **chosen** |
| | source of truth로서의 임베디드 DB(SQLite) | 쿼리 가능 | 바이너리 저장소; diff 가능성 상실; 패밀리에서 표류 | rejected (아래 인덱스 참조) |
| Query layer | **선택적 파생 인덱스(SQLite/JSON), 파일에서 재구축; 파일이 source of truth로 유지** | 빠른 negative-results/줄기 뷰; 폐기 가능 | 재구축 가능 상태 유지 필요 | **chosen** |
| Mutation model | **Append-only; `lineage`/`status_log`로 supersede, 제자리 편집 안 함** | 완전한 감사 추적; 실패가 살아남음 | "현재(current)" resolver 뷰 필요 | **chosen** |
| Scheduling | **Cron 유사 스케줄러 + 이벤트 트리거(CAW-05 번들 도착, CLI/MCP 호출); `sources.yaml`의 어댑터별 schedule** | 스케줄된 scouting(brief §4) + 온디맨드; rate-limit 인지 | 운영할 장시간 실행 컴포넌트 | **chosen** |
| | 수동 실행만 | 단순함 | "스케줄/트리거되는 ExperimentScout"(brief §4)를 무력화 | rejected |
| Human gate | **파이프라인은 제안; 리뷰 큐가 status 승격 + `supported` export를 Jimmy를 위해 보류** | brief §12 강제 | 리뷰 단계 추가 | **chosen** |

## Decision

1. **파일 기반 저장소, CAW-06 고유(brief §7).** 타입이 지정된 레이아웃 아래 엔티티당 하나의 markdown/JSON 레코드,
   예: `store/sources/`, `store/claims/`, `store/hypotheses/`, `store/ledger/EXP-XXXX/`, `store/implications/`,
   `store/writeback/`, `store/exports/`(영수증). 대용량 산출물(config, metric, log, checkpoint, plot)은
   `artifacts/EXP-XXXX/` 아래에 살며 **경로로** 참조되고, 결코 인라인되지 않는다. 모든 레코드는 front-matter에
   `provenance`, `status`/`uncertainty`, `boundary`를 지닌다(brief §7, §12).
2. **Append-only with supersede.** Ledger 항목(ADR-0003)과 hypothesis `status_log`(ADR-0002)는
   append-only다; 수정은 `lineage.supersedes`/새 `StatusEvent`를 가진 새 레코드이며, 결코 제자리 편집이 아니다.
   **"현재(current)" resolver**가 최신 상태 뷰를 계산한다; 아무것도 삭제되지 않는다(실패는 보존됨, brief §5).
3. **선택적 파생 인덱스, 파일이 source of truth로 유지.** 폐기 가능한 인덱스(SQLite 또는 JSON 인덱스 파일)는 파일
   저장소에서 재구축되어 negative-results 뷰, hypothesis별 run 이력, 줄기 쿼리(ADR-0003 표면화)를 구동한다.
   인덱스를 삭제해도 잃는 것은 없다; 파일 저장소가 정준(canonical)이다.
4. **`FetchCursor` 영속화.** 스케줄러는 각 어댑터의 불투명한 `FetchCursor`(ADR-0005)를 영속화한다 — arXiv
   워터마크/resumptionToken, Semantic Scholar 페이지, 마지막 CAW-05 `bundle_id` — 그리하여 스케줄된 재실행이
   증분적이고 멱등적이게 한다(하류 중복 없음).
5. **스케줄링 = cron 유사 + 이벤트 트리거, 설정 기반.** `sources.yaml`이 `family → adapter + query +
   schedule`을 바인딩한다. ExperimentScout는 수집 → 추출 단계를 스케줄에 따라 실행한다; **이벤트 트리거**는
   CAW-05 번들 도착(파일 드롭 / pull)과 CLI/MCP 호출 시 발화한다. 스케줄러는 각 어댑터의 `rate_limit`을 존중하고
   타입이 지정된 실패에 반응한다(일시적이면 재시도, 종료성이면 중단+보고). Experiment run
   (`ExperimentRunnerAdapter`, ADR-0003)도 같은 방식으로 스케줄/트리거되며, 매 launch마다 ledger 항목을 반드시
   생성해야 한다(크래시 포함 → `invalid`/`aborted`) — 그리하여 실패가 조용히 누락될 수 없게 한다.
6. **Human-in-the-loop 게이트(brief §12).** 자동화는 **제안만** 한다. scout는 `status=hypothesis`,
   `confidence=very-low`로 hypothesis를 생성하고, ledger verdict로부터 `StatusEvent`를 제안하고, export 번들을
   스테이징할 수 있다 — 그러나 **`supported`로의 status 승격과 `supported` export의 emit은 리뷰 큐를 통한
   Jimmy의 검토가 필요하다**. 자동 승격 없음, CAW-05 힌트를 verdict와 자동 혼동시키지 않음.

## Consequences

- **쉬움:** git에서 모든 레코드를 diff/검토; 중단 후 scout를 깔끔하게 재개; 쿼리 인덱스를 처음부터 재구축; 실패를
  내구성 있고 발견 가능하게 유지; 데이터베이스 인프라 제로로 운영.
- **어려움 / 감수하는 비용:** 풍부한 레코드 간 쿼리는 파생 인덱스가 필요하다(유지할 재구축 가능 컴포넌트);
  append-only 증가는 산출물 보존/GC 정책이 필요하다(open question); 스케줄러는 실행/모니터링할 라이브
  컴포넌트다; 리뷰 게이트는 전략적 출력이 제품을 떠나기 전 지연을 추가한다.
- **후속:** runbook이 파일 저장소 + resolver, 파생 인덱스 + negative-results 뷰, `FetchCursor` 영속화를 가진
  cron+trigger 스케줄러, 그리고 리뷰 큐를 구현한다. ADR-0008은 export 영수증을 `store/exports/`에 저장한다;
  ADR-0005의 `sources.yaml`은 schedule 레지스트리 역할도 겸한다.

## Open questions / revisit triggers

- `TODO(open-question: retention/GC for large failure artifacts — keep forever by path, or summarize + prune after N days keeping metrics? — mirrors ADR-0003)`.
- `TODO(open-question: index backend — SQLite vs a flat JSON index; does query volume at v1 justify SQLite?)`.
- `TODO(open-question: scheduler host — long-running daemon vs OS cron invoking a CLI entrypoint; which fits a single-operator product?)`.
- `TODO(open-question: should the ExperimentRunnerAdapter be forced to create a ledger entry on every launch even for out-of-band manual runs, to de-bias silent drops? — ADR-0003 OQ)`.
- `TODO(open-question: concurrency — can two scheduled runs touch the same thread; do we need per-thread file locks?)`.
- **재검토 시점:** 파일 저장소의 쿼리 비용이 병목이 될 때(인덱스를 주(primary)로 승격), 또는 두 번째 운영자가
  합류할 때(잠금/병합 정책).
