# Knowledge Viewer — 선택적 읽기 전용 브라우저

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: review date)
- **Related:**
  - [../_meta/PRODUCT-BRIEF_ko.md](../_meta/PRODUCT-BRIEF_ko.md)
  - [../01-decisions/ADR-0001-product-surface-and-skill-interface_ko.md](../01-decisions/ADR-0001-product-surface-and-skill-interface_ko.md)
  - [./api-and-mcp_ko.md](./api-and-mcp_ko.md)
  - [./cli_ko.md](./cli_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
이 문서는 **선택적이고 부차적인 읽기 전용 knowledge viewer**(brief §4, ADR-0001 §2)를 명세한다. 이를 통해 Jimmy와
팀은 **trust 및 boundary 배지**와 함께 Source/Claim/Evidence/Note 및 그 provenance edge를 **둘러볼(browse)** 수 있다.
여기서는 뷰어가 무엇을 보여주는지, 무엇을 해서는 안 되는지, 그리고 다른 모든 reader가 쓰는 것과 동일한 boundary 필터링
읽기 경로를 재사용함으로써 어떻게 비누출(non-leak) surface로 남는지를 확정한다. 뷰어는 **명시적으로 최소한(minimal)**이다:
풍부한 편집은 non-goal이다(brief §9). 뷰어에는 **쓰기 경로가 없다** — 모든 쓰기는 API/MCP/CLI를 통해 이루어진다
([api-and-mcp_ko.md](./api-and-mcp_ko.md), [cli_ko.md](./cli_ko.md)).

## 1. 입장 & non-goal
뷰어는 구축할 **마지막** surface이며(ADR-0001 build-order) 우선순위가 가장 낮다. 코어의 읽기 op(`kr.search`,
`kr.get`) 위에 놓인 얇은 reader다 — SQL을 발행하지 않고, 비즈니스 로직을 갖지 않으며, 어떤 상태도 저장하지 않는다.

| In scope (v0) | Out of scope (non-goal) |
|---|---|
| Source, Claim, Evidence, Note, Concept, Decision, OpenQuestion, signal 둘러보기/검색 | 엔티티 생성/편집/삭제 |
| provenance 체인 Source→Claim→Evidence→Note 렌더링 | WYSIWYG note 편집기 / 리치 텍스트 작성 |
| Trust 배지(T0–T3 + contested) 및 boundary/visibility 배지 | UI에서의 trust/boundary 재정의(override) |
| type, boundary, visibility, trust, concept으로 필터링 | 에이전트 제출 승인(review queue는 별개의 관심사) |
| 엔티티의 audit/provenance 표시(읽기 전용) | import/export 트리거 |
| id로 엔티티에 deep-link | 대량 작업, 대시보드, 분석 |

읽기 전용인 이유: 제품의 가치는 provenance 무결성이다(brief §10). 쓰기 가능한 UI는 코어 가드레일에서 drift(이탈)할 수
있는 네 번째 surface가 될 것이다. ADR-0001은 쓰기를 세 개의 생성된 어댑터로 한정한다. 뷰어가 읽기 전용으로 남는다는 것은
그것이 누출 경로나 손상(corruption) 경로가 **될 수 없음**을 의미한다. TODO(open-question: should the viewer ever gain a
thin "propose" path for humans, or stay strictly read-only in v1? Brief §9 says read-only for now.)

## 2. 데이터 소스: boundary 필터링 읽기 경로
뷰어는 **오직** `kr.search`와 `kr.get`만 호출한다(API를 통해, [api-and-mcp_ko.md §2](./api-and-mcp_ko.md)). 이것이
핵심을 떠받친다: 코어는 **랭킹 전에 boundary 및 visibility 필터를 적용**하므로(ADR-0006), 뷰어는 오직 보는 actor가 볼
권한이 있는 것만 표시할 수 있다. 뷰어는 markdown 파일, SQLite 인덱스, `_events/`를 **직접** 읽지 **않는다** — 그렇게 하면
필터를 우회하여 confidential 항목을 누출할 위험이 있다(ADR-0001 consequences).

```
viewer ──GET /v1/search, GET /v1/entities/{id}──▶ core (boundary+visibility filter) ──▶ derived index
         (read-only, actor-scoped, no other access)
```

뷰어는 **보는 actor**로 인증하며 그 actor의 `kr:read` scope와 권한(clearance)을 상속한다
([api-and-mcp_ko.md §6](./api-and-mcp_ko.md) 참고). 특별한 뷰어 권한은 존재하지 않는다.

## 3. 뷰(최소 집합)

| View | Shows | Backed by |
|---|---|---|
| **Search** | 쿼리 박스 + 일급 필터(type, boundary, visibility, trust, concept); 배지가 붙은 결과 행 | `kr.search` |
| **Entity detail** | 한 엔티티의 frontmatter 필드 + 렌더링된 markdown 본문 + 그 edge들 | `kr.get` |
| **Provenance chain** | 포커스된 엔티티에 대한 Source→Claim→Evidence→Note 그래프, edge에 타입 지정 | `kr.get` (hydrated chain) |
| **Audit (read-only)** | 엔티티의 append-only 이력 + `supersedes` 계보; `verify_audit`에서 온 "chain ok/tampered" | `kr.get`, `kr.verify_audit` |

provenance 체인 뷰는 뷰어의 심장이다: brief의 불변식(invariant)을 **눈에 보이게** 만든다 — Claim은 부착된 Evidence를
(구체적 artifact ref와 함께) 보여주고, Note는 자신이 인용하는 Claim들을 보여주되 **생성된 것이며 evidence가 아님이
명확히 표시된다**.

## 4. 배지 (trust/boundary surface)
배지는 뷰어가 정확히 맞춰야 하는 단 하나의 UI 의미론 조각이며, 틀리면 trust를 잘못 표현하게 된다.

| Badge | Values | Source field | Rendering rule |
|---|---|---|---|
| Trust | T0 / T1 / T2 / T3 / **contested** | derived trust ladder (ADR-0004) | 색상 ladder; `contested`는 항상 시각적으로 구별됨 |
| Boundary | public / internal / confidential | `boundary` (ADR-0004) | confidential = 가장 강한 시각적 표시 |
| Visibility | team / private | `visibility` (ADR-0004) | private 항목은 구별되게 표시 |
| Authoring | human / agent | actor kind | agent 작성은 T2 cap note 표시(ADR-0004) |
| Evidence flag | "Evidence" vs "Generated note (not evidence)" | entity type + `generated` | Note는 결코 evidence로 배지되지 않음 |

뷰어는 trust/boundary를 **코어가 반환한 필드로부터만** 렌더링한다. 결코 계산하거나 재정의하지 않는다. 코어가 어떤
항목을 `contested`로 표시하거나 AI에 의해 T2로 상한 처리하면, 뷰어는 정확히 그것을 보여준다.

## 5. 뷰어가 해서는 안 되는 것 (UI 제약으로서의 가드레일)
- **쓰기 컨트롤 없음.** create/edit/delete/approve 버튼 없음. 정정은 CLI/MCP/API의 `supersedes`를 통해 이루어진다.
- **직접 store 접근 없음.** markdown/SQLite/`_events/`를 결코 직접 읽지 않는다. 항상 필터링된 읽기 경로를 거쳐
  boundary/visibility가 유지되도록 한다(§2).
- **배지 재정의 없음.** Trust와 boundary는 표시 전용이다.
- **de-redaction 없음.** 뷰어는 actor에 대해 `kr.search`/`kr.get`이 반환하는 것만 보여준다. 어떤 필드도 추가하지
  않는다.
- **제품 간 호출 없음.** CAW-01/05/03은 별개의 제품이며 코어를 통한 import/export로만 도달하지, 결코 뷰어를 통해서가
  아니다.

## 6. 기술 태세(최소)
작은 읽기 전용 웹 앱(TODO(open-question: framework — keep deliberately minimal; SSR over the read API vs a tiny
SPA)). 자체 데이터베이스 없음, actor의 API 자격 증명을 운반하는 것을 넘어 자체 auth 시스템 없음. 제품에 영향을 주지 않고
삭제 가능해야 한다 — 진정으로 선택적이다(brief §4 "secondary surface").

## Open Questions
- TODO(open-question: strictly read-only forever vs a future thin human "propose" path; brief §9 says read-only).
- TODO(open-question: viewer framework / deployment — keep minimal; SSR vs tiny SPA).
- TODO(open-question: how the audit view presents hash-chain verification to a non-technical reader).
- [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md) 참고.

## Implications for runbooks
- **RB (viewer):** 마지막에 구축; `kr.search`/`kr.get`만으로 읽기 전용 둘러보기; Source/Claim/Evidence/Note를
  trust + boundary + visibility 배지와 함께 구별되게 렌더링; provenance 체인 뷰; 쓰기 경로 없음, 직접 store 접근
  없음; 코어에 영향을 주지 않고 삭제 가능.
- **RB (negative tests):** 뷰어가 권한이 부족한 actor에게 confidential 항목을 노출할 수 없음을 단언(동일한 boundary
  필터링 읽기 경로를 사용), 그리고 Note가 결코 Evidence로 표시되지 않음을 단언.
