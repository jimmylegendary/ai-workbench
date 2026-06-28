# 기술 스택(Tech Stack) — CAW-03

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [system-architecture_ko.md](./system-architecture_ko.md), [repo-structure_ko.md](./repo-structure_ko.md), [../01-decisions/ADR-0002-writing-engine-integration_ko.md](../01-decisions/ADR-0002-writing-engine-integration_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적

각 tier별로 선택한 스택을 이유 및 version-pin TODO와 함께 정리한다.

## 스택 표

| Tier | 선택 | 이유 | Pin |
| --- | --- | --- | --- |
| Core language | TypeScript (strict) | surfaces + ports 전반에 걸친 하나의 typed contract; CAW-01/02 core와 일관됨 | TODO |
| Surfaces | API (route handlers) + MCP server + CLI + 최소 UI | op-manifest를 구동; agent는 MCP를 통함 | TODO |
| Validation | Zod | typed op IO + capability descriptor + config schema | TODO |
| Writing engine | **PaperOrchestra** (subprocess 경유) | 재구축하지 말고 wrap한다([ADR-0002](../01-decisions/ADR-0002-writing-engine-integration_ko.md)) | TODO — PO suite 버전 + outline.json/citation_pool schema |
| Engine runner | non-interactive PaperOrchestra entrypoint (TBD) | 그 LLM/web/vision 단계를 headless로 실행 | TODO(open-question) |
| Patent engine | PatentEngine port 뒤의 v1 baseline LLM-assisted drafter | 논문과 특허는 다르다 | TODO |
| Doc build | LaTeX → PDF (PaperOrchestra가 생성) | submission-ready 출력물 | TODO |
| Storage | file + SQLite (governance 데이터); artifact는 path로 | 가볍고; 형제 제품들과 일관됨 | TODO |
| Config/registry | config-driven adapter registry (예: entry-point group) | 열린 seam([ADR-0005](../01-decisions/ADR-0005-ports-and-adapters_ko.md)) | TODO |
| Novelty | PaperOrchestra `citation_pool` 재사용 + CAW-05 import | 재질의(re-query) 없음 | n/a |
| Tests | Vitest (core), contract test (ports/adapters), e2e (논문 1편) | tier별 검증 | TODO |

## 해결해야 할 핵심 pin

- **PaperOrchestra:** non-interactive 호출 모드 + pin된 suite/schema 버전(EngineDescriptor.version).
- patent-first 기본값(grace vs absolute novelty)을 위한 **Jurisdiction(관할)** — TODO(open-question).
- adapter별 Secrets/auth는 **env ref**로 존재한다(공유 substrate 없음).

## boundary 환기

core는 port에만 의존한다; adapter는 절대 core를 import하지 않는다; PaperOrchestra는 out-of-process로 실행된다
([component-boundaries_ko.md](./component-boundaries_ko.md)).

## 미해결 질문(Open questions)

Engine의 subprocess 방식 vs skill-mode 호출; adapter별 secret 처리 — [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md).

## 런북에 대한 함의

Phase-0에서는 이를 package manifest + lockfile + PaperOrchestra 호출 harness로 전환하고, 확정된 pin은 다시 여기에 기록한다.
