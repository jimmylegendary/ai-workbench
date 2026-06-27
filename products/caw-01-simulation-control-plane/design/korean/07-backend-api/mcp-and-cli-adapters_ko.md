# MCP & CLI 어댑터 — CAW-01

- **Status:** 초안(draft)
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [api-surface_ko.md](./api-surface_ko.md), [../01-decisions/ADR-0001-product-surface_ko.md](../01-decisions/ADR-0001-product-surface_ko.md), [../02-research/product-surface-and-stack_ko.md](../02-research/product-surface-and-stack_ko.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF_ko.md

## 목적

MCP 서버와 CLI가 웹 앱과 **동일한** `@caw/core` 연산을 어떻게 노출하는지, 그리고 이 제품에서 "skill"이
무엇을 의미하는지를 정의한다. CAW-01은 독립적이고 자립적인 제품이다(공유 런타임 substrate가 없는 6개의
독립 제품군 CAW-01..06 중 하나). MCP와 CLI는 CAW-01 **자신의** 자동화 표면이며, 외부 에이전트/도구가
**이** 제품을 구동할 수 있게 한다. 세 표면 모두 얇으며(thin), 계약은 [api-surface_ko.md](./api-surface_ko.md)이다.

## 원칙

하나의 코어, 세 개의 표면. MCP와 CLI는 **어떤 도메인 로직도 추가하지 않는다** — 자신의 기본 요소(primitive)를
코어 연산에 매핑할 뿐이다([ADR-0001](../01-decisions/ADR-0001-product-surface_ko.md)).

## MCP 도구 카탈로그 (코어 연산에 매핑)

| MCP 도구 | 코어 연산 |
| --- | --- |
| `experiment.create/update/get/list` | `ExperimentService.*` |
| `run.start/status/stop` | `RunService.*` (상태 스트림/폴링) |
| `registry.models/serving/hwparts/strategies` | `RegistryService.*` |
| `worktree.saveItem/saveAll/branch/diff/history` | `WorkTreeService.*` |
| `evidence.metrics/projection/trustStatus/registerArtifact` | `EvidenceService.*` |

이를 통해 외부 에이전트와 도구가 이 제품을 프로그램적으로 구동할 수 있다.

## CLI 명령 카탈로그 (코어 연산에 매핑)

```
caw experiment create|update|get|list
caw run start <exp> [--axes ...] [--backend analytical] ; caw run status <run> --follow ; caw run stop <run>
caw worktree save-item <exp> <path> | save-all <exp> -m "msg" | branch <exp> <from> <name> | diff <a> <b>
caw evidence metrics <run> | projection <exp> --refs ... | trust <run>
caw registry models|serving|hwparts|strategies
```

## 여기서 "skill"이란 무엇인가

**skill**은 **이 제품 자신의 연산**에 대한 재사용 가능한 *워크플로*(명확한 입력/출력을 갖는 코어 연산의
시퀀스)를 패키징하여, 주로 MCP를 통해 노출함으로써 외부 에이전트들이 재사용할 수 있게 한다. skill은 계약 위의
조합(composition)이지 새로운 도메인 로직이 아니다.

## 인증 & 범위 지정

v1은 단일 사용자(single-user)이며, 표면들은 동일한 로컬 자격 증명/설정을 공유한다. MCP 도구의 범위 지정
(읽기 전용 vs 변경)은 다중 에이전트 사용을 위한 TODO(open-question)이다.

## 미해결 질문

- v1에서 MCP 서버가 run 상태를 스트리밍할지, 아니면 폴링만 할지 — TODO(open-question).
- 이 제품 자신의 skill을 위한 skill 패키징 포맷(manifest) — TODO(open-question).

## 런북에 대한 함의

Phase-5는 이미 구현된 코어 위에 얇은 매핑으로 MCP 서버 + CLI를 구축한다. 비즈니스 로직은 추가되지 않는다.
