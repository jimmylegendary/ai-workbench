# 비전 — CAW-05, novelty를 지키는 조기 경보 레이더

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: 리뷰 시 설정)
- **Related:**
  - [scope-and-non-goals.md](scope-and-non-goals_ko.md)
  - [personas-and-use-cases.md](personas-and-use-cases_ko.md)
  - [../01-decisions/ADR-0002-interest-model.md](../01-decisions/ADR-0002-interest-model_ko.md)
  - [../01-decisions/ADR-0004-classification-and-triage.md](../01-decisions/ADR-0004-classification-and-triage_ko.md)
  - [../01-decisions/ADR-0007-export-boundaries.md](../01-decisions/ADR-0007-export-boundaries_ko.md)
- **Source of truth:** [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF_ko.md)

## 목적
이 문서는 CAW-05의 **북극성(north star)**을 진술한다: 제품이 왜 존재하는지, 그 단일 가치 단위가 무엇인지, 그리고 첫 번째 수직 슬라이스가 어떤 모습인지. *전체* 제품을 틀 지어서 모든 ADR과 runbook이 하나의 의도에 비추어 점검될 수 있게 한다. 이 문서는 메커니즘을 결정하지 **않는다** — interest 모델(ADR-0002), classification/triage(ADR-0004), 소스(ADR-0003), ledger(ADR-0005), 저장/스케줄링(ADR-0006), export 경계(ADR-0007)가 그것들을 소유한다. 이 문서는 brief를 부연하며, 절대 재정의하지 않는다.

## 1. 북극성
CAW-05는 **독립적인 조기 경보 레이더**다: Jimmy와 the team의 interest에 따라 공개 AI 논문, repo, 기사, 커뮤니티 트렌드를 자동으로 수집하고, 각 finding을 **classify**하며, 읽기 쉽고 라우팅 가능한 출력으로 **synthesize**한다. 그것은 **novelty를 지키는 레이더**다 — 근접한 논문이나 시스템 하나를 놓치면 control-plane / paper 전략 전체의 novelty가 지워질 수 있다. 그 비대칭 비용이 이 제품의 존재 이유다: **놓친 근접 결과는 존립을 위협하는 리스크이고, 잘못된 경보는 값이 싸다.** 따라서 레이더는 **recall-first**다.

그것은 `ai-workbench` 패밀리의 여섯 제품 중 하나지만, 그중 어느 것과도 **런타임 기반을 공유하지 않는다**. **공개 소스만** 수집하고(읽기 전용, 법적/ToS 안전), 명시적 파일 경계를 가로질러 형제 제품으로 **signal을 export**한다 — 그들의 store를 읽거나 쓰지 않는다.

> 한 문장으로: *좁은 watch list 위의 모든 근접 결과를 노출하고, 왜 노출되었는지 설명하며, 행동해야 할 제품으로 라우팅하는 상시 감시병이 되어라 — novelty가 조용히 사라지기 전에.*

## 2. 가치 단위
제품의 원자는 **트리아지되고 종합된 하나의 finding**으로, provenance와 함께 끝에서 끝까지 운반된다:

```
source  →  signal  →  classification  →  routed output
(public)   (relevance,   (two-axis:        (knowledge | task |
            explained)    novelty-threat/   experiment |
                          support/adjacent/  open-question |
                          noise × signal/    discard)
                          hype)
```

finding은 네 단계를 모두 통과하여 다섯 disposition 중 정확히 하나(또는 여럿)에 안착하고, 각각이 완전한 provenance 흔적을 가질 때 *완료*된다. 라우팅되고 provenance가 완비된 finding에 못 미치는 것은 가치가 아니라 진행 중인 작업(work-in-progress)이다.

| 단계 | 산출물 | 소유 결정 |
|---|---|---|
| **Source** | origin/date/retrieval provenance + trust prior를 갖춘 dedup된 `RawFinding` | ADR-0003 |
| **Signal** | 가산적이고 **설명 가능한** relevance 점수 + `relevance_explain[]` + watch-list 히트 | ADR-0002 |
| **Classification** | 직교하는 두 축 + `rationale_note(evidence=false)` + 리뷰 상태 | ADR-0004 |
| **Routed output** | disposition + export 타깃 + 종합된 포맷 | ADR-0004 / ADR-0007 / ADR-0001 |

## 3. 세 가지 하중 지지(load-bearing) 불변식
이것들은 모든 surface, 프로파일, 릴리스에 걸쳐 유지된다. brief(§11/§12)에서 곧바로 나오며 이를 강제하는 ADR에서 재진술된다.

| 불변식 | 왜 타협 불가인가 | 강제 주체 |
|---|---|---|
| **watch list에서의 높은 recall** — watch-list 히트는 노출되며 절대 조용히 누락되지 않는다 | 잘못된 누락 = 놓친 novelty = 존립 위협 | ADR-0002 recall-first 하한선; ADR-0004 never-silent-discard |
| **생성된 요약은 evidence가 아니다** — 종합된 근거는 다운스트림 claim을 절대 뒷받침할 수 없다 | prose를 evidence와 혼동하면 모든 소비자가 오염된다 | ADR-0004 `evidence:false`; ADR-0007이 evidence 필드에서 `raw_summary` 제외 |
| **finding은 제안이다; Jimmy가 리뷰하고 라우팅한다** — 미리뷰 상태로는 아무것도 export되지 않는다 | 레이더는 조언하고, 인간이 전략을 결정한다 | ADR-0004 리뷰 게이트; ADR-0007이 CAW-03으로는 confirmed만 |

이들을 떠받치는 네 번째, 구조적 불변식: **독립성** — CAW-05의 코어, 데이터, surface는 그 자신의 것이다; 형제로는 오직 `ExportAdapter` 포트(ADR-0007)를 통해서만 건너가며, 공유 store를 통하지 않는다.

## 4. 왜 별개의 제품인가
연속적인 다중 소스 수집 + 스케줄링 + triage + 다중 포맷 종합은 자체의 법적/소스 제약을 가진 독자적인 관심사다. 이를 knowledge repo(CAW-02)나 paper 하니스(CAW-03)에 접어 넣으면 그들의 store가 시끄럽고 외부 공개되는 수집 surface에 결합되고 evidence 경계가 흐려진다. 독립형으로 유지하면 레이더는 recall 편향이며 공개 전용으로 남고, 그 소비자들은 precision 편향이며 큐레이션된 상태로 남는다.

## 5. 좁은 범위의 주간 레이더가 먼저
첫 산출물은 의도적으로 **좁고 주간**이며, 넓고 연속적이지 않다(brief §6, §11):

- **Watch list(시드):** memory-centric DSE; memory device for LLM; DeepStack; Minsoo Rhu / MC-DLA / memory-wall 라인; MemOS; SECDA-DSE; TTT writeback / test-time compute memory traffic; Chakra / trace-based workload modeling; LLM serving & memory-hierarchy simulation. *(첫 리서치 실행에서 검증하고 다듬을 것 — 이들은 jargon이 많은 고유명사로, ADR-0002에 따라 lexical/BM25 매칭이 우세하다.)*
- **주기:** 스케줄된 주간 실행 1회(cron), 한 번에 리뷰 가능.
- **출력:** 설명 가능한 relevance 순으로 정렬된, 트리아지된 finding의 **주간 digest**. 각 항목은 *왜* 노출되었는지와 제안된 route를 보여준다.

narrow-first는 한계가 아니라 전략이다: 범위를 넓히기 전에, 손으로 검증할 수 있을 만큼 작은 목록 위에서 recall, 설명 가능성, evidence 경계를 입증할 수 있게 한다.

## 6. 첫 번째 수직 슬라이스
네 가치 단계 전체를 관통하는 얇지만 완전한 경로 — 실제로 트리아지된 finding을 전달하는 가장 작은 것:

1. §6 watch list에서 `interests.yaml`을 **시드**(`recall_priority: high`) — ADR-0002.
2. 학술 가중 v1 소스 집합(arXiv + Semantic Scholar + GitHub + 큐레이션된 RSS + HN-light)으로부터 하나의 `SourceAdapter` 뒤에서 한 주간 윈도우를 **수집(ingest)**, 증분 cursor로 dedup — ADR-0003.
3. BM25-first 가산 스코어러로 각 finding을 **채점(score)**, `relevance_explain[]`을 산출하고 recall-first 하한선을 지킴 — ADR-0002.
4. LF→LLM→human 캐스케이드로 **classify & triage**; recall 편향 selective review; `narrow-radar-weekly` 프로파일로 라우팅 — ADR-0004.
5. 확정된 finding을 근거에 `evidence:false`를 단 채로 **주간 digest**(markdown-first)로 **종합(synthesize)** — ADR-0001.
6. `ExportAdapter` 파일 드롭 경계를 통해 최소한 하나의 확정된 `novelty-threat`를 CAW-03으로, 하나의 Source/Claim을 CAW-02로 **export** — ADR-0007.

완료 = provenance가 완비된 finding을 digest에 안착시키고 형제가 pull할 수 있는 서명된 번들을 산출하는 주간 실행 1회.

## 7. 성공의 모습(정성적, v1)
- 주간 윈도우의 watch-list 관련 논문이 digest에서 조용히 누락되지 않는다. *(Recall — 메트릭은 라벨링된 eval set에 대해 정의된다; 아직 수치는 주장하지 않음 — TODO(open-question).)*
- 노출된 모든 finding은 LLM 근거 이전에 사람이 읽을 수 있는 *이유*(명명된 term/저자/lane)를 보여준다.
- 어떤 export 번들의 evidence 필드에도 생성 요약이 절대 나타나지 않는다(ADR-0007 negative test N1).
- Jimmy가 CLI/MCP를 통해 한 주의 finding을 한 번에 실행, 검사, 라우팅할 수 있다.

## Open Questions
- TODO(open-question: 좁은 목록에 대해 "높은 recall"을 정의하는 라벨링된 eval set과 그것이 설정하는 목표치.)
- TODO(open-question: 좁은 범위의 주간 레이더에서 더 넓은/더 잦은 수집으로 언제 확대할 것인가 — 그 트리거.)
- [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) 참조.

## runbook에 대한 함의
- 첫 runbook 단계는 소스나 포맷에 걸친 넓이가 아니라, §6 수직 슬라이스를 끝에서 끝까지(seed → ingest → score → triage → digest → export 1건) 실현해야 한다.
- 모든 runbook 수용 체크는 §2 가치 단위와 §3 불변식에 비추어 표현 가능해야 한다.
