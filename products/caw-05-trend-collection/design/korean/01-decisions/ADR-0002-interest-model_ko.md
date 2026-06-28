# ADR-0002: Interest model — 큐레이션된 타입드 interest, BM25 우선 설명가능 relevance, human-gated 업데이트

- **Status:** proposed
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF_ko.md) (단일 진실 공급원)
  - [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS_ko.md)
  - [ADR-0001-product-surface-and-outputs_ko.md](ADR-0001-product-surface-and-outputs_ko.md) (`mark-feedback` 연산이 업데이트를 공급)
  - [ADR-0003-source-adapters-and-ingestion_ko.md](ADR-0003-source-adapters-and-ingestion_ko.md) (여기서 점수화되는 `RawFinding`들을 공급)
  - [ADR-0004-classification-and-triage_ko.md](ADR-0004-classification-and-triage_ko.md) (relevance score + recall floor를 소비)
  - [../02-research/interest-modeling_ko.md](../02-research/interest-modeling_ko.md) (스키마, 점수 공식, 업데이트 채널)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적(Purpose)
CAW-05의 **load-bearing 코어**(브리프 §10)를 결정한다: interest가 어떻게 **표현**되는지, finding의 **relevance가
어떻게 점수화되고 설명**되는지, interest가 어떻게 **업데이트**되는지. 이 문서는 큐레이션된 타입드 interest
아티팩트, 명명된 기여로 분해되는 BM25 우선 가산 점수 공식, **recall 우선 surface-not-drop** 규칙, **human-gated**
업데이트를 확정한다. 이 문서는 ingestion(ADR-0003), 이 점수를 *소비*하는 classification taxonomy(ADR-0004),
ledger, synthesis를 결정하지 **않는다** — 그것들은 별도 ADR이다. 브리프 §11/§12에 따라, v1은 **단순하고,
설명가능하며, 좁은 리스트에서 높은 recall — 무거운 ML relevance 모델 없음**을 유지한다.

## 맥락(Context)
- 이것은 브리프가 **load-bearing**이라 부르는 결정이다(§10). Relevance 랭킹은 triage를 위해 무엇이 표면화될지를
  좌우한다; 잘못하면 가까운 논문을 조용히 잃는다 — 존재론적 novelty 위험(§1).
- 설계 동인(interest-modeling 연구 §Design forces): **좁은 watch list에서 높은 recall**(필터링이 아니라
  표면화로 편향), **설명가능**(모든 점수가 명명된 신호로 분해), **v1 무거운 ML 없음**(lexical 우선, embedding은
  선택), **findings는 제안, Jimmy가 검토**(업데이트는 human-gated), **자체 저장소, markdown/JSON + 경량 인덱스**
  (버전드 YAML/JSON + SQLite FTS5, 외부 서비스 없음).
- watch list(§6)는 **전문 용어가 많은 고유명사**다 — *MemOS, Chakra, DeepStack, Minsoo Rhu, MC-DLA,
  SECDA-DSE, TTT writeback* — 바로 exact/BM25 lexical 매칭이 대부분의 진양성을 포착하고, 불투명한 embedding이
  noise를 과도 표면화할 위험이 있는 지점이다.
- 생성된 콘텐츠는 결코 evidence가 아니다(§12): relevance score는 **raw finding에 대한 메타데이터**다; scorer는
  결코 소스 텍스트를 재작성하지 않는다.

## 고려된 옵션(Options considered)

### A. Interest 표현
| 옵션 | 장점 | 단점 | 적합도 |
|---|---|---|---|
| **큐레이션된 타입드 항목, 버전드 `interests.yaml` → 컴파일된 `interests.json`** | 사람이 읽을 수 있는 제어 표면; 항목별 weight/polarity/decay/provenance; git diff = 감사 | 수동 큐레이션(설계상) | **선택됨** |
| 학습된 사용자 embedding / 프로필 | 자동 적응 | 불투명, 감사 불가, 표류, ML 인프라 필요 — §11/§12 위배 | 거부됨 |
| 평면 키워드 리스트 | 사소함 | 타입/weight/polarity 없음 → 설명가능한 분해 없음, hype 디랭킹 없음 | 거부됨 |

### B. Relevance 랭킹 척추(spine)
| 옵션 | 장점 | 단점 | 적합도 |
|---|---|---|---|
| **SQLite FTS5를 통한 exact/alias 매칭 + BM25, interest별 가산 기여** | 점검 가능한 tf-idf, 서비스 불필요, 컬럼 가중치(title>abstract>body), 구조상 설명가능 | lexical만 — paraphrase 놓침 | **선택된 척추** |
| Dense embedding 우선 | 최고의 paraphrase recall | 불투명, 모델 + vector store 필요, 느슨하게 관련된 것 과도 표면화 → noise | 우선으로는 거부됨 |
| 하이브리드 BM25 + embedding (RRF/가중) | 최고의 recall+precision | 가동부 증가; α 튜닝에 라벨링된 eval set 필요 | **post-v1 목표; α-플래그를 지금 배선, 기본 off** |

### C. 필터링 자세(posture)
| 옵션 | 장점 | 단점 | 적합도 |
|---|---|---|---|
| **Recall 우선: 모든 `recall_priority: high` watch-list 적중은 항상 표면화; 점수는 순서를 좌우, 생존은 아님** | 가까운 논문을 결코 조용히 버리지 않음(§1) | triage할 항목 증가 | **선택됨** |
| Precision 임계 게이트(τ 미만 drop) | 검토자 부하 감소 | 잘못된 drop = novelty 누락 = 존재론적 | 거부됨 |

### D. 업데이트 메커니즘
| 옵션 | 장점 | 단점 | 적합도 |
|---|---|---|---|
| **Human-gated: 직접 편집 + 제한된 feedback nudge + 비활성 suggestion queue, 모두 버전드** | Jimmy가 검토자(§11); 되돌릴 수 있음; scope-creep 없음 | 수동 큐레이션 | **선택됨** |
| 자동 학습 weight / 자동 성장 watch list | 손 안 댐 | 조용한 표류 + scope-creep(브리프 §88 non-goal); 감사 불가 | 거부됨 |

## 결정(Decision)
**작고 큐레이션된 타입드 interest 아티팩트, recall 우선 floor를 가진 BM25 우선 가산 설명가능 relevance score,
그리고 human-gated 버전드 업데이트.**

1. **Interest 스키마.** Interest는 `interests.json`으로 컴파일되는 버전드 `interests.yaml`(Jimmy의 제어
   표면)에 산다. 각 항목은 `id`, `type`(`keyword | topic | entity | author | venue`), `terms`/`aliases`,
   `weight`, `watch_list`, `polarity`(`positive | negative`), `decay`(`none | slow | fast`),
   `canonical_id`(author/venue 명확화용), `provenance`를 가진다. 브리프 §6 watch list로부터 `recall_priority:
   high`인 `memory-centric-dse` 리스트로 시드된다. 스키마와 필드 근거는
   [interest-modeling_ko.md](../02-research/interest-modeling_ko.md) §1 참조.
2. **점수 공식(구조상 설명가능).**
   `relevance(finding) = Σ positive[weight × lane_score × decay] − Σ negative[weight × lane_score] + α × embedding_lane`,
   v1에서 `α = 0` 기본값. Lane: **exact/alias 매칭**, **BM25 lexical**(SQLite FTS5 `bm25()`, 부정화 +
   배치당 min-max 정규화, 컬럼 가중치 title>abstract>body), `canonical_id`상의 **entity/author/venue 매칭** —
   모두 **코어**; **embedding lane**은 `enable_embeddings` 뒤의 선택사항, 기본 off. 모든 finding은 `relevance`에
   **더하여** `{interest.id, type, lane, raw, contribution}`의 `relevance_explain[]` 리스트와
   `matched_watch_list`를 담으며, triage(ADR-0004)와 digest(ADR-0001)가 그대로 렌더링한다.
3. **Recall 우선 floor.** **어떤** `recall_priority: high` watch-list interest와 매칭되는 finding은 낮은
   점수에서도 triage를 위해 **항상 표면화**된다 — 결코 자동 폐기되지 않음. 점수는 **순서**를 좌우하지 생존을
   좌우하지 않는다. negative-polarity 매칭은 digest 내에서 **강등**하되 결코 삭제하지 않는다. 동점 처리: 최신성,
   그다음 매칭된 별개 interest 수. 이 floor는 ADR-0004의 `noise` 경로가 준수해야 하는 계약이다.
4. **업데이트 메커니즘(human-gated, 버전드).** 세 채널: **직접 편집**(Jimmy가 `interests.yaml` 편집;
   재컴파일, `version` 증가, backlog 재랭크; git diff = 감사); **feedback nudge**(ADR-0001의 `mark-feedback`
   연산이 매칭된 interest의 `weight`를 작고 제한되고 클램핑된 단계로 조정, `interest-feedback.jsonl`에 로깅;
   결코 interest를 생성/삭제하거나 `terms`를 편집하지 않음); **suggestion queue**(반복되는 높은 relevance
   토큰/저자를 `provenance: suggested`로 제안, Jimmy가 승격할 때까지 비활성 — 조용한 watch-list 성장 없음).
   `decay`는 cron 실행에서 적용되어 시의성 있는 interest가 수동 가지치기 없이 사라진다.
5. **점수는 메타데이터일 뿐.** scorer는 raw 소스 콘텐츠를 결코 변형하지 않는다(브리프 §12); 설명과 점수는
   불변의 finding 위 주석 레이어다.

## 결과(Consequences)
- **쉬움:** 독자는 항상 *왜* 무언가가 표면화되었는지(명명된 term/author/lane) 본다; interest 편집은 작은
  집합에 대한 투명한 합을 다시 실행할 뿐 — 재학습 없음; 아티팩트는 한 화면에 들어가고 완전히 git 감사 가능.
- **쉬움:** 하이브리드 이음새가 지금 존재(α-플래그된 embedding lane)하므로, 라벨링된 eval 이후 재설계 없이
  의미론을 추가할 수 있다.
- **어려움 / 비용:** lexical 전용 v1은 알려진 어휘를 피하는 *새* 작업을 놓칠 수 있다 — embedding lane이 측정
  가능해지면 닫기로 예약된 실제 recall 갭; FTS5 `bm25()` 정규화(부정화 + 배치당 min-max)는 기여가 비교 가능하게
  유지되도록 신중히 구현해야 한다.
- **후속:** ADR-0003은 entity lane이 발화하도록 구조화된 author/venue 메타데이터를 제공해야 한다; ADR-0004는
  `relevance` + `relevance_explain[]`을 소비하고 recall 우선 floor를 상속한다; ADR-0001의 `mark-feedback`
  연산이 feedback 채널이다. Runbooks: interest store + 컴파일러/검증기; FTS5 인덱스; `relevance_explain[]`을
  내보내는 scorer; recall-gate; feedback + suggestion queue; decay/재랭크 cron 단계.

## 미해결 질문 / 재검토 트리거(Open questions / revisit triggers)
- TODO(open-question: author/venue 명확화 — *Minsoo Rhu*에 대해 Semantic Scholar `authorId` vs ORCID vs
  name-string; 동명이인과 비소속 재게시.) [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md) 참조.
- TODO(open-question: 선택적 lane을 위한 embedding 모델 — 법적/ToS + 자체 저장소 제약을 고려할 때 로컬 vs API,
  그리고 추가된 recall이 불투명성을 감수할 가치가 있는가?)
- TODO(open-question: 좁은 리스트에 대해 "높은 recall"을 정의하는 라벨링된 eval set, 그리고 그것이 산출하는
  기본 α/임계값. 벤치마크 수치는 주장하지 않음.)
- TODO(open-question: feedback nudge 단계 크기와 클램프; tier별 decay 함수 형태/반감기.)
- TODO(open-question: recall 우선을 고려할 때 negative-polarity interest가 hard-suppress할 수 있는가, 아니면
  항상 강등만 하는가?)
- **재검토 트리거:** lexical v1이 watch-list-인접 작업을 측정 가능하게 놓치면, embedding lane을 활성화하라(`α`
  상향) — 재설계가 아니라, eval set에 대해 검증된 config 변경이다.
