# ADR-0001: 제품 표면(Product surface) — 스케줄 파이프라인 코어 + CLI + MCP + 다중 포맷 출력

- **Status:** proposed
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF_ko.md) (단일 진실 공급원)
  - [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS_ko.md)
  - [ADR-0002-interest-model_ko.md](ADR-0002-interest-model_ko.md) (load-bearing)
  - [ADR-0003-source-adapters-and-ingestion_ko.md](ADR-0003-source-adapters-and-ingestion_ko.md)
  - [ADR-0004-classification-and-triage_ko.md](ADR-0004-classification-and-triage_ko.md)
  - [../02-research/scheduling-and-ports_ko.md](../02-research/scheduling-and-ports_ko.md) (Run wrapper, 포트)
  - [../02-research/synthesis-and-formats_ko.md](../02-research/synthesis-and-formats_ko.md) (다섯 가지 포맷, provenance 표기)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적(Purpose)
주간 레이더(radar)를 구동하고 점검하는 **표면(surface)**, 그리고 그것이 내보내는 **출력 포맷**을 결정한다.
이 문서는 세 개의 얇은 구동 표면 — **cron으로 스케줄되는 자동화 파이프라인**, **CLI**, **MCP 서버** — 뒤에
**하나의 파이프라인 코어**(the `Run`)가 존재하며, synthesis가 `FormatRenderer` 포트를 통해 **markdown 우선의
다섯 가지 포맷**(memo, digest, slide outline, paper-card, action brief)을 내보낸다는 점을 확정한다.
이 문서는 interest model(ADR-0002), ingestion/adapters(ADR-0003), classification/triage 기준(ADR-0004),
related-work ledger 스키마, 저장소 내부, export-bundle 와이어 스키마를 결정하지 **않는다** — 그것들은 안정적인
코어 경계로서 소비한다.

## 맥락(Context)
- 브리프(§4)는 **주 표면(primary surface)**을 "스케줄된 자동화 파이프라인(cron 구동) + 그것을 실행/점검하는
  CLI와 MCP"로, **출력**을 "memo, digest, slide outline, paper-card, action brief(markdown 우선)"로 확정하며,
  추가로 ledger/digest에 대한 선택적 읽기 뷰(§4 부차적)를 둔다.
- 미션은 **좁은 주간 watch list에서의 높은 recall**이다(§1, §3): 파이프라인은 무인으로 실행되어야 하고
  **결코 조용히 한 주를 건너뛰어서는 안 된다**(가까운 논문을 놓치는 것은 존재론적 novelty 위험이다). 스케줄링
  연구([scheduling-and-ports_ko.md](../02-research/scheduling-and-ports_ko.md) §2)는 cron이 catch-up/중복방지/
  heartbeat를 갖추지 못함을 보여주므로, 그 속성들은 스케줄러가 아니라 **Run wrapper**에 둔다.
- 발견(Findings)은 **제안이며; Jimmy가 검토하고 라우팅한다**(§11). 어떤 표면도 전략적 결정을 자동 발행할 수
  없다; 표면은 제안하고, 사람이 확정한다(ADR-0004 §5 review gate와 일관됨).
- **독립성(Independence)**(§1): CAW-05는 자체 코어, 데이터, 배포를 가진다; **공유 런타임 기반이 없다**. 출력은
  명시적 경계를 넘는 export bundle로서만 CAW-01/02/03/06로 건너가며, 결코 공유 저장소가 아니다.
- 모든 표면 뒤에 하나의 제품 코어 — 패밀리 패턴(CAW-03 ADR-0001 "하나의 코어; 얇은 표면")을 반영한다.

## 고려된 옵션(Options considered)

### A. 표면 아키텍처
| 옵션 | 장점 | 단점 | 적합도 |
|---|---|---|---|
| **하나의 파이프라인 코어(`Run`); cron/CLI/MCP은 하나의 연산 집합 위에 놓인 얇은 구동 표면** | dedup, recall floor, review gate, provenance를 한 곳에서 강제; 표면들이 증명 가능하게 동등 | op-manifest 규율 필요 | **선택됨** |
| 표면별 독립 로직 | 각자 단독 출시 가능 | 거버넌스/dedup 표류; 가장 약한 표면이 재수집 또는 이중 export | 거부됨 |
| 파이프라인만, CLI/MCP 없음 | 최소 | 브리프 §4가 실행/점검용 CLI(사람) + MCP(에이전트)를 명시적으로 원함 | 거부됨 |

### B. 스케줄러 바인딩
| 옵션 | 장점 | 단점 | 적합도 |
|---|---|---|---|
| **`SchedulerAdapter`를 통한 cron v1; Run wrapper가 lock/catch-up/heartbeat 소유** | 브리프 의무사항; 약한 cron에서도 정확; 추후 systemd/cloud로 교체 가능 | wrapper가 cron이 결여한 것을 재구현 | **선택됨** |
| 파이프라인을 직접 호출하는 원시 crontab | 코드 제로 | 중복 가드 없음, catch-up 없음, 조용한 skip → recall 미션 위반 | 거부됨 |
| v1에서 systemd/Airflow 요구 | 네이티브 catch-up | 브리프 §9 위배(cron이 v1; 나머지는 스텁) | 거부됨 |

### C. 출력 포맷
| 옵션 | 장점 | 단점 | 적합도 |
|---|---|---|---|
| **하나의 `Finding` 집합 위에 `FormatRenderer` 어댑터로 구현된 markdown 우선 다섯 포맷** | 브리프 §4 그대로; 하나의 데이터셋에 대한 뷰; 새 포맷 = 어댑터 하나 | 유지할 템플릿 다섯 개 | **선택됨** |
| digest 하나만 | 가장 저렴 | paper-card→CAW-02/03 및 action-brief→CAW-01/06 export 표면을 놓침(§8) | 거부됨 |
| 풍부한 HTML/앱 출력 | 예쁨 | markdown 우선 위배(§4); 무거움; 렌더링은 하류/선택사항 | 거부됨 |

### D. 에이전트/자동화 인터페이스 스타일 (MCP + CLI)
| 옵션 | 장점 | 단점 | 적합도 |
|---|---|---|---|
| **검증된 타입드 연산**(`run`, `status`, `list-findings`, `show-finding`, `render <format>`, `mark-feedback`, `confirm`, `export`)을 CLI + MCP가 공유 | 각 연산이 하나의 불변식을 담음; review gate + 리댁션이 서버측 | 정의할 연산이 더 많음 | **선택됨** |
| 일반 CRUD / 자유 형식 프롬프트 | 연산 적음 | 불변식 유출; 에이전트가 미확정 novelty-threat를 export할 수 있음 | 거부됨 |

## 결정(Decision)
**하나의 파이프라인 코어(the `Run`); 검증된 타입드 연산 하나의 집합 위에 놓인 세 개의 얇은 표면; `FormatRenderer`
포트 뒤의 markdown 우선 다섯 출력 포맷.**

1. **Run은 작업 단위다.** `caw05 run --window weekly`은 `collect → dedup → classify → synthesize → export`
   단계들의 멱등적이고 재개 가능한 파이프라인이며, 단계별 checkpoint, single-flight lock, cursor 기반 catch-up,
   `run-receipt` heartbeat를 가진다([scheduling-and-ports_ko.md](../02-research/scheduling-and-ports_ko.md)
   §2.2 참조). 크래시는 마지막으로 완료된 단계에서 재개된다; `done` 상태인 Run을 다시 실행하는 것은 no-op이다.
2. **스케줄 파이프라인(주 표면).** `CronSchedulerAdapter`는 `caw05 run --window weekly`를 호출하는 crontab
   라인을 설치한다. 스케줄러는 Run을 **발화(fire)**만 한다; 모든 catch-up/중복/heartbeat 보장은 Run wrapper에
   있으므로 평범한 cron에서도 레이더가 정확하다. `cadence + grace`를 지난 receipt 누락은 no-op이 아니라
   **alert**이다(브리프 "조용히 건너뛰어서는 안 됨").
3. **CLI(사람 + CI).** 코어 op-set 위의 얇은 wrapper: `run`, `status`, `list-findings`, `show-finding`,
   `render <format>`, `mark-feedback`(ADR-0002 §3), `confirm`(review gate, ADR-0004 §5), `export`,
   `backfill --since <date>`. headless 실행의 기본 표면.
4. **MCP 서버(에이전트).** MCP 도구로서 동일한 연산을 제공하여 AI 에이전트 독자가 신호를 소비하고 점검을
   구동한다. **변형-종단(mutating-terminal) 연산은 제안 전용이다:** `novelty-threat`의 `confirm`과 `export`는
   대기 중인 human-gate 이벤트를 생성한다; 에이전트는 결코 종단 경로를 실행하지 않는다(브리프 §11;
   ADR-0004 §1/§5).
5. **다섯 출력 포맷(markdown 우선).** `memo`(finding 1개), `digest`(주간, N개 finding), `slide-outline`
   (Marp 호환), `paper-card`(논문 1개 → CAW-02/CAW-03), `action-brief`(→ CAW-01/CAW-06). 각각은 공유된
   triage된 `Finding` 위의 `FormatRenderer` 어댑터다; 모두 provenance manifest와 *"generated summary — not
   evidence"* 배너를 담는 하나의 기반 템플릿을 상속한다(synthesis 연구 §4, §6). `noise`는 결코 synthesize되지
   않는다.
6. **부차적 읽기 뷰(선택).** ledger + digest 아카이브에 대한 읽기 위주 뷰(브리프 §4 부차적); load-bearing이
   아니며, 첫 슬라이스 이후에 출시된다.

**거버넌스는 코어에 있고, 결코 표면에 있지 않다.** dedup, recall 우선 floor(watch-list 적중은 결코 조용히
버려지지 않음), review gate, provenance 스탬핑, 생성된 산문에 대한 `evidence:false` 표기는 코어 로직이다.
표면은 경로를 *요청*할 수 있다; export를 수행하는 것은 (review gate 이후) 코어뿐이다.

## 결과(Consequences)
- **쉬움:** 수집/triage를 건드리지 않고 표면, 포맷, 에이전트 추가; cron/CLI/MCP가 하나의 op-set 위에서
  보조를 맞춤; 주간 실행이 cursor를 통해 놓친 주를 자가 치유(ADR-0003 / 스케줄링 연구 §3).
- **쉬움:** 출력은 하나의 `Finding` 집합 위의 뷰이므로, 하나의 finding이 단일 진실 공급원과 단일 provenance
  manifest로 여러 포맷에 등장할 수 있다.
- **어려움 / 비용:** Run wrapper는 cron에 없는 catch-up/중복/heartbeat를 재구현해야 한다; MCP 서버는
  `confirm`/`export`을 제안 전용으로 유지하고 "에이전트가 라우팅하게 하자"는 압력에 저항해야 한다.
- **후속:** ADR-0002는 digest가 렌더링하는 relevance score를 공급한다; ADR-0003은 `RawFinding`들과
  `SchedulerAdapter`를 공급한다; ADR-0004는 synthesis가 소비하는 라우팅된, review-gate된 findings를 공급한다.
  Runbooks: (1) Run wrapper + 라이프사이클; (2) op-set 위의 CLI; (3) MCP 서버(제안 전용 종단); (4) 기반
  템플릿 + 다섯 `FormatRenderer` 어댑터; (5) 선택적 읽기 뷰.

## 미해결 질문 / 재검토 트리거(Open questions / revisit triggers)
- TODO(open-question: heartbeat/dead-man's-switch 싱크 — "공유 기반 없음"을 고려할 때 로컬 "N일간 receipt 없음"
  점검 vs 외부 서비스? storage/scheduling ADR에서 소유.) [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md) 참조.
- TODO(open-question: Run은 하나의 동기 프로세스인가, 아니면 핸들을 가진 재개 가능한 stage-job인가? CLI/MCP
  `status` 계약에 영향 — 스케줄링 연구 §Open을 반영.)
- TODO(open-question: 선택적 읽기 뷰가 v1에 출시되는가, 아니면 `caw05 status` + digest 아카이브가 첫 슬라이스에
  충분한가? 경향: CLI/digest 먼저, 뷰는 나중.)
- **재검토 트리거:** 어떤 표면이 코어 op-set이 표현하지 못하는 로직을 필요로 하면, (표면이 아니라) op-set을
  확장하라 — 표면 로컬 규칙은 계약 유출이다.
