# ADR-0004: 출처(provenance) 및 신뢰 모델

- **Status:** proposed
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [../_meta/PRODUCT-BRIEF_ko.md](../_meta/PRODUCT-BRIEF_ko.md)
  - [../02-research/provenance-and-trust-models_ko.md](../02-research/provenance-and-trust-models_ko.md)
  - [./ADR-0002-storage_ko.md](./ADR-0002-storage_ko.md)
  - [./ADR-0006-retrieval_ko.md](./ADR-0006-retrieval_ko.md)
  - [./ADR-0007-import-export-contracts_ko.md](./ADR-0007-import-export-contracts_ko.md)
  - [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적
CAW-02의 **provenance 형태, 신뢰 수준, 그리고 public/internal/confidential + team/private boundary 모델**과
이들이 어떻게 강제되는지를 결정한다. 다른 모든 ADR이 반드시 지켜야 할 무결성 불변식을 고정한다. 저장 형식은
지정하지 않으며(see [ADR-0002](./ADR-0002-storage_ko.md)), import/export 와이어 포맷도 지정하지 않는다(see
[ADR-0007](./ADR-0007-import-export-contracts_ko.md)). 그것들은 여기서 고정된 규칙을 소비한다.

## 배경
- 이 제품은 "생성된 요약이 evidence로 오인된다"(brief §2)는 이유로 존재한다. 타협 불가능한 불변식:
  **`Claim`은 `Evidence`를 가리키고, `Evidence`는 구체적인 artifact/source를 참조하며 결코 자유 텍스트가 아니다.
  생성된 종합(synthesis)은 evidence가 아니다**(brief §5, §10).
- 모든 항목은 `boundary`(public/internal/confidential)와 **team 대 Jimmy-private** 범위를 가진다(brief §6).
- 외부 공개용 export는 public-safe만 가능해야 하며, public 출처 리서치를 internal Samsung/SAIT
  claim과 결코 뒤섞으면 안 된다(brief §10).
- 전략적 결정의 리뷰어는 Jimmy이며, 에이전트는 skill-wrap을 통해 지식을 추가한다(brief §3, §10).
- 재구성 가능성(Reconstructability)은 강한 요구사항이며, graph로 업그레이드 가능한 상태로 유지되어야 한다(brief §5).

## 검토한 선택지
| 결정 영역 | 선택지 | 장점 | 단점 | 적합성 |
|---|---|---|---|---|
| Provenance 이론 | RDF/OWL 기반 완전한 W3C PROV | 표준적, 표현력 높음 | 무겁고 RDF 툴체인 필요; 이 규모에선 과함 | Rejected |
| Provenance 이론 | **PROV-shaped 2계층(RDF 없음) + micropublication evidence-termination** | 파생/귀속과 "claim은 evidence에서 끝난다"를 차용; 최소한적 | 유지해야 할 커스텀 edge 어휘 | **Chosen** |
| Trust | 자유 입력 별점 | 단순 | 의견일 뿐 설명 불가; 조작 가능 | Rejected |
| Trust | **파생·재계산되는 ladder T0–T3 + contested** | 설명 가능("가중치가 얼마이며 왜"); 사람과 에이전트 모두에게 읽힘 | edge 변경 시 재계산 필요 | **Chosen** |
| Boundary | 단일 민감도 필드 | 컬럼 수 적음 | "나갈 수 있는가"와 "누구의 공간인가"를 혼동 — 전형적 누출 | Rejected |
| Boundary | **직교하는 두 축 + 계산된 단조 전파** | 혼동 방지; 과공유에는 노력이 필요 | 읽기/export 시 전파를 계산해야 함 | **Chosen** |

## 결정

### 1. 2계층 PROV-shaped provenance (RDF 없음)
- **Assertion 계층:** 지식 엔티티(`Source, Claim, Evidence, Note, Concept, Interest, OpenQuestion,
  Decision, Assumption, RelatedWork, RadarSignal`, 그리고 import된 참조 `Trace, SimulationRun, Experiment`).
- **Provenance 계층:** 모든 쓰기는 하나의 `provenance_event { id, activity, agent, ts, inputs[], outputs[], tool,
  notes }`를 발행한다 — Agent(Jimmy, 팀원, 또는 이름이 지정된 AI skill)가 수행한 Activity. 이는 지식 트랜잭션
  당 하나의 레코드이며 재구성 가능성의 기반(substrate)이다.

### 2. 타입이 지정된 edge 집합([ADR-0002](./ADR-0002-storage_ko.md)의 `edge` 테이블)
`supports`(Evidence→Claim), `challenges`(Evidence→Claim), `evidenceOf`(Evidence→Source|Artifact), `cites`
(Note→Claim|Evidence), `derivedFrom`(Note|Claim→Source|Claim), `attributedTo`(any→Agent), `aboutConcept`
(Claim|Source|Note→Concept), `addresses`(Claim|Evidence→OpenQuestion|Decision). edge는 타입이 지정되며 결코 자유 텍스트가 아니다.

### 3. evidence gate (skill-wrap에서 강제되며 경고가 아니라 에러를 반환)
다음 중 하나라도 해당하면 쓰기는 **거부**된다:
1. `Claim`이 `Evidence`로 향하는 `supports`/`challenges` edge **없이** 생성/갱신되는 경우.
2. `Evidence` 행의 `evidenceOf` 대상이 resolvable한 `Source`/artifact URI/행 id가 아니라 자유 텍스트인 경우.
3. `Note`(synthesis)가 `evidenceOf`/`supports` edge의 `from`으로 나타나는 경우(synthesis-as-evidence).

이것이 brief §5/§10의 기계적 형태다 — 에이전트는 실수로라도 provenance를 오염시킬 수 없다.

### 4. Boundary 모델 — 직교하는 두 축
- **민감도 `boundary`**(*이것이 건물 밖으로 나갈 수 있는가?*): 순서가 있는 `public ⊂ internal ⊂ confidential`.
- **범위 `visibility`**(*누구의 공간인가?*): `team` 대 `private`(Jimmy 전용); 순서 없음.
- **전파는 손으로 설정하는 것이 아니라 계산된다:** 한 엔티티의 `boundary` = 자기 자신과
  `supports`/`evidenceOf`/`derivedFrom`/`cites`로 도달 가능한 모든 엔티티에 대한 `max()`(그 위에서 종합한다고 해서
  민감도를 세탁할 수 없다). 한 엔티티는 자신과 모든 provenance 조상이 `team`일 때에만 team-visible하다.
- **생성에 의한 강등 없음.** synthesis는 결코 `boundary`를 낮추지 않는다. 강등에는 사람(Jimmy)에 의한 명시적이고
  귀속된 `reclassify` activity가 필요하며 사유와 함께 기록된다.
- **민감도는 default-deny, 범위는 default-private.** 새로 분류되지 않은 항목은 긍정적이고 귀속된 행위가 분류하기 전까지
  `internal`/`private`이다 — 위험한 방향(과공유)이 노력을 요하는 쪽이다.

### 5. Trust ladder — 파생되며 설명 가능
| 레벨 | 이름 | 파생 기준 |
|---|---|---|
| T0 | unverified | 아직 resolvable한 evidence 없음(주로 import됐으나 미검증된 신호; 맨 Claim은 gate가 거부함) |
| T1 | single-source | 하나의 외부 source로 resolve되는 `supports` evidence ≥1개 |
| T2 | corroborated | 독립적인 source ≥2개, 또는 구체적 artifact(trace/experiment/projection)로 뒷받침된 evidence |
| T3 | reviewed | T2 **이며 동시에** 권한 있는 agent의 human-review provenance event가 존재 |
| T-CONFLICT | contested | `supports`와 `challenges`가 둘 다 임계치 이상 — 숨기지 않고 드러냄 |

- Trust는 edge가 변경될 때마다 **재계산**된다. 이는 graph의 함수이며 호출자로부터 받아들이지 않는다.
- **AI 단독 리뷰는 trust를 T2로 제한한다.** T3는 사람 리뷰어를 요구한다 — "Jimmy가 전략적 결정을 리뷰한다"를 인코딩.
- Trust와 boundary는 독립적이다(`public` claim이 T1일 수 있고, `confidential` claim이 T3일 수 있다).

### 6. team 대 Jimmy-private 분리
`visibility`는 기본값 `private`인 1급 컬럼이다. private 항목은 요청자가 소유자가 아닌 한 team/공유 뷰와 team/공유
export에서 제외된다. private한 provenance 조상이 있으면 파생 항목은 team-visible source로부터 재파생되기 전까지
private로 유지된다. 이것이 v0 접근 모델이며, 멀티테넌트 ACL은 없다(brief §9).

### 7. Provenance 체인 & 재구성 가능성
"synthesis N에 어떻게 도달했는지 재구성"은 `note → cites → claim → supports → evidence → evidenceOf → source`를
따라가는 것이며, `edge`에 대한 재귀 CTE 또는 연결된 파일 전반의 git-blame으로 제공된다(see [ADR-0002](./ADR-0002-storage_ko.md)).
모든 엔티티는 `created_by`, `created_via`, `attributed_to`, `trust`, `source_ref`를 가진다.

## 결과
- **쉬워지는 것:** 에이전트는 말 그대로 prose를 evidence로 첨부할 수 없다(스키마에 prose evidence 필드가 없음 —
  skill-interface 리서치 참고). retrieval은 trust + evidence 목록을 반환할 수 있어 호출자가 *왜*인지 본다. 과공유는
  기본적으로 어렵다. 보존된 `attributed_to`를 통해 lineage가 제품 전반을 가로지른다.
- **강제 지점:** **evidence gate**와 trust 재계산은 skill-wrap 코어에 있다(MCP/CLI/API의 단일 병목).
  boundary 전파는 읽기 시점과 모든 export 시점에 실행된다.
- **어려운 것:** T2 corroboration의 "독립적 source"는 완전히 기계로 결정 불가능할 수 있다. 전파는 맹목적으로
  캐시하지 않고 계산되어야 한다. 재분류에는 감사되는 사람 워크플로가 필요하다.
- **후속:** schema runbook(assertion 필드 + `provenance_event` + 타입 edge, default-deny 기본값); skill-wrap
  runbook(gate + trust 재계산); import/export runbook(import 시 T0 quarantine, export 시 fail-loud 필터).

## 미해결 질문 / 재검토 트리거
- `TODO(open-question: is "independent source" for T2 machine-decidable, or heuristic/human?)`
- `TODO(open-question: reclassification/declassification workflow — who beyond Jimmy may downgrade, and what audit?)`
- `TODO(open-question: tamper-evidence on provenance events — hash chain in v0 vs later upgrade?)`
- `TODO(open-question: exact provenance-manifest fields shared across the boundary — owned by ADR-0007)`
- See [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md).

## runbook에 대한 함의
- **RB (schema):** §7 필드를 가진 assertion 테이블 + `provenance_event`; 타입이 지정된 `edge` 링크 테이블;
  boundary/visibility는 `NOT NULL` default-deny/default-private.
- **RB (skill-wrap):** evidence gate(실패 시 거부) + trust 재계산(호출자가 공급한 trust는 절대 신뢰하지 않음).
- **RB (retrieval):** 모든 결과는 trust + evidence 목록 + boundary를 가진다(see [ADR-0006](./ADR-0006-retrieval_ko.md)).
- **RB (viewer):** Claim / Evidence / Note를 시각적으로 분리; trust + boundary 배지를 표시하여 synthesis가 결코
  evidence로 오인되지 않도록 함.
