# 페르소나 및 유스케이스 — CAW-05

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: 리뷰 시 설정)
- **Related:**
  - [vision.md](vision_ko.md)
  - [scope-and-non-goals.md](scope-and-non-goals_ko.md)
  - [../01-decisions/ADR-0002-interest-model.md](../01-decisions/ADR-0002-interest-model_ko.md)
  - [../01-decisions/ADR-0004-classification-and-triage.md](../01-decisions/ADR-0004-classification-and-triage_ko.md)
  - [../01-decisions/ADR-0007-export-boundaries.md](../01-decisions/ADR-0007-export-boundaries_ko.md)
- **Source of truth:** [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF_ko.md)

## 목적
이 문서는 **누가 CAW-05를 사용하는지**, 그리고 좁은 범위의 주간 레이더가 충족해야 하는 **여섯 가지 유스케이스**(brief §3)를 명명한다. 각 유스케이스는 §2의 가치 단위 — `source → signal → classification → routed output` — 를 구체적으로 따라가는 경로다. 이 문서는 UI, 프롬프트, 스키마를 명세하지 **않는다**(그것들은 이 문서가 링크하는 ADR과 리서치 문서에 있다). 유스케이스는 runbook 수용 체크(acceptance check)를 유도할 수 있도록 구성되어 있다.

## 1. 페르소나

| 페르소나 | 역할 | 주요 surface | 필요한 것 | 강한 가드레일 |
|---|---|---|---|---|
| **Jimmy** | 소유자 / 큐레이터 / 리뷰어 | CLI + MCP + `interests.yaml` 편집 | interest 정의; 주간 레이더 실행; digest 리뷰; classification **확정/재정의(override)**; finding 라우팅 | 그는 모든 전략적 결정의 리뷰어다; finding은 제안(proposal)이다(brief §11) |
| **The team** | 독자 / 소비자 | 주간 digest + 그 밖에 산출되는 포맷 | 읽기 쉽고, 순서가 있고, 설명 가능한 digest; 각 finding의 *이유(why)*; 다중 포맷 출력(memo / slide / paper-card / action brief) | 외부 공개 출력에 기밀 데이터 없음; 생성된 요약은 not-evidence로 표시 |
| **AI agents** | 형제 제품(CAW-01/02/03/06)의 다운스트림 소비자 | `ExportAdapter` 파일 드롭 번들 | provenance가 완비되고, 서명되고, `evidence:false`로 태깅된 signal을 **자기 자신의** id 네임스페이스로, push가 아니라 pull로 수신 | 그들은 import 시 재분류한다; CAW-05는 그들의 store에 절대 쓰지 않는다; CAW-03의 gate로는 confirmed만 전달 |

참고: CAW-05 *내부*에서 동작하는 에이전트(예: 검증된 skill 액션으로 export를 호출)도 인간과 **동일한** 편집(redaction)/기밀성 체크를 거친다 — raw 우회는 없다(ADR-0007 §6).

## 2. 유스케이스

### UC-1 — 주간 레이더 → digest
**행위자:** Jimmy(실행), the team(읽기). **트리거:** 주간 cron 실행(또는 CLI/MCP를 통한 `run`).
**흐름:** 스케줄된 파이프라인이 하나의 `SourceAdapter` 뒤에 있는 v1 소스 집합(ADR-0003)에서 주간 윈도우를 수집(ingest)하고, 증분 cursor로 dedup하며(ADR-0006), `relevance_explain[]`을 산출하고 recall-first 하한선을 지키는 BM25-first 가산 스코어러로 각 finding을 채점하고(ADR-0002), LF→LLM→human 캐스케이드를 실행하며(ADR-0004), 확정된 finding을 **주간 digest**로 종합한다(markdown-first, ADR-0001).
**산출되는 가치:** 설명 가능한 relevance 순으로 정렬된, 트리아지된 finding의 digest. 각 항목은 *왜* 노출되었는지와 제안된 route를 보여준다. **수용 기준:** 해당 윈도우에서 watch list 관련 항목이 조용히 누락되지 않는다; 모든 항목은 LLM의 근거 이전에 사람이 읽을 수 있는 *이유*를 보여준다.

### UC-2 — novelty-threat → CAW-03
**행위자:** Jimmy(확정), CAW-03(pull). **트리거:** finding이 `novelty-threat`로 분류됨.
**흐름:** `novelty-threat`는 (높은 신뢰도에서도 — 비대칭 비용, ADR-0004) **항상** 인간 리뷰 대기열에 들어가며 절대 자동 폐기되지 않는다. Jimmy의 확정 시 라우팅 엔진이 routed signal을 산출하고, `ExportAdapter`가 확정된 `LedgerLink`를 WatchedTarget의 `foreign_ref`(CAW-03 네임스페이스)와 함께 `caw05-signal` 번들로 투영하여 파일 드롭 번들을 쓴다(ADR-0007). **산출되는 가치:** CAW-03이 자기 gate로 pull하는 **권고성(advisory)** novelty signal. **수용 기준:** 확정되고, 공개이며, verified-or-flagged된 링크만 CAW-03의 gate에 도달한다; 미리뷰 제안은 거부된다(negative test N3); CAW-05는 novelty가 사라졌다고 주장하지 않는다 — 근접한 결과 후보가 존재한다고만 말한다.

### UC-3 — finding → CAW-02 (knowledge)
**행위자:** Jimmy(확정), CAW-02(pull). **트리거:** finding이 `knowledge`로 라우팅됨.
**흐름:** 원장(ledger)이 Semantic Scholar로 논문을 검증하고(Levenshtein 제목 게이트 + year±1 + 다중 키 dedup, ADR-0005), 확정 시 `ExportAdapter`가 provenance가 담긴 Source/Claim/RelatedWork 링크, `evidence_locator`로 뒷받침되는 `extracted_claims`, 그리고 `kind=generated-summary`로 태깅된 `raw_summary`(evidence 필드에서 제외됨, ADR-0007)를 산출한다. **산출되는 가치:** CAW-02가 자기 지식 베이스로 큐레이션하는 Source/Claim. **수용 기준:** evidence 필드에 생성 요약이 없다(negative test N1); `canonical_key`가 우리 Source를 기존 Source와 dedup할 수 있게 한다.

### UC-4 — open question → CAW-01 및/또는 CAW-06
**행위자:** Jimmy(확정), CAW-01 / CAW-06(pull). **트리거:** finding이 open question을 제기함(종종 `novelty-threat`가 이 route도 함께 탄다; 하나의 finding은 여러 route를 탈 수 있다, ADR-0004).
**흐름:** 라우팅이 **action brief** 종합물을 생성하고(ADR-0001), `ExportAdapter`가 `evidence:false`를 단 종합 manifest를 담은 open-question 번들을 CAW-01(questions) 및/또는 CAW-06(future workload)으로 산출한다. 파일 드롭, 멱등적(idempotent)(ADR-0007). **산출되는 가치:** 형제 제품이 import하는 open question / workload 항목. **수용 기준:** 수신 제품이 재분류하며 prose를 evidence로 저장하지 않는다.
TODO(open-question: v1에서 `task`/`experiment` route가 export되는가, 아니면 CAW-01/06 컨트랙트가 확정될 때까지 digest에 남는가? — ADR-0004 / ADR-0007과 공유.)

### UC-5 — interest 갱신; 레이더가 재우선순위화
**행위자:** Jimmy. **트리거:** Jimmy가 `interests.yaml`을 편집하거나, `mark-feedback` op가 발화되거나, 제안이 승격(promote)됨.
**흐름:** 세 가지 인간 게이트 적용, 버전 관리 채널(ADR-0002): **직접 편집**(재컴파일, `version` 증가, 백로그 재랭킹), **feedback nudge**(`interest-feedback.jsonl`에 기록되는 경계 클램프된 weight step; interest를 생성/삭제하지 않음), **suggestion queue**(반복되는 토큰/저자를 `provenance: suggested`로 제안, 승격 전까지 비활성 — watch list의 조용한 증식 없음). `decay`는 cron 실행 시 적용된다. **산출되는 가치:** git으로 감사 가능한 변경 이력과 함께 재우선순위화된 이후 실행. **수용 기준:** 모든 interest 변경은 버전 관리되고 되돌릴 수 있다; 자동 증식되는 watch list 없음.

### UC-6 — finding을 여러 포맷으로 산출
**행위자:** Jimmy / the team / 에이전트. **트리거:** 확정된 finding이 digest 이외의 포맷을 필요로 함.
**흐름:** `FormatRenderer` 포트가 동일한 finding을 다섯 가지 markdown-first 포맷 중 하나로 렌더링한다 — **memo, digest, slide outline, paper-card, action brief**(ADR-0001). **paper-card**는 CAW-02 + CAW-03으로 들어가고, **action brief**는 CAW-01/CAW-06으로 들어간다(ADR-0007 §6). 모두 근거를 `evidence:false`로 단 종합 manifest를 담는다. **산출되는 가치:** finding을 재유도하지 않고 청중에 맞는 올바른 산출물. **수용 기준:** 모든 포맷이 동일한 provenance + `evidence:false` 마커를 렌더링한다; 어떤 포맷도 외부 공개 출력에 기밀 데이터를 누출하지 않는다.

## 3. 페르소나 × 유스케이스 커버리지

| 유스케이스 | Jimmy | Team | AI agents |
|---|---|---|---|
| UC-1 주간 레이더 → digest | 실행 + 리뷰 | 읽기 | — |
| UC-2 novelty-threat → CAW-03 | 확정 | 읽기 | pull |
| UC-3 finding → CAW-02 | 확정 | 읽기 | pull |
| UC-4 open-question → CAW-01/06 | 확정 | 읽기 | pull |
| UC-5 interest 갱신 | 편집 / 큐레이션 | — | — |
| UC-6 다중 포맷 산출 | 요청 | 읽기 | pull / 요청 |

## Open Questions
- TODO(open-question: `task`/`experiment` route(UC-4)가 v1에서 어디로든 export되는가, 아니면 digest에 남는가?)
- TODO(open-question: v1에서 the team이 ledger + digest에 대해 받는 최소한의 읽기 뷰는 무엇인가 — brief §4 보조 surface?)
- [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) 참조.

## runbook에 대한 함의
- 각 유스케이스는 하나의 수용 시나리오에 대응된다: UC-2/3/4용 runbook은 해당 경계에 대해 ADR-0007 negative test(N1–N6)를 포함해야 한다.
- CLI/MCP runbook은 이 유스케이스들이 필요로 하는 op를 노출해야 한다: `run`, 리뷰/`confirm`/`override`, `export`, `mark-feedback`, 그리고 UC-6를 위한 포맷 선택.
