# Risks & Mitigations

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [milestones-and-phases.md](milestones-and-phases_ko.md)
  - [dependency-graph.md](dependency-graph_ko.md)
  - [../01-decisions/ADR-0002-storage.md](../01-decisions/ADR-0002-storage_ko.md)
  - [../01-decisions/ADR-0007-import-export-contracts.md](../01-decisions/ADR-0007-import-export-contracts_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF_ko.md

## Purpose

이 문서는 CAW-02 빌드의 **주요 리스크**와 설계에 내재된 구체적인 완화책을,
탐지 신호 및 담당자와 함께 명명한다. 이 문서는 메커니즘(evidence gate, 전파,
reindex)을 재명세하지 않는다 — 그것들은 ADR에 있다; 여기서는 무엇이 잘못될 수
있는지와 빌드가 그것을 어떻게 방어하는지를 말한다.

## Risk register (ranked)

| # | Risk | Likelihood | Impact | Net | Phase exposed |
|---|------|-----------|--------|-----|---------------|
| R1 | Provenance 손상(resolve 가능한 evidence 없는 claim; 요약이 evidence로 저장됨) | Med | **Critical** | High | P2+ |
| R2 | Export 시 boundary/confidentiality 누출 | Med | **Critical** | High | P6 |
| R3 | 손으로 편집된 git md 대비 reindex 표류(drift) | High | High | High | P1+ |
| R4 | continual learning으로의 범위 확장(scope creep) | High | Med | Med | all |
| R5 | Dedup 품질(잘못된 병합 / 놓친 중복) | Med | Med | Med | P7 |
| R6 | 빌드 예산 중단으로 절반만 지어진, 재개 불가능한 트리가 남음 | High | Med | Med | all |
| R7 | Trust ladder가 AI 작성 콘텐츠를 과도하게 신뢰됨으로 오라벨링 | Med | High | Med | P3 |
| R8 | Surface 발산(API/MCP/CLI가 다르게 동작) | Low | High | Med | P4 |

---

## R1 — Provenance corruption

**무엇이 잘못되는가:** Claim이 resolve 가능한 Evidence 없이 끝나거나, 생성된
Note/요약이 Evidence로 기록되어 재구성 가능성(가치 단위, 브리프 §2)을 파괴한다.

**Mitigations (design-enforced):**
- 3-layer Claim→Evidence invariant — frontmatter schema, core validator,
  reindex 재확인 — 어떤 단일 버그도 이를 통과시킬 수 없도록(ADR-0003).
- **구조적** evidence gate: `attach_evidence`는 **prose 필드가 없고**
  `artifact_ref`는 반드시 실제 artifact로 resolve되어야 한다; note는 절대 evidence가 될 수 없다(ADR-0004).
- Append-only + supersedes(update/delete 없음) + signed git history = 완전한 audit.

**Detection:** reindex는 resolve 불가능한 `artifact_ref`가 있으면 크게 실패한다;
CI는 모든 commit마다 전체 `knowledge/` corpus에 대해 invariant 검사를 실행한다.

**Residual:** resolve는 되지만 *잘못된* artifact. TODO(open-question: evidence-correctness spot-check).

## R2 — Boundary leak on export

**무엇이 잘못되는가:** `confidential`이나 `private` 항목, 또는 그로부터 파생된
합성물이 공개용 또는 CAW-03 bundle에 나타난다.

**Mitigations:**
- **Fail-closed export allow-list** — 명시적으로 허용되지 않은 것은 모두 드롭(ADR-0007).
- **모든 횡단에서의 필수 재-redaction**(import과 export 모두).
- Monotone 전파: synthesis는 절대 `boundary`를 강등하지 않으므로, 파생 노드는
  가장 엄격한 라벨을 상속한다(ADR-0004).
- Signed bundle + provenance manifest로 누출의 책임 추적이 가능하다.

**Detection:** export는 allow-list에 실패하는 항목을 내보내기를 거부한다;
leak-canary 테스트가 confidential fixture를 export에 통과시켜 드롭되는지 단언한다.

**Residual:** 새 artifact 타입에 대해 redaction 규칙이 불완전함 — 규칙이
갱신될 때까지 import 시 quarantine이 폭발 반경을 억제한다.

## R3 — Reindex drift vs git edits

**무엇이 잘못되는가:** 사람이 git에서 md를 직접 편집하고; 파생된 SQLite 인덱스가
더 이상 일치하지 않으며; 쿼리가 오래되거나 부정확한 provenance를 반환한다.

**Mitigations:**
- SQLite는 **파생되고 폐기 가능하다**; reindex는 **결정론적이고 idempotent**하다
  — 표류는 DB 패치가 아니라 재구축으로 고쳐진다(ADR-0002).
- FTS/vector는 별도의 droppable migration에 존재하므로 손상된 인덱스는 복구 가능하다.
- CI는 clean 상태에서 `reindex`를 실행하고 idempotency를 단언한다(반복 실행 = 동일 출력).

**Detection:** `reindex --check` 모드가 현재 SQLite와 fresh 재구축을 diff하여
다르면 실패한다; CI와 pre-export gate로 실행한다.

**Residual:** schema를 위반하는 md 편집이 git에 끼어듦 — reindex 단독이 아니라
commit 시 layer-1 schema 검사로 잡힌다.

## R4 — Scope creep into continual learning

**무엇이 잘못되는가:** 빌드가 자율적 자기 편집 지식 쪽으로 표류하여 브리프를
위반한다(v0 = append + retrieve + skill-wrap; non-goal §9).

**Mitigations:**
- 쓰기는 append-only + supersedes다; manifest에 **update/delete** op이 없다 —
  자율적 자기 편집이 구조적으로 부재한다(ADR-0001).
- Agent 제출물은 **기본적으로 검토된다**; v0에서 조용한 auto-accept 없음(ADR-0005).
- 로드맵 마일스톤(M1–M5)에는 learning/feedback 루프가 없다; 그러한 작업은
  정의상 단계 외(out of phase)다.

**Detection:** op-manifest 검토 — 제안된 모든 mutate/auto-merge op은 설계
검토에서 거부된다; PR 템플릿이 "non-append 쓰기 경로를 추가하는가?"를 묻는다.

## R5 — Dedup quality

**무엇이 잘못되는가:** 근접 중복 Source/Claim이 잘못 병합되거나(provenance 손실)
놓쳐서(저장소 비대화) 처리된다.

**Mitigations:**
- Append-only + supersedes는 잘못된 병합이 되돌릴 수 있음을 의미한다(supersede된 노드가 남는다).
- Dedup은 **P7** 관심사이며, M1 critical path 밖에 두어 가치를 막을 수 없게 한다.
- 보수적인 exact/near-exact 매칭으로 시작하여, auto-merge 대신 후보를 사람 검토에 드러낸다.

**Detection:** 라벨링된 fixture 집합에서 dedup precision/recall 측정.
TODO(open-question: dedup acceptance metric and corpus).

## R6 — Build-budget interruptions

**무엇이 잘못되는가:** AI 빌더가 런북 중간에 예산이 소진되어, 컴파일되지 않고
재개 불가능한 트리를 남긴다.

**Mitigations:**
- **작고 재개 가능한 런북:** 각 런북은 명시적 Preconditions, 원자적 Do/Verify
  단계, Acceptance, Rollback을 갖춘 하나의 응집된 단위다(DOC-CONVENTIONS §6).
- 모든 Acceptance 체크포인트에서 **트리를 green으로 남겨**(컴파일됨, lint 통과)
  중단된 빌드가 마지막 green 상태에서 재개되도록 한다.
- 단계 경계는 체크포인트다; `_events` + git commit이 진행을 기록하여 새 빌더가
  어디서 멈췄는지 읽을 수 있다.

**Detection:** 런북당 CI gate; `blocked`로 남은 런북이 중단된 단위를 표시한다.

**Mitigation pattern — resumable runbook skeleton:**
```
## Preconditions   — checklist; abort if not all true
## Steps           — each: Do: <atomic> / Verify: <objective check>
## Acceptance      — green tree + objective checks (the resume point)
## Rollback        — undo a mid-way failure to the last green state
```

## R7 — Trust mislabeling

**무엇이 잘못되는가:** AI 작성 콘텐츠가 허용된 것보다 더 신뢰됨으로 취급되거나
`contested` 상태가 무시된다.

**Mitigations:**
- Trust는 **파생된** ladder(T0–T3 + contested)이며, reindex에 의해 재계산된다 —
  손으로 설정하지 않음; AI 작성물은 **T2 상한**(ADR-0004).
- Retrieval은 trust + contested를 first-class 필터로 드러낸다(ADR-0006).

**Detection:** AI 작성 노드가 T2를 초과하지 않는다는 reindex 단언; contested 전파 test fixture.

## R8 — Surface divergence

**무엇이 잘못되는가:** API, MCP, CLI가 서로 갈라져 다른 규칙을 강제한다.

**Mitigations:**
- 셋 모두 **하나의 op manifest에서 codegen**되며 로직을 추가하지 않는다; core가
  모든 검증을 소유한다(ADR-0001).
- Cross-surface conformance 테스트가 동일한 op에 대해 동일한 동작을 단언한다.

**Detection:** CI의 conformance suite; codegen diff 검사.

## Open Questions

- resolvability를 넘어선 evidence-correctness spot-check(R1). TODO(open-question).
- Dedup acceptance metric + 라벨링된 corpus(R5). TODO(open-question).
- import된 artifact 타입별 redaction 규칙 커버리지 매트릭스(R2). TODO(open-question).
- See `../08-research-plan/open-questions.md`.

## Implications for runbooks

- 모든 런북은 Rollback을 포함하고 green 트리를 남겨야 한다(R6).
- reindex `--check` idempotency gate(R3)와 export leak-canary(R2)는 선택이 아니라
  필수 CI 단계다.
- op manifest 검토는 모든 non-append 쓰기 경로를 명시적으로 거부한다(R4).
