# GLOSSARY — CAW-02 Knowledge Repository

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [PRODUCT-BRIEF.md](./PRODUCT-BRIEF_ko.md)
  - [DOC-CONVENTIONS.md](./DOC-CONVENTIONS_ko.md)
  - [ADR-0003 data model](../01-decisions/ADR-0003-knowledge-data-model_ko.md)
  - [ADR-0004 provenance & trust](../01-decisions/ADR-0004-provenance-and-trust_ko.md)
  - [provenance & trust models (research)](../02-research/provenance-and-trust-models_ko.md)
- **Source of truth:** ./PRODUCT-BRIEF_ko.md

## Purpose

이것은 CAW-02의 **ubiquitous language**(보편 언어)입니다. 용어당 하나의 권위 있는 정의를 두며, 설계 문서,
runbook, 코드, 스키마, skill-wrap surface 전반에서 동일하게 사용됩니다. 어휘를 정의할 뿐 아키텍처를 다시
결정하지 않으며(링크된 ADR 참조) 브리프의 제약을 재서술하지도 않습니다. 이 제품의 `design/` 어디에서든 어떤
용어가 등장하면, 그것은 여기서의 의미와 정확히 같아야 합니다. 미상의 항목은 `TODO(open-question: ...)`로
표시하며, 여기 어떤 것도 사실·날짜·수치를 지어내지 않습니다.

아래에서 사용하는 규약: **entity** = 하나의 markdown 파일로 영속되는 타입화된 knowledge node, **edge** =
node 간의 타입화된 관계, **op** = skill-wrap operation. 대문자로 시작하는 용어(Source, Claim, …)는 entity
type입니다.

---

## 1. Entity 타입 (knowledge node들)

각 entity는 정확히 하나의 markdown 파일입니다: YAML frontmatter(기계 계약) + markdown body(사람용
note). `knowledge/<type>/` 아래에 저장됩니다. 스키마는 [ADR-0003](../01-decisions/ADR-0003-knowledge-data-model_ko.md)을,
저장 레이아웃은 [ADR-0002]를 참조하세요. 모든 쓰기는 append-only + supersedes입니다 — 절대 in-place 업데이트가 아닙니다.

| Term | Definition | Key rule |
|------|-----------|----------|
| **Source** | 정보의 구체적 출처: 논문, URL, 데이터셋, 내부 문서, import된 CAW-01 projection, 또는 CAW-05 신호 레코드. 항상 path/URI로 실제 artifact를 참조합니다. | Source는 카탈로그화되는 것이지 존재로 요약되는 것이 아닙니다. 생성된 요약은 결코 Source가 아닙니다. |
| **Claim** | 저장소가 보유하는 단일하고 원자적이며 반증 가능한 단언("X는 Z 조건에서 Y를 개선한다"). 지식의 중심 단위. | **Invariant:** 모든 Claim은 ≥1개의 Evidence를 가리켜야 합니다(evidence gate). AI가 작성한 Claim은 trust T2로 상한이 걸립니다. |
| **Evidence** | Claim을 구체적 artifact(Source, Trace, SimulationRun, Experiment, 또는 그 안의 특정 span)에 묶는 구조적 링크. | **prose field가 없습니다**. `artifact_ref`는 실제 artifact로 resolve되어야 합니다. Note/요약은 결코 Evidence가 될 수 없습니다. |
| **Note** | Claim들을 해석/결합하는 사람-또는-AI 작성 서술("X에 대해 우리가 아는 것"). | Note는 자신이 기대는 Claim들을 **인용(cite)**해야 합니다. Note는 결코 Evidence가 아니며 Claim을 대체하지 않습니다. |
| **Concept** | 조직화와 검색을 위해 Claim, Note, Source가 부착하는 재사용 가능한 주제/태그/용어(예: "sparse attention"). | Concept는 일급 검색 필터이지 자유 텍스트 키워드가 아닙니다. |
| **Interest** | Jimmy/팀이 추적하는 상시 영역. intake와 radar 연계를 조종하기 위해 Concept/OpenQuestion을 묶습니다. | provenance가 아니라 우선순위화를 주도합니다. |
| **OpenQuestion** | 명시적으로 기록된 미상("X가 Y에 대해 성립하는가?"). Claim/Evidence가 쌓이면 그것들과 연결될 수 있습니다. | 설계 문서의 미상은 `TODO(open-question: ...)`를 사용합니다. OpenQuestion은 store 내의 entity 형태입니다. |
| **Decision** | 근거가 있는 기록된 선택. 그것이 기대는 Evidence/Claim/Assumption에 연결됩니다. | 전략적 결정은 Jimmy가 리뷰합니다(guardrail). 재구성 가능하게 유지됩니다. |
| **Assumption** | 충분한 Evidence 없이 (아직) 참으로 받아들여진 전제. 그것에 의존하는 Claim/Decision과 연결 가능합니다. | Claim과 구별됨: Assumption은 명시적으로 *입증되지 않은* 것입니다. 승격하려면 Evidence를 부착해야 합니다. |
| **Trace** | CAW-01 실행/agent trace에 대한 **import된 artifact 참조**. Evidence로 쓰일 수 있도록 카탈로그화됩니다. | path/URI로 참조됩니다. CAW-02는 카탈로그화할 뿐 결코 실행하지 않습니다. |
| **SimulationRun** | CAW-01 simulation run/projection에 대한 import된 artifact 참조. Evidence로 사용 가능. | quarantine + boundary 체크 하에 import됩니다. 큰 artifact는 path로 저장됩니다. |
| **Experiment** | 실험 레코드/결과 집합에 대한 import된 artifact 참조. Evidence로 사용 가능. | Trace/SimulationRun과 동일한 import 규율. |
| **RelatedWork** | (흔히 CAW-05에서 오는) intake 신호: store로 매핑된 외부 작업으로, 어떤 Claim을 지지/위협하는 것으로 분류 가능. | 느슨한 요약이 아니라 Source/Claim/OpenQuestion 링크가 됩니다. |
| **RadarSignal** | CAW-05 radar에서 오는 intake 신호: store로 매핑된 감지된 트렌드/이벤트로, threat/support로 분류됩니다. | envelope를 통해 import됩니다. 결코 맹목적으로 신뢰되지 않습니다(quarantine-on-import). |

---

## 2. 관계 & 구조

| Term | Definition |
|------|-----------|
| **edge (typed relation)** | 두 entity 사이의 방향성 있는 타입화된 링크. 하나의 일반화된 타입화 edge 테이블/표현(graph 업그레이드 대비)에 저장됩니다. edge 타입의 예: `cites`, `supports`, `contradicts`, `derived_from`, `attaches_evidence`, `about_concept`, `supersedes`, `answers`. 단일 테이블 설계는 향후 Postgres/Apache-AGE 포팅 시 데이터를 다시 쓰지 않고 쿼리 엔진만 교체할 수 있게 합니다. [ADR-0003](../01-decisions/ADR-0003-knowledge-data-model_ko.md) 참조. |
| **node** | knowledge graph의 꼭짓점으로서의 entity 인스턴스(§1). |
| **provenance chain** | 합성이 어떻게 도출되었는지를 기록하는 재구성 가능한 경로 `Source → Claim → Evidence → Note`(plus edge들). 검색은 불투명 텍스트를 반환하는 대신 이 체인을 **hydrate**합니다. |

---

## 3. Provenance, trust & boundary

[ADR-0004](../01-decisions/ADR-0004-provenance-and-trust_ko.md)와
[research notes](../02-research/provenance-and-trust-models_ko.md)를 참조하세요.

| Term | Definition |
|------|-----------|
| **evidence gate** | Claim이 resolve 가능한 Evidence 없이는 존재할 수 없다는 skill-wrap 내의 구조적 강제: `attach_evidence`에는 **prose field가 없으며**, `artifact_ref`는 실제 artifact로 resolve되어야 합니다. 이로써 "생성된 요약 ≠ evidence"가 권고가 아닌 기계적 규칙이 됩니다. Claim→Evidence invariant는 세 개의 lockstep 레이어에서 검사됩니다: frontmatter 스키마, core validator, reindex 재검사. |
| **provenance (two-layer)** | PROV 형태의 모델: entity/artifact 레이어와 그것을 생산한 activity/agent 레이어를 타입화된 edge 집합으로 연결합니다. 모든 node에 대해 *누가/무엇이/무엇으로부터*를 기록합니다. |
| **trust ladder (T0–T3, contested)** | Claim별로 (손으로 설정하지 않고) 파생되는 작은 trust 등급: **T0** 미검증/raw → **T1** 단일 출처/약함 → **T2** 교차 확증됨 → **T3** 강하게 확증됨/권위 있음. 더해서 지지 Evidence와 반박 Evidence가 공존하면 **contested**. Trust는 *재계산*되며 자유롭게 편집되지 않습니다. **AI가 작성한 콘텐츠는 T2로 상한이 걸립니다.** |
| **contested** | 지지 Evidence와 반박 Evidence를 모두 가진 Claim의 trust 상태. 조용히 해소되지 않고 플래그됩니다. |
| **boundary** | 두 직교 민감도 축 중 하나: `public` / `internal` / `confidential`. export 안전성을 관장합니다(public 출력에 confidential 데이터 없음). |
| **visibility (team / private)** | 두 번째 직교 축: `team`(팀과 공유) vs `private`(Jimmy 전용). `boundary`와 독립적입니다 — 항목은 boundary와 visibility를 모두 가집니다. |
| **monotone propagation** | 합성물에 대해 계산된 boundary/visibility가 그 입력만큼은 제한적이어야 한다는 규칙: 합성은 민감도를 **결코 낮추지 않습니다**(예: confidential Claim을 인용하는 Note는 public이 될 수 없음). |
| **quarantine-on-import** | import된 artifact/신호는 node로 매핑되기 전 confidentiality 체크를 거치는 보류 상태로 들어옵니다. import된 것은 기본적으로 신뢰되거나 표시되지 않습니다. |
| **filter-on-export (fail-loud / fail-closed)** | export는 **fail-closed allow-list**에 대해 confidentiality 필터를 적용합니다: 명시적으로 허용되지 않은 것은 보류되며, 비허용 항목은 누출되는 대신 시끄럽게(fail-loud) 실패합니다. |

---

## 4. surface (skill-wrap & core)

[ADR-0001 surface]와 [ADR-0005 ingestion]을 참조하세요.

| Term | Definition |
|------|-----------|
| **product core** | 모든 로직을 소유하는 단일 트랜잭션 컴포넌트: 검증, evidence gate, trust 재계산, boundary/visibility 전파, append-only audit. API, MCP, CLI는 하나의 op manifest에서 codegen된 **얇은 adapter**이며 로직을 추가하지 않습니다. |
| **skill-wrap** | 사람과 agent가 provenance를 훼손하지 않고 지식 트랜잭션(`add_source`, `extract_claim`, `attach_evidence`, `synthesize_note`, `classify_signal`, …)을 수행하는, 안전하고 검증된 인터페이스. 각 op은 invariant를 강제하며, agent의 쓰기는 **confirmation-by-default**입니다. |
| **op (operation)** | op manifest에 한 번 정의되는 검증된 단일 skill-wrap 액션. API/MCP/CLI adapter가 그것으로부터 생성되어 모든 surface가 동일하게 동작합니다. |
| **transaction** | provenance를 보존하는 하나의 지식 변경(예: `add source → extract claim → attach evidence → synthesize note`). 가치의 단위로, 완전히 기록되거나(entity 파일 + event + edge) 전혀 기록되지 않습니다. |
| **confirmation-by-default** | agent가 시작한 쓰기는 수락 전 명시적 확인/리뷰를 요구합니다. v0에는 **조용한 자동 수락이 없습니다**. 거절된 후보는 audit를 위해 보존될 수 있습니다. |
| **ingestion pipeline** | 6단계 흐름 `add-source → parse → extract Claim-candidates → attach Evidence → synthesize Note (cited) → classify/link signal`. 각 단계는 provenance를 부착하며 결코 Claim→Evidence를 위반하지 않습니다. |

---

## 5. 저장, audit & 검색

[ADR-0002 storage], [ADR-0006 retrieval], [ADR-0007 import/export]를 참조하세요.

| Term | Definition |
|------|-----------|
| **single source of truth** | git 내의 markdown 파일. 쿼리 가능한 모든 것은 그것에서 파생됩니다. |
| **frontmatter** | 각 entity 파일 상단의 YAML 블록: 기계 계약(type, id, boundary, visibility, edge, trust 입력). 그 아래의 markdown body는 사람용 note입니다. |
| **reindex** | markdown 파일로부터 SQLite 인덱스(및 FTS/vector 마이그레이션)를 재구축하는 결정론적·멱등 프로세스. 재구축 가능하므로 SQLite는 **파생이며 폐기 가능**합니다. reindex는 Claim→Evidence invariant도 재검사합니다. |
| **derived index** | reindex가 생산하는 SQLite 데이터베이스(관계형 + FTS, 선택적 vector sidecar). 결코 권위 있지 않으며, 드롭하고 재구축해도 안전합니다. |
| **_events log** | 모든 skill-wrap 쓰기를 미러링하는 append-only `knowledge/_events/<ts>-<op>.jsonl` 스트림. 서명된 git commit/blame과 함께 audit trail을 구성합니다. |
| **append-only** | 쓰기는 추가만 합니다. 지식의 파괴적 update/delete가 없습니다. 정정은 supersedes를 통해 이루어집니다. |
| **supersedes** | 지식을 변경하는 메커니즘: 새 버전을 작성하고 `supersedes` edge가 이전 entity를 가리키며, 그 이전 entity는 보존됩니다. 이력과 재구성 가능성을 보존합니다. |
| **audit trail** | `_events` log + 서명된 git history(commit/blame)의 조합으로, 어떤 상태든 재구성하고 귀속할 수 있게 합니다. |
| **FTS5** | SQLite의 전문 검색(BM25 랭킹). v0의 텍스트 검색 엔진으로, 관계형 인덱스와 공존합니다. Postgres 포팅 후의 등가물은 `tsvector`/GIN입니다. |
| **structured filters** | 랭킹 **이전에** 적용되는 일급 쿼리 제약(boundary, visibility, type, trust, concept). post-filter가 아닙니다. |
| **citation-constrained RAG** | **Claim + Evidence**(와 hydrate된 provenance chain)를 반환하고 불투명 텍스트 덩어리는 결코 반환하지 않는 retrieval-augmented generation. 답변은 artifact까지 추적 가능하게 유지됩니다. |
| **vector sidecar** | RESERVED이며 드롭 가능한 embeddings 스키마. **v0에는 embeddings가 없습니다**. sqlite-vec/pgvector는 측정된 recall/precision 트리거가 발동될 때만 추가됩니다. `TODO(open-question: define the trigger thresholds)`. |

---

## 6. Import / export

[ADR-0007 import/export]를 참조하세요. 이들 모두는 **독립적인 제품들** 사이의 file/API boundary입니다 —
**공유 store, registry, substrate가 없습니다**.

| Term | Definition |
|------|-----------|
| **import/export envelope** | 제품 boundary를 넘어 지식을 옮기는 데 쓰이는 file-artifact-first, **버전화된** 컨테이너. 번들은 **서명**되며 provenance manifest를 동반합니다. 어느 방향으로든 횡단하면 re-redaction이 트리거됩니다. |
| **redaction (re-redaction)** | **모든** boundary 횡단 시(import과 export 양쪽) 비허용(예: confidential) 콘텐츠를 필수로 제거/마스킹 — 이전에 redaction이 이루어졌더라도. |
| **provenance manifest** | (양방향으로) envelope에 동반되는 메타데이터로, origin, boundary, 각 항목의 provenance를 기술합니다. 수신자가 검증하고 자신의 규칙을 재적용할 수 있게 합니다. |
| **CAW-01** | 별개의 제품(simulation/runs). CAW-02는 quarantine + boundary 체크 하에 그 projection/trace를 Evidence(Trace/SimulationRun/Experiment)로 **import**합니다. |
| **CAW-05** | 별개의 제품(radar). CAW-02는 그 radar/related-work 신호를 Source/Claim/OpenQuestion/RelatedWork/RadarSignal로 **import**합니다. |
| **CAW-03** | 별개의 제품(논문/특허 초안 작성). CAW-02는 인용된 Claim+Evidence 번들을 fail-closed allow-list를 통해 그것으로 **export**합니다. |

---

## 7. 횡단 관심사 용어

| Term | Definition |
|------|-----------|
| **invariant** | 항상 성립해야 하는 속성. 중심 invariant는 **Claim→Evidence (≥1)**이며, 세 개의 lockstep 레이어(frontmatter 스키마, core validator, reindex 재검사)에서 강제됩니다. |
| **artifact** | path/URI로 참조되는 구체적이고 주소 지정 가능한 것(파일, URL, 데이터셋, run 출력). Evidence는 그것으로 resolve되어야 합니다. |
| **artifact_ref** | Evidence 레코드 상의 resolve 가능한 포인터(path/URI/locator). 실제 artifact로 resolve되어야 합니다. |
| **agent** | skill-wrap을 사용하는 AI 행위자. confirmation-by-default와 작성 콘텐츠의 T2 trust 상한의 대상입니다. |
| **curator** | agent 제안을 리뷰하고 전략적 Decision을 소유하는 사람(Jimmy). |

---

## Open Questions

- Vector 검색 트리거 임계값. `TODO(open-question: recall/precision triggers that justify embeddings)`
- 정확한 trust-ladder 재계산 공식(corroboration 수 → T0–T3). `TODO(open-question)`
- 최종 edge-type 어휘의 확정. `TODO(open-question: enumerate the canonical edge types)`
- [08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) 참조.

## Implications for runbooks

- Runbook은 이 정확한 term/entity 이름을 사용해야 합니다(DOC-CONVENTIONS §7에 따라).
- Schema, validator, reindex runbook은 모두 여기 정의된 **동일한** Claim→Evidence invariant를 참조합니다.
- 코드의 skill-wrap op 이름은 §4의 op 어휘와 일치해야 합니다.
