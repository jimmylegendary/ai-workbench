# ADR-0005: SourceAdapter 포트 뒤에서의 소스 탐색 및 주장(claim) 수집

- **Status:** proposed
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF_ko.md) (§5 단계, §8 CAW-05 import, §9 SourceAdapter, §12 분리)
  - [../02-research/source-and-claim-ingestion_ko.md](../02-research/source-and-claim-ingestion_ko.md) (권위 있는 설계 서술)
  - [../02-research/ttt-landscape_ko.md](../02-research/ttt-landscape_ko.md) (어떤 변형이 write back 하는가 — TTT 쿼리 렌즈의 시드)
  - [./ADR-0002-hypothesis-representation_ko.md](./ADR-0002-hypothesis-representation_ko.md) (이 ADR가 공급하는 `Claim`/`Hypothesis`/`Evidence` 분리)
  - [./ADR-0006-implication-mapping_ko.md](./ADR-0006-implication-mapping_ko.md), [./ADR-0007-storage-and-scheduling_ko.md](./ADR-0007-storage-and-scheduling_ko.md), [./ADR-0008-export-boundaries_ko.md](./ADR-0008-export-boundaries_ko.md)
  - [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Context

CAW-06의 가치 단위는 `source → claim → hypothesis → small experiment → result → implication`이라는 한 줄기(thread)다
(brief §2). 이 ADR은 그 줄기의 **첫 번째 홉과 절반**을 고정한다: 공개된 TTT 연구를 받아들이고, CAW-05(별도 제품)로부터
TTT 레이더 신호를 import 하며, 양쪽에 걸쳐 중복을 제거하고, **후보 주장(candidate claims)**을 추출하는 것 — 이 모두가
포트 & 어댑터 이음새(seam) 뒤에서 이루어진다. 이는 brief §5(탐색 → 추출 단계), §8(CAW-05 import 경계),
§9(`SourceAdapter` v1 = arXiv/Semantic Scholar + CAW-05 import; 나머지는 stub)에 바인딩된다.

힘(forces):
- **과대 주장 금지(no overclaim, brief §12, 핵심):** 소스, 주장, 생성된 결론은 구조적으로 분리된 상태를 유지해야 한다.
  생성된 요약은 결코 증거가 아니다. `CandidateClaim`은 "그 논문이 X라고 *말한다*"이며, 출처가 명시되고 위치가 지정된 것 —
  결코 verdict가 아니다. 수집(ingestion)은 어떤 것도 참이라고 단언하지 않는다.
- **독립성(Independence, conventions §8):** CAW-05는 자체 저장소를 가진 별도 제품이다. 우리는 명시적인
  파일/API 경계를 넘어 import 하며, **공유 저장소, 레지스트리, 런타임은 없다**. 우리는 패밀리 일관성을 위해 CAW-05의
  `SourceAdapter` *형태*를 재사용하지만, 어댑터 자체는 CAW-06 고유의 것이다.
- **패밀리 일관성(brief §9):** 설정 기반 레지스트리 + 문서화된 stub, CAW-03/04/05와 동일한 패턴.
- **멱등성(Idempotency):** ExperimentScout는 스케줄에 따라 실행된다(ADR-0007). 재실행 시 소스/주장이 중복되어서는 안 된다.

## Options considered

| Decision point | Option | Pros | Cons | Fit |
|---|---|---|---|---|
| Adapter seam | **하나의 `SourceAdapter` Protocol; CAW-05 import도 단지 또 하나의 어댑터** | 균일한 파이프라인; 단일 코드 경로; 탐색 vs import는 어댑터로만 구분 | CAW-05 번들 형태가 추상화를 약간 늘림 | **chosen** |
| | CAW-05 전용 import 서브시스템 분리 | 번들에 맞춤화됨 | 두 번째 코드 경로; 패밀리에서 벗어남 | rejected |
| Dedup identity | **DOI ▸ arXiv id ▸ normalized(title+author+year)**; 여러 origin을 하나의 `Source`로 병합(여러 `provenance` 보유) | CAW-05 정규화(canonicalization)와 조합됨; 제품 간 dedup 작동 | 정규화 경계 케이스 | **chosen** |
| | 네이티브 id만 사용 | 단순함 | 3개 origin에서 온 같은 논문 = 3개 소스 | rejected |
| Claim extraction | **추출적 + 출처추적 가능(Extractive + attributable)** (verbatim `evidence_span` + `source_locator`), `status=unverified`, LLM 보조이되 결코 생성물을 증거로 삼지 않음 | 추적 가능; §12 강제; 리뷰어가 claim→소스 텍스트 검증 가능 | 종합(synthesis)이 필요한 주장은 놓침 | **chosen** |
| | 자유로운 LLM 요약을 주장으로 | 더 풍부함 | 생성된 텍스트가 증거로 둔갑 — §12 위반 | rejected |
| Adapter scope | **얇은 어댑터(Thin adapters)** (fetch + provenance + rate-limit만; 어댑터 내에서 추출/랭킹 없음) | 교체 가능; 테스트 가능; S4가 추출 담당 | 코어 코드 증가 | **chosen** |

## Decision

1. **하나의 파이프라인, 다섯 단계, 멱등적 + 재개 가능(brief §5):** S1 Discover → S2 Import (CAW-05) →
   S3 Canonicalize+Dedup → S4 Extract claims → S5 Persist. 각 단계는 하나의 책임과 타입이 지정된 출력을 가진다.
   수집은 **S5에서 멈추며** hypothesis 단계(ADR-0002)에 결코 진입하지 않는다.
2. **`SourceAdapter` Protocol이 유일한 탐색/import 이음새다.** 코어는 Protocol에 의존하며, 모든 입력 패밀리는
   (CAW-05 import 포함) `SourceCapabilities`를 광고하고 여섯 가지 계약 의무를 준수하는 교체 가능한 어댑터다:
   멱등적 + 증분적(`FetchCursor`를 전진시킴); rate-limit & backoff를 어댑터 내부에서 처리; legal-mode 준수
   (공개적이고 ToS-safe한 것만, brief §12); provenance 완비(origin URL + `retrieved_at` + 네이티브 id +
   `boundary`); 타입이 지정된 실패(재시도 가능 vs 종료성); **어댑터 내부에서 claim 추출이나 랭킹 없음**.
3. **v1 어댑터:** `ArxivAdapter`(Query API + 카테고리별 RSS, 엄격한 3초 제한기, TTT 시드 쿼리),
   `SemanticScholarAdapter`(보강 + citation 상호참조, 필수 지수 backoff),
   `CAW05ImportAdapter`(`caw05.action-brief/v1` 번들을 파일 드롭 / pull 엔드포인트로 읽음).
   **문서화된 stub:** `GithubAdapter`, `BlogRssAdapter`, `HackerNewsAdapter` — Protocol을 구현하되 빈
   `fetch()`를 반환하고 `HealthStatus="deferred: <reason>"`. `sources.yaml` 레지스트리가 `family → adapter +
   query + schedule`을 바인딩하여 코어 변경 없이 패밀리를 끼워넣는다.
4. **Dedup (S3):** **DOI ▸ arXiv id ▸ normalized(title+first-author+year)**로 정규화하고, 여러 origin을
   **여러 `provenance` 항목을 가진 하나의 `Source`로** 병합한다. arXiv **버전**은 구별하되 연결된 채로 유지하고,
   소스 내에서 주장 수준의 근사 중복(near-dup)을 병합한다. 이미 탐색된 논문에 대한 CAW-05 import는
   `provenance{origin:"caw05"}` 항목을 추가하며(줄기 우선순위를 높일 수 있음), 새 소스를 **생성하지 않는다**.
5. **Claim extraction (S4):** 각 `Source`는 0개 이상의 원자적(atomic) `CandidateClaim`을 산출하며, 각각은 verbatim
   `evidence_span`, `source_locator`, `claim_type ∈ {mechanism, quantitative-result, capability, efficiency,
   memory-traffic, reproducibility}`, `writes_back: bool|unknown` 플래그(기본값 `unknown`, brief §6), 그리고
   `status=unverified`를 담는다. 생성된 의역(paraphrase)은 `evidence:false`로 표시된다. 추출은 결코 `supported`를
   내지 않으며, span+locator 없이 주장을 만들어내지 않는다.
6. **CAW-05 경계 계약:** **`action-brief`** export만 import 한다(CAW-05가 "CAW-01/CAW-06 open questions"로
   라우팅하는 포맷). 읽기 전용, 공개적, provenance를 지니며 **비증거적(non-evidential)**으로 취급된다(CAW-05의
   종합 산문은 `evidence:false`). `open_question`은 `mechanism`/`memory-traffic` 타입의 **시드 `CandidateClaim`**이
   되며, `status=unverified`, `writes_back=unknown` — 결코 `supported`가 아니다. CAW-05의
   `classification`/`relevance`는 **우선순위 힌트로만** 동반되며, 결코 진리 verdict가 아니다. `bundle_id`는
   import 워터마크다. 알 수 없는 `schema` major는 타입이 지정된 `SourceUnavailable`을 일으키며, 결코 추측하지 않는다.

## Consequences

- **쉬움:** 새 소스 패밀리 추가(어댑터 작성, `sources.yaml`에 등록); 어떤 주장이든 정확한 소스 텍스트로 역추적;
  스케줄된 scout를 안전하게 재실행(멱등적 cursor); CAW-05의 정규화와 dedup 조합.
- **어려움 / 감수하는 비용:** 소스 간 종합이 필요한 주장은 S4 범위 밖이다(hypothesis 단계, ADR-0002가 주장 간 추론
  수행); 전문(full-text) 주장 추출은 PDF fetch가 필요할 수 있음(open question); 추출적 규율은 과대 주장 제로를
  대가로 낮은 recall을 의미한다.
- **후속:** ADR-0007은 `Source` + `CandidateClaim` 레코드를 영속화하고(markdown/JSON, provenance 스탬프) 탐색
  어댑터를 스케줄링한다; ADR-0002는 `CandidateClaim`을 `Hypothesis`/`Evidence`로 소비한다; `memory-traffic`
  `claim_type` + `writes_back` 플래그는 writeback-traffic 스키마(ADR-0004)와 CAW-01 export(ADR-0008)로 공급된다.

## Open questions / revisit triggers

- `TODO(open-question: confirm CAW-05's action-brief wire schema + delivery (file drop vs pull endpoint) against CAW-05's own ADR-0007; fields are our expected shape, reconcile at the boundary)`.
- `TODO(open-question: which TTT variants actually write back during inference? — brief §6; drives writes_back + the memory-traffic claim_type; needs the first research run)`.
- `TODO(open-question: claim-extraction method — single extract+attribute pass vs a verify pass re-checking each claim against its span; acceptable false-claim rate before review?)`.
- `TODO(open-question: is abstract+metadata enough for memory-traffic claim extraction, or is arXiv full text/PDF required for v1?)`.
- `TODO(open-question: Semantic Scholar API key for >1 RPS vs the shared unauth pool for v1 volume?)`.
- `TODO(open-question: dedup tie-break when CAW-05 canonical_id disagrees with our directly-discovered id — which wins?)`.
- **재검토 시점:** 비-API 소스(전문 스크레이핑)가 필요할 때(legal-mode 검토), 또는 두 번째 import 제품이 등장할 때
  (CAW-05를 넘어 import 계약을 일반화).
