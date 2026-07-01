# CAW-03 시작점(Starting Point) 아키텍처 결정 보고서

> 다각도(7개 discovery 각도) OSS 리서치 → 후보 61개 발굴 → 60개 적대적 검증(자체호스팅·라이선스·유지보수·8-레이어 실제 커버리지) → 종합. self-host + OSS + fit 필터.

## 1. 결론 (TL;DR)

**권장 primary foundation = 오케스트레이션 플랫폼을 채택하지 말고, Python 네이티브 hexagonal core를 직접 build 하라.** (`FastAPI` + `Pydantic v2` + `SQLite`/`SQLModel`)

이유는 냉정하다: dossier 최상위 fit인 Prefect(50)·Windmill(48)조차 Layer 1을 "primitive만 제공"하며, 실제로는 분산 data-pipeline 런타임이라 `single-user-ish / lightweight / file·SQLite / hexagonal` 제약을 정면으로 뒤집고 Postgres를 강요한다. Layer 1(config-driven adapter registry + capability preflight + 5 typed ports)은 어떤 OSS도 clean하게 맞지 않으며, 단일 사용자 규모에서는 typed Python 수백 줄이 어떤 플랫폼 채택보다 가볍고 아키텍처에 직결된다.

대신 spine은 직접 만들고, **각 port 뒤에 permissive·self-hostable·Python 친화 OSS 컴포넌트를 꽂는다:**

- **Spine (L1):** custom Python core. (durable gate가 정말 필요해지면 `LangGraph` **MIT core만** 옵션 — 단 server/Studio는 Elastic License라 금지)
- **Evidence 불변식 (L2):** ledger는 custom(SQLite), 하드 불변식/타이핑은 **CUE** (Apache-2.0)
- **Patent data (L3):** **patent-client-agents** (Apache-2.0, MCP+Python, 20+ office) + **PatentsView** bulk(CC BY 4.0). patentability·interlock 로직은 custom
- **Writing engine wrap (L4):** **PaperOrchestra**(기정) subprocess. 보조 엔진/포맷 provenance는 **Stencila**(Apache-2.0)·**Quarto**(MIT)
- **Novelty/Radar (L5):** **PaperQA2**(Apache-2.0, contradiction) + **OpenAlex/pyalex**(MIT client + CC0 data). ladder/portfolio는 custom
- **Confidentiality (L6):** custom(SQLite visibility + pure-function classifier); 매트릭스가 커지면 **Casbin**(pycasbin, Apache-2.0, in-process)
- **Surfaces (L8):** `FastAPI` + **Python MCP SDK** + `Typer`. MCP 표면 패턴은 **gpt-researcher**의 `gptr-mcp` 참고

핵심 원칙 하나: **어떤 text-generation 도구(PaperOrchestra/STORM/opendraft/AI-Scientist 등)도 spine이 될 수 없다.** 이들은 전부 WritingEngine port 뒤에 숨는 leaf adapter다.

---

## 2. 레이어별 매핑 표

| # | CAW-03 Layer | Best OSS pick | License | 근거 |
|---|---|---|---|---|
| 1 | Harness core / ports-adapters | **custom-build** (FastAPI + Pydantic v2 + SQLite/SQLModel). *opt:* LangGraph MIT core | — / MIT | OSS 무적합. Prefect/Windmill/Temporal/Kestra/Dagster는 Postgres·분산 런타임으로 hexagonal·SQLite 제약을 뒤집음. Registry/preflight/5 typed ports는 domain code |
| 2 | Evidence gate + claim ledger | ledger = **custom**(SQLite state machine + provenance graph); 불변식 = **CUE** | — / Apache-2.0 | ledger·chain은 stateful/graph라 custom 필수. CUE는 `P1/P2/P3` disjunction 타이핑, `evidence.source=="generated_text"` unification 실패로 "generated text is never evidence"를 선언적으로 강제 |
| 3 | Patent path + interlock | prior-art data = **patent-client-agents** (+ **PatentsView** bulk, *opt* **python-epo-ops-client** EPO); patentability·default-deny interlock = **custom** | Apache-2.0 / CC BY 4.0 / Apache-2.0 | OSS는 raw prior-art data feed만 존재. patentability check·patent-first interlock은 도메인 로직으로 직접 build |
| 4 | Writing-engine wrap | **PaperOrchestra** (default, subprocess). 보조: **Stencila**, **Quarto**/**MyST** | Apache-2.0 / MIT | 이미 선택됨. Stencila는 node별 human-vs-LLM provenance로 L2 불변식 보강, Quarto/MyST는 executed-cell figure↔result provenance |
| 5 | Novelty + paper ladder | contradiction/novelty = **PaperQA2**; citation pool·radar = **OpenAlex/pyalex** (+ *opt* Semantic Scholar client); ladder/portfolio = **custom** | Apache-2.0 / MIT+CC0 | PaperQA2 ContraCrow가 novel-vs-threatened 신호. OpenAlex가 CC0 radar. P1/P2/P3 ladder·portfolio는 custom |
| 6 | Confidentiality filter | **custom** (SQLite visibility column + pure-fn tier classifier + public-safe export scrubber); *opt* **Casbin** | — / Apache-2.0 | 2-tier(public-safe vs counsel)는 소수 predicate. Casbin은 sidecar 없는 in-process 엔진이라 필요 시 유일하게 lightweight |
| 7 | Review gate before submission-ready | **custom** (score readout + blocked-claim backlog + gate state machine); *opt* Conftest/OPA를 assert step으로 | — / Apache-2.0 | OSS는 assert step만 제공(정책 substance 없음). single-user엔 plain code assertion이 더 단순 |
| 8 | Surfaces (API+MCP+CLI+UI) | **FastAPI** + **Python MCP SDK** + **Typer/Click** + 최소 UI(HTMX/Jinja 또는 소형 React). 참고: gpt-researcher `gptr-mcp` | MIT/Apache-2.0 | 단일 OSS가 4개 표면을 모두 주지 않음. 표준 Python 라이브러리로 조합 |

> "opt" = 요구가 커질 때만 도입하는 선택 컴포넌트. 초기 부트스트랩에는 custom + CUE + PaperOrchestra + PaperQA2/OpenAlex + patent-client-agents만으로 충분.

---

## 3. 왜 이 조합인가 / 대안 대비 (spine 선택 head-to-head)

Layer 1 spine 후보는 실질적으로 3개다.

### A. Custom Python core ⭐ (권장)
- **장점:** hexagonal `core depends only on ports`를 문자 그대로 구현. SQLite 단일 파일, 무-데몬, PaperOrchestra subprocess와 동일 런타임(Python). 5 typed ports·capability preflight·adapter registry를 도메인 그대로 표현. 의존성 표면 최소.
- **단점:** durable execution/체크포인트를 직접 짜야 함 — 단, single-user gate workflow에서는 SQLite 트랜잭션 + 상태 컬럼으로 충분(분산 durability 불필요).
- **판정:** governance가 CAW-03의 존재 이유이고 그 로직(L2~L7)은 어차피 100% custom이다. spine까지 custom이면 vendor-shaped 코드가 0, 통합세(integration tax)가 0.

### B. Prefect (dossier fit 50, 최고점)
- **장점:** 진짜 workflow 런타임, Apache-2.0, 자체 self-host, pause/resume·approval을 gate로 활용 가능, REST+UI+CLI.
- **단점:** server+worker+work-pool+event backend = 분산 시스템. "lightweight single-user"에 과잉. Blocks는 credential 저장이지 typed capability port가 아님 → 결국 ports layer는 직접 작성. 동시성 시 Postgres로 유도. MCP 없음. UI는 run/observability 중심이지 claim-review 표면이 아님. **governance 커버리지 0.**
- **판정:** Prefect를 채택해도 L2~L8은 그대로 남고, 대신 clean hexagonal이 Prefect의 flow/task/Block 관용구로 굽는다. spine이 아니라, 훗날 무거운 스케줄링이 필요하면 WritingEngine subprocess 오케스트레이션 adapter로 port 뒤에 두는 정도.

### C. LangGraph (MIT core)
- **장점:** Python 네이티브, SQLite 체크포인트, human-in-the-loop interrupt가 evidence/patent gate에 자연 매핑. spine 자재로는 A와 B 사이.
- **단점:** server/API(`langgraph-api`)와 Studio는 **Elastic License 2.0** + 상용 키 + `beacon.langchain.com` phone-home → L8 표면을 여기 얹으면 self-host/permissive가 깨진다. 무거운 LangChain 전이 의존성. shared-state graph가 5 typed ports와 impedance mismatch 위험.
- **판정:** spine 전체로 쓰지 말 것. durable gate state machine이 꼭 필요할 때 **MIT core만** 내부 컴포넌트로. 표면(API/MCP/CLI/UI)은 절대 LangGraph server 경로로 만들지 말 것.

**결론:** A(custom) 채택. B/C는 "1개 레이어(L1)만 대체하고 governance는 그대로 남기며 아키텍처 무게중심을 뒤집는" 거래라 single-user·SQLite·hexagonal 목표에 역행. Windmill(48)은 여기에 더해 AGPLv3 network-copyleft + Postgres 강제라 더 나쁘다.

---

## 4. OSS로 안 되는 부분 (build-from-scratch)

정직하게, **CAW-03의 차별적 가치 대부분은 OSS에 존재하지 않는다.** 반드시 직접 build:

1. **L1 Harness spine 전체** — adapter registry, capability preflight, 5 typed ports(Source/WritingEngine/PatentEngine/Sink/Novelty). OSS는 런타임 primitive만 준다.
2. **L2 authoritative claim ledger + provenance chain** — `claim→evidence→figure→result` stateful graph, P1/P2/P3 타이핑의 저장/조회, evidence-completeness gate. CUE는 *스냅샷 검증*만 하고 상태를 보관하지 않는다. eLabFTW/openBIS/lakeFS/DataLad/in-toto는 provenance *저장 substrate*일 뿐 gate·ledger가 아니며 대부분 AGPL·중량급.
   - **HARD 불변식 "generated text is NEVER evidence"** — CUE로 *선언*은 하되, ledger가 데이터를 먼저 올바르게 타이핑해야 성립한다. 진짜 보호는 우리가 쓰는 코드에 있다. PaperQA2 등 RAG 산출 prose는 반드시 firewall(underlying source ref만 취하고 생성 prose 폐기).
3. **L3 Patent 로직** — OSS는 prior-art *데이터*만 있다. **patentability check, patent claim drafting, patent-first interlock(default-deny)** 은 전부 custom. 특히 interlock은 online decision이 필요하므로 batch CLI(Conftest)로는 부족 — 코드 내 default-deny 술어로 구현.
4. **L5 paper ladder / portfolio planning / novel-vs-threatened decisioning** — PaperQA2/OpenAlex는 retrieval·contradiction *신호*만. P1/P2/P3 ladder·portfolio는 도메인 로직.
5. **L6 confidentiality tiering + public-safe export scrubber** — authz 엔진(OPA/Cerbos/OpenFGA/Casbin)은 *decide*만 하고 redaction/export scrub은 안 한다. 분류 로직과 leak-prevention export는 custom.
6. **L7 review checklist·score readout·blocked-claim backlog** — 순수 도메인 state machine.
7. **L8 표면 조합·최소 review/status UI** — 라이브러리는 있으나 harness 표면 자체는 직접 조립.

즉 OSS는 L4(엔진, 이미 선택) + L5·L3의 데이터 feed + L2 불변식 문법을 de-risk 할 뿐, **governance spine(L1·L2·L3·L6·L7)은 from-scratch**다. 이건 결함이 아니라 CAW-03이 존재하는 이유다.

---

## 5. 라이선스 / 리스크 주의

권장 pick은 전부 permissive(Apache-2.0 / MIT / CC0)로 정렬했다. 아래는 **피하거나 arm's-length로만** 다뤄야 하는 것들:

- **Elastic License 2.0 — LangGraph server/API/Studio:** MIT core는 OK, 그러나 표면 계층은 상용 키+phone-home. **L8을 여기 얹지 말 것.**
- **AGPL-3.0 (network copyleft):** Windmill(EE는 별도 상용) / eLabFTW / Chemotion / RSpace / Fidus Writer / Zotero 클라이언트. fork·embed하면 harness 전체가 오염. **쓰려면 별도 네트워크 서비스로 REST 호출만.** 우리 조합에서는 전부 제외.
- **GPL-3.0:** PatentsView **서버/ES 스택**(es-data-load 등)은 GPL-3.0 — 우리는 **데이터(CC BY 4.0)와 hosted/bulk만** 쓰고 GPL ingest 스택은 self-host하지 않는다. Conftest/OPA/Casbin은 Apache-2.0라 무관.
- **RAIL / non-permissive — AI-Scientist-v2:** field-of-use + AI-disclosure 의무. hard filter 실패 → **채택 불가**(코드 오염 위험).
- **CeCILL-B — Patent2Net:** 실제로는 permissive(BSD류)지만 non-SPDX라 컴플라이언스 툴이 NOASSERTION으로 오탐. 어차피 stale·EPO-only라 미채택.
- **운영 무게 리스크(라이선스 아님):** Prefect/Windmill/Temporal/Kestra/Dagster/InvenioRDM/Dataverse/lakeFS는 Postgres/OpenSearch/멀티서비스 → single-user·SQLite 목표와 충돌. 채택 시 아키텍처 반전.
- **외부 API 의존:** OpenAlex(2026-02부터 API key 필수)·Semantic Scholar·EPO OPS·PatentSearch는 network egress. confidentiality-sensitive harness이므로 이 어댑터들은 **egress firewall 뒤**에 두고, 내부/counsel-tier 데이터가 절대 이 경로로 나가지 않도록 L6 classifier로 차단.

우리 최종 조합의 라이선스: FastAPI/Typer(MIT), Pydantic(MIT), CUE(Apache-2.0), PaperQA2(Apache-2.0), pyalex(MIT)+OpenAlex(CC0), patent-client-agents(Apache-2.0), python-epo-ops-client(Apache-2.0), Casbin(Apache-2.0), Stencila(Apache-2.0), Quarto/MyST(MIT), Python MCP SDK(MIT). **AGPL/BSL/SSPL/non-commercial 0건.**

---

## 6. 다음 스텝 (부트스트랩)

1. **Spine skeleton 생성:** `caw03/` Python 패키지 — `ports/`(Source/WritingEngine/PatentEngine/Sink/Novelty 5개 Protocol), `adapters/`, `core/`(registry + capability preflight), `app.py`(FastAPI). SQLite는 `~/.caw03/caw03.db`, `SQLModel`로 모델링. "future" adapter는 문서화된 stub로 등록(preflight가 미구현 capability를 명시적으로 report).
2. **Claim ledger + provenance graph 스키마(L2):** SQLite 테이블 `claim(id, type∈{P1,P2,P3}, ...)`, `evidence(id, source, ...)`, `figure`, `result`, 그리고 edge 테이블로 `claim→evidence→figure→result` 체인. `evidence.source` enum에 `generated_text`를 포함시키되 draft 경로에서 거부.
3. **CUE 불변식 wire(L2):** `schema.cue`에 claim struct(≥1 evidence 참조 필수), `evidence.source != "generated_text"` unification 제약, P1/P2/P3 disjunction. ledger가 draft 준비 시 스냅샷을 export → `cue vet`을 subprocess로 preflight. **open struct 금지(`close()`)와 각 불변식에 대한 테스트를 반드시 작성**(dossier 경고: 무심코 통과하는 제약 위험).
4. **PaperOrchestra WritingEngine adapter(L4):** gated claim만으로 engine-neutral 입력(`idea.md`/`experimental_log.md`/figures) 조립 → subprocess 호출 → LaTeX/PDF·score 캡처, figure↔result provenance 보존. 기존 `agent-research-aggregator` 스킬을 입력 조립 단계에 재사용.
5. **Evidence gate + review gate(L2/L7):** draft·submission-ready 전이를 막는 pure-function gate(evidence-completeness + checklist + score readout + blocked-claim backlog). Conftest는 이 시점엔 도입하지 말고 plain assertion으로.
6. **Novelty/Radar adapter(L5):** `pip install paper-qa pyalex`; PaperQA2는 **local backend(Ollama + Sentence-Transformers)** 로 self-host 구성(OpenAI 기본값 제거), 출력에서 생성 prose를 버리고 source ref만 취하는 firewall wrapper 작성. OpenAlex를 primary radar/citation pool로.
7. **PatentEngine adapter(L3):** `patent-client-agents`(MCP+Python)로 prior-art search port 구현. patentability check와 **default-deny interlock**(patent-sensitive claim은 patent gate clear 전 publish 차단)을 core에 코드로. EPO 필요 시 `python-epo-ops-client` 추가.
8. **Confidentiality(L6):** claim/artifact에 `visibility∈{public_safe, internal_review}` 컬럼 + boundary×visibility pure-fn classifier + public-safe export scrubber. 외부 API 어댑터는 egress firewall 뒤로.
9. **Surfaces(L8):** FastAPI로 REST, `Typer`로 CLI, **Python MCP SDK**로 MCP server(패턴은 `gptr-mcp` 참고), 최소 review/status UI는 HTMX+Jinja 또는 소형 SPA. blocked-claim backlog·score를 UI 1차 시민으로.
10. **(옵션) durable gate 필요 시에만** LangGraph **MIT core**를 L1 내부 state machine으로 평가 — server/Studio 경로는 배제.

첫 이터레이션 목표: `custom spine + SQLite ledger + CUE 불변식 + PaperOrchestra wrap`으로 "gated claim → PDF" end-to-end 1건을 통과시키고, 그 위에 L3/L5/L6를 순차 부착.

---

### 부록: 검증된 상위 후보 (fit-sorted)

| 후보 | role | fit | self-host | license | 커버 레이어 | 한줄 |
|---|---|---|---|---|---|---|
| Prefect | strong-component | 50 | yes | Apache-2.0 | 1,7,8 | 진짜 워크플로우 런타임이나 governance 0, Postgres 유도 → spine 아님 |
| Windmill | strong-component | 48 | yes | AGPLv3(core) | 1,7,8 | AGPL+Postgres → 제외 |
| PaperQA2 | strong-component | 42 | yes | Apache-2.0 | 5 | contradiction+citation pool → Novelty port |
| Elsa Workflows | optional | 34 | yes | MIT | 1,8 | .NET 스택 미스매치 |
| CUE | strong-component | 34 | yes | Apache-2.0 | 2 | L2 불변식/타이핑 선언 |
| LangGraph | strong-component | 34 | partial | MIT(core)/EL2(server) | 1 | MIT core만, server 금지 |
| Temporal | optional | 33 | yes | MIT | 1,8 | 분산 durability 과잉 |
| Conftest | optional | 33 | yes | Apache-2.0 | 7 | batch assert step만, interlock엔 부족 |
