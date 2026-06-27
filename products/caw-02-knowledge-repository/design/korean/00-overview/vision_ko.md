# 비전 — CAW-02 팀/개인 지식 저장소

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set review date)
- **Related:**
  - [scope-and-non-goals.md](./scope-and-non-goals_ko.md)
  - [personas-and-use-cases.md](./personas-and-use-cases_ko.md)
  - [ADR-0001 Product surface & skill interface](../01-decisions/ADR-0001-product-surface-and-skill-interface_ko.md)
  - [ADR-0002 Storage](../01-decisions/ADR-0002-storage_ko.md)
  - [ADR-0003 Knowledge data model](../01-decisions/ADR-0003-knowledge-data-model_ko.md)
  - [ADR-0004 Provenance & trust](../01-decisions/ADR-0004-provenance-and-trust_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF_ko.md

## 목적
이 문서는 CAW-02의 북극성(north star)을 기술한다. **무엇을** 만들고 있는지, **왜** 만드는지, 그리고 그것이 반드시
지켜야 할 **단일 가치 단위(single unit of value)**가 무엇인지를 정의한다. v0의 경계(append + retrieve + skill-wrap)와
첫 번째 수직 슬라이스를 정의한다. 저장 레이아웃, 스키마, surface, 파이프라인 메커니즘은 명세하지 **않는다** — 그것들은
연결된 ADR과 [02-research](../02-research) 노트에 있다. 또한 범위를 다시 논하지 않는다(see [scope-and-non-goals.md](./scope-and-non-goals_ko.md)).

## 1. 북극성(North star)
CAW-02는 **출처 보존 지식(provenance-preserving knowledge)을 위한 도구**다. 즉 Jimmy와 팀이 기술 지식을
**append, retrieve, reuse**할 수 있고 *결론에 도달한 방식이 재구성 가능하게 유지되는*, 검사 가능한 저장소다.
이 저장소의 임무는 영리해지는 것이 아니라 **검사 하에서 신뢰할 수 있는(trustworthy under inspection)** 것이다 —
모든 종합된 노트는 그것이 기반하는 claim까지 되짚어갈 수 있고, 모든 claim은 구체적인 evidence까지, 모든 evidence는
실제 아티팩트나 출처까지 되짚어갈 수 있다.

우리가 막기 위해 존재하는 실패 모드: **생성된 요약이 evidence로 오인되는 것**, 그리고 내부/기밀 자료가 외부 공개
산출물로 유출되는 것. 전체 설계는 그러한 실수를 단지 권장하지 않는 수준이 아니라 *구조적으로 불가능하게* 만드는 것을
중심으로 구성되어 있다.

## 2. 가치 단위(The unit of value)
이 제품의 원자(atom)는 하나의 **출처 보존 지식 트랜잭션(provenance-preserving knowledge transaction)**이다:

```
add source  →  extract claim(s)  →  attach evidence  →  synthesize note (cited)
```

트랜잭션이 "좋다"고 할 수 있는 것은 결과로 만들어진 그래프가 **재구성 가능(reconstructable)**하고 **재사용 가능
(reusable)**하게 유지될 때뿐이다:

| Property            | 여기서의 의미                                                                          |
|---------------------|--------------------------------------------------------------------------------------|
| Reconstructable     | source → claim → evidence → note 사슬이 양방향 모두 온전하고 추적 가능하다              |
| Cited               | 모든 종합 노트가 그것이 기반하는 claim/evidence를 명시한다; 고아(orphan) 결론이 없다    |
| Evidence-real       | evidence가 구체적 아티팩트/출처로 해석된다 — 결코 자유 산문이 아니다(the evidence gate) |
| Boundary-safe       | 각 항목이 `boundary` + `visibility`를 지닌다; 종합은 결코 그것들을 강등하지 않는다      |
| Reusable            | 이후 독자(사람이든 agent든)가 사슬을 검색하고 그것에 의존할 수 있다                     |

**Claim→Evidence 불변식(invariant)** (`Claim`은 반드시 `>=1`개의 실제 `Evidence`를 가리켜야 한다)이 하중을 견디는
핵심 규칙이다. 이는 세 개의 보조를 맞춘 계층에서 강제된다 — frontmatter schema, core validator, reindex re-check —
따라서 모든 surface와 storage 엔진에 걸쳐 동일하게 유지된다(see [ADR-0003](../01-decisions/ADR-0003-knowledge-data-model_ko.md)).

## 3. v0가 무엇인가 — 그리고 무엇이 아닌가
v0 = **append + retrieve + skill-wrap**. 구체적으로:

- **Append** — append-only 쓰기에 더해 *supersedes* (제자리 갱신/삭제 없음). 모든 쓰기는 append-only 이벤트 로그에
  미러링된다; git history가 감사 추적(audit trail)이다(see [ADR-0002](../01-decisions/ADR-0002-storage_ko.md)).
- **Retrieve** — 키워드/구조화 검색(FTS에 더해 일급(first-class) boundary/type/trust 필터)으로 전체 출처 사슬을
  하이드레이션한다; RAG는 인용 제약(citation-constrained)을 받는다(see [ADR-0006](../01-decisions/ADR-0006-retrieval_ko.md)).
- **Skill-wrap** — AI agent가 출처를 손상시키지 않고 지식 트랜잭션을 실행할 수 있도록 하는 안전하고 검증된 인터페이스;
  **evidence gate**가 여기에 위치한다(see [ADR-0001](../01-decisions/ADR-0001-product-surface-and-skill-interface_ko.md)).

v0는 명시적으로 **지속 학습(continual learning) / 자율적 자기 편집(autonomous self-editing)이 아니다**. 컨트롤 플레인
스키마는 미래의 지속 학습이나 그래프 업그레이드가 *데이터 재작성이 아니라 엔진/쿼리 교체*가 되도록 설계되어 있다 —
다만 그 기능은 v0 범위 밖이다. See [scope-and-non-goals.md](./scope-and-non-goals_ko.md).

## 4. 독립성(Independence)
CAW-02는 자체 core, data, deployment을 가진 **독립적이고 단독으로 동작하는 제품**이다. 어떤 형제 제품과도
**런타임 기반, registry, database를 공유하지 않는다**. `ai-workbench` 제품군의 나머지와는 오직 명시적인
**import/export 경계(files/API)**를 통해서만 접촉한다:

| Boundary        | 방향   | 무엇이 건너가는가                                                          |
|-----------------|--------|--------------------------------------------------------------------------|
| CAW-01 (sims)   | import | 시뮬레이션 projection/evidence → `Evidence`로 카탈로그화(격리됨)          |
| CAW-05 (radar)  | import | radar / related-work 신호 → `Source`/`Claim`/`OpenQuestion`/`RelatedWork`|
| CAW-03 (drafting)| export | 논문/특허 드래프팅을 위한 인용된 `Claim`+`Evidence` 번들                  |

각 건너감(crossing)은 경계를 다시 편집(re-redact)하고 다시 검사(re-check)한다; export 경로는 **fail-closed
allow-list**이다(see [ADR-0007](../01-decisions/ADR-0007-import-export-contracts_ko.md)). CAW-04(공개 지식
웹사이트)는 별개의 제품이며, CAW-02의 surface가 아니다.

## 5. 설계 철학(몇 가지 원칙)
- **git 안의 파일이 source of truth다.** 각 엔티티는 사람이 diff 가능한 하나의 `.md`이다(YAML frontmatter = 기계용
  계약 + markdown 본문 = 사람용 노트). SQLite는 파생된, 폐기 가능한 인덱스이며 결정적(deterministic) reindex로
  재구축된다. 이는 지식을 검사 가능하고, 소유 가능하며, 엔진 이식 가능하게 유지한다.
- **하나의 core가 모든 로직을 소유한다.** Validation, evidence gate, trust 재계산, boundary 전파, audit는 하나의
  트랜잭션 core 안에 있다. API + MCP + CLI는 *하나의 op manifest에서 codegen된 얇은 어댑터*이며 로직을 추가하지 않는다.
- **정책보다 구조적 무결성.** `attach_evidence`에는 산문 필드가 없다; 노트는 결코 evidence가 될 수 없다. Trust는 작은
  파생 사다리(T0–T3 + contested)이며, AI가 작성한 것은 T2로 상한이 정해진다. Boundary는 단조적으로(monotonically) 전파된다.
- **작은 수직 슬라이스 먼저.** 플랫폼을 넓히기 전에 워크플로우 의미를 끝에서 끝까지 입증한다.

## 6. 첫 번째 수직 슬라이스
제품을 입증하는 슬라이스는 **skill-wrap을 통한, 끝에서 끝까지의 core 인제스트 루프**다:

```
add-source(URL/file)
  → extract-claim(s)         (agent proposes; reviewed by default)
    → attach-evidence        (evidence gate: artifact_ref must resolve)
      → synthesize-note       (cited; generated summary is NOT evidence)
        → retrieve            ("what do we know about X, with evidence + trust?")
```

완료된 모습은 이렇다: 하나의 명령/agent 실행이 하나의 실제 출처를, 해석 가능한 Evidence로 뒷받침되고 인용된 Note를
가진, 검토된 Claim으로 바꾼다. 이 모든 것은 git에 append-only로 쓰이고 이벤트 로그에 미러링되며, 이후 전체 출처
사슬과 boundary/trust 메타데이터가 온전한 채로 검색 가능하다. 이 슬라이스는 import/export, viewer, 또는 어떤 지속
학습 기계장치도 요구하지 않으면서 하중을 견디는 모든 규칙(불변식, evidence gate, append-only, boundary 전파, 인용
제약 검색)을 작동시킨다.

슬라이스 이후의 순서: (1) CAW-05 신호 인입 추가, (2) CAW-01 projection을 evidence로 import 추가, (3) CAW-03
인용 번들 export 추가, (4) 선택적 읽기 전용 viewer. 워크스루는 [personas-and-use-cases.md](./personas-and-use-cases_ko.md)를 참고하라.

## 7. 성공 신호(정성적, v0)
- 어떤 종합 노트든 한 단계로 그 evidence까지 추적할 수 있다; 고아 결론이 존재하지 않는다.
- 생성된 요약이 결코 evidence로 저장되지 않는다(gate가 모든 surface에 걸쳐 유지된다).
- 어떤 기밀 항목도 외부 공개 export에 나타나지 않는다(fail-closed가 유지된다).
- agent가 출처를 손상시키지 않고 검토 하에 core 루프를 완료할 수 있다.
- 파일로부터 SQLite 인덱스를 재구축하면 동일한 그래프가 나온다(결정성이 유지된다).

TODO(open-question: do we want quantitative v0 success metrics, e.g. retrieval precision targets, before the
embeddings trigger in [ADR-0006](../01-decisions/ADR-0006-retrieval_ko.md)?)

## 미해결 질문
실시간 목록은 [08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md)(TODO: create)를 참고하라.
여기서 열린 것: 정량적 성공 지표; 리뷰 날짜.

## 런북에 대한 함의
- 첫 번째 런북 단계는 어떤 import/export나 viewer 작업보다 먼저, 각 체크포인트에서 green인 상태로 §6의 **수직
  슬라이스**(skill-wrap을 통한 core 루프)를 전달해야 한다.
- 런북은 git 안의 파일을 source of truth로, SQLite 인덱스를 처음부터 재구축 가능한 것으로 다뤄야 한다.
- 모든 쓰기 경로 런북은 단일 core를 통해 라우팅되어야 하며(어댑터에 로직 없음) evidence gate를 작동시켜야 한다.
