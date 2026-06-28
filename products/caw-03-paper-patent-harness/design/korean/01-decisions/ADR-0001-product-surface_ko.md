# ADR-0001: 제품 표면 — harness 제어 평면 (API + MCP + CLI + 최소 review/status UI)

- **Status:** proposed
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF_ko.md) (source of truth)
  - [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS_ko.md)
  - [ADR-0002-writing-engine-integration.md](ADR-0002-writing-engine-integration_ko.md)
  - [ADR-0003-evidence-gate-and-claim-ledger.md](ADR-0003-evidence-gate-and-claim-ledger_ko.md)
  - [ADR-0005-ports-and-adapters.md](ADR-0005-ports-and-adapters_ko.md) (load-bearing)
  - [../02-research/ports-and-adapters-architecture.md](../02-research/ports-and-adapters-architecture_ko.md) (§2 driving vs driven)
  - [../02-research/confidentiality-and-artifact-lifecycle.md](../02-research/confidentiality-and-artifact-lifecycle_ko.md) (§3 lifecycle, human gate)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
사람, AI 에이전트, 스크립트가 CAW-03 harness를 구동하는 **표면(surface)**, 그리고 모든 표면이 **하나의 harness 코어** 위에 놓인 얇은 **driving adapter**라는 규칙을 결정한다. v1에 어떤 표면이 존재하는지(API, MCP, CLI, 최소 review/status UI)를 고정하며, governance(evidence gate, confidentiality egress, 사람의 publish/file gate)가 어떤 표면도 우회할 수 없는 코어에 자리한다는 불변식을 고정한다. writing-engine 래핑(ADR-0002), evidence gate 로직(ADR-0003), driven port/registry(ADR-0005), patent drafting, 저장은 결정하지 **않는다** — 이들을 안정적인 코어 boundary로서 소비한다.

## Context
- 브리프(§8)는 표면을 "harness control: API + MCP + CLI + minimal review/status UI"로 명명한다. CAW-03은 **챗봇이 아니라 harness**(§1)다: 표면은 타입이 지정된 governed operation을 노출하며, 자유 형식의 "write a paper" 프롬프트는 결코 노출하지 않는다.
- 모든 부가가치는 **엔진이 제공하지 않는 governance**(§3)다: claim ledger, evidence gate, novelty/patent-first interlock, confidentiality filter, 사람의 publish/file gate. 각 표면이 이것을 재구현한다면 서로 어긋나게 되고 가장 약한 표면이 누수 지점이 된다(CAW-02 ADR-0001의 "one core" 규칙을 그대로 반영).
- 페르소나: **Jimmy**(curator이자 전략/publish/file 결정에 대한 유일한 권한자, §10), **AI 에이전트**(입력을 조립하고 엔진을 실행하며 draft를 제안 — 가장 위험도가 높은 작성자), **스크립트/CI**(headless 빌드).
- 아키텍처 연구(ports-and-adapters §2)는 port를 **driven**(Source/Engine/Patent/Sink/Novelty — 코어가 호출해 나감)과 **driving**(표면 — 코어 *안으로* 호출해 들어옴)으로 나눈다. 이 ADR은 driving 측을 소유하고, ADR-0005는 driven 측을 소유한다.
- 독립성(§1): CAW-03은 자체 코어, 데이터, 배포를 가진다; 공유 런타임 substrate가 없다. 표면은 CAW-03 내부에 한정된다; 제품 간 데이터는 오직 SourceAdapter(ADR-0005)를 통해서만 도착하며, 공유 API를 통하지 않는다.

## Options considered

### A. 표면 아키텍처
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **하나의 harness 코어; API/MCP/CLI/UI는 공유 operation set 위의 얇은 driving adapter** | 단일 chokepoint가 gate + human-gate + confidentiality를 강제; 표면들은 증명 가능하게 동등; 에이전트 = 사람 = 스크립트 | op-manifest 규율이 필요 | **Chosen** |
| 표면별 독립 로직 | 각자 빠르게 출시 | governance drift가 보장됨; 가장 약한 표면이 누수; 브리프 §3/§10 위반 | Rejected |
| v1은 API만 | 최소 | 브리프 §8은 v1에 MCP(에이전트) + CLI(사람/CI) + review UI를 명시적으로 원함 | Rejected |

### B. 에이전트/자동화 인터페이스 스타일
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **검증된 타입 지정 operation** (`import_bundle`, `type_claim`, `run_gate`, `assemble_inputs`, `draft`, `screen_patent`, `review`, `request_publish`, `request_file`) | 각 op가 하나의 불변식을 운반; gate는 서버 측에서 실행; "draft an ungated claim" 경로가 없음 | 정의할 op가 더 많음 | **Chosen** |
| artifact에 대한 일반 CRUD | op가 적음 | 불변식을 호출자에게 누설; 에이전트가 `approved`로 표시하거나 직접 publish 가능 | Rejected |
| 자유 형식 "write me a paper" 도구 | 쉬움 | harness 전제(§1)를 파괴; gate 우회 | Rejected |

### C. 최소 UI
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **읽기 위주의 review/status UI** — artifact lifecycle board, gate/novelty/confidentiality 리포트, diff/score 뷰, 그리고 **사람의 approve/publish/file 액션** | 반드시 사람이 해야 하는 한 가지(§10)를 표면화; 빌드 비용 낮음; 유지할 편집 엔진 없음 | 얇은 서버가 필요 | **Chosen** |
| 완전한 authoring/editing UI | 풍부함 | 엔진의 역할을 재창조; 막대한 범위; 브리프의 non-goal | Rejected |
| UI 없음 (CLI만) | 가장 저렴 | 사람의 gate + lifecycle review가 제품의 핵심 인간 접점; board는 그만한 가치가 있음 | Rejected |

### D. MCP 노출
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **동일한 검증된 op를 도구로 노출하는 MCP 서버** (변경성 publish/file 도구는 gate되며 자동 실행 불가) | 에이전트가 동일한 governed op를 통해 harness를 구동; PaperOrchestra 자체가 skill suite이므로 에이전트 host가 자연스러움 | 유지할 MCP 표면 | **Chosen** |
| MCP 없음 | 더 단순 | 에이전트는 주요 페르소나(§3, 브리프 §8)이며 raw 스크립트로 우회하게 됨 | Rejected |

## Decision
**하나의 harness 코어; 검증된 타입 지정 operation의 단일 집합 위에 놓인 네 개의 얇은 표면.**

1. **코어 operation set (op-manifest).** harness는 governed operation의 유한한 카탈로그를 노출하며, 각각은 해당 액션을 수행하는 *유일한* 방법이고 각각 자신의 불변식을 코어에서 강제한다: `import_bundle`, `list/type_claim`, `run_gate`, `check_novelty`, `assemble_inputs`, `draft`(WritingEngine), `screen_patent` / `draft_patent`(PatentEngine), `run_review`(checklist + autoraters), `request_publish`, `request_file`, `get_artifact`/`get_lifecycle`. API, MCP, CLI, UI는 이 단일 manifest로부터 생성/배선되어 서로 어긋날 수 없다.
2. **API (타입 지정, primary).** 스크립트/CI를 위한 머신 boundary이자 다른 표면이 호출하는 substrate. artifact lifecycle(ADR-0007/confidentiality 문서 §3)을 운반하고 provenance를 담은 value object를 반환한다.
3. **MCP 서버.** AI 에이전트 host를 위해 동일한 op를 MCP 도구로 제공. read/assemble/draft/review 도구는 에이전트가 호출 가능하다; `request_publish`/`request_file` 및 모든 boundary downgrade는 **proposal-only**다 — 보류 중인 human-gate 이벤트를 생성할 뿐, 종단 전이를 결코 실행하지 않는다(브리프 §10; confidentiality 문서 §3.2).
4. **CLI.** 사람과 headless 빌드를 위한 API의 얇은 래퍼; subprocess-mode 엔진 실행(ADR-0002)과 CI의 기본 표면.
5. **최소 review/status UI.** 읽기 위주: artifact **lifecycle board**(`selected → gated → drafting → drafted → in_review → approved → published_paper|filed_patent`), gate/novelty/confidentiality/score 리포트, draft + diff/score 뷰어, 그리고 **사람의 approve → publish/file 액션** — 우회 불가능한 단 하나의 특권적 제어. 또한 registry(ADR-0005 §5)에서 등록된 adapter + capability descriptor를 나열하여 배선이 보이도록 한다. authoring/editing 엔진은 없다.

**Governance는 표면이 아니라 코어에 자리한다.** evidence gate(ADR-0003), confidentiality egress `decide()` + redaction 재스윕, novelty/patent-first interlock, 그리고 사람 전용 publish/file/downgrade 전이는 코어 로직이다. 표면은 전이를 *요청*할 수 있다; gate를 통과한 뒤 코어만이 전이를 수행한다. 이는 "adapter는 스스로 human gate를 빠져나갈 수 없다"(ports-and-adapters §3.4)의 표면 측 재진술이다.

## Consequences
- **쉬움:** governance를 건드리지 않고 표면이나 에이전트를 추가; 하나의 op-manifest가 API/MCP/CLI/UI를 보조를 맞춰 유지; 에이전트, 사람, CI가 증명 가능하게 동등한 호출자; 사람의 publish/file gate가 구조적으로 강제됨.
- **쉬움:** UI는 코어가 이미 소유한 상태(lifecycle 이벤트, 리포트)를 렌더링하고 동일한 검증된 op를 트리거하므로 저렴하다.
- **어려움 / 비용:** op-manifest 규율을 유지해야 함(모든 신규 능력은 표면-로컬 해킹이 아니라 op); MCP 서버는 변경성-종단 op를 proposal-only로 표시하고 "그냥 에이전트가 publish하게 두자"는 압력에 저항해야 함.
- **후속:** ADR-0005는 op가 호출하는 **driven** port를 정의; ADR-0002/0003은 `draft`/`run_gate`가 하는 일을 정의; storage/lifecycle ADR은 UI가 읽는 artifact 상태를 영속화. Runbook: (1) op-manifest + API 코어; (2) manifest 위의 MCP 서버(proposal-only 종단); (3) CLI; (4) 사람의 approve/publish/file 액션을 갖춘 읽기 위주 review/status UI.

## Open questions / revisit triggers
- TODO(open-question: review/status UI가 v1에 출시되는가, 아니면 첫 slice에는 CLI status 명령으로 충분한가? lean: human gate에는 실제 표면이 필요하므로 board를 출시한다.) [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) 참조.
- TODO(open-question: 표면들의 auth/identity 모델 — 공유 substrate가 없는 상황에서 API/MCP/CLI/UI 전반의 lifecycle 이벤트에 `human:jimmy` vs `agent:<id>`를 어떻게 귀속시키는가? storage/lifecycle ADR과 함께 소유.)
- TODO(open-question: 장기 실행 엔진 run(PaperOrchestra는 다단계로 수 분 소요)을 동기 API 호출로 모델링하는가, 아니면 job-handle/poll op로 하는가? ports-and-adapters §Open의 engine-port 비동기 질문을 반영.)
- **Revisit trigger:** 어떤 표면이 op-manifest가 표현하지 못하는 로직을 필요로 하면, 표면이 아니라 manifest를 확장한다 — 표면-로컬 규칙은 contract 누수다.
