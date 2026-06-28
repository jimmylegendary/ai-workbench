# ADR-0005: Ports & adapters —개방형 통합 아키텍처 (load-bearing)

- **Status:** proposed
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF_ko.md) (단일 진실 공급원; §5 개방형 통합 인터페이스 — REQUIRED design property)
  - [../02-research/ports-and-adapters-architecture.md](../02-research/ports-and-adapters-architecture_ko.md) (load-bearing 리서치)
  - [ADR-0001-product-surface.md](ADR-0001-product-surface_ko.md) (driving 측: API/MCP/CLI/UI)
  - [ADR-0002-writing-engine-integration.md](ADR-0002-writing-engine-integration_ko.md) (WritingEngine port)
  - [ADR-0003-evidence-gate-and-claim-ledger.md](ADR-0003-evidence-gate-and-claim-ledger_ko.md) (gate는 SourceAdapter 형태만 읽음)
  - [../02-research/patent-drafting.md](../02-research/patent-drafting_ko.md) (PatentEngine port)
  - [../02-research/novelty-priorart-and-venue.md](../02-research/novelty-priorart-and-venue_ko.md) (Novelty/Radar port)
  - [../02-research/confidentiality-and-artifact-lifecycle.md](../02-research/confidentiality-and-artifact-lifecycle_ko.md) (human gate + confidentiality는 core에 유지)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
이것은 CAW-03의 **load-bearing 결정**이다. harness가 engine/source/sink에 비종속적으로 유지되는 방식을 고정한다: **driven ports** 집합(Source / WritingEngine / PatentEngine / Sink / Novelty), 그들의 타입화된 계약, 실행마다 adapter를 선택하는 **config-driven registry**, 실행 전에 배선을 검증하는 **capability descriptor + preflight**, 그리고 미래의 connector(internal wiki, experiment-server, venue submission, patent filing, live prior-art)를 **core를 편집하는 것이 아니라 adapter 파일 하나만 채워서** 배선할 수 있게 하는 **documented-stub 패턴**이 그것이다. 이 결정은 evidence-gate 규칙(ADR-0003), engine 래핑(ADR-0002), patent-vs-paper 로직, surfaces(ADR-0001, *driving* 측), 또는 storage를 결정하지 않는다 — 그 ADR들은 여기서 정의한 port들을 *소비*한다. v1은 v1 adapters + stubs만 출하하며, 미래 connector는 **전혀** 만들지 않는다(brief §9).

## Context
- brief(§5)는 "open integration interfaces"를 **REQUIRED design property**로 규정한다: port는 지금 정의하고, v1 adapters만 구현하며, 미래는 documented stubs로 출하한다. CAW-03은 PaperOrchestra를 래핑해야 하고 **아직 존재하지 않는** 시스템(internal wiki, experiment-server, venue/filing 시스템)으로부터 입력을 받고 출력을 내보낼 수 있어야 한다.
- 피해야 할 실패 모드: 미래의 통합이 harness core, lifecycle 상태 기계, evidence gate, 또는 다른 adapter들에 변경을 강요하는 것.
- 독립성(§1): **공유 런타임 기반(shared runtime substrate) 없음.** 모든 제품 간 연결(CAW-01/02/05)은 명시적인 import/export boundary 위의 adapter이며, id/URI로 참조한다 — 공유 저장소는 절대 아니다.
- builder가 코드를 작성한다(brief §0): 우리는 타입화된 계약 + registry/config 설계 + stub 템플릿을 전달하며, 구체적 본문은 runbook의 일이다.
- 방향이 중요하다(research §2): **driven ports**(harness가 바깥으로 호출) = Source/WritingEngine/PatentEngine/Sink/Novelty — 이 ADR. harness 자체의 surfaces는 core로 들어가는 **driving** adapter이다 — ADR-0001.

## Options considered

### A. 아키텍처 골격
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Hexagonal (ports & adapters): core는 ports에만 의존; I/O는 adapter에 존재** | engine/source/sink 자유 교체; fakes로 테스트 가능; brief §5가 의무화 | 사전 계약 설계; 간접성 | **Chosen** |
| 직접 통합 (core가 PaperOrchestra/CAW-02를 직접 import) | 지금은 코드가 적음 | 미래 connector마다 core 편집 강요; brief §5/§1 위반 | Rejected |
| 통합별 맞춤 모듈 | 각각 빠르게 출하 | 공유 계약 없음; gate/lifecycle가 통합마다 재구현 | Rejected |

### B. Adapter 선택
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Registry + config 선택** (decorator 내장 등록 **및** entry-point discovery; port당 config 블록 하나) | 서드파티 adapter가 자체 패키지로 출하; 코드 변경 없이 배선 전환 | registry + 메타데이터 + 버전 스큐(version-skew) 처리 | **Chosen** |
| core에 하드코딩된 factory switch | 자명함 | 새 adapter마다 core 편집; seam을 무력화 | Rejected |
| 순수 entry-point discovery만 | 최대 디커플링 | v1 기본값 존재 보장이 어려움 | 내장 경로를 기본값으로 유지; discovery를 그 위에 추가 |

### C. 배선 안전성
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Capability descriptor + preflight** (각 adapter가 provides/accepts/features/requires_config/maturity를 선언; core가 실행 전 검증) | 실행 가능한 메시지로 빠른 실패(fail fast); 자기 기술적; 안전한 배선; stub가 명확히 드러남 | descriptor를 정직하게 유지해야 함 | **Chosen** |
| preflight 없음; 파이프라인 중간 실패 | 절차가 적음 | 잘못 구성/stub/무능한 adapter가 다단계 engine 실행 깊숙이서 실패 | Rejected |

### D. v1에서의 미래 connector
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Documented stub** (실제 interface + not-implemented 마커 + `maturity="stub"` descriptor + config 예시; 등록되었으나 config로 비활성화) | seam이 존재함을 증명; "파일 하나 채우기" 경로; registry/UI에 나타남 | 배선 전까지는 죽은 코드 | **Chosen** (brief §5 요구) |
| 필요할 때까지 아무것도 안 함 | 죽은 코드 없음 | seam이 검증되지 않음; 실제 connector가 나중에 재설계를 강요할 수 있음 | Rejected |
| 지금 connector를 구축 | 더 빨리 완성 | brief §9 비목표; 비용; confidentiality/법무 검토 미완료 | Rejected |

## Decision
**다섯 개의 driven ports를 가진 hexagonal core, capability-descriptor preflight를 갖춘 config-driven registry, 그리고 모든 미래 connector에 대한 documented stubs. harness core는 ports에만 의존하며, adapter는 governance를 약화시킬 수 없다.**

1. **다섯 개의 driven ports**(brief §5와 일치), 각각은 harness 자체의 **provenance를 보유하는(provenance-carrying)** value object를 소비/반환하는 작은 타입화된 interface로, lifecycle(`claim → gate → draft → review → output`)이 adapter에 비종속적으로 유지되게 한다(research §3):
   - **SourceAdapter** — `discover()/fetch()->EvidenceBundle/health()`. CAW-01/02 *및* 미래의 wiki가 `fetch()` 뒤에서 상호 교체 가능하다. **evidence gate(ADR-0003)는 반환된 bundle 위에서 실행되며 source를 절대 알지 못한다**; 참조는 id/URI/path로(상류 중복 없음). v1: `Caw02BundleSourceAdapter`, `Caw01ResultSourceAdapter`. Stubs: `InternalWikiSourceAdapter`, `ExperimentServerSourceAdapter`, `ScatteredLogsSourceAdapter`, `UserBundleSourceAdapter`.
   - **WritingEngineAdapter** — `assemble_inputs()/draft()/score()`(ADR-0002). core는 (이미 gate를 통과한) **GatedClaimSet**을 건네므로, engine 교체가 governance를 약화시킬 수 없다. v1: `PaperOrchestraEngineAdapter`. Stub: `NullWritingEngineAdapter`.
   - **PatentEngineAdapter** — *동일한* `GatedClaimSet` 전면 위에서 `draft_claims()/patentability()`를 수행하되, patent-first 처리(patent doc)를 갖춘 별개의 경로. v1: `BaselinePatentDrafterAdapter`(`needs_human=True` 고정). Stub: `ExternalPatentToolingAdapter`.
   - **Sink/PublishAdapter** — `can_accept()/publish()`. **human gate와 confidentiality filter는 `publish()` *이전*에 core에 존재한다**(brief §9 — 자율 submission/filing 없음). `requires_human_gate=True`를 선언하는 sink는 core가 검증한다; **adapter는 스스로를 gate에서 제외할 수 없다.** v1: `LocalFileSinkAdapter`. Stubs: `InternalWikiSinkAdapter`, `VenueSubmissionSinkAdapter`, `PatentFilingSinkAdapter`.
   - **Novelty/RadarAdapter** — `assess()->NoveltyReport`(novel/threatened/anticipated/superseded/patent-sensitive + patent-first 플래그). v1: `RelatedWorkTrackerAdapter`, `Caw05RadarImportAdapter`, 그리고 engine-pool 재사용 + PatentsView. Stub: `LivePriorArtSearchAdapter`.
2. **Registry + config 선택.** 하나의 `AdapterRegistry`로 향하는 2계층 discovery: (a) decorator를 통한 **built-in registration**(`@register(port="source", id="caw02-bundle")`); (b) 외부 패키지를 위한 **entry-point discovery**(`caw03.source_adapters` 같은 그룹에 대한 `importlib.metadata`)로, 미래 connector가 CAW-03 트리를 건드리지 않고 자체 패키지로 출하될 수 있다. 선택은 **config-driven** — `caw03.config.toml` 안에서 port당 블록 하나로, 배선이 바뀌는 **유일한** 곳이다(예: `[adapters.engine] active = "paper-orchestra"`; 다수의 source가 fan in 될 수 있음). core는 adapter를 절대 하드코딩하지 않는다.
3. **Capability descriptor + preflight.** 각 adapter는 frozen `AdapterCapabilities`(`port, id, version, provides, accepts, features, requires_config, requires_human_gate, maturity`)를 보유한다. **모든 실행 전에** preflight는 각 `active` id를 해석하고, 그 descriptor를 읽으며, 배선을 검증한다(선택된 sink가 실행이 생산하는 artifact 타입을 `accepts`하는지; source가 engine이 필요로 하는 것을 `provides`하는지; 필요한 auth/config가 존재하는지). 누락/비활성화/무능/stub이면서-active인 adapter는 파이프라인 중간이 아니라 **여기서 명확한 메시지로 실패한다**. review/status UI(ADR-0001)는 `registry.list()`에서 adapter들을 나열하므로 배선이 가시화되고 `maturity="stub"`이 명확히 드러난다.
4. **Documented-stub 패턴.** 미래 adapter는 다음으로 출하된다: 실제 interface, 구현할 파일을 가리키는 메시지를 가진 `NotImplementedError` 마커, `maturity="stub"`인 descriptor, 그리고 config 예시. 그것은 **등록되고 발견 가능하지만** 기본적으로 **config로 비활성화**되어 있다; preflight는 강제로 `active`된 stub의 실행을 거부한다. 나중에 실제 connector 배선 = *그 한 파일*의 메서드 본문을 채우는 것 + config 한 줄을 뒤집는 것. 필수 stubs(brief §5): `InternalWikiSourceAdapter`, `ExperimentServerSourceAdapter`, `InternalWikiSinkAdapter`, `VenueSubmissionSinkAdapter`, `PatentFilingSinkAdapter`, `LivePriorArtSearchAdapter`, 그리고 `UserBundleSourceAdapter`/`ScatteredLogsSourceAdapter` 및 `NullWritingEngineAdapter`/`ExternalPatentToolingAdapter`.
5. **seam 테스트(개방형 설계 불변식).** 새 통합은 **adapter 파일 하나 + config 블록 하나만** 건드려야 한다. core 편집을 강요한다면 계약이 새고 있는 것이므로 재검토해야 한다(hard revisit trigger). 작동 예시(research §7): internal wiki source, experiment-server source, venue submission, engine 교체, live prior-art — 어느 것도 core, lifecycle, evidence gate, confidentiality filter, 다른 adapter를 건드리지 않는다.
6. **Governance는 core에 유지되며, adapter에는 절대 없다.** evidence gate, confidentiality egress `decide()` + redaction 재스윕(re-sweep), novelty/patent-first interlock, human publish/file gate는 port들 사이의 core 로직이다. adapter는 데이터를 옮긴다; governance 결정을 절대 하지 않는다. 이것이 "어떤 adapter든 교체"가 결코 "governance 우회"가 될 수 없게 하는 구조적 보장이다.

## Consequences
- **쉬움:** engine 교체, source/sink 추가, 또는 미래 connector 배선을 파일 하나 + config 블록 하나로; fakes로 core 테스트; UI는 descriptor에서 자기 기술적; preflight가 비싼 engine 실행 전에 잘못된 구성을 잡아냄.
- **쉬움:** 독립성이 구조적으로 성립함 — 모든 제품 간 연결은 import/export boundary 위의 SourceAdapter/NoveltyAdapter이며, 공유 저장소가 아님(brief §1).
- **어려움 / 비용:** 사전 계약 + value-object 설계; descriptor를 정직하게 유지해야 함; entry-point discovery는 메타데이터 + 버전 스큐 처리를 추가; documented stub은 배선 전까지 죽은 코드; 다수의 active source는 merge/precedence 규칙이 필요(open question).
- **후속 runbooks**(research §Implications): (1) core/ports — 다섯 개의 `Protocol` interface + value object(`EvidenceBundle`, `GatedClaimSet`, `OutputArtifact`, `AdapterCapabilities`), fakes만으로 green; (2) registry/config — `AdapterRegistry`(decorator + entry-point discovery), `caw03.config.toml` 로더, preflight; (3) v1 adapters; (4) §6 템플릿을 통한 stubs(등록, `maturity="stub"`, config 비활성화; `registry.list()`에 나타나고, 강제로 active되면 preflight가 거부).

## Open questions / revisit triggers
- TODO(open-question: 다수의 SourceAdapter가 active일 때, 겹치는 claim/evidence에 대한 **merge/precedence** 규칙은 무엇이며, merge 시 provenance는 어떻게 보존되는가?) [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) 참조.
- TODO(open-question: 장시간 실행되는 engine 실행이 동기 `draft()`로 모델링되는가, 아니면 job-handle/poll 계약으로? WritingEngine port 시그니처에 영향; ADR-0001/0002 교차 참조.)
- TODO(open-question: 정확한 entry-point 그룹 이름 + adapter SemVer/호환성 정책 — 오래된 port 버전 대상으로 빌드된 adapter를 core가 어떻게 거부하는가?)
- TODO(open-question: confidentiality filter가 SourceAdapter에 capability hook(예: `provides_confidential`)을 필요로 해서 core가 internal-review-required bundle을 라우팅하는가, 아니면 순전히 core의 관심사인가?)
- TODO(open-question: "공유 런타임 기반 없음"을 전제로 adapter secrets/auth는 어디에 존재하는가 — adapter별 config + env 참조만?)
- TODO(open-question: Novelty port는 하나의 port인가, 아니면 related-work vs threat/radar 하위 port로 분리되는가?)
- **Revisit trigger (hard):** core/lifecycle/gate 편집을 강요하는 통합 제안은 곧 계약이 새고 있다는 의미이다 — 계약을 고칠 것이지, 통합을 특수 처리하지 말 것.

Sources (grounding): [Cockburn — Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture), [Wikipedia — Hexagonal architecture](https://en.wikipedia.org/wiki/Hexagonal_architecture_(software)), [PyPA — Entry points](https://packaging.python.org/specifications/entry-points/).
