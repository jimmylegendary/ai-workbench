# 데이터 모델 — 엔티티, 스키마, provenance 필드

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: 리뷰 시 설정)
- **Related:**
  - [./storage-and-scheduling_ko.md](./storage-and-scheduling_ko.md) (이 레코드들이 물리적으로 어디에 저장되는가; index/cache)
  - [./provenance-and-boundaries_ko.md](./provenance-and-boundaries_ko.md) (provenance/경계/신뢰 + generated-summary 표시)
  - [../01-decisions/ADR-0002-interest-model.md](../01-decisions/ADR-0002-interest-model_ko.md) (Interest 아티팩트)
  - [../01-decisions/ADR-0003-source-adapters-and-ingestion.md](../01-decisions/ADR-0003-source-adapters-and-ingestion_ko.md) (Source, RawFinding, dedup 키)
  - [../01-decisions/ADR-0004-classification-and-triage.md](../01-decisions/ADR-0004-classification-and-triage_ko.md) (Classification 레코드)
  - [../01-decisions/ADR-0005-related-work-ledger.md](../01-decisions/ADR-0005-related-work-ledger_ko.md) (WatchedTarget, VerifiedSource, LedgerLink)
  - [../01-decisions/ADR-0007-export-boundaries.md](../01-decisions/ADR-0007-export-boundaries_ko.md) (ExportBundle envelope)
  - [../02-research/related-work-ledger.md](../02-research/related-work-ledger_ko.md) (ledger + export bundle 상세)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적
이 문서는 CAW-05의 **논리적 데이터 모델**을 확정한다. 즉 radar가 읽고, 생성하고, 연결하고, export하는
엔티티들, 그 필드 수준의 스키마, 그리고 **모든 레코드가 지니는 provenance 필드**를 정의한다. 이는 다른
data-layer 문서들과 runbook들이 기준으로 삼는 표준 이름/형태(shape) 레퍼런스다. 이 문서는 레코드가 *어디에*
저장되는지나 *언제* 기록되는지를 결정하지 않으며(see [storage-and-scheduling](./storage-and-scheduling_ko.md)),
이 필드들에 대한 신뢰/경계 *규칙*([provenance-and-boundaries](./provenance-and-boundaries_ko.md) 참조)이나
classification 기준(ADR-0004) 또는 verification gate(ADR-0005)도 정의하지 않는다 — 그것들을 고정된 것으로
받아들이고 그 출력 형태만 보여준다.

## 1. 엔티티 맵 (radar의 명사들)
하나의 Run은 `Interest` + `Source`를 읽고, `Finding`을 방출하고, `Classification`을 첨부하고,
`VerifiedSource`를 해소(resolve)하고, `LedgerLink`를 통해 `WatchedTarget`에 연결하고, `Digest`를 렌더링하고,
확정된 link들을 `ExportBundle`로 투영(project)한다.

| Entity | Owner | Produced by | Identity | Mutability |
|---|---|---|---|---|
| `Interest` | CAW-05 | human, versioned | `caw05:int-v<N>` | versioned (업데이트마다 새 row) |
| `Source` | CAW-05 | config registry | `caw05:srcadapter-<family>` | config (제자리 편집) |
| `Finding` | CAW-05 | collect stage | `caw05:fnd-<uuid>` | append; superseded, 절대 mutate 안 함 |
| `Classification` | CAW-05 | classify stage | Finding에 embedded (`+ class_version`) | re-classify마다 새 레코드 append |
| `VerifiedSource` | CAW-05 | verify stage | `caw05:src-<sha>` (content-addressed) | content-addressed (key마다 immutable) |
| `WatchedTarget` | CAW-05 | watch list로부터 seed | `caw05:tgt-<slug>` | mutable anchor (foreign_ref는 업데이트 가능) |
| `LedgerLink` | CAW-05 | ledger stage | `caw05:lnk-<uuid>` | **append-only** (`superseded_by`) |
| `Digest` | CAW-05 | synthesize stage | `caw05:dig-<run_id>` | run마다 immutable 아티팩트 |
| `ExportBundle` | CAW-05 | export stage | `caw05:exp-<idempotency_key>` | immutable 아티팩트 (idempotent) |

모든 identity는 **CAW-05-local**이다. 제품 간 참조는 `WatchedTarget`의 불투명한 `foreign_ref` 문자열로만
지니며 export 시점에 투영된다 — Finding에 저장된 외부 id로는 절대 다루지 않는다(독립성, brief §1/§8).

## 2. 공유 provenance 블록
생성되는 모든 레코드(`Finding`, `Classification`, `VerifiedSource`, `LedgerLink`, `Digest`, `ExportBundle`)는
동일한 `provenance` 블록을 embed한다. 이는 감사 가능한 단일 척추(spine)다. 이에 대한 규칙은
[provenance-and-boundaries](./provenance-and-boundaries_ko.md)를 참조하라.

```yaml
provenance:
  origin:        "arxiv | semantic-scholar | github | rss:<feed-id> | hn"  # WHERE it came from (source family)
  origin_ref:    "arxiv:2401.01234v2 | https://… | repo@sha"               # canonical locator at origin
  retrieved_at:  "<RFC3339>"        # WHEN we fetched it (not the publish date)
  published_at:  "<RFC3339|null>"   # source-asserted publish/update date, if any
  run_id:        "caw05:run-2026-26"  # which Run produced this record
  adapter:       "arxiv-adapter@<version>"  # which SourceAdapter/stage emitted it
  boundary:      "public"           # public | internal — v1 ingests public only (brief §12)
  trust_prior:   "high | medium | low"  # per-source prior (ADR-0003/0004); carried, not re-derived
```

`retrieved_at`과 `published_at`은 의도적으로 구분된다: cursor는 retrieval time 기준으로 전진하고, recall 추론은
publish time을 사용한다. 날짜는 절대 지어내지 않는다 — source 날짜가 없으면 추측이 아니라 `null`이다.

## 3. Interest
작고 큐레이션된 **typed interest 아티팩트**(ADR-0002). 가산적(additive)이고 설명 가능하며 recall이 바닥에
깔린(recall-floored) relevance 점수를 구동한다. Human-gated이고 versioned이며, 좁은 watch list로부터
seed된다(brief §6).

```yaml
interest:
  version: caw05:int-v3
  updated_by: jimmy
  updated_at: "<RFC3339>"
  terms:
    - { value: "memory-centric DSE", kind: topic,   tier: 1, polarity: include }
    - { value: "Minsoo Rhu",          kind: author,  tier: 1, polarity: include }
    - { value: "MemOS",               kind: entity,  tier: 1, polarity: include }
    - { value: "arXiv:cs.AR",         kind: venue,   tier: 2, polarity: include }
    - { value: "crypto airdrop",      kind: keyword, tier: 3, polarity: exclude }
  embedding_lane: { enabled: false }   # alpha; gated on a labeled eval set (ADR-0002)
```

`kind ∈ {keyword, topic, entity, author, venue}`; `tier ∈ {1,2,3}`(가중치); `polarity ∈ {include, exclude}`.
업데이트는 **새 버전 row**를 만든다 — Finding은 어떤 `interest.version`에 대해 점수화되었는지 기록하므로 점수는
항상 재현 가능하다.

## 4. Source
하나의 port 뒤에 있는 `SourceAdapter` 레지스트리 항목(ADR-0003). 데이터가 아니라 config다.

```yaml
source:
  id: caw05:srcadapter-arxiv
  family: "arxiv | semantic-scholar | github | rss | hn"
  status: "v1 | stub"          # documented stubs: reddit, sec-edgar, newsletters
  trust_prior: high
  cursor_kind: "oai-from | etag | since | numeric-id"   # see storage-and-scheduling §cursors
  legal_note: "public API; ToS-safe; rate ~<documented>"  # only legal/ToS-safe ingestion (brief §12)
```

## 5. Finding (embedded Classification 포함)
가치의 단위: provenance를 동반한 `source → signal → classification`(brief §2). Finding은 하나의 JSON
레코드이며, 그 `classification`은 embed된 ADR-0004 레코드다(re-classification은 새 `class_version`을 가진
레코드를 append하고, 이전 것은 감사를 위해 유지한다).

```yaml
finding:
  finding_id: caw05:fnd-0c12
  provenance: { … as §2 … }
  dedup_key: "doi:10.1145/… | arxiv:2401.01234 | sha256:<title+abstract>"   # ADR-0003 canonical key
  raw:
    title: "…"
    authors: ["…"]
    abstract: "…"          # source text; NOT a generated summary
    url: "https://…"
    external_ids: { arxiv: "…", doi: "…|null", s2: "…|null" }
  relevance:               # from the Interest score (ADR-0002)
    score: 0.0
    interest_version: caw05:int-v3
    watchlist_hits: ["memory-centric DSE"]
    explain: ["bm25(title)=…", "tier1-author-match=…"]   # additive, explainable contributions
  classification:          # ADR-0004 record
    relevance_class: "novelty-threat | support | adjacent | noise"
    signal: { score: 0.0, bucket: "hype | mixed | signal" }
    confidence: 0.0
    class_version: 1
    method: { labeler: "lf | llm | human", self_consistency: 0.0, abstained: false }
    review: { state: "queued | auto-accepted | human-confirmed | human-overridden", reviewer: null, decided_at: null }
    rationale_note: { text: "…", model: "<model>", evidence: false }   # generated; NEVER evidence
    routing: { decision: "knowledge|task|experiment|open-question|discard", targets: [], digest_eligible: true }
```

**여기에 인코딩된 불변식(invariant):** `rationale_note.evidence=false`(생성된 텍스트는 결코 evidence가 아님,
brief §5/§12); `watchlist_hits ≠ []`인 Finding은 human review 없이는 절대 `routing.decision=discard`가 되지
않음(recall floor, ADR-0004 §4); `noise`는 tombstone으로 discard되며 절대 link되지 않음(ADR-0005).

## 6. VerifiedSource
Finding이 Semantic Scholar gate(ADR-0005 §4)를 거쳐 해소된 서지(bibliographic) 엔티티. canonical key로
content-addressed되어 주간 재실행이 하나의 row로 합쳐진다.

```yaml
verified_source:
  src_id: caw05:src-9b…                 # sha of canonical_key
  canonical_key: "doi:10.1145/… | arxiv:2401.01234 | s2:<paperId>"
  precedence: "doi > arxiv > s2 > dblp/acl > title+author-hash"
  metadata: { title: "…", authors: ["…"], venue: "…", year: 2026 }
  external_ids: { doi: "…", arxiv: "…", s2: "…", dblp: "…" }   # preprint↔published linked
  verification: { status: "verified | ambiguous | unverified", match_ratio: 0.0, gate: "lev>=0.70 & year±1" }
  locators: ["arxiv:2401.01234v2", "doi:…"]   # keep both versions a link may point into
  provenance: { … as §2 … }
```

## 7. WatchedTarget
공유 store 없이 family에 연결되는 local anchor 이음매(seam)(ADR-0005). 불투명한 `foreign_ref`를 지니며,
export가 이 위에 투영한다.

```yaml
watched_target:
  target_id: caw05:tgt-mc-dla-novelty
  label: "MC-DLA memory-wall novelty claim"
  foreign_ref: "caw03://claim/CLM-2031"   # opaque; CAW-05 never reaches into CAW-03's store
  watchlist_topic: "Minsoo Rhu / MC-DLA / memory-wall line"
```

## 8. LedgerLink
감사 가능한 단일 edge `(Finding, WatchedTarget, relation, rationale, provenance)`; **append-only**, 스키마는
ADR-0005 §2.2로 고정됨(여기서는 data-layer 계약으로 재현됨).

```yaml
ledger_link:
  link_id: caw05:lnk-7f3a
  finding_ref: caw05:fnd-0c12
  verified_source_ref: caw05:src-9b…       # null if unverified
  target_ref: caw05:tgt-mc-dla-novelty
  relation: "novelty-threat | support | adjacent"   # noise is NEVER linked (discarded at triage)
  strength: { score: 0.0, basis: "title+abstract overlap vs target claim text" }
  rationale: "human-readable WHY this source bears on this target"
  evidence_locator: "p.4 §3.2 / fig 2 / abstract"   # concrete pointer INTO the source, never the summary
  generated_summary_ref: "caw05:sum-… | null"        # kind=generated-summary, NEVER the backing
  provenance: { … as §2 (+ verification_status) … }
  review_status: "proposed | confirmed | rejected"
  superseded_by: "caw05:lnk-… | null"      # corrections add a row, never mutate
```

## 9. Digest
주간 synthesize된 아티팩트(markdown-first, ADR-0001). 다섯 가지 FormatRenderer 출력 중 하나이며, digest가
기본값이다. finding/link를 참조할 뿐 — 다시 저장하지 않는다.

```yaml
digest:
  digest_id: caw05:dig-2026-26
  run_id: caw05:run-2026-26
  format: "digest"   # memo | digest | slide-outline | paper-card | action-brief
  window: { from: "<RFC3339>", to: "<RFC3339>" }
  sections:
    - { relevance_class: "novelty-threat", finding_refs: ["caw05:fnd-0c12"], link_refs: ["caw05:lnk-7f3a"] }
  rendered_path: "digests/2026-26.md"   # markdown body; generated prose is marked (not evidence)
  provenance: { … as §2 … }
```

## 10. ExportBundle
제품 경계를 넘는 유일한 것으로, ExportAdapter port(ADR-0007)를 통한다. **confirmed** LedgerLink들의 투영이며,
서명되고(signed), idempotent하다. Envelope는 [related-work-ledger research §4](../02-research/related-work-ledger_ko.md)
및 ADR-0007을 따른다.

```json
{
  "contract_version": "1.0.0",
  "boundary_kind": "caw05-signal",
  "source_product": "CAW-05",
  "produced_at": "<RFC3339>",
  "producer_run_id": "caw05:run-2026-26",
  "declared_boundary": "public",
  "idempotency_key": "hash(finding_id + target + classification_version)",
  "payload_sha256": "<hash of canonicalized payload>",
  "signature": "<scheme TBD — align across family>",
  "payload": { "signals": [ /* one per exported LedgerLink; raw_summary tagged generated, not evidence */ ] }
}
```

대상(Targets): CAW-02 (Source/Claim/RelatedWork), CAW-03 (novelty RadarSignal), CAW-01/CAW-06 (open questions).
signal별 `related_to`는 WatchedTarget의 `foreign_ref`를 지니므로 각 소비자는 자신의 namespace에서 id를 본다.

## Open Questions
- TODO(open-question: `task`/`experiment` routing은 자체 영속 엔티티를 갖는가, 아니면 CAW-01/CAW-06 계약이
  굳어질 때까지 Digest에만 존재하는가? — ADR-0004 참조.)
- TODO(open-question: ExportBundle의 signature 필드 scheme — CAW-02(minisign/cosign/DSSE)와 정렬, ADR-0007.)
- TODO(open-question: dedup 메모리 + 감사를 위해 유지되는 `discard` tombstone의 retention/TTL — ADR-0004/0006.)
- [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) 참조 (생성 예정).

## Runbook에 대한 함의(Implications)
- **RB (store):** 각 엔티티를 그 path/identity에 materialize(storage-and-scheduling §layout); `LedgerLink`/
  `Finding`에 append-only 강제(수정은 `superseded_by`를 통해, 절대 mutation 아님).
- **RB (schema validation):** origin/retrieved_at/boundary가 빠진 레코드를 거부하는 공유 `provenance`
  validator; `rationale_note.evidence`가 항상 `false`인지 확인하는 검사.
- **RB (model fixtures):** index-rebuild 및 export negative test를 위한 엔티티별 golden JSON/YAML fixture.
