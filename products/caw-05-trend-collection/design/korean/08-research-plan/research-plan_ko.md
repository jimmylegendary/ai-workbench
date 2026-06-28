# Research Plan — 레이더 구축 전/중에 열어둔 트랙들

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./open-questions_ko.md](./open-questions_ko.md) (이 계획이 일정을 잡는 추적 질문 레지스터)
  - [./validation-and-tests_ko.md](./validation-and-tests_ko.md) (해소된 각 트랙을 어떻게 증명하는가)
  - [../01-decisions/ADR-0002-interest-model.md](../01-decisions/ADR-0002-interest-model_ko.md)
  - [../01-decisions/ADR-0003-source-adapters-and-ingestion.md](../01-decisions/ADR-0003-source-adapters-and-ingestion_ko.md)
  - [../01-decisions/ADR-0004-classification-and-triage.md](../01-decisions/ADR-0004-classification-and-triage_ko.md)
  - [../01-decisions/ADR-0005-related-work-ledger.md](../01-decisions/ADR-0005-related-work-ledger_ko.md)
  - [../01-decisions/ADR-0006-storage-and-scheduling.md](../01-decisions/ADR-0006-storage-and-scheduling_ko.md)
  - [../01-decisions/ADR-0007-export-boundaries.md](../01-decisions/ADR-0007-export-boundaries_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
이 문서는 narrow weekly radar가 올바르게 출시되도록 CAW-05가 해소해야 하는 **열린 연구/spike 트랙**의 일정을
잡는다 — 각 트랙은 소유 ADR, 빌드 단계, 그리고 test plan이 검사할 수 있는 **exit criterion**에 묶여 있다. 이 문서는
ADR이 고정한 것을 **재결정하지 않으며**(그들의 open question을 작업으로 구체화할 뿐) 테스트 메커니즘을
**명시하지 않는다**([validation-and-tests_ko.md](./validation-and-tests_ko.md) 참조). 지배적 제약은 brief의 고정된
조각들이다: **watch list에서의 high recall**, **legal/ToS-safe 소스만**, **생성된 요약은 결코 증거가 아님**,
**문서화된 stub을 갖춘 ports & adapters**, 그리고 **shared store 없는 export 경계**. 측정되지 않은 벤치마크 숫자를
주장하는 것으로는 어떤 트랙도 닫을 수 없다 — 아래의 모든 threshold는 eval이 산출할 때까지 `TODO(open-question)`이다.

## Phasing (트랙이 붙는 빌드 순서)
| Phase | Theme | Gate to exit |
|---|---|---|
| **P0 Foundations** | storage layout, Run wrapper, ports, registry, preflight, cursor/dedup core | fake로 tree green; preflight가 stub/ToS-unsafe 연결을 거부 |
| **P1 Ingest (narrow)** | v1 core adapters (arXiv/S2/GitHub/blog-RSS) + HN-light; allow-list 검증 완료 | 실제 weekly window가 watch list를 수집 + dedup |
| **P2 Score & triage** | interest scorer + recall gate; LF→LLM→human cascade; review queue | eval set에서 recall floor + abstain-to-human이 입증 가능하게 유지됨 |
| **P3 Ledger & verify** | append-only ledger; S2 verification (Levenshtein + year gate) | weekly 재실행이 하나의 VerifiedSource를 산출; ambiguous는 사람에게 route |
| **P4 Synthesis & export** | 다섯 FormatRenderers; CAW-02/03/01/06로의 ExportAdapters; signing | bundle이 consumer intake에 대해 validate; evidence:false 유지 |
| **P5 Harden** | embedding lane (alpha) eval; calibration; SimHash 결정; heartbeat | 각 v1 이후 lane은 default-on 전에 자체 eval로 gate |

## Track register
각 트랙: **goal**, **소유 ADR/doc**, **phase**, **method (spike)**, **exit criterion / artifact**. ID는 안정적이며
[open-questions_ko.md](./open-questions_ko.md)에서 재사용된다.

### T1 — Source allow-list verification (feeds + repos)
- **Owning:** ADR-0003 · [../02-research/source-ingestion.md](../02-research/source-ingestion_ko.md) · **Phase P1**
- **Goal:** seed watch list(brief §6)를 구체적이고 **ToS-verified**된 `feeds.yaml`(lab/company 블로그 RSS)와
  MemOS, Chakra, MC-DLA/DeepStack, SECDA-DSE에 대한 canonical GitHub org/repo 집합으로 전환.
- **Method:** 각 후보 소스에 대해 publisher가 제공하는 feed가 존재함을 확인(스크래핑 없이);
  `legal_mode`(`api | publisher_feed | metadata_only_link`)와 `tos_class`를 기록; paper↔repo 링크를 교차
  확인하여 canonical repo URL을 해결. 안전한 접근 경로가 없는 소스는 제외.
- **Exit:** 모든 항목이 verified된 `legal_mode`를 갖는 커밋된 `feeds.yaml` + `sources.yaml` repo 블록;
  preflight 통과; **`metadata_only_link`로 표시된 항목은 재현된 전문을 저장하지 않음**(테스트
  [validation §Ingestion](./validation-and-tests_ko.md)로 검사).

### T2 — Semantic Scholar API key & rate posture
- **Owning:** ADR-0003 + ADR-0005 · **Phase P1 (ingest enrich) / P3 (verify)**
- **Goal:** weekly narrow volume를 고려할 때 v1이 keyed S2 client(~1 RPS, 요청 시 상향)를 추진할지 공유 unauth
  풀에 올라탈지 결정; S2는 enrichment(ADR-0003)와 verification(ADR-0005) 양쪽에 사용됨.
- **Method:** watch-list 크기 × adapter로 run당 S2 호출 예산을 추정; unauth 풀에 대해 backoff/cache를 load-test;
  weekly window가 공유 throttle 내에서 완료될 수 없으면 키를 요청.
- **Exit:** 문서화된 결정 + **필수 exponential backoff + cache**를 갖춘 동작하는 client가 429로 인한 데이터
  손실 없이 weekly verification 패스를 완료; 충족되지 않으면 failover 질문(Crossref/OpenAlex) 기록.
  `TODO(open-question: measured per-run S2 call count vs limit)`.

### T3 — Author / venue disambiguation
- **Owning:** ADR-0002 · [../02-research/interest-modeling.md](../02-research/interest-modeling_ko.md) · **Phase P2**
- **Goal:** 저자/venue interest(예: *Minsoo Rhu*)에 대해 `canonical_id`를 채워, 동명이인 false hit이나
  비소속 리포스트 없이 entity lane이 발화하도록.
- **Method:** seed 저자들에 대해 S2 `authorId` vs ORCID vs 이름 문자열 매칭을 spike; 동명이인 충돌을 측정;
  identifier 우선순위와 아무것도 해결되지 않을 때의 fallback을 선택.
- **Exit:** 각 저자/venue interest가 해결된 `canonical_id`(또는 명시적 `name-string-only` flag)를 지님;
  라벨링된 mini-set이 알려진 동명이인에 대해 entity lane이 발화하지 않음을 보임.
  `TODO(open-question: false-author-hit rate)`.

### T4 — Embedding-lane eval set (alpha)
- **Owning:** ADR-0002 · **Phase P5 (gated; lane은 P2에서 α=0으로 연결)**
- **Goal:** **라벨링된 eval set**에서 recall 이득 대 추가 불투명성/노이즈를 측정한 뒤에만, `α`를 올릴지(선택적
  embedding lane 활성화) 그리고 어떤 모델(로컬 vs API)을 쓸지 결정.
- **Method:** 라벨링된 relevance eval set 구축(아래 T-shared 참조); BM25-only vs BM25+embedding 실행;
  watch-list-adjacent 항목에서 recall과 precision 비용을 비교; 모델 선택을 legal/ToS + own-store 제약에 대해 검사.
- **Exit:** 직관이 아니라 **eval로 정당화된** 기록된 α(0일 수도 있음); eval이 순 recall 이득을 보일 때까지
  lane은 default-off 유지. [validation §Recall](./validation-and-tests_ko.md)와 짝.
  `TODO(open-question: embedding model + measured α)`.

### T5 — Classification thresholds & judge model
- **Owning:** ADR-0004 · [../02-research/classification-and-triage.md](../02-research/classification-and-triage_ko.md)
  · **Phase P2**
- **Goal:** 상수가 아니라 실제 데이터로부터 `τ_high` / `τ_low` / self-consistency `N`을 설정하고 LLM judge
  model + prompt를 선택; confidence calibration을 fit.
- **Method:** 첫 몇 주간 cascade를 shadow로 실행; Jimmy의 confirm/override 로그(≈50–100 라벨) 수집; 작은
  logistic calibration을 fit; ECE 추적; self-consistency 안정성을 위해 `N`을 sweep. model/prompt 선택은
  claude-api 결정과 교차한다(provider를 고정하기 전에 그것을 읽을 것).
- **Exit:** threshold + `N`을 triage profile config에 커밋(보수적으로 시작, override 로그에서 튜닝);
  calibration fit을 체크인; **불변식이 모든 config에서 유지됨**: rationale `evidence=false`와 `novelty-threat`는
  결코 silent-discard되지 않음. `TODO(open-question: initial τ/N values)`.

### T6 — `related_to` keying with CAW-03
- **Owning:** ADR-0005 + ADR-0007 · **Phase P4**
- **Goal:** CAW-05가 `related_to`를 **CAW-03 claim id**에 직접 키로 걸지, 아니면 CAW-03이 re-map하는 CAW-02
  concept/claim id에만 걸지 해결; 그리고 rename에 대해 `WatchedTarget.foreign_ref`를 누가 유지하는지.
- **Method:** CAW-03(별개 제품)과의 공동 설계 handshake — 그들의 open question을 반영; staleness-detection 검사
  (주기적 re-validation vs drift 수용)를 정의. shared store 없음; id는 export envelope에서 opaque URI로만 교차.
- **Exit:** 문서화된 keying 계약 + stale-ref 탐지 계획; export projection이 `WatchedTarget → foreign_ref`를
  매핑하여 consumer가 우리의 내부 id를 결코 re-map하지 않도록.
  `TODO(open-question: keying authority + staleness handshake)`.

### T7 — Export signature scheme
- **Owning:** ADR-0007 + ADR-0005 · **Phase P4**
- **Goal:** `caw05-signal` export envelope의 signing 방식을 선택, 하나의 verifier가 family 전체에서 동작하도록
  CAW-02의 선택에 맞춤(연구에 명시된 후보: minisign / cosign / DSSE).
- **Method:** CAW-02의 서명 결정(별개 제품)을 확인; canonicalize된 payload(`payload_sha256`)에 대해 signing +
  verification을 프로토타입; consumer가 알 수 없는 `contract_version` major와 잘못된 서명을 거부하도록 보장.
- **Exit:** CAW-02와 CAW-03이 모두 verify하는 signed bundle; verifier는 CAW-05 전용 방식이 아니라
  shared-format. [validation §Export](./validation-and-tests_ko.md)와 짝. `TODO(open-question: chosen scheme)`.

### Shared spike — 라벨링된 eval set (T4 + T5 + recall 테스트에 공급)
- **Owning:** ADR-0002 + ADR-0004 · **Phase P2**
- **Goal:** narrow watch list 위의 작은, Jimmy가 라벨링한 corpus — 각 항목이 relevant/irrelevant와
  (해당되는 경우) relevance class로 태깅됨 — 이것이 레이더의 **"high recall"을 정의**하고 기본 α/τ 값을 산출.
- **Exit:** CAW-05 자체 store에 체크인된 버전 관리되는 eval set; recall 테스트의 ground truth이자 모든 v1 이후
  lane의 gate. `TODO(open-question: eval-set composition + recall target)`.

## Track → ADR → phase → exit (요약)
| Track | Owning ADR/doc | Phase | Exit artifact |
|---|---|---|---|
| T1 source allow-list | ADR-0003 | P1 | 검증된 `feeds.yaml` + repo 집합, 모든 `legal_mode` verified |
| T2 S2 key & rate | ADR-0003/0005 | P1/P3 | keyed 여부 결정 + backoff/cache client |
| T3 author disambiguation | ADR-0002 | P2 | 저자/venue별 `canonical_id` + homonym 테스트 |
| T4 embedding-lane eval | ADR-0002 | P5 | 측정된 α + 모델 선택 (입증 전까지 default-off) |
| T5 thresholds & judge model | ADR-0004 | P2 | τ/N config + calibration fit + 불변식 유지 |
| T6 `related_to` keying | ADR-0005/0007 | P4 | keying 계약 + staleness handshake |
| T7 export signature | ADR-0007/0005 | P4 | CAW-02/03이 verify 가능한 signed bundle |
| eval set (shared) | ADR-0002/0004 | P2 | 버전 관리된 라벨링 corpus = recall ground truth |

## Cross-cutting research guardrails
- **모든 spike에서 precision보다 recall.** threshold가 recall을 precision과 맞바꿀 때(T4 α, T5 τ, S2
  Levenshtein gate, SimHash), 기본값은 recall-safe 쪽이어야 한다; precision은 사람 검토로 갚는다.
- **Legal/ToS first.** 어떤 트랙도 스크래핑을 요하거나 ToS를 위반하는 source/verifier 경로를 채택하지 않는다
  (T1, T2).
- **Evidence separation.** 어떤 트랙도 생성된 요약이 backing이 되도록 허용하지 않는다 — verification(T2)과
  synthesis는 verified source + locator만 사용한다(brief §12).
- **측정된 숫자는 지어내지 않는다.** 위의 모든 α/τ/비율은 그 eval이 산출할 때까지 `TODO(open-question)`으로
  남는다.

## Implications for runbooks
- P0–P1 runbook은 실제 fetch가 필요한 트랙(T1, T2) **이전에** registry/preflight + cursor/dedup core를 안착시켜야
  한다. 그래야 절반만 검증된 소스가 결코 라이브로 실행되지 않는다.
- T3/T5 runbook은 공유 eval set의 존재에 gate된다; P2에서 eval-set spike를 먼저 순서에 둘 것.
- T4/T7 runbook은 명시적으로 **v1 이후 / gated**다 — 연결되어 있으나 exit criterion이 충족될 때까지 default-off.
