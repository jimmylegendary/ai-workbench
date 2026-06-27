# CAW-02 Runbook Conventions — builder 계약

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [README.md](README_ko.md)
  - [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS_ko.md)
  - [../09-roadmap/milestones-and-phases.md](../09-roadmap/milestones-and-phases_ko.md)
  - [../09-roadmap/dependency-graph.md](../09-roadmap/dependency-graph_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적

이 문서는 [DOC-CONVENTIONS §6](../_meta/DOC-CONVENTIONS_ko.md)의 **엄격한 runbook 계약**을 다시
서술하고, **CAW-02에 특화된 builder 규칙** — AI builder가 어떤 `RB-*.md`를 실행하든 절대 위반해서는 안 되는
invariant — 을 추가한다. 이 문서는 phase 순서를 정의하지 않으며(see
[README.md](README_ko.md)) 설계 결정 자체도 정의하지 않는다(see
`../01-decisions/`). 여기 있는 어떤 내용이든
[PRODUCT-BRIEF](../_meta/PRODUCT-BRIEF_ko.md)와 모순되면 brief가 이긴다.

## 1. 엄격한 runbook 포맷(필수)

모든 runbook은 `10-runbooks/0X-<phase>/RB-XXX-<topic>.md`이며, kebab-case이고, 번호 체계
`RB-0XX` = P0, `RB-1XX` = P1, … 가 phase 폴더와 일치한다. runbook은 반드시 정확히 다음 골격을
포함해야 한다:

```
# RB-XXX: <imperative title>
- Status: ready | blocked
- Phase: <phase folder name>
- Depends on: [RB-###, ...]
- Implements design: [relative links]
- Produces: <artifacts/components>

## Objective          — one paragraph; what "done" looks like
## Preconditions      — checklist true before starting
## Steps              — numbered atomic steps, each with **Do:** and **Verify:**
## Acceptance criteria — objectively checkable checklist
## Rollback / safety  — how to undo a mid-way failure
## Hand-off           — what the next runbook can assume
```

모든 runbook을 구속하는 규칙:

- **원자적이고 검증 가능한 step.** 각 step은 구체적인 **Do:** 와, 객관적으로 검사 가능한
  **Verify:** (명령, 파일의 존재, 테스트 결과)를 가진다. 어떤 step도 그 Verify가 통과하기 전까지는
  "done"이 아니다.
- **코드는 빌드 가이드일 뿐이다.** skeleton, signature, schema, config는
  예시이며, 실제 코드는 builder가 작성한다.
- **`Depends on:`은 DAG를 반영한다.** 그것은
  [dependency-graph.md](../09-roadmap/dependency-graph_ko.md)의 edge 목록과 일치해야 한다. runbook은 모든
  의존성이 accepted/green이 되기 전까지 `blocked`이다.
- **설계를 cross-link하라.** `Implements design:`은 runbook이 빌드하는 모든 ADR / 설계 문서를 링크하고,
  runbook이 구현하는 설계로부터 runbook으로 다시 링크하라.
- **정확한 이름을 사용하라.** Entity와 용어 이름은
  [PRODUCT-BRIEF §5](../_meta/PRODUCT-BRIEF_ko.md)와 GLOSSARY에서 그대로 가져온다.
- **모든 Acceptance checkpoint에서 green 트리** — 아래 규칙 8 참조.

## 2. evidence gate를 존중하라(structural, 타협 불가)

evidence gate는 **권고가 아니라 structural**하다. write를 건드리는 모든 runbook은 이를
보존해야 한다:

- `attach_evidence`에는 **prose field가 없다.** Evidence는 `artifact_ref`로 구체적인
  artifact/source를 참조하며, 이는 **반드시 resolve되어야** 한다. note는 evidence가
  아니다. 생성된 summary는 **절대** Evidence로 저장되지 않는다.
- **Claim→Evidence(≥1)** invariant는 **lockstep으로 동작하는 세 layer**에서 강제된다:
  (1) frontmatter JSON-schema, (2) core validator, (3) reindex re-check. Evidence가 0개인 Claim은
  **세 곳 모두에서 거부**되어야 한다. runbook은 어떤 layer도 약화시킬 수 없으며, layer-1 field를
  추가하려면 같은 runbook에서 layer 2와 3을 함께 갱신해야 한다.
- source, claim, evidence, 그리고 생성된 결론을 **분리** 상태로 유지하라
  (PRODUCT-BRIEF §10). 공개 research를 내부 claim과 절대 혼동하지 마라.

## 3. md-git이 단일 source of truth

- Entity = `knowledge/{sources,claims,evidence,notes,concepts,interests,decisions,open-questions,assumptions,signals}/`
  아래의 하나의 `.md` 파일(YAML frontmatter + body)이다.
  git에 있는 이 markdown 파일들이 **유일한** 권위 있는 store이다.
- **SQLite는 derived, disposable index이다.** 모든 runbook은 SQLite
  파일이 삭제될 수 있고 `knowledge/`만으로 **deterministic하고 idempotent한
  reindex**에 의해 완전히 재구성될 수 있다고 가정해야 한다. 고정된 corpus에 대한 reindex는 반복 실행 시
  byte-identical한 내용을 산출해야 한다. FTS5 / vector schema는
  **별도의 droppable migration**에 존재한다 — 절대 relational core schema에 두지 않는다.
- builder는 SQLite를 source of truth로 만들거나, md-git에서 재구성할 수 없는 상태를 cache하거나,
  core를 거치지 않고 `.md` 파일 이외의 어디에든 entity 데이터를 써서는 안 된다.

## 4. Append-only + supersedes(파괴적 write 없음)

- knowledge에 대한 **update도 delete도 없다.** 수정은 이전 노드를 **supersede**하는 새 버전을
  씀으로써 일어난다. history는 보존된다.
- 모든 write는 `knowledge/_events/<ts>-<op>.jsonl`에 **정확히 하나의** 줄을 append하며,
  git commit이 audit 기록이다. runbook은 events 로그를
  append-only이고 write당 한 줄로 유지해야 한다.
- audit은 모든 노드가 현재 상태에 어떻게 도달했는지 재구성할 수 있어야 한다(events + signed git
  commit/blame). history를 다시 쓰지 마라.

## 5. 하나의 transactional core; surface는 얇다

- 모든 validation, evidence gate, trust recompute, boundary propagation, 그리고
  append-only audit은 **하나의 transactional product core**에 존재한다.
- API, MCP, CLI는 **하나의 op manifest로부터 codegen된 얇은 adapter**이며 —
  **로직이 전혀 없고** core validator나 evidence gate를 **우회할 수 없다.** conformance
  테스트가 세 surface 전체에서 동일한 동작을 보여야 한다.
- op manifest(`add_source`, `parse`, `extract_claim`, `attach_evidence`,
  `synthesize_note`, classify/link)는 surface가 생성의 기준으로 삼는 단일 정의이다.

## 6. Agent 안전: 기본 confirmation, 조용한 auto-accept 없음

- agent write는 **기본적으로 confirmation**이다. confirmation 없는 agent write는
  **차단**된다. 거부된 candidate는 audit을 위해 보존된다.
- AI가 작성한 노드는 **trust T2로 cap**된다(절대 T3 아님). trust는 reindex에 의해
  deterministic하게 다시 계산된다.
- boundary/visibility propagation은 **monotone**하다: `confidential` 입력으로부터의
  synthesis는 결코 덜 제한적인 boundary를 산출하지 않는다. private/team
  분리는 절대 강등되지 않는다.
- 자동 생성은 **proposal 생성**이다. Jimmy가 전략적 결정을 검토한다(PRODUCT-BRIEF §10).

## 7. 지속 학습 없음(v0 범위 가드)

- v0 = **append + retrieve + skill-wrap**. 지속 학습 / knowledge의 자율적
  self-editing은 **non-goal**이다(PRODUCT-BRIEF §9). 어떤 runbook도 self-editing,
  무거운 graph DB(Neo4j), 풍부한 편집 UI, 공개 website,
  simulation/radar 실행, 또는 team-vs-private를 넘는 조직 규모의 access control을
  빌드해서는 안 된다. 업그레이드 경로는 열어두되, 구현하지 마라.
- 공개용 출력에 confidential 회사 데이터 없음. export는 public-safe만 가능하며
  fail-closed이다.

## 8. 모든 checkpoint에서 트리를 green으로 남겨라

- 각 Acceptance checklist는 **재개 지점**이다: 그 지점에서 트리는 compile,
  lint, schema-validate를 통과해야 한다. 중단된 빌드는 마지막 green
  checkpoint에서 재개된다.
- 하나의 builder 세션 안에서 green에 도달할 수 없는 runbook은 **너무 크다** —
  쪼개라. 작고 단일 관심사이며 재개 가능한 runbook을 선호하라(예산 규율,
  [README.md](README_ko.md) 참조).
- **Rollback / safety** 섹션은 중간 실패를 깔끔하게 되돌리는 방법(commit revert,
  md-git에서 SQLite index를 drop하고 재구축, quarantine된 import 폐기)을 서술하여 트리가
  이전 green 상태로 돌아가게 해야 한다.

## 9. 독립성 계약(Independence contract)

CAW-02는 자체 core, data, surface를 가진다 — 다른 제품과 **공유 runtime substrate가 없다.**
CAW-01 / CAW-05 / CAW-03 상호작용은 **import/export
boundary만**(파일/API)이며, 모든 경계 교차 시 재-redaction이 일어나고 **공유
store/registry/DB가 없다.** runbook은 다른 제품을 "a separate product"로 명명해야 하며 공유
substrate를 절대 암시해서는 안 된다.
