# 시스템 아키텍처 — CAW-05 조기경보 레이더(Early-Warning Radar)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [component-boundaries.md](component-boundaries_ko.md) (모듈 소유권 + 서비스 시그니처 + 포트)
  - [../01-decisions/ADR-0001-product-surface-and-outputs.md](../01-decisions/ADR-0001-product-surface-and-outputs_ko.md) (the Run; surface; 포맷)
  - [../01-decisions/ADR-0003-source-adapters-and-ingestion.md](../01-decisions/ADR-0003-source-adapters-and-ingestion_ko.md) (SourceAdapter; cursor; 코어 내 dedup)
  - [../01-decisions/ADR-0004-classification-and-triage.md](../01-decisions/ADR-0004-classification-and-triage_ko.md) (cascade; selective-review gate; routing)
  - [../01-decisions/ADR-0006-storage-and-scheduling.md](../01-decisions/ADR-0006-storage-and-scheduling_ko.md) (files-as-truth + SQLite; cron)
  - [../01-decisions/ADR-0007-export-boundaries.md](../01-decisions/ADR-0007-export-boundaries_ko.md) (ExportAdapter; shared store 없음)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적
이 문서는 CAW-05의 **컨테이너 수준 아키텍처**를 기술한다: 런타임 빌딩 블록(파이프라인 코어, source 어댑터,
files+SQLite 저장소, export 어댑터, scheduler, CLI/MCP), 그것들이 연결되는 방식, 그리고 제품을 독립적으로
유지하고 불변식을 강제 가능하게 하는 **단방향 의존성 규칙**. 이 문서는 **classification, triage, dedup,
recall floor, review gate가 코어에 존재한다**는 점을 고정한다 — 어댑터는 이를 우회할 수 없다. 이 문서는
surface/output 결정(ADR-0001), source 집합(ADR-0003), triage 루브릭(ADR-0004), ledger 스키마(ADR-0005),
스토리지 내부(ADR-0006), export wire 스키마(ADR-0007)를 재정의하지 않는다 — 그것들을 하나의 그림으로 조립한다.
서비스 시그니처는 [component-boundaries.md](component-boundaries_ko.md)에 있다.

## 1. 한눈에 보는 컨테이너

| 컨테이너 | 역할 | 상태 소유? | 의존 대상 |
|---|---|---|---|
| **파이프라인 코어 (the Run)** | 단일 op 집합: `ingest → relevance → classify → triage/route → synthesize → export`; dedup, recall floor, review gate, provenance 강제 | 예 (오케스트레이션 + checkpoint) | 포트만 |
| **Source 어댑터** | 한 source family를 `RawFinding`으로 fetch + normalize (arXiv, S2, GitHub, blog RSS, HN-light; 스텁) | 아니오 (cursor는 코어가 보유) | 외부 공개 source |
| **Files + SQLite 저장소** | files-as-truth (`interests.yaml`, `findings/*.json`, `ledger/*.jsonl`) + SQLite index/ledger-cache | 예 (the truth) | 파일시스템 |
| **Export 어댑터** | 확정된 LedgerLink를 서명된 `caw05-signal` bundle로 투영; file-drop, consumer가 pull | 아니오 | boundary 파일시스템 |
| **Scheduler** | cron으로 `caw05 run --window weekly`를 발화(fire); 발화 외 로직 없음 | 아니오 | OS cron |
| **CLI / MCP surface** | 검증된 단일 타입 op-set(`run`, `status`, `list/show`, `render`, `confirm`, `export`) 위의 얇은 드라이버 | 아니오 | 코어 op-set |

독립성(brief §1): 모든 컨테이너는 CAW-05의 **자체**다; CAW-01/02/03/06과 **공유 런타임 기반(substrate) 없음**.
유일한 제품 간 이음매는 형제가 나중에 **pull**하는 파일을 쓰는 **ExportAdapter**다(ADR-0007).

## 2. 컨테이너 다이어그램

```
                      EXTERNAL PUBLIC SOURCES (read-only, ToS-safe)
        arXiv API/OAI/RSS │ Semantic Scholar │ GitHub Atom/REST │ blog RSS │ HN (Algolia)
                          │        │                │              │          │
                          ▼        ▼                ▼              ▼          ▼
        ┌──────────────────────────────────────────────────────────────────────────┐
        │  SOURCE ADAPTERS  (SourceAdapter port)   fetch + normalize ONLY            │
        │  Arxiv │ SemanticScholar │ Github │ BlogRss │ HackerNews │ [stubs:         │
        │  Reddit, Edgar, Newsletter, InternalFeed — config-disabled]               │
        └──────────────────────────────────────────────────────────────────────────┘
                                   │ RawFinding (+ provenance)
   ┌── fires ──┐                   ▼
   │ SCHEDULER │   ┌──────────────────────────────────────────────────────────────┐
   │  (cron)   │──▶│                  PIPELINE CORE  (the Run)                      │
   └───────────┘   │                                                                │
                   │  Ingest ─▶ Dedup ─▶ Relevance ─▶ Classify ─▶ Triage/Route ─▶  │
                   │   (cursors)  (multi-layer)  (BM25+floor)  (LF→LLM→human)       │
                   │                                              │                 │
                   │              Synthesize ◀────────────────────┘                 │
                   │           (FormatRenderer port: 5 formats)                     │
                   │                     │                                          │
                   │            review gate (human-confirmed)                       │
                   │                     │                                          │
                   │                  Export ──▶ EXPORT ADAPTERS (ExportAdapter)    │
                   │                              CAW-02 │ CAW-03 │ CAW-01 │ CAW-06 │
                   └──────────────────────────────────────────────────────────────┘
                       ▲  reads/writes (StoragePort)        │ signed *.caw05.jsonl
                       │                                     ▼ (file drop; consumer PULLS)
        ┌──────────────────────────────────────┐   ╔══════════════════════════════╗
        │  FILES + SQLITE STORE (files-as-truth)│   ║  boundary drop location      ║
        │  interests.yaml │ findings/*.json     │   ║  (no shared store)           ║
        │  ledger/*.jsonl (append-only)         │   ╚══════════════════════════════╝
        │  caw05.sqlite (index / ledger-cache)  │
        └──────────────────────────────────────┘
                       ▲
                       │ same vetted op-set
        ┌──────────────────────────────────────┐
        │  SURFACES:  CLI (humans/CI) │ MCP (agents)  — thin; proposal-only terminals │
        └──────────────────────────────────────┘
```

## 3. 단방향 의존성 규칙

**의존성은 포트를 통해 안쪽의 코어를 향한다; 어느 것도 바깥으로 되돌아가지 않는다.** 코어가 포트 인터페이스를
정의하고; 어댑터와 surface가 그것을 구현/소비한다. 이는 "거버넌스는 코어에 존재하고, 결코 surface에 있지
않다"의 아키텍처적 표현이다(ADR-0001 §Decision).

```
  surfaces (CLI/MCP) ──▶ core op-set ──▶ CORE SERVICES ──▶ PORTS ◀── adapters (source/export/scheduler/renderer)
                                              │
                                              └──▶ StoragePort ──▶ files + SQLite
```

| 규칙 | 이유 | 강제 수단 |
|---|---|---|
| 어댑터는 코어의 포트 타입에 의존; 코어는 결코 구체 어댑터를 import 안 함 | 파일 하나로 family 교체; 파이프라인에 source별 분기 없음 | config-driven 레지스트리 (ADR-0003 §3) |
| surface는 검증된 타입 op-set만 호출; surface-local 로직 없음 | cron/CLI/MCP가 보조를 맞춤; 한 곳에서 불변식 강제 | 단일 op manifest (ADR-0001 §D) |
| 코어는 오직 `StoragePort`로만 저장소에 도달 | files-as-truth 교체 가능; SQLite는 재구축 가능 cache | ADR-0006 |
| export는 오직 `ExportAdapter`로만; 코어는 결코 형제 저장소에 쓰지 않음 | 독립성; 공유 기반 없음 | ADR-0007 §1 |
| 어댑터는 classify, rank, dedup, export 금지 | 그것들은 코어 불변식(recall, audit) | 아래 §4 |

위반은 탐지 가능하다: 파이프라인의 source별 분기, 또는 규칙을 강제하는 surface는 **계약 누수(contract
leak)**다(ADR-0003 재검토 트리거).

## 4. classification, triage, dedup이 코어에 있는 이유 (어댑터가 아님)

이 셋은 **불변식을 지니므로**, 교체 가능한 edge 컴포넌트에 위임될 수 없다:

| 관심사 | 위치 | 어댑터로 옮길 수 없는 이유 |
|---|---|---|
| **Dedup (다계층)** | core (Ingest) | arXiv+S2+blog+HN의 논문은 provenance entry가 여럿인 단일 finding으로 합쳐져야 함; 어댑터는 자기 family만 보므로 쌍둥이를 만들게 됨 (ADR-0003 §5) |
| **Relevance + recall floor** | core (Relevance) | recall-first floor — watch list 히트가 결코 조용히 누락되지 않음 — 는 제품 존재 이유(brief §1, §19); 어댑터별 ranking은 표류함 |
| **Classification / triage** | core (Classify/Triage) | LF→LLM→human cascade + selective-review gate + 결정론적 routing은 감사 가능한 불변식; 생성 rationale은 결코 evidence가 아님 (ADR-0004) |
| **Provenance 스탬핑** | core + 어댑터 계약 | 어댑터는 origin/retrieved_at/native-id/boundary를 제공해야 함; 코어가 완전성을 검증하고 불완전한 finding을 거부함 (ADR-0003 의무 4) |
| **Review gate + export** | core | finding은 제안이다; 오직 human-gated 코어만 종착 route를 수행; MCP 에이전트는 제안만 가능 (ADR-0001 §4, ADR-0007 §4) |

어댑터는 의도적으로 dedup/ranking에 대해 **얇고 무상태(stateless)**다(ADR-0003 §D): `fetch + normalize ONLY`.
recall 미션은 dedup-then-floor가 실행되는 단일 chokepoint에 의존하므로, 빠진 주나 다중 source 중복이 watch
list 히트를 빠져나가게 할 수 없다.

## 5. Run 라이프사이클 (컨테이너 간 데이터 흐름)

```
cron fires ──▶ Run wrapper acquires single-flight lock ──▶
  Ingest:     for each active SourceAdapter: fetch(query, cursor) → RawFinding[]; advance cursor on full pass only
  Dedup:      native-id ▸ canonical (DOI▸arXiv▸title) ▸ SHA-256 ▸ [SimHash flag] → one Finding, many provenance
  Relevance:  BM25-first additive explainable score + recall-first floor (watch-list hit kept regardless)
  Classify:   LF → LLM → (abstain → human) cascade → two-axis label (threat/support/adjacent/noise × signal/hype)
  Route:      deterministic config-driven → knowledge | task | experiment | open-question | discard
  Ledger:     append LedgerLink (+ S2 verification record) to ledger/*.jsonl; index into SQLite
  Synthesize: FormatRenderer over confirmed Findings → memo/digest/slide/paper-card/action-brief (evidence:false banner)
  Export:     confirmed-only → ExportAdapter → signed *.caw05.jsonl (idempotent; fail-closed)
  Receipt:    write run-receipt heartbeat (missing receipt past cadence+grace = ALERT, not a no-op)
```

**Run wrapper**가 소유하는 속성(cron에는 없음): single-flight lock, 빠진 주가 스스로 치유되는 cursor 기반
**catch-up**, stage별 checkpoint(크래시는 마지막으로 완료된 stage에서 재개), heartbeat receipt(ADR-0001
§Decision 1–2). Idempotency: `done` Run의 재실행은 no-op; export idempotency key가 이중 routing을
방지한다(ADR-0006/0007).

## 6. 스토리지 토폴로지 (files-as-truth + SQLite)

| Artifact | 경로 | 역할 | 권위(Authority) |
|---|---|---|---|
| Interest 모델 | `interests.yaml` | 타입화, tier화, 버전화된 watch list (ADR-0002) | truth |
| Findings | `findings/*.json` | triage된 finding + provenance | truth |
| Ledger | `ledger/*.jsonl` | append-only LedgerLink + verification record | truth |
| Index / cache | `caw05.sqlite` | query index, dedup key, ledger-cache, cursor | 파일로부터 **재구축 가능** |
| Boundary drop | `*.caw05.jsonl` (boundary dir) | 형제가 pull하는 서명된 export bundle | truth (export) |

SQLite는 **파생(derived) index**이지 결코 source of truth가 아니다 — 파일을 재생하여 재구축할 수
있다(ADR-0006). 코어는 이 모든 것에 오직 `StoragePort`를 통해서만 도달한다(§3).

## 7. 제품 간 경계 (공유 기반 없음)

CAW-05는 **공개 source**(read-only)를 ingest하고, consumer가 **pull**하는 서명된 파일 bundle을
**export**한다(ADR-0007). CAW-01/02/03/06 저장소에 결코 쓰지 않으며; consumer는 import 시 재-redact, 재-classify
한다(defense-in-depth). relation→consumer 투영(novelty-threat → CAW-03 gate, Source/Claim → CAW-02,
open-question → CAW-01/CAW-06)과 fail-closed 규칙(novelty gate로는 confirmed-only; 생성 요약은 결코 evidence
필드가 아님; public-only; 빈 bundle 거부)은 ADR-0007 §3–4에 고정되어 있다.

## 열린 질문(Open Questions)
- TODO(open-question: heartbeat/dead-man's-switch sink — local "no receipt in N days" vs external service, given
  "no shared substrate"; owned with ADR-0006.) [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) 참조.
- TODO(open-question: is a Run one synchronous process or resumable stage-jobs with a handle? affects `status`.)
- TODO(open-question: family-wide bundle signature scheme so one verifier works across products — ADR-0007.)

## 런북에 대한 함의
- **RB (Run wrapper + 라이프사이클):** lock, cursor를 통한 catch-up, stage별 checkpoint, heartbeat receipt.
- **RB (포트 레지스트리):** Source/Export/Scheduler/FormatRenderer/Classifier를 config-driven 레지스트리로; 코어는
  포트에만 의존; 스텁은 등록 + 발견 가능하나 config-disabled (preflight가 active 스텁을 거부).
- **RB (ingestion 런타임):** token-bucket limiter, cursor 영속화, 다계층 dedup, 코어 내 provenance 스탬핑 —
  어댑터는 얇게 유지.
- **RB (store):** files-as-truth 레이아웃 + 파일로부터 재구축 가능한 SQLite index (`reindex`).
- **RB (음성 테스트):** 어댑터는 classify/rank/dedup/export 불가; surface는 규칙 강제 불가(계약 누수 테스트);
  ADR-0007 N1–N6.
