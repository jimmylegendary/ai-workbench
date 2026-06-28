# Open Questions — 레이더가 추적하는 미지의 항목들

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./research-plan_ko.md](./research-plan_ko.md) (이 항목들을 해소하는 트랙/단계)
  - [./validation-and-tests_ko.md](./validation-and-tests_ko.md) (해소된 답을 어떻게 증명하는가)
  - [../01-decisions/](../01-decisions/) (이 질문들을 제기한 ADR들)
  - [../02-research/](../02-research/) (이 질문들을 제기한 연구 문서들)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
이 문서는 CAW-05의 연구 문서(`02-research/`)와 의사결정 기록(`01-decisions/`) 전반에서 제기된 모든 open question을
중복 제거하여 추적하는 **단일 통합 레지스터**다. 이는 [research plan](./research-plan_ko.md)이 일정을 잡고
[test plan](./validation-and-tests_ko.md)이 닫는 출처다. 이 문서는 아무것도 **결정하지 않는다** — 추적할 뿐이다.
각 행은 안정적인 `id`, 질문, **소유 ADR/doc**, **resolve-by**(단계 + 연구 트랙), 그리고 **status**로 구성된다.
`resolve-by`의 단계/트랙(T1–T7)은 [research-plan_ko.md](./research-plan_ko.md)에 정의되어 있다. 측정되지 않은
숫자를 주장하는 것으로는 어떤 행도 닫을 수 없다 — 닫기 위해서는 해당 트랙에 명시된 eval/spike 산출물이 필요하다.

## Status legend
`open` = 미해결 · `in-track` = 연구 트랙에 배정되었으나 아직 답하지 못함 · `blocked` = 다른 제품(CAW-02/CAW-03)
대기 중 · `deferred` = 결정에 따라 v1 이후로 연기 · `resolved` = 답변됨 + 테스트 green.

## Register

### Interest model & relevance (ADR-0002 / interest-modeling.md)
| id | question | owning ADR/doc | resolve-by | status |
|---|---|---|---|---|
| OQ-01 | 저자/venue 명확화 — *Minsoo Rhu*에 대해 S2 `authorId` vs ORCID vs 이름 문자열; 동명이인 + 비소속 리포스트 처리 | ADR-0002 / interest-modeling.md | P2 · T3 | in-track |
| OQ-02 | 선택적 lane에 어떤 embedding 모델을 쓸 것인가 — 로컬 vs API — 법적/ToS + own-store 제약을 고려할 때; 추가되는 recall이 불투명성을 감수할 만한가? | ADR-0002 / interest-modeling.md | P5 · T4 | deferred |
| OQ-03 | narrow list에 대한 "high recall"을 정의하는 라벨링된 eval set, 그리고 그것이 산출하는 기본 α/threshold 값 | ADR-0002 + ADR-0004 / interest-modeling.md | P2 · eval-set spike | in-track |
| OQ-04 | feedback-nudge 스텝 크기 + clamp(±0.1? [0.1,2.0]?) — 실제 digest 상호작용에 맞춰 튜닝 | ADR-0002 / interest-modeling.md | P2 | open |
| OQ-05 | `decay` tier별 decay 함수 형태 / half-life(none/slow/fast → 구체적으로 무엇?) | ADR-0002 / interest-modeling.md | P2 | open |
| OQ-06 | recall-first를 고려할 때, 음의 극성 interest가 hard-suppress해도 되는가, 아니면 항상 demote만 해야 하는가? | ADR-0002 / interest-modeling.md | P2 | open |

### Source adapters & ingestion (ADR-0003 / source-ingestion.md / scheduling-and-ports.md)
| id | question | owning ADR/doc | resolve-by | status |
|---|---|---|---|---|
| OQ-07 | 각 watch-list 프로젝트의 canonical GitHub org/repo 확정 — MemOS, Chakra, MC-DLA/DeepStack, SECDA-DSE | ADR-0003 / source-ingestion.md | P1 · T1 | in-track |
| OQ-08 | v1 lab/company 블로그 RSS allow-list 확정; 각각이 feed를 제공하는지 vs 스크래핑이 필요한지 검증 | ADR-0003 / source-ingestion.md | P1 · T1 | in-track |
| OQ-09 | >1 RPS를 위해 Semantic Scholar API 키를 추진할 것인가, 아니면 v1 볼륨은 공유 unauth 풀에 머무를 것인가? | ADR-0003 + ADR-0005 / source-ingestion.md | P1/P3 · T2 | in-track |
| OQ-10 | Reddit watch-list signal이 OAuth 사전 승인을 감수할 만한가, 아니면 v1에서 건너뛸 것인가? (그리고 "legal/ToS-safe only"가 Reddit을 애초에 허용하는가, HN-first?) | ADR-0003 / source-ingestion.md + scheduling-and-ports.md | P1 · T1 | open |
| OQ-11 | "securities reports"의 범위 — SEC EDGAR filings(무료, 범위 내 stub) vs 유료 애널리스트 리포트(범위 외 §11)? brief의 의도 명확화 | ADR-0003 / source-ingestion.md | P1 · T1 | open |
| OQ-12 | requester-pays S3를 통한 arXiv PDF/source 전문 — triage에 필요한가, 아니면 v1에는 abstract+link로 충분한가? | ADR-0003 / source-ingestion.md | P1 · T1 | open |
| OQ-13 | layer-4/3 near-dup을 위한 SimHash Hamming threshold + 본문 정규화 — 허용 가능한 false-merge 비율; v1에서 켜기는 하는가? | ADR-0003 + ADR-0006 / source-ingestion.md + scheduling-and-ports.md | P5 | deferred |

### Classification & triage (ADR-0004 / classification-and-triage.md)
| id | question | owning ADR/doc | resolve-by | status |
|---|---|---|---|---|
| OQ-14 | self-consistency를 위한 초기 `τ_high` / `τ_low`와 `N` — override 로그에서 경험적으로 설정; hard-code 금지 | ADR-0004 / classification-and-triage.md | P2 · T5 | in-track |
| OQ-15 | signal-vs-hype는 단일 score인가, 아니면 리뷰어에게 노출되는 feature별 벡터인가? (방향: score + 상위 feature) | ADR-0004 / classification-and-triage.md | P2 | open |
| OQ-16 | judge 단계에 어떤 LLM/model + prompt를 쓸 것인가, 로컬인가 API인가? 비용/지연 + claude-api 결정과 교차 | ADR-0004 / classification-and-triage.md | P2 · T5 | in-track |
| OQ-17 | `task`/`experiment` route가 v1에서 어디로든 export되는가, 아니면 CAW-01/CAW-06 계약이 굳어질 때까지 digest에만 나타나는가? | ADR-0004 / classification-and-triage.md | P4 | blocked |
| OQ-18 | `discard` tombstone의 retention / TTL — dedup 메모리 + 감사를 위해 얼마나 오래? | ADR-0004 / classification-and-triage.md | P2 | open |
| OQ-19 | 다중 라벨 relevance — 하나의 finding이 `support`이면서 동시에 `novelty-threat`일 수 있는가? (방향: 가능, set으로 저장, union으로 route) | ADR-0004 / classification-and-triage.md | P2 | open |
| OQ-20 | 기밀 리뷰 컨텍스트를 외부 공개 모델로 유출하지 않으면서 calibration 데이터를 수집하기 | ADR-0004 / classification-and-triage.md | P2 · T5 | open |

### Related-work ledger, verification & export (ADR-0005 / ADR-0007 / related-work-ledger.md)
| id | question | owning ADR/doc | resolve-by | status |
|---|---|---|---|---|
| OQ-21 | `related_to`를 CAW-03 claim id에 직접 키로 걸 것인가, 아니면 CAW-03이 re-map하는 CAW-02 concept/claim id에만 걸 것인가? CAW-03과 공동 해결 | ADR-0005 + ADR-0007 / related-work-ledger.md | P4 · T6 | blocked |
| OQ-22 | `WatchedTarget.foreign_ref`는 누가 유지하며, CAW-02/CAW-03 rename/merge 시 stale ref를 어떻게 탐지하는가 — re-validation handshake vs drift 수용? | ADR-0005 / related-work-ledger.md | P4 · T6 | blocked |
| OQ-23 | Levenshtein 0.70 / year ±1 — auto-`verified`를 신뢰하기 전에 narrow corpus에서 측정된 false-negative 비율 | ADR-0005 / related-work-ledger.md | P3 · T2 | in-track |
| OQ-24 | DOI와 arXiv가 불일치할 때 dedup 권한 — S2 `externalIds`를 신뢰할 것인가, 아니면 사람의 판단을 요구할 것인가? | ADR-0005 / related-work-ledger.md | P3 | open |
| OQ-25 | `ambiguous`/`unverified` 링크를 애초에 export하는가, 아니면 verified될 때까지 보류하는가? (방향: curator 검토를 위해 CAW-02에 `unknown`으로 flag, CAW-03의 gate로는 절대 안 보냄) | ADR-0005 + ADR-0007 / related-work-ledger.md | P4 | open |
| OQ-26 | S2 rate/availability — keyed ~1 rps + cache가 늘어나는 watch list에 충분한가, 아니면 Crossref/OpenAlex failover를 추가할 것인가? | ADR-0005 / related-work-ledger.md | P3 · T2 | in-track |
| OQ-27 | export envelope의 서명 방식 — CAW-02의 선택(minisign/cosign/DSSE)에 맞춰 하나의 verifier가 family 전체에서 동작하도록 | ADR-0007 + ADR-0005 / related-work-ledger.md | P4 · T7 | blocked |

### Synthesis & output formats (synthesis-and-formats.md)
| id | question | owning ADR/doc | resolve-by | status |
|---|---|---|---|---|
| OQ-28 | citation 단위 — gate가 강제 가능하면서도 합성된 prose에 과도하게 엄격하지 않으려면 문장 단위 vs 단락 단위 `[S#]`? | synthesis-and-formats.md (ADR: surface/outputs) | P4 | open |
| OQ-29 | paper-card → CAW-02/CAW-03 및 action-brief → CAW-01/CAW-06를 위한 정확한 export-bundle wire schema (ADR-0007 소유; synthesis는 살아남는 manifest 필드만 고정) | ADR-0007 / synthesis-and-formats.md | P4 | open |
| OQ-30 | paper-card의 "novelty implication"에 LLM synthesizer를 허용해야 하는가, 아니면 CAW-03으로 환각된 novelty 주장이 흘러가지 않도록 extractive-only로 할 것인가? | synthesis-and-formats.md / ADR-0004 | P4 | open |
| OQ-31 | 환각 가드 — per-claim citation을 넘어 자동 entailment 검사(NLI/quote-overlap)가 필요한가, 아니면 v1에는 cite-gate + 사람 검토로 충분한가? | synthesis-and-formats.md | P4 | open |
| OQ-32 | digest 주기/크기 상한, template-engine 기본값(Jinja2/Python vs Handlebars/Node), 그리고 v1에서 slide 렌더링(Marp vs Pandoc)을 호출하는지 | synthesis-and-formats.md (ADR-0001) | P4 | open |

### Scheduling, storage & ports (ADR-0006 / scheduling-and-ports.md)
| id | question | owning ADR/doc | resolve-by | status |
|---|---|---|---|---|
| OQ-33 | Heartbeat / dead-man's-switch sink — 로컬 "N일간 receipt 없음" 검사 vs 외부 dead-man 서비스; "shared substrate 없음"을 고려한 알림 채널 | ADR-0006 / scheduling-and-ports.md | P5 | open |
| OQ-34 | 여러 `SourceAdapter`가 같은 항목을 노출할 때, merge 시 어느 provenance가 이기며, 버려진 source도 ledger에 기록되는가? | ADR-0003 + ADR-0006 / scheduling-and-ports.md | P1 | open |
| OQ-35 | "shared runtime substrate 없음"을 고려할 때 adapter별 secret/rate-budget은 어디에 두는가 — adapter별 config + env 참조만? | ADR-0006 / scheduling-and-ports.md | P0 | open |
| OQ-36 | 장시간 실행되는 Run은 하나의 동기 프로세스인가, 아니면 job handle을 가진 resumable stage-job인가? crash-resume + CLI/MCP `status` 계약에 영향 | ADR-0006 / scheduling-and-ports.md | P0 | open |
| OQ-37 | 정확한 entry-point 그룹 이름 + adapter SemVer/호환성 정책 — core가 구버전 port에 대해 빌드된 adapter를 어떻게 거부하는가? | ADR-0006 / scheduling-and-ports.md | P0 | open |
| OQ-38 | Append-only ledger 증가 — JSONL ledger의 compaction/index 전략(ADR-0006 소유) | ADR-0005 + ADR-0006 / related-work-ledger.md | P3 | open |

## Dedup notes (둘 이상의 문서에 나타나 병합된 질문들)
- **S2 key & rate** — ADR-0003, ADR-0005, source-ingestion.md, related-work-ledger.md에서 제기 → **OQ-09**(ingest
  enrichment) + **OQ-26**(verification failover)로 병합; 둘 다 트랙 **T2**로 해소.
- **저자 명확화** — ADR-0002 + interest-modeling.md → **OQ-01**(트랙 T3).
- **Eval set / α / "high recall" 정의** — ADR-0002 + ADR-0004 + interest-modeling.md → **OQ-03**(공유 eval-set
  spike), **OQ-02**(T4)와 **OQ-14**(T5)로 이어짐.
- **SimHash near-dup threshold** — ADR-0003 + ADR-0006 + source-ingestion.md + scheduling-and-ports.md →
  **OQ-13**.
- **Reddit ToS/OAuth** — ADR-0003 + source-ingestion.md + scheduling-and-ports.md → **OQ-10**.
- **`related_to` keying + foreign-ref staleness** — ADR-0005 + ADR-0007 + related-work-ledger.md → **OQ-21** +
  **OQ-22**(트랙 T6, CAW-03에 blocked).
- **Export wire schema / signature** — ADR-0005 + ADR-0007 + synthesis + related-work-ledger.md → **OQ-27**
  (signature, T7) + **OQ-29**(wire schema).

## Resolution discipline
- 질문은 그 research-plan 트랙이 명시된 산출물을 만들어내고 **동시에**
  [validation-and-tests_ko.md](./validation-and-tests_ko.md)의 해당 테스트가 green일 때에만 `resolved`로 이동한다.
- `blocked` 행(OQ-17, OQ-21, OQ-22, OQ-27)은 형제 제품(CAW-02/CAW-03, 별개 제품)에 의존하며, 그들의 store에
  손을 뻗는 것이 아니라 공동 handshake로 해소된다.
- 향후 ADR/연구 편집에서 새로 제기되는 open question은 새로운 `OQ-NN` id로 여기에 추가된다 — 이 레지스터가
  그것들을 추적하는 유일한 장소다.
