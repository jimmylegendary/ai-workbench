# 소스 & 클레임 수집 (Source & Claim Ingestion)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF_ko.md), [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS_ko.md)
  - [./hypothesis-and-uncertainty.md](../05-ttt-research-core/hypothesis-and-uncertainty_ko.md) (추출된 클레임의 소비자 — 아직 작성되지 않았다면 TODO)
  - [../01-decisions/ADR-0005-source-and-claim-ingestion.md](../01-decisions/ADR-0005-source-and-claim-ingestion_ko.md) (이 결정에 대한 권위 문서 — 작성 예정; 브리프 §10)
  - [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적
이 문서는 **CAW-06이 공개 TTT 연구를 어떻게 발견하고, 거기서 검증 가능한 클레임을 추출하며, CAW-05(별개의 제품)로부터
TTT 레이더 신호를 가져오고, 모든 입력에 걸쳐 중복을 제거하며, 이 모든 것을 ports & adapters 경계 뒤에 노출하는가**
(`SourceAdapter` + `CAW05ImportAdapter`)를 결정한다. 브리프 §5(소스 발견 → 클레임 추출 단계), §8(CAW-05 import 경계),
§9(`SourceAdapter` v1 = arXiv/Semantic Scholar + CAW-05 import; 나머지는 stub)을 구체화한다. 이 문서는 hypothesis 생성/
uncertainty 태깅(별도 문서/ADR), small-experiment ledger, writeback-traffic 스키마, CAW-01/CAW-02로의 export는
결정하지 **않는다**. 절대 깨뜨려서는 안 되는 하중을 견디는(load-bearing) 제약은 다음과 같다(브리프 §5, §12): **소스, 클레임,
생성된 결론은 분리된 채로 유지된다; 생성된 요약(summary)은 결코 evidence가 아니다; hypothesis는 결코 확정된 클레임이
아니다.** 수집(Ingestion)은 **출처(provenance)를 가진 소스와 후보 클레임**을 산출한다 — 여기서 그 무엇도 진실을 주장하지 않는다.

## 1. 설계 맥락
CAW-06의 가치 단위는 하나의 추적된 연구 스레드 `source → claim → hypothesis → small experiment → result →
implication`이다(브리프 §2). 수집은 그 첫 한 홉 반을 담당한다: **소스를 들여오고, 각 소스를 hypothesis 단계가 집어들 수
있는 하나 이상의 *후보 클레임(candidate claim)*으로 바꾸는 것**이다. 두 개의 입력 채널이 이를 공급한다:

1. **공개 연구 발견** — arXiv + Semantic Scholar(브리프 §9 v1), TTT 테마(브리프 §6)로 좁혀짐:
   추론(inference) 중에 **write back**하는(가중치, fast weights, optimizer state, KV/memory를 업데이트하는)
   test-time training / test-time compute 변형들. 스키마에 동기를 부여하는 grounding 예시들(공개되고 실제인 작업,
   지지된(endorsed) 클레임은 *아님*): TTT layers / TTT-Linear / TTT-MLP (Sun et al., 2024), "The Surprising
   Effectiveness of TTT for Few-Shot Learning" (arXiv:2411.07279), 테스트 시점에 가중치를 업데이트하는 Titans
   neural long-term memory, "Test-Time Training Done Right" (arXiv:2505.23884). 이들은 **쿼리를 위한 씨앗(seed)**이지
   고정된 코퍼스가 아니다.
2. **CAW-05 import** — CAW-05(트렌드/레이더 제품으로, 자체 저장소를 가진 *별개의 제품*)는 CAW-06을 위한 open
   question/task를 제안하는 `action-brief` 아티팩트를 방출한다(CAW-05 ADR-0007 / digest-outputs §"five formats").
   우리는 명시적인 파일/API 경계를 가로질러 이를 가져온다 — **공유 저장소 없음**(브리프 §8).

이 문서는 CAW-05의 `source-ingestion.md`의 CAW-06 형제 문서이다; 우리는 가족(family)이 일관되게 유지되도록
의도적으로 **그 `SourceAdapter` 형태를 재사용**하지만, CAW-06의 어댑터는 그 자신의 것이다 — 독립성 계약(컨벤션 §8).

## 2. 수집 파이프라인 (단계)
파이프라인은 선형적이고, 멱등(idempotent)하며, 재개 가능(resumable)하다; 각 단계는 하나의 책임과 타입이 지정된 출력을 가진다.

| Stage | Input | Output | Responsibility | Must NOT |
|---|---|---|---|---|
| S1 Discover | `SourceQuery` + `FetchCursor` | `RawSource[]` | `SourceAdapter`를 통해 새로운/업데이트된 공개 항목을 pull; rate limit 준수; 커서 전진 | 분류, 진실 판단, 클레임 추출 |
| S2 Import | CAW-05 export bundle | `RawSource[]` (origin=`caw05`) | 경계를 가로질러 CAW-05 `action-brief` → CAW-06 `RawSource`로 적응 | CAW-05 *summary*를 evidence로 취급 |
| S3 Canonicalize + Dedup | `RawSource[]` | `Source` (중복 제거됨) + `provenance[]` | identity 해소(DOI ▸ arXiv id ▸ norm title); 다중 출처를 하나의 `Source`로 병합 | provenance 누락; arXiv 버전을 조용히 합치기 |
| S4 Extract claims | `Source` | `CandidateClaim[]` | span + locator를 가진 원자적이고 귀속 가능한 진술을 추출; `claim_type` 태깅; 기본 `status=unverified` | 클레임을 지어내기; 클레임이 참이라고 주장 |
| S5 Persist | `Source`, `CandidateClaim[]` | CAW-06 자체 저장소의 파일들 | provenance가 찍힌 레코드 작성; 생성된 텍스트를 `evidence:false`로 표시 | 공개 소스 텍스트와 내부 클레임을 섞기 |

hypothesis 단계(별도 문서)는 `CandidateClaim` 레코드를 읽는다; 수집은 S5에서 멈춘다. `CandidateClaim`은
hypothesis가 **아니고** 검증된 클레임도 **아니다** — 그것은 "그 논문이 X라고 *말한다*"는 것으로, 귀속되고 위치가
지정되며, hypothesis/experiment 단계가 그것에 작용하기 전까지 `status=unverified`이다.

### 2.1 클레임 추출 상세 (S4)
각 `Source`는 0개 이상의 `CandidateClaim`을 산출한다. 추출은 LLM의 도움을 받지만 **추출적(extractive) + 귀속
가능하도록 제약되며**, 결코 생성된 것을 evidence로(generative-as-evidence) 삼지 않는다:

- **원자성(Atomicity):** 클레임당 하나의 검증 가능한 주장("TTT-Linear는 토큰당 하나의 gradient step으로 fast
  weights를 업데이트한다"는 하나의 클레임이다; 한 문단은 아니다).
- **Locator + span:** 모든 클레임은 `source_locator`(섹션/그림/페이지 또는 텍스트 오프셋)와 그것이 끌어내어진
  축자적(verbatim) `evidence_span`을 지녀서, 리뷰어가 클레임 → 정확한 소스 텍스트를 추적할 수 있게 한다(브리프 §12 분리).
- **TTT 렌즈를 위한 타이핑:** `claim_type ∈ {mechanism, quantitative-result, capability, efficiency,
  memory-traffic, reproducibility}`. `memory-traffic`은 CAW-01 브리지를 위한 하중을 견디는 타입이다 — 가중치
  업데이트, gradient, optimizer-state residency, write bandwidth/endurance, updated-weight 재사용에 관한 클레임.
- **Writeback 플래그:** `writes_back: bool | unknown` — 이 변형이 추론 중에 실제로 state를 수정하는가?
  기본값 `unknown`; 브리프는 "어떤 TTT 변형이 실제로 write back하는지 검증하라"(§6)를 미해결로 명시적으로 표시한다.
- **추출 시점의 uncertainty:** 모든 클레임은 `status=unverified`이고 생성된 어떤 의역(paraphrase)이든
  `evidence:false`이다; `evidence_span`(축자적)만이 소스 텍스트로 취급된다. 추출은 결코 `supported`를 설정하지 않는다.

## 3. 중복 제거 (S3)
세 가지 identity 계층으로, CAW-05의 canonicalization 순서를 재사용하여 제품 간 dedup이 합성(compose)되도록 한다:

1. **소스 내부(Intra-source):** 네이티브 id(arXiv id+version, Semantic Scholar `paperId`, CAW-05 `finding_id`).
2. **소스 간 identity(Cross-source identity):** **DOI ▸ arXiv id ▸ normalized(title+first-author+year)**로
   canonicalize한다. arXiv에서 발견되고, Semantic Scholar로 보강되며, CAW-05 action-brief로 다시 도착한 논문은
   세 개의 `provenance` 항목을 가진 **하나의 `Source`**이다 — 세 개의 소스가 아니다.
3. **클레임 수준 dedup:** `Source` 내부에서, 거의 중복인 클레임(normalized text에 대한 cosine + 동일한
   `source_locator`)은 병합된다; 소스 간에는 동일한 클레임이 연결되되 별도의 provenance를 유지한다.

규칙: arXiv **버전**은 구별하되 연결한 채로 유지한다(v2가 새로운 정량적 클레임을 담을 수 있음). 해싱 전에 URL을
정규화한다(트래커 제거, 리다이렉트 해소). **이미 직접 발견한 논문에 대해 CAW-05가 도착해도 새 소스를 만들지 않는다**
— 그것은 `provenance{origin:"caw05"}` 항목을 추가하고 해당 스레드의 우선순위를 올릴 수 있다.

## 4. Ports & adapters 설계
브리프 §9: 설정 기반 레지스트리 + 문서화된 stub. 코어는 `SourceAdapter` Protocol에 의존한다; 각 입력 가족은 교체
가능한 어댑터이다. CAW-05 import 자체가 하나의 `SourceAdapter`(origin `caw05`)여서 파이프라인은 하나의 균일한
경로를 가진다 — 발견(discovery)과 import는 코어 코드가 아니라 어댑터에서만 다르다.

```python
# Capability descriptor advertised to the registry/scheduler.
@dataclass(frozen=True)
class SourceCapabilities:
    family: str                 # "arxiv" | "semantic_scholar" | "caw05_import" | "github" | ...
    supports_incremental: bool  # can resume from a watermark/cursor
    supports_full_text: bool    # returns body text vs metadata-only
    requires_auth: bool
    rate_limit: RateLimitSpec   # max_calls, per_seconds, concurrency, backoff
    legal_mode: str             # "api" | "publisher_feed" | "metadata_only_link" | "internal_import"

@dataclass(frozen=True)
class FetchCursor:               # opaque, persisted by the core between runs
    watermark: str | None        # ISO date, OAI resumptionToken, last-imported CAW-05 bundle id
    extra: dict[str, str]

@dataclass(frozen=True)
class RawSource:                 # adapter output; normalized, NOT classified, NOT yet claim-extracted
    source_native_id: str        # arXiv id / paperId / caw05 finding_id
    canonical_id: str | None     # DOI ▸ arXiv id ▸ normalized title (cross-source dedup)
    title: str
    url: str                     # origin (provenance)
    authors: list[str]
    published_at: datetime | None
    updated_at: datetime | None
    summary_or_body: str | None  # abstract / metadata; generated text marked evidence:false downstream
    body_is_full_text: bool
    theme_tags: list[str]        # e.g. ["ttt", "test-time-compute", "writeback"] — discovery hint only
    provenance: Provenance       # origin, retrieved_at, source_native_id, boundary="public", trust
    raw: dict                    # source-native payload for audit/reprocessing

class SourceAdapter(Protocol):
    def capabilities(self) -> SourceCapabilities: ...
    def fetch(self, query: SourceQuery, cursor: FetchCursor | None
              ) -> tuple[Iterable[RawSource], FetchCursor]:
        """Pull new/updated items since `cursor`. MUST respect rate_limit, return an
        advanced cursor, and raise typed RateLimited/Unauthorized/SourceUnavailable
        rather than swallow."""
    def healthcheck(self) -> HealthStatus: ...
```

계약 의무(모든 어댑터가 반드시 준수 — CAW-05를 미러링하여 가족이 합성되도록):
1. **멱등 + 증분(Idempotent + incremental)** — 동일한 커서 ⇒ 다운스트림 중복 없음; 항상 전진된 커서를 반환.
2. **어댑터 내부의 Rate-limit & backoff** (arXiv = 단일 연결 1 req / 3 s; Semantic Scholar는 ToS상
   exponential backoff 요구).
3. **Legal mode 준수** — `metadata_only_link`는 fair-use 스니펫을 넘어선 재현된 full text를 결코 저장하지 않음;
   공개 소스만(브리프 §12).
4. **Provenance 완전성** — origin URL + `retrieved_at` + 네이티브 id + `boundary` 없는 `RawSource`는 없음.
5. **타입이 지정된 실패** — 일시적(재시도 가능) vs 종료적(auth/ToS)이어서 스케줄러가 반응할 수 있도록.
6. **어댑터 내부에서 클레임 추출 / 랭킹 없음** — 어댑터는 얇게 유지; S4가 추출을 소유.

### 4.1 v1 어댑터와 문서화된 stub (브리프 §9)
| Adapter | Status | Mechanism | Notes |
|---|---|---|---|
| `ArxivAdapter` | **v1** | Query API (Atom) + 카테고리별 RSS (`cs.LG`, `cs.AR`, `cs.CL`, `cs.DC`), TTT 키워드/저자 쿼리 | 엄격한 3 s limiter; abstract+metadata; 링크로 PDF |
| `SemanticScholarAdapter` | **v1** | Academic Graph REST (`/paper/search`, `/paper/{id}`, citations) | 보강 + citation cross-ref; backoff 필수; `externalIds`로 cross-ref |
| `CAW05ImportAdapter` | **v1** | CAW-05 export bundle 읽기(file drop / fetch endpoint) → `RawSource(origin="caw05")` | 경계 import; §5 참조 |
| `GithubAdapter` | **stub** | TTT 참조 구현을 위한 Atom feeds + REST | 등록됨, `fetch()` 비어있음, health = "deferred" |
| `BlogRssAdapter` | **stub** | lab/company RSS allow-list | 이후 슬라이스로 연기 |
| `HackerNewsAdapter` | **stub** | Algolia API, metadata+link | 인접 확인(adjacent-confirmation)만 |

설정: `sources.yaml` 레지스트리가 `family → adapter + query + schedule`을 바인딩하여, 가족이 코어 변경 없이
플러그인된다. stub은 `SourceAdapter` + `capabilities()`를 구현하지만 문서화된
`HealthStatus = "blocked/deferred: <reason>"`와 함께 빈 `fetch()`를 반환한다(브리프 §9 문서화된 stub 패턴,
CAW-03/04/05와 동일).

## 5. CAW-05 import 형태 (경계 계약)
CAW-05는 **별개의 제품**이다; 우리는 그것의 저장소를 결코 건드리지 않는다. 우리는 그것의 **`action-brief`**
export를 가져온다 — CAW-05가 명시적으로 "CAW-01 / CAW-06 (open questions)"로 라우팅하는 형식이다(CAW-05
digest-outputs §"five formats", ADR-0007). 전송 매체는 file drop 또는 pull endpoint로 전달되는 서명된 JSON
번들이다; CAW-06은 이를 **읽기 전용, 공개, provenance를 지님, 그리고 비-증거적(NON-evidential)**으로 취급한다
(CAW-05의 종합(synthesis) 산문은 `evidence:false`이다).

예상 import 번들(CAW-06은 이 필드들만 읽음; 추가 필드에 관대 — 코어가 아니라 어댑터가 형태를 소유):
```jsonc
{
  "schema": "caw05.action-brief/v1",         // versioned; CAW06ImportAdapter pins major
  "bundle_id": "caw05-2026-W26-0007",         // dedup + import watermark
  "finding_id": "caw05-finding-abcd1234",     // CAW-05 native id → our source_native_id
  "title": "TTT variant updates fast weights per token during inference",
  "canonical_id": "arXiv:2505.23884",         // DOI/arXiv id when CAW-05 resolved one → cross-source dedup
  "provenance": {                              // CAW-05's auditable manifest (brief: provenance, not prose)
    "origin": "https://arxiv.org/abs/2505.23884",
    "retrieved_at": "2026-06-25T12:00:00Z",
    "boundary": "public",
    "trust": "…",
    "classification": "novelty-threat",        // CAW-05 taxonomy — a HINT to us, not a verdict
    "relevance": 7.4                            // CAW-05 explainable score — priority hint only
  },
  "open_question": "Does this variant's write traffic differ from read-dominant serving?",
  "summary": "…generated synthesis…",          // evidence:false; reading aid only
  "evidence": false                            // mandatory marking carried through
}
```

CAW-06으로의 매핑 (`CAW05ImportAdapter.fetch`):
- `finding_id → RawSource.source_native_id`; `canonical_id`는 dedup(S3)으로 곧장 전달된다 — 이미 가지고 있는
  arXiv 논문에 대한 CAW-05 import는 기존 `Source`에 새로운 `provenance{origin:"caw05"}` 항목으로 병합된다.
- `open_question`은 **`status=unverified`와 `writes_back=unknown`을 가진 `mechanism`/`memory-traffic` 타입의
  씨앗 `CandidateClaim`**이 된다 — 결코 `supported`가 아니다. CAW-05의 `classification`/`relevance`는
  **우선순위 힌트로만** 따라오며, 결코 진실 verdict가 아니다(브리프 §12: 제품들의 판단을 절대 혼동하지 말 것).
- `summary`는 `evidence:false`로 저장된다; `provenance.origin`만이 다운스트림에서 인용 가능하다.
- `bundle_id`는 `FetchCursor`의 import watermark이다(멱등 재-import).

import가 절대 해서는 안 되는 것: CAW-05의 종합을 evidence로 취급; CAW-05의 `classification`을 확정된 클레임으로
취급; 어떤 CAW-05 저장소에든 손을 뻗기; 또는 공유 기반(substrate)을 가정. `schema` major 버전이 알려지지 않은
경우, 어댑터는 추측하기보다 타입이 지정된 `SourceUnavailable("unsupported caw05 schema")`를 raise한다.

## Open Questions
- `TODO(open-question: confirm CAW-05's action-brief wire schema + delivery (file drop vs pull endpoint) with CAW-05's ADR-0007 — fields above are our expected shape, to be reconciled at the boundary)`.
- `TODO(open-question: which TTT variants actually write back during inference? — brief §6; drives the writes_back flag and the memory-traffic claim_type. Needs the first research run to populate)`.
- `TODO(open-question: claim-extraction method — single LLM extract+attribute pass vs a verify pass that re-checks each claim against its evidence_span; what false-claim rate is acceptable before review?)`.
- `TODO(open-question: do we need arXiv full text (PDF/source) for memory-traffic claim extraction, or is abstract+metadata enough for v1 candidate claims?)`.
- `TODO(open-question: Semantic Scholar — pursue an API key for >1 RPS, or stay on the shared unauth pool for v1 volume?)`.
- `TODO(open-question: dedup tie-breaks when CAW-05 canonical_id disagrees with our directly-discovered id — which wins?)`.
- [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) 참조.

## 런북에 대한 시사점 (Implications for runbooks)
- **RB (v1 discovery adapters):** `ArxivAdapter`(query API + RSS, 3 s limiter, TTT 씨앗 쿼리)와
  `SemanticScholarAdapter`(보강 + citation cross-ref, backoff 필수)를 구현. 각각 6개의 계약 의무를 통과;
  어댑터 내부에 클레임 추출 없음.
- **RB (CAW-05 import adapter):** `caw05.action-brief/v1` 번들을 읽는 `CAW05ImportAdapter`를 구현 →
  `RawSource(origin="caw05")`; schema major 고정; `bundle_id` watermark; `open_question` → 씨앗
  `CandidateClaim(status=unverified, writes_back=unknown)` 매핑; `evidence:false` 전달; 알려지지 않은 schema에
  대해 타입이 지정된 오류 raise. **공유 저장소 없음** — file drop / pull endpoint만.
- **RB (canonicalize + dedup):** DOI ▸ arXiv id ▸ normalized title; 다중 출처를 여러 provenance 항목을 가진
  하나의 `Source`로 병합; arXiv 버전은 구별하되-연결한 채로 유지; 클레임 수준 near-dup 병합.
- **RB (claim extraction S4):** `evidence_span`, `source_locator`, `claim_type`, `writes_back`,
  `status=unverified`를 가진 원자적 `CandidateClaim`을 산출하는 추출적 + 귀속 가능한 추출기; 생성된 의역은
  `evidence:false`로 표시. 단위 테스트는 축자적 span + locator 없이는 어떤 클레임도 방출되지 않음을 확인.
- **RB (persist + registry):** provenance가 찍힌 `Source` + `CandidateClaim` 레코드를 CAW-06 자체 저장소에
  작성; `sources.yaml` 레지스트리가 가족을 바인딩; `Github`/`BlogRss`/`HackerNews`를 `HealthStatus="deferred"`인
  문서화된 stub으로 등록. 각 수락 체크포인트에서 트리를 green으로 유지.
