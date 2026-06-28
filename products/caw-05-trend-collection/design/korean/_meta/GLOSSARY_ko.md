# GLOSSARY — Ubiquitous Language (CAW-05)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on first review)
- **Related:** [PRODUCT-BRIEF](./PRODUCT-BRIEF_ko.md), [DOC-CONVENTIONS](./DOC-CONVENTIONS_ko.md), [ADR-0001](../01-decisions/ADR-0001-product-surface-and-outputs_ko.md), [ADR-0002](../01-decisions/ADR-0002-interest-model_ko.md), [ADR-0003](../01-decisions/ADR-0003-source-adapters-and-ingestion_ko.md), [ADR-0004](../01-decisions/ADR-0004-classification-and-triage_ko.md), [ADR-0005](../01-decisions/ADR-0005-related-work-ledger_ko.md), [ADR-0006](../01-decisions/ADR-0006-storage-and-scheduling_ko.md), [ADR-0007](../01-decisions/ADR-0007-export-boundaries_ko.md)
- **Source of truth:** ./PRODUCT-BRIEF.md

## Purpose
이 문서는 CAW-05 — 조기 경보 radar(레이더) — 의 **ubiquitous language(보편 언어)**를 고정합니다. 모든 설계 문서, ADR, runbook은 이 용어들을 여기 정의된 의미로 사용해야 합니다. 이것은 결정 기록이 아니라 사전입니다: 어떤 것도 재결정하지 않으며(결정은 ADR이 소유), 내부 사실·날짜·수치를 정의하지 않습니다. 어떤 용어의 정확한 값이 미확정인 경우 `TODO(open-question: ...)` 로 표시됩니다. 어떤 용어가 형제 문서에 등장하면, 그 문서는 재정의 대신 여기로 링크해야 합니다.

## 이 용어집을 읽는 방법
용어는 도메인 영역별로 묶여 있습니다. 각 항목은 한 줄짜리 정의를 제시한 뒤, 사용 일관성을 지키는 표준 규칙을 제시합니다. 제품 간 이름은 항상 "CAW-0X, a separate product"로 등장하며 — 공유 저장소로 등장하지 않습니다.

---

## 1. 제품 정체성 및 경계

| Term | Definition |
| --- | --- |
| **CAW-05** | 이 제품: Periodic Trend Collection & Synthesis(주기적 트렌드 수집 및 종합), 조기 경보 **radar**. 독립적이고 standalone이며, 자체 core/data/deploy를 가짐. |
| **Radar** | 제품의 역할 은유: 공개 소스를 스캔하여 **novelty(독창성)를 보호**함 — 가까운 논문/시스템 하나를 놓치면 전체 전략의 novelty가 사라질 수 있음. narrow한 watch list에서의 **high recall(높은 재현율)**을 함의함. |
| **CAW-0X** | `ai-workbench` 6개 제품군 중 임의의 형제 제품. 명시적 경계를 가로질러서만 참조됨. v1 export 대상: **CAW-02**(knowledge), **CAW-03**(paper novelty), **CAW-01** 및 **CAW-06**(open questions). |
| **Boundary** | 두 독립 제품 사이의 명시적인 파일/API 이음새(seam). CAW-05는 inbound 경계를 가로질러 공개 소스를 수집(읽기 전용)하고, outbound 경계를 가로질러 bundle을 export함. **공유 런타임 기반/저장소/레지스트리 없음.** |
| **Independence contract** | CAW-05의 core, data, surface가 그 자체의 것이며, 통합은 오직 port + 경계를 통해서만 일어난다는 규칙. |

---

## 2. Interest 모델 및 관련성 (ADR-0002)

| Term | Definition |
| --- | --- |
| **Interest** | 큐레이션된 interest 산출물 안의 타입이 지정된 단일 항목: keyword, topic, entity, author, venue 중 하나로, **tier**(우선순위 가중치)와 **polarity**(흥미 대 anti-interest)를 가짐. |
| **Interest artifact** | 작고, 큐레이션되고, **타입이 지정되고**, 사람이 작성한 Interest 집합(`interests.yaml`로 저장). 관련성을 구동함. 버전 관리되며, 변경은 **human-gated(사람 승인)**임. |
| **Watch list** | radar가 출발하는 narrow한 시드 Interest 집합(예: memory-centric DSE, MemOS, Chakra/trace-based workload modeling — PRODUCT-BRIEF §6 참조). v1 radar는 광범위 수집 이전에 **narrow + weekly**로 실행됨. |
| **Tier** | 관련성 점수에서 가중치로 사용되는, Interest의 거친 우선순위 대역. |
| **Polarity** | 어떤 Interest가 finding을 관련성 쪽으로 끌어당기는지 아니면 밀어내는지(anti-interest). |
| **Relevance score** | finding당 **가산적이고 설명 가능한** 점수: per-Interest 기여분의 합(BM25 term 일치, entity/author/venue 적중, tier 가중치, polarity). 모든 점수는 명명된 Interest로 귀속 가능함. |
| **BM25** | finding 텍스트(title/abstract/body)에 대한 **first-pass(1차)** 어휘 관련성 신호로 사용되는 랭킹 함수. "BM25-first" = 어휘 매칭이 기본 레인이고 ML은 opt-in. |
| **Recall-first floor** | high-tier watch-list Interest와 일치하는 finding은 **점수와 무관하게 리뷰 대상으로 보존**된다는 규칙 — watch list에서는 recall을 precision을 위해 결코 희생하지 않음. |
| **Embedding lane (alpha)** | BM25를 보강하는 OPTIONAL한 의미 유사도 레인으로, routing에 영향을 줄 수 있기 전에 라벨링된 eval 세트에서 **gated(검증 통과 필요)**됨. v1에서는 load-bearing이 아님. |
| **Interest version** | interest 산출물의 불변하고 human-gated된 리비전. finding은 어느 버전이 자신을 점수화했는지 기록함. |

---

## 3. Source 및 ingestion (ADR-0003)

| Term | Definition |
| --- | --- |
| **Source** | 외부의 **공개**, 법적/ToS 안전한 항목 출처(arXiv, Semantic Scholar, GitHub, 큐레이션된 blog RSS, HN-light). Source는 정확히 하나의 **SourceAdapter**를 통해 도달됨. |
| **Source family** | 접근 패턴을 공유하는 Source 부류(academic API, RSS, code host, forum). adapter는 family별로 작성됨. |
| **SourceAdapter** | Source family로부터 항목을 가져오는 단일 inbound **port**. v1 adapter: arXiv + Semantic Scholar, GitHub, RSS/blogs, HN-light. 문서화된 **stub**: Reddit, SEC/EDGAR, newsletter, internal feed. |
| **Item** | Finding이 되기 이전의 Source에서 가져온 원시 레코드(예: arXiv 항목 하나, RSS 글 하나, repo 하나). |
| **Cursor / watermark** | Source별 증분 fetch 위치(날짜 및/또는 ETag). 각 Run마다 adapter는 저장된 cursor보다 새로운 것만 가져오며, cursor는 Run 성공 후 전진함. |
| **Dedup** | **core**에서 일어나는 다층 중복 제거(adapter가 아님): Source/Run을 가로질러 동일한 작업을 합침(id, 정규화된 title, DOI/URL 키 기준). **verification**도 참조. |
| **Legal/ToS-safe** | 강제적인 ingestion 가드레일: 약관이 프로그램적 읽기 접근을 허용하는 소스만. paywall / ToS 위반 소스는 범위 밖. |

---

## 4. Finding, classification 및 triage (ADR-0004)

| Term | Definition |
| --- | --- |
| **Finding** | 중복 제거되고 점수화되어 radar 도메인으로 승격된 항목: `source → signal → classification → routed output` 에 provenance가 더해짐. 원자적인 **가치 단위**. |
| **Signal** | (1) Finding의 실체 — 추적되는 실제 paper/repo/post; (2) radar의 출력 의미: 관련성 floor를 넘은 관련 Finding(필터링된 noise와 대비). 맥락으로 모호함이 해소됨; 레코드에는 "Finding", export되는 것에는 "Signal"을 선호. |
| **Classification** | Finding을 **two-axis taxonomy(2축 분류 체계)**에 배정. Axis 1(relevance type): **novelty-threat / support / adjacent / noise**. Axis 2(quality): **signal vs hype**. |
| **novelty-threat** | 우리 전략/논문의 novelty를 약화시킬 수 있는 Finding — 최우선 클래스; CAW-03으로 라우팅됨. |
| **support** | 우리 방향을 강화하거나 그에 대한 증거를 제공하는 Finding. |
| **adjacent** | interest와 관련되지만 직접적으로 위협하거나 지지하지는 않는 Finding. |
| **noise** | 무관하다고 판단된 Finding; **discard**로 라우팅됨. |
| **signal vs hype** | quality 축: 실질적/신뢰성 있음(**signal**) 대 부풀려짐/실질 낮음(**hype**). |
| **Triage** | Finding을 분류하고 그 경로를 결정하는 end-to-end 행위. |
| **Cascade (LF→LLM→human)** | triage 파이프라인: 먼저 저렴한 결정론적 **labeling function (LF)**, 그다음 **LLM** 분류기, 그다음 gate가 표시한 것에 대해 **human**. |
| **Labeling function (LF)** | LLM 호출 이전에 후보 라벨을 저렴하게 내보내는 결정론적 규칙(keyword/venue/author/regex). |
| **Selective-review gate** | **recall 편향** gate: 분류기 confidence가 낮을 때 Finding이 자동 결정되는 대신 **abstain(기권) → human review로 라우팅**됨. watch list의 recall을 보호함. |
| **Routing** | 분류된 Finding을 정확히 하나의 목적지로 보내는 결정론적, **config 구동** 디스패치: **knowledge / task / experiment / open-question / discard**. |
| **knowledge / task / experiment / open-question / discard** | 다섯 가지 라우팅 목적지. `knowledge` → CAW-02 export; `open-question` → CAW-01/CAW-06 export; `task`/`experiment` → 내부 action 산출물; `discard` → 폐기(단, 감사를 위해 ledger에는 보존됨). |
| **Rationale** | classification에 첨부되는 생성된 설명. **Rationale은 결코 증거가 아님** — 결정을 설명할 뿐이며, 기저의 Source가 증거임. |

---

## 5. Related-work ledger (ADR-0005)

| Term | Definition |
| --- | --- |
| **Related-work ledger** | Finding/Signal을 그것이 위협하거나 지지하는 claim/strategy에 연결하는 **append-only(추가 전용)** 감사 가능 기록. `ledger/*.jsonl`로 저장. 감사 진실의 단일 공급원. |
| **WatchedTarget** | radar가 지키는 보호 대상 claim/strategy/paper-direction(예: novelty 주장). LedgerLink가 Finding을 WatchedTarget에 연결함. |
| **LedgerLink** | 하나의 Finding을 하나의 WatchedTarget에 연결하는 단일 **provenance-complete(출처 완전)** 감사 가능 기록으로, classification, relation(threatens/supports), provenance, verification record를 담음. |
| **Verification** | Finding이 실제로 존재하며 올바르게 식별된 작업을 가리키는지를 **Semantic Scholar**를 통해 확인: **Levenshtein** title 유사도 gate + **year ±1** 일치 + 다중 키 dedup. LedgerLink에 verification record를 생성함. |
| **Levenshtein** | verification 중 fuzzy title 매칭 gate로 사용되는 편집 거리 지표(임계값 `TODO(open-question: set match threshold)`). |
| **Verification record** | verification의 저장된 결과(matched paperId, title 유사도, year delta, decision)로 LedgerLink에 내장됨. |
| **Provenance** | Finding의 전체 출처 추적: Source origin, 검색 날짜/방법, cursor, interest-version, classifier-version. 모든 Finding과 LedgerLink에 필수. |

---

## 6. Synthesis 및 출력 형식 (ADR-0001)

| Term | Definition |
| --- | --- |
| **Synthesis** | Finding을 읽기 쉬운 **markdown-first** 출력으로 전환. 생성된 요약은 명확히 표시되며 **증거가 아님**. |
| **FormatRenderer** | 모든 출력 형식 뒤의 단일 **port**; 형식당 하나의 renderer가 config로 선택됨. |
| **Memo** | 하나 또는 소수 Finding에 대한 짧은 산문 작성물. |
| **Digest** | Run의 Finding을 모은 주된 주기적(weekly) 롤업 — radar의 핵심 산출물. |
| **Slide outline** | Finding을 프레젠테이션 구조로 렌더링한 것. |
| **Paper-card** | 논문별 압축 카드(title, venue, claim, WatchedTarget과의 relation)로 novelty 리뷰에 적합. |
| **Action brief** | 결정 지향 렌더링: 무엇이 바뀌었고, 왜 중요하며, 무엇을 해야 하는지. |

---

## 7. Surface, Run 및 storage (ADR-0001, ADR-0006)

| Term | Definition |
| --- | --- |
| **Run** | **pipeline core**의 한 번의 실행: fetch (cursors) → dedup → score → classify → route → synthesize → export. 동일한 core가 세 surface 모두를 뒷받침함. |
| **Pipeline core** | Run의 단일 공유 구현; surface는 얇음. |
| **Surface** | core에 대한 세 가지 얇은 진입점 중 하나: **scheduled pipeline**, **CLI**, **MCP** 서버. |
| **SchedulerAdapter** | 일정에 따라 Run을 트리거하는 **port**. v1 = **cron**; stub = 다른 scheduler들. |
| **ExportAdapter** | **export bundle**을 내보내는 단일 outbound **port**. v1 대상: CAW-02/CAW-03/CAW-01/CAW-06; stub = 그 외. 유일한 export 이음새. |
| **Export bundle** | 경계를 가로질러 형제 제품으로 내보내는 **서명된(signed)** Signal/record 패키지. 공유 저장소 없음 — bundle 자체가 통합임. |
| **Files-as-truth** | storage 원칙: markdown/JSON 파일이 권위 있는 진실; SQLite는 재구축 가능한 index/ledger-cache. 레이아웃: `interests.yaml` + `findings/*.json` + `ledger/*.jsonl`. |
| **Index** | 파일에 대한 SQLite **파생** index(search/dedup 가속); 결코 진실의 공급원이 아님. |
| **Port / Adapter** | port는 core의 안정적인 인터페이스이고, adapter는 구체적 구현. CAW-05의 port: SourceAdapter, ExportAdapter, SchedulerAdapter, FormatRenderer, classifier, routing. 모든 port는 v1 adapter + **문서화된 stub**을 함께 제공함. |
| **Stub** | 이음새를 구현하지 않고도 증명하는, 문서화·등록된 비기능 adapter 자리표시자. |

---

## 명명 규칙 (일관성 계약)
1. 모든 문서/runbook에서 이 정확한 용어들을 사용하고, 동의어를 지어내지 마세요.
2. **생성된 요약/rationale은 결코 증거가 아닙니다** — Source, Finding, classification, 생성된 텍스트를 구분된 상태로 유지하세요.
3. watch list에서 동점일 때는 **high recall**이 우선합니다(recall-first floor, selective-review gate).
4. **legal/ToS-safe** Source만 사용하고, 공개 연구를 내부 claim과 결코 혼동하지 마세요.
5. 제품 간은 경계 언어만 사용 — 공유 기반(substrate)을 결코 암시하지 마세요.

## Open Questions
- Levenshtein title-match 임계값과 `year ±1` 정확한 허용 범위 — TODO(open-question: see [08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md)).
- Relevance-score floor 값과 tier 가중치 — TODO(open-question).
- "Signal"을 형식적으로 구분되는 두 용어(record 대 export)로 나눠야 하는지 — TODO(open-question).

## Implications for runbooks
- runbook은 엔티티(Finding, LedgerLink, WatchedTarget, Run)와 port(SourceAdapter, ExportAdapter, SchedulerAdapter, FormatRenderer)를 이 정확한 이름으로 참조해야 합니다.
- runbook이나 ADR이 도입하는 새 용어는 같은 변경에서 반드시 여기에 추가되어야 합니다.
