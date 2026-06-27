# PRODUCT BRIEF — 팀/개인 Knowledge Repository (CAW-02)

> **CAW-02** 의 단일 진실 공급원입니다. 모든 디자인 문서 + runbook은 이 brief와 일관성을 유지해야 합니다.
> 문서가 brief와 모순되면 brief가 우선합니다. 내부 사실을 지어내지 말고, 모르는 것은
> `08-research-plan/open-questions.md`에 기록하세요.

## 0. 하나의 강한 제약
우리는 여기서 제품을 빌드하지 않습니다. 우리는 AI 빌더가 실행할 설계 + 빌드 지침(runbook)을 작성합니다.

## 1. 정체성 및 독립성
- **제품:** 팀/개인 Knowledge Repository (CAW-02).
- **한 줄 설명:** Jimmy와 팀이 엄격한 **provenance**(원본 source → 추출된 claim → evidence → synthesis)와
  함께 기술 지식을 **추가, retrieve, 재사용** 할 수 있게 하는, 검사 가능한 지식 저장소이며 단독 제품입니다.
- 이것은 6개로 구성된 `ai-workbench` 제품군 안의 **독립적인 단독 제품** 입니다. 자체 코어, 데이터,
  배포를 가집니다. 다른 제품과 **공유 런타임 기반(shared runtime substrate)이 없습니다.** CAW-01/CAW-05/CAW-03과는
  **import/export boundary**(독립 제품 간 파일/API)를 통해서만 상호작용합니다.

## 2. 문제 및 가치
- **문제:** 기술 지식(source, claim, evidence, decision, experiment 출력, related-work
  signal)이 흩어져 있어 재구성이 불가능하고, 생성된 요약이 evidence로 오인됩니다.
- **가치 단위:** 하나의 **provenance 보존 지식 트랜잭션** —
  `add source → extract claim(s) → attach evidence → synthesize note (cited)` — 이며 재구성 가능하고 재사용 가능하게 유지됩니다.
- **왜 지금 / 왜 분리하는가:** 다른 모든 제품(CAW-01 runs, CAW-05 radar, CAW-03 drafting)은 지식을
  예치하고 retrieve할 수 있는 내구성 있고 신뢰할 수 있는 장소가 필요합니다 — 하지만 그 저장소는 어느 한
  제품에 박힌 기반이 아니라, 자체 무결성 규칙을 가진 **자체** 제품이어야 합니다.
- **성숙도 주의:** **continual learning은 v0가 아닙니다.** v0 = **append + retrieve + skill-wrap**.
  제어 평면(control-plane) 스키마(trace, run, insight, decision이 재구성 가능하게 유지됨)는 지식 저장소 코어의 일부입니다.

## 3. 사용자 및 주요 사용 사례
- **Personas:** Jimmy(도메인 전문가/큐레이터), 팀(독자/기여자), 그리고 안전한 skill 인터페이스를 통해
  지식을 추가/업데이트하는 **AI agent**.
- **주요 사용 사례:**
  1. `add-source → extract-claims → synthesize-note` (cited) — 핵심 ingestion 루프.
  2. `add-related-work-signal → classify threat/support → link-to-claim` — radar/related-work 수집.
  3. Retrieve: "X에 대해 우리가 무엇을 아는가, evidence와 trust level과 함께?"
  4. CAW-01 simulation **projection** 을 claim에 대한 내구성 있는 evidence로 import(기밀 데이터 유출 없이).
  5. 인용된 claim/evidence bundle을 CAW-03(paper/patent 제품)으로 export.
  6. `Decision` / `OpenQuestion` / `Assumption` 을 기록하고 그 evidence와 연결된 상태로 유지.

## 4. 제품 surface
- **주요 surface:** 타입이 지정된 **API**, **MCP 서버**, 그리고 **CLI** — 사람과 agent가 지식을 안전하게
  추가/retrieve할 수 있게 합니다("skill 인터페이스").
- **보조 surface:** 선택적인 **최소 지식 뷰어**(읽기 전용) — source/claim/evidence/note와 그 링크를
  탐색합니다. 풍부한 편집 UI는 v1의 non-goal입니다.
- 제품 자체의 코어/서비스는 모든 surface 뒤에 위치합니다(다른 제품과 공유 기반 없음).

## 5. 핵심 도메인 (심장부)
지식 저장소는 다음을 일급(first-class)의 별개 사물로 구분해야 합니다(생성된 요약은 evidence가 아닙니다):
- **Entity:** `Source, Claim, Evidence, Note, Concept, Interest, OpenQuestion, Decision, Assumption`, 그리고
  import된 아티팩트 참조 `Trace, SimulationRun, Experiment`(여기서 실행되지 않고 evidence로 카탈로그화됨),
  그리고 수집 signal `RelatedWork, RadarSignal`.
- **불변식:** `Claim` 은 반드시 `Evidence` 를 가리켜야 하며, `Evidence` 는 자유 텍스트가 아니라 구체적인 아티팩트/source를 참조합니다.
- **Skill-wrap:** agent가 provenance를 손상시키지 않고 검증된 지식 트랜잭션(source 추가, claim 추출,
  evidence 첨부, note 합성, signal 분류)을 수행할 수 있게 하는 안전한 인터페이스.
- **재구성 가능성(Reconstructability):** 스키마는 synthesis가 어떻게 도달되었는지(source → claim
  → evidence → note 체인)를 재구성하고, 이후 graph / continual-learning 모델로 업그레이드할 수 있을 만큼 충분히 보존합니다.

## 6. 데이터
- **CAW-02 자체 저장소**(절대 공유하지 않음). v0 저장 결정은 미정입니다: **markdown-first vs SQLite vs 둘 다**
  (아마도 사람이 diff 가능한 진실 공급원으로서 md-first + query/retrieval을 위한 SQLite/Postgres-portable index;
  ADR에서 결정). 재작성 없이 **미래의 graph / continual-learning 업그레이드를 허용** 하는 최소 스키마.
- **Boundary:** 모든 항목은 `boundary`(public / internal / confidential)와 **team vs Jimmy-private**
  분리를 가집니다. 외부 공개용 export는 public-safe한 것만 포함해야 합니다.
- 대용량 아티팩트(import된 trace/projection)는 path/URI로 저장되며 row에서 참조됩니다.

## 7. Import / export boundary (다른 독립 제품과의 관계)
- **CAW-01로부터의 import:** simulation **projection/evidence** export → claim에 대한 `Evidence` 로
  카탈로그화, **기밀 데이터 유출 없이**(import 시점에 boundary 강제).
- **CAW-05로부터의 import:** **radar / related-work signal** → `Source`/`Claim`/`OpenQuestion`/`RelatedWork` 이 되며,
  느슨한 요약이 아니라 threat/support로 분류됩니다.
- **CAW-03으로의 export:** paper/patent 작성을 위한 인용된 `Claim`+`Evidence` bundle.
- 위의 모든 것은 독립 제품 간의 명시적인 파일/API boundary입니다 — **공유 기반/registry/DB 없음.**

## 8. 내려야 할 결정 (각각 ADR을 가짐)
- ADR: 제품 surface(API + MCP + CLI + 선택적 viewer)와 agent **skill 인터페이스**.
- ADR: 저장(md-first vs SQLite vs 둘 다; Postgres-portability; 미래 graph 업그레이드 경로).
- ADR: 지식 **데이터 모델** + claim→evidence 불변식 강제.
- ADR: **provenance 및 trust** 모델(trust level; public/internal/confidential; team vs private).
- ADR: **ingestion 파이프라인**(add-source→extract-claims→synthesize-note) 및 signal 수집.
- ADR: CAW-01/05/03과의 **import/export** 계약(boundary 포맷).
- ADR: retrieval(keyword vs semantic/vector; embedding을 언제 추가할지).

## 9. Non-goal (v1)
- 지식의 **continual learning / 자율적 self-editing**(v0는 append + retrieve + skill-wrap).
- 무거운 graph 데이터베이스(업그레이드 경로는 열어두되, v1에서 Neo4j를 채택하지 않음).
- 풍부한 편집 UI / 공개 지식 웹사이트(CAW-04는 별도 제품).
- simulation 실행 또는 radar 수집(그것들은 CAW-01 / CAW-05 — CAW-02는 그들의 export만 카탈로그화).
- v1에서 team-vs-private을 넘어서는 멀티 테넌트 / 조직 규모 접근 제어.

## 10. Guardrail (상속됨, 모든 제품)
- 외부 공개용 출력물에 기밀 회사 데이터 금지.
- 공개 source 연구를 내부 Samsung/SAIT claim과 절대 혼동하지 않기.
- source, claim, evidence, 생성된 결론을 분리해서 유지하기; 생성된 요약은 evidence가 아님.
- 넓은 플랫폼 scaffolding보다 워크플로우 의미를 입증하는 작은 수직 슬라이스를 선호하기.
- 자동 생성은 제안/업데이트 생성이며, 전략적 결정의 리뷰어는 Jimmy임.
