# ADR-0008: Artifact lifecycle 상태 기계 및 최소 storage (refs-not-copies)

- Status: proposed
- Owner: Jimmy
- Last-reviewed: TODO(open-question: 검토 시 설정)
- Related:
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF_ko.md) (§6, §7)
  - [../02-research/confidentiality-and-artifact-lifecycle.md](../02-research/confidentiality-and-artifact-lifecycle_ko.md) (이 ADR이 비준하는 리서치 — §3, §4)
  - [./ADR-0002-writing-engine-integration.md](./ADR-0002-writing-engine-integration_ko.md) (drafting 전이가 engine 출력 + provenance를 기록)
  - [./ADR-0003-evidence-gate-and-claim-ledger.md](./ADR-0003-evidence-gate-and-claim-ledger_ko.md) (evidence gate는 `gated`의 첫 번째 연언지)
  - [./ADR-0004-patent-drafting.md](./ADR-0004-patent-drafting_ko.md) (patent tail: attorney-review → ready-for-filing → filed)
  - [./ADR-0005-ports-and-adapters.md](./ADR-0005-ports-and-adapters_ko.md) (drafting이 adapter_id + engine_version 기록)
  - [./ADR-0006-paper-ladder-and-novelty.md](./ADR-0006-paper-ladder-and-novelty_ko.md) (novelty는 세 번째 연언지; patent-first는 lifecycle 상태)
  - [./ADR-0007-confidentiality-and-boundary.md](./ADR-0007-confidentiality-and-boundary_ko.md) (confidentiality gate는 두 번째 연언지; egress 재-gate)
- Source of truth: ../_meta/PRODUCT-BRIEF.md

## Context

brief(§6)는 core 도메인을 **artifact lifecycle** —
`claim(s) → evidence gate → draft (engine) → review checklist → (paper PDF | patent draft)` — 로 고정하며, **provenance가 끝까지 보존**되고 **artifact마다 status/state machine**이 있어야 한다. brief(§7)는 데이터 원칙을 고정한다: CAW-03은 자신의 **own minimal** governance/lifecycle 상태를 저장하고 CAW-02 claim/evidence와 CAW-01 result를 id/URI로, 큰 artifact는 path로 **참조**한다; storage는 가볍고, file/SQLite 친화적이며, 제품군과 일관되어야 한다.

작용하는 힘들:

- **하나의 상태 기계, 두 개의 tail.** Paper와 patent는 front(selection, evidence gate, confidentiality, novelty)를 공유하고 `drafting` 이후에만 갈라진다; lifecycle은 전체 기계를 포크하지 않고 둘 다를 표현해야 한다(ADR-0004, ADR-0002).
- **Gate는 연언이며, 올바른 가장자리에서 평가된다.** Evidence(ADR-0003), confidentiality(ADR-0007), novelty(ADR-0006)가 모두 통과해야 `gated`에 도달한다; confidentiality는 **egress에서 재평가**되어야 한다.
- **Provenance는 재현 가능해야 한다.** 공개된 artifact는 "어느 evidence, 어느 engine, 어느 review, 누가 승인했는가"에 답해야 한다 — 따라서 모든 전이는 정확한 CAW-02/CAW-01 입력에 고정된 변조 증거(tamper-evident) 기록이 필요하다.
- **인간이 publish/file/downgrade를 소유한다(brief §10).** AI agent는 이 전이를 수행할 수 없다.
- **상류 store 중복 없음(brief §7, §1).** CAW-03은 id/URI로 참조한다; CAW-02 그래프나 CAW-01 run을 결코 복사하지 않는다. 공유 런타임 기반 없음.
- **Engine 비종속(brief §5).** PaperOrchestra 교체는 lifecycle이 아니라 config 항목 하나를 바꿔야 한다.

## Options considered

### A. lifecycle 형태

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **하나의 상태 기계, 공유 front, `approved`에서 `artifact_type`으로 분기(선택)** | governed front 전체를 재사용; paper/patent는 tail에서만 갈라짐 | tail 상태가 다름; `artifact_type` 구분자 필요 | **Chosen** |
| 두 개의 독립적 상태 기계 | 명확한 분리 | front 중복(gate/conf/novelty); drift 위험 | Rejected |
| 자유 형식 status 문자열 | 유연함 | 불변식 없음; 감사 불가; 재현 불가 | Rejected |

### B. primary store

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **구조화된 상태는 SQLite + 큰 artifact는 디스크 content dir; blob이 아니라 refs/digest(선택)** | 가볍고, 제품군 일관, 질의 가능; 큰 파일은 path로; git 커밋 가능한 이벤트 로그 | 동기화할 storage 매체 두 개 | **Chosen** |
| blob을 가진 단일 SQLite | 파일 하나 | PDF/trace로 DB 비대; 빈약한 diff/git 스토리 | Rejected |
| 파일-디렉터리만(DB 없음) | 단순, git 네이티브 | lifecycle 상태 질의가 약함; join이 어려움 | Open question (여기서 최종 결정) — SQLite+dir 쪽으로 기움 |

### C. provenance / 변조 증거

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Hash-chained append-only 이벤트 로그(CAW-02 `_events` 형태) + git 커밋 가능 JSONL(선택)** | 변조 증거; 재현 가능; git blame = 두 번째 증인 | append-only 규율; in-place 편집 없음 | **Chosen** |
| mutable status 컬럼만 | 단순 | 이력 없음; 재현 불가; 감사 불가 | Rejected |

## Decision

**1. 하나의 Artifact = governance 하의 하나의 paper 또는 하나의 patent draft.** 그것은 선택된 claim set을 confidentiality track, engine run, review, 그리고 terminal 출력에 결합한다. 상태 기계는 `drafted`까지 paper와 patent에 대해 동일하다; tail은 `artifact_type`에서 분기한다(research §3 비준):

```
                 (evidence gate ∧ confidentiality gate ∧ novelty)        [ADR-0003 ∧ ADR-0007 ∧ ADR-0006]
  [selected] ───────────────► [gated] ──────► [drafting] ──► [drafted]
      │  claim set bound          │  pass        │ engine        │
      │                     fail  ▼              │ (port,        ▼
      └─────────────────────► [blocked] ◄───────┘  ADR-0002/04) [in_review]
                                  ▲   (engine error / track downgrade)        │ review checklist (+ autoraters)
              human reclassify /  │              changes requested            │
              add evidence /      └───────────────[changes_requested]◄────────┤
              file patent                                                     │ approved (egress re-gate, ADR-0007)
                                                                              ▼
                                                                         [approved]
                                                          ┌──────────────────┴──────────────────┐
                                              artifact_type=paper                    artifact_type=patent
                                                          ▼                  (attorney-review → ready-for-filing)
                                                  [published_paper]                        ▼
                                                       (terminal)                     [filed_patent] (terminal)

  side states (from any non-terminal): [withdrawn] (terminal), [superseded:<id>] (terminal)
```

patent tail은 `approved → attorney-review → ready-for-filing → filed_patent`(필수 human/counsel gate, ADR-0004)로 확장된다; paper tail은 `approved → published_paper`이다.

**2. Gate는 연언이며, 나가는 길과 상류 변경 시 재-gating한다.**
- `gated`는 **evidence gate ∧ confidentiality 분류 ∧ novelty** 통과를 요구한다; 어떤 실패든 → 타입화된 사유(`EVIDENCE`, `BOUNDARY`, `NOVELTY`, `ENGINE`)와 함께 `blocked`.
- `approved` 도달은 *의도된* sink에 대해 **confidentiality egress 결정을 재평가**한다(ADR-0007 §2.2): `internal-review-required` track을 가진 public sink는 인간 reclassify/clearance까지 `blocked`(`BOUNDARY`)로 되돌아간다.
- **Track은 캐시되지 않고 재계산된다:** 기반 claim set이 바뀌면(claim 추가/재분류/상류 supersede), artifact는 `gated`로 강제 복귀되고 track + novelty verdict가 재계산된다 — 오래된 `public` track이나 evidence를 잃은 claim이 결코 publish까지 지속될 수 없다.

**3. 인간이 publish/file/downgrade를 소유한다.** `approved → published_paper | filed_patent`와 어떤 boundary 다운그레이드든 인간에게 귀속된 이벤트이다; agent는 수행할 수 없다(brief §10). Patent-first 보류(ADR-0006/0004/0007)가 여기서 강제된다: `patent-first`/미출원 claim을 인용하는 publish-bound artifact는 `approved`에서 `published_paper`로 떠날 수 없다.

**4. Terminal 상태는 append-only이다.** 수정은 새 artifact `superseded:<old_id>`를 만들어 공개 기록을 보존한다. `withdrawn`과 `superseded:<id>`는 어떤 non-terminal 상태에서도 도달 가능하다.

**5. 전이마다 provenance.** 모든 전이는 하나의 **hash-chained lifecycle 이벤트**(CAW-02 `_events`와 동일 형태: `seq`, `prev_hash`, `hash`, payload)를 append하며 `from_state`, `to_state`, `actor`(`human:jimmy` | `agent:<engine>`), `timestamp`, `inputs`(claim ids/URIs, result-registry refs, **pinned bundle digest**), `engine_version` + `adapter_id`(drafting 전이, ADR-0005), `boundary_eff` 스냅샷, 그리고 `reason`을 기록한다. 이것은 `claim → … → paper|patent`를 완전히 재현 가능하게 한다; `verify_lifecycle(artifact_id)`는 체인을 걸어 첫 번째 단절을 보고한다(CAW-02 `verify_audit` 미러링). 최종 artifact는 pinned `provenance_digest`를 기록하여 review가 draft가 정확한 gated evidence set으로 구축되었음을 확인할 수 있게 한다(provenance carry-through, ADR-0003 §5).

**6. CAW-03은 governance + lifecycle 상태를 소유하고; 상류의 모든 것을 참조한다(brief §7).**

| Datum | 소유 / 참조 | 형태 |
|---|---|---|
| Artifact 레코드 (id, type, `lifecycle_state`, track, ladder slot) | **소유** | SQLite row |
| Lifecycle 이벤트 로그 (hash-chained 전이 + provenance) | **소유** | append-only JSONL (`_events`) |
| Claim-set 결합 (이 artifact가 쓰는 claim ids/URIs) | **소유 (refs)** | join table → CAW-02 ids/URIs |
| Import된 bundle 스냅샷 (digest, ruleset_version, signature) | **소유 (snapshot)** | file + row; 검증됨, 재저작 안 함 |
| Confidentiality track + egress 결정 + redaction hit | **소유** | rows + `_events` lines |
| Figure/table manifest (어느 result → 어느 figure) | **소유 (refs)** | rows → CAW-01 result-registry refs |
| Review 체크리스트 + autorater 점수 | **소유** | rows / JSON |
| Paper-ladder 계획 (P1/P2/P3 시퀀스 + readiness) | **소유** | rows |
| Adapter/config registry (Source/Engine/Patent/Sink/Novelty) | **소유** | config file + row |
| Draft source & 컴파일 출력 (LaTeX, PDF, patent doc) | **path로 소유** | filesystem; row가 path + sha256 저장 |
| Claim & evidence *content* | **참조** (CAW-02) | 검증된 bundle 내부의 id/URI로 |
| Simulation run / projection / result content | **참조** (CAW-01) | id/URI / result-registry ref로 |
| Novelty/threat radar 신호 | **참조** (CAW-05, 별개 제품) | id/URI로 |

**7. Storage 형태: SQLite + content dir, blob이 아니라 refs/digest.** 구조화된 상태를 위한 단일 SQLite DB(`artifact`, `artifact_claim`, `lifecycle_event`, `review`, `manifest`, `ladder`, `adapter_config`)와 크거나 불투명한 artifact를 위한 content 디렉터리(`artifacts/<id>/draft.tex`, `.../paper.pdf`, `.../bundle.json`). Row는 **refs와 digest**를 저장한다: 외부 지식은 `caw02://claim/<id>` URI로, run은 `caw01://result/<id>`로, 로컬 큰 파일은 상대 `path` + `sha256`로. lifecycle 이벤트 로그는 **git 커밋 가능 JSONL**이라 git blame이 두 번째 증인이다.

```
# illustrative — builder writes the real schema
artifact(id, type[paper|patent], state, conf_track, boundary_eff, ladder_slot, created, updated)
artifact_claim(artifact_id, claim_uri, bundle_digest)               # refs into CAW-02
lifecycle_event(seq, artifact_id, from_state, to_state, actor, ts,
                inputs_json, engine_version, adapter_id, boundary_eff, reason,
                prev_hash, hash)                                     # hash-chained
manifest(artifact_id, figure_id, result_ref, caption, path, sha256) # result_ref → CAW-01
review(artifact_id, checklist_json, autorater_scores_json, verdict, reviewer)
```

**8. lifecycle은 engine/source/sink 비종속이다(brief §5).** `drafting`은 `adapter_id` + `engine_version`을 기록하므로, PaperOrchestra(ADR-0002)를 다른 engine으로 교체하는 것은 lifecycle 변경이 아니라 config 항목 하나이다. gate는 ADR-0003/0006/0007 계약만 읽고 결코 구체적 adapter를 이름으로 읽지 않는다; 미래 source/sink는 상태 기계를 건드리지 않고 adapter(ADR-0005)로 plug in 한다.

## Consequences

**더 쉬워짐:**
- 하나의 감사 가능, 재현 가능한 상태 기계가 paper와 patent 둘 다를 다룬다; governed front는 한 번 작성된다.
- 모든 공개 artifact가 hash-chained 로그 + pinned digest를 통해 정확한 CAW-02/CAW-01 기원으로 재현 가능하다.
- 오래된 track/verdict가 지속될 수 없다(상류 변경 시 강제 재-gate), 따라서 evidence를 잃거나 재분류된 claim이 publish/file 전에 잡힌다.
- 가볍고 제품군 일관된 storage; git이 두 번째 증인; engine 교체는 config만.

**더 어려움 / 비용:**
- storage 매체 두 개(SQLite + content dir)를 동기화 유지해야 함; orphan 파일을 조정해야 함(row의 path + digest로 완화).
- append-only 규율은 수정이 in-place 편집이 아니라 새 `superseded:<id>` artifact임을 의미한다 — 레코드는 많아지나 깨끗한 공개 기록.
- 변경 시 재-gate가 재작업을 강요할 수 있음; 라벨 불변 편집이 engine 재실행 없이 재-gate할 수 있는지는 open question.

**후속 작업(runbooks):**
- RB (lifecycle): 연언 gate, egress 재-gate, 변경 시 재-gate, 인간 전용 publish/file/downgrade, terminal append-only + `superseded` 체인, hash-chained `lifecycle_event` + `verify_lifecycle`를 가진 상태 기계 구현.
- RB (storage): blob이 아니라 refs/digest를 저장하는 SQLite 스키마(§7), content dir, git 커밋 가능 JSONL 이벤트 로그 생성; `verify_lifecycle` 제공.
- RB (bundle-import + manifest): bundle 스냅샷(digest + ruleset_version + signature), URI로 claim set 결합, CAW-01 result ref에서 figure/table manifest를 1:1로 구축 — 상류 콘텐츠를 결코 복사하지 말 것.

## Open questions / revisit triggers

- TODO(open-question: primary store로 SQLite 단일 파일 vs 파일-디렉터리 — 여기서 최종 결정; SQLite + content dir 쪽으로 기움.)
- TODO(open-question: 재-gating 단위 — 어떤 상류 claim 변경이든 전체 재-draft를 강요하는가, 아니면 라벨/evidence가 불변일 때 artifact가 engine 재실행 없이 재-gate할 수 있는가?)
- TODO(open-question: CAW-03이 supersede된 CAW-02 bundle을 어떻게 탐지하여 재-gate를 촉발하는가 — poll, webhook, 또는 re-import-on-build? CAW-02와 boundary 교차, ADR-0003 교차 링크.)
- TODO(open-question: patent tail에서 `counsel`이 별개의 audience/state 뉘앙스인가, 아니면 `in_review`상의 attorney-review actor일 뿐인가? ADR-0004/0007 교차 링크.)
- **Revisit trigger:** 새 artifact type, sink, 또는 engine이 (`artifact_type` tail 분기를 넘어서) 새 core 상태를 강요한다면, 단일 상태 기계 결정을 재검토하라.
- [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) 참조.
