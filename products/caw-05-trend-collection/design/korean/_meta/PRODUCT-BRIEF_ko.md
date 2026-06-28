# PRODUCT BRIEF — 주기적 트렌드 수집 및 종합 / 조기 경보 레이더 (CAW-05)

> **CAW-05**의 단일 진실 공급원(single source of truth). 모든 설계 문서 + runbook은 이 brief와 일관성을 유지해야 합니다.
> 문서가 brief와 충돌하면, brief가 우선합니다. 미지의 사항은 `08-research-plan/open-questions.md`에 기록하세요.

## 0. 단 하나의 엄격한 제약

우리는 여기서 제품을 빌드하지 않습니다. 우리는 AI 빌더가 실행할 상세 설계 + 빌드 지침(runbook)을 작성합니다 — 구체적인 기능, 방법론, 명명된 도구, 도구별 runbook. 코드는 빌더가 작성합니다.

## 1. 정체성 및 독립성

- **제품:** 주기적 트렌드 수집 및 종합 (CAW-05) — **조기 경보(early-warning) 레이더**.
- **한 줄 소개:** Jimmy와 팀의 interest에 따라 AI 논문/기사/증권 리포트(securities reports)/커뮤니티 트렌드를 자동으로 수집하고, 각 finding을 **classify**하며, 읽기 쉬운 출력으로 **synthesize**합니다 — novelty / related-work / future-workload-axis 조기 경보 레이더 역할을 합니다.
- 6개로 구성된 `ai-workbench` 제품군 내의 **독립적이고 자립적인 제품(standalone product)**. 자체 core, data, deploy를 갖습니다. **공유 런타임 기반(shared runtime substrate)이 없습니다.** **public source**를 수집(ingest)하고, 명시적 경계를 넘어 다른 제품으로 신호(signal)를 **export**합니다.
- **역할 (단순 지원이 아님):** 이것은 **novelty를 보호하는 레이더**입니다. 가까운 논문/시스템 하나를 놓치면 전체 control-plane / 논문 전략의 novelty가 사라질 수 있습니다. 좁은(narrow) watch list에서의 높은 recall이 중요합니다.

## 2. 문제 및 가치

- **문제:** 관련 연구(논문, repo, 리포트, thread)는 흩어져 있어 놓치기 쉽습니다. 가까운 결과를 놓치는 것은 실존적(existential) novelty 리스크이며, 느슨한 요약은 실행 가능하거나(actionable) 감사 가능(auditable)하지 않습니다.
- **가치 단위:** 하나의 **triage되고 종합된 finding** — 출처(provenance)를 갖춘 `source → signal → classification → routed output` — 이는 knowledge, task, experiment, open question, 또는 discard 중 하나가 됩니다.
- **왜 분리하는가:** 연속적인 다중 source 수집 + scheduling + triage + 다중 format 종합은 자체적인 법적/source 관심사를 갖는 독립 제품입니다.

## 3. 사용자 및 주요 유스케이스

- **페르소나:** Jimmy (interest 정의, digest 검토), 팀 (독자), AI 에이전트 (signal 소비).
- **주요 유스케이스:**
  1. 주간 **narrow radar** 실행 → 수집 → classify → **weekly digest** 생성.
  2. finding이 **novelty-threat**로 classify됨 → CAW-03(논문 novelty)로 라우팅 + 플래그됨.
  3. finding이 **Source/Claim**이 되어 CAW-02(knowledge)로 export됨.
  4. finding이 **open question**을 제기 → CAW-01 및/또는 CAW-06으로 라우팅됨.
  5. **interest** 업데이트 → 레이더가 재우선순위화함.
  6. finding을 여러 format으로 발행: memo, digest, slide outline, paper-card, action brief.

## 4. 제품 표면(surface)

- **주(primary):** **스케줄된 자동화 파이프라인** (cron 구동) + 이를 실행/검사하는 **CLI** 및 **MCP**.
- **출력:** 다중 format 종합 — **memo, digest, slide outline, paper-card, action brief** (markdown 우선).
- **부(secondary):** related-work ledger + digest의 선택적 읽기 뷰.
- 모든 surface 뒤에 하나의 제품 core; 공유 substrate 없음.

## 5. Core 도메인 (핵심)

- **Interest model:** Jimmy/팀의 interest를 어떻게 표현하고 업데이트하는가; relevance 랭킹을 구동함. **narrow radar watch list**(아래 §)로 시딩(seed)됨.
- **Source 수집(ingestion):** **source family**별로 플러그인 가능한 adapter (arXiv/conf 논문, lab 블로그, GitHub, HN/Reddit/forum, 증권 리포트, newsletter/media). 법적/ToS에 안전한 수집만 허용.
- **Classification / triage:** 각 finding을 **novelty-threat / support / adjacent / noise**, 그리고 **signal vs hype**로 classify; 그 다음 knowledge / task / experiment / open-question / discard로 **라우팅**.
- **Related-work ledger:** finding을 그것이 위협하거나 지지하는 claim/전략에 연결하는 감사 가능한 ledger.
- **Synthesis:** finding을 여러 출력 format으로 변환; 생성된 요약은 명확히 표시됨 (증거 아님).

## 6. Narrow radar watch list (seed; 첫 리서치 run에서 검증)

memory-centric DSE; memory device for LLM; DeepStack; Minsoo Rhu / MC-DLA / memory-wall 계열; MemOS; SECDA-DSE; TTT writeback / test-time compute memory traffic; Chakra / trace 기반 워크로드 모델링; LLM serving 시뮬레이션 & memory-hierarchy 시뮬레이션. *(광범위한 수집 전에 narrow + weekly로 시작.)*

## 7. Data

- CAW-05의 자체(OWN) store. 방향: markdown/JSON + 경량 index/ledger (제품군과 일관됨); 크게 가져온 아티팩트는 path로. 모든 항목은 출처(provenance, source origin/date/retrieval), `boundary`(public/internal), 신뢰도(trust), classification을 갖습니다. 구체 사항은 ADR에서 결정합니다.

## 8. Import / export 경계 (다른 독립 제품으로)

- **수집(Ingests):** public source (읽기 전용 외부).
- **Export:** **signal → CAW-02** (Source/Claim/RelatedWork로), **novelty signal → CAW-03**, **open question → CAW-01 및 CAW-06**. 모두 독립 제품 간의 명시적 file/API 경계 — 공유 store 없음.

## 9. 개방형 통합 인터페이스 (이음새를 설계하되, v1만 빌드)

source family + export target + scheduler가 재설계 없이 플러그인될 수 있도록 ports & adapters:

- **SourceAdapter** (source family별): v1 = arXiv/Semantic Scholar + RSS/blogs + GitHub; stub = HN/Reddit, 증권 리포트, newsletter, 내부 feed.
- **ExportAdapter:** v1 = CAW-02/CAW-03/CAW-01/CAW-06 export 번들; stub = 기타.
- **SchedulerAdapter:** v1 = cron; stub = 기타 scheduler.
- Config 구동 registry + 문서화된 stub (CAW-03/04와 동일한 패턴).

## 10. 내려야 할 결정 (각각 ADR을 가짐)

- 제품 surface (pipeline + CLI + MCP + scheduled) 및 출력 format.
- **Interest model** (표현 + 업데이트 + relevance 랭킹). ← 핵심(load-bearing)
- **Source adapter 및 수집** (source family; 법적/ToS 안전; dedup) + ports.
- **Classification / triage** (threat/support/adjacent/noise; signal vs hype; 라우팅).
- Related-work ledger + 출처(provenance).
- Storage + scheduling/automation.
- CAW-01/02/03/06으로의 export 경계.

## 11. 비목표 (v1)

- 광범위/전체 인터넷 트렌드 수집 (narrow weekly radar로 시작).
- 자율적 결정 — finding은 제안(proposal)일 뿐; Jimmy가 검토하고 라우팅함.
- paywall/ToS 위반 source 수집.
- knowledge repo(CAW-02)나 논문 harness(CAW-03)가 되는 것 — 그것들로 export함.
- v1에서의 무거운 ML relevance 모델 (단순하고 설명 가능한 랭킹으로 시작).

## 12. 가드레일(Guardrails) (모든 제품에 상속됨)

- public을 향한 출력에 회사 기밀 데이터 금지; 법적/ToS에 안전한 source만 수집.
- public-source 리서치를 내부 Samsung/SAIT claim과 절대 혼동하지 말 것.
- source, claim, evidence, 생성된 결론을 분리 유지; 생성된 요약은 증거가 아님.
- 광범위한 스캐폴딩보다 작은 수직 슬라이스(narrow weekly radar)를 선호.
- 자동 수집은 제안/업데이트 생성임; 전략적 결정의 검토자는 Jimmy임.
