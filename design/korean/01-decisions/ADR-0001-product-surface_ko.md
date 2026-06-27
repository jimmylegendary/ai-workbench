# ADR-0001: 제품 표면(Product surface) — 하나의 공유 코어, 세 개의 얇은 표면(web + MCP + CLI)

- **Status:** proposed
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [SOURCE-BRIEF](../_meta/SOURCE-BRIEF_ko.md) (§2, §7, §8, §9)
  - [Product Surface & Stack (research)](../02-research/product-surface-and-stack_ko.md)
  - [ADR-0003 Frontend stack](./ADR-0003-frontend-stack_ko.md)
  - [ADR-0006 Design system / open design](./ADR-0006-design-system-open-design_ko.md)
  - [ADR-0002 Data layer](./ADR-0002-data-layer_ko.md)
  - [ADR-0005 Trace pipeline boundaries](./ADR-0005-trace-pipeline_ko.md)
  - [ADR-0007 Work-tree change-management model](./ADR-0007-change-management-worktree_ko.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## 목적(Purpose)

이 ADR은 **CAW-01이 몇 개의 제품 표면을 노출하며 그것들이 서로 어떻게 관계를 맺는지**를 확정한다: 주된 인간용
표면으로서의 Next.js 웹 앱, 그리고 자동화 표면으로서의 MCP 서버와 CLI이며, 이 모두가 **하나의 공유
TypeScript 코어** 위에 얹힌다. 또한 이 제품에서 **"skill(스킬)"**이 무엇인지를 정의한다. 이 ADR은
Next.js 내부 구조(ADR-0003), 디자인 시스템(ADR-0006), 데이터 저장소(ADR-0002), 캔버스 렌더러(ADR-0004),
트레이스 파이프라인 메커니즘(ADR-0005)은 **결정하지 않는다**. SOURCE-BRIEF §2를 구체화하며, 3-canvas /
1:9 / nav-bar / work-tree UI를 재정의하지 않는다.

## 맥락(Context)

우리가 충족해야 하는 힘과 제약:

- **Brief §2는 이미 방향성을 제시한다:** "Next.js 웹 앱 = 주된 인간용 표면; MCP/CLI = 자동화
  표면; 'skill' = 워크플로의 패키징." 여기서의 과제는 **서로 어긋나는 세 개의 백엔드를 만들지 않으면서**
  그것을 실현하는 것이다.
- **Brief §1 컨트롤 플레인 성향:** 표면들은 실행 상태, 증거 완전성, 미해결 질문, 블로커, 산출물 준비 상태,
  그리고 다음의 정직한 행동을 노출해야 한다 — 웹 UI만이 아니라 모든 표면에서 동일한 정직성 계약(honesty
  contract)을 지켜야 한다.
- **Brief §8 현실:** `SimulationRun`은 무겁고 Python 네이티브인 작업이다
  (`input feeder → LLMServingSim → syntorch → ASTRA-sim (+ SST)`). 어떤 표면도 엔진 로직을
  재구현해서는 안 된다; 표면은 오케스트레이션하고 관찰한다.
- **상속된 목표:** 이 워크벤치는 더 넓은 Company AI Workbench 기반(substrate)의 일부이며 다른 에이전트들이
  구동할 수 있어야 한다 — 그것이 MCP 서버가 존재하는 이유다.
- **가드레일(brief §11):** 출처/주장/증거/생성된-결론을 분리해 유지하고, 워크플로 의미론을 입증하는 작은
  수직 슬라이스를 선호하라. 하나의 검증 계약을 가진 단일 코어야말로 그 불변식을 모든 표면에 걸쳐 강제할 수
  있게 한다.

피해야 할 함정: 각 표면이 자체 도메인 로직과 검증을 키워, MCP로 구성한 run이 UI에서 구성한 run과 다르게
동작하는 것.

## 검토한 선택지(Options considered)

| 선택지 | 장점 | 단점 | 적합성 |
|---|---|---|---|
| **A. 하나의 공유 `@caw/core`; web/MCP/CLI는 얇은 어댑터** | 로직 어긋남 없음; 하나의 Zod 계약을 모든 곳에서 재사용; 새 기능을 한 번 추가해 투영; brief §2와 정확히 일치 | 코어는 프레임워크 비종속을 유지해야 함(`next` import 금지); 표면을 얇게 유지하는 규율 필요 | **선택됨** |
| B. 웹 앱 우선; MCP/CLI는 나중에 웹 HTTP API를 호출하는 별도 앱으로 추가 | UI를 빠르게 출시 | 표면들이 서로의 전송 계층에 결합됨; 웹 계층이 사실상 백엔드가 됨; 에이전트가 UI 형태의 API를 상속 | 기각 |
| C. 각자 로직을 가진 세 개의 독립 앱 | 팀이 독립적으로 움직임 | 삼중 검증, 확실한 어긋남, "하나의 제품" 위배; 증거 계약을 일관되게 유지 불가 | 기각 |
| D. MCP 전용(에이전트 네이티브), 웹은 얇은 MCP 클라이언트 | 최대한의 에이전트 우선 | brief는 인간 도메인 전문가를 위해 **웹 앱을 주된 표면**으로 둠; MCP만 얹은 컨트롤 플레인 UI는 빈약한 UX | 기각 |

## 결정(Decision)

**선택지 A 채택: 세 개의 얇은 표면을 가진 하나의 공유 TypeScript 코어(`@caw/core`).**

1. **계층화(화살표는 아래로만 향한다):** `surfaces → core services → engine-adapter ports → data layer`.
   표면은 코어에 의존하고; 코어는 구체적인 엔진이 아니라 어댑터 **포트**(인터페이스)에 의존하며;
   데이터 계층은 리포지토리 인터페이스를 통해 도달한다(ADR-0002).
2. **코어가 모든 도메인 로직과 단 하나의 계약을 소유한다.** `@caw/core`는 애플리케이션 서비스 —
   `ExperimentService`(workload × serving × hardware 구성), `RunService`(start/stop/status 상태
   기계), `RegistryService`(모델, 서빙 프레임워크, HW 카탈로그, strategy-id), `WorkTreeService`(항목별
   / 전체 저장 — 의미론은 ADR-0007), `EvidenceService`(트레이스 산출물, 메트릭, trust-ladder 상태,
   투영) — 와 단일 검증 계약인 **Zod 스키마**를 보유한다.
   `@caw/core`는 **`next` 의존성이 전혀 없다**(패키지 경계 lint 규칙으로 강제).
3. **웹 앱 = 주된 인간용 표면.** 추가적인 *프레젠테이션* 관심사(세 캔버스, 캔버스 간 조정,
   work-tree 검토)는 허용되지만 **추가 도메인 로직은 절대 허용되지 않는다**. UI 변경은 server action →
   코어 서비스를 거친다(ADR-0003).
4. **MCP 서버 = 에이전트를 위한 자동화 표면.** `@caw/core`를 import하여 다음을 매핑하는 TypeScript MCP
   서버:
   - 코어 **동사 → MCP 도구**(`compose_experiment`, `start_run`, `stop_run`, `save_worktree`,
     `ingest_otel_trace`),
   - 코어 **명사 → URI로 주소 지정 가능한 MCP 리소스**(`caw://registry/serving-frameworks`,
     `caw://runs/{id}/status`, `caw://runs/{id}/metrics`, `caw://traces/{id}`, L0/L1/L2를 위한
     `caw://ir/{id}`),
   - 패키징된 **skill → MCP 프롬프트**.
   전송: 로컬 에이전트는 stdio, 원격은 Streamable HTTP. 모든 도구는 **동일한 Zod 스키마**를 사용하는
   코어 서비스의 한 줄짜리 래퍼이므로, 에이전트는 인간이 받는 것과 정확히 동일한 검증을 받는다.
5. **CLI = 인간/CI를 위한 자동화 표면.** `@caw/core`를 import하는 TypeScript 바이너리(웹 HTTP 계층은
   절대 사용하지 않음). 기본은 사람용 텍스트, 파이프라인용 `--json`, 실행 상태 스트리밍용 `--watch`.
   CLI는 코어의 **엄격한 부분집합**이다: UI/MCP에 없는 로직을 절대 키워서는 안 된다.
6. **표면들은 서로를 호출하지 않는다.** MCP와 CLI는 Next.js server action이나 route handler를 **사용하지
   않는다**; 코어를 직접 import한다. 이로써 코어를 도메인 로직의 단일 거처로 유지한다.

### CAW-01에서 "skill"이란 무엇인가

**skill**은 **패키징되고, 이름이 붙고, 선언적인 워크플로** — 코어 서비스를 더 높은 차원의 연산으로 구성하는
재사용 가능한 레시피로서, 선언된 입력/출력과 **증거 계약**(brief §1의 trust-ladder 정직성)을 갖는다.
skill은 새로운 엔진이 **아니며** 새로운 API도 **아니다**; 하나의 코어 위에서의 안무(choreography)다. 동일한
skill이 모든 표면에 투영된다:

- **웹 앱:** 왼쪽 Control Panel의 가이드형 다단계 액션으로, 진행 상황 + 증거 표시 포함.
- **MCP:** 동일한 skill 도구들을 구동하는 `prompt` 템플릿.
- **CLI:** `caw skill run <skill-id> --input ...`.

선언적 형태(코어에 존재하며, 모든 곳에 표면화됨):

```ts
interface Skill {
  id: string;                       // e.g. "project-workload-to-memory-requirement"
  title: string;
  inputs: ZodSchema;                // validated identically on every surface
  steps: SkillStep[];               // calls to core services only (compose → run → read IR → derive metric)
  produces: string[];               // entity/artifact kinds, e.g. ["MemoryAnnotatedIR","MemoryProductRequirement"]
  evidenceContract: {               // brief §1 trust ladder
    requires: ("OTel" | "Chakra" | "syntorch")[];
    validatesAgainst?: "A100/OTel";
  };
}
```

**자동화의 단위는 skill이며**, skill은 하나의 코어를 통과하는 이름 붙은 경로일 뿐이다. 이것이 "MCP/CLI =
자동화 표면"을 구체화하고, 그것들이 별개의 제품으로 갈라지지 않게 막는다.

### 기능 → 표면 비대칭(의도적)

시각적이고 자유로운 저작(캔버스 그래프 편집 + 마이크로 수준 HW 편집)은 **웹 우선**이며; **동사 또는
사실**에 해당하는 모든 것(run, save, 트레이스/메트릭 읽기, OTel 수집, 투영, registry 탐색, trust-ladder
상태 읽기, skill 실행)은 코어 로직이므로 **세 표면 모두에서 동등하다**. MCP/CLI는 HW/workload 저작에 대해
자유로운 캔버스 상호작용 대신 구조화된 패치를 받는다. 전체 매트릭스는
[product-surface-and-stack.md §5](../02-research/product-surface-and-stack_ko.md) 참조.

## 결과(Consequences)

**쉬워지는 것:**
- 코어에 기능을 한 번 추가하면 하나의 검증 규칙으로 세 표면 모두에서 사용 가능해진다.
- 정직성/증거 계약(brief §1)이 균일하다 — `EvidenceService`가 trust-ladder 상태의 유일한 출처이기
  때문이다.
- 에이전트(MCP)와 CI(CLI)가 인간이 UI에서 하는 것을 정확히 재현한다 — 동일한 구성, 동일한 run.
- 무거운 Python 엔진은 어댑터 포트 뒤에 남는다(ADR-0005); 표면은 엔진이 어떻게 호출되는지에 영향받지
  않는다.

**어려워지는 것 / 비용:**
- 코어는 프레임워크 비종속을 유지해야 한다; 이는 강제된 패키지 경계를 필요로 한다(`@caw/core`는 `next`를
  import할 수 없음).
- Server Action(UI)은 MCP/CLI가 재사용할 수 없다 — 의도된 것이다: 그 표면들은 액션을 우회해 코어를
  import한다. 그 비용은 "동사"가 항상 코어에 있어야 하고 액션 본문에는 절대 있어서는 안 된다는 점이다.
- MCP 전송별 어포던스(elicitation, 스트리밍)는 *프레젠테이션*으로 설계되어야 하며, 동사는 코어에 유지한다.
- skill은 하나의 통제된 추상을 추가한다; `Skill`을 선언적으로 유지함으로써 완화된다(steps = 코어 서비스
  호출만).

**후속 작업(runbooks):**
- 모노레포 + `@caw/core` 스캐폴드(`apps/web`, `apps/mcp`, `apps/cli`, `packages/core`, `packages/schemas`).
- MCP 서버 runbook(도구/리소스/프롬프트 매핑; stdio + Streamable HTTP).
- CLI runbook(코어 위의 인자 파서; `--json`, `--watch`).
- skill 패키징 runbook(`Skill` 정의, registry, 표면별 투영).
- engine-adapter 포트 + TS⇆Python 경계는 ADR-0005에서 결정된다(경계 자체는
  [product-surface-and-stack.md §6](../02-research/product-surface-and-stack_ko.md)에 요약).

## 미해결 질문 / 재검토 트리거

- `TODO(open-question: ps-mcp-auth)` MCP 서버는 더 넓은 Company AI Workbench 기반을 위해 인증/멀티테넌트
  스코핑이 필요한가, 아니면 단일 신뢰 로컬인가? (CAW-01이 로컬 호스트 너머로 노출될 때 재검토.)
- `TODO(open-question: ps-skill-versioning)` skill은 데이터 계층에서 (자체 work-tree를 가진) 버전 관리되는
  산출물인가, 아니면 코드로만 정의되는가? ADR-0007과 상호작용.
- `TODO(open-question: ps-cli-distribution)` CLI 배포 — 번들된 Node 바이너리 vs npx vs 컨테이너 —
  재현 가능한 CI를 위해.
- **재검토 트리거:** 어떤 표면이 다른 표면들이 가질 수 없는 동작을 필요로 한다면, 그것은 기능이 잘못
  배치되었다는 신호다 — 코어로 밀어넣고, 표면을 특수 케이스로 처리하지 말라.
