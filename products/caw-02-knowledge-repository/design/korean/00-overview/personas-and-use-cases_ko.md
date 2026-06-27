# 페르소나 & 유스케이스(Personas & Use Cases) — CAW-02

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set review date)
- **Related:**
  - [vision.md](./vision_ko.md)
  - [scope-and-non-goals.md](./scope-and-non-goals_ko.md)
  - [ADR-0001 Product surface & skill interface](../01-decisions/ADR-0001-product-surface-and-skill-interface_ko.md)
  - [ADR-0005 Ingestion pipeline](../01-decisions/ADR-0005-ingestion-pipeline_ko.md)
  - [ADR-0006 Retrieval](../01-decisions/ADR-0006-retrieval_ko.md)
  - [ADR-0007 Import/export contracts](../01-decisions/ADR-0007-import-export-contracts_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF_ko.md

## 목적
이 문서는 CAW-02의 **페르소나(persona)**를 명명하고, 설계가 반드시 지원해야 하는 **유스케이스(use case)**를 따라가며,
ADR과 런북을 구체적 흐름에 비추어 점검할 수 있게 한다. *각 행위자가 무엇을 하고 시스템이 무엇을 보장하는지*를
기술한다; op 시그니처, 스키마, 저장 레이아웃은 명세하지 않는다(연결된 ADR과 [02-research](../02-research)를 참고하라).

## 1. 페르소나

| Persona | 역할 | 주 surface | Trust / 쓰기 권한 | 가장 중요하게 여기는 것 |
|---------|------|-----------------|----------------------|------------------|
| **Jimmy** (curator) | 도메인 전문가; 전략적 결정의 검토자 | CLI + 읽기 전용 viewer | T3까지 작성 가능; agent 제출을 승인; `Decision`/`Assumption` 기록 | 재구성 가능성; 유출 없음; trust를 동반한 빠른 검색 |
| **The team** (기여자/독자) | 지식을 추가하고 소비 | CLI + API + viewer | 팀 `visibility` 내에서 작성; 검토된 쓰기 | "X에 대해 무엇을 아는가, evidence와 함께" 찾기 |
| **AI agents** | skill-wrap을 통해 검증된 지식 트랜잭션 실행 | MCP (skill interface) | **T2로 상한**; 기본 확인(confirmation-by-default); 수락 전 검토됨 | 출처를 손상시키지 않고 루프 수행 |

비고:
- agent는 결코 **evidence gate**를 우회하지 않는다: `attach_evidence`에는 산문 필드가 없고 `artifact_ref`는 반드시 해석되어야 한다.
- agent 제출은 **기본적으로 검토된다**(v0에서 조용한 자동 수락 없음); 거부된 후보는 audit용으로 보존될 수 있다
  ([ADR-0005](../01-decisions/ADR-0005-ingestion-pipeline_ko.md)).
- `visibility {team,private}`는 팀 지식을 Jimmy의 개인 노트와 분리한다; `boundary {public,internal,
  confidential}`은 직교적이다([ADR-0004](../01-decisions/ADR-0004-provenance-and-trust_ko.md)).

## 2. 유스케이스 워크스루

### UC-1 — Core 인제스트 루프(가치 단위)
**Actor:** AI agent가 제안; Jimmy가 검토. **Goal:** 실제 출처를 재사용 가능하고 인용된 지식으로 바꾼다.

```
add-source(url|file)                  → Source node (boundary/visibility set)
  → extract-claim(s)                   → Claim candidate(s)        [reviewed]
    → attach-evidence(artifact_ref)    → Evidence (gate: ref MUST resolve; no prose)
      → synthesize-note(cites: [...])  → Note (cited; NEVER itself evidence)
```

작동되는 보장: Claim→≥1 Evidence 불변식; evidence gate; append-only + 이벤트 로그 미러; 단조 boundary 전파;
Jimmy의 검토 대기 중 AI 작성 trust는 T2로 상한. 이것이 **첫 번째 수직 슬라이스**다(see [vision.md](./vision_ko.md) §6).
파이프라인 세부: [ADR-0005](../01-decisions/ADR-0005-ingestion-pipeline_ko.md).

### UC-2 — Radar / related-work 신호 인입
**Actor:** AI agent(CAW-05 export를 인입). **Goal:** 느슨한 요약이 아니라 분류된 인입.

```
import CAW-05 signal (file/API)
  → quarantine + boundary check
    → classify threat | support
      → map to Source / Claim / OpenQuestion / RelatedWork / RadarSignal (typed)
        → link-to-claim where applicable
```

보장: 신호는 **타입 노드**가 되며, 결코 자유 텍스트 덩어리(blob)가 아니다; 분류는 출처로 기록된다; 생성된 모든 Claim에
대해 Claim→Evidence 불변식이 여전히 유지된다. CAW-05는 **별개의 제품**이다; 이것은 file/API import 경계다
([ADR-0007](../01-decisions/ADR-0007-import-export-contracts_ko.md)).

### UC-3 — "X에 대해 무엇을 아는가?" 검색
**Actor:** Jimmy 또는 팀원. **Goal:** *evidence와 trust 수준과 함께* 질문에 답한다.

```
query("X") + filters{boundary, visibility, type, trust, concept}
  → structured filters applied BEFORE ranking
    → FTS5 BM25 ranking
      → results hydrate the provenance chain (claim + evidence + note)
        → citation-constrained RAG (returns claim+evidence, never opaque blobs)
```

보장: 필터는 일급이며 랭킹 이전에 적용된다; 모든 결과는 trust 수준과 추적 가능한 출처를 지닌다; RAG는 인용되지 않은
덩어리를 반환할 수 없다. v0에 임베딩 없음([ADR-0006](../01-decisions/ADR-0006-retrieval_ko.md)).

### UC-4 — CAW-01 projection을 evidence로 import
**Actor:** Jimmy 또는 agent. **Goal:** *기밀 데이터를 유출하지 않고* 시뮬레이션 결과를 영속적 evidence로 만든다.

```
receive CAW-01 projection/evidence export (file/API, signed)
  → quarantine-on-import + confidentiality check
    → map to Evidence (+ imported refs: Trace / SimulationRun / Experiment)
      → attach Evidence to the target Claim   (invariant satisfied)
```

보장: 큰 아티팩트는 산문으로 복사되지 않고 path/URI로 참조된다; import 시 boundary가 강제된다(기밀 유출 없음);
projection은 여기서 **카탈로그화될 뿐 결코 실행되지 않는다**. CAW-01은 **별개의 제품**이다.

### UC-5 — 인용 번들을 CAW-03으로 export
**Actor:** Jimmy(curator가 export를 승인). **Goal:** 논문/특허 제품에 방어 가능한 번들을 넘긴다.

```
select Claim(s) → gather cited Evidence chain
  → fail-closed allow-list filter (public-safe only)
    → re-redaction at the crossing
      → sign bundle + attach provenance manifest
        → export to CAW-03 (file/API)
```

보장: **fail-closed** — allow-list에 없는 것은 유출되지 않고 버려진다; 어떤 기밀 항목도 외부 공개 목적지에 도달할 수
없다; 번들은 서명되고 그 출처 매니페스트를 지닌다. CAW-03은 **별개의 제품**이다
([ADR-0007](../01-decisions/ADR-0007-import-export-contracts_ko.md)).

### UC-6 — Decision / OpenQuestion / Assumption 기록
**Actor:** Jimmy. **Goal:** 전략적 추론을 그 evidence에 연결된 채로 유지한다.

```
record Decision (or OpenQuestion / Assumption)
  → link to supporting Claim(s) + Evidence
    → append-only write + event-log mirror
```

보장: 결정은 재구성 가능하게 유지된다(어떤 claim/evidence에 기반했는지); Decision을 supersede해도 이전 것은 history에
남는다. Jimmy가 전략적 결정의 검토자다; 자동 생성은 제안 전용(proposal-only)이다(PRODUCT-BRIEF §10).

## 3. 페르소나 × 유스케이스 매트릭스

| Use case | Jimmy | Team | AI agent |
|----------|:-----:|:----:|:--------:|
| UC-1 core loop | 검토/승인 | 기여 | 제안(T2 상한) |
| UC-2 signal intake | 검토 | 읽기 | 제안/매핑 |
| UC-3 retrieve | 예 | 예 | 예(읽기) |
| UC-4 import projection | 예 | — | 제안/매핑 |
| UC-5 export bundle | **승인** | — | 준비만 |
| UC-6 decision/question | **작성** | 제안 | 제안 |

## 미해결 질문
[08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md)(TODO: create)를 참고하라. 여기서 열린 것:
팀원에게 v1의 단일 `visibility {team,private}` 축보다 더 세밀한 쓰기 역할 분리가 필요한가? UC-5 export에 Jimmy를
넘어서는 두 번째 검토자가 필요한가?

## 런북에 대한 함의
- 첫 번째 런북 슬라이스는 어떤 import/export 유스케이스보다 먼저 skill-wrap을 통해 **UC-1**을 끝에서 끝까지 구현한다.
- 모든 쓰기 경로 런북은 agent 제출에 대해 기본 검토를 강제하고 evidence gate를 작동시켜야 한다.
- Import 런북(UC-2, UC-4)은 격리를 먼저 구현한다; export 런북(UC-5)은 어떤 필드 매핑보다 먼저 fail-closed
  allow-list를 구현한다.
