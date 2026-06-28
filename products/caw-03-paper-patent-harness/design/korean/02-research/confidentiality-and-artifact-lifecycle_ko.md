# 기밀성 및 아티팩트 수명 주기 (Confidentiality & Artifact Lifecycle)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF_ko.md)
  - CAW-02 (별도 제품): `RB-013` boundary+audit, `RB-052` boundary/redaction 라이브러리, `RB-051` CAW-03 bundle exporter, `ADR-0007` import/export 계약
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적

이 문서는 CAW-03에 대해 세 가지를 결정한다. (1) **confidentiality gate(기밀성 게이트)** — harness가
*public-source-assisted* 아티팩트(내부 검토 없이 public sink로 흘러갈 수 있음)와
*internal-review-required* 아티팩트(불가능)를 어떻게 구분하는가. 이때 CAW-02의 boundary/redaction 시맨틱을
새로 만들지 않고 재사용한다. (2) provenance를 처음부터 끝까지 보존하는 **아티팩트 수명 주기 상태 기계(state
machine)** (`claim → gate → draft → review → paper | patent`). (3) harness가 직접 **소유하는 최소한의 CAW-03
데이터 vs. id/URI로 참조하는 데이터**, 그리고 그 파일/SQLite 친화적 저장 형태. 이 문서는 evidence-completeness
gate의 내부 구조(별도 문서), novelty/claim-boundary 검사기(별도 문서), PaperOrchestra WritingEngine port 연결
(별도 문서)을 정의하지 *않는다* — 이들은 입력/전이로서 소비할 뿐이다. 또한 분류(classification)를 다시 소유하지
않는다. 라벨에 대한 권위는 CAW-02에 있다.

---

## 1. 다시 만들지 말고 재사용하라: CAW-02 boundary 시맨틱

CAW-03은 CAW-02로부터 인용된 claim+evidence 번들을 서명되고 버전이 부여된 envelope으로 가져온다
(`boundary_kind=caw03-bundle`, CAW-02 `RB-051` 참조). 번들 안의 각 엔티티는 CAW-02가 단조(monotone)
provenance 전파를 통해 계산한 **effective(유효)** 라벨을 이미 지니고 있다. CAW-03은 이 정의들을 그대로 상속하며
재정의해서는 **안 된다**:

| 축 | 값 | 의미 | 결정 주체 |
| --- | --- | --- | --- |
| `boundary` | `public ⊂ internal ⊂ confidential` (순서 있는 격자) | "건물 밖으로 나갈 수 있는가" | CAW-02 (effective = provenance 조상들에 대한 lattice-max) |
| `visibility` | `{team, private}` (순서 없음) | "누구의 공간인가" | CAW-02 (effective = 자신과 모든 조상이 `team`일 때만 `team`) |

harness가 의존하며 자신의 export boundary에서 다시 단언하는, 상속된 세 가지 불변식:

1. **단조 전파 (no laundering, 세탁 금지).** `confidential` claim으로부터 조립된 draft는 그 자체로
   ≥ `confidential`이다. 생성된 텍스트는 자기 소스의 boundary를 결코 낮추지 않는다. CAW-03은 선택된 claim들로부터
   *아티팩트*의 effective boundary를 계산할 때 동일한 lattice-max 규칙을 적용한다.
2. **생성된 텍스트는 evidence가 아니다.** 번들은 합성물(synthesis)에 `evidence=false`를 태깅하며, CAW-03은 이를
   끝까지 유지하여 draft의 한 문단이 결코 evidence로 역인용될 수 없게 한다.
3. **Fail-closed default-deny(닫힘 우선 기본 거부).** 미확정/미상 → 제외. 라벨이 누락되었거나 해석 불가능하면
   `confidential`/`private`로 취급하며, 절대 `public`으로 취급하지 않는다.

CAW-03은 CAW-02의 redaction 규칙 집합 시맨틱(codename/fab/customer/PII 패턴, `scan()`/`redact()`)을 egress에서의
**심층 방어(defense-in-depth) 재스윕**으로 재사용한다 — §2 참조. `TODO(open-question: CAW-03이 규칙 집합의
사본을 vendor(내장)하는가, 공유 라이브러리에 의존하는가, 아니면 import envelope에 핀 고정된 ruleset_version을
받는가? brief는 공유 런타임 기반(shared runtime substrate)을 금지하므로, vendor된 버전 고정 사본이 기본값이다 —
ADR에서 확정.)`

---

## 2. confidentiality gate

이 게이트는 수명 주기의 **두 지점에서 평가되는 정책 함수(policy function)**이며, 일회성 플래그가 아니다:

- **Ingest classification(수집 분류)** (`gate` 시점): 선택된 모든 claim+evidence 라벨에 대한 lattice-max로
  아티팩트의 effective boundary/visibility를 계산한다. 이것이 아티팩트의 **confidentiality track(기밀성 트랙)**을
  설정한다.
- **Egress decision(반출 결정)** (publish/sink boundary 시점): 선택된 sink의 audience에 대해 allow-list
  `decide(artifact, target_audience)`를 다시 실행하고, redaction 재스윕을 추가로 수행한다. egress가 하중을
  지탱하는(load-bearing) 게이트이며, ingest는 라우팅만 한다.

### 2.1 두 가지 트랙

| 트랙 | 트리거 (선택된 claim들의 effective 라벨) | 허용하는 것 | 차단하는 것 |
| --- | --- | --- | --- |
| **public-source-assisted** | 선택된 모든 claim+evidence가 effective `boundary=public` AND `visibility=team` | 검토 체크리스트를 통과하면 draft가 **public sink**(arXiv/venue)를 대상으로 할 수 있음 — 사람에 의한 기밀성 검토 불필요 | 추가 제약 없음; 표준 검토는 여전히 적용 |
| **internal-review-required** | 선택된 claim/evidence 중 하나라도 effective `boundary ≥ internal` OR `visibility=private` | draft를 생산하고 내부적으로 검토할 수 있음; boundary 한도까지 **internal sink**를 대상으로 할 수 있음; patent track 진행 가능(counsel은 특권을 가진 내부 audience) | 사람의 `reclassify`/clearance 이벤트가 하한선을 낮추거나 patent-first 경로가 공개 전에 출원할 때까지 **public sink는 하드 차단됨** |

트랙 이름은 서술적이다. "public-source-assisted"는 *아티팩트가 public-safe 입력 위에 서 있으므로 건물 밖으로
나가는 데 내부 검토가 필요 없음*을 뜻하고, "internal-review-required"는 *공개 disclosure 전에 사람이 clearance를
주거나 reclassify해야 함*을 뜻한다.

### 2.2 egress 결정 (CAW-02 `decide()`에서 재사용)

sink에서 `decide(artifact, target_audience)`는 **전역적이고 부작용이 없으며(total and side-effect-free)**,
default-deny이다:

- `target_audience=public` ⇒ effective `boundary == public` AND effective `visibility == team`일 때만 ALLOW.
- effective `visibility == private` (jimmy-private) ⇒ 어떤 audience에 대해서도 절대 ALLOW 아님.
- `target_audience=internal` ⇒ effective `boundary == internal`까지 ALLOW.
- `target_audience=counsel` (patent) ⇒ `confidential`까지 ALLOW (특권); 우발적 PII/customer 누출에 대한
  redaction 재스윕은 여전히 적용. `TODO(open-question: "counsel"은 "internal" 위의 독립된 audience tier인가,
  아니면 특권을 가진 internal에 불과한가? Patent ADR이 소유.)`
- 인식되지 않는 모든 상태 ⇒ EXCLUDE / 차단.

그 다음 **redaction 재스윕**: 엔진이 방출한 모든 문자열(제목, 초록, 본문, 캡션, 표 셀, 참고문헌 locator)에 대해
`scan()`을 수행한다. **어떤 적중이라도 발견되면 publication을 중단**하고 문제가 된 span 목록을 반환한다 —
allow-list 이후에도 적용되는 심층 방어인데, writing engine이 소스 번들에 문자 그대로 존재하지 않던 codename을
합성할 수 있기 때문이다.

### 2.3 patent 전용 오버레이 (공개 disclosure 차단막)

patent 관련 claim은 **patent-first**로 취급된다. 공개 disclosure(논문, preprint, 발표)는 first-to-file 체제에서
특허성(patentability)을 상실시킬 수 있다. 따라서 confidentiality gate는 단순한 라벨 검사가 아니라 수명 주기에
대한 추가적인 순서 제약을 강제한다:

| 조건 | egress 규칙 |
| --- | --- |
| novelty 검사기가 `patent_first`로 표시했으나 아직 출원되지 않은 claim | 그것을 인용하는 모든 아티팩트에 대해 boundary와 무관하게 **모든 public 논문 sink 차단** |
| `patent_first` claim, 출원 기록됨 (`filed_patent` 도달 또는 출원 참조 존재) | 해당 claim에 대해 public 논문 sink 차단 해제 |

`TODO(open-question: "disclosure"의 법적 정의(내부 preprint도 포함되는가? grace period는?)는 counsel의
결정이다. CAW-03은 *gate 순서*를 모델링하며 법적 자문을 제공하지 않는다. Patent ADR이 소유하며
08-research-plan에 open question으로 둠.)`

---

## 3. 아티팩트 수명 주기 상태 기계

하나의 **Artifact**(아티팩트) = 거버넌스 하에 있는 하나의 논문 또는 하나의 patent draft. 선택된 claim 집합을
하나의 track, 하나의 engine run, 하나의 review, 그리고 하나의 종단 출력에 묶는다. 이 상태 기계는 `draft`까지는
paper와 patent에 대해 동일하다. 꼬리 부분은 `artifact_type`과 위의 patent-first 순서에 따라 달라진다.

```
                 (evidence gate + confidentiality gate + novelty)
  [selected] ───────────────► [gated] ──────► [drafting] ──► [drafted]
      │  claim set bound          │  pass        │ engine        │
      │                           │              │ (port)        │
      │                     fail  ▼              │               ▼
      └─────────────────────► [blocked] ◄───────┘            [in_review]
                                  ▲   (engine error / track downgrade)   │
                                  │                                       │ review checklist
              human reclassify /  │              changes requested       │
              add evidence /      └───────────────[changes_requested]◄───┤
              file patent                                                │ approved
                                                                         ▼
                                                                    [approved]
                                                          ┌──────────────┴──────────────┐
                                              artifact_type=paper            artifact_type=patent
                                                          ▼                              ▼
                                                  [published_paper]               [filed_patent]
                                                       (terminal)                   (terminal)

  side states (from any non-terminal): [withdrawn] (terminal), [superseded:<id>] (terminal)
```

### 3.1 상태

| 상태 | 의미 | 진입 가드 | 전이 소유자 |
| --- | --- | --- | --- |
| `selected` | claim 집합 + 의도된 `artifact_type` + `paper_ladder` 슬롯이 묶임 | claim들이 id/URI로 해석 가능 | 사람 (curator) |
| `gated` | evidence-completeness + confidentiality 분류 + novelty 통과 | 세 게이트 모두 통과; track 배정됨 | 시스템 (gates) |
| `blocked` | 게이트 실패 또는 engine 실패 | 게이트 실패 / engine error / track downgrade | 시스템; 사람의 조치로 탈출 |
| `drafting` | WritingEngine port 호출됨 (PaperOrchestra 기본) | config로 engine adapter 선택됨 | 시스템 (adapter) |
| `drafted` | engine이 draft + figure/table manifest 반환 | engine run 기록됨 | 시스템 |
| `in_review` | review 체크리스트 실행 중 (autorater 포함) | draft 존재 | 시스템 + 사람 |
| `changes_requested` | review가 문제 발견; drafting/refinement로 되돌아감 | review 판정 = revise | 사람 reviewer |
| `approved` | review 체크리스트 + confidentiality egress 사전 검사 통과 | 의도된 sink에 대해 `decide()` ALLOW | **사람 (Jimmy)** |
| `published_paper` | public/internal sink로 export됨 (LaTeX+PDF) | egress `decide()` + redaction 재스윕 통과 | 사람; 시스템이 기록 |
| `filed_patent` | patent draft가 출원 경로로 인계됨 | counsel audience egress 통과 | 사람; 시스템이 기록 |
| `withdrawn` | 포기됨 | — | 사람 |
| `superseded:<id>` | 더 새로운 아티팩트로 대체됨 | 더 새로운 아티팩트가 publish됨 | 사람 |

### 3.2 전이 규칙 (불변식)

- **게이트는 논리곱(conjunction)이다.** `gated`는 evidence gate ∧ confidentiality 분류 ∧ novelty 통과를
  요구한다. 어느 하나라도 실패하면 → 타입이 부여된 사유(`EVIDENCE`, `BOUNDARY`, `NOVELTY`, `ENGINE`)와 함께
  `blocked`.
- **나가는 길에서의 재게이팅(re-gating).** `approved`에 도달하면 *의도된* sink에 대해 confidentiality egress
  결정을 재평가한다. `internal-review-required` track을 가진 public sink는 통과할 수 없다 — 사람의
  `reclassify`/clearance 이벤트가 있을 때까지 `BOUNDARY`와 함께 `blocked`로 돌아간다(CAW-02의 사람 전용 downgrade
  권한을 그대로 따름).
- **사람이 publish/file + downgrade를 소유한다.** `approved → published_paper|filed_patent` 및 모든 boundary
  downgrade는 사람에게 귀속되는 이벤트이다. AI agent는 이를 수행할 수 없다(상속된 guardrail).
- **Track은 캐시되지 않고 재계산된다.** 기저 claim 집합이 바뀌면(상류에서 claim 추가/재분류), 아티팩트는 강제로
  `gated`로 되돌아가고 track이 재계산된다 — 낡은 `public` track은 결코 지속될 수 없다.
- **종단 상태는 append-only이다.** 정정(correction)은 새로운 아티팩트 `superseded:<old_id>`를 생성하여 publish된
  기록을 보존한다.

### 3.3 전이별 provenance

모든 전이는 하나의 **hash-chained 수명 주기 이벤트**(CAW-02 `_events`와 동일한 형태: `seq`, `prev_hash`,
`hash`, payload)를 추가하며 다음을 기록한다: `from_state`, `to_state`, `actor` (`human:jimmy` |
`agent:<engine>`), `timestamp`, `inputs`(claim id/URI, result-registry 참조, 번들 digest), `engine_version` +
`adapter_id`(drafting 전이의 경우), `boundary_eff` 스냅샷, 그리고 `reason`. 이로써 `claim → … → paper|patent`
경로가 완전히 replay 가능해지며, publish된 어떤 아티팩트에 대해서도 "어떤 evidence, 어떤 engine, 어떤 review,
누가 승인했는가"에 답할 수 있다. `verify_lifecycle(artifact_id)`는 체인을 따라 걸으며 첫 번째 단절을 보고하는데,
이는 CAW-02 `verify_audit`와 정확히 같다.

---

## 4. 데이터: CAW-03이 소유하는 것 vs. 참조하는 것

원칙(PRODUCT-BRIEF §7): CAW-03은 **거버넌스 + 수명 주기 상태**를 소유하고, 지식과 결과는 id/URI로 **참조**한다.
대용량 아티팩트는 path로 참조한다. CAW-02의 claim/evidence나 CAW-01의 run을 절대 복제하지 않는다.

| 데이터 | 소유 / 참조 | 형태 |
| --- | --- | --- |
| Artifact 레코드 (id, type, `lifecycle_state`, track, ladder 슬롯) | **소유** | SQLite 행 |
| 수명 주기 이벤트 로그 (hash-chained 전이 + provenance) | **소유** | append-only JSONL (`_events`) |
| Claim-set 바인딩 (이 아티팩트가 사용하는 claim id/URI) | **소유 (참조)** | join 테이블 → CAW-02 id/URI |
| 가져온 번들 스냅샷 (digest, ruleset_version, signature) | **소유 (스냅샷)** | 파일 + 행; 검증하되 재저작하지 않음 |
| Claim ledger 스냅샷/참조 | **소유 (참조)** | CAW-02 id를 참조하는 행 |
| Confidentiality track + egress 결정 + redaction 적중 | **소유** | 행 + `_events` 라인 |
| Figure/table manifest (어떤 result → 어떤 figure) | **소유 (참조)** | 행 → CAW-01 result-registry 참조 |
| Review 체크리스트 + autorater 점수 | **소유** | 행 / JSON |
| Paper-ladder 계획 (P1/P2/P3 순서 + 준비 상태) | **소유** | 행 |
| Adapter/config registry (어떤 Source/Engine/Patent/Sink/Novelty adapter인가) | **소유** | config 파일 + 행 |
| Draft 소스 & 컴파일된 출력물 (LaTeX, PDF, patent 문서) | **path로 소유** | 파일 시스템; 행은 path + digest 저장 |
| Claim & evidence *내용* | **참조** (CAW-02) | 검증된 번들 내부의 id/URI로 |
| 시뮬레이션 run / projection / result 내용 | **참조** (CAW-01) | id/URI / result-registry 참조로 |
| Novelty/threat radar 신호 | **참조** (CAW-05, 별도 제품) | id/URI로 |

### 4.1 저장 형태 (파일/SQLite 친화적)

family와 일관됨(최종 결정은 Storage ADR에서): 구조화된 상태(`artifact`, `artifact_claim`, `lifecycle_event`,
`review`, `manifest`, `ladder`, `adapter_config`)를 위한 단일 SQLite DB 하나에, 대용량/불투명 아티팩트를 위한
디스크상의 content 디렉터리(`artifacts/<id>/draft.tex`, `.../paper.pdf`, `.../bundle.json`)를 더한다. 행은
**blob이 아니라 참조와 digest를 저장한다**: 외부 지식은 `caw02://claim/<id>` 형태의 URI로, run은
`caw01://result/<id>`로, 로컬 대용량 파일은 상대 `path` + `sha256`으로. 수명 주기 이벤트 로그는 git에 commit
가능한 JSONL이어서 git blame이 제2의 증인이 된다(CAW-02 `RB-013` 8단계를 그대로 따름).

```
# illustrative — builder writes the real schema
artifact(id, type[paper|patent], state, conf_track, boundary_eff, ladder_slot, created, updated)
artifact_claim(artifact_id, claim_uri, bundle_digest)          # refs into CAW-02
lifecycle_event(seq, artifact_id, from_state, to_state, actor, ts,
                inputs_json, engine_version, adapter_id, boundary_eff, reason,
                prev_hash, hash)                                 # hash-chained
manifest(artifact_id, figure_id, result_ref, caption, path, sha256)  # result_ref → CAW-01
review(artifact_id, checklist_json, autorater_scores_json, verdict, reviewer)
```

`TODO(open-question: 기본 저장소로 SQLite 단일 파일 vs. 아티팩트별 파일 디렉터리 — Storage ADR이 소유. 이
문서는 "id/URI로 참조, 대용량은 path로, hash-chained 이벤트 로그"만 요구한다.)`

---

## 5. 일반화 / 이음새 (새로운 source와 sink에서도 살아남도록)

- confidentiality gate는 CAW-02 내부 구조가 아니라 **import envelope에 실린 effective 라벨**에만 의존한다. 미래의
  `SourceAdapter`(내부 wiki, experiment-server)는 동일한 라벨 보유, 서명된 envelope 계약을 방출함으로써 꽂힌다.
  게이트 코드는 변경되지 않는다.
- egress `decide(artifact, target_audience)`는 선택된 `Sink/PublishAdapter`가 공급하는 **audience**로
  파라미터화된다(public venue = `public`; 내부 wiki = `internal`; patent 출원 = `counsel`). 새로운 sink는
  audience tier를 등록한다. 게이트 로직은 변경되지 않는다.
- 수명 주기 상태 기계는 **engine 비종속적(engine-agnostic)**이다: `drafting`은 `adapter_id`+`engine_version`을
  기록하므로, PaperOrchestra를 다른 WritingEngine으로 교체하면 config 항목 하나만 바뀌고 수명 주기는 바뀌지 않는다.
- "future" adapter는 PRODUCT-BRIEF §5에 따라 문서화된 stub(인터페이스 + not-implemented 마커 + config 예시)으로
  배포된다. 게이트와 수명 주기는 결코 구체적인 adapter를 이름으로 참조하지 않는다.

---

## Open Questions

이들을 `08-research-plan/open-questions.md`에 반영하라.

- 규칙 집합의 거처: CAW-02 redaction 규칙의 vendor된 버전 고정 사본 vs. import envelope에 핀 고정된
  ruleset_version (공유 런타임 기반은 허용되지 않음).
- Audience 계층화: `counsel`은 `internal` 위의 독립된 tier인가, 그리고 그 정확한 redaction 프로파일은 무엇인가?
- patent-first 게이팅을 위한 "공개 disclosure"의 법적 정의(preprint, 발표, grace period) — counsel의 결정이며,
  CAW-03은 gate 순서만 모델링한다.
- 기본 저장소: SQLite 단일 파일 vs. 파일 디렉터리; 최종 결정은 Storage ADR에서.
- boundary를 넘는 재분류 권한: CAW-03이 사람의 clearance를 로컬에 기록할 수 있는가, 아니면 downgrade가 새 번들로
  재가져오기되는 CAW-02 `reclassify` 이벤트에서 비롯되어야 하는가? (기본값: 재가져오기, CAW-02를 권위 있는
  상태로 유지하기 위해.)
- 재게이팅 입도(granularity): 상류 claim 변경이 있으면 항상 전체 재draft가 강제되는가, 아니면 라벨이 변하지
  않았을 때 engine을 재실행하지 않고 아티팩트가 재게이팅될 수 있는가?

## 런북에 대한 함의

- **Confidentiality gate 런북:** ingest 분류(선택된 claim 라벨에 대한 lattice-max → track) + egress `decide()` +
  redaction 재스윕을 구현; fail-closed; 적중 시 중단; egress 결정마다 `_events` 라인 하나. CAW-02 시맨틱을
  재사용하고, 라벨을 재유도하지 말 것.
- **Lifecycle 런북:** 논리곱 게이트, 변경 시 재게이팅, 사람 전용 publish/file/downgrade, 종단 append-only +
  `superseded` 체인, `verify_lifecycle`을 갖춘 hash-chained `lifecycle_event`로 상태 기계(§3.1)를 구현.
- **Storage 런북:** blob이 아니라 참조/digest를 저장하는 SQLite 스키마(§4.1), 대용량 아티팩트용 content 디렉터리,
  git에 commit 가능한 JSONL 이벤트 로그를 생성; `verify_lifecycle`을 제공.
- **Bundle-import adapter 런북:** envelope 서명 + `provenance_digest`를 검증하고, `evidence=false`만 있는 claim을
  거부하고, 번들을 스냅샷(digest+ruleset_version)하고, effective 라벨을 게이트에 노출 — 내용은 결코 재저작하지 말 것.
- 모든 drafting 전이는 engine이 WritingEngine port 뒤에서 교체 가능하도록 `adapter_id`+`engine_version`을
  반드시 영속화해야 한다.
