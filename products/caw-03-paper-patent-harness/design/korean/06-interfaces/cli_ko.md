# CLI — CAW-03

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [api-and-mcp.md](./api-and-mcp_ko.md), [../07-backend-api/api-surface.md](../07-backend-api/api-surface_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적 (Purpose)

op-manifest에 1:1로 매핑되는 스크립트 가능한 CLI. 도메인 로직은 없으며 API/MCP와 core contract를 공유한다.

## 명령어 (Commands)

```
caw3 import   <sourceRef>                       # import a CAW-02 bundle / CAW-01 results (via SourceAdapter)
caw3 ledger   build <bundleId>
caw3 gate     <ledgerId> --profile <p>          # fail-closed; prints blocked-claim backlog
caw3 assemble <gatedSetId>                       # engine-neutral inputs (gated only)
caw3 draft    paper  <artifactId>               # PaperOrchestra
caw3 draft    patent <artifactId>               # PatentEngine
caw3 novelty  <ledgerId>                         # citation_pool + CAW-05 radar; flags claims
caw3 review   <artifactId>
caw3 publish  <artifactId> --sink <sinkRef>      # confirm prompt; interlock + confidentiality enforced
caw3 adapters list|preflight                     # show registry + capability preflight
```

## 출력 (Output)

기본은 사람이 읽기 쉬운 형식이며, 기계용으로는 `--json`을 사용한다. `publish`/출원(filing)은 `--yes`가 없으면 confirmation을 묻는다(그래도 core의 interlock + 기밀성(confidentiality) 적용을 받는다).

## 미해결 질문 (Open questions)

`publish`에 대해 `--yes`를 애초에 허용할지 여부(현재 방향: 특허에 민감한 경우 절대 불가) — [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) 참조.

## 런북에 대한 함의 (Implications for runbooks)

CLI runbook은 op-manifest로부터 명령어를 생성한다. `adapters` 명령은 registry/preflight를 노출한다.
