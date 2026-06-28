# ADR-0001: 제품 표면(surface) — ExperimentScout 파이프라인 코어 + CLI + MCP + 스레드 출력물

- **Status:** proposed
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF_ko.md) (source of truth)
  - [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS_ko.md)
  - [ADR-0002-hypothesis-representation_ko.md](ADR-0002-hypothesis-representation_ko.md) (load-bearing)
  - [ADR-0003-experiment-ledger_ko.md](ADR-0003-experiment-ledger_ko.md)
  - [ADR-0004-writeback-traffic-schema_ko.md](ADR-0004-writeback-traffic-schema_ko.md) (load-bearing)
  - [../02-research/source-and-claim-ingestion.md](../02-research/source-and-claim-ingestion_ko.md)
  - [../02-research/implication-mapping-and-export.md](../02-research/implication-mapping-and-export_ko.md)
  - [../02-research/ttt-landscape.md](../02-research/ttt-landscape_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
CAW-06을 구동하고 점검하는 **표면(surface)** 과 그것이 내보내는 **출력물**을 결정한다. 이 ADR은 세 개의 얇은 구동 표면
(**예약/트리거 기반 자동화 파이프라인**, **CLI**, **MCP 서버**) 뒤에 **하나의 파이프라인 코어** — `ExperimentScout` 의
`Run` — 가 존재한다는 것을 확정하며, 그 코어가 다섯 가지 종류의 출력 아티팩트를 생산한다는 것을 확정한다:
**research-thread 레코드, 소규모 실험 ledger, hypothesis 카드, implication map, 그리고 writeback-traffic 스키마
아티팩트** (brief §4). 이 ADR은 hypothesis 표현(ADR-0002), ledger 스키마(ADR-0003), writeback-traffic 스키마/CAW-01
브리지(ADR-0004), source/claim 수집 포트([source-and-claim-ingestion.md](../02-research/source-and-claim-ingestion_ko.md)),
또는 저장/스케줄링 내부 구현은 결정하지 **않는다** — 그것들을 안정적인 코어 경계로서 소비할 뿐이다.

## Context
- brief(§4)는 **주 표면(primary surface)** 을 "ExperimentScout 파이프라인(예약/트리거) + 이를 실행/점검하는 CLI와
  MCP"로 확정하고, **출력물**을 "research-thread 레코드, 소규모 실험 ledger, hypothesis 카드, implication map, 그리고
  writeback-traffic 스키마 아티팩트"로 확정한다. 모든 표면 뒤에 단일 제품 코어; **공유 기반(shared substrate) 없음**
  (§4, §1).
- **가치의 단위**는 추적되는 하나의 research thread다: `source → claim → hypothesis → small experiment → result
  (실패 포함) → implication`, 출처(provenance)와 명시적 불확실성을 동반한다(§2). 영속적인 객체는 Run이 아니라
  thread다; Run은 thread를 전진시킨다.
- brief는 **여섯 개의 파이프라인 단계**를 확정한다(§5): source discovery → claim extraction → hypothesis generation →
  minimal-reproduction planning → result logging → implication mapping. 이들에는 이미 연구 문서가 있다; 이 ADR은
  그것들을 하나의 재개 가능한 Run과 그 위의 표면들로 묶는다.
- **자동 스카우팅은 제안/hypothesis 생성이며, 전략적 결정의 검토자는 Jimmy다** (§12). 어떤 표면도 hypothesis를
  `supported`로 자동 승격하거나, claim을 CAW-02로 자동 export하거나, writeback 스키마를 CAW-01에 자동 커밋할 수
  없다 — 표면은 제안하고, 사람이 확정한다.
- **독립성** (§1, §8): CAW-06은 자신의 코어/데이터/배포를 소유한다. 공개 연구와 CAW-05 신호를 **import**하고,
  명시적인 파일/API 경계를 가로질러 CAW-01/CAW-02로 **export**한다 — 절대 공유 저장소가 아니다.
- 패밀리 패턴: 하나의 코어, 얇은 표면, 검증된 타입드 op(CAW-05 ADR-0001; CAW-03 ADR-0001).

## Options considered

### A. 표면 아키텍처
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **하나의 파이프라인 코어(`ExperimentScout` Run); 파이프라인/CLI/MCP는 하나의 타입드 op-set 위의 얇은 구동 표면** | 단일 지점에서 안티-오버클레임 불변식(status, evidence 분리), provenance, dedup, 검토 게이트를 강제; 표면들이 증명 가능하게 동등 | op-manifest 규율 필요 | **Chosen** |
| 표면별 독립 로직 | 각자 단독 배포 가능 | 불변식 표류(drift); 약한 표면이 맨 hypothesis를 claim으로 export할 수 있음 | Rejected |
| 파이프라인만, CLI/MCP 없음 | 최소 | brief §4가 명시적으로 CLI(Jimmy/CI) + MCP(에이전트 ExperimentScout)를 원함 | Rejected |

### B. Run 단위 / 트리거링
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **`Run` = 여섯 단계에 대한 재개 가능한 한 패스, thread를 전진; `SchedulerAdapter`를 통한 예약 AND 온디맨드(트리거)** | brief §4가 "예약/트리거"라고 명시; 단계별 체크포인트; 크래시 시 마지막 단계에서 재개; `done` 상태 thread-stage의 재실행은 no-op | 래퍼가 lock/cursor/heartbeat 소유 | **Chosen** |
| 순수 cron 주간 전용 | 단순 | "트리거"를 놓침(예: CAW-05 import 또는 새 arXiv 히트가 지금 thread를 열 수 있어야 함) | Rejected |
| 하나의 모놀리식 동기 job | 작성 쉬움 | 재개 없음; 실패한 실험이 전체 패스를 잃음 | Rejected |

### C. 출력 아티팩트
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **하나의 thread 저장소 위의 렌더링으로서 다섯 가지 아티팩트: thread 레코드, ledger 항목, hypothesis 카드, implication map, writeback-traffic 아티팩트** | brief §4와 정확히 일치; 모두 하나의 provenance 스탬프된 thread의 뷰/파생물; 각각 자매 ADR/문서가 소유 | 일관되게 유지할 다섯 스키마 | **Chosen** |
| thread 레코드 + 자유 텍스트 노트만 | 가장 저렴 | ledger(ADR-0003), 스키마 export(ADR-0004), implication 라우팅을 잃음 — 제품의 실제 가치 | Rejected |
| 풍부한 앱/대시보드 출력 | 보기 좋음 | markdown/JSON-first(§7) 위반; 렌더링은 다운스트림/선택사항 | Rejected |

### D. 에이전트/자동화 인터페이스 스타일(MCP + CLI)
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **검증된 타입드 op**을 CLI + MCP가 공유, 변경-종단(mutating-terminal) op은 제안 전용 | 각 op이 하나의 불변식을 운반; 검토 게이트 + 불확실성 스탬핑이 서버 측 | 정의할 op이 더 많음 | **Chosen** |
| 제네릭 CRUD / 자유형 프롬프트 | op이 적음 | 불변식 누출; 에이전트가 hypothesis를 승격하거나 맨 hypothesis를 export할 수 있음 | Rejected |

## Decision
**하나의 파이프라인 코어 — `ExperimentScout` Run; 하나의 검증된 타입드 연산 집합 위의 세 개의 얇은 표면; 하나의
thread 저장소에서 파생된 다섯 가지 출력 아티팩트.**

1. **thread가 영속적 단위이며, Run이 그것을 전진시킨다.** 각 thread는 provenance와 명시적 불확실성을 동반한
   `source → claim → hypothesis → experiment → result → implication` 레코드다(brief §2). `Run`은 여섯 단계
   (`discover → extract → hypothesize → plan-repro → log-result → map-implications`)에 대한 재개 가능한 한 패스이며,
   단계별 체크포인트, 단일-비행 lock, 커서 기반 따라잡기(catch-up), run-receipt heartbeat를 갖는다. 크래시는
   마지막으로 완료된 단계에서 재개되며, 완료된 thread-stage의 재실행은 no-op다.
2. **예약 + 트리거 파이프라인(주 표면).** `SchedulerAdapter`(v1은 cron; 스텁은 brief §9대로 문서화)가 주기적
   Run을 발화한다; 온디맨드 트리거(`caw06 run --thread <id>`, 또는 `CAW05ImportAdapter`로부터의 import 이벤트)는
   단일 thread를 즉시 열거나 전진시킨다. 스케줄러는 **발화만** 한다; 따라잡기/중첩/heartbeat는 Run 래퍼에
   존재하므로 파이프라인은 평범한 cron 위에서도 올바르다.
3. **CLI (Jimmy + CI).** 코어 op-set 위의 얇은 래퍼: `run`, `status`, `list-threads`, `show-thread`,
   `show-hypothesis`, `plan-experiment`, `log-result`, `map-implications`, `render <artifact>`,
   `negative-results`(실패 뷰, ADR-0003), `confirm`(검토 게이트), `export <target>`. 헤드리스 실행의 기본 표면.
4. **MCP 서버 (ExperimentScout 에이전트).** 동일한 op을 MCP 도구로 제공하여 에이전트가 source를 발견하고, claim을
   추출하고, hypothesis를 제안하고, 실험을 초안 작성할 수 있게 한다. **변경-종단 op은 제안 전용이다:** hypothesis를
   `supported`로 승격, CAW-02로 export, writeback 스키마를 CAW-01에 커밋하는 것은 **대기 중인 human-gate 이벤트**를
   생성한다 — 에이전트는 종단 경로를 절대 실행하지 않는다(brief §12). 스카우팅은 hypothesis 생성이지 판결이 아니다.
5. **다섯 출력 아티팩트(markdown/JSON-first).**
   - **Research-thread 레코드** — 척추; 하나의 source/claim/hypothesis/experiment/implication 사슬을 provenance와
     `boundary`와 함께 연결한다.
   - **소규모 실험 ledger 항목** — 하나의 토이 reproduction run; 스키마와 failures-useful 규율은
     [ADR-0003](ADR-0003-experiment-ledger_ko.md)에.
   - **Hypothesis 카드** — `Hypothesis`의 렌더링으로 `status` + `confidence`와 전체 run 이력을 반드시 표시해야 하며;
     hypothesis를 맨 단언으로 절대 출력하지 않는다(스키마는 [ADR-0002](ADR-0002-hypothesis-representation_ko.md)에).
   - **Implication map** — 단계-6에서 도메인별로 타입드, 불확실성 태그된 implication의 팬아웃; export 전 라우팅
     계층([implication-mapping-and-export.md](../02-research/implication-mapping-and-export_ko.md)).
   - **Writeback-traffic 스키마 아티팩트** — `wbtraffic` JSON/카드, CAW-01 L0/L1 브리지
     ([ADR-0004](ADR-0004-writeback-traffic-schema_ko.md)).
6. **포트 & 어댑터 이음새(v1을 빌드, 나머지는 스텁; brief §9).** `SourceAdapter`(arXiv/Semantic Scholar +
   `CAW05ImportAdapter` v1), `ExperimentRunnerAdapter`(최소 로컬 토이 runner v1), `ExportAdapter`(CAW-01 +
   CAW-02 v1). 설정 기반 레지스트리가 패밀리를 바인딩한다; 스텁은 Protocol을 구현하고
   `HealthStatus="deferred"`를 보고한다.

**거버넌스는 코어에 있으며, 표면에는 절대 없다.** 3계층 분리(source claim / hypothesis / evidence),
`status` 기본값-`hypothesis` 바닥, `confidence ≤ evidence_strength` 상한, `generated`-evidence-는-승격-불가 규칙,
provenance 스탬핑, failures-first ledger 규율, 그리고 타깃별 export 게이트 — 이 모두가 코어 로직이다. 표면은 경로를
*요청*할 수 있다; 오직 코어만이, 검토 게이트 이후에, 승격 또는 export를 수행한다.

## Consequences
- **쉬움:** 단계 로직을 건드리지 않고 표면, 아티팩트 렌더러, source/runner/export 어댑터를 추가하거나 새 MCP 도구를
  연결할 수 있다; CLI/MCP/파이프라인은 하나의 op-set 위에서 보조를 맞춘다.
- **쉬움:** 모든 아티팩트가 하나의 thread의 뷰/파생물이므로, 하나의 발견이 하나의 provenance manifest와 하나의
  불확실성 값으로 hypothesis 카드, implication map, export 번들로 나타난다.
- **어려움 / 비용:** Run 래퍼는 cron에 없는 따라잡기/중첩/heartbeat를 재구현해야 한다(CAW-05를 미러); MCP 서버는
  승격/export를 제안 전용으로 유지하고 "에이전트가 라우팅하게 하자"는 압력에 저항해야 한다; 다섯 아티팩트 스키마는
  소유 ADR과 일관되게 유지되어야 한다.
- **후속:** ADR-0002는 모든 카드와 export가 운반하는 hypothesis/status 모델을 공급한다; ADR-0003은 evidence가 되는
  ledger 항목을 공급한다; ADR-0004는 writeback 아티팩트와 CAW-01 브리지를 공급한다; 수집 + implication-mapping 연구
  문서는 첫 단계와 마지막 단계를 공급한다. Runbook: (1) Run 래퍼 + thread 생명주기; (2) op-set 위의 CLI;
  (3) MCP 서버(제안 전용 종단); (4) 다섯 아티팩트 렌더러; (5) 어댑터 레지스트리 + 문서화된 스텁.

## Open questions / revisit triggers
- TODO(open-question: Run은 하나의 동기 프로세스인가, 아니면 핸들을 가진 재개 가능한 stage-job들인가? CLI/MCP
  `status` 계약에 영향.) [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) 참조.
- TODO(open-question: "공유 기반 없음"을 감안한 heartbeat/dead-man's-switch 싱크 — 로컬 "N일 내 receipt 없음"
  체크 vs 외부 서비스? 저장/스케줄링 ADR이 소유.)
- TODO(open-question: CAW-05 import이 즉시 단일-thread Run을 트리거하는가, 아니면 다음 예약 패스를 위해 큐잉만
  하는가? 경향: 큐잉 + 선택적 `--now`.)
- **Revisit trigger:** 어떤 표면이 코어 op-set이 표현하지 못하는 로직을 필요로 하면, 표면이 아니라 op-set을 확장하라
  — 표면-로컬 규칙은 계약 누출이다(특히 안티-오버클레임 불변식을 약화시킬 수 있는 어떤 규칙이든).
