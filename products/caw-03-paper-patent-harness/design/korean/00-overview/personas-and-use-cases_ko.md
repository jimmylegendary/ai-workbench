# Persona & 유스케이스 — CAW-03

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [vision_ko.md](./vision_ko.md), [scope-and-non-goals_ko.md](./scope-and-non-goals_ko.md), [../05-harness-core/artifact-lifecycle_ko.md](../05-harness-core/artifact-lifecycle_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적

CAW-03가 누구를 위해 봉사하며 어떤 구체적 워크스루를 지원해야 하는지. 각 유스케이스는 provenance를 갖춘 governed artifact로 끝나거나, 명시적 gate/block으로 끝난다.

## Persona

| Persona | Goal | CAW-03에서 필요로 하는 것 |
| --- | --- | --- |
| **Author (Jimmy)** | evidence를 빠르고 방어 가능하게 논문/특허로 전환 | Gated drafting, novelty/ladder 뷰, 단일 명령 engine run |
| **IP / counsel 리뷰어** | 공개 전에 특허 가능한 아이디어 보호 | Patent-first interlock, counsel confidentiality 등급, filing 준비 핸드오프 |
| **Reviewer (Jimmy)** | publish/file 결정 승인 | Evidence 완전성, review 체크리스트, score 판독, blocked-claim 백로그 |
| **AI agent** | harness를 프로그래밍적으로 구동 | MCP/CLI를 통한 안정적 op-manifest; gate를 우회할 수 없음 |

## 유스케이스

### UC-1 — Evidence-gated 논문 (the vertical slice)
1. CAW-02 cited claim+evidence 번들 + CAW-01 result ref를 `import_bundle`.
2. `build_ledger` → `gate_claims` (P1/P2/P3 임계값; generated text는 evidence로 거부됨).
3. `assemble_inputs` → **gated** claim만으로 engine-neutral 번들(idea/experimental_log/figures).
4. PaperOrchestra(subprocess)로 `draft_paper` → LaTeX/PDF + scores; provenance figure↔result 보존.
5. `review` 체크리스트 → `publish/export` (public-safe).
**완료 조건:** 모든 claim이 gate를 통과하고 evidence로 추적되는 PDF가 존재할 때.

### UC-2 — Patent 경로
1. 동일한 front(gated claim set), 단 PaperOrchestra가 아니라 `PatentEngine` adapter로 `draft_patent`.
2. 특허 전용 구조(claims, spec, prior-art); counsel confidentiality 등급.
**완료 조건:** 특허 draft가 사람/counsel filing gate를 위해 준비될 때.

### UC-3 — Patent-first interlock
1. 어떤 claim이 **patent-sensitive**(novelty/claim-boundary)로 플래그됨.
2. 이를 포함하는 논문을 `publish`하려는 모든 시도는 patent gate가 통과될 때까지 **기본 거부**된다.
**완료 조건:** publish가 명확한 사유와 함께 차단되고; interlock이 해제된 후에만 통과될 때.

### UC-4 — Novelty / ladder 계획
1. PaperOrchestra의 `citation_pool` + imported CAW-05 radar 신호를 사용해 `run_novelty`.
2. claim을 novel 대 threatened로 분류; P1/P2/P3 ladder에 배치.
**완료 조건:** ladder가 논문별 준비도 + threatened/특허 플래그를 보여줄 때.

### UC-5 — stub를 통한 향후 connector (재설계 없음)
1. Operator가 **internal wiki**를 위한 `SourceAdapter`/`Sink`를 config(현재: documented stub).
2. harness가 config로 이를 선택; capability preflight가 "not implemented"를 안전하게 보고.
**완료 조건:** 나중에 실제 connector를 연결하는 것이 adapter 하나를 구현하는 것일 때 — core는 그대로.

## Anti-use-case (v1)

gated claim 없는 자유형 "논문 써줘"; 자율 submission/filing; CAW-01/CAW-02 데이터 편집.

## 미해결 질문

Claim-typing 권한(자동 대 사람), counsel 등급 정의 — [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md).

## runbook에 대한 함의

UC-1은 Milestone-1 acceptance이다; UC-2/UC-3는 patent runbook을 이끈다; UC-5는 ports/stub runbook을 이끈다.
