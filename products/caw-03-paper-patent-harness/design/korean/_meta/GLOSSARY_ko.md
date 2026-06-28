# GLOSSARY — CAW-03 보편 언어(Ubiquitous Language)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Source of truth:** ./PRODUCT-BRIEF_ko.md

CAW-03의 표준 어휘. 이 용어들을 정확히 사용하라.

## Harness 와 operations

- **Harness** — writing engine를 둘러싼 거버넌스 계층. 자유 형식 writer가 아니다. gate, provenance(출처), 기밀성, 특허, paper ladder를 강제한다.
- **Harness core** — 모든 거버넌스 로직을 소유하는 단일 컴포넌트. surface는 그 위에 얹힌 얇은 adapter다.
- **op-manifest** — **governed operations(거버넌스 대상 연산)**의 유한한 카탈로그(예: `import_bundle`, `build_ledger`, `gate_claims`, `assemble_inputs`, `draft_paper`, `draft_patent`, `run_novelty`, `review`, `publish`/`export`). 각 op는 해당 동작을 수행하는 유일한 경로이며 core에서 자신의 불변식(invariant)을 강제한다.
- **surface** — core로 들어가는 얇은 진입점: API, MCP, CLI, 또는 최소한의 review/status UI.

## Ports 와 adapters

- **port** — core가 의존하는 타입 지정 인터페이스(driven port). core는 결코 구체적인 adapter에 의존하지 않는다.
- **adapter** — port의 구체적 구현체. config로 선택되며 adapter registry에 **등록(registered)**된다.
- **the five ports** — `SourceAdapter`(입력), `WritingEngineAdapter`(paper 작성), `PatentEngineAdapter`(patent 작성), `Sink`/`PublishAdapter`(출력), `Novelty`/`RadarAdapter`(related-work + threat signal).
- **capability descriptor** — adapter가 광고하는 메타데이터(무엇을 할 수 있는지, 버전, config schema). 사용 전에 **preflight**가 검사한다.
- **preflight** — 선택된 adapter가 호환되는지, 그 config가 유효한지를 registry가 실행 전에 확인하는 점검.
- **documented stub** — 인터페이스 + not-implemented 마커 + config 예시로 출하되는 미래의 adapter. 커넥터를 실제로 만들지 않고도 seam(이음매)을 열어 둔다(예: internal wiki, experiment-server).
- **adapter registry** — adapter를 발견하고, preflight하고, 선택하는 config 주도 카탈로그.

## Engine 와 inputs

- **PaperOrchestra** — 기존 내부 writing engine(5단계: outline → plotting → literature-review(Semantic Scholar) → section-writing → content-refinement; + paper-autoraters + agent-research-aggregator). v1 `WritingEngineAdapter`이며, subprocess 모드로 호출되고, 교체 가능하다.
- **citation_pool** — PaperOrchestra의 Semantic-Scholar 검증을 거친 참고문헌 집합. CAW-03가 paper prior-art(선행기술)로 재사용한다(재조회하지 않는다).
- **engine-neutral input bundle** — CAW-03가 gated claims + CAW-01 result ref로부터 조립하는 정규화된 입력(idea, experimental_log, template, conference_guidelines, figures). 어떤 engine이든 소비할 수 있다.
- **input assembly** — 그 bundle를 만드는 것. gate-before-assemble(조립 전에 gate); 수치는 result-ref로 뒷받침된다.
- **PaperOrchestra workspace** — engine subprocess가 읽고 쓰는, CAW-03가 소유한 작업 디렉터리.

## Claims, evidence, gate

- **claim ledger** — 권위 있는 claim 목록. CAW-02로부터 **참조로 import(imported by reference)**된다(CAW-03가 결코 다시 소유하지 않는다).
- **claim type** — `P1`/`P2`(method/tool) 대 `P3`(future-device). gate 임계값과 ladder 배치를 결정한다.
- **evidence gate** — claim이 draft에 들어가기 전에 통과해야 하는, 타입별이며 profile로 설정 가능한 전제 조건. **불변식(어떤 profile도 완화하지 못함): generated text는 결코 evidence가 아니다.** Fail-closed: engine을 차단한다.
- **GatedClaimSet** — gate를 통과한 claim 집합. paper 경로와 patent 경로 양쪽의 공유 전면(front)이다.
- **blocked-claim backlog** — gate를 통과하지 못한 claim. 가시적인 작업 항목으로 영속화된다.

## Patents, novelty, ladder

- **PatentEngine** — patent 작성용 port/adapter(WritingEngine과 병렬). PaperOrchestra는 결코 patent를 작성하지 않는다.
- **patent-first interlock** — patent gate가 통과될 때까지, patent-sensitive claim을 담은 paper의 publish를 기본 거부(default-deny)한다.
- **novelty / threatened / patent-sensitive** — prior-art + radar signal로부터 harness가 claim에 부여하는 플래그.
- **paper ladder (P1/P2/P3)** — 계획된 프로그램 paper 시퀀스 + paper별 readiness gate.

## Confidentiality 와 lifecycle

- **boundary / visibility** — CAW-02에서 상속됨: boundary {public/internal/confidential} × visibility {team/private}; 더 엄격한 counsel/pre-filing 등급이 있을 수 있다.
- **redaction** — export 전에 boundary를 넘는 콘텐츠를 제거하는 것(CAW-02 시맨틱을 재사용).
- **Artifact** — 거버넌스 하에 있는 하나의 paper 또는 하나의 patent draft. claim set → confidentiality track → engine run → review → terminal output를 묶는다. `drafted`까지는 공유 상태 기계(state machine)를 따르고, 그 뒤 **artifact_type**에 따라 분기한다.
- **review checklist** — "submission-ready(제출 준비 완료)" 이전의 gate.
