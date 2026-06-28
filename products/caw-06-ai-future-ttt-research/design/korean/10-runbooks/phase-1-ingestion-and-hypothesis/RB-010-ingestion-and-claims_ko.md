# RB-010: 5단계 수집(ingestion) 서브 파이프라인 구축 (Discover → Import → Canonicalize+Dedup → Extract claims → Persist)

- Status: ready
- Phase: phase-1-ingestion-and-hypothesis
- Depends on: [RB-001 (스토어 레이아웃 + 레코드 스키마), RB-002 (포트 인터페이스 + 문서화된 스텁)]
- Implements design:
  - [../../05-ttt-research-core/experiment-scout-pipeline.md](../../05-ttt-research-core/experiment-scout-pipeline_ko.md) (§3 5단계 수집, §1 멱등성+재개 가능, §4 CAW-05 경계)
  - [../../01-decisions/ADR-0005-source-and-claim-ingestion.md](../../01-decisions/ADR-0005-source-and-claim-ingestion_ko.md) (해당 결정)
  - [../../09-roadmap/dependency-graph.md](../../09-roadmap/dependency-graph_ko.md) (R1, R2, R3 순서)
- Produces: 수집 코어 (`run_ingestion(thread)`); `SourceAdapter` v1 구현체 (`ArxivAdapter`, `SemanticScholarAdapter`, `CAW05ImportAdapter`); `sources.yaml` 레지스트리; `store/sources`와 `store/claims` 아래에 영속화되는 `Source` + `CandidateClaim` 레코드.

## Objective
하나의 `ExperimentScout` 수집 패스(pass)가 하나의 스레드를 다섯 단계 **S1 Discover → S2 Import(CAW-05) → S3 Canonicalize+Dedup → S4 Extract claims → S5 Persist**를 거쳐 전진시키며, 이는 `SourceAdapter` 포트 뒤에서 출처(provenance)가 각인된 `Source`와 `CandidateClaim` 레코드를 CAW-06 자체 파일 스토어에 기록한다. "완료(Done)"의 의미는 다음과 같다. 적어도 하나의 실제 공개 TTT 소스에 대해 파이프라인을 실행하면 ≥1개의 중복 제거된(deduped) `Source`와 ≥1개의 귀속된(attributed) `CandidateClaim`(축자적 `evidence_span` + `source_locator`, `status=unverified`)이 산출되며, **동일한 패스를 재실행해도 중복이나 재작성(rewrite)이 발생하지 않는다**(멱등성 + 재개 가능). 수집은 어떤 것도 참이라고 단언하지 않으며 S5에서 멈춘다 — 결코 hypothesis 단계로 진입하지 않는다.

## Preconditions
- [ ] RB-001 완료: `store/{sources,claims,hypotheses,ledger,implications}` 존재; `Source`와 `CandidateClaim` 스키마 + 검증기(validator)가 import 가능하며 라운드트립(round-trip)된다.
- [ ] RB-002 완료: `SourceAdapter` Protocol과 `SourceCapabilities`/`FetchCursor`/타입화된 실패(`SourceUnavailable`, 재시도 가능 vs 종료) 타입이 컴파일된다; 문서화된 스텁(`GithubAdapter`, `BlogRssAdapter`, `HackerNewsAdapter`)은 빈 `fetch()`를 반환한다.
- [ ] RB-002 수락 체크포인트에서 트리가 그린(green) 상태(컴파일 성공, lint 통과)이다.
- [ ] 빌드/테스트 환경에서 arXiv + Semantic Scholar로의 네트워크 송출(egress)이 허용되거나, 오프라인 테스트 실행을 위한 녹화된 픽스처(fixture)가 사용 가능하다.
- [ ] CAW-05 `action-brief` 샘플 번들(또는 예상되는 `caw05.action-brief/v1` 형태에 맞는 문서화된 픽스처)이 설정된 경계(boundary) 경로에 사용 가능하다. CAW-05는 **별도의 제품**이다; 이것은 파일/API 전달이지 공유 스토어가 아니다.

## Steps

### 1. 수집 단계 계약(contract)과 체크포인트 모델 정의
- **Do:** 다섯 개의 순서화된 단계를 오케스트레이션하는 `run_ingestion(thread, adapters, store)`를 만든다. 각 단계는 하나의 타입화된 출력을 갖는 순수 함수다: `S1 raw_sources`, `S2 imported_items`, `S3 deduped Source[]`, `S4 CandidateClaim[]`, `S5 persisted ids`. 스레드별로 단계별 체크포인트(마지막 완료 단계 + `FetchCursor`)를 기록하여 크래시가 마지막 완료 단계에서 재개되도록 한다(파이프라인 문서 §1, §5). 단계들은 오직 타입화된 값을 통해서만 통신하며, 결코 공유 전역(global)을 변경하지 않는다.
- **Verify:** 단위 테스트가 스텁 어댑터로 `run_ingestion`을 구동하여 단계들이 순서대로 실행되는지, 그리고 S3 이후 중단했다가 재개하면 S1이 아니라 S4에서 시작하여 동일한 출력을 산출하는지 검증한다.

### 2. `SourceAdapter` 뒤에 S1 Discover 구현 (얇은 어댑터만)
- **Do:** `ArxivAdapter`(Query API + 카테고리별 RSS, 엄격한 ≥3초 레이트 리미터, TTT 시드 쿼리)와 `SemanticScholarAdapter`(메타데이터 보강 + 인용 교차 참조, 필수 지수 백오프)를 구현한다. 각각은 ADR-0005 §2의 여섯 가지 계약 의무를 준수한다: `FetchCursor`를 통한 멱등성+증분(incremental); 어댑터 **내부**에서의 레이트 리밋/백오프; legal-mode(공개, ToS-안전만); 완전한 provenance(원본 URL + `retrieved_at` + 네이티브 id + `boundary`); 타입화된 실패(재시도 가능 vs 종료); **어댑터 내에서 claim 추출이나 랭킹 없음**. `sources.yaml`에서 패밀리를 바인딩한다(`family → adapter + query + schedule`).
- **Verify:** 녹화된 픽스처(또는 라이브 호출)에 대해 `ArxivAdapter.fetch(cursor)`는 각각 provenance + 네이티브 id를 지닌 원시 소스 레코드를 반환하고 커서를 전진시킨다; 전진된 커서로 두 번째 `fetch`를 호출하면 새 항목만 반환한다. 테스트는 어댑터가 추출을 수행하지 않음을 검증한다(출력은 원시 메타데이터를 포함하며 `CandidateClaim`은 0개).

### 3. CAW-05로부터의 S2 Import 구현 (읽기 전용, 비증거적 경계)
- **Do:** 설정된 경계 경로(파일 전달 / pull 엔드포인트)로부터 `caw05.action-brief/v1` 번들을 읽는 `CAW05ImportAdapter`를 구현한다. 이를 읽기 전용, 공개, provenance를 지닌, 그리고 **비증거적(non-evidential)**으로 취급한다: CAW-05 종합(synthesis) 산문은 `evidence:false`다. 각 `open_question`을 `mechanism`/`memory-traffic` 타입의 **시드 `CandidateClaim`**으로 매핑하며, `status=unverified`, `writes_back=unknown`으로 한다 — 결코 `supported`가 아니다. CAW-05 `classification`/`relevance`를 **우선순위 힌트로만** 전달하며, 결코 진실 판정으로 하지 않는다. `bundle_id`를 import 워터마크로 사용한다. 알 수 없는 `schema` 메이저 버전에서는 타입화된 `SourceUnavailable`을 발생시킨다 — **결코 형태를 추측하지 않는다**.
- **Verify:** 샘플 번들을 import하면 `evidence:false`, `status=unverified`, `writes_back=unknown`인 시드 항목이 산출된다; 메이저 `schema`가 올라간 번들은 `SourceUnavailable`을 발생시키고 아무것도 쓰지 않는다. 테스트는 어떤 CAW-05 내부 스토어 경로에도 읽기/쓰기가 닿지 않음을 확인한다 — 오직 경계 파일만 읽힌다.

### 4. S3 Canonicalize + Dedup 구현 (여러 출처에 걸친 하나의 정체성)
- **Do:** **DOI ▸ arXiv id ▸ normalized(title + first-author + year)** 순으로 정체성을 정규화한다. 다중 출처 히트를 **여러 `provenance` 항목을 가진 하나의 `Source`**로 병합한다; arXiv **버전**은 구별되지만 연결된(distinct-but-linked) 상태로 유지한다. 이미 발견된 논문에 대한 CAW-05 import는 `provenance{origin:"caw05"}` 항목을 추가한다(스레드 우선순위를 올릴 수 있음) — 새 `Source`를 만들지 **않는다**. 소스 내에서 claim 수준의 근접 중복 병합(near-dup merge)을 적용한다.
- **Verify:** arXiv + Semantic Scholar + CAW-05에서 동일한 논문을 공급하는 테스트가 정확히 하나의 `Source`와 세 개의 `provenance` 항목을 산출한다. 한 논문의 서로 다른 두 arXiv 버전은 구별되지만 연결된 상태로 유지된다. `TODO(open-question: CAW-05 canonical_id가 우리가 발견한 id와 불일치할 때의 dedup tie-break — 선택된 규칙을 현재 결정으로서 테스트에 기록할 것; ADR-0005 open questions 참고)`.

### 5. S4 Extract claims 구현 (추출적 + 귀속 가능만)
- **Do:** 각 `Source`에 대해 0개 이상의 원자적(atomic) `CandidateClaim`을 방출한다. 각각은 **축자적** `evidence_span`, `source_locator`(섹션/페이지), `claim_type ∈ {mechanism, quantitative-result, capability, efficiency, memory-traffic, reproducibility}`, `writes_back: true|false|unknown` 플래그(기본 `unknown`, brief §6), `status=unverified`, `evidence:false`, 그리고 `asserted_by` = 소스 id를 갖는다. 스팬 탐지/정규화에 LLM 보조가 허용되지만, 모든 의역(paraphrase)은 `evidence:false`로 표시된다; 추출은 **결코 `supported`를 방출하지 않으며** **스팬+locator 없이 claim을 지어내지 않는다**. claim은 "<source> claims …"로 렌더링하며, 결코 "it is true that …"로 하지 않는다.
- **Verify:** 테스트는 방출된 모든 `CandidateClaim`이 가져온 소스 텍스트의 부분 문자열(substring)인 비어있지 않은 축자적 `evidence_span`, `source_locator`, `status=unverified`, `evidence:false`를 갖는지 검증한다; 검증기는 `status=supported`이거나 스팬이 누락된 claim을 거부한다. `memory-traffic` claim은 그 `writes_back` 플래그(기본 `unknown`)를 유지한다.

### 6. S5 Persist 구현 (CAW-06 자체 스토어로의 멱등 upsert)
- **Do:** `Source` 레코드를 `store/sources`에, `CandidateClaim` 레코드를 `store/claims`에 provenance가 각인된 markdown/JSON으로 쓴다(ADR-0007 레이아웃). canonical id를 키로 한 upsert: 알려진 id를 재영속화하는 것은 **no-op**(동일 바이트)이며, 중복이나 재작성이 아니다. `FetchCursor`를 S5 체크포인트로서 전진시키고 영속화한다.
- **Verify:** 한 패스 후 `store/sources`와 `store/claims`가 레코드를 포함한다; 동일한 입력으로 `run_ingestion`을 **두 번째** 실행하면 새 파일이 0개 추가되고 기존 파일이 0개 변경되며(바이트 동일), 커서가 후퇴하지 않는다.

### 7. 레지스트리와 재개 가능 체크포인트를 종단 간(end-to-end) 연결
- **Do:** `sources.yaml`에서 어댑터를 로드한다; 각 단계가 파이프라인 문서 §5 표에 따라 체크포인트를 쓰는지 확인한다(커서 전진 + 레코드 upsert = 수집 완료). 스텁이 등록되었으나 비활성(`HealthStatus="deferred: <reason>"`, 빈 `fetch()`)임을 확인한다.
- **Verify:** 하나의 실제 소스에 대한 전체 `run_ingestion`이 스레드 체크포인트 "S5 done"으로 완료된다; S4 중간에 프로세스를 죽이고 재시작하면 S4에서 재개되어 S1–S3 출력을 중복하지 않고 완료된다.

## Acceptance criteria
- [ ] `run_ingestion`이 하나의 스레드를 S1→S5로 전진시키고 S5에서 멈춘다(결코 hypothesis 단계로 진입하지 않음).
- [ ] 실제 공개 TTT 소스로부터 ≥1개의 `Source`와 ≥1개의 `CandidateClaim`이 완전히 provenance 각인되어 영속화된다.
- [ ] 모든 `CandidateClaim`이 추출적 + 귀속 가능하다: 축자적 `evidence_span`(소스의 부분 문자열), `source_locator`, `claim_type`, `writes_back`(기본 `unknown`), `status=unverified`, `evidence:false`, `asserted_by`. 어떤 claim도 `supported`가 아니다; 수집은 어떤 것도 참이라고 단언하지 않는다.
- [ ] 다중 출처 dedup이 여러 `provenance`를 가진 하나의 `Source`를 산출한다; arXiv 버전은 구별되지만 연결됨; 알려진 논문의 CAW-05 import는 새 소스가 아니라 provenance를 추가한다.
- [ ] CAW-05 import는 읽기 전용, 비증거적(`evidence:false`), `bundle_id`로 워터마크됨; 알 수 없는 `schema` 메이저 ⇒ `SourceUnavailable`; 어떤 CAW-05 내부 스토어에도 접근 없음(경계만, 공유 스토어 없음).
- [ ] 전체 패스 재실행이 멱등적이다: 새/변경된 파일 0개, 커서 비후퇴; 마지막 완료 단계에서 재개 가능.
- [ ] v1 어댑터(`Arxiv`, `SemanticScholar`, `CAW05Import`)가 여섯 가지 계약 의무를 준수한다; 문서화된 스텁은 등록되었으나 비활성.
- [ ] 이 체크포인트에서 트리가 그린(컴파일 성공, lint 통과)이다.

## Rollback / safety
- 스토어는 append/upsert 전용이다; 실패한 패스는 이전 레코드를 건드리지 않는다. 잘못된 패스를 되돌리려면 그 패스가 쓴 canonical id만 삭제하고(레코드는 provenance + `retrieved_at`/`bundle_id`를 지님) `FetchCursor`를 영속화된 패스 이전 체크포인트로 리셋한다; 그 후 재실행하면 멱등적으로 다시 가져온다.
- 어댑터가 fetch 중간에 실패하면 타입화된 실패(재시도 가능 vs 종료)를 발생시킨다; 오케스트레이터는 마지막 양호한 체크포인트에서 멈추고 결코 부분/추측된 레코드를 쓰지 않는다. 패스를 "완성"하기 위해 `Source`/`Claim`을 결코 지어내지 않는다.
- Legal-mode 가드: 소스가 공개/ToS-안전으로 확인되지 않으면 어댑터는 수집하지 않고 건너뛰어야 한다(brief §12).

## Hand-off
다음 런북(**RB-011**)은 다음을 가정할 수 있다: 귀속된, 미검증 `CandidateClaim`(각각 `claim_type`, `writes_back`, 축자적 스팬, `asserted_by` 보유)으로 채워진 `store/claims`와 중복 제거된 `store/sources`가 `Claim`으로 통합되고 `Hypothesis` 레코드로 추론될 준비가 되어 있다. 어떤 claim도 진실 판정을 지니지 않는다; `memory-traffic` `claim_type` + `writes_back` 플래그는 다운스트림 hypothesis, writeback 스키마(ADR-0004), CAW-01 export(ADR-0008)가 소비하는 시드다. 파이프라인은 멱등적 + 재개 가능하므로, RB-011은 전제 조건으로서 수집을 안전하게 재실행할 수 있다.
