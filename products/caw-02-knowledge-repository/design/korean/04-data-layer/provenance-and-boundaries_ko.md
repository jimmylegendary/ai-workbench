# Provenance & Boundaries — 2축 분류, 단조 전파, trust ladder

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./data-model_ko.md](./data-model_ko.md)
  - [./storage-strategy_ko.md](./storage-strategy_ko.md)
  - [./versioning-and-events_ko.md](./versioning-and-events_ko.md)
  - [../01-decisions/ADR-0004-provenance-and-trust_ko.md](../01-decisions/ADR-0004-provenance-and-trust_ko.md)
  - [../01-decisions/ADR-0003-knowledge-data-model_ko.md](../01-decisions/ADR-0003-knowledge-data-model_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF_ko.md

## 목적
이 문서는 provenance와 boundary의 **데이터 표현**을 확정한다. 즉 직교하는 두 축
`boundary{public,internal,confidential} × visibility{team,private}`과 계산되는 **단조 전파(monotone
propagation)**, 파생된 **trust ladder T0–T3 + contested**(AI 저작은 T2로 상한), 그리고 **evidence gate**가
저장 데이터에서 어떻게 표현되는지다. 이는 [ADR-0004](../01-decisions/ADR-0004-provenance-and-trust_ko.md)를
구체화한다. 엔티티 필드(see [data-model](./data-model_ko.md)), 물리적 영속화(see
[storage-strategy](./storage-strategy_ko.md)), 또는 import/export wire 포맷(ADR-0007)은 정의하지 않는다.

## 1. 직교하는 두 축 (결코 한 필드가 아님)
"건물 밖으로 나갈 수 있는가"와 "누구의 공간인가"를 뭉뚱그리는 것이 전형적인 누출 원인이다. 우리는 **두 개의**
독립 컬럼을 유지하며, 둘 다 `NOT NULL`이고 둘 다 안전한 방향을 기본값으로 한다.

| 축 | 필드 | 값 | 순서 있음? | 기본값 | 답하는 질문 |
|---|---|---|---|---|---|
| 민감도 | `boundary` | `public ⊂ internal ⊂ confidential` | 예 (lattice) | `internal` (default-deny) | 이것이 건물 밖으로 나갈 수 있는가? |
| 범위 | `visibility` | `team`, `private` | 아니오 | `private` (default-private) | 이것이 누구의 공간에 있는가? |

`public` 항목이 `private`일 수 있고(Jimmy의 public-source 노트), `confidential` 항목이 `team`일 수 있다. 두
축은 하나로 붕괴되지 않는다. 분류되지 않은 새 항목은 **긍정적이고 귀속된(attributed) 행위**가 분류할 때까지
`internal`/`private`이다 — 위험한 방향(과잉 공유)이 노력을 요구하는 방향이다.

## 2. 단조 전파 (계산됨, 결코 수동 설정 아님)
엔티티의 유효 `boundary`는 자기 자신과 provenance edge로 도달 가능한 모든 엔티티에 대한 **max**다; 유효
`visibility`는 자기 자신과 모든 provenance 조상이 `team`일 때만 `team`이다. synthesis는 결코 민감도를 아래로
세탁(launder)할 수 없다.

```
provenance edges that propagate sensitivity:
  evidence_for | challenges | extracted_from | cites | derived_from

boundary_eff(n)   = max_lattice( boundary(n),  { boundary_eff(a) : a in prov_ancestors(n) } )
visibility_eff(n) = team  iff  visibility(n)=team AND all a in prov_ancestors(n): visibility_eff(a)=team
                  = private otherwise
```

| 규칙 | 결과 |
|---|---|
| 위로만 단조 | `confidential` Claim을 인용하는 Note는 그 자체로 ≥ `confidential` |
| 생성에 의한 강등 없음 | synthesis는 결코 `boundary`를 낮추지 않는다 |
| 명시적 declassify만 | 강등은 사람(Jimmy)이 기록된 사유와 함께 수행한 귀속된 `reclassify` 활동이 필요하다 |
| read + export 시 계산 | 전파는 query 시점과 모든 export 경계 통과 시 실행된다(fail-closed allow-list, ADR-0007) |

```yaml
# example: a note inherits the max boundary of what it cites
# not_2026_x cites clm_2026_a (internal) and clm_2026_b (confidential)
# => boundary_eff(not_2026_x) = confidential   (even if authored as 'internal')
```

저장값 vs 유효값: 파일 frontmatter는 **선언된(declared)** `boundary`/`visibility`를 담는다; 인덱스와 모든
read는 전파를 통해 **유효(effective)** 값을 계산한다. reindex는 전체 그래프에 대해 유효값을 재계산한다
(see [storage-strategy §5](./storage-strategy_ko.md)); 계산된 하한보다 낮은 선언값은 노출된다.

`TODO(open-question: do we persist the computed effective boundary as a cached column, or always compute on read? cache must be invalidated on any provenance-edge change.)`

## 3. reclassify 활동 (유일한 강등 경로)
```yaml
# a provenance_event of activity=reclassify (ADR-0004 §4)
activity:  reclassify
agent:     human:jimmy            # AI agents may NOT downgrade boundary
ts:        2026-06-27T11:02:00Z
payload:
  node:    clm_2026_k7t2qx9m1a
  from:    confidential
  to:      internal
  reason:  "source paper is public; no SAIT-internal figures cited"
```
강등은 append-only event이지 결코 조용한 필드 편집이 아니다; 이력은 git + `_events`에서 감사 가능하다
(see [versioning-and-events](./versioning-and-events_ko.md)).

## 4. Trust ladder — 파생되고 설명 가능함
trust는 **그래프의 함수**로, 모든 edge 변경 시 재계산되며 결코 호출자로부터 받지 않는다(`trust` 필드는
호출자가 어긋나게 설정하면 거부됨).

| 레벨 | 이름 | 도출 가능한 기준 |
|---|---|---|
| `T0` | unverified | 아직 resolvable한 evidence 없음(가져왔으나 미검증된 신호; 맨몸 Claim은 gate에 의해 거부됨) |
| `T1` | single-source | 하나의 외부 source로 resolve되는 ≥1개의 `evidence_for` evidence |
| `T2` | corroborated | ≥2개의 독립 source, **또는** 구체적 artifact(trace/experiment/projection)로 뒷받침된 evidence |
| `T3` | reviewed | T2 **그리고** 권한 있는 agent에 의한 human-review provenance event |
| `contested` | conflict | `evidence_for`(supports)와 `challenges`가 둘 다 임계값 이상 — 숨기지 않고 노출 |

```
trust(claim) =
  contested            if supports>=θ AND challenges>=θ
  T3                   if corroborated AND human_review_event(agent is human, authorized)
  T2                   if independent_sources>=2 OR has_artifact_backed_evidence
  T1                   if resolvable_evidence_count>=1
  T0                   otherwise
# AI-authored cap:
  if author_is_ai(claim):  trust = min(trust, T2)   # T3 requires a human reviewer (brief §10)
```

| 속성 | 규칙 |
|---|---|
| AI 상한 | AI 저작 콘텐츠는 **T2**로 상한; T3는 human review event가 필요("Jimmy가 전략적 의사결정을 검토한다"를 인코딩) |
| 독립성 | trust와 boundary는 **독립적**이다(`public` claim이 T1일 수 있고, `confidential` claim이 T3일 수 있다) |
| 재계산 | 모든 edge 추가/supersede는 영향받는 Claim에 대해 trust 재계산을 트리거; reindex는 전역 재계산 |
| 설명 가능 | 모든 trust 값은 edge + provenance event로부터 도출 가능하므로 호출자가 *왜*인지 본다 |

`TODO(open-question: is "independent source" for T2 machine-decidable, or heuristic/human-judged? owned by ADR-0004.)`
`TODO(open-question: the exact contested threshold θ.)`

## 5. 데이터 안의 evidence gate
gate(ADR-0004 §3)는 "생성된 요약은 evidence가 아니다"의 구조적 형태로, 세 가지 데이터 사실에 걸쳐
표현된다:

| # | 데이터 사실 | 어디에 존재하는가 |
|---|---|---|
| 1 | `evidence` frontmatter에 **산문/요약 필드가 없음** — `artifact_uri` + `locator` + `stance`만 있음 | [data-model Evidence schema](./data-model_ko.md) |
| 2 | `needs_evidence`를 지난 `claim`은 `evidence` 노드로부터 오는 ≥1개의 `evidence_for` edge를 가져야 함 | edge table + validator |
| 3 | 어떤 `note`도 `evidence_for`/`extracted_from`의 `from`이 될 수 없음 | edge link validator |

Evidence는 자유 텍스트 슬롯이 없는 *타입 지정 포인터*이기 때문에, agent는 산문을 evidence로 제출할 수
**없다** — gate는 런타임 경고가 아니라 필드의 부재로 강제된다. 위반은 오류
(`ERR_EVIDENCE_NOT_ARTIFACT`, `ERR_TRUST_WITHOUT_EVIDENCE`, `ERR_NOTE_AS_EVIDENCE`)를 반환하고 트랜잭션을
중단하며 고아 노드/파일을 남기지 않는다(see [storage-strategy §4](./storage-strategy_ko.md)).

## 6. Provenance 계층 (PROV 형태, RDF 없음)
모든 write는 하나의 `provenance_event`를 방출한다 — 재구성 가능성의 기반(substrate) — 각 노드에서
`created_via`로 연결된다.

```yaml
# provenance_event — one record per knowledge transaction
id:       pe_2026_a13f...
activity: attach_evidence        # add_source|extract_claim|attach_evidence|synthesize_note|classify_signal|reclassify|review
agent:    skill:attach-evidence  # human:jimmy | human:<teammate> | skill:<name>
ts:       2026-06-27T10:04:11Z
tool:     kr-cli v0
inputs:   [clm_2026_k7..., sim_2026_9f...]
outputs:  [evd_2026_77...]
notes:    "projection from CAW-01 run_8831 (imported, public-safe)"
```

| 필드 | 용도 |
|---|---|
| `agent` | 사람 대 AI 저작을 구분 → AI trust 상한(§4)과 강등 권한(§3)을 구동 |
| `inputs/outputs` | 재구성 가능성 순회가 따라 걷는 계보(data-model §7) |
| `activity` | 타입 지정된 트랜잭션 종류; `reclassify`/`review`만이 trust/boundary를 변경하는 활동이다 |

import 시 격리(Quarantine-on-import): 가져온 항목은 로컬 evidence gate를 통과할 때까지 `T0`/`internal`에
머문다; export는 경계 통과 시 재-redaction을 포함한 fail-closed allow-list다(ADR-0007).

## Open Questions
- `TODO(open-question: cache effective boundary vs compute-on-read; invalidation on edge change.)`
- `TODO(open-question: "independent source" for T2 — machine vs human.)`
- `TODO(open-question: contested threshold θ.)`
- `TODO(open-question: reclassification authority beyond Jimmy + required audit.)`
- `TODO(open-question: tamper-evidence on provenance events — hash chain in v0 vs later.)`
- See [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md).

## 런북에 대한 함의
- **RB (schema):** `boundary`/`visibility`는 NOT NULL default-deny/default-private; `provenance_event` 테이블.
- **RB (propagation):** read + export 시 유효 boundary/visibility 계산; reindex는 전역 재계산.
- **RB (trust recompute):** edge로부터 trust 도출; AI 상한 T2; edge 변경 시 재계산; 호출자 값을 결코 신뢰하지 않음.
- **RB (evidence gate):** §5의 세 데이터 사실을 부정 테스트로 강제.
