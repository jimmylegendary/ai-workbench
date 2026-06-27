# Provenance & Trust 모델

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** ../_meta/PRODUCT-BRIEF_ko.md, ../_meta/DOC-CONVENTIONS_ko.md, ../01-decisions/ (향후 ADR: provenance & trust), ../08-research-plan/open-questions_ko.md
- **Source of truth:** ../_meta/PRODUCT-BRIEF_ko.md

## 목적
이 문서는 **CAW-02가 provenance(출처)와 trust(신뢰)를 어떻게 모델링하는지**, 그리고 **public/internal/confidential 및
team/private 경계가 import/export에서 어떻게 강제되는지**를 결정한다. 정립된 모델(W3C PROV, micropublication/nanopublication)에
기반하여 구체적인 provenance 그래프 형태, trust-level 체계, boundary 강제 설계를 권고한다. 저장 포맷(md 대 SQLite — 별도 ADR),
ingestion 파이프라인 메커니즘(별도 ADR), retrieval/embedding, 또는 CAW-01/05/03 계약의 wire 포맷(import/export ADR)은
명시하지 **않는다**. 그 문서들이 지켜야 할 *무결성 불변식*을 고정할 뿐이다.

협상 불가능한 불변식(브리프 §5, §10에서): **`Claim`은 `Evidence`를 가리키고, `Evidence`는 구체적인 artifact/source를
참조하며 결코 free text가 아니다. 생성된 synthesis는 evidence가 아니다.**

## 1. 배경: 어떤 외부 모델을 차용하는가
우리는 provenance 이론을 발명하지 않는다. 브리프의 엔티티를 두 개의 검증된 모델에 매핑하고 v0가 필요로 하는 것만 남긴다.

| 모델 | 우리에게 주는 것 | 우리가 취하는 것 | v0에서 버리는 것 |
|---|---|---|---|
| **W3C PROV** (PROV-DM/PROV-O, W3C Rec 2013) | 도메인 무관 삼원(triad) **Entity / Activity / Agent** + 관계 `wasDerivedFrom`, `wasGeneratedBy`, `used`, `wasAttributedTo`, `wasAssociatedWith` | *Note에 어떻게 도달했는가*에 대한 derivation/attribution 골격 | 완전한 OWL/RDF 직렬화, qualified relation, PROV-XML |
| **Micropublications** (Clark et al., biomedical) | **Claim / Evidence / Argument / Annotation**의 명시적 분리; evidence 체인은 prose가 아니라 데이터에서 종결됨 | Claim→Evidence→Source 종결 규칙; "support 대 challenge" 링크 의미론 | 형식적 argument 그래프, statement reification |
| **Nanopublications** (assertion + provenance + pubinfo) | 3부 분할: *무엇이 주장되는가*, *어디서 왔는가*, *누가/언제 진술했는가* | assertion 내용과 그 provenance 메타데이터의 깔끔한 분리 | RDF named graph, trusty-URI, 분산 publishing |

종합: PROV는 어떤 것이 **어떻게** 생산되었는지 설명하고, micropublication은 **claim이 evidence에서 종결되며 결코
생성된 텍스트에서 종결되지 않음**을 강제한다. CAW-02는 둘 다 필요한데, 그 존재 이유(브리프 §2) 자체가
"생성된 요약이 evidence로 오인된다"는 점이기 때문이다.

## 2. 권고하는 provenance 모델

### 2.1 두 계층, 명확히 분리
- **Assertion 계층** — 지식 내용: `Source, Claim, Evidence, Note, Concept, OpenQuestion, Decision,
  Assumption, RelatedWork, RadarSignal`, 그리고 import된 artifact 참조(`Trace, SimulationRun, Experiment`).
- **Provenance 계층** — *각 assertion이 어떻게 생겨났는가*: 모든 쓰기는 어떤 시점에 **Agent**(Jimmy, 팀원, 또는 이름이
  지정된 AI skill)가 수행한 **Activity**이며, assertion 엔티티를 생산/사용한다.

이는 RDF를 채택하지 않고 PROV(entity 대 activity 대 agent)를 반영한다. 저장 관점에서는 지식 트랜잭션마다 하나의
`provenance_event` 레코드가 있고, 그것이 건드린 엔티티들을 참조한다.

### 2.2 핵심 edge 타입 (타입 지정, free text 아님)
| Edge | From → To | 의미 | 강제되는 불변식 |
|---|---|---|---|
| `supports` | Evidence → Claim | evidence가 claim을 뒷받침 | `supports` edge가 0개인 Claim은 **무효** |
| `challenges` | Evidence → Claim | evidence가 claim과 모순 | threat/support 분류 가능(use case 2) |
| `evidenceOf` | Evidence → Source\|Artifact | evidence가 구체적인 대상을 가리킴 | **Evidence는 반드시 artifact URI/row로 resolve되어야 하며 결코 prose가 아님** |
| `cites` | Note → Claim\|Evidence | synthesis가 근거로 삼은 것을 인용 | 본문에 claim이 있으나 `cites` edge가 없는 Note는 **플래그됨** |
| `derivedFrom` | Note\|Claim → Source\|Claim | PROV `wasDerivedFrom` 계보 | 체인의 재구성 가능성 |
| `attributedTo` | 임의 엔티티 → Agent | 누가/무엇이 생산했는가 | 인간 대 AI 저작 구분 |
| `aboutConcept` | Claim\|Source\|Note → Concept | 주제 인덱싱 | retrieval ("X에 대해 무엇을 아는가") |
| `addresses` | Claim\|Evidence → OpenQuestion\|Decision | findings를 decision에 연결 | decision을 재구성 가능하게 유지(use case 6) |

### 2.3 강한 규칙을 check로 기술 ("evidence gate")
다음 중 하나라도 해당하면 쓰기는 **거부된다**(skill 인터페이스가 경고가 아니라 에러를 반환):
1. `Claim`이 `Evidence`로 가는 `supports`/`challenges` edge **없이** 생성/갱신됨.
2. `Evidence` row의 `evidenceOf` 대상이 resolve 가능한 `Source`/artifact URI/row id가 아니라 free text임.
3. `Note`(synthesis)가 Evidence **로서** 기록됨, 즉 `Note` id가 `evidenceOf`/`supports` edge의 `from`에 나타남.
   생성된 synthesis는 Note에 의해 *인용될* 수 있고 Claim을 *촉발할* 수 있지만, 결코 evidence 체인의 종점이 아니다.

이 세 검사는 브리프 §5/§10의 기계 판독 가능한 형태이며 skill-wrap(브리프 §5)에 속하므로 **에이전트는 실수로도
provenance를 손상시킬 수 없다**.

### 2.4 엔티티 수준 provenance 필드 (최소)
모든 assertion 계층 row가 지닌다:
```
id            : stable id (ULID/uuid)
kind          : Source | Claim | Evidence | Note | ...
boundary      : public | internal | confidential        # §3
visibility    : team | private                           # §3
created_by    : agent id (human or skill name)
created_via   : activity id (the provenance_event)
attributed_to : agent id (origin author, may differ from created_by on import)
trust         : trust level (§4) — DERIVED, not free-typed
source_ref    : URI/path/row for Source & Evidence; NULL for pure synthesis
```
그리고 모든 트랜잭션은 하나의 `provenance_event { id, activity, agent, ts, inputs[], outputs[], tool, notes }`를 방출한다.

## 3. Boundary 모델 (public / internal / confidential + team / private)
두 개의 **직교(orthogonal)** 축이다. 이를 혼동하는 것이 전형적 유출이다(브리프 §10: "public-source 연구를 internal
Samsung/SAIT claim과 결코 혼동하지 말 것").

- **민감도(`boundary`)** — *이것이 건물 밖으로 나갈 수 있는가?* `public ⊂ internal ⊂ confidential`(순서 있음).
- **범위(`visibility`)** — *누구의 공간에 있는가?* `team` 대 `private`(Jimmy 전용). 순서 없음. 접근 범위.

| boundary | 의미 | public export에 나타나도 되는가? | 전형적 source |
|---|---|---|---|
| `public` | public source에서만 파생, internal claim 없음 | **yes** | 출판된 논문, public radar signal |
| `internal` | 팀 지식, 외부 공개 불가 | no | 팀 decision, internal experiment |
| `confidential` | Samsung/SAIT 제한, projection-only 취급 | no — 그리고 redaction 없이는 전체 internal export에도 안 됨 | CAW-01 confidential trace |

### 3.1 전파 규칙 (계산됨, 손으로 설정하지 않음)
- **단조 비감소 민감도(Monotone non-decreasing):** 엔티티의 `boundary`는 자신과 `supports`/`evidenceOf`/`derivedFrom`/`cites`로
  도달 가능한 모든 엔티티의 `max()`이다. confidential한 Evidence 하나를 인용하는 Note는 confidential이다. synthesis로
  민감도를 "세탁"할 수 없다.
- **Visibility 교집합:** 엔티티가 자신 **그리고 모든 provenance 조상**이 `team`일 때만 팀에 보인다. private 조상 하나가 전체
  파생 항목을 team-visible source로부터 재파생할 때까지 private으로 만든다.
- **생성에 의한 다운그레이드 금지:** synthesis는 결코 `boundary`를 낮추지 않는다(유출 벡터). 다운그레이드는 인간 에이전트(Jimmy)에
  의한 명시적이고 attributed된 `reclassify` activity를 요구하며, 이유와 함께 provenance event로 기록된다.

## 4. Trust-level 체계
Trust는 **파생되고 설명 가능**하며, 결코 free-typed 별점이 아니다. "이것이 얼마나 무게를 지니는가, 그리고 왜"에 답한다.
사람과 에이전트가 읽기 쉽도록 작은 순서 있는 사다리(ladder)로 유지한다.

| Level | 이름 | 기준 (도출 가능) |
|---|---|---|
| T0 | **unverified** | 아직 resolve 가능한 evidence 없이 주장됨(일시적; gate를 통과하지 못한 맨 Claim은 거부되므로 T0는 주로 import되었으나 미검증된 signal을 태깅) |
| T1 | **single-source** | 하나의 외부 source로 resolve되는 `supports` evidence ≥1 |
| T2 | **corroborated** | 독립적 source ≥2개, 또는 구체적 artifact(trace/experiment/projection)로 뒷받침된 evidence |
| T3 | **reviewed** | T2 **그리고** 권한 있는 에이전트에 의한 human-review provenance event(브리프 §10: Jimmy가 전략적 decision을 검토) |
| T-CONFLICT | **contested** | 임계값 이상의 `supports`와 `challenges` evidence를 모두 가짐 — 숨기지 않고 드러냄 |

규칙:
- Trust는 edge가 변경될 때마다 **재계산**된다. 저장된 의견이 아니라 provenance 그래프의 함수이다.
- **AI 단독 attribution은 trust를 T2로 제한.** 검토가 AI 에이전트뿐인 claim은 T3에 도달할 수 없다. T3는 인간 reviewer가 필요하다.
  이것이 "Jimmy가 전략적 decision의 reviewer다"(브리프 §10)를 인코딩한다.
- Trust와 boundary는 독립적이다: `public` claim이 `T1`일 수 있고, `confidential` claim이 `T3`일 수 있다.
- Retrieval(use case 3)은 trust + evidence 목록을 반환하여 caller가 *왜*를 보게 한다. "evidence와 trust level과 함께"를 충족.

## 5. import / export에서의 강제
boundary는 **product edge**(브리프 §7)이다 — 독립 제품 사이의 파일/API, 공유 store 없음. provenance는 manifest로서
데이터와 함께 이동하며, 들어올 때 재검증되고 나갈 때 필터된다.

### 5.1 Import (CAW-01 projection, CAW-05 signal)
| 단계 | 규칙 |
|---|---|
| Arrive | import된 번들은 provenance manifest를 지님(origin product, agent, source ref, 선언된 boundary). |
| Quarantine | import된 항목은 로컬에서 **evidence gate**(§2.3)를 통과할 때까지 `T0 unverified`로 안착한다. |
| CAW-01 projection | projection artifact를 **URI/path로** 참조하는 `Evidence`로 카탈로그됨, raw confidential 데이터를 inline하지 않음(브리프 §7). 선언된 `confidential`은 `confidential`로 유지; importer는 **다운그레이드 불가**. |
| CAW-05 signal | `Source`/`Claim`/`OpenQuestion`/`RelatedWork`가 되어 `supports`/`challenges`로 분류됨 — 느슨한 요약으로 저장되지 **않음**(브리프 §7). |
| Attribution | `attributed_to`는 origin agent를 보존; `created_via`는 import activity를 기록하여 계보가 제품을 넘나들게 함. |

### 5.2 Export (CAW-03로, 그리고 모든 public-facing 출력으로)
| 단계 | 규칙 |
|---|---|
| Select | Caller가 `Claim`+`Evidence` 번들을 요청(use case 5). |
| Boundary filter | Export는 §3.1 전파를 통해 번들의 유효 `boundary`를 계산. 도달 가능한 엔티티 중 하나라도 `internal`/`confidential`이면 **public-facing** export는 거부됨. 조용한 redaction 없음 — 크게 실패하고 위반 id를 나열. |
| Visibility filter | 요청자가 owner가 아니면 `private` 항목은 team/shared export에서 제외됨. |
| Evidence integrity | 모든 export된 `Claim`은 자신의 `supports` Evidence와 source ref와 함께 출하됨; export된 Note는 `cites` edge와 함께 출하됨. evidence gate를 통과 못한 번들은 export 불가. |
| Synthesis labeling | export된 Note는 `kind=synthesis, evidence=false`로 태깅되어 downstream 제품(CAW-03, 별개 제품)이 synthesis를 evidence로 오인할 수 없게 함. |
| Manifest out | Export는 §5.1을 반영하는 provenance manifest를 방출하여 수신 제품이 재검증할 수 있게 함. |

### 5.3 유출을 방지하는 기본값
**민감도는 default-deny, 범위는 default-private.** 명시적 boundary 없는 새 항목은 분류될 때까지 `internal`/`private`로
취급된다. public은 적극적이고 attributed된 행위를 요구한다. 이로써 위험한 방향(과잉 공유)이 노력을 요구하는 쪽이 된다.

## 6. 권고 (요약)
1. **two-layer** 모델 채택: assertion 엔티티 + 트랜잭션마다 `provenance_event`(PROV 형태, RDF 없음).
2. **typed edge set**(§2.2) 채택 및 skill-wrap 내부에서 **evidence gate**(§2.3) 강제하여 에이전트가 provenance를 손상시킬 수 없게 함.
3. boundary를 **두 직교 축**으로 모델링하고 **계산된 단조 전파**(§3) 사용; synthesis로 결코 다운그레이드하지 않음.
4. **trust를 파생되고 설명 가능**하게 만듦(T0–T3 + contested), AI 단독 검토는 T2로 제한(§4).
5. **import/export edge**에서 boundary 강제: import 시 quarantine, export 시 fail-loud 필터링(§5), 양방향으로 provenance
   manifest를 운반.

## 7. Open Questions
../08-research-plan/open-questions_ko.md 참조.
- TODO(open-question: storage of edges — adjacency rows in SQLite vs links embedded in md frontmatter; affects how the
  evidence gate and propagation are computed. Defer to storage ADR.)
- TODO(open-question: is "independent source" for T2 corroboration machine-decidable, or does it need a human/heuristic
  call? Risk of false corroboration when two signals share an upstream origin.)
- TODO(open-question: exact provenance-manifest schema shared with CAW-01/05/03 — owned by the import/export ADR; this
  doc only fixes the fields that must survive the boundary.)
- TODO(open-question: how confidential CAW-01 projections are referenced without the artifact store being reachable from
  a public deployment — URI scheme + access mediation.)
- TODO(open-question: reclassification/declassification workflow — who beyond Jimmy may downgrade, and what audit is
  required.)
- TODO(open-question: do we need tamper-evidence on provenance events (hash chain / content addressing) in v0, or is
  that a later upgrade?)

## 8. 런북에 대한 함의
- **Schema 런북:** §2.4 필드를 가진 assertion 테이블과 `provenance_event` 테이블을 생성해야 함; edge는 타입 지정 link table
  (또는 md-frontmatter 등가물)로. boundary/visibility는 default-deny 기본값과 함께 NOT NULL(§5.3).
- **Skill-wrap 런북:** add-source/extract-claim/attach-evidence/synthesize-note skill은 **evidence gate**(§2.3)를 실행하고
  실패 시 **거부**해야 함; trust는 재계산되며 결코 caller로부터 수용되지 않음.
- **Import 런북(CAW-01/05):** 항목을 `T0`로 안착, `attributed_to` 보존, 선언된 `confidential`을 결코 다운그레이드하지 않음,
  projection을 URI로 카탈로그.
- **Export 런북(CAW-03 / public):** boundary + visibility 전파 실행, 위반 id와 함께 크게 실패, synthesis를 `evidence=false`로
  태깅, outbound manifest 첨부.
- **Retrieval 런북:** 모든 결과가 trust level + evidence 목록 + boundary를 지니므로 caller는 결코 맨 claim을 보지 않음.
- **Viewer (읽기 전용):** Claim / Evidence / Note를 시각적으로 분리하고 trust + boundary 배지를 보여주어 사람이 결코 synthesis를
  evidence로 오인하지 않게 해야 함.

## References
- [PROV-O: The PROV Ontology (W3C)](https://www.w3.org/TR/prov-o/)
- [Micropublications: a semantic model for claims, evidence, arguments and annotations](https://pmc.ncbi.nlm.nih.gov/articles/PMC4530550/)
- [Nanopublications for exposing experimental data in the life-sciences](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4603842/)
- [Provenance, Assertion and Evidence Ontologies — survey](https://pmc.ncbi.nlm.nih.gov/articles/PMC12376154/)
