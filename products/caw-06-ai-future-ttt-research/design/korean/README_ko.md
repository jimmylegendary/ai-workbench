# CAW-06 디자인 세트 — 색인

**CAW-06, AI Future / TTT Research Automation**(독립 제품)을 위한 완전한 디자인 + 빌드 명세서입니다.
디자인 문서는 *무엇을/왜*를 설명하고, 런북은 *어떻게 빌드하는지*를 설명합니다. **디자인 작성자는 제품
코드를 작성하지 않습니다.**

> 먼저 읽기: [`_meta/PRODUCT-BRIEF.md`](./_meta/PRODUCT-BRIEF_ko.md) 와 [`_meta/DOC-CONVENTIONS.md`](./_meta/DOC-CONVENTIONS_ko.md).

## 둘러보기

| # | 폴더 | 담고 있는 내용 |
| --- | --- | --- |
| `_meta` | 브리프, 컨벤션, [용어집](./_meta/GLOSSARY_ko.md) | 진실 + 규칙 |
| `00` | [overview](./00-overview/) | 비전, 범위 및 비목표, 페르소나 및 사용 사례 |
| `01` | [decisions](./01-decisions/) | 8개의 ADR (surface+scout, hypothesis 표현, experiment ledger, writeback-traffic 스키마, 인제스천, implication mapping, 스토리지+스케줄링, export 경계) |
| `02` | [research](./02-research/) | 기반 연구 (TTT 지형, writeback 모델링, …) |
| `03` | [architecture](./03-architecture/) | 시스템 아키텍처, 컴포넌트 경계, 데이터 흐름, 기술 스택, 리포 구조 |
| `04` | [data-layer](./04-data-layer/) | 데이터 모델, 스토리지 및 스케줄링, 출처(provenance) 및 불확실성 |
| `05` | [ttt-research-core](./05-ttt-research-core/) | 핵심: ExperimentScout 파이프라인, hypothesis 및 불확실성, experiment ledger, writeback-traffic 스키마, implication mapping, export 경계, 포트 및 어댑터 |
| `06` | [interfaces](./06-interfaces/) | CLI 및 MCP, scout 파이프라인, 출력물 |
| `07` | [backend-api](./07-backend-api/) | 코어 API, scout 서비스, experiment-runner 서비스, 영속성 |
| `08` | [research-plan](./08-research-plan/) | 연구 계획, 검증/테스트, [open questions](./08-research-plan/open-questions_ko.md) |
| `09` | [roadmap](./09-roadmap/) | 마일스톤/페이즈, 의존성 그래프, 리스크 |
| `10` | [runbooks](./10-runbooks/) | 실행 가능한 빌드 계획 (페이즈 0–4) — [runbooks/README.md](./10-runbooks/README_ko.md) 에서 시작 |

## 한 문단으로 보는 제품

불확실한 TTT/미래 AI 주장(claim)을 검증 가능한 실험과 메모리 트래픽 스키마로 전환하는 **ExperimentScout**
파이프라인입니다. 하나의 코어가 **Run**(discover → import → dedup → extract → hypothesize → experiment →
log → implication → writeback → export)을 실행합니다. Hypothesis는 **4-state reversible status**(4상태 가역
상태) + 보정된(calibrated) 불확실성을 가지며, **hard evidence cap**(강한 증거 상한)이 적용됩니다(생성된
evidence는 절대 승격되지 않으며, hypothesis는 결코 확정된 claim이 아닙니다). 소규모 실험은 사전 등록된
의사결정 규칙, reproducibility gate, 그리고 **유지되는 부정 결과(retained negative results)**를 갖춘
**append-only ledger**(추가 전용 원장)에 담긴 최소 재현(minimal reproductions)입니다. **`wbtraffic.v0`**
스키마는 TTT 쓰기 트래픽을 분석적 L0 추정치로 모델링하며, **CAW-01의 L0 IR 위로 내려져(lowered)
export**됩니다(공유 저장소가 아닌 경계). 외부의 모든 것은 세 개의 포트 뒤에 있는 **adapter**이며 문서화된
스텁을 갖습니다. 스토리지는 CAW-06 자체의 파일 기반 ledger입니다. 생성된 요약은 결코 evidence가 아닙니다.

## 빌드 경로

[`10-runbooks/`](./10-runbooks/) 페이즈 0→4를 따르세요. **Milestone 1** = 하나의 검증 가능한 TTT claim →
토이 실험(실패 가능성 포함하여 로깅됨) → implication map → CAW-01로 export된 `wbtraffic.v0` 분석적 추정치.

## 상태

모든 문서는 **draft**(초안) 상태입니다. 추적되는 [open-questions](./08-research-plan/open-questions_ko.md)
(CAW-01용 `wbq-###` writeback 모델링 질문 포함)가 있습니다.
