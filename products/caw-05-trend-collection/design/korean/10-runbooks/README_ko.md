# CAW-05 Runbooks — 인덱스

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: review date)
- **Related:** [./runbook-conventions_ko.md](./runbook-conventions_ko.md), [../09-roadmap/milestones-and-phases_ko.md](../09-roadmap/milestones-and-phases_ko.md), [../09-roadmap/dependency-graph_ko.md](../09-roadmap/dependency-graph_ko.md), [../05-radar-core/overview_ko.md](../05-radar-core/overview_ko.md), [../_meta/PRODUCT-BRIEF_ko.md](../_meta/PRODUCT-BRIEF_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적
이 문서는 CAW-05 runbook들의 **실행 인덱스**로서, **독립형 조기 경보 레이더**(PRODUCT-BRIEF §1)를 구축하기 위해 AI 빌더가 실행하는 빌드 지침입니다. runbook이 무엇인지, runbook들이 실행되는 순서/게이트, 각 phase 폴더를 해당 runbook들에 매핑하는 phase 표, **Milestone-1 체인**, 그리고 트리를 재개 가능(resumable) 상태로 유지하는 **예산 규율(budget discipline)**을 기술합니다. 컴포넌트 내부 동작은 다시 설명하지 않습니다 — 그것은 [../05-radar-core/](../05-radar-core/)와 [../01-decisions/](../01-decisions/)의 ADR들에 있습니다. 엄격한 runbook 형식이나 빌더 규칙도 다시 설명하지 않습니다 — 그것은 모든 빌더가 가장 먼저 읽어야 하는 [./runbook-conventions_ko.md](./runbook-conventions_ko.md)에 있습니다.

## 이 runbook들이란 무엇인가
- 각 runbook(`RB-XXX-*.md`)은 `Do:`/`Verify:` 단계를 가진 **하나의 응집된 원자적(atomic) 빌드 단위**이며, AI 빌더가 위에서 아래로 실행합니다. 내부의 코드는 **빌드 가이드일 뿐**(skeleton/시그니처/config)이고, 실제 코드는 빌더가 작성합니다.
- runbook은 설계를 **구현**할 뿐, 설계를 결정하지 않습니다. 모든 runbook은 자신이 구현하는 ADR(들)과 `05-radar-core/` 문서로 다시 링크됩니다. runbook과 설계가 충돌하면 설계가 우선하고, 설계와 brief가 충돌하면 **brief가 우선**합니다(PRODUCT-BRIEF §0).
- runbook은 **재개 가능(resumable)**합니다: 각 runbook은 Acceptance 체크포인트에서 트리를 green(컴파일·lint·테스트 통과) 상태로 남겨, 중단된 빌드가 깔끔하게 재개되도록 합니다(FILES-AS-TRUTH, ADR-0006).

## 실행 순서 & 게이트
1. **먼저 읽을 것:** [./runbook-conventions_ko.md](./runbook-conventions_ko.md) (엄격한 형식 + CAW-05 빌더 규칙).
2. 파일 순서가 아니라 **DAG를 따르세요**. 빌드 순서는 [../09-roadmap/dependency-graph_ko.md](../09-roadmap/dependency-graph_ko.md)의 불변식(invariant)으로 고정되어 있습니다:
   - Ports + store가 adapters **보다 먼저**.
   - Interest 모델 + sources가 relevance **보다 먼저**.
   - Classify가 route/export **보다 먼저**.
   - Ledger가 novelty-export 강화 **보다 먼저**.
   - 단일 ExportAdapter port를 통하지 않는 export는 없음(공유 store 없음).
3. **Phase 게이트:** [../09-roadmap/milestones-and-phases_ko.md](../09-roadmap/milestones-and-phases_ko.md)에서 이전 phase의 종료 게이트가 충족되기 전에는 다음 phase를 시작하지 마세요. runbook은 자신의 `Depends on:` 목록에 있는 모든 runbook이 Acceptance를 통과할 때까지 `blocked` 상태입니다.
4. **Phase 내부에서:** `Depends on:`이 달리 명시하지 않는 한 runbook들은 `RB-XXX` 오름차순으로 실행됩니다. 두 개의 P1 트랙(interest 모델, source adapters)은 **relevance 이전에 합류하는 독립적인 병렬 트랙**으로 실행됩니다.

## Phase 표
여기의 phase 폴더들은 로드맵 phase(P0–P7)를 다섯 개의 빌드 스테이지로 묶습니다. runbook 번호는 `RB-0XX` = 스테이지 0, `RB-1XX` = 스테이지 1과 같은 방식을 따릅니다(DOC-CONVENTIONS §6).

| Stage | Folder | Roadmap phases | Theme | Key runbooks (planned) |
|-------|--------|----------------|-------|------------------------|
| 0 | [`phase-0-foundations/`](./phase-0-foundations/) | P0 | Repo, 파이프라인 코어(하나의 Run), 3개의 얇은 표면(surface), 문서화된 stub으로서의 ALL ports, FILES-AS-TRUTH store + SQLite 인덱스 | RB-001 repo+toolchain; RB-002 Run 파이프라인 skeleton (ingest→…→export no-op); RB-003 ports + 문서화된 stubs; RB-004 FILES store + SQLite 인덱스; RB-005 CLI + MCP + 스케줄 표면이 코어에 도달 |
| 1 | [`phase-1-ingestion/`](./phase-1-ingestion/) | P1 | 타입화된 interest 모델(watch list로부터 시드됨) + v1 SourceAdapters + cursors + CORE 내의 다층 dedup | RB-101 `interests.yaml` 타입화/계층화/버전화; RB-102 SourceAdapter 계약 + cursors; RB-103 arXiv; RB-104 Semantic Scholar; RB-105 GitHub; RB-106 curated blog RSS; RB-107 HN-light; RB-108 dedup-in-core + 증분 재실행 |
| 2 | [`phase-2-relevance-and-classify/`](./phase-2-relevance-and-classify/) | P2 + P3 | recall 하한(floor)을 갖춘 BM25-first 가산적(additive) **설명 가능(explainable)** relevance; LF→LLM→human 캐스케이드를 통한 2축 분류; selective-review abstain→human gate; config 기반 라우팅 | RB-201 BM25 인덱스 + 가산 점수 + recall 하한; RB-202 점수 분해(score-breakdown) 설명; RB-203 LF 단계; RB-204 LLM 단계 + abstain; RB-205 human-review 큐(selective review); RB-206 config 기반 라우팅; RB-207 rationale store(non-evidence) |
| 3 | [`phase-3-ledger-and-synthesis/`](./phase-3-ledger-and-synthesis/) | P4 + P5 | FormatRenderer(digest 우선); append-only related-work ledger + Semantic Scholar 검증 + provenance가 완전한 LedgerLink | RB-301 FormatRenderer port + digest; RB-302 stub 포맷(memo/slide/card/brief) NotImplemented; RB-303 append-only `ledger/*.jsonl`; RB-304 S2 검증(Levenshtein title + year±1 + dedup); RB-305 LedgerLink provenance 레코드 |
| 4 | [`phase-4-export-and-schedule/`](./phase-4-export-and-schedule/) | P4 (M1 export) + P6 + P7 | ExportAdapter seam; CAW-03 novelty export (M1); CAW-02/01/06 exports; cron 스케줄링 강화 | RB-401 ExportAdapter 계약 + signing; RB-402 CAW-03 novelty bundle (M1); RB-403 cron 주간 Run; RB-404 CAW-02 Source/Claim/RelatedWork; RB-405 CAW-01/06 open questions; RB-406 retries/backoff/resumable cursors |

> 정확한 runbook 분할은 각 폴더 내부에서 다듬어질 수 있지만, **위의 DAG 순서와 phase 게이트는 고정되어 있습니다**.

## Milestone-1 체인 (어려운 수직 슬라이스)
M1 = 좁은 주간 레이더의 엔드투엔드: **watch-list sources fetch → relevance → classify → digest**, 그리고 **≥1개의 novelty-threat가 CAW-03으로 export**됨(milestones 문서, North star). 정확히 이 임계 경로(critical path)를 먼저 구축하고 폭(breadth)은 미루세요:

```
RB-001..005  (stage 0: core + surfaces + ports + store, green no-op Run)
      │
      ├── RB-101 interests.yaml (watch list seed)  ┐
      │                                            ├─ join
      └── RB-102..108 watch-list SourceAdapters    ┘  (arXiv/S2/GitHub/RSS/HN-light + dedup in core)
                          │
                   RB-201..202  relevance (BM25-first, additive, recall floor + explanation)
                          │
                   RB-203..207  classify (LF→LLM→human, abstain→human) + config routing
                          │
                   RB-301       digest (FormatRenderer)
                          │
                   RB-401..402  ExportAdapter + CAW-03 novelty bundle (pulled forward from P5, minimal)
                          │
                   RB-403       weekly cron Run
                          ▼
                   ★ MILESTONE 1 ★  weekly digest + 1 novelty-threat → CAW-03
```

M1에는 **최소한의** CAW-03 export seam만 앞당겨 포함됩니다; 완전한 ledger 검증 + signing은 M2입니다(스테이지 3 RB-303..305 + 스테이지 4 강화). [../09-roadmap/dependency-graph_ko.md](../09-roadmap/dependency-graph_ko.md)의 "Critical path to M1"을 참고하세요.

## 예산 규율 (Budget discipline)
- **넓은 스캐폴딩보다 얇은 수직 슬라이스**(PRODUCT-BRIEF §12). sources, 포맷, export 대상을 넓히기 전에 M1 체인을 엔드투엔드로 구축하세요. 빌드 예산 중단이 레이더를 파이프라인 중간에 좌초시켜서는 절대 안 됩니다.
- 모든 Acceptance 체크포인트에서 **트리를 green 상태로 남기세요**. 그래야 중단된 빌드가 메모리가 아니라 파일에서 재개됩니다.
- **stub은 지금 비용이 들지 않습니다:** 비-v1 sources(Reddit, SEC/EDGAR, newsletters), 4개의 비-digest 포맷, 그리고 비-CAW-03 export들은 자신의 port 뒤에서 **문서화된 `NotImplemented` stub**으로 출하됩니다 — 연결되고, 목록화되고, 비활성화됨.
- **폭보다 recall:** 더 많은 sources를 커버하는 데가 아니라, 좁은 watch list에서 가까운 연구를 놓치지 않는 데 예산을 쓰세요(가까운 논문 하나를 놓치는 것이 실존적 위험입니다, PRODUCT-BRIEF §1).
- **LLM 지출은 게이트됩니다:** 분류 캐스케이드는 값싼 LF를 먼저 실행하고 LLM 단계로만 에스컬레이션한 뒤, 신뢰도가 낮으면 human 큐로 abstain합니다 — 결정을 강제하려고 LLM 예산을 태우지 마세요(ADR-0004).

## 인계 (Hand-off)
여기서 시작하는 빌더는 다음을 해야 합니다: (1) [./runbook-conventions_ko.md](./runbook-conventions_ko.md)를 읽기; (2) [../09-roadmap/milestones-and-phases_ko.md](../09-roadmap/milestones-and-phases_ko.md)에서 이전 phase의 종료 게이트를 확인; (3) 현재 phase 폴더에서 가장 낮은 번호의 `ready` runbook을 열어 단계별로 실행.
