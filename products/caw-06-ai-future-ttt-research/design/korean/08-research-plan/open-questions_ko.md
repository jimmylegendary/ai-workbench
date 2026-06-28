# 미해결 질문(Open Questions) — 등록부

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./research-plan_ko.md](./research-plan_ko.md), [./validation-and-tests_ko.md](./validation-and-tests_ko.md)
  - [../_meta/PRODUCT-BRIEF_ko.md](../_meta/PRODUCT-BRIEF_ko.md), [../_meta/DOC-CONVENTIONS_ko.md](../_meta/DOC-CONVENTIONS_ko.md)
  - source docs: [../02-research/](../02-research/) · decisions: [../01-decisions/](../01-decisions/)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적

이 문서는 CAW-06의 연구 문서들([02-research/](../02-research/))과 ADR들([01-decisions/](../01-decisions/)) 전반에서
제기된 모든 미해결 질문을 모아 **중복을 제거한 단일 등록부**다. 각 문서별 `TODO(open-question: …)` 항목과
`wbq-###` writeback 질문들을 하나의 추적 가능한 표로 집약하여, 출처 문서가 닫히더라도 어떤 질문도 유실되지 않도록 한다.
이 문서는 어떤 결정도 다시 내리지 않으며(ADR이 권위를 가진다), 답을 지어내지도 않는다 —
미지의 사항은 연구 트랙([research-plan_ko.md](./research-plan_ko.md))이나 기록된 결과가 그것을 닫기 전까지 `open` 상태로
남는다. DOC-CONVENTIONS §3에 따라, 미지의 사항은 결코 날조된 수치나 날짜로 대체되지 않는다.

**ID 체계:** `wbq-` writeback/CAW-01 브리지 · `hq-` hypothesis 표현 · `lq-` 실험 ledger ·
`iq-` source/claim 인제스트 · `eq-` implication 매핑 및 export · `sq-` 스토리지 및 스케줄링 · `pq-` 제품
표면 및 scout. **resolve-by**는 빌드 단계(P1–P4, research-plan §1 참조)이며, 날짜가 아니다.

## 1. Writeback / CAW-01 브리지 (load-bearing)

| id | question | owning ADR/doc | resolve-by | status |
|---|---|---|---|---|
| wbq-001 | 어떤 TTT 변형이 *실제로* optimizer state를 write back하고 어떤 것은 fast-weight 델타만 하는가? (Titans/LaCT/TTT-E2E가 서로 다름) | ADR-0004 · [ttt-landscape](../02-research/ttt-landscape_ko.md) OQ-4 | P3 | open |
| wbq-002 | CAW-01이 "rough traffic"을 방향성 있는 read/write rollup + endurance rollup으로 분할해야 하는가? (CAW-01에 대한 export 요청 — 그들의 결정) | ADR-0004/0008 · [writeback-traffic-modeling](../02-research/writeback-traffic-modeling_ko.md) | P2 | open (export-ask) |
| wbq-003 | CAW-01의 모델에서 `near_mem`은 residency *tier*인가 아니면 *op 속성*(compute-at-write)인가? | ADR-0004 | P2 | open |
| wbq-004 | 실제 TTT 워크로드가 그럴듯한 어떤 tier에든 write-endurance 압박을 만드는가, 아니면 비휘발성 매체에만 그러한가? | ADR-0004 · [ttt-landscape](../02-research/ttt-landscape_ko.md) OQ-7 | P3 | open |
| wbq-005 | `reuse_distance_tokens`를 CAW-01 텐서 수명처럼 DAG 순회로 유도할 수 있는가, 아니면 update-frequency 메타데이터가 필요한가? | ADR-0004 | P2 | open |
| wbq-006 | 긴 context에서 모델링된 `write_bw`가 read bandwidth를 초과한 적이 있는가 — writeback 축이 병목이 되는 경우가 있는가? (정당화하는 가설) | ADR-0004 | P3 | open |
| wbq-007 | "writes back" 하는 각 변형에 대해, token/segment/task당 *실제* 기록 바이트 양은 얼마인가? (수치 날조 없음) | [ttt-landscape](../02-research/ttt-landscape_ko.md) OQ-1 · ADR-0003 | P3 | open |
| wbq-008 | syntorch/vLLM 통합 이전에 CAW-01의 L0/L1에서 writeback을 모델링할 수 있는가? (ADR-0004에서 **yes/analytic**으로 결정됨; 이 항목은 검증을 추적) | ADR-0004 · [ttt-landscape](../02-research/ttt-landscape_ko.md) OQ-5 | P2 | decided→validate |
| wbq-009 | KV-binding-TTT ⇄ linear-attention 등가성이 충분히 정확하여 그 "write"가 단지 recurrence(optimizer state 없음)에 불과한가? | [ttt-landscape](../02-research/ttt-landscape_ko.md) OQ-2 | P3 | open |
| wbq-010 | inner-loop fast weights(#2/#3)가 긴 context에서 on-chip에서 main memory로 spill되는가, 그리고 어느 길이에서인가? | [ttt-landscape](../02-research/ttt-landscape_ko.md) OQ-3 | P3 | open |
| wbq-011 | 어떤 변형이 write-then-discard churn(#4) 대비 캐싱/residency에 의미 있을 만큼 강한 updated-weight 재사용을 보이는가? | [ttt-landscape](../02-research/ttt-landscape_ko.md) OQ-6 | P3 | open |
| wbq-012 | CAW-01의 L0/L1 IR이 `null`+`basis` 필드(모델링됨, 미측정)를 수용하는가? | ADR-0008 · [implication-mapping-and-export](../02-research/implication-mapping-and-export_ko.md) | P2 | open (export-ask) |

## 2. Hypothesis 표현 및 불확실성

| id | question | owning ADR/doc | resolve-by | status |
|---|---|---|---|---|
| hq-001 | 순위 매기기를 위해 정성적 enum과 함께 0–1 숫자 confidence를 추가할 것인가, 아니면 그것이 거짓 정밀도를 부추기는가? | ADR-0002 | P4 | open (rejected, revisit) |
| hq-002 | "supported by N independent experiments"를 confidence를 게이팅하는 구조화된 카운터로 둘 것인가, 아니면 리뷰어 판단으로 둘 것인가? | ADR-0002 | P3 | open |
| hq-003 | *부분적으로* supported된 hypothesis를 어떻게 표현하는가 — 하위 hypothesis로 분할하는가, 아니면 `scope` 한정자를 추가하는가? | ADR-0002 | P3 | open |
| hq-004 | 빠르게 변하는 TTT 분야가 이동함에 따라 confidence가 시간이 지나며 감쇠하여 재시험을 촉발해야 하는가? | ADR-0002 | P4 | open |
| hq-005 | CAW-01/CAW-02가 공유 status 어휘를 요구하는가, 아니면 export-adapter 경계에서 매핑하는가? (CAW-02 불확실성 인코딩 포함) | ADR-0002 · ADR-0008 | P2 | open |

## 3. 실험 ledger

| id | question | owning ADR/doc | resolve-by | status |
|---|---|---|---|---|
| lq-001 | 최소 seed 수 대 예산 — seed에 민감한 TTT에 3이 충분한가, 아니면 분산 기반의 적응적 개수인가? | ADR-0003 | P3 | open (default 3) |
| lq-002 | 수치 날조가 없는 상황에서, 어떤 run보다 앞서 `prediction.expected_effect`가 가져야 할 effect-size *prior*는 무엇인가? | ADR-0003 | P3 | open |
| lq-003 | toy run이 write-side 동작(기록 바이트, optimizer-state residency, 양)을 의미 있게 측정할 수 있는가, 아니면 v1을 넘어선 실제 runner 통합이 필요한가? | ADR-0003 · [experiment-ledger](../02-research/experiment-ledger_ko.md) | P3 | open |
| lq-004 | 공개된 TTT 비용 주장(latency 배수, memory O(T·d))의 독립적 검증 — 벤더/블로그 대 peer-reviewed? | ADR-0003 | P3 | open |
| lq-005 | 대용량 실패 아티팩트의 보존/GC — 경로로 영구 보관할 것인가, 아니면 N일 후 metric을 유지하며 요약+가지치기할 것인가? | ADR-0003 · ADR-0007 | P4 | open |
| lq-006 | 조용한 누락의 편향을 없애기 위해 `ExperimentRunnerAdapter`가 매 launch마다(대역 외 수동 run 포함) ledger 항목을 생성하도록 강제할 것인가? | ADR-0003 · ADR-0007 | P3 | open (revisit-trigger) |

## 4. Source 및 claim 인제스트

| id | question | owning ADR/doc | resolve-by | status |
|---|---|---|---|---|
| iq-001 | CAW-05의 `action-brief` 와이어 스키마 + 전달(파일 드롭 대 pull 엔드포인트)을 CAW-05 자신의 ADR-0007에 대해 확인하고, 경계에서 조정 | ADR-0005 · [source-and-claim-ingestion](../02-research/source-and-claim-ingestion_ko.md) | P1 | open |
| iq-002 | Claim 추출 방법 — 단일 extract+attribute 패스 대 각 claim을 그 span에 대해 재검사하는 verify 패스; 리뷰 전 허용 가능한 false-claim 비율은? | ADR-0005 | P1 | open |
| iq-003 | `memory-traffic` claim 추출에 abstract+metadata로 충분한가, 아니면 v1에서 arXiv 전문/PDF가 필요한가? | ADR-0005 | P1 | open |
| iq-004 | Semantic Scholar — >1 RPS를 위해 API 키를 추진할 것인가, 아니면 v1 볼륨에 대해 공유 비인증 풀에 머무를 것인가? | ADR-0005 | P1 | open |
| iq-005 | CAW-05의 `canonical_id`가 우리가 직접 발견한 id와 불일치할 때 dedup tie-break — 어느 쪽이 이기는가? | ADR-0005 | P1 | open |

## 5. Implication 매핑 및 export

| id | question | owning ADR/doc | resolve-by | status |
|---|---|---|---|---|
| eq-001 | refuted된 implication을 명시적인 "axis not observed" 신호로 CAW-01에 export할 것인가, 아니면 CAW-02 부정 지식으로만 둘 것인가? | ADR-0006 · ADR-0008 | P3 | open |
| eq-002 | 무엇이 먼저 export되는지 순위를 매기기 위해 implication 수준의 priority/score(예: 미래 워크로드 가정을 차단함)가 필요한가? | ADR-0006 | P4 | open |
| eq-003 | 하나의 implication이 CAW-01과 CAW-02(하드웨어 도메인) 양쪽을 정당하게 대상으로 삼을 수 있는가 — 두 개의 bundle인가 하나인가? | ADR-0006 | P3 | open |
| eq-004 | confidence 조정: 3-값 enum(ADR-0006) 대 ADR-0002의 5-값 척도 — 조정할 것인가 경계에서 매핑할 것인가? | ADR-0006 · ADR-0002 | P2 | open |
| eq-005 | CAW-01/CAW-02가 독립적으로 배포되는 상황에서 v1 전송에 파일 드롭인가 HTTP인가 — 그리고 대상별 합의된 드롭 위치/인증? | ADR-0008 | P2 | open |
| eq-006 | 하류 신뢰를 위해 아웃바운드 bundle에 서명/검증(CAW-05의 서명된 import를 미러링)이 필요한가? | ADR-0008 | P3 | open |

## 6. 스토리지 및 스케줄링

| id | question | owning ADR/doc | resolve-by | status |
|---|---|---|---|---|
| sq-001 | 인덱스 백엔드 — SQLite 대 평면 JSON 인덱스; v1 쿼리 볼륨이 SQLite를 정당화하는가? | ADR-0007 | P4 | open |
| sq-002 | 스케줄러 호스트 — 장기 실행 daemon 대 CLI 엔트리포인트를 호출하는 OS cron; 단일 운영자 제품에 어느 것이 맞는가? | ADR-0007 | P1 | open |
| sq-003 | 동시성 — 두 개의 스케줄된 run이 같은 thread를 건드릴 수 있는가; thread별 파일 락이 필요한가? | ADR-0007 | P3 | open |

## 7. 제품 표면 및 scout

| id | question | owning ADR/doc | resolve-by | status |
|---|---|---|---|---|
| pq-001 | Run은 하나의 동기 프로세스인가, 아니면 핸들을 가진 재개 가능한 stage-job인가? (CLI/MCP 형태에 영향) | ADR-0001 | P1 | open |
| pq-002 | "공유 substrate 없음"을 감안한 Heartbeat / dead-man's-switch 싱크 — 로컬 "N일 내 receipt 없음" 알람? | ADR-0001 | P2 | open |
| pq-003 | CAW-05 import가 즉각적인 단일 thread Run을 촉발하는가, 아니면 다음 스케줄된 Run을 위해 큐에 넣기만 하는가? | ADR-0001 | P1 | open |

## 8. 상호 참조 (중복 제거 노트)

이 질문들은 여러 문서에 걸쳐 반복된다; 위의 canonical id가 중복을 흡수한다:

| Canonical id | Also stated in | As |
|---|---|---|
| wbq-001 | [ttt-landscape](../02-research/ttt-landscape_ko.md) OQ-4; [hypothesis-representation](../02-research/hypothesis-representation_ko.md) | "어떤 변형이 write back하는가" / optimizer-state 우위 |
| wbq-004 | [ttt-landscape](../02-research/ttt-landscape_ko.md) OQ-7 | endurance는 비휘발성 매체에만 |
| wbq-007 | ADR-0003 write-side 측정; [experiment-ledger](../02-research/experiment-ledger_ko.md) | 기록 바이트 양 |
| wbq-008 | [ttt-landscape](../02-research/ttt-landscape_ko.md) OQ-5; PRODUCT-BRIEF §5 | syntorch 이전 L0/L1에서 모델링 |
| wbq-012 | ADR-0008 minimal-field-set; wbq-002와 교차 링크 | null+basis 수용 |
| hq-005 | ADR-0008 CAW-02 불확실성 인코딩 | 공유 status 어휘 대 adapter-boundary 매핑 |
| lq-005 | ADR-0007 retention/GC | 실패 아티팩트 보존 |
| lq-006 | ADR-0007 force-entry-on-launch | 조용한 누락 편향 제거 |
| eq-001 | ADR-0008 refuted→CAW-01 | "axis not observed" export |

## 런북에 대한 함의

- 런북의 모든 `TODO(open-question: …)`는 여기 있는 id를 인용해야 한다; 질문을 닫는 것은 문서화된 이벤트(어떤
  트랙/결과가 그것을 닫았는지)이지, 조용한 편집이 아니다.
- `decided→validate` 항목(wbq-008)은 다시 열리지 *않는다* — 그 런북은 ADR 결정을 구현하며
  [validation-and-tests_ko.md](./validation-and-tests_ko.md)의 대응 테스트가 그것을 보호한다.
- `export-ask` 항목(wbq-002, wbq-012)은 **CAW-01 bundle 내부에 open question으로** 실린다 — CAW-06는 결코
  CAW-01의 IR을 변경하지 않는다; CAW-01은 별개 제품이다(공유 저장소 없음).
