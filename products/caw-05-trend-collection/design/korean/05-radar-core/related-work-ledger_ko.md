# Radar Core — Related-Work Ledger & Verification (관련 연구 원장 & 검증)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF_ko.md) (source of truth — §5, §7, §8, §12)
  - [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS_ko.md)
  - [../01-decisions/ADR-0005-related-work-ledger_ko.md](../01-decisions/ADR-0005-related-work-ledger_ko.md) (이 문서가 구체화하는 결정)
  - [../01-decisions/ADR-0004-classification-and-triage_ko.md](../01-decisions/ADR-0004-classification-and-triage_ko.md) (relation 어휘 = classes minus noise)
  - [../01-decisions/ADR-0006-storage-and-scheduling_ko.md](../01-decisions/ADR-0006-storage-and-scheduling_ko.md) (원장이 물리적으로 사는 곳; run 간 dedup)
  - [../01-decisions/ADR-0007-export-boundaries_ko.md](../01-decisions/ADR-0007-export-boundaries_ko.md) (원장은 export bundle의 유일한 생산자)
  - [../02-research/related-work-ledger_ko.md](../02-research/related-work-ledger_ko.md) (전체 방법, 결정 표, 인용)
  - sibling: [./classification-and-triage_ko.md](./classification-and-triage_ko.md) (이 원장이 영속화하는 `Finding` + class를 생산)
  - CAW-03 (별개 제품) — 우리 signal의 novelty/radar importer (공유 store 없음)
  - CAW-02 (별개 제품) — 우리 `caw05-signal` bundle의 knowledge importer (공유 store 없음)
  - [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md) (TODO: create)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
이것은 related-work ledger의 **radar-core 빌드 계약**이다: 구체적 엔티티, append-only 쓰기 규율,
Semantic Scholar 검증 파이프라인(normalize → key lookup → title match → Levenshtein + year gate → multi-key dedup),
provenance가 완전한 `LedgerLink`, 그리고 확정된 링크가 export로 투영(project)되는 방식. 이 문서는
[../01-decisions/ADR-0005-related-work-ledger_ko.md](../01-decisions/ADR-0005-related-work-ledger_ko.md)와
[../02-research/related-work-ledger_ko.md](../02-research/related-work-ledger_ko.md)를 코드화 가능한 형태로 구체화한다. 이 문서는
분류 rubric(see [./classification-and-triage_ko.md](./classification-and-triage_ko.md)), 물리적 저장
substrate / 스케줄링(ADR-0006), 또는 전체 export envelope 계약(ADR-0007 — 원장이 그 생산자인 한에서만 §5에서
요약됨)을 정의하지 **않는다**. 이 문서는 **분류되고 검토 가능한 `Finding`**이 존재한다고 가정한다.

## 1. 이 core가 강제하는 불변식 (완화 금지)
1. **CAW-05는 자신의 원장을 소유한다.** 그것은 우리의 store이다. CAW-02 concept / CAW-03 claim은 **opaque URI로만**
   참조된다. 우리는 절대 그들의 store에 손을 뻗지 않고 그들도 우리 것에 손을 뻗지 않는다(brief §1, §8). 모든
   export는 consumer가 끌어가는 파일 artifact이다.
2. **생성된 요약은 절대 근거가 아니다.** LLM abstract/digest는 링크를 *촉발(prompt)*하거나 verdict를 *설명*할 수
   있다. 그러나 backing은 항상 `VerifiedSource` + source 안으로의 구체적 `evidence_locator`이다 — 결코 요약이
   아니다. 요약은 `kind=generated-summary`로 태깅되며 모든 evidence 필드에서 제외된다(brief §5, §12).
3. **좁은 watch list에 대한 높은 recall.** 검증과 링킹은 **실제 near-collision을 절대 조용히 버리지 않는다**.
   precision은 조용한 필터링이 아니라 human review로 지불한다(brief §1, §11).
4. **Legal/ToS-safe 검증만.** 공개 학술 API(Semantic Scholar, arXiv, DOI). 페이월 스크래핑 금지(brief §12).
5. **Public/internal 분리.** finding은 `boundary=public`이다. 원장은 공개 finding을 내부 Samsung/SAIT claim과 절대
   융합하지 않는다 — `WatchedTarget`은 내부 텍스트로 복사되는 것이 아니라 *참조*된다(brief §12).

## 2. 원장 엔티티
CAW-05가 소유하는 네 개의 엔티티. 모든 identity는 CAW-05-local이다. 원장은 **append-only 링크 레코드 집합**이다.

| Entity | 무엇인가 | Identity |
|---|---|---|
| **Finding** | provenance를 가진 하나의 triage된 항목 `source → signal → classification` (출처: [./classification-and-triage_ko.md](./classification-and-triage_ko.md)) | `caw05:fnd-<uuid>` |
| **VerifiedSource** | Finding이 해결된 서지(bibliographic) 엔티티 (canonical key로 content-addressed, §3) | `caw05:src-<sha>` |
| **WatchedTarget** | opaque `foreign_ref` + human `label` + 출처 watch-list topic을 담는 **local anchor** | `caw05:tgt-<slug>` |
| **LedgerLink** | 감사된 edge `(Finding, WatchedTarget, relation, rationale, provenance)` | `caw05:lnk-<uuid>` |

**WatchedTarget이 seam이다** — 공유 store 없이 나머지 family로 이어지는 이음새다: 이것은 `foreign_ref`(예:
`caw03://claim/CLM-2031`, `caw02://concept/memory-wall`), `label`, 그리고 그것이 유래한 watch-list 행을 담는다.
radar는 Finding을 *우리의* target에 링크한다. export(§5)는 그것을 consumer가 이해하는 foreign ref로 투영한다.
CAW-03이 claim 이름을 바꾸면 **target 행만 갱신된다** — cascade는 없다.

## 3. The LedgerLink (provenance 완전, append-only)
`LedgerLink`는 **단일 감사 단위**이다. 정정(correction)은 `superseded_by`를 가진 새 행을 만든다. 행은 **제자리에서
변경되지 않으므로**, 나중에 거부된 false positive를 포함한 radar의 전체 이력이 검사 가능하게 유지된다.

```yaml
ledger_link:
  link_id: caw05:lnk-7f3a                 # CAW-05-local, stable
  finding_ref: caw05:fnd-0c12
  verified_source_ref: caw05:src-9b…      # resolved bibliographic entity (§4); null if unverified
  target_ref: caw05:tgt-mc-dla-novelty    # WatchedTarget (local anchor → foreign URI)
  relation: novelty-threat | support | adjacent   # 'noise' is NEVER linked (discarded at triage)
  strength: { score: 0.0-1.0, basis: "title+abstract overlap vs target claim text" }
  rationale: "WHY this source bears on this target (human-readable, for audit)"
  evidence_locator: "p.4 §3.2 / fig 2 / abstract"  # concrete pointer INTO the source — never the summary
  generated_summary_ref: caw05:sum-… | null         # kind=generated-summary, NEVER the backing
  provenance:
    discovered_via: "arxiv-adapter | rss | github | s2-search"
    discovered_at: "<RFC3339>"
    run_id: caw05:run-2026-26             # which radar Run produced it
    verification_status: verified | ambiguous | unverified   # from §4
  review_status: proposed | confirmed | rejected   # findings are proposals (brief §11)
  superseded_by: caw05:lnk-… | null       # append-only correction pointer
```

### 3.1 Relation 어휘 = triage class minus noise
relation은 셋뿐이다. **`noise`는 절대 링크가 아니다** — triage에서 버려지며 zero-strength edge로 기록되지 않는다 —
원장을 *bearing(연관성을 가지는)* 항목에 관한 것으로 유지한다.

| Triage class ([./classification-and-triage_ko.md](./classification-and-triage_ko.md)) | LedgerLink `relation` | 구동 대상 |
|---|---|---|
| novelty-threat | `novelty-threat` | load-bearing → CAW-03 export |
| support | `support` | → CAW-02 RelatedWork |
| adjacent | `adjacent` | context, threat도 support도 아님 |
| noise | *(none — discarded)* | — |

## 4. 검증 파이프라인 (raw hit → VerifiedSource)
radar hit은 학술 그래프에 대해 해결되기 전까지는 **unverified candidate**이다. 검증은 (a) 그 연구가 존재함을
확인하고 canonical 메타데이터를 고정하며, (b) 주간 재실행과 multi-adapter discovery가 쌍둥이를 만들지 않도록
**dedup**한다. PaperOrchestra / CAW-03의 Semantic Scholar 패턴(S2 + Levenshtein title gate)을 재사용한다.

```
candidate(title, authors?, year?, arxiv?/doi?/url)
  └─1. NORMALIZE   lowercase, strip punctuation/diacritics, collapse whitespace, drop arXiv version suffix (vN)
  └─2. KEY LOOKUP  if doi/arxiv present → S2 /paper/DOI:{doi} or /paper/arXiv:{id} (exact, cheapest)
  └─3. TITLE MATCH else → S2 /paper/search/match?query={norm_title}   (single best match)
  └─4. FUZZY GATE  accept iff Levenshtein-ratio(norm_title, match_title) ≥ 0.70  AND  year within ±1
  └─5. DEDUP       canonical-key precedence: DOI > arXiv > S2 paperId > DBLP/ACL > normalized-title+author hash
  └─6. EMIT        VerifiedSource (content-addressed by canonical key) | mark ambiguous | mark unverified
```

### 4.1 결정 표 (recall-first)
| Case | Condition | `verification_status` | Action |
|---|---|---|---|
| Exact ID | DOI/arXiv resolves on S2 | `verified` | pin metadata + `externalIds`; dedup by ID |
| Strong title | ratio ≥ 0.70 **and** year ±1 | `verified` | pin S2 paperId; dedup by paperId |
| Weak/near | 0.55 ≤ ratio < 0.70, **or** year off | `ambiguous` | keep; **route to human**; never drop |
| No match | ratio < 0.55 or empty | `unverified` | keep raw metadata; flag "could not verify" |
| API down | S2 unreachable / 429 | `unverified` | retry w/ backoff; cache; **never block the run** |

### 4.2 Dedup key & precedence
identifier는 실제 환경에서 누락되거나 중복되므로, dedup은 single-id가 아니라 **precedence를 가진 multi-key**이다.

| Priority | Key | Why |
|---|---|---|
| 1 | DOI (normalized) | 가장 안정적인 cross-version identity |
| 2 | arXiv id (version-stripped) | 우리의 주된 family; preprint ↔ published를 S2 `externalIds`로 연결 |
| 3 | S2 `paperId` | DOI/arXiv가 없는 항목을 커버 |
| 4 | DBLP / ACL id | venue-native fallback |
| 5 | normalized-title hash + author-surname set | 모든 id가 없을 때의 최후 수단 |

preprint와 그것의 published 버전은 **하나의** `VerifiedSource`로 **수렴**된다(S2 `externalIds`가 연결). 원장은 그
source에 **두 locator를 모두** 보관하므로 링크가 발견된 정확한 버전을 가리킬 수 있다.

### 4.3 임계값은 config이다
`0.70` ratio와 `±1` year는 상수가 아니라 시작 기본값이다 — auto-`verified`를 완전히 신뢰하기 전에 좁은
corpus에서 false-negative rate를 측정하라. S2 keyed 한도 ≈ 1 rps → batch endpoint + cache + backoff를 사용하라.
주간의 좁은 run은 들어맞는다. TODO(open-question: 튜닝된 임계값; failover로서 secondary verifier — Crossref/OpenAlex).

## 5. Export (원장 → CAW-03 + CAW-02)
원장은 **유일한 생산자**이다. export는 `ExportAdapter` 포트를 통한 **확정된 링크의 투영(projection)**이다
(전체 envelope는 [../01-decisions/ADR-0007-export-boundaries_ko.md](../01-decisions/ADR-0007-export-boundaries_ko.md)).
두 consumer 모두 **동일한** `boundary_kind=caw05-signal` artifact family를 수용한다 — consumer별 맞춤 스키마도,
공유 store도 없다. 전송은 **file drop이며 consumer가 pull한다**.

### 5.1 Relation → consumer 분류
| Ledger `relation` | CAW-03 (novelty) | CAW-02 (knowledge) | Routed? |
|---|---|---|---|
| `novelty-threat` | `threat` → NoveltyVerdict input | `threat` RelatedWork → Claim | **both** |
| `support` | `support` (corroboration) | `support` RelatedWork | **both** |
| `adjacent` | `neutral` | `neutral` RelatedWork (context) | CAW-02 primarily |
| *(unverified link)* | `unknown` | `unknown` (curator review, not auto-linked) | flagged, not gated |
| `noise` | — | — | **never exported** |

`related_to`는 **WatchedTarget의 `foreign_ref`**를 담으므로 각 consumer는 *자신의* namespace에서 id를 본다
(`caw03-claim:` vs `caw02-concept:`). CAW-05가 투영을 수행하고, consumer는 우리의 내부 id를 절대 재매핑하지 않는다.

### 5.2 Export 규칙 (fail-closed)
- **기본적으로 `review_status=confirmed` 링크만 export한다**(finding은 제안이며, Jimmy가 확정한다). `propose-only`
  프로파일은 `auto`로 표시된 `proposed` 링크를 low-stakes digest로 내보낼 수 있다 — **절대 CAW-03의 gate로는 아님**.
- **`raw_summary`/`generated_summary`는 `kind=generated-summary`**이며 모든 evidence 필드에서 제외된다. backing은
  항상 `source` + `evidence_locator`이다(§1.2). consumer는 import 시 이를 재강제한다.
- **`boundary=public`만**. emit 전에 redaction sweep이 돌고, 비공개 항목은 bundle을 **abort**시킨다.
- **Content-addressed**: `payload_sha256`은 consumer가 재import를 dedup하게 하고, `canonical_key`는 CAW-02가 우리
  Source를 기존 것과 dedup하게 한다.
- **빈 bundle은 거부**(export할 것이 없음 → error + report, 절대 조용한 빈 파일이 아님).

## 6. 빌더 acceptance — negative test (반드시 성립)
| ID | Scenario | Required behavior |
|---|---|---|
| N1 | a generated summary offered as a link's backing | **refused** (`evidence=false`) |
| N2 | a sub-0.55 match auto-`verified` | **must not happen** (→ `unverified`) |
| N3 | a non-public link in a public bundle | bundle **aborts** |
| N4 | a weekly re-run of the same paper | **one** `VerifiedSource` (dedup), no twin |
| N5 | a `noise`-classified finding appears as a link or in a bundle | **must not happen** |
| N6 | S2 unreachable / 429 | retry + cache; the Run **does not block** |
| N7 | a correction to a link | new row with `superseded_by`; original **not mutated** |

## Open Questions
- TODO(open-question: `related_to`를 CAW-03 claim id에 직접 키잉하여 emit할 것인가, 아니면 CAW-03이 재매핑하는
  CAW-02 concept/claim id만 할 것인가? CAW-03과 공동 해결.)
- TODO(open-question: 누가 `WatchedTarget.foreign_ref`를 유지하며, CAW-02/CAW-03의 rename/merge 시 stale ref를
  어떻게 감지하는가 — 주기적 handshake vs drift 수용?)
- TODO(open-question: Levenshtein 0.70 / year ±1 — auto-`verified`를 신뢰하기 전 좁은 corpus에서 측정된
  false-negative rate?)
- TODO(open-question: DOI와 arXiv가 불일치할 때의 dedup 권위 — S2 `externalIds`를 신뢰할 것인가 human
  adjudication을 요구할 것인가?)
- TODO(open-question: `ambiguous`/`unverified` 링크를 애초에 export하는가? lean: curator review를 위해 CAW-02로
  `unknown` 표시, 절대 CAW-03의 gate로는 아님.)
- TODO(open-question: S2 rate/availability — keyed ~1 rps + cache로 충분한가, 아니면 Crossref/OpenAlex failover를
  추가하는가?)
- TODO(open-question: export envelope의 signature scheme — CAW-02의 선택과 정렬 — ADR-0007 소유.)
- See [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md) (생성 예정).

## 런북에 대한 함의
- **RB (ledger store):** ADR-0006 substrate 위의 append-only `LedgerLink` + `Finding` + `VerifiedSource` +
  `WatchedTarget`; 정정은 `superseded_by`로, 제자리 변경은 절대 금지; `relation` 어휘는 `noise`를 제외.
  Acceptance: N5, N7.
- **RB (verification adapter):** S2 client — normalize → key lookup → `/paper/search/match` → Levenshtein ≥ 0.70 +
  year ±1 → multi-key dedup; ~1 rps용 cache + backoff; `verified | ambiguous | unverified` emit; ambiguous는
  human으로 라우팅, 절대 drop 금지. Acceptance: N2, N4, N6.
- **RB (export projection):** 확정된 링크를 `caw05-signal` envelope로 투영(ADR-0007);
  `relation → classification` 매핑; `related_to`에 foreign ref; evidence에서 generated summary 제외;
  non-public/empty에 fail-closed; content-address. Acceptance: N1, N3.
- **RB (ports):** CAW-02/CAW-03 v1 어댑터 + documented CAW-01/CAW-06 stub을 가진 `ExportAdapter` 레지스트리;
  core는 구체적 consumer가 아니라 포트에만 의존(brief §9).
