# ADR-0003: 지식 데이터 모델과 Claim→Evidence 불변식

- **Status:** proposed
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [../_meta/PRODUCT-BRIEF_ko.md](../_meta/PRODUCT-BRIEF_ko.md) (단일 진실 공급원)
  - [ADR-0001-product-surface-and-skill-interface_ko.md](ADR-0001-product-surface-and-skill-interface_ko.md)
  - [ADR-0002-storage_ko.md](ADR-0002-storage_ko.md) (계획됨)
  - [ADR-0004-provenance-and-trust_ko.md](ADR-0004-provenance-and-trust_ko.md) (계획됨)
  - [ADR-0005-ingestion-pipeline_ko.md](ADR-0005-ingestion-pipeline_ko.md)
  - [ADR-0006-import-export-contracts_ko.md](ADR-0006-import-export-contracts_ko.md) (계획됨)
  - [../02-research/provenance-and-trust-models_ko.md](../02-research/provenance-and-trust-models_ko.md)
  - [../02-research/knowledge-store-storage-options_ko.md](../02-research/knowledge-store-storage-options_ko.md)
  - [../02-research/ingestion-and-extraction_ko.md](../02-research/ingestion-and-extraction_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적
**지식 데이터 모델**을 고정한다: 일급(first-class) 엔티티들, 그들 사이의 타입 명시된 관계, 엔티티별 필드, 그리고 —
제품의 핵심인 — **`Claim → Evidence` 불변식**과 그것이 강제되는 지점. 물리적 저장 포맷(ADR-0002 — md 우선 단일
진실 공급원 + 재구축 가능한 인덱스), trust 레벨 재계산 규칙(ADR-0004), 수집 단계 메커니즘(ADR-0005),
import/export 와이어 스키마(ADR-0006)는 결정하지 **않는다**. 이 ADR은 그 ADR들이 상술하는 공유 어휘이다.

## 배경
- 브리프 §5는 **일급이며 분리되어야** 하는 엔티티들을 지목한다, 이들을 뒤섞는 것이 바로 제품이 막기 위해
  존재하는 실패이기 때문이다: 생성된 요약을 evidence로 착각하는 것.
- 불변식(§5): **`Claim`은 `Evidence`를 가리켜야 한다; `Evidence`는 자유 텍스트가 아니라 구체적인
  아티팩트/source를 참조한다.** 생성된 합성물(`Note`)은 결코 evidence가 아니다(§10).
- 모델은 **재구성 가능성**(§5: 합성이 어떻게 도달되었는지 재생(replay))을 지원해야 하며 **재작성 없이 그래프 /
  지속 학습 모델로 업그레이드 가능**하게 유지되어야 한다(§5, §6).
- 일부 엔티티는 다른 제품(CAW-01 trace/run)이 소유한 아티팩트에 대한 **import된 참조**이다: 여기서 카탈로그화될 뿐
  여기서 실행되지 않는다(§5, §7).
- 저장(ADR-0002)은 이미 모든 엔티티를 `node`로, 모든 관계를 범용 타입 명시 `edge`로 모델링하기로 약속하여 미래의
  그래프가 데이터 마이그레이션이 아니라 질의 엔진 변경이 되도록 한다. 이 ADR은 그 테이블을 채우는 *kind*와
  *relation*을(그리고 그에 상응하는 md frontmatter를) 정의한다.

## 엔티티 (노드)
모든 엔티티는 **append-only**이다; 정정은 `supersedes`로 연결된 새 버전이다(ADR-0001). 모든 엔티티는 아래 표의
공통 provenance/boundary 필드를 운반한다.

### Assertion 레이어 엔티티
| Entity | `kind` | Role | Key typed links (relations 참조) |
|---|---|---|---|
| **Source** | `source` | 원시 입력: 논문/기사/노트, 또는 import된 아티팩트 참조. 그 자체로는 아무것도 주장하지 않음. | `extracted_from`, `evidence_of`의 대상 |
| **Claim** | `claim` | 단일 주장된 진술. **evidence 없이는 무효.** | `evidence_for`(in), `about_concept`, `addresses`, `supersedes` |
| **Evidence** | `evidence` | Claim에서 **구체적 아티팩트/source 구간(span)**으로의 포인터. `artifact_uri` + 위치자(locator) + 입장(stance)을 운반. 결코 자유 텍스트가 아님. | `evidence_for` → Claim, `extracted_from` → Source/아티팩트 |
| **Note** | `note` | 수용된 Claim들에 대한 생성된 합성물. `generated=true`. **결코 evidence가 아님.** | `cites` → Claim/Evidence |
| **Concept** | `concept` | retrieval을 위한 주제 앵커("X에 대해 무엇을 아는가"). | `about_concept`(in) |
| **Interest** | `interest` | 수집 우선순위 결정에 쓰이는 큐레이터/팀의 상시 관심사. | `relates_to` → Concept |
| **OpenQuestion** | `open_question` | 미해결 긴장; 수동으로 제기되거나 위협 신호에 의해 자동 제기됨. | `addresses`(in), `relates_to` |
| **Decision** | `decision` | 그 evidence에 연결된 채로 보관되는 기록된 결정. | `addresses`(in) |
| **Assumption** | `assumption` | claim/decision을 뒷받침하는 진술된 가정. | `relates_to`, `addresses` |

### Import된 아티팩트 참조 엔티티 (여기서 카탈로그화될 뿐 실행되지 않음 — 브리프 §5/§7)
| Entity | `kind` | Role |
|---|---|---|
| **Trace** | `trace` | CAW-01 실행 trace 아티팩트에 대한 참조(`artifact_uri`로). |
| **SimulationRun** | `simulation_run` | CAW-01 시뮬레이션 run / projection 아티팩트에 대한 참조. |
| **Experiment** | `experiment` | 실험 아티팩트에 대한 참조. |

이들은 유효한 **`evidence_of` / `extracted_from` 대상**이지만(Claim의 Evidence가 SimulationRun을 가리킬 수 있음),
**결코** Claim이 아니며 결코 인라인되지 않는다 — URI/경로로만 참조된다(브리프 §6/§7, ADR-0006).

### 수집 신호(Intake-signal) 엔티티 (브리프 §5/§7; ADR-0005 Pipeline B)
| Entity | `kind` | Role |
|---|---|---|
| **RelatedWork** | `related_work` | 우리 claim에 영향을 미치는 것으로 분류된 외부 작업; 느슨한 요약이 아니라 **타입 명시되고 입장이 있는 링크 대상**. |
| **RadarSignal** | `radar_signal` | 분류 전/후의 CAW-05 radar 수집 항목(논문/preprint/특허/블로그/릴리스). |

## 관계 (엣지)
하나의 범용 타입 명시 `edge(src_id, dst_id, rel)` 테이블(ADR-0002)이 이 모두를 운반한다. 관계 어휘는 여기서
고정된다; provenance edge의 *무결성 의미*는 ADR-0004가 소유한다.

| `rel` | From → To | Meaning |
|---|---|---|
| `evidence_for` | Evidence → Claim | 이 evidence가 claim을 뒷받침함. **불변식의 방향.** |
| `challenges` | Evidence → Claim | 이 evidence가 claim과 모순됨(위협/지지 동력, ADR-0005 B). |
| `extracted_from` | Evidence → Source\|Trace\|SimulationRun\|Experiment | evidence가 가리키는 구체적 아티팩트. |
| `cites` | Note → Claim\|Evidence | 합성물이 근거로 삼는 것을 인용. |
| `derived_from` | Note\|Claim → Source\|Claim | 계보(PROV `wasDerivedFrom`); 재구성 가능성. |
| `about_concept` | Claim\|Source\|Note → Concept | retrieval을 위한 주제 인덱싱. |
| `addresses` | Claim\|Evidence → OpenQuestion\|Decision\|Assumption | 발견을 결정에 연결. |
| `relates_to` | any → any | 약한 연관(Interest↔Concept 등). |
| `supports` | RelatedWork\|RadarSignal → Claim | 외부 신호가 우리 claim을 입증. |
| `refutes` | RelatedWork\|RadarSignal → Claim | 외부 신호가 우리 claim을 위협(OpenQuestion 자동 제기). |
| `supersedes` | any vN → any vN-1 | append-only 정정 체인. |
| `attributed_to` | any → Agent | 누가/무엇이 그것을 생산했는지(사람 대 AI skill). |

**어떤 관계도 `Note`를 `evidence_for`/`extracted_from` edge의 출발점(source)으로 만들 수 없다** — 이것이
"생성된 합성물은 evidence가 아니다"의 구조적 형태이며 코어 link 검증기에 의해 거부된다(ADR-0001 guardrail, ADR-0004 §2.3).

## 공통 필드 (모든 노드)
md frontmatter(단일 진실 공급원) **및** 인덱스 `node` 행(ADR-0002)에 미러링되며, 발맞춰 유지된다:
```
id            : stable id (e.g. clm_2026_<hash>) — also the filename id
kind          : source | claim | evidence | note | concept | interest |
                open_question | decision | assumption |
                trace | simulation_run | experiment | related_work | radar_signal
boundary      : public | internal | confidential          # ADR-0004 §3 (default-deny: internal)
visibility    : team | private                             # ADR-0004 §3 (default-private)
status        : proposed | accepted | needs_evidence | rejected | superseded   # ADR-0005 A6/B5
generated     : bool                                       # true for Note and any LLM-proposed candidate
trust         : T0..T3 | contested                         # DERIVED, never caller-set (ADR-0004 §4)
artifact_uri  : path/URI for evidence/trace/sim/experiment; NULL otherwise
created_by    : agent id (human or skill name)
attributed_to : origin author (may differ on import)
created_via   : provenance_event id (the activity that wrote it)
content_hash  : detects file↔index drift (ADR-0002)
created_at    : timestamp
```

## Claim→Evidence 불변식 — 정의와 강제
**정의.** `kind=claim`인 노드는 **`kind=evidence`인 노드로부터의 `evidence_for` edge를 ≥1개** 가지며, **또한**
그러한 모든 `evidence` 노드가 구체적 `source`/`trace`/`simulation_run`/`experiment`(또는 해소 가능한 `file_uri`)로
향하는 `extracted_from` edge를 가질 때에만 *유효*하다(`status=accepted`와 `trust > T0`을 보유할 수 있다). 결코
자유 텍스트로 향하지 않으며 결코 `note`로 향하지 않는다.

**왜 단순한 DB 제약이 아닌가.** "타입 명시된 edge 중 ≥1"은 SQLite *와* Postgres 양쪽에서 이식 가능한 FK/CHECK로
표현되지 않는다(ADR-0002 이식성 요구사항). 그래서 불변식은 모든 표면과 엔진에서 동일하게, **세 개의 발맞춘
레이어**에서 강제된다:

| Layer | Enforcement | Failure |
|---|---|---|
| **1. Schema (skill-wrap 입력)** | `kr.attach_evidence`에는 **산문 필드가 없다**; `artifact_ref`는 실제 아티팩트로 해소되는 타입 명시된 `{kind, ref}`여야 한다. 산문을 evidence로 제출하는 것이 구조적으로 불가능하다. | `ERR_EVIDENCE_NOT_ARTIFACT` |
| **2. 코어 트랜잭션 검증기** | 커밋 전: (a) `needs_evidence`를 넘어 승격된 Claim은 `evidence_for`를 ≥1개 가짐; (b) 각 Evidence의 `extracted_from` 대상이 해소됨; (c) 어떤 `note`도 `evidence_for`/`extracted_from`의 `from`으로 나타나지 않음. 검사 실패는 **트랜잭션 전체를 중단** — 고아 노드/파일 없음. | `ERR_TRUST_WITHOUT_EVIDENCE`, `ERR_NOTE_AS_EVIDENCE` |
| **3. Reindex 재검사** | `reindex`(ADR-0002)가 `knowledge/**` 전반에 불변식을 다시 실행; 어떤 위반도 하드 에러로 드러나며 결코 조용히 인덱싱되지 않음. | reindex가 큰소리로 실패 |

해소 가능한 evidence가 없는 Claim은 숨길 에러가 아니라 **일급 상태**(`status=needs_evidence`, `trust=T0`)이다 —
evidence가 첨부될 때까지 가시적이며 승격 불가 상태로 머문다(ADR-0005 A3 gate). import된, 검사되지 않은 신호
(ADR-0006)도 게이트가 로컬에서 통과될 때까지 `T0`에 머문다.

## 재구성 가능성
"합성 N이 어떻게 도달되었는지 재구성"은 고정된 순회이며, `edge`에 대한 재귀 CTE 또는 연결된 md 파일들에 대한
git-blame으로 가능하다(ADR-0002):
```
note --cites--> claim --evidence_for(in)--> evidence --extracted_from--> source/trace/simulation_run/experiment
```
더하여 트랜잭션별 `provenance_event` / append-only 감사 체인(ADR-0004 §2.4, ADR-0001)이 각 단계(hop)를
*누가/무엇이* 그리고 *언제* 작성했는지 기록한다. 하류(downstream)의 어떤 것도 한 레이어 뒤를 가리키지 않고서는
존재할 수 없다.

## 결정 (요약)
1. 위의 **엔티티 집합**(assertion + import된 아티팩트 참조 + 수집 신호)을 채택하며, 각각을 타입 명시된 `node`로 한다.
2. 위의 **타입 명시된 관계 어휘**를 채택하며, 하나의 범용 `edge` 테이블이 운반한다(그래프 업그레이드 준비됨, ADR-0002).
3. **`Claim→Evidence` 불변식을 세 개의 발맞춘 레이어**(schema, 코어 검증기, reindex 재검사)에서 강제하며,
   단일 DB 제약으로 하지 않아 표면 전반과 SQLite/Postgres 전반에서 동일하게 한다.
4. **`Note`가 evidence가 되는 것을 구조적으로 차단**하며; 모든 생성된 콘텐츠에 `generated=true`를 표시한다.
5. 엔티티를 `supersedes`로 **append-only**로 유지한다; trust와 boundary는 **파생/전파**되며 결코 호출자가 설정하지 않는다.

## 결과
**쉬운 점:** provenance를 갖춘 타입 명시 retrieval; 미래의 property-graph는 질의 변경; 에이전트는 실수로라도
evidence 없는 Claim이나 Note-as-evidence를 만들 수 없음; import된 아티팩트가 페이로드 누출 없이 카탈로그화됨.

**어려운 점 / 후속 작업:** 불변식 로직이 코어(ADR-0001)에 중앙화되고 어디에도 중복되지 않아야 함;
`claim_type` 분류 체계와 dedup/merge 의미론은 ADR-0005로 연기됨; 입증(T2)을 위한 "독립 source"는 사람/휴리스틱
판단이 필요할 수 있음(ADR-0004). 독자는 최신 버전을 찾기 위해 `supersedes` 체인을 해소해야 함.

## 미해결 질문 / 재검토 트리거
- `TODO(open-question: ID scheme — content-addressed hash vs sequential slug; owned with ADR-0002.)`
- `TODO(open-question: claim_type taxonomy — is {empirical/methodological/definitional/comparative/normative} sufficient? owned with ADR-0005.)`
- `TODO(open-question: do we persist rejected Claim candidates as nodes for audit, and under what boundary? ADR-0005.)`
- `TODO(open-question: is "independent source" for T2 machine-decidable, or human-judged? ADR-0004.)`
- 그래프 업그레이드(ADR-0002 v2 / Apache AGE)나 지속 학습이 도래하면 edge 어휘를 **재검토**한다.
- [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md) 참조.

## 런북에 대한 함의
- **RB (schema):** 위의 필드/관계를 갖춘 `node` + `edge`(+ `provenance_event`, `event`) 테이블 생성;
  `boundary`/`visibility`는 default-deny 기본값을 갖는 NOT NULL; 이식 가능한 SQLite∩Postgres 부분집합(ADR-0002).
- **RB (invariant gate):** 세 레이어 `Claim→Evidence` 강제 구현; 해소 가능한 Evidence가 없는 Claim을 승격하는
  것과 Note를 Evidence로 첨부하는 것이 둘 다 실패함을 negative test가 보여야 함.
- **RB (reindex):** `knowledge/**`로부터 인덱스를 재구축하고 **불변식을 다시 실행**; 어떤 위반에도 reindex가 큰소리로 실패.
- **RB (model docs):** 이 엔티티/관계 표로부터 `GLOSSARY.md`를 생성하여 용어가 정확히 사용되도록 함(DOC-CONVENTIONS §7).
