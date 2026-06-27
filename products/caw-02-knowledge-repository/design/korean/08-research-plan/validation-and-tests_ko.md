# 검증 및 테스트

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: review date — do not invent)
- **Related:**
  - [research-plan.md](research-plan_ko.md)
  - [open-questions.md](open-questions_ko.md)
  - [../01-decisions/ADR-0003-knowledge-data-model.md](../01-decisions/ADR-0003-knowledge-data-model_ko.md)
  - [../01-decisions/ADR-0004-provenance-and-trust.md](../01-decisions/ADR-0004-provenance-and-trust_ko.md)
  - [../01-decisions/ADR-0002-storage.md](../01-decisions/ADR-0002-storage_ko.md)
  - [../01-decisions/ADR-0006-retrieval.md](../01-decisions/ADR-0006-retrieval_ko.md)
  - [../01-decisions/ADR-0007-import-export-contracts.md](../01-decisions/ADR-0007-import-export-contracts_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF_ko.md

## 목적

이 문서는 **CAW-02의 무결성 불변식이 모든 surface에 걸쳐 성립함을 입증하는 수용 테스트**를 명세한다.
이는 unit-test 세부사항이 아니라, 깨질 경우 제품이 핵심 약속에 실패했음을 의미하는 load-bearing
보증이다. 각 테스트는 불변식, 셋업, **모든 surface**(core, API, MCP, CLI — ADR-0001에 따라 하나의 op
manifest 위의 얇은 어댑터)에 걸친 동작, 기대 결과, 그리고 소유 ADR을 기술한다. 구현을 명세하지 않으며
— *무엇이 참이어야 하는지*를 명세한다. 일부 테스트를 게이트하는 열린 연구는
[research-plan.md](research-plan_ko.md)와 [open-questions.md](open-questions_ko.md)에서 추적된다.

## 테스트 원칙

1. **Surface-parity.** API/MCP/CLI는 하나의 op manifest 위에 codegen된 얇은 어댑터이므로(ADR-0001),
   모든 불변식 테스트는 **surface당 한 번씩** 실행되며 core에 대해서도 직접 실행된다. CLI에서는
   성립하지만 MCP에서는 아닌 보증은 별난 점이 아니라 빌드 실패이다.
2. **양 레이어, 그다음 reindex.** 세 개의 lockstep 레이어(frontmatter 스키마, core validator,
   reindex re-check — ADR-0003)에서 강제되는 불변식은 각 레이어에서 독립적으로 테스트되어야 한다.
3. **Fail-loud / fail-closed.** Boundary 및 export 테스트는 모호함이 조용히 통과되지 않고 *거부됨*을
   단언한다.
4. **결정성.** Reindex 및 propagation 테스트는 byte/row 수준 재현성을 단언한다.
5. **조작된 숫자 없음.** 임계값이 필요한 곳(recall, dedup)에서 테스트는 `TODO(open-question)`으로
   표시되고 일치하는 연구 트랙에 게이트되며, 발명된 값이 주어지지 않는다.

## 테스트 카탈로그

| ID | 테스트 대상 불변식 | Surfaces | 소유 ADR | 심각도 |
| --- | --- | --- | --- | --- |
| T1 | Claim→Evidence(≥1)는 어떤 surface로도 위반 불가 | core+API+MCP+CLI | ADR-0003 | Critical |
| T2 | Evidence gate가 note/summary-as-evidence를 거부 | core+API+MCP+CLI | ADR-0004 | Critical |
| T3 | Reindex는 결정적이고 idempotent | core | ADR-0002 | Critical |
| T4 | Boundary는 export 시 절대 누출 없음(fail-closed allow-list) | export adapter | ADR-0007/0004 | Critical |
| T5 | Import 격리가 작동(자동 신뢰 없음, confidentiality 검사) | import adapter | ADR-0007 | Critical |
| T6 | FTS + structured filter retrieval이 올바른 citation 반환 | retrieval | ADR-0006 | High |
| T7 | Append-only / supersedes — 파괴적 update나 delete 없음 | core+all | ADR-0001/0002 | High |
| T8 | 단조 boundary/visibility propagation(다운그레이드 없음) | core | ADR-0004 | High |
| T9 | 쓰기 동시성: 병렬 쓰기가 events+index를 일관되게 유지 | write path | ADR-0002 | High |

---

## T1 — Claim→Evidence 불변식은 어떤 surface로도 위반 불가

**불변식(ADR-0003).** 모든 `Claim`은 ≥1 `Evidence`를 참조한다. **세 개의 lockstep 레이어** —
frontmatter 스키마, core validator, reindex re-check — 에서 강제되며, surface 전반 및
SQLite/Postgres 전반에 걸쳐 동일하다.

**셋업.** 빈 repo; 유효한 `Source` 하나.

**동작 & 기대(core, API, MCP, CLI에 대해 실행):**

| 시도 | 기대 결과 |
| --- | --- |
| `evidence` ref가 0인 `Claim` 생성 | validator에서 **거부**; 파일 미작성; `_events` 항목 없음 |
| 빈 `evidence:`를 가진 `Claim` `.md`를 손으로 작성하고 **reindex** 실행 | Reindex가 orphan claim을 **플래그/격리**; 유효한 것으로 인덱싱하지 않음 |
| 존재하지 않는 `evidence_id`를 인용하는 `Claim` 생성 | **거부**(해석 불가 ref) |
| `Claim`의 유일한 `Evidence`를 supersede하여 live claim이 모든 evidence를 잃게 함 | **거부** — supersede는 ≥1 live evidence를 유지하거나 claim도 함께 supersede해야 함 |
| 해석 가능한 `Evidence` 하나를 가진 유효한 `Claim` | 수락; 인덱싱됨; `_events` append 존재 |

**합격 기준.** 네 개의 나쁜 시도 모두 그들이 겨냥한 레이어에서 실패한다. validator가 우회되었더라도
reindex re-check가 손으로 작성된 orphan을 독립적으로 잡아낸다. Surface-parity: 네 surface 전반에 걸쳐
동일한 결과.

---

## T2 — Evidence gate가 note/summary를 evidence로 거부

**불변식(ADR-0004).** Evidence gate는 **구조적**이다: `attach_evidence`에는 **prose 필드가 없으며**,
`artifact_ref`는 실제 artifact로 해석되어야 한다. `Note`/summary는 **절대** evidence가 될 수 없다.

**동작 & 기대(모든 surface):**

| 시도 | 기대 결과 |
| --- | --- |
| `artifact_ref` 대신 자유 텍스트 문자열로 `attach_evidence` | **거부** — op 스키마에 prose 필드가 없음 |
| `artifact_ref`가 `Note` 엔티티를 가리키는 `attach_evidence` | **거부** — 타입 검사: Note는 artifact-backed Evidence source가 아님 |
| `artifact_ref`가 어떤 artifact로도 해석되지 않는 `attach_evidence` | **거부** — 해석 불가 ref, fail-loud |
| `Source`/imported `Trace`/`SimulationRun` artifact에 `attach_evidence` | 수락 |
| 생성된 synthesis `Note`가 나중에 새 `Claim`의 evidence로 참조됨 | **거부** — 생성된 summary ≠ evidence(brief §10) |

**합격 기준.** op manifest는 어떤 surface로도 prose를 evidence로 밀반입할 경로를 제공하지 않는다.
모든 Note-as-evidence 시도는 휴리스틱이 아니라 구조적으로 실패한다.

---

## T3 — Reindex는 결정적이고 idempotent

**불변식(ADR-0002).** SQLite는 md-in-git + `_events`로부터 **결정적이고 idempotent한** reindex로
재구축되는 **파생된 일회용** 인덱스이다.

**동작 & 기대:**

| 동작 | 기대 결과 |
| --- | --- |
| 고정된 코퍼스에서 두 개의 새 DB로 두 번 reindex | row-for-row 동일(안정적 정렬, 안정적 ID) |
| SQLite 파일 삭제 후 reindex | 이전과 기능적으로 동일한 인덱스 재구성 |
| 이미 최신인 인덱스를 reindex(md 변경 없음) | no-op 결과; 동일 내용; 재실행 안전 |
| 단일 `_events` append 후 reindex | 정확히 그 delta만 반영; 손대지 않은 행에 drift 없음 |
| 동일 코퍼스를 미래의 Postgres 엔진 하에서 reindex | 동일한 논리적 행/edge(engine-swap-not-rewrite 입증) |

**합격 기준.** 결정성은 dump 비교로 검증; idempotency는 diff 없이 재실행으로 검증. FTS와 vector는
**별도의 droppable migration**에 있다(ADR-0006) — 이들을 drop/rebuild하는 것이 relational 행에 영향을
주어서는 안 된다.

`TODO(open-question: reconciliation when files are edited outside the skill interface — ADR-0002; test
must define expected reindex behavior for out-of-band edits.)`

---

## T4 — Boundary는 export 시 절대 누출 없음(fail-closed)

**불변식(ADR-0007/0004).** Export는 **교차에서의 re-redaction**을 동반한 **fail-closed allow-list**를
사용한다. public 출력에 confidential 데이터 없음(brief §10).

**동작 & 기대:**

| 시도 | 기대 결과 |
| --- | --- |
| `confidential` Claim을 포함한 `public` 요청 bundle export | **차단** — 항목이 public allow-list에 없음; export fail closed |
| 인용된 한 Evidence는 `confidential`이나 Claim은 `internal`인 export | **차단** — 전체 chain이 대상 boundary를 만족해야 함 |
| 알려진 codename/fab/customer 토큰을 포함한 export 본문 | **Re-redact됨**; redaction 룰셋 버전이 알 수 없음/오래됨이면 **fail closed**(연구 R5 참조) |
| **인식되지 않는** boundary 값을 가진 항목의 export | **차단**(default-deny, default-allow 아님) |
| 완전히 public-safe하고 allow-list된 Claim+Evidence bundle의 export | 수락; bundle **서명됨**; provenance manifest 첨부 |

**합격 기준.** 기본은 deny이다. 어떤 모호함이나 룰셋 불일치도 fail closed된다. 모든 성공적 export에는
signed bundle + provenance manifest가 동반된다. 이것이 최고 심각도의 guardrail이다.

---

## T5 — Import 격리가 작동

**불변식(ADR-0007).** Import = **격리 + confidentiality 검사**, 그다음 노드로 매핑;
**조용한 자동 수락 없음**(ADR-0005); 에이전트 제출은 기본적으로 검토됨.

**동작 & 기대:**

| 동작 | 기대 결과 |
| --- | --- |
| CAW-01 projection bundle import | **격리**에 안착; 검토 전까지 신뢰된 지식으로 검색 불가 |
| 서명 verify에 실패하는 bundle import | boundary에서 **거부** |
| `confidential`로 표시된 bundle을 public-capable 배포로 import | confidentiality 검사가 일반 노출을 **차단**; 참조는 access mediation과 함께 URI로 저장 |
| CAW-05 신호 import; AI 작성 claim | 신뢰가 **T2로 상한**(ADR-0004); 절대 자동 승격 없음 |
| 동일 DOI로 해석되는 두 Source import | 우선순위에 따라 dedup(연구 R6); 낮은 우선순위 매치는 검토를 위해 **플래그**만 |
| artifact 뒷받침 없이 Evidence로 제시된 import된 summary blob | **거부** — evidence gate(T2)가 boundary에서도 적용됨 |

**합격 기준.** import된 어떤 것도 기본 신뢰되지 않는다. 격리에서 승격하기 전에 서명 + confidentiality +
evidence-gate 검사가 모두 실행된다.

---

## T6 — FTS + structured-filter retrieval이 올바른 citation 반환

**불변식(ADR-0006).** 텍스트 retrieval = SQLite FTS5(BM25); **structured filter(boundary,
visibility, type, trust, concept)는 first-class이며 ranking 전에 적용된다**; 결과는 **provenance
chain을 hydrate**한다; RAG는 **citation-constrained**이다(Claim+Evidence를 반환하며, 절대 불투명한
blob이 아님).

**동작 & 기대:**

| 쿼리 | 기대 결과 |
| --- | --- |
| `boundary=public` 필터를 가진 키워드 쿼리 | public 항목만 반환; BM25가 더 높아도 confidential은 절대 나타나지 않음 |
| private-only actor로 행동하며 `visibility=team` 쿼리 | private-scope 필터링이 pre-rank로 적용됨; 누출 없음 |
| `type=Claim` + `trust>=T2` 쿼리 | 매칭되는 typed/trust 행만; 각 결과가 자신의 Evidence chain을 운반 |
| 질문에 대한 RAG retrieval | Claim + 그 Evidence(artifact ref)를 반환; **절대** 불투명한 텍스트 blob이나 미인용 summary 아님 |
| 필터가 모든 후보를 배제 | 빈 결과(fail-loud "no grounded answer"); 환각된/미필터링 폴백 아님 |

**합격 기준.** 필터는 ranking 전에 적용된다(부재해야 하는 high-BM25 confidential decoy를 주입하여
검증). 반환된 모든 항목은 전체 provenance chain을 해석한다.

`TODO(open-question: recall/precision targets that would trigger embeddings — ADR-0006 triggers A–D;
no invented numbers here.)`

---

## T7 — Append-only / supersedes(파괴적 쓰기 없음)

**불변식(ADR-0001/0002).** 쓰기는 **append-only + supersedes**이다; update/delete 없음; 에이전트
쓰기에 기본 confirmation; git history가 감사이다.

**동작 & 기대:**

| 시도 | 기대 결과 |
| --- | --- |
| 엔티티를 hard-delete하는 op | 어떤 surface에서도 op manifest가 **노출하지 않음** |
| Claim "편집" | **새 버전 + supersedes** edge로 실현; 이전 버전 유지 |
| confirmation 없는 에이전트 쓰기(기본 정책) | confirmation을 위해 보류; 조용히 커밋되지 않음 |
| superseded 엔티티의 history 검사 | git + `_events`로부터 전체 chain 재구성 가능 |

**합격 기준.** 어떤 코드 경로도 이전 버전을 변경하거나 제거하지 않는다. supersedes chain은 온전하고
감사 가능하다.

---

## T8 — 단조 boundary/visibility propagation

**불변식(ADR-0004).** `boundary {public,internal,confidential}`와 `visibility {team,private}`는
**계산된 단조 propagation — synthesis는 절대 다운그레이드하지 않음**을 갖는 두 개의 직교 축이다.

**동작 & 기대:**

| 시나리오 | 기대 결과 |
| --- | --- |
| `internal` 하나 + `confidential` 하나의 Claim으로부터 synthesize된 Note | Note가 **`confidential`**로 계산됨(가장 제한적인 것이 이김) |
| `team`+`private` source로부터 synthesize된 Note | visibility가 **`private`**로 해석됨(확대 없음) |
| synthesize된 Note를 입력보다 느슨한 boundary로 수동 설정 시도 | **거부** — 다운그레이드가 됨 |
| 권한 있는 actor에 의한 기밀 해제/다운그레이드 | 감사를 동반한 명시적 재분류 워크플로를 통해서만 허용 |

**합격 기준.** Propagation은 계산되고, 단조이며, 절대 조용히 노출을 확대하지 않는다.

`TODO(open-question: reclassification/declassification authority + audit — ADR-0004.)`

---

## T9 — 쓰기 동시성 일관성

**불변식(ADR-0002).** 동시 팀 쓰기는 `_events` JSONL과 파생된 인덱스를 일관되게 유지한다(이것이
Postgres-port 트리거 — 연구 R3).

**동작 & 기대:**

| 시나리오 | 기대 결과 |
| --- | --- |
| N개의 병렬 `attach_evidence` / `synthesize_note` 흐름 | 모두 append; 손실된 `_events` 라인 없음; reindex가 정합 |
| 동일 엔티티의 동시 supersede | 직렬화됨; 하나가 이기고 다른 하나는 rebase되거나 시끄럽게 거부됨 — 절대 조용한 손실 없음 |
| 정의된 임계값을 넘는 index 경합 | **포트 트리거** 신호를 표면화(손상시키지 않음) |

**합격 기준.** 손실된 쓰기 없음, 손상된 인덱스 없음; 경합은 데이터 손실이 아니라 port-trigger 지표로
관측 가능하다.

`TODO(open-question: N concurrent writers + latency threshold defining the port trigger — research R3.)`

---

## 커버리지 매트릭스(불변식 → 테스트)

| 불변식(출처) | 테스트 |
| --- | --- |
| Claim→Evidence ≥1, 세 lockstep 레이어(ADR-0003) | T1 |
| Evidence gate 구조적; summary ≠ evidence(ADR-0004, brief §10) | T2 |
| 파생 인덱스, 결정적 idempotent reindex(ADR-0002) | T3 |
| Fail-closed export allow-list, public에 confidential 없음(ADR-0007/0004) | T4 |
| import 시 격리, 조용한 자동 수락 없음(ADR-0007/0005) | T5 |
| FTS+filters-before-rank, citation-constrained RAG(ADR-0006) | T6 |
| Append-only + supersedes(ADR-0001/0002) | T7 |
| 단조 boundary/visibility propagation(ADR-0004) | T8 |
| 쓰기 동시성 일관성(ADR-0002) | T9 |

## 런북에 대한 함의

- 각 P0 데이터-레이어 / core / surface 런북은 hand-off 전에 자신의 T1–T3, T6–T8 조각을 **green**으로
  출하해야 한다(DOC-CONVENTIONS §6 "leave the tree green").
- T4–T5는 P1(boundary) 게이트이다; T9는 연구 트랙 R3에 매핑되며 동시성 모델 선택을 게이트한다.
- Surface-parity(어댑터당 한 번 테스트)는 필수이다. 어댑터가 codegen되기 때문이다 — parity 실패는
  어댑터가 아니라 op manifest가 잘못되었음을 나타낸다.
