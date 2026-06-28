# API & MCP — CAW-03

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [cli.md](./cli_ko.md), [../07-backend-api/api-surface.md](../07-backend-api/api-surface_ko.md), [../01-decisions/ADR-0001-product-surface.md](../01-decisions/ADR-0001-product-surface_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적 (Purpose)

API + MCP surface는 transport에서 op-manifest로 관리되는 operation으로 이어지는 얇은 매핑이다. 여기에는 도메인 로직이 없다.

## MCP 도구 카탈로그 (→ op-manifest)

| MCP tool | Op | 비고 |
| --- | --- | --- |
| `import_bundle` | import_bundle(sourceRef) | SourceAdapter 경유 |
| `build_ledger` | build_ledger(bundleId) | CAW-02 참조 |
| `gate_claims` | gate_claims(ledgerId, profile) | fail-closed |
| `assemble_inputs` | assemble_inputs(gatedSetId) | gated 항목만 |
| `draft_paper` | draft_paper(artifactId) | PaperOrchestra |
| `draft_patent` | draft_patent(artifactId) | PatentEngine |
| `run_novelty` | run_novelty(ledgerId) | citation_pool + radar |
| `review` | review(artifactId) | checklist + 점수 |
| `publish` | publish(artifactId, sinkRef) | **confirmation required (확인 필요)**; interlock + 기밀성(confidentiality) |

## Human-gate 연산 (Human-gate ops)

`publish` 및 특허 출원(filing) 관련 op는 모두 **명시적 confirmation(확인)**을 요구한다(agent는 자동으로 publish/출원할 수 없다). patent-first interlock + 기밀성(confidentiality)은 surface와 무관하게 core에서 강제된다.

## 타이핑 (Typing)

모든 도구 IO는 core의 Zod 타입 op contract를 사용한다([../07-backend-api/api-surface.md](../07-backend-api/api-surface_ko.md)). 동일한 contract가 REST API(route handler)와 CLI를 뒷받침한다.

## 인증 / 스코핑 (Auth / scoping)

읽기 전용 도구와 변경(mutating) 도구를 구분한다. 변경 + human-gate 도구는 상위 권한의 confirmation을 요구한다. v1은 단일 사용자이며, adapter별 secret은 env ref로 관리한다.

## 미해결 질문 (Open questions)

MCP scoping 세분성; `run_novelty`가 read-only인지 플래그를 변경하는지 — [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) 참조.

## 런북에 대한 함의 (Implications for runbooks)

API/MCP runbook은 op-manifest로부터 도구 카탈로그를 생성하고 human-gate op에 confirmation을 연결한다.
