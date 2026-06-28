# Related-Work Ledger 및 검증(Verification)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF_ko.md)
  - [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS_ko.md)
  - sibling: `./classification-and-triage.md` (novelty-threat/support/adjacent/noise) — TODO(link once written)
  - sibling: `./ports-and-adapters.md` (SourceAdapter / ExportAdapter registry) — TODO(link once written)
  - sibling: `./interest-model.md` (watch list → watched targets) — TODO(link once written)
  - CAW-03 (별개의 제품) — `02-research/novelty-priorart-and-venue.md` (Novelty/Radar 포트; 우리 신호의 importer)
  - CAW-02 (별개의 제품) — `02-research/import-export-boundaries.md` (Boundary B: 우리의 `caw05-signal`을 import)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
이 문서는 CAW-05의 **related-work ledger**를 결정한다: 각 트리아지된 finding을 그것이 위협하거나 지지하는
**주장(claim) 또는 전략 요소**에 연결하는 감사 가능한 레코드, 원시 hit을 신뢰할 수 있는 서지(bibliographic)
엔티티로 바꾸는 **논문 검증 방법**(Semantic Scholar fuzzy 제목 매치 + 다중 키 dedup), 그리고 ledger가
**CAW-03**(novelty)과 **CAW-02**(knowledge)로 신호를 내보내는 **export 번들 형태**. 세 가지 아티팩트를
제공한다: (1) **ledger 모델**, (2) **검증 방법**, (3) **export 번들 형태**. 이 문서는 분류 rubric 자체
(`classification-and-triage.md` 참조), interest/관련성 랭킹(`interest-model.md` 참조), 또는
CAW-02/CAW-03의 내부 구조(우리는 파일 아티팩트를 내보내고, 그들이 pull함)는 정의하지 않는다.

## 1. 타협 불가능한 규칙 (brief에서 상속)
1. **CAW-05는 자신의 ledger를 소유한다.** 그것은 우리 저장소다. 우리는 CAW-02 개념 / CAW-03 주장을
   **불투명 URI(opaque URI)로** 참조한다; 우리는 그들의 저장소에 결코 손을 뻗지 않고 그들도 우리 것에 손을
   뻗지 않는다(brief §1, §8). 모든 export는 파일 아티팩트다.
2. **생성된 요약은 결코 증거가 아니다.** 레이더의 LLM abstract/digest는 링크를 *유발(prompt)*하거나 판정을
   *설명*할 수 있지만, 링크의 뒷받침은 항상 **검증된 소스** + 구체적 locator이지 요약이 결코 아니다
   (brief §5, §12). 요약은 `kind=generated-summary`로 태깅되어 경계를 넘으며, 증거에서 제외된다.
3. **좁은 watch list에 대한 high recall.** 놓친 근접 논문은 novelty를 지울 수 있다(brief §1). ledger와
   검증 경로는 실제 근접 충돌(near-collision)을 **버리지 않도록** 튜닝된다; precision 손실은 소리 없는
   필터링이 아니라 사람의 리뷰로 갚는다.
4. **법적/ToS-안전한 ingestion만.** 검증은 공개 학술 API(Semantic Scholar, arXiv, DOI)를 사용한다;
   paywall 뒤 스크래핑이나 ToS 위반 크롤링 없음(brief §12).
5. **공개 소스 / 내부 분리.** finding은 `boundary=public`이다; ledger는 공개 finding을 내부 Samsung/SAIT
   주장과 결코 융합하지 않는다(brief §12). target은 내부 텍스트 복사본이 아니라 참조된다.

## 2. ledger 모델

### 2.1 엔티티
ledger는 자신이 완전히 소유하지 않는 두 앵커 타입 사이의 **링크 레코드**의 append-only 집합이다:

| Entity | Owner | 무엇인가 | Identity |
|---|---|---|---|
| **Finding** | CAW-05 | provenance를 가진 하나의 트리아지된 항목: `source → signal → classification` | `caw05:fnd-<uuid>` |
| **VerifiedSource** | CAW-05 | Finding이 (§3 후) 해석된 서지 엔티티 | `caw05:src-<sha>` (content-addressed) |
| **WatchedTarget** | CAW-05 *미러* | Finding이 관련되는 주장/전략 요소; 불투명 외부 URI + 사람이 읽을 수 있는 라벨을 가진 **로컬 앵커** | `caw05:tgt-<slug>` |
| **LedgerLink** | CAW-05 | 감사된 엣지: `(Finding, WatchedTarget, relation, rationale, provenance)` | `caw05:lnk-<uuid>` |

**WatchedTarget**은 공유 저장소 없이 패밀리의 나머지로 이어지는 이음새다: 이는 `foreign_ref`
(예: `caw03://claim/CLM-2031` 또는 `caw02://concept/memory-wall`), 사람이 읽을 수 있는 `label`, 그리고
그것이 유래한 watch-list 토픽을 담은 CAW-05 로컬 행이다. 레이더는 Finding을 *우리* target에 연결한다;
export는 그 다음 그것들을 소비자가 이해하는 외부 ref로 투영한다. CAW-03가 주장의 이름을 바꾸면, target 행만
갱신된다.

### 2.2 LedgerLink 스키마 (핵심)
```yaml
ledger_link:
  link_id: caw05:lnk-7f3a                 # CAW-05-로컬, 안정적
  finding_ref: caw05:fnd-0c12             # 트리아지된 finding
  verified_source_ref: caw05:src-9b…      # 해석된 서지 엔티티(§3); 미검증이면 null
  target_ref: caw05:tgt-mc-dla-novelty    # WatchedTarget (로컬 앵커 → 외부 URI)
  relation: novelty-threat | support | adjacent   # 'noise'는 결코 링크되지 않음(discard됨)
  strength: { score: 0.0-1.0, basis: "title+abstract overlap vs target claim text" }
  rationale: "string — 이 소스가 왜 이 target에 관련되는지(사람이 읽을 수 있음, 감사)"
  evidence_locator: "p.4 §3.2 / fig 2 / abstract"  # 소스 안으로의 구체적 포인터, 결코 요약 아님
  generated_summary_ref: caw05:sum-… | null         # kind=generated-summary, 결코 뒷받침 아님
  provenance:
    discovered_via: "arxiv-adapter | rss | github | s2-search"
    discovered_at: "<RFC3339>"
    run_id: caw05:run-2026-26             # 어떤 레이더 run이 생성했는지
    verification_status: verified | unverified | ambiguous   # §3에서
  review_status: proposed | confirmed | rejected   # human-in-the-loop (brief §11: finding은 제안)
  superseded_by: caw05:lnk-… | null       # append-only: 정정은 행을 추가, 결코 변형 안 함
```

### 2.3 이 형태인 이유
- **구조적으로 감사 가능.** 모든 링크는 *누가/언제/어떻게*(`provenance`), *왜*(`rationale` +
  `evidence_locator`), 그리고 *무엇을 의미하는지*(`relation` + `strength`)를 지닌다. "무엇이 MC-DLA
  novelty를 위협하며, 어떤 증거로?"라는 질문은 `target_ref + relation`에 대한 쿼리다.
- **Append-only.** 정정은 `superseded_by`를 가진 새 행을 만든다; 레이더의 이력(나중에 우리가 거부하는
  false positive 포함)은 검사 가능한 상태로 남는다. 이는 CAW-03의 "persist blocked claims" 방향을 반영한다.
- **relation 어휘는 분류에서 noise를 뺀 것.** 네 트리아지 클래스는 세 링크 relation으로 매핑된다;
  **noise는 결코 링크가 아니다**(트리아지에서 discard되며, zero-strength 엣지로 기록되지 않음). 이는
  ledger를 *관련되는* 항목에 대한 것으로만 유지한다.

| 트리아지 클래스 (brief §5) | LedgerLink `relation`이 됨 | Notes |
|---|---|---|
| **novelty-threat** | `novelty-threat` | 하중을 지탱하는 것; CAW-03 export를 추동 |
| **support** | `support` | 주장/전략을 입증; → CAW-02 RelatedWork |
| **adjacent** | `adjacent` | 관련 맥락, 직접적 위협/지지 아님 |
| **noise** | *(없음)* | discard됨; 링크되지 않음 |

## 3. 검증 방법 (원시 hit → VerifiedSource)
(arXiv/RSS/GitHub의) 레이더 hit은 학술 그래프에 대해 해석되기 전까지 **미검증 후보(unverified candidate)**다.
검증은 두 가지 일을 한다: (a) 연구가 존재함을 확인하고 표준 메타데이터를 고정; (b) 주간 재실행과 다중
adapter 발견이 쌍둥이를 만들지 않도록 **dedup**. 우리는 PaperOrchestra의 literature-review 패턴
(Levenshtein 제목 게이트를 가진 Semantic Scholar 검증)을 재사용한다 — CAW-03의 엔진이 이미 이를 신뢰하기 때문.

### 3.1 파이프라인
```
candidate(title, authors?, year?, arxiv?/doi?/url)
  └─1. NORMALIZE   소문자화, 구두점/발음구별부호 제거, 공백 축약, 버전 접미사 제거(arXiv vN)
  └─2. KEY LOOKUP  doi/arxiv 있으면 → S2 /paper/DOI:{doi} or /paper/arXiv:{id} (exact, 가장 저렴)
  └─3. TITLE MATCH 없으면 → S2 /paper/search/match?query={norm_title}  (단일 best match 반환)
  └─4. FUZZY GATE  Levenshtein-ratio(norm_title, norm_match_title) ≥ 0.70 AND year ±1 이내일 때만 수락
  └─5. DEDUP       canonical key 우선순위: DOI > arXiv > S2 paperId > DBLP/ACL > normalized-title-hash
  └─6. EMIT        VerifiedSource(canonical key로 content-addressed) | ambiguous 표시 | unverified 표시
```

### 3.2 결정 테이블
| Case | 조건 | `verification_status` | Action |
|---|---|---|---|
| Exact ID | DOI/arXiv가 S2에서 해석됨 | `verified` | S2 메타데이터 + `externalIds` 고정; ID로 dedup |
| Strong title | match ratio ≥ 0.70 **그리고** year ±1 | `verified` | S2 paperId 고정; paperId로 dedup |
| Weak/near | 0.55 ≤ ratio < 0.70, 또는 year 어긋남 | `ambiguous` | 후보 유지; **사람에게 라우팅**(recall-우선); 소리 없이 버리지 않음 |
| No match | ratio < 0.55 또는 API 비어있음 | `unverified` | 원시 메타데이터로 finding 유지; "could not verify" 플래그 |
| API down | S2 도달 불가 / 429 | `unverified` | backoff로 재시도; 캐시; run을 결코 차단 안 함 |

### 3.3 Dedup 키 & 우선순위
식별자는 실제로 누락되거나 중복되므로, dedup은 단일 id가 아니라 **우선순위를 가진 다중 키**다:

| Priority | Key | 먼저인 이유 |
|---|---|---|
| 1 | DOI (정규화) | 버전 간 가장 안정적인 정체성 |
| 2 | arXiv id (버전 제거) | 우리의 주요 소스 패밀리; preprint ↔ published는 S2 `externalIds`로 연결 |
| 3 | S2 `paperId` | DOI/arXiv가 없는 항목을 커버 |
| 4 | DBLP / ACL id | venue-native fallback |
| 5 | normalized-title hash + 저자 성(surname) 집합 | 모든 id가 없을 때 최후 수단 |

preprint와 그 published 버전은 **하나의** VerifiedSource로 합쳐진다(S2가 연결); ledger는 링크가 발견된
정확한 버전을 가리킬 수 있도록 그 소스에 두 locator를 모두 유지한다.

### 3.4 검증 tradeoffs
| Decision | 선택 | 근거 | 거부된 대안 |
|---|---|---|---|
| Verifier | **Semantic Scholar Graph API** (`/paper/search/match`, key lookup, batch) | 무료, ToS-안전, `externalIds` 보유, 이미 CAW-03 엔진이 신뢰 | Crossref만(약한 preprint 연결); 스크래핑(ToS 위험) |
| Title 게이트 | **Levenshtein ratio ≥ 0.70 + year ±1** | PaperOrchestra에서 입증; 저렴, 설명 가능 | 임베딩 전용 매치(불투명, 과병합 가능) |
| Recall 자세 | **ambiguous는 사람에게 라우팅, 결코 버리지 않음** | brief: 근접 논문을 놓치는 것은 실존적 | sub-threshold 자동 discard(precision over recall — 여기선 틀림) |
| Rate 처리 | **batch endpoint + cache + backoff (S2 key ≈ 1 rps)** | 주간 좁은 run에 맞음; 429에 견고 | 논문별 호출 난사(throttle됨, 취약) |
| Dedup | **다중 키 우선순위 (DOI>arXiv>S2>DBLP>title-hash)** | 실제로 식별자가 누락/불일치 | 단일 id dedup(쌍둥이 생성) |

## 4. Export 번들 형태 (ledger → CAW-03 + CAW-02)
ledger는 **단일 생산자(single producer)**다; export는 `ExportAdapter` 포트를 통한 confirmed 링크의
**투영(projection)**이다(brief §9). 우리는 **CAW-02가 이미 소비하는 경계 봉투(boundary envelope)를 재사용**
(`boundary_kind=caw05-signal`)하여 CAW-03와 CAW-02가 *동일한 아티팩트 패밀리*를 ingest하게 한다 — 소비자별
맞춤 스키마 없음, 공유 저장소 없음.

### 4.1 외부 봉투 (CAW-02 Boundary B / CAW-03 RadarSignal과 일치)
```json
{
  "contract_version": "1.0.0",
  "boundary_kind": "caw05-signal",
  "source_product": "CAW-05",
  "produced_at": "<RFC3339>",
  "producer_run_id": "caw05:run-2026-26",
  "declared_boundary": "public",
  "declared_audience": "team",
  "payload_sha256": "<hash of canonicalized payload>",
  "redaction_applied": ["rule ids stripped before emit"],
  "payload": { "signals": [ /* §4.2, 내보낸 LedgerLink 하나당 하나 */ ] }
}
```
전송: **file drop** — CAW-02의 intake를 위한 `*.caw05.jsonl`(한 줄에 신호 하나); **동일한** 번들 URI를
CAW-03의 `import_radar(bundle_uri)`가 pull한다. CAW-05는 내보내고; 소비자가 pull한다. 우리는 그들의
저장소에 결코 기록하지 않는다.

### 4.2 신호별 payload (내보낸 LedgerLink 하나)
```json
{
  "signal": {
    "signal_id": "caw05:lnk-7f3a",
    "signal_type": "paper | preprint | patent | blog | release",
    "source": {
      "title": "…", "authors": ["…"], "venue": "…", "year": 2026,
      "doi": "…|null", "url": "https://…",
      "external_ids": { "arxiv": "…", "s2": "…", "dblp": "…" }
    },
    "classification": "threat | support | neutral | unknown",
    "relevance": { "score": 0.0, "rationale": "why it bears on the target" },
    "related_to": ["caw03-claim:<id>", "caw02-concept:<id>"],
    "extracted_claims": [
      { "text": "what the source asserts", "evidence_locator": "p.4 §3.2 / fig 2" }
    ],
    "verification": { "status": "verified|ambiguous|unverified", "match_ratio": 0.0, "canonical_key": "doi:…" },
    "raw_summary": "generated abstract — NOT evidence"
  }
}
```

### 4.3 relation → 소비자 classification 매핑
우리의 4-클래스 트리아지는 소비자의 어휘보다 넓다; export는 결정론적으로 매핑한다:

| Ledger `relation` | CAW-03 (novelty) | CAW-02 (knowledge) | Routed? |
|---|---|---|---|
| `novelty-threat` | `threat` → NoveltyVerdict 입력 | Claim에 대한 `threat` RelatedWork 링크 | **둘 다** |
| `support` | `support` (입증) | `support` RelatedWork 링크 | **둘 다** |
| `adjacent` | `neutral` | `neutral` RelatedWork (맥락) | 주로 CAW-02 |
| *(unverified link)* | `unknown` | `unknown` (큐레이터 리뷰, 자동 링크 아님) | 플래그됨, 게이팅 안 됨 |
| `noise` | — | — | **결코 export 안 됨** |

`related_to`는 **WatchedTarget의 `foreign_ref`**를 지녀 각 소비자가 *자신의* 네임스페이스에서 id를
보게 한다(`caw03-claim:` vs `caw02-concept:`). CAW-05가 투영을 수행한다; 소비자는 우리 내부 id를 재매핑하지
않는다.

### 4.4 Export 규칙 (fail-closed, brief 정렬)
- **기본적으로 `review_status=confirmed` 링크만 export됨**(finding은 제안; Jimmy가 확인). `propose-only`
  profile은 낮은 위험의 digest를 위해 `auto`로 플래그된 `proposed` 링크를 내보낼 수 있다 — 결코 novelty
  게이트로는 아님.
- **`raw_summary`는 `kind=generated-summary`**이며 어떤 증거 필드에서도 제외됨; 뒷받침은 항상
  `source` + `evidence_locator`(규칙 §1.2). CAW-02/03 모두 import 시 이를 재강제한다.
- **`boundary=public`만**; emit 전에 redaction sweep 실행; 비공개 항목은 번들을 중단(방어 심층화 —
  소비자도 재-redact함).
- **자기완결적(self-contained) + content-addressed**: `payload_sha256`은 소비자가 주간 run의 재import를
  dedup하게 함; `canonical_key`는 CAW-02가 우리 Source를 기존 것과 dedup하게 함.
- **빈 번들은 거부됨**(내보낼 것 없음 → 에러 + 리포트, 결코 소리 없는 빈 파일 아님).

### 4.5 Export tradeoffs
| Decision | 선택 | 근거 | 거부된 대안 |
|---|---|---|---|
| Envelope | **`caw05-signal` 재사용 (CAW-02의 기존 계약)** | 두 소비자가 이미 모델링한 하나의 스키마; 새 결합 0 | 소비자별 맞춤 스키마(2배 유지보수) |
| Id 투영 | **CAW-05가 target → 외부 ref로 `related_to`에 매핑** | 소비자가 우리 id로부터 분리 유지 | 우리 id를 보내 소비자가 재매핑(그들을 우리에게 결합) |
| 기본 게이트 | **CAW-03로는 confirmed만** | novelty 게이트는 리뷰되지 않은 자동 링크에서 실행되면 안 됨 | 모두 자동 export(게이트로 false-threat noise 유입) |
| 버저닝 | **semver `contract_version`, 두 소비자 모두 알 수 없는 major 거부** | 독립적 진화 | 비버전(소리 없는 breakage) |
| 전송 | **file drop, 소비자가 pull** | 공유 기반 없음; replay/diff 가능 | 소비자 저장소로 push/live API(독립성 위반) |

## Open Questions
- TODO(open-question: does CAW-05 emit `related_to` keyed to **CAW-03 claim ids** directly, or only to CAW-02
  concept/claim ids that CAW-03 re-maps through its imported ledger? Mirrors CAW-03's open question; resolve jointly.)
- TODO(open-question: who maintains WatchedTarget `foreign_ref` mappings, and how do we detect a stale ref when
  CAW-03/CAW-02 rename or merge a claim/concept — periodic re-validation handshake vs accept drift?)
- TODO(open-question: Levenshtein 0.70 / year ±1 thresholds — tune on the narrow watch-list corpus; what is the
  measured false-negative rate before we trust auto-`verified`?)
- TODO(open-question: dedup authority when DOI and arXiv disagree (e.g. wrong DOI on a preprint) — trust S2's
  `externalIds` linkage, or require human adjudication?)
- TODO(open-question: do we export `ambiguous`/`unverified` links at all, or hold them until verified? Lean:
  export flagged `unknown` to CAW-02 for curator review, but never to CAW-03's gate.)
- TODO(open-question: Semantic Scholar rate/availability — is the ~1 rps keyed limit + cache enough for a growing
  watch list, or do we need a secondary verifier (Crossref/OpenAlex) as failover?)
- TODO(open-question: signature scheme for the export envelope — align with CAW-02's choice (minisign/cosign/DSSE)
  so one verifier works across the family.)
- See `../08-research-plan/open-questions.md` (to be created).

## 런북(runbook)에 대한 함의
- **RB (ledger store):** append-only LedgerLink + Finding + VerifiedSource + WatchedTarget 모델 구현
  (brief §7에 따라 md/JSON + 경량 인덱스); 정정은 in-place 변형이 아니라 `superseded_by`로; `relation`
  어휘는 `noise`를 제외.
- **RB (verification adapter):** Semantic Scholar 클라이언트 — normalize → key lookup →
  `/paper/search/match` → Levenshtein ≥ 0.70 + year ±1 게이트 → 다중 키 dedup; ~1 rps를 위한 cache +
  backoff; `verified | ambiguous | unverified` 내보냄; **ambiguous는 사람에게 라우팅, 결코 버리지 않음**
  (recall-우선 수락 테스트).
- **RB (export adapter — CAW-03 + CAW-02):** confirmed 링크를 `caw05-signal` 봉투로 투영;
  `relation → classification` 매핑; 외부 ref를 `related_to`에 넣음; `raw_summary`를 증거에서 제외;
  비공개/빈 것에 fail-closed; `payload_sha256` + `canonical_key`로 content-address. 에이전트와 사람이
  동일한 redaction/기밀성 검사를 거치도록 검증된 skill 액션으로 제공(원시 우회 없음).
- **RB (ports):** CAW-02/CAW-03 v1 adapter와 문서화된 CAW-01/CAW-06 stub을 가진 `ExportAdapter` registry;
  코어는 구체적 소비자가 아니라 포트에만 의존(brief §9).
- **RB (acceptance / negative tests):** (N1) 생성된 요약이 뒷받침으로 제시됨 → 거부; (N2) sub-0.55 매치가
  자동 `verified` → 발생하면 안 됨; (N3) 공개 번들 안의 비공개 링크 → 번들 중단; (N4) 같은 논문의 주간
  재실행 → 하나의 VerifiedSource(dedup), 쌍둥이 없음; (N5) noise로 분류된 finding이 번들에 나타남 →
  발생하면 안 됨.

Sources:
[Semantic Scholar Academic Graph API](https://www.semanticscholar.org/product/api),
[Semantic Scholar API Tutorial](https://www.semanticscholar.org/product/api/tutorial),
[The Semantic Scholar Open Data Platform (arXiv:2301.10140)](https://arxiv.org/pdf/2301.10140),
[Evaluating Deduplication Techniques for Research Paper Titles (arXiv:2410.01141)](https://arxiv.org/abs/2410.01141),
[PreprintResolver: Resolving Published Versions of arXiv Preprints (arXiv:2309.01373)](https://arxiv.org/pdf/2309.01373).
