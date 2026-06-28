# 범위 및 비목표(Non-Goals) — CAW-05 v1

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: 리뷰 시 설정)
- **Related:**
  - [vision.md](vision_ko.md)
  - [personas-and-use-cases.md](personas-and-use-cases_ko.md)
  - [../01-decisions/ADR-0002-interest-model.md](../01-decisions/ADR-0002-interest-model_ko.md)
  - [../01-decisions/ADR-0004-classification-and-triage.md](../01-decisions/ADR-0004-classification-and-triage_ko.md)
  - [../01-decisions/ADR-0007-export-boundaries.md](../01-decisions/ADR-0007-export-boundaries_ko.md)
- **Source of truth:** [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF_ko.md)

## 목적
이 문서는 **v1의 경계**를 긋는다: 좁은 범위의 주간 레이더가 무엇을 *실제로 만드는지*, 무엇을 의도적으로 *만들지 않는지*, 그리고 어디서 끝나고 형제 제품이 시작되는지. 이것은 리뷰어가 scope creep을 거부할 때 사용하는 컨트랙트다. 이 문서는 설계 결정을 내리지 **않는다** — 그것을 내리는 ADR을 가리킨다 — 그리고 brief와 절대 모순되지 않는다(충돌 시 brief §11이 우선한다).

## 1. 범위 내(v1 — 좁은 범위의 주간 레이더)

| # | 범위 내 | 실현 주체 |
|---|---|---|
| S1 | §6 watch list에서 시드된, 큐레이션된 타입 지정 **interest 아티팩트**(`interests.yaml`), 인간 게이트 적용 버전 관리 갱신 | ADR-0002 |
| S2 | 학술 가중 v1 소스 집합으로부터의 **스케줄된 주간 수집(ingestion)**(cron): arXiv + Semantic Scholar + GitHub + 큐레이션된 blog RSS + HN-light, 하나의 `SourceAdapter` 포트 뒤에서 | ADR-0003 / ADR-0006 |
| S3 | 증분 cursor(date/ETag 워터마크) + 실행 간 다층 **dedup**, 코어 내에서 | ADR-0003 / ADR-0006 |
| S4 | recall-first 하한선을 갖춘 **BM25-first 가산 설명 가능** relevance 스코어링; embedding lane은 배선되었으나 기본 off | ADR-0002 |
| S5 | LF→LLM→human 캐스케이드를 통한 **2축 classification**(novelty-threat/support/adjacent/noise × signal/hype); recall 편향 selective review | ADR-0004 |
| S6 | `narrow-radar-weekly` 프로파일을 통한 knowledge / task / experiment / open-question / discard로의 **config 기반 라우팅** | ADR-0004 |
| S7 | Semantic Scholar 검증을 갖춘 append-only **related-work ledger**; provenance 완비 `LedgerLink` | ADR-0005 |
| S8 | `FormatRenderer` 포트 뒤의 **다섯 가지 markdown-first 출력 포맷**: memo, digest, slide outline, paper-card, action brief(v1 강조점: 주간 **digest**) | ADR-0001 |
| S9 | 하나의 파이프라인 코어 위의 **세 개의 얇은 surface**: 스케줄된 파이프라인 + CLI + MCP | ADR-0001 |
| S10 | `ExportAdapter` 파일 드롭 포트를 통한 CAW-02 / CAW-03 / CAW-01 / CAW-06으로의 **export 번들**; 서명됨; 멱등적 | ADR-0007 |
| S11 | **Files-as-truth** 자체 store(`interests.yaml` + `findings/*.json` + `ledger/*.jsonl`) + SQLite 인덱스/ledger-cache | ADR-0006 |
| S12 | 유예된 소스 패밀리, export 타깃, 스케줄러를 위한 **문서화된 stub**(config 기반 레지스트리) | ADR-0003 / ADR-0007 |

## 2. 비목표(v1) — 그리고 대신 할 것

각 비목표는 brief §11/§12에서 나온다. 이를 나열하는 요점은 리뷰어에게 "아니오"라고 말할 명료한 근거를 주는 것이다.

| # | v1에 없음 | 이유 | 대신 할 것 |
|---|---|---|---|
| N1 | **광범위 / 전체 인터넷 트렌드 수집** | recall과 evidence 경계는 먼저 손으로 검증 가능한 목록 위에서 입증되어야 한다 | 좁은 범위의 주간 watch-list 레이더(§6)로 시작; 명시적 트리거가 있을 때만 확대 |
| N2 | **자율 결정** — 자동 확정, 자동 export, 자동 전략 편집 | novelty에 대한 잘못된 자율적 판단은 존립을 위협한다; 레이더는 조언하고 Jimmy가 결정한다 | finding은 **제안(proposal)**이다; export 전 인간 게이트 리뷰(ADR-0004, ADR-0007) |
| N3 | **유료 / ToS 위반 수집** | 법적/소스 안전성은 강한 가드레일이다(brief §12) | 공개, 법적/ToS 안전 소스만; 유료 패밀리는 문서화된 stub으로 유지(ADR-0003) |
| N4 | **knowledge repo가 되는 것**(그것은 CAW-02) | CAW-05는 signal을 생산하며, 큐레이션된 지식 베이스가 아니다 | 경계 너머 CAW-02로 Source/Claim/RelatedWork를 **export**(ADR-0007) |
| N5 | **paper / novelty 하니스가 되는 것**(그것은 CAW-03) | CAW-05는 권고성 novelty signal을 제기하며, novelty가 사라졌다고 절대 주장하지 않는다 | CAW-03의 gate로 권고성 novelty signal을 **export**(ADR-0007) |
| N6 | **무거운 ML relevance 모델** | v1은 단순 + 설명 가능 + 감사 가능해야 한다 | BM25-first 가산 스코어링; embedding lane은 `enable_embeddings` 뒤, 기본 off(ADR-0002) |
| N7 | **생성된 요약을 evidence로 취급** | prose를 evidence와 혼동하면 모든 소비자가 오염된다 | `rationale_note(evidence=false)`; `raw_summary`는 `kind=generated-summary`로 태깅, evidence 필드에서 제외(ADR-0004, ADR-0007) |
| N8 | **공유 런타임 기반 / 형제의 store에 쓰기** | 독립성은 구조적이다 | 파일 드롭 export 번들; 소비자가 **pull**한다(ADR-0007) |
| N9 | v1에서 **실시간 / 연속 스트리밍** | 이 슬라이스는 주간 + 한 번에 리뷰 가능 | 증분 cursor를 갖춘 cron 스케줄 주간 실행(ADR-0006) |

## 3. CAW-05와 그 형제들 사이의 경계선

CAW-05는 **`ExportAdapter` 파일 드롭 경계**에서 끝난다. 버전 관리된 `caw05-signal` 번들을 산출하고, 소비자가 **pull**하여 재분류한다. CAW-05는 소비자의 스키마를 절대 import하지 않으며 소비자의 store에 절대 쓰지 않는다(ADR-0007).

| 경계 | CAW-05가 산출 | 형제 제품(별개 제품)이 하는 일 |
|---|---|---|
| → **CAW-02**(knowledge) | provenance가 담긴 Source / Claim / RelatedWork 링크 | 자기 지식 베이스로 큐레이션; evidence 규칙 재강제 |
| → **CAW-03**(novelty) | **confirmed만** 보내는 권고성 novelty signal(`threat`/`support`/`neutral`) | 자기 novelty gate 실행; CAW-05는 평결을 절대 주장하지 않음 |
| → **CAW-01 / CAW-06** | open-question 번들(action brief에서) | open question / workload 항목으로 import |
| ← **인바운드** | 형제로부터 받는 것 없음 | CAW-05는 **공개 소스만** 수집(읽기 전용 외부) |

모든 경계에서 유지되는 규칙(ADR-0007 negative test N1–N6): evidence 필드에 생성 요약 없음; 공개 번들에 비공개 항목 없음; CAW-03의 gate로 미리뷰 제안 없음; 재시도는 no-op(멱등적); `noise` finding은 절대 export되지 않음; 빈 번들은 거부되며 조용히 산출되지 않음.

## 4. 범위 변경 프로토콜
§2의 어떤 항목도 다음을 통해서만 범위에 들어온다: (1) 명시적 재검토 트리거의 발화(예: ADR-0002의 "lexical v1이 watch-list 인접 작업을 측정 가능하게 놓친다"가 embedding lane을 활성화), 그리고 (2) 신규 또는 개정된 ADR. watch list 확대나 소스 패밀리 추가는 코어 재설계가 아니라 **config + stub 승격** 변경이다 — 그것이 ports-and-stubs 패턴의 핵심 취지다.

## Open Questions
- TODO(open-question: narrow-weekly에서 더 넓은/더 잦은 수집으로 확대하는 명시적 트리거.)
- TODO(open-question: v1에서 `task` / `experiment` route가 어디로든 export되는가, 아니면 CAW-01/CAW-06 컨트랙트가 확정될 때까지 digest에 남는가? — ADR-0004 / ADR-0007과 공유.)
- [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) 참조.

## runbook에 대한 함의
- 모든 runbook은 자신이 구현하는 범위 행(S1–S12)을 명시한다; 비목표(N1–N9)를 건드리는 runbook은 ADR이 나올 때까지 차단된다.
- Stub 소스 패밀리 / export 타깃은 레지스트리 항목을 갖춘 문서화된 stub으로 출시되며, 절반만 만든 코어로 출시되지 않는다.
