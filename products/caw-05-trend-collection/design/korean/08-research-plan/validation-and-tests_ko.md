# Validation & Tests — 레이더의 불변식을 어떻게 증명하는가

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./research-plan_ko.md](./research-plan_ko.md) (각 테스트가 gate하는 트랙)
  - [./open-questions_ko.md](./open-questions_ko.md)
  - [../01-decisions/ADR-0002-interest-model.md](../01-decisions/ADR-0002-interest-model_ko.md)
  - [../01-decisions/ADR-0003-source-adapters-and-ingestion.md](../01-decisions/ADR-0003-source-adapters-and-ingestion_ko.md)
  - [../01-decisions/ADR-0004-classification-and-triage.md](../01-decisions/ADR-0004-classification-and-triage_ko.md)
  - [../01-decisions/ADR-0005-related-work-ledger.md](../01-decisions/ADR-0005-related-work-ledger_ko.md)
  - [../01-decisions/ADR-0006-storage-and-scheduling.md](../01-decisions/ADR-0006-storage-and-scheduling_ko.md)
  - [../01-decisions/ADR-0007-export-boundaries.md](../01-decisions/ADR-0007-export-boundaries_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
이 문서는 **CAW-05의 load-bearing 불변식을 증명하는 acceptance test**를 정의한다 — 깨지면 레이더를 무력화하는
속성들(놓친 가까운 paper, double-emit, 증거로 등록된 생성 요약). 각 불변식을 구체적이고 객관적으로 검사 가능한
테스트, 그 fixture, 그리고 pass 조건에 매핑한다. 이 문서는 빌드 단계(runbook)를 정의하거나 열린 연구의 일정을
잡지 않는다([research-plan_ko.md](./research-plan_ko.md) 참조). 테스트는 brief의 고정된 조각들로 편향된다:
**high recall**, **legal/ToS-safe 소스**, **생성된 요약 ≠ 증거**, **export 경계(shared store 없음)**,
**ports & adapters**. pass threshold가 측정된 숫자인 경우, 여기에 hard-code하지 않고 eval set이 해소하는
`TODO(open-question)`이다.

## Test taxonomy
| Layer | Scope | Runs against |
|---|---|---|
| **Unit** | 하나의 컴포넌트(scorer, LF, dedup key, verifier gate) | fakes / fixtures |
| **Contract** | 한 port의 의무(SourceAdapter, ExportAdapter) | fake adapter + 녹화된 payload |
| **Pipeline** | fixture 위의 전체 Run(collect→…→export) | 녹화된 source 응답, live I/O 없음 |
| **Eval** | 통계적 속성(recall, calibration) | 라벨링된 eval set(research-plan shared spike) |
| **Negative** | "절대 일어나서는 안 되는" 불변식 | 규칙을 깨도록 설계된 adversarial fixture |

## V1 — watch list에서의 high recall (존재론적 속성)
**Invariant (ADR-0002 §3, ADR-0004 §4):** `recall_priority: high` watch-list interest에 매칭되는 finding은
**항상 노출된다** — score, classify, verify 단계에서 결코 auto-discard되거나 silent-drop되지 않는다.

| Test | Type | Fixture | Pass condition |
|---|---|---|---|
| V1.1 recall on eval set | Eval | 라벨링된 corpus(research-plan shared spike) | watch-list-positive 항목에서 recall ≥ `TODO(open-question: recall target)`; **watch-list positive 0개 drop** |
| V1.2 score-floor surfacing | Unit | 의도적으로 낮은 BM25 score를 가진 watch-list hit | 항목이 triage로 노출됨; score는 생존이 아니라 **순서만** 영향 |
| V1.3 negative-polarity demote-not-delete | Unit | 음의 interest + watch-list term에 매칭되는 항목 | digest에서 demote되나 **여전히 존재** |
| V1.4 LF-miss falls through | Unit | LF가 잡지 못하는 watch-list term | LLM으로 route, **결코 `noise`로 기본 처리되지 않음** |
| V1.5 embedding lane is additive-only | Eval | eval set에서 BM25-only vs BM25+embedding | lane 활성화가 **결코 recall을 낮추지 않음**; T4를 gate |

recall이 대표 지표다; 단 하나의 watch-list positive를 drop하면 aggregate score와 무관하게 **hard fail**이다.
recall 숫자 자체는 여기서 주장하는 것이 아니라 eval set(research-plan)에서 나온다.

## V2 — Dedup 정확성 (cross-source, cross-run)
**Invariant (ADR-0003 §5, ADR-0006 §3.2):** 여러 소스나 weekly 재실행을 통해 도착한 동일한 work는
**여러 provenance 항목을 가진 하나의 finding**이며, dedup은 **recall-safe**다(두 개의 별개 work를 결코
false-merge하지 않음).

| Test | Type | Fixture | Pass condition |
|---|---|---|---|
| V2.1 same paper, four sources | Pipeline | arXiv + S2 + blog + HN에서 녹화된 한 paper | 정확히 **하나의** finding; 네 개의 `provenance` 항목 |
| V2.2 weekly re-run | Pipeline | 같은 window를 두 번 실행 | 두 번째 run: `new=0`, `dup=all`; twin finding/ledger row 없음 |
| V2.3 canonical precedence | Unit | DOI vs arXiv vs title-hash 충돌 | dedup key가 DOI ▸ arXiv ▸ S2 ▸ DBLP ▸ title+author hash 순서를 따름 |
| V2.4 arXiv versions stay distinct | Unit | 한 preprint의 v1과 v2 | 두 개의 연결된 finding, **병합 안 됨**(v2는 새 novelty일 수 있음) |
| V2.5 SimHash false-merge guard | Negative | 별개지만 어휘적으로 유사한 두 paper | layer-3(flagged)는 **병합하면 안 됨**; 기본값은 둘 다 유지 |

## V3 — Classification은 낮은 confidence에서 abstain → 사람
**Invariant (ADR-0004 §5):** cascade는 high-confidence non-threat 라벨만 auto-accept한다; 낮은 confidence나
self-consistency 불일치에서는 **review queue로 abstain**하고, **항상 `novelty-threat`를 queue**한다.

| Test | Type | Fixture | Pass condition |
|---|---|---|---|
| V3.1 low-confidence abstains | Unit | confidence < `τ_low`인 finding | `review.state = queued`, 결코 auto-accept/discard 안 됨 |
| V3.2 self-consistency disagreement | Unit | N개 샘플이 불일치 | 평균 score와 무관하게 queue로 escalate |
| V3.3 novelty-threat always queued | Unit | high-confidence `novelty-threat` | 여전히 사람에게 queue(존재론적 비용) |
| V3.4 watch-list hit never auto-`noise` | Negative | watch-list hit이 **있는** high-confidence `noise` | **queue**, discard 안 함(recall floor) |
| V3.5 calibration sanity | Eval | confirm/override 로그(≈50–100 라벨) | calibrate된 확률이 관측 정확도를 추적; ECE 기록 |
| V3.6 export blocked pre-confirm | Negative | `review.state=queued`로 export 시도 | **거부**(확정/accept 전까지 아무것도 export 안 됨) |

`τ_high`/`τ_low`/`N`은 override 로그에서 튜닝된 config다(research-plan T5); 테스트는 특정 숫자가 아니라
**behavior**를 주장한다.

## V4 — 생성된 rationale은 결코 증거로 export되지 않음
**Invariant (ADR-0004 §6, ADR-0005 §1.2, synthesis research §4):** 모든 생성된 span은 `evidence=false`다;
모든 link/claim의 backing은 verified source + 구체적 locator이며, 결코 요약이 아니다.

| Test | Type | Fixture | Pass condition |
|---|---|---|---|
| V4.1 rationale flag in record | Unit | classify된 finding | `rationale_note.evidence == false` 항상 |
| V4.2 summary offered as backing → refused | Negative | `evidence_locator`가 요약을 가리키는 LedgerLink | **거부**(ADR-0005 N1) |
| V4.3 export envelope tagging | Contract | `caw05-signal` bundle | `raw_summary`가 `kind=generated-summary`를 지님, 모든 evidence 필드에서 제외 |
| V4.4 synthesis cite-gate | Pipeline | 인용되지 않은 사실 문장을 가진 artifact | step-6 gate가 artifact를 **거부**(synthesis research §3) |
| V4.5 boundary never laundered | Negative | (가상의) 비공개 finding에 대한 synthesis | stamper가 **요란하게 실패**; "요약으로 세탁" 경로 없음 |

## V5 — Export bundle이 CAW-02 / CAW-03 intake에 매칭
**Invariant (ADR-0007, ADR-0005 §4):** `ExportAdapter`가 유일한 seam이다; bundle은 self-contained, signed,
versioned된 **확정된** link의 projection으로, consumer가 **shared store 없이** validate한다.

| Test | Type | Fixture | Pass condition |
|---|---|---|---|
| V5.1 schema conformance | Contract | 생성된 bundle | `caw05-signal` envelope + per-signal payload schema에 대해 validate |
| V5.2 CAW-02 intake round-trip | Contract | bundle → CAW-02의 문서화된 import validator | Source/Claim/RelatedWork로 accept; `evidence:false`를 재강제 |
| V5.3 CAW-03 intake round-trip | Contract | bundle → CAW-03의 `import_radar` shape | RadarSignal로 accept; `novelty-threat → threat` 매핑 유지 |
| V5.4 relation → classification map | Unit | relation당 하나의 link | `novelty-threat→threat`, `support→support`, `adjacent→neutral`, `noise→절대 export 안 됨` |
| V5.5 confirmed-only gate | Negative | CAW-03의 gate로 가는 `proposed` link | **거부**(확정된 것만 novelty gate로 export) |
| V5.6 foreign-ref projection | Unit | `WatchedTarget.foreign_ref`를 가진 link | `related_to`가 consumer-namespace id를 지님; 우리 내부 id는 결코 유출 안 됨 |
| V5.7 signature + version | Contract | signed bundle(research-plan T7) | consumer가 서명을 verify; 알 수 없는 `contract_version` major 거부 |
| V5.8 empty / non-public bundle | Negative | 빈 export, 그리고 비공개 항목 | 빈 것 → 에러(결코 silent empty file 아님); 비공개 → bundle abort |
| V5.9 no shared store | Contract | export 경로 | file/bundle만 write; consumer의 DB를 **결코** 열지 않음 |

## V6 — Incremental cursor가 재발행을 회피
**Invariant (ADR-0003 §4, ADR-0006 §2–3):** cursor는 **완전히 성공한 source 패스에서만** 전진한다; 놓친 주는
self-heal한다; retry는 결코 double-fetch, double-classify, double-route하지 않는다.

| Test | Type | Fixture | Pass condition |
|---|---|---|---|
| V6.1 advance-on-success only | Unit | 도중에 실패하는 source 패스 | cursor 전진 **안 함**; 다음 run이 overlap을 re-fetch, dedup이 흡수 |
| V6.2 missed-week catch-up | Pipeline | 한 번 건너뛰고 실행 | 다음 run의 window가 gap에 걸침; 항목 손실 없음 |
| V6.3 export idempotency | Negative | 같은 `(finding, target, classification_version)`를 재export | 두 번째 emit은 **no-op**; CAW-03으로 double-route 없음 |
| V6.4 resumable stages | Pipeline | Run을 stage 도중에 kill, 재트리거 | 마지막 checkpoint에서 재개; `done` Run의 재실행은 no-op |
| V6.5 heartbeat / dead-man | Pipeline | run-receipt를 cadence+grace를 넘겨 억제 | silent skip이 아니라 **alert** 발화("레이더가 어두워졌다") |

## V7 — Ports, registry, preflight (독립성 & ToS)
**Invariant (scheduling research §5–8):** adapter는 config로 선택된다; preflight는 `active` stub,
ToS-unsafe 소스, 또는 route된 signal kind를 받을 수 없는 export를 거부한다.

| Test | Type | Pass condition |
|---|---|---|
| V7.1 active-stub refused | Negative | preflight가 stub 파일을 가리키는 실행 가능한 메시지와 함께 실패 |
| V7.2 ToS-unsafe refused | Negative | active로 설정된 `tos-restricted` 소스가 preflight에서 거부됨 |
| V7.3 seam test | Contract | source/export 추가가 **adapter 파일 하나 + config 블록 하나**만 건드림; pipeline/classification은 손대지 않음 |
| V7.4 legal_mode honored | Negative | 재현된 전문을 저장하는 `metadata_only_link` adapter → fail |

## Negative-test catalogue (절대 일어나서는 안 됨, cross-referenced)
| ID | 보호하는 규칙 | Origin |
|---|---|---|
| N1 | backing으로 제공된 생성 요약 → 거부 | ADR-0005 N1 / V4.2 |
| N2 | 0.55 미만 title 매칭의 auto-`verified` → 절대 안 됨 | ADR-0005 N2 |
| N3 | public bundle 속 비공개 link → bundle abort | ADR-0005 N3 / V5.8 |
| N4 | 같은 paper의 weekly 재실행 → 하나의 VerifiedSource, twin 없음 | ADR-0005 N4 / V2.2 |
| N5 | `noise`로 분류된 finding이 bundle에 나타남 → 절대 안 됨 | ADR-0005 N5 / V5.4 |
| N6 | watch-list hit이 있는 high-conf `noise`의 auto-discard → 절대 안 됨 | ADR-0004 / V3.4 |
| N7 | review-confirm 전 export → 거부 | ADR-0004 / V3.6 |

## Verification pipeline tests (ADR-0005 §3)
| Test | Case | Pass condition |
|---|---|---|
| VV.1 exact id | DOI/arXiv가 S2에서 resolve | `verified`; id로 dedup |
| VV.2 strong title | Levenshtein ≥ 0.70 **이면서** year ±1 | `verified`; paperId로 dedup |
| VV.3 weak/near | 0.55 ≤ ratio < 0.70 또는 year off | `ambiguous` → **사람에게 route**, 결코 drop 안 됨 |
| VV.4 no match | ratio < 0.55 / empty | `unverified`; raw metadata와 함께 유지 |
| VV.5 API down | S2 429 / 도달 불가 | retry+backoff, cache, **결코 run을 막지 않음** |
| VV.6 preprint↔published | 두 버전 모두 | **하나의** VerifiedSource로 collapse; 두 locator 모두 유지 |

0.70 / ±1 threshold는 auto-`verified`가 완전히 신뢰되기 전에 narrow corpus에서 튜닝된다(research-plan T2);
VV 테스트는 threshold 값이 아니라 **decision-table behavior**를 주장한다.

## Test data & fixtures
- **녹화된 source payload**(arXiv Atom/OAI, S2 JSON, GitHub Atom, blog RSS, HN Algolia)로 pipeline/contract
  테스트가 **live I/O 없이** ToS 노출 없이 실행됨.
- **라벨링된 eval set**(research-plan shared spike) — V1.1/V1.5/V3.5의 유일한 ground truth; CAW-05 자체 store에
  버전 관리됨.
- negative catalogue를 위해 목적 제작된 **adversarial fixture**(summary-as-evidence link, 0.55 미만 매칭,
  비공개 항목, twin paper).

## Implications for runbooks
- 모든 runbook의 **Acceptance criteria**는 충족하는 V-ID를 인용해야 한다; tree는 각 checkpoint에서 green을 유지.
- Negative test N1–N7은 **release-blocking**이다 — brief의 협상 불가능한 불변식을 인코딩한다.
- Eval 의존 테스트(V1.1, V1.5, V3.5, VV threshold)는 eval-set spike가 먼저 안착하는 것에 gate된다(P2).
