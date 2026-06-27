# Knowledge Core — Claim→Evidence 불변식과 Evidence Gate

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./overview_ko.md](./overview_ko.md)
  - [./entity-and-edge-model_ko.md](./entity-and-edge-model_ko.md)
  - [../01-decisions/ADR-0003-knowledge-data-model_ko.md](../01-decisions/ADR-0003-knowledge-data-model_ko.md)
  - [../01-decisions/ADR-0004-provenance-and-trust_ko.md](../01-decisions/ADR-0004-provenance-and-trust_ko.md)
  - [../01-decisions/ADR-0001-product-surface-and-skill-interface_ko.md](../01-decisions/ADR-0001-product-surface-and-skill-interface_ko.md)
  - [../01-decisions/ADR-0002-storage_ko.md](../01-decisions/ADR-0002-storage_ko.md)
  - [../01-decisions/ADR-0005-ingestion-pipeline_ko.md](../01-decisions/ADR-0005-ingestion-pipeline_ko.md)
  - [../02-research/provenance-and-trust-models_ko.md](../02-research/provenance-and-trust-models_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF_ko.md

## Purpose
이 문서는 CAW-02의 **핵심 불변식(THE invariant)** — *Claim은 반드시 Evidence를 가리켜야 하고, Evidence는 절대 자유 텍스트가 아니라 구체적인 artifact를 참조하며, 생성된 synthesis(합성물)는 결코 evidence가 될 수 없다* (brief §5, §10) — 과 이를 강제하는 **구조적 evidence gate**를 규정한다. 세 개의 보조를 맞춘(lockstep) 강제 계층, error taxonomy(오류 분류), 그리고 negative test를 정의한다. 이 문서는 전체 entity/edge 어휘를 다시 서술하지 않으며(see [entity-and-edge-model_ko.md](./entity-and-edge-model_ko.md)) trust ladder / boundary 규칙도 다시 서술하지 않는다(see [ADR-0004](../01-decisions/ADR-0004-provenance-and-trust_ko.md)). 그것들을 소비할 뿐이다.

## 1. 왜 이것이 존재하는가
이 제품이 존재하는 이유 전부(brief §2)는 다음과 같다. *기술적 지식은 재구성이 불가능하고, 생성된 요약이 evidence로 오인된다.* gate는 이 문제에 대한 기계 판독 가능한 해법이다. gate는 위험한 실수들 — evidence가 없는 Claim, evidence인 척하는 산문(prose), evidence로 사용된 합성된 Note — 을 단순히 권장하지 않는 수준이 아니라 **구조적으로 불가능하게** 만든다. agent는 실수로라도 provenance를 손상시킬 수 없다.

## 2. 불변식 — 정확한 정의
`kind=claim`인 노드는 다음을 **모두** 만족할 때에만 **유효**하다(즉 `status=accepted` 및 `trust > T0`을 가질 수 있다):
1. `kind=evidence`인 노드로부터 오는 **`evidence_for` edge가 ≥1개** 있고; **그리고**
2. **모든** 그러한 `evidence` 노드는 구체적인 `source | trace | simulation_run | experiment`(또는 해석 가능한 `artifact_uri`)로 향하는 `extracted_from` edge를 가지며; **그리고**
3. 어떤 `evidence_for` / `extracted_from` edge의 `src`로도 `note` 노드가 **나타나지 않는다**.

따름정리:
- evidence를 해석할 수 없는 Claim은 **숨겨야 할 오류가 아니다** — 이는 일급 상태인 `status=needs_evidence, trust=T0`이며, evidence가 붙기 전까지 가시적이고 승격 불가 상태로 유지된다.
- import되었으나 미검증된 신호(ADR-0005/0007) 역시 gate를 **로컬에서** 통과하기 전까지 `T0`에 머문다(import 시 격리, quarantine-on-import).
- `Note`는 Claim/Evidence를 `cites`할 수 있고 Source를 `derived_from`할 수 있지만, evidence 체인의 종착점은 **결코** 될 수 없다. synthesis는 Claim을 *촉발(prompt)*할 수 있고 Claim에 의해 *인용(cited by)*될 수 있지만, Claim을 *뒷받침(back)*할 수는 결코 없다.

```
VALID:                                INVALID (rejected):
  evidence --evidence_for--> claim       claim with 0 evidence_for           -> ERR_TRUST_WITHOUT_EVIDENCE
  evidence --extracted_from--> source    evidence "free text", no artifact   -> ERR_EVIDENCE_NOT_ARTIFACT
                                         note --evidence_for--> claim         -> ERR_NOTE_AS_EVIDENCE
```

## 3. 구조적 evidence gate (skill-wrap, layer 1)
첫 번째이자 가장 강력한 방어선은 **입력 그 자체의 형태(shape)**이다. [ADR-0001](../01-decisions/ADR-0001-product-surface-and-skill-interface_ko.md)에 따라 모든 쓰기는 op manifest를 거치며, `attach_evidence`는 산문을 evidence로 표현하는 것 자체가 불가능하도록 설계되었다:

```
op attach_evidence:
  claim_ref     : ref<claim>                 # must resolve to an existing claim node
  artifact_ref  : { kind: source|trace|simulation_run|experiment, ref: <id|uri> }   # typed; MUST resolve
  locator       : { page?, line?, span?, selector? }   # where in the artifact
  stance        : supports | challenges      # becomes evidence_for | challenges
  # NOTE: there is NO `text` / `summary` / `prose` field. By construction.
```
이 계층에서 gate의 핵심 속성:
- **산문 필드가 존재하지 않는다.** 단락을 evidence로 제출할 수 없으며, 뒷받침을 가리키는 유일한 방법은 typed이고 해석 가능한 `artifact_ref`뿐이다. 이것이 brief §10의 구조적 형태이다.
- **`artifact_ref`는 반드시 해석되어야 한다** — edge가 쓰이기 *전에* 실제로 이미 카탈로그된 artifact 노드(또는 해석 가능한 URI)로 해석되어야 한다. 해석 불가능한 ref는 매달린 포인터(dangling pointer)로 저장되는 것이 아니라 거부된다.
- **`synthesize_note`는 evidence edge를 생성할 수 없다.** 그 op surface는 `cites` / `derived_from`만 방출하며, `evidence_for` / `extracted_from`으로 가는 경로가 없다. Note는 구성상 `generated=true`이다.

## 4. 보조를 맞춘 세 개의 강제 계층
이 불변식은 **단일 DB 제약이 아니다** — "특정 typed edge가 ≥1개"라는 조건은 SQLite *와* Postgres 양쪽에서 FK/CHECK로 이식 가능하게 표현할 수 없다(ADR-0002 이식성). 그래서 세 군데에서 강제되며, 모두 core의 **동일한** 로직을 실행하여 CLI/API/MCP 전반과 엔진 전반에서 동일하게 동작한다.

| Layer | Where | What it checks | On failure |
|---|---|---|---|
| **1. Schema (skill-wrap input)** | op manifest 입력 타입(§3) | `attach_evidence`에는 산문 필드가 없다; `artifact_ref`는 반드시 해석되어야 하는 typed `{kind, ref}`이다. 산문을 evidence로 쓰는 것은 구조적으로 불가능하다. | `ERR_EVIDENCE_NOT_ARTIFACT` |
| **2. Core transaction validator** | core 내부, 커밋 전(pre-commit) | (a) `needs_evidence`를 넘어 승격된 Claim은 `evidence_for`가 ≥1개; (b) 각 Evidence의 `extracted_from` 대상이 해석됨; (c) 어떤 `note`도 `evidence_for`/`extracted_from`의 `src`가 아님; (d) edge 양끝이 legality matrix([entity-and-edge-model_ko.md §4.1](./entity-and-edge-model_ko.md))를 준수함. 실패 시 **트랜잭션 전체를 중단** — 고아 노드/파일/이벤트가 생기지 않는다. | `ERR_TRUST_WITHOUT_EVIDENCE`, `ERR_NOTE_AS_EVIDENCE`, `ERR_EDGE_ENDPOINT_ILLEGAL`, `ERR_ARTIFACT_UNRESOLVED` |
| **3. Reindex re-check** | `knowledge/**` 전체에 대한 배치 reindex | source-of-truth인 md 파일에 대해 전체 불변식을 다시 실행한다; 어떤 위반이든 hard error이며 조용히 인덱싱되는 일은 결코 없다. .md에 대한 수작업 편집과 drift를 잡아낸다. | reindex가 **요란하게 실패**하고, 문제가 된 id를 명시한다 |

Layer 1은 흔한 경우를 입구에서 차단하고; layer 2는 단일 트랜잭션 core 내부의 권위 있는 gate이며; layer 3은 skill-wrap을 우회하는 쓰기(예: 사람이 git에서 .md를 직접 편집)에 대해서도 이 속성이 유지됨을 보장한다.

## 5. Error taxonomy
| Code | Raised by | Trigger | Caller remedy |
|---|---|---|---|
| `ERR_EVIDENCE_NOT_ARTIFACT` | layer 1 | typed `artifact_ref`가 필요한 자리에 산문/요약 값이 제공됨, 또는 `artifact_ref`가 없음. | 먼저 artifact를 `source`/`trace`/… 로 카탈로그한 다음, 그 ref를 전달하라. |
| `ERR_ARTIFACT_UNRESOLVED` | layer 1/2 | `artifact_ref`가 존재하지 않는 노드 / 도달 불가능한 URI를 가리킴. | ref를 고치거나 artifact를 import하라. |
| `ERR_TRUST_WITHOUT_EVIDENCE` | layer 2 | `evidence_for`가 0개인 Claim을 `accepted`/`trust>T0`으로 승격함. | evidence를 붙이거나, `needs_evidence`/`T0`에 두어라. |
| `ERR_NOTE_AS_EVIDENCE` | layer 1/2 | `note` id가 `evidence_for`/`extracted_from`의 `src`로 사용됨. | `cites`/`derived_from`를 사용하라; Note는 결코 evidence가 될 수 없다. |
| `ERR_EDGE_ENDPOINT_ILLEGAL` | layer 2 | `(kind, rel, kind)` 삼중쌍이 legality matrix에 없는 edge. | 적법한 relation/endpoint를 사용하라. |
| `reindex: INVARIANT_VIOLATION` | layer 3 | `knowledge/**`의 .md가 불변식을 위반함. | 문제 파일을 고쳐라; reindex는 깨끗해질 때까지 red로 유지된다. |

모든 실패는 **경고가 아니라 오류(errors, not warnings)**이며(ADR-0004 §3), 원자적으로 중단된다 — .md 파일, `_events/*.jsonl` 라인, `provenance_event`는 **모든** 검사가 통과한 경우에만 쓰인다.

## 6. trust, boundary, append-only와의 상호작용
- **Trust**는 gate를 통과한 *이후*에 도출된다: evidence 0개 → `T0`/`needs_evidence`; 해석되는 source ≥1개 → `T1`; 독립적인 source ≥2개 또는 artifact로 뒷받침되는 Evidence → `T2`; + 사람 리뷰 → `T3`; 임계값을 넘는 `supports`와 `challenges`가 모두 존재 → `contested`. AI 단독 리뷰는 `T2`에서 상한이 걸린다. (상세: [ADR-0004](../01-decisions/ADR-0004-provenance-and-trust_ko.md) §5.)
- **Boundary** 전파는 동일한 gate 통과 후 그래프 위에서 실행된다; synthesis는 결코 민감도를 낮추지 않는다(ADR-0004 §4).
- **Append-only:** 수정(예: 잘못된 evidence 교체)은 제자리 편집이 아니라 `supersedes`로 연결된 *새* 버전이다 — gate는 새 버전에 대해 다시 실행된다. 읽는 쪽은 `supersedes` 체인을 따라 최신 버전을 찾는다.

## 7. 재구성 가능성(Reconstructability) 보장
gate는 어떤 evidence 체인도 산문이나 synthesis에서 종료되는 것을 금지하므로, accepted된 모든 Claim은 재현(replay) 가능하다:
```
note --cites--> claim --evidence_for(in)-- evidence --extracted_from--> source | trace | simulation_run | experiment
```
여기에 hop별 `provenance_event`(누가/무엇을/언제)와 git history가 더해진다. 하류의 어떤 것도 한 단계 아래의 구체적 계층을 가리키지 않고는 존재할 수 없다 — 이것이 CAW-02의 나머지(retrieval, export)가 의존하는 속성이다.

## 8. Negative test (반드시 존재해야 함; runbook 합격 기준)
| # | Attempt | Expected |
|---|---|---|
| N1 | evidence가 0개인 Claim을 `accepted`로 승격. | `ERR_TRUST_WITHOUT_EVIDENCE`; 아무것도 쓰이지 않음. |
| N2 | 산문 요약만 있고 `artifact_ref`가 없는 `attach_evidence`. | `ERR_EVIDENCE_NOT_ARTIFACT` (필드 자체가 없음). |
| N3 | 존재하지 않는 id를 가리키는 `artifact_ref`로 `attach_evidence`. | `ERR_ARTIFACT_UNRESOLVED`. |
| N4 | `note`를 `src`로 하는 `evidence_for` 생성. | `ERR_NOTE_AS_EVIDENCE`. |
| N5 | Evidence가 Note를 가리키도록 .md를 수작업 편집한 뒤 reindex. | reindex `INVARIANT_VIOLATION`, id를 명시; 인덱스는 갱신되지 않음. |
| P1 | 전체 정상 경로(source 추가 → claim 추출 → evidence 첨부 → 인용된 note 합성). | Claim `accepted`/`T1`; Note는 `generated=true`이며 `cites`만 가짐. |

## Open Questions
- TODO(open-question: is "independent source" for T2 corroboration machine-decidable, or human/heuristic? owned with ADR-0004.)
- TODO(open-question: do we persist rejected Claim candidates as audit nodes, and under what boundary? owned with ADR-0005.)
- TODO(open-question: tamper-evidence on provenance events — hash chain in v0 vs later upgrade? owned with ADR-0004.)
- See [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md).

## Implications for runbooks
- **RB (invariant gate):** core에 3계층 강제를 구현한다; 어댑터는 아무것도 추가하지 않는다. §8 negative test를 합격 기준으로 출시한다 — N1–N5는 요란하게 실패해야 하고, P1은 통과해야 한다.
- **RB (skill-wrap):** `attach_evidence`에는 산문 필드가 없다; `artifact_ref`는 커밋 전 해석되어야 한다; `synthesize_note`는 `cites`/`derived_from`만 방출할 수 있다.
- **RB (reindex):** `knowledge/**`에서 인덱스를 재구축하고 **불변식을 다시 실행**한다; 요란하게 실패하며 문제가 된 id를 명시한다.
- **RB (viewer, if in scope):** Claim / Evidence / Note를 trust + boundary 배지와 함께 시각적으로 구별되게 렌더링하여, 사람이 결코 synthesis를 evidence로 오인할 수 없도록 한다.
