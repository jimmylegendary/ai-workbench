# ADR-0005: Related-work ledger, 논문 검증, 그리고 provenance(출처 이력)

- Status: proposed
- Owner: Jimmy
- Last-reviewed: TODO(open-question: set on review)
- Related:
  - Source of truth: [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF_ko.md) (§5, §7, §8, §12)
  - Conventions: [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS_ko.md) (§5 ADR format)
  - Research: [../02-research/related-work-ledger.md](../02-research/related-work-ledger_ko.md)
  - ADR-0002 interest model — [./ADR-0002-interest-model.md](./ADR-0002-interest-model_ko.md) (watch list → WatchedTarget 앵커)
  - ADR-0003 source adapters & ingestion — [./ADR-0003-source-adapters-and-ingestion.md](./ADR-0003-source-adapters-and-ingestion_ko.md) (RawFinding, provenance, dedup 키)
  - ADR-0004 classification & triage — [./ADR-0004-classification-and-triage.md](./ADR-0004-classification-and-triage_ko.md) (noise를 제외한 relation 어휘)
  - ADR-0006 storage & scheduling — [./ADR-0006-storage-and-scheduling.md](./ADR-0006-storage-and-scheduling_ko.md) (ledger가 물리적으로 어디에 저장되는가; dedup runs)
  - ADR-0007 export boundaries — [./ADR-0007-export-boundaries.md](./ADR-0007-export-boundaries_ko.md) (ledger는 export bundle의 단일 생산자)
  - CAW-03 (별도 제품) — 우리 signal의 novelty/radar importer (공유 저장소 없음)
  - CAW-02 (별도 제품) — 우리 `caw05-signal` bundle의 knowledge importer (공유 저장소 없음)

## Context

CAW-05는 **좁은 watch list에 대한 high recall(높은 재현율)**을 임무로 하는 조기 경보 radar이다. 가까운 논문 하나를
놓치면 전체 논문/control-plane 전략의 novelty(신규성)가 통째로 사라질 수 있다(brief §1). 그 recall을 *감사 가능*하고
*방어 가능*하게 만들려면, 어떤 claim이나 전략 축에 대해서도 "무엇이 이것과 관련되는가, 어떤 evidence(증거)로,
어떻게 발견되었으며, 어느 정도까지 검증되었는가?"에 답하는 영속적 기록이 필요하다. 원시 adapter hit는 그 답을
하기에 충분히 신뢰할 수 없다 — 같은 논문이 arXiv, S2, 블로그, HN을 통해 도착하고, preprint와 published 버전 사이에서
제목이 흔들리며, 어떤 "논문"은 존재하지 않는다.

영향 요인(Forces):
- **Auditability(감사 가능성)** — 모든 link는 who/when/how(provenance), why(rationale + 구체적 locator),
  그리고 그 의미(relation + strength)를 담아야 한다. 정정은 조용한 덮어쓰기가 아니라 검사 가능해야 한다.
- **Recall-first** — 검증과 linking이 실제 near-collision(근접 충돌)을 조용히 떨어뜨려서는 안 된다. precision은
  사람 review로 갚으며, 결코 조용한 필터링으로 갚지 않는다(brief §1, §11).
- **Evidence/summary 분리** — LLM abstract/digest는 link를 *촉발*할 수는 있지만 결코 *뒷받침*할 수 없다.
  뒷받침은 항상 검증된 source + locator이다(brief §5, §12).
- **Independence(독립성)** — CAW-05는 자신의 ledger를 소유한다. CAW-02/CAW-03 개념을 불투명한 URI로 참조하며
  그들의 저장소에 절대 손을 뻗지 않는다(brief §1, §8).
- **법적/ToS-safe 검증만** — 공개 학술 API(Semantic Scholar, arXiv, DOI), paywall 뒤의 scraping은 없다(brief §12).

## Options considered

### A. Ledger 데이터 모델

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Append-only LedgerLink 행**(Finding × WatchedTarget × relation), 불투명한 foreign URI를 담은 로컬 앵커 | 거부된 false-positive를 포함한 완전한 감사 이력; 공유 저장소 없음; 정정은 행 추가 | `superseded_by` 규율 + target-mirror 유지 필요 | **chosen** |
| Mutable link table (제자리 업데이트) | 더 단순한 쿼리 | radar의 이력을 파괴; 나중에 거부된 threat가 사라짐 | rejected (감사 불가) |
| CAW-02/CAW-03 id에 직접 link 저장 | 유지할 mirror 없음 | 그들의 id 변동에 결합됨; 경계를 넘어 손을 뻗음 | rejected (§8 위반) |

### B. 논문 검증

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Semantic Scholar key-lookup → `/paper/search/match` → Levenshtein ≥ 0.70 + year ±1 gate → multi-key dedup** | 무료, ToS-safe, `externalIds`가 preprint↔published를 연결; CAW-03 엔진이 이미 신뢰하는 동일 패턴 | S2의 rate/가용성이 의존성 | **chosen** |
| Crossref-only | 강한 DOI | 약한 preprint linking (arXiv가 우리 주력 계열) | 주력으로는 rejected; failover 후보 |
| Embedding-only title match | paraphrase를 잡음 | 불투명, 별개 작업을 과도하게 병합 가능(recall을 해치는 false merge) | rejected |
| Google Scholar scraping | 넓은 커버리지 | ToS 위반 | rejected (§12) |

### C. Sub-threshold(임계값 미만) 처리

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **모호한 것(0.55–0.70 / year 어긋남)을 사람에게 라우팅; 절대 auto-drop 없음** | recall-first; 존재적 비용에 부합 | review 부하 증가 | **chosen** |
| 임계값 미만 auto-discard | 깔끔함 | 조용한 잘못된 discard = 놓친 논문 | rejected (여기서는 precision-over-recall이 틀림) |

## Decision

**네 개 엔티티의 append-only related-work ledger**, **Levenshtein title gate + multi-key dedup를 갖춘 Semantic
Scholar 검증 파이프라인**, 그리고 단일 감사 단위로서의 **provenance가 완비된 LedgerLink**를 채택한다. ledger는
ADR-0007에 정의된 export bundle의 **유일한 생산자**이다.

**1. Entities** (모두 CAW-05 소유; identity는 CAW-05-local):

| Entity | 무엇인가 | Identity |
|---|---|---|
| `Finding` | provenance를 가진 triage된 항목 하나 `source → signal → classification` (ADR-0004 출처) | `caw05:fnd-<uuid>` |
| `VerifiedSource` | Finding이 resolve된 서지 엔티티 (canonical 키로 content-addressed) | `caw05:src-<sha>` |
| `WatchedTarget` | 불투명한 `foreign_ref`(예: `caw03://claim/CLM-2031`, `caw02://concept/memory-wall`) + 사람용 `label` + 발원 watch-list 토픽을 담는 **로컬 앵커** | `caw05:tgt-<slug>` |
| `LedgerLink` | 감사된 edge `(Finding, WatchedTarget, relation, rationale, provenance)` | `caw05:lnk-<uuid>` |

`WatchedTarget`은 공유 저장소 없이 계열과 이어지는 이음매(seam)이다. radar는 Finding을 *우리* target에 link하고,
ADR-0007 export가 그것을 consumer가 이해하는 foreign ref로 투영한다. CAW-03가 claim의 이름을 바꾸면 target 행만
업데이트된다.

**2. LedgerLink는 append-only이며 provenance가 완비된다.** 정정은 `superseded_by`가 있는 새 행을 만든다. 행은
결코 변형되지 않는다. 스키마(전체 형태는 research doc §2.2)는 다음을 담도록 고정된다: `finding_ref`,
`verified_source_ref`(nullable), `target_ref`, `relation`, `strength{score,basis}`, `rationale`(사람이 읽을 수 있는
WHY), `evidence_locator`(**source 내부**를 가리키는 구체적 포인터 — 결코 summary가 아님),
`generated_summary_ref`(`kind=generated-summary`로 태그됨, 결코 backing이 아님), `provenance{discovered_via,
discovered_at, run_id, verification_status}`, 그리고 `review_status`.

**3. Relation 어휘 = triage 클래스에서 noise를 뺀 것.** relation은 셋뿐이며, **noise는 절대 link되지 않는다**(triage에서
discard되며, zero-strength edge로 기록되지 않는다). 이로써 ledger는 *관련성이 있는(bearing)* 항목만 다룬다.

| Triage 클래스 (ADR-0004) | LedgerLink `relation` |
|---|---|
| novelty-threat | `novelty-threat` (load-bearing; CAW-03 export를 구동) |
| support | `support` (→ CAW-02 RelatedWork) |
| adjacent | `adjacent` |
| noise | *(없음 — discard됨)* |

**4. 검증 파이프라인** (raw hit → VerifiedSource): `NORMALIZE`(소문자화, 구두점/diacritic 제거, 공백 축약,
arXiv `vN` 제거) → `KEY LOOKUP`(DOI/arXiv → S2 exact, 가장 저렴) → `TITLE MATCH`(`/paper/search/match`) →
`FUZZY GATE`(Levenshtein-ratio ≥ 0.70 **이고** year ±1일 때만 accept) → `DEDUP`(우선순위 DOI > arXiv > S2
paperId > DBLP/ACL > normalized-title+author hash) → `EMIT`(`verified | ambiguous | unverified`).

| Case | Condition | `verification_status` | Action |
|---|---|---|---|
| Exact ID | DOI/arXiv가 S2에서 resolve됨 | `verified` | metadata + `externalIds` 고정; ID로 dedup |
| Strong title | ratio ≥ 0.70이고 year ±1 | `verified` | S2 paperId 고정; paperId로 dedup |
| Weak/near | 0.55 ≤ ratio < 0.70, 또는 year 어긋남 | `ambiguous` | 보관; **사람에게 라우팅**; 절대 drop 없음 |
| No match | ratio < 0.55 또는 비어있음 | `unverified` | raw metadata 보관; "검증 불가" 플래그 |
| API down | S2 도달 불가 / 429 | `unverified` | backoff로 retry; cache; 절대 run을 막지 않음 |

preprint와 그 published 버전은 하나의 `VerifiedSource`로 **collapse**된다(S2 `externalIds`가 연결). ledger는 link가
발견된 정확한 버전을 가리킬 수 있도록 두 locator를 모두 보관한다. 검증은 CAW-03 엔진이 이미 신뢰하는
PaperOrchestra literature-review 패턴(S2 + Levenshtein gate)을 재사용한다.

**5. Provenance & 경계 불변식.** 모든 Finding/link는 `boundary=public`이다. ledger는 public finding을 내부
Samsung/SAIT claim과 절대 융합하지 않는다(target은 *참조*되며 복사되지 않는다). `generated_summary`는 모든
evidence 필드에서 제외된다 — backing은 항상 `VerifiedSource` + `evidence_locator`이다.

## Consequences

**Easy:** "무엇이 MC-DLA novelty를 위협하며 어떤 evidence로인가?"는 `target_ref + relation`에 대한 쿼리이다.
주간 re-run은 하나의 `VerifiedSource`로 dedup된다. 나중에 거부된 threat도 검사 가능한 채로 남는다. export(ADR-0007)는
확인된 link의 순수 투영이다 — 제2의 source of truth가 없다.

**Hard / follow-on:** CAW-02/CAW-03 rename에 대해 `WatchedTarget.foreign_ref` 매핑을 유지하는 일(staleness
handshake가 open question이다). S2의 ~1 rps keyed 한계가 커지는 watch list를 제약한다. auto-`verified`를 완전히
신뢰하기 전 실제 corpus에서 0.70 / ±1 임계값을 튜닝해야 한다. append-only 증가는 compaction/index 이야기가
필요하다(ADR-0006 소유).

**Negative tests (반드시 성립):** (N1) backing으로 제시된 generated summary → 거부; (N2) sub-0.55 match가
auto-`verified` → 발생하면 안 됨; (N3) 같은 논문의 주간 re-run → 하나의 `VerifiedSource`, 쌍둥이 없음;
(N4) `noise`로 분류된 finding이 link로 등장 → 발생하면 안 됨.

**Implications for runbooks:** **RB (ledger store)**는 ADR-0006의 저장 substrate 위에 append-only 네 엔티티 모델을
구현한다(`superseded_by`, 절대 제자리 변형 없음). **RB (verification adapter)**는 S2 client를 구현한다
(normalize → key lookup → match → gate → multi-key dedup; cache + backoff; 모호한 것은 사람에게 라우팅).
둘 다 ADR-0007 export 투영에 공급한다.

## Open questions / revisit triggers

- TODO(open-question: `related_to`를 CAW-03 claim id에 직접 키잉할지, 아니면 CAW-03가 re-map하는 CAW-02
  concept/claim id에만 키잉할지? CAW-03와 공동 해결 — 그들의 open question을 반영함.)
- TODO(open-question: `WatchedTarget.foreign_ref`는 누가 유지하며, CAW-02/CAW-03 rename/merge 시 stale ref를
  어떻게 탐지하는가 — 주기적 재검증 handshake vs drift 수용?)
- TODO(open-question: Levenshtein 0.70 / year ±1 — auto-`verified`를 신뢰하기 전 좁은 corpus에서 측정한
  false-negative rate는?)
- TODO(open-question: DOI와 arXiv가 불일치할 때 dedup 권위 — S2 `externalIds`를 신뢰할지 사람 판정을 요구할지?)
- TODO(open-question: S2 rate/가용성 — keyed ~1 rps + cache로 충분한지, 아니면 Crossref/OpenAlex failover를 추가할지?)
- **Revisit trigger:** S2 커버리지나 rate가 제2 verifier를 강제하거나, 어떤 export consumer가 ledger가 담지 않는
  link 형태를 필요로 하면, export 계약(ADR-0007)을 바꾸기 전에 이 ADR을 다시 연다.
- `../08-research-plan/open-questions.md` 참조 (생성 예정).
