# Knowledge Core — Entity & Edge Model

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./overview_ko.md](./overview_ko.md)
  - [./claim-evidence-and-evidence-gate_ko.md](./claim-evidence-and-evidence-gate_ko.md)
  - [../01-decisions/ADR-0003-knowledge-data-model_ko.md](../01-decisions/ADR-0003-knowledge-data-model_ko.md)
  - [../01-decisions/ADR-0004-provenance-and-trust_ko.md](../01-decisions/ADR-0004-provenance-and-trust_ko.md)
  - [../01-decisions/ADR-0002-storage_ko.md](../01-decisions/ADR-0002-storage_ko.md)
  - [../02-research/provenance-and-trust-models_ko.md](../02-research/provenance-and-trust-models_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF_ko.md

## Purpose
이 문서는 knowledge core가 동작 대상으로 삼는 **typed entity 집합(nodes)**과 **typed edge 어휘(relations)**를 깊이 있게 규정하고, 그 형태가 어떻게 **graph-upgrade에 대비(graph-upgrade-ready)**되어 있는지를 규정한다. 이 문서는 어휘를 고정하는 [ADR-0003](../01-decisions/ADR-0003-knowledge-data-model_ko.md)과 provenance edge의 무결성 의미를 고정하는 [ADR-0004](../01-decisions/ADR-0004-provenance-and-trust_ko.md)를 상세히 풀어쓴다. 이 문서는 Claim→Evidence 강제의 세부는 다시 서술하지 않으며(그것은 형제 문서 [claim-evidence-and-evidence-gate_ko.md](./claim-evidence-and-evidence-gate_ko.md)이다), 물리적 저장도 결정하지 않는다(ADR-0002).

## 1. 모델링 입장(stance)
- 모든 것은 **typed node**이고; 모든 관계는 **generic typed edge** `edge(src_id, dst_id, rel)`이다. 이 단일 결정(ADR-0002/0003)이 미래의 property-graph(Apache AGE / Postgres)를 *데이터 재작성이 아니라 query-engine 교체*로 만들어준다.
- 노드는 **append-only**이다; 수정은 `supersedes`로 연결된 새 노드이다.
- `trust`, `boundary`, `visibility`는 **core에 의해 도출/전파**되며, 호출자가 설정하지 않는다(ADR-0004).
- md frontmatter(source of truth)와 도출된 인덱스의 `node`/`edge` row는 reindex에 의해 **보조를 맞춰(lockstep)** 유지된다.

## 2. 공통 노드 필드
모든 노드는 — `kind`와 무관하게 — 이 계약을 지닌다(YAML frontmatter와 인덱스 `node` row에 동일하게 반영됨):
```yaml
id:            clm_2026_<hash>        # stable; also the .md filename id
kind:          claim                  # see §3 enum
boundary:      internal               # public | internal | confidential   (default-deny: internal)
visibility:    private                # team | private                      (default: private)
status:        needs_evidence         # proposed | accepted | needs_evidence | rejected | superseded
generated:     false                  # true for Note + any LLM-proposed candidate
trust:         T0                      # T0..T3 | contested   — DERIVED, never caller-set
artifact_uri:  null                   # path/URI for evidence/trace/sim/experiment; null otherwise
created_by:    agent id               # human or skill name (who wrote this version)
attributed_to: agent id               # origin author (may differ on import)
created_via:   evt_<id>               # the provenance_event/activity that wrote it
content_hash:  <sha>                  # detects file <-> index drift
created_at:    2026-..T..Z
```

## 3. Entities (nodes)
### 3.1 Assertion-layer entities
| Entity | `kind` | Role | Asserts? | Key links |
|---|---|---|---|---|
| **Source** | `source` | 원시 입력(논문/기사/노트) 또는 import된 artifact 참조. | No | `extracted_from`의 대상 |
| **Claim** | `claim` | 단일한 주장 문장. **evidence 없이는 무효.** | Yes | `evidence_for`(in), `about_concept`, `addresses`, `supersedes` |
| **Evidence** | `evidence` | Claim에서 구체적인 artifact/source 구간으로 향하는 포인터; `artifact_uri` + locator + stance를 지님. **결코 자유 텍스트가 아님.** | No (가리킴) | `evidence_for`/`challenges` → Claim, `extracted_from` → Source/artifact |
| **Note** | `note` | accepted된 Claim들에 대한 생성된 synthesis; `generated=true`. **결코 evidence가 아님.** | No | `cites` → Claim/Evidence, `derived_from` |
| **Concept** | `concept` | retrieval을 위한 주제 앵커("X에 대해 우리가 무엇을 아는가"). | No | `about_concept`(in) |
| **Interest** | `interest` | intake 우선순위 결정에 쓰이는 curator/team의 상시 관심사. | No | `relates_to` → Concept |
| **OpenQuestion** | `open_question` | 미해결 긴장; 수동 또는 threat 신호에 의해 자동 제기됨. | No | `addresses`(in), `relates_to` |
| **Decision** | `decision` | evidence와 연결된 채로 보관되는 기록된 결정. | No | `addresses`(in) |
| **Assumption** | `assumption` | claim/decision을 떠받치는 명시된 가정. | No | `relates_to`, `addresses` |

### 3.2 Import된 artifact 참조 entity (여기서는 카탈로그만 하고 결코 실행하지 않음 — brief §5/§7)
| Entity | `kind` | Role |
|---|---|---|
| **Trace** | `trace` | CAW-01 execution-trace artifact에 대한 참조(`artifact_uri`로). |
| **SimulationRun** | `simulation_run` | CAW-01 simulation run / projection artifact에 대한 참조. |
| **Experiment** | `experiment` | experiment artifact에 대한 참조. |

이들은 유효한 `extracted_from` 대상이지만(Claim의 Evidence가 `SimulationRun`을 가리킬 수 있다) **결코 Claim이 아니며** **결코 인라인되지 않는다** — URI/path로 참조될 뿐이다(brief §6/§7; wire 세부는 [ADR-0007](../01-decisions/ADR-0007-import-export-contracts_ko.md)).

### 3.3 Intake-signal entity (brief §5/§7; ADR-0005 Pipeline B)
| Entity | `kind` | Role |
|---|---|---|
| **RelatedWork** | `related_work` | 우리 claim에 영향을 미치는 것으로 분류된 외부 연구; 느슨한 요약이 아니라 typed된 *stanced link target*. |
| **RadarSignal** | `radar_signal` | 분류 전/후의 CAW-05 radar intake 항목(paper/preprint/patent/blog/release). |

## 4. Edges (typed relations)
하나의 generic `edge(src_id, dst_id, rel)` 테이블이 모든 relation을 담는다. 어휘는 **닫혀(closed)** 있다(여기서 고정됨); relation을 추가하는 것은 임시 쓰기가 아니라 의도적인 모델 변경이다.

| `rel` | From → To | Meaning | Integrity role |
|---|---|---|---|
| `evidence_for` | Evidence → Claim | 이 evidence가 claim을 뒷받침함. | **불변식의 방향** (Claim 승격에 ≥1개 필요). |
| `challenges` | Evidence → Claim | 이 evidence가 claim을 반박함. | threat/support + `contested` trust를 구동(ADR-0005 B). |
| `extracted_from` | Evidence → Source\|Trace\|SimulationRun\|Experiment | evidence가 가리키는 구체적 artifact. | Evidence는 반드시 여기로 해석되어야 하며, 결코 산문/`note`로 해석되지 않음. |
| `cites` | Note → Claim\|Evidence | synthesis가 근거로 삼는 것을 인용함. | Note의 lineage; 결코 evidence edge가 아님. |
| `derived_from` | Note\|Claim → Source\|Claim | PROV `wasDerivedFrom` lineage. | 재구성 가능성; boundary 전파에 참여. |
| `about_concept` | Claim\|Source\|Note → Concept | retrieval을 위한 주제 인덱싱. | — |
| `addresses` | Claim\|Evidence → OpenQuestion\|Decision\|Assumption | findings를 decision/question에 연결. | decision을 재구성 가능하게 유지(use case 6). |
| `relates_to` | any → any | 약한 연관(Interest↔Concept 등). | 비-load-bearing; trust/boundary에 쓰이지 않음. |
| `supports` | RelatedWork\|RadarSignal → Claim | 외부 신호가 우리 claim을 보강함. | intake 쪽 stance(Evidence와 구별됨). |
| `refutes` | RelatedWork\|RadarSignal → Claim | 외부 신호가 우리 claim을 위협함. | `OpenQuestion`을 자동 제기. |
| `supersedes` | any vN → any vN-1 | append-only 수정 체인. | 최신 버전 해석. |
| `attributed_to` | any → Agent | 누가/무엇이 생성했는가(사람 vs AI skill). | trust 상한(AI 단독 ≤ T2). |

> 명명: ADR-0003은 snake_case relation 이름(`evidence_for`, `extracted_from`, `derived_from`, `about_concept`)을 사용하고; [ADR-0004](../01-decisions/ADR-0004-provenance-and-trust_ko.md)와 research 문서는 동일한 edge를 PROV camelCase(`supports`/`evidenceOf`/`derivedFrom`/`aboutConcept`)로 참조한다. 이들은 **같은 edge**이며; core는 ADR-0003의 snake_case 식별자를 정본(canonical)으로 사용한다. TODO(open-question: confirm one canonical spelling in `GLOSSARY.md`).

### 4.1 Endpoint legality (어떤 (kind, rel, kind) 삼중쌍이 허용되는가)
core는 이 matrix를 위반하는 endpoint를 가진 edge를 거부한다(발췌; 전체 집합은 validator로 생성됨):
```
evidence_for   : evidence       -> claim
challenges     : evidence       -> claim
extracted_from : evidence       -> {source, trace, simulation_run, experiment}
cites          : note           -> {claim, evidence}
derived_from   : {note, claim}  -> {source, claim}
about_concept  : {claim, source, note} -> concept
addresses      : {claim, evidence}     -> {open_question, decision, assumption}
supports       : {related_work, radar_signal} -> claim
refutes        : {related_work, radar_signal} -> claim
supersedes     : X -> X        (same kind, older version)
attributed_to  : *  -> agent
```
**Hard structural rule (제품의 척추):** `kind=note`인 노드는 `evidence_for` 또는 `extracted_from`의 `src`가 **결코** 될 수 없다. 이것이 "생성된 synthesis는 evidence가 아니다"의 구조적 형태이며 core link validator에 의해 거부된다 — 전체 다룸은 [claim-evidence-and-evidence-gate_ko.md](./claim-evidence-and-evidence-gate_ko.md).

## 5. 작동 예제 (가치의 단위)
core ingestion 트랜잭션 `add source → extract claim → attach evidence → synthesize note (cited)`는 다음을 생성한다:
```
src_001 (source)
   ^ extracted_from
ev_001 (evidence, artifact_uri=src_001#p3, stance=supports)
   | evidence_for
clm_001 (claim, status=accepted, trust=T1)  --about_concept--> cpt_attention (concept)
   ^ cites
note_001 (note, generated=true)  --cites--> ev_001   --derived_from--> src_001
```
`clm_001`의 trust는 도출된다(해석되는 source 하나 → T1). `note_001`은 evidence edge를 지니지 않는다 — `cites`와 `derived_from`만 가질 수 있다. `note_001`의 boundary = ADR-0004 전파에 따른 도달 가능한 모든 조상의 boundary의 max값.

## 6. Graph-upgrade 준비도
이 모델은 v2(property graph)가 마이그레이션이 아니라 query/engine 교체가 되도록 설계되었다:

| Concern | v0 (SQLite, derived index) | v2 (Postgres / Apache AGE) | Migration cost |
|---|---|---|---|
| Nodes | `node` rows ← md frontmatter | graph vertices (same fields) | md에서 reindex (SOT 불변) |
| Edges | `edge(src,dst,rel)` rows | typed graph edges (same triples) | md에서 reindex (SOT 불변) |
| Reconstruct traversal | `edge`에 대한 recursive CTE | native graph traversal / openCypher | 데이터가 아니라 쿼리를 재작성 |
| Trust/boundary recompute | edge row에 대한 core 함수 | graph edge에 대한 core 함수 | 동일 core, 새 edge accessor |

**git의 markdown 파일이 단일 source of truth**이고(ADR-0002) 인덱스는 일회용이므로, 업그레이드는 다음과 같다: 새 엔진을 세우고, reindex를 `knowledge/**`로 향하게 하고, 기존 인덱스를 버린다. 닫힌 edge 어휘와 endpoint-legality matrix는 property graph가 원하는 바로 그 스키마이다.

## Open Questions
- TODO(open-question: ID scheme — content-addressed hash vs sequential slug; owned with ADR-0002.)
- TODO(open-question: `claim_type` taxonomy — {empirical/methodological/definitional/comparative/normative} sufficient? owned with ADR-0005.)
- TODO(open-question: canonical relation spelling — snake_case (ADR-0003) vs PROV camelCase (ADR-0004); resolve in GLOSSARY.)
- TODO(open-question: do we persist rejected Claim candidates as nodes for audit, and under what boundary? ADR-0005.)
- See [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md).

## Implications for runbooks
- **RB (schema):** 위의 필드/relation으로 `node` + `edge` (+ `provenance_event`)를 생성한다; `boundary`/`visibility`는 default-deny 기본값과 함께 NOT NULL; 이식 가능한 SQLite∩Postgres 부분집합(ADR-0002).
- **RB (link validator):** endpoint-legality matrix(§4.1)를 core validator로 생성한다; 불법 삼중쌍을 거부한다.
- **RB (model docs):** §3/§4로부터 `GLOSSARY.md`를 생성하여 용어가 정확히 사용되도록 한다(DOC-CONVENTIONS §7).
- **RB (graph upgrade, deferred):** 변경되지 않은 md SOT를 소비하는 reindex-into-AGE 경로.
