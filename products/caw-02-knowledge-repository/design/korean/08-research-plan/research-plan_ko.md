# 연구 및 검증 계획

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: review date — do not invent)
- **Related:**
  - [validation-and-tests.md](validation-and-tests_ko.md)
  - [open-questions.md](open-questions_ko.md)
  - [../01-decisions/ADR-0002-storage.md](../01-decisions/ADR-0002-storage_ko.md)
  - [../01-decisions/ADR-0004-provenance-and-trust.md](../01-decisions/ADR-0004-provenance-and-trust_ko.md)
  - [../01-decisions/ADR-0005-ingestion-pipeline.md](../01-decisions/ADR-0005-ingestion-pipeline_ko.md)
  - [../01-decisions/ADR-0006-retrieval.md](../01-decisions/ADR-0006-retrieval_ko.md)
  - [../01-decisions/ADR-0007-import-export-contracts.md](../01-decisions/ADR-0007-import-export-contracts_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF_ko.md

## 목적

이 문서는 CAW-02의 v0 빌드 전, 도중, 후에 해결되어야 하는(또는 revisit 트리거와 함께 명시적으로
deferred되어야 하는) **열린 연구 / 검증 트랙**을 열거한다. 각 트랙은 가설, 방법, 종료 기준,
소유 ADR, 목표 phase를 갖춘 경계가 있는 조사이다. ADR이나 PRODUCT-BRIEF가 이미 고정한 것은 다시
결정하지 않으며 — 그런 것들은 재정의가 아니라 구체화될 뿐이다. 미해결 질문의 망라적 목록은
[open-questions.md](open-questions_ko.md)에 있으며, 이 문서는 그중 *결정 형태*의 질문을 실행 가능한
트랙으로 변환한다. 합격/불합격 수용 테스트는 [validation-and-tests.md](validation-and-tests_ko.md)에
있다.

## Phase 모델(모든 트랙에서 참조됨)

이 phase 이름들은 설계 세트 전반에서 사용된다. 이들은 시퀀싱 레이블이지 달력 날짜가 아니다.

| Phase | 테마 | 범위(PRODUCT-BRIEF 기준) |
| --- | --- | --- |
| **P0** | 핵심 append + retrieve + skill-wrap | md-in-git source of truth, SQLite 파생 인덱스, FTS, evidence gate, boundary propagation, append-only events/audit |
| **P1** | Boundary 및 교환 | import 격리, fail-closed export allow-list, signed bundle, CAW-01/05/03 어댑터 |
| **P2** | 규모 및 시맨틱(트리거 게이트) | embedding sidecar, Postgres 포트, Apache AGE 그래프 업그레이드 — 측정된 트리거가 발동할 때만 |

`TODO(open-question: calendar mapping for P0/P1/P2 — owned by 09-roadmap, not invented here.)`

## 트랙 읽는 법

아래 각 트랙은 다음을 갖는다: **가설 / 필요한 결정**, **방법**, **종료 기준**(무엇이 해결로 만드는지),
**소유 ADR**, **Phase**, **미해결 시 위험**. 트랙은 종료 기준이 충족되고 *동시에* 소유 ADR의
Open-Questions 항목이 취소선 처리되어 [open-questions.md](open-questions_ko.md)에서 `status:
resolved`로 옮겨질 때에만 "완료"이다.

---

## Track R1 — 엔티티 ID 스킴

| 필드 | 값 |
| --- | --- |
| 필요한 결정 | 모든 엔티티의 안정적 id(파일명 + frontmatter `id`)에 대해 content-addressed hash vs sequential/typed slug. |
| 소유 ADR | [ADR-0002](../01-decisions/ADR-0002-storage_ko.md), [ADR-0003](../01-decisions/ADR-0003-knowledge-data-model_ko.md)과 공유 |
| Phase | **P0** (블로킹 — ID는 모든 파일과 edge에 박혀 있다) |

**작용 요인.** ID는 (a) re-index와 git history 전반에 걸쳐 안정적이고, (b) PR에서 사람이 diff
가능하며, (c) 미래의 Postgres/AGE 포트와 호환되고(ADR-0002), (d) 일반 edge 테이블에서 edge endpoint로
사용 가능해야(ADR-0003) 한다. Content hashing은 무료 dedup + 변조 증거를 주지만 body 편집 시 깨진다
(supersedes가 ID를 churn시킨다). slug은 읽기 쉽고 안정적이지만 유일성 할당기가 필요하고 동시 팀 쓰기
시 충돌 위험이 있다(R3 참조).

**방법.**
1. ~50개의 실제 엔티티(sources/claims/evidence/notes) 시드 코퍼스에서 두 방식을 모두 프로토타입한다.
2. 측정한다: PR 가독성, rename/supersede 거동, 시뮬레이션된 동시 추가 하에서의 충돌률,
   그리고 `_events` JSONL + git blame이 정합 가능한 상태로 남는지.
3. 테스트할 절충 후보: 식별을 위한 `type-prefixed ULID` + 변조 증거를 위한 별도의 `content_hash`
   frontmatter 필드(식별을 내용에서 분리).

**종료 기준.** 하나의 스킴 선택; `id` 및 (채택 시) `content_hash` 필드를 frontmatter 스키마에 고정;
reindex가 ID를 보존함을 입증(deterministic-reindex 테스트 T3 in
[validation-and-tests.md](validation-and-tests_ko.md) 참조).

**미해결 시 위험.** 다른 모든 P0 런북이 ID 형태에 의존한다. 데이터 레이어를 출하할 수 없다.

---

## Track R2 — Semantic dedup 임계값 & embedding 선택

| 필드 | 값 |
| --- | --- |
| 필요한 결정 | ingestion(A4/B-stages)에서 근접 중복 Claim/Source 탐지를 위한 cosine-similarity 임계값 + embedding model. |
| 소유 ADR | [ADR-0005](../01-decisions/ADR-0005-ingestion-pipeline_ko.md), [ADR-0006](../01-decisions/ADR-0006-retrieval_ko.md), [ADR-0007](../01-decisions/ADR-0007-import-export-contracts_ko.md)과 정렬 |
| Phase | **P0**은 exact/normalized-string dedup만 사용; **P2**가 embedding 기반 dedup |

**작용 요인.** ADR-0006은 **v0에 embedding 없음**을 고정한다. 따라서 P0의 dedup은 lexical이어야 한다
(정규화 텍스트, Source의 경우 DOI/arXiv/S2 id — R6/dedup-authority 참조). cosine 임계값은 embedding이
도착하고 *동시에* 실제 claim 위에서 튜닝되기 전까지는 무의미하다. 지금 숫자를 고르는 것은 조작된
벤치마크가 될 것이다(DOC-CONVENTIONS에 의해 금지됨).

**방법.**
1. **P0:** exact + normalized-string + identifier 기반 dedup을 출하; false-merge / missed-dup 비율을
   로깅한다.
2. **P2(트리거 게이트):** ADR-0006의 embedding 트리거가 발동하면, 누적된 코퍼스에서 true/near/
   non-duplicate claim 쌍의 라벨링된 세트를 구축; 임계값을 스윕; false-merge 비율을 데이터로부터 설정될
   목표 이하로 유지하는 작동점을 고른다.
3. Confidential-boundary 제약: `confidential` 항목의 embedding model은 **local-only**여야 한다
   (API egress 없음) — R4 및 ADR-0006 참조.

**종료 기준(P2).** 임계값 + model이 그것을 튜닝한 측정된 쌍 세트와 함께 기록된다. 그 측정 전에는
하드코딩된 숫자가 출하되지 않는다.

`TODO(open-question: target false-merge ceiling — set from data, not assumed.)`

**미해결 시 위험.** 섣부른 embedding 채택은 ADR-0006의 측정된-트리거 규율을 위반한다.

---

## Track R3 — 팀 쓰기 동시성 모델(Postgres-port 트리거)

| 필드 | 값 |
| --- | --- |
| 필요한 결정 | 동시 팀 작성자가 어떻게 직렬화되는가: 파일 위의 git PR/merge vs append를 직렬화하는 write-through API. 이것이 **명명된 Postgres-port 트리거**이다. |
| 소유 ADR | [ADR-0002](../01-decisions/ADR-0002-storage_ko.md) |
| Phase | **P0**이 v0 모델을 결정; 트리거 발동 시 **P2**가 포트 |

**작용 요인.** md-in-git이 source of truth이다. Append-only + supersedes는 쓰기가 *같은* 파일에서
거의 충돌하지 않음을 의미하지만, 파생된 SQLite 인덱스와 `_events` JSONL은 단일 작성자 아티팩트이다.
두 가지 실현 가능한 v0 모델:

| 모델 | 장점 | 단점 |
| --- | --- | --- |
| Git PR/merge | 서버 불필요; 기본 검토; 완전한 감사 | `_events`/index에서 merge 충돌; merge 후 reindex 필요; 약한 실시간 일관성 |
| Write-through API 직렬화 | 단일 작성자가 events+index 소유; 일관됨 | 실행 중인 서비스 필요; Postgres 포트를 트리거하는 경합 지점이 됨 |

**방법.**
1. **포트 트리거**를 정확히 정의한다: 예를 들어 N 동시 작성자 하에서 임계값을 넘는 지속적 쓰기 경합 또는
   index-rebuild 지연(`TODO(open-question: N and latency threshold — measure)`).
2. 둘 다 프로토타입; 시뮬레이션된 병렬 `attach_evidence` / `synthesize_note` 흐름으로 동시성 하니스를
   실행한다(validation T-concurrency 참조).
3. v0 모델을 결정; 그 위반이 Postgres로 승격시키는 정확한 지표를 문서화한다(ADR-0002 revisit).

**종료 기준.** v0 동시성 모델 선택; 포트 트리거가 측정 가능한 조건으로 표현됨.

**미해결 시 위험.** 팀 부하 하에서 조용한 index 손상 또는 손실된 `_events` 항목.

---

## Track R4 — Postgres / 그래프 포트 트리거(엔진 교체, 데이터 재작성 아님)

| 필드 | 값 |
| --- | --- |
| 필요한 결정 | SQLite→Postgres 및 relational→Apache AGE 그래프 엔진으로 승격시키는 측정 가능한 조건. |
| 소유 ADR | [ADR-0002](../01-decisions/ADR-0002-storage_ko.md), retrieval 영향 [ADR-0006](../01-decisions/ADR-0006-retrieval_ko.md) |
| Phase | **P2**(revisit-트리거됨) |

**작용 요인.** ADR-0002는 포트가 **엔진/쿼리 교체이지 데이터 재작성이 아님**을 고정한다(md-in-git이
canonical로 남고, SQLite는 일회용). ADR-0002에서 명명된 트리거: 동시 작성자 / index 경합(→ Postgres,
R3 참조), 그리고 SQLite CTE-BFS 범위(~100k 노드 규모)를 넘어 저하되는 traversal 깊이/성능 또는
continual-learning greenlight(→ AGE).

**방법.**
1. reindex를 결정적이고 엔진 비의존적으로 유지하여 동일한 `_events`/md가 어느 백엔드든 생성하도록 한다
   (swap-not-rewrite 주장을 입증 — T3로 검증).
2. 경량 텔레메트리 추가: 노드/edge 카운트, retrieval이 사용하는 가장 깊은 traversal, reindex
   wall time.
3. 포트는 트리거가 *측정될* 때에만 런북으로 취급하며, 예상으로 취급하지 않는다.

**종료 기준.** 트리거 지표가 계측됨; 각 포트에 대한 문서화된 go/no-go 임계값.

**미해결 시 위험.** 섣부른 복잡성(이른 Postgres/AGE) 또는 계획 없이 벽에 부딪힘 중 하나.

---

## Track R5 — Redaction 룰셋 source-of-truth & 동기화

| 필드 | 값 |
| --- | --- |
| 필요한 결정 | codename/fab/customer redaction regex가 어디에 위치하며, 독립 제품 간 **공유 의존성이 되지 않으면서** import + export 교차에 걸쳐 어떻게 동기 상태를 유지하는가. |
| 소유 ADR | [ADR-0007](../01-decisions/ADR-0007-import-export-contracts_ko.md), 정책 근거 [ADR-0004](../01-decisions/ADR-0004-provenance-and-trust_ko.md) |
| Phase | **P1** |

**작용 요인.** ADR-0007은 **모든 교차에서의 re-redaction**과 **fail-closed export allow-list**를
의무화한다. ADR-0004는 public 출력에 confidential 데이터를 금지한다. 공유 라이브러리는 독립성 계약을
위반할 것이다(공유 substrate 없음). 하지만 CAW-02의 룰셋과 producer의 룰셋 간 drift는 confidential
토큰이 통과하게 만들 것이다.

**방법 / 옵션.**

| 옵션 | 독립성 | 동기화 위험 |
| --- | --- | --- |
| 룰셋이 **CAW-02 내부**에 있고 그 repo에 버전 관리됨 | 완전 | CAW-02가 자체 egress 안전을 소유; producer를 단속할 수 없음 — CAW-02가 import 시에도 re-redact하므로 수용 가능 |
| 버전 관리된 룰셋 **artifact**가 게시되고 타 제품이 copy-in | 완전(링크 아닌 복사) | 수동 버전 범프; envelope에 `ruleset_version` 필드 필요 |
| 공유 패키지 | 독립성 **위반** | drift 낮음 그러나 불허 |

선택된 방향(확정 예정): CAW-02가 자체 룰셋을 소유한다. import/export **envelope가
`redaction_ruleset_version`을 운반**하여 불일치가 탐지되고 fail closed된다.

**종료 기준.** 룰셋 위치 고정; envelope가 ruleset 버전을 운반; 알 수 없는/오래된 버전에 대한
fail-closed 거동 입증(export-leak 테스트 T4).

**미해결 시 위험.** export 시 confidential 누출 — 최고 심각도의 guardrail 위반.

---

## Track R6 — Export 서명 스킴 & dedup authority

| 필드 | 값 |
| --- | --- |
| 필요한 결정 | (a) export bundle용 서명 스킴; (b) CAW-05에서 가져온 Source의 dedup authority 우선순위. |
| 소유 ADR | [ADR-0007](../01-decisions/ADR-0007-import-export-contracts_ko.md) |
| Phase | **P1** |

**(a) 서명 스킴.** ADR-0007은 **signed bundle**을 요구한다. 후보:

| 스킴 | 장점 | 단점 |
| --- | --- | --- |
| minisign | 작고 단순한 keypair, 쉬운 verify | envelope 메타데이터 표준 없음 |
| cosign | 생태계, transparency log 옵션 | 더 무거움; OCI 지향 |
| DSSE envelope | 타입화된 payload + 서명, attestation 친화적 | 움직이는 부품 더 많음 |
| Detached sig (raw) | 최소 | payload-type 바인딩 없음 |

방법: **payload type + ruleset version + producer breadcrumb**를 서명된 본문에 바인딩하는 가장 가벼운
스킴을 고른다. 양방향 검증(import는 producer sig를 verify; export는 consumer를 위해 sign).

**(b) Dedup authority.** CAW-05 Source 인테이크의 경우 우선순위를 고정 — 제안: **DOI > arXiv id >
Semantic Scholar id > normalized-title+year**. 첫 번째로 해석 가능한 식별자가 이긴다. 낮은 우선순위
매치는 사람 검토를 위해 *플래그*만 할 뿐 절대 자동 병합하지 않는다.

**종료 기준.** 서명 스킴 선택 + verify 경로 테스트; 우선순위 ladder 고정 및 import에 적용
(T5 격리 테스트).

**미해결 시 위험.** bundle의 검증 불가능한 provenance; 중복 Source가 그래프를 파편화함.

---

## Track R7 — Provenance 변조 증거(hash chain)

| 필드 | 값 |
| --- | --- |
| 필요한 결정 | `_events` provenance가 v0에서 hash chain / content addressing을 갖는가, 아니면 나중의 업그레이드인가. |
| 소유 ADR | [ADR-0004](../01-decisions/ADR-0004-provenance-and-trust_ko.md) |
| Phase | **P0**(경량) vs **P2**(전체) |

**작용 요인.** Git signed commit + blame이 이미 감사 추적을 제공한다(ADR-0002). `_events/<ts>-<op>.jsonl`의
이벤트별 hash chain은 독립적 변조 증거를 추가하지만 비용이 든다. R1의 선택적 `content_hash` 필드가
여기서 상호작용한다.

**방법.** 저렴한 chained-hash(이벤트 라인당 `prev_hash`)를 spike하고 write/reindex 비용을 측정;
v0에 git signing만으로 충분한지 결정한다.

**종료 기준.** 결정 기록됨; deferred되는 경우 ADR-0004에 revisit 트리거 명명.

**미해결 시 위험.** brief의 reconstructability 목표가 함의할 수 있는 것보다 약한 감사 보증.

---

## Track R8 — 제품 간 API 인증(횡단)

| 필드 | 값 |
| --- | --- |
| 필요한 결정 | 독립 제품 간 Pull-API 인증: static token vs mTLS vs signed-URL drop. |
| 소유 ADR | [ADR-0007](../01-decisions/ADR-0007-import-export-contracts_ko.md), surface 영향 [ADR-0001](../01-decisions/ADR-0001-product-surface-and-skill-interface_ko.md) |
| Phase | **P1** |

**방법.** ADR-0007의 file-first 입장에 따라 **file-artifact drop(경로/URI 위의 signed bundle)**을
기본으로 한다. producer가 파일을 drop할 수 없는 경우에만 pull API + 인증을 추가한다. pull API가
필요하면 confidential-capable 링크에는 mTLS를 선호하고, internal-boundary 데이터에만 static token을
사용한다.

**종료 기준.** boundary 클래스별 인증 모델 고정; ADR-0007에 기록.

---

## 트랙 요약

| Track | 주제 | 소유 ADR | Phase | P0 블로킹? |
| --- | --- | --- | --- | --- |
| R1 | ID 스킴 | ADR-0002/0003 | P0 | 예 |
| R2 | Dedup 임계값 + embedding | ADR-0005/0006 | P0 lexical / P2 vector | 아니오 |
| R3 | 팀 쓰기 동시성 | ADR-0002 | P0 | 예 |
| R4 | Postgres/AGE 포트 트리거 | ADR-0002/0006 | P2 | 아니오 |
| R5 | Redaction 룰셋 동기화 | ADR-0007/0004 | P1 | 아니오 |
| R6 | 서명 스킴 + dedup authority | ADR-0007 | P1 | 아니오 |
| R7 | Provenance 변조 증거 | ADR-0004 | P0/P2 | 아니오 |
| R8 | 제품 간 API 인증 | ADR-0007/0001 | P1 | 아니오 |

## 런북에 대한 함의

- R1과 R3은 **P0-블로킹**이다: 그들의 런북(데이터 레이어, write-path)은 해결되기 전까지 시작할 수 없다.
- 모든 트랙의 종료 기준은 [validation-and-tests.md](validation-and-tests_ko.md)의 테스트에 매핑된다.
  그 테스트가 통과하고 [open-questions.md](open-questions_ko.md)가 업데이트되기 전까지 트랙은 "완료"가
  아니다.
- P2 트랙(R2-vector, R4)은 *트리거 게이트*로 유지되어야 한다: 어떤 런북도 추측으로 출하하지 않는다.
