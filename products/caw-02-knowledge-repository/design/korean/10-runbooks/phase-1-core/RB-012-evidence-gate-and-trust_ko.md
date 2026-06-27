# RB-012: structural evidence gate + derived trust ladder 구현

- Status: ready
- Phase: phase-1-core
- Depends on: [RB-010 (product core + op dispatch), RB-011 (data model + Claim→Evidence invariant)]
- Implements design:
  - [../../05-knowledge-core/claim-evidence-and-evidence-gate.md](../../05-knowledge-core/claim-evidence-and-evidence-gate_ko.md)
  - [../../04-data-layer/provenance-and-boundaries.md](../../04-data-layer/provenance-and-boundaries_ko.md)
  - [../../07-backend-api/api-surface.md](../../07-backend-api/api-surface_ko.md)
  - [../../01-decisions/ADR-0004-provenance-and-trust.md](../../01-decisions/ADR-0004-provenance-and-trust_ko.md)
- Produces: structural evidence gate(`attach_evidence`에 prose field 없음; `artifact_ref`는 commit 이전에 resolve되어야 함; `synthesize_note`는 evidence edge를 방출할 수 없음)와, 모든 edge 변경 시 다시 계산되며 AI-authored content가 `T2`로 cap되는, derived하고 설명 가능한 trust ladder `T0–T3 + contested`.

## Objective
gate는 세 가지 위험한 실수 — evidence 없는 Claim, evidence로 둔갑한 prose, evidence로 사용된 Note — 를 권장하지 않는 수준이 아니라 **structural하게 불가능**하게 만든다. `attach_evidence` op은 구성상 `text`/`summary`/`prose` field가 없다; 그 `artifact_ref`는 typed `{kind, ref}`로서 edge가 write되기 전에 이미 카탈로그된 artifact(또는 resolvable URI)로 resolve되어야 한다; `synthesize_note`는 `cites`/`derived_from`만 방출할 수 있다. gate를 통과한 후, core는 trust를 그래프의 순수 함수(evidence count/kind, contestation, authorship)로 도출하며, 결코 caller 값을 받아들이지 않고, AI-authored node를 `T2`로 cap한다. "Done" = negative 테스트 N2, N3이 시끄럽게 실패하고, AI-cap과 contested 케이스가 성립하며, happy path P1이 `cites`만 가진 `generated=true` Note와 함께 `accepted`/`T1` Claim을 산출함.

## Preconditions
- [ ] RB-011 invariant(≥1 `evidence_for`, endpoint legality, note-not-evidence bar)가 세 layer 모두에서 강제되고 green.
- [ ] `evidence` frontmatter schema에 이미 prose field 없음(RB-011 step 2).
- [ ] artifact node(`source`/`trace`/`simulation_run`/`experiment`)의 `_refs/` 카탈로그가 core를 통해 writable.

## Steps

1. **prose field 없는 `attach_evidence` op surface 정의.**
   - Do: op manifest(RB-010)에서 `attach_evidence(claim_ref: ref<claim>, artifact_ref: {kind: source|trace|simulation_run|experiment, ref: <id|uri>}, locator:{page?,line?,span?,selector?}, stance: supports|challenges)` 선언 — 정확히 [claim-evidence-and-evidence-gate.md §3](../../05-knowledge-core/claim-evidence-and-evidence-gate_ko.md). 구조적으로 `text`/`summary`/`prose` input이 없음.
   - Verify: negative 테스트 **N2** — prose summary로 / `artifact_ref` 없이 호출된 `attach_evidence`는 (field가 schema에 존재하지 않으므로) `ERR_EVIDENCE_NOT_ARTIFACT`(envelope `EVIDENCE_GATE`)로 거부됨; 아무것도 write 안 됨.

2. **commit 이전 artifact_ref resolution 강제(layer 1 + 2).**
   - Do: `evidence_for`/`extracted_from` edge를 write하기 전에, `artifact_ref`를 legal kind의 기존 카탈로그 node OR 도달 가능한 URI로 resolve. resolve할 수 없는 ref는 거부, 절대 dangling pointer로 저장하지 않음 → `ERR_ARTIFACT_UNRESOLVED`.
   - Verify: negative 테스트 **N3** — 존재하지 않는 id로의 `artifact_ref`를 가진 `attach_evidence`는 `ERR_ARTIFACT_UNRESOLVED` 반환; Evidence node, edge, file, event가 생성되지 않음.

3. **stance를 올바른 edge로 번역.**
   - Do: `stance=supports` → `evidence_for` edge(Evidence→Claim); `stance=challenges` → `challenges` edge; 항상 `extracted_from`(Evidence→artifact)도 write. 모두 RB-011 legality + note-bar validator를 거침.
   - Verify: `supports` attach는 하나의 `evidence_for` + 하나의 `extracted_from`을 산출; `challenges` attach는 `challenges` + `extracted_from`을 산출; 둘 다 구체적 artifact로 resolve.

4. **`synthesize_note`가 결코 evidence를 생성할 수 없도록 제약.**
   - Do: `synthesize_note(body, cites:Id[], about?:Id[], generated:true)` 선언 — 그 op surface는 `cites`(Note→Claim|Evidence)와 `derived_from`(Note→Source|Claim) edge만 방출할 수 있음; `evidence_for`/`extracted_from`으로의 경로가 없고, node는 구성상 `generated=true`.
   - Verify: synthesize된 Note가 `cites`/`derived_from` edge만 가짐; 그것을 evidence edge로 라우팅하려는 모든 시도는 `ERR_NOTE_AS_EVIDENCE`로 거부됨(RB-011 step 5 재사용).

5. **derived trust ladder 구현(gate 이후).**
   - Do: [provenance-and-boundaries.md §4](../../04-data-layer/provenance-and-boundaries_ko.md)에 따라 `recompute_trust(claim)`을 그래프에 대한 순수 함수로 구현:
     `T0` resolvable evidence 없음; `T1` resolve되는 `evidence_for` ≥1; `T2` 독립적 source ≥2개 OR artifact-backed Evidence(trace/experiment/simulation_run); `T3` T2 AND 권한 있는 agent의 human-review provenance event; `contested` `evidence_for`(supports)와 `challenges` 둘 다 threshold θ를 넘으면. caller가 제공한 divergent `trust`는 거부.
   - Verify: resolve되는 source 하나를 가진 Claim은 `T1`을 계산; 두 번째 독립 source(또는 artifact-backed Evidence)를 추가하면 `T2`를 계산; `trust:T3`를 넘기는 caller는 거부됨.

6. **AI-authored cap 적용.**
   - Do: trust를 도출한 후, node의 author/`attributed_to`가 AI(`actor.kind=agent` / `skill:*`)이면, `trust = min(trust, T2)` 설정; `T3`은 human-review event를 요구([provenance-and-boundaries.md §4](../../04-data-layer/provenance-and-boundaries_ko.md), brief §10).
   - Verify: human-review event를 가진 AI-authored Claim도 여전히 ≤ `T2`를 계산; human-review event를 가진 human-authored Claim에서 같은 evidence는 `T3`에 도달할 수 있음.

7. **`contested` 표현 및 surface.**
   - Do: supports≥θ이고 challenges≥θ일 때, `trust=contested` 설정(surface됨, 절대 숨기지 않음). θ를 configurable 상수로 기록. `TODO(open-question: exact contested threshold θ — owned by ADR-0004).`
   - Verify: 충분한 `evidence_for`와 `challenges` edge를 가진 Claim은 `contested`를 계산; 그 값이 `recompute_trust`에 의해 반환되고 derived로 저장됨.

8. **모든 edge 변경 시와 reindex 시에 recompute.**
   - Do: Claim을 건드리는 모든 `attach_evidence`/`link`/`supersede`가 같은 txn 안에서 그 Claim에 대해 `recompute_trust`를 트리거; `reindex`는 edge + provenance event로부터 trust를 전역적이고 deterministic하게 다시 계산.
   - Verify: SQLite index를 삭제하고 reindex를 재실행하면 모든 Claim에 대해 동일한 trust 값을 재현(deterministic); edge를 추가하면 영향받은 Claim의 trust가 한 txn 안에서 뒤집힘.

9. **전체 happy path P1 실행.**
   - Do: core를 통해 `add_source → extract_claim → attach_evidence → synthesize_note`를 end to end로 실행.
   - Verify: positive 테스트 **P1** — Claim이 `accepted`/`T1`이고, 그 Evidence가 Source로 resolve되며, Note가 `cites` edge만 가진 `generated=true`이고 evidence edge가 없음.

## Acceptance criteria
- [ ] `attach_evidence`에 prose field 없음; N2 ⇒ `ERR_EVIDENCE_NOT_ARTIFACT`, N3 ⇒ `ERR_ARTIFACT_UNRESOLVED`, 둘 다 아무것도 write 안 함.
- [ ] `synthesize_note`는 `cites`/`derived_from`만 방출 가능; node는 `generated=true`; 그것을 evidence edge로 라우팅 ⇒ `ERR_NOTE_AS_EVIDENCE`.
- [ ] trust가 derived(절대 caller-set 아님)이고 설명 가능: T0/T1/T2/T3/contested가 ladder에 따라 계산됨.
- [ ] AI-authored node는 결코 `T2`를 초과하지 않음; T3은 human-review event를 요구.
- [ ] `contested`가 표현 가능하고 `recompute_trust`에 의해 반환됨.
- [ ] trust가 edge 변경 시 recompute되고 reindex 하에서 deterministic(drop-and-rebuild가 값을 재현).
- [ ] P1 happy path 통과(Claim `accepted`/`T1`; Note `generated=true`, `cites`만).
- [ ] 트리가 green(build + lint + N2/N3 + AI-cap + contested + P1 테스트).

## Rollback / safety
- gate는 RB-010 transaction 안에서 실행됨; 거부된 `attach_evidence`는 Evidence node, edge, file, event를 남기지 않음(dangling pointer 없음). trust는 derived하고 disposable이다 — reindex에서 항상 md source of truth로부터 다시 계산되므로, 잘못된 trust 값이 rebuild 너머로 지속될 수 없다. 롤백하려면 gate op과 trust 함수를 등록 해제; data model과 invariant(RB-011)는 온전히 유지됨.

## Hand-off
- RB-013은 같은 gate 이후 그래프 위에 boundary/visibility monotone propagation과 hash-chained audit을 추가한다; trust와 boundary는 독립적 축이며 reindex에서 함께 recompute된다.
- P3(M2)는 structural gate와 trust ladder가 모든 write에 존재한다고 가정한다.
- P5 retrieval은 여기서 생산된 derived `trust`로 filter하고 rank할 수 있다.
