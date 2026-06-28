# Research Plan — CAW-04의 open track

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:** [./validation-and-tests_ko.md](./validation-and-tests_ko.md), [./open-questions_ko.md](./open-questions_ko.md), [../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md), [../01-decisions/ADR-0004-import-and-ports.md](../01-decisions/ADR-0004-import-and-ports.md), [../01-decisions/ADR-0005-storage-and-versioning.md](../01-decisions/ADR-0005-storage-and-versioning.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

이 문서는 CAW-04의 빌드 phase 이전에(또는 그와 병행하여) 닫혀야 하는 **open research track**들을 열거한다.
각 트랙은 질문, 그것이 파생된 ADR/연구 문서, 왜 critical path에 있는지, 그것을 해결하는 **spike**, **exit criterion**,
그리고 답이 필요한 **phase**를 명시한다. 이 문서는 ADR에서 이미 확정된 것을 다시 결정하지 않는다 — 남은 미지수의 범위를
정한다. 모든 트랙을 관통하는 제약은 CAW-04의 load-bearing 속성이다: **public surface는 구조적으로 public-safe하다**
(내부 저장소로의 live 경로가 없는, 동결되고 검증된 정적 artifact). 어떤 트랙도 이 속성을 침식해서는 안 된다.

참조되는 phase(빌드 계획 기준; runbook이 작성되면 그것을 참조):
`P0` core/skeleton · `P1` content model + storage · `P2` import + public-safe gate · `P3` web/API build ·
`P4` versioning/tombstone + operations · `P5` hardening/future connectors.

## Track summary

| # | Track | Owning ADR / doc | Blocks phase | Risk if unresolved |
|---|-------|------------------|-------------|--------------------|
| T1 | CAW-02/03로부터의 Provenance ancestor graph | ADR-0003, ADR-0002 | P2 | boundary를 로컬에서 재도출 불가; gate가 upstream을 맹목적으로 신뢰 |
| T2 | Redaction 엔진 선택(Presidio vs regex/denylist) | ADR-0003 | P2 | recall 격차로 confidential 데이터 유출, 또는 ops 부담으로 빌드 정체 |
| T3 | 재검증 / 폐기(revocation) 피드 | ADR-0003, ADR-0004 | P4 | 재분류된 upstream 콘텐츠가 계속 공개됨 |
| T4 | unpublish 시 Cache/CDN purge 보장 | ADR-0003, ADR-0006 | P4 | Tombstone된 bytes가 edge에 잔존 |
| T5 | Bundle 서명 / attestation | ADR-0003, ADR-0004 | P2 | import가 인증되지 않은 upstream bundle을 신뢰 |
| T6 | Content negotiation(`Accept` vs suffix) | ADR-0007, ADR-0001 | P3 | 캐시 단편화; agent 통합 마찰 |
| T7 | Search(client index vs server) | ADR-0001, ADR-0006 | P5 | agent가 대규모에서 artifact를 발견하지 못함 |
| T8 | Provenance dedup/우선순위(fan-in) | ADR-0004 | P2 | 두 source에서 온 동일 항목이 이중 게시됨 |
| T9 | Canonical serialization + digest 방식 | ADR-0005 | P1 | 재현 불가능한 hash가 immutability 증명을 깨뜨림 |

---

## T1 — CAW-02/CAW-03로부터의 Provenance ancestor graph

- **Derives from:** ADR-0003(로컬 `boundary_eff` 재계산), ADR-0002(provenance/origin_ref sidecar),
  연구 `publishing-policy-and-public-safe.md`, `content-model-and-metadata.md`.
- **Question:** import bundle이 **전체 provenance ancestor graph**(모든 upstream source + 그 boundary 주장을 추이적으로)를
  함께 제공하여 CAW-04가 effective boundary를 로컬에서 재계산할 수 있게 하는가, 아니면 평탄한 leaf 주장만 제공하는가? 그리고
  CAW-02/CAW-03가 pin할 **안정적이고 버전이 부여된 `origin_ref`**를 노출하는가, 아니면 변경 가능한 handle만 제공하는가?
- **Why critical:** ADR-0004는 public-safe 재검사를 **core stage**로 만들고 upstream 주장을 **증거(evidence)로만** 취급한다.
  leaf 주장만 볼 수 있다면 재검사는 deny-by-default가 될 수 없다 — confidential ancestor에서 파생된 public-safe leaf는
  반드시 실패해야 한다. graph는 그 재계산의 입력이다.
- **Spike:** CAW-02와 CAW-03로부터 샘플 export를 요청한다(별도 제품, import boundary); ancestor graph를 모델링한다;
  `boundary_eff = max(severity over all ancestors)`를 프로토타이핑한다; `origin_ref`의 immutability를 확인한다.
- **Exit criterion:** ancestor graph를 담는 문서화된 bundle schema 필드 + ancestor가 confidential일 때 실패하는 테스트를
  포함하는 결정론적 재계산 규칙. 명심하라: `origin_ref`/`origin_version`은 **audit 전용 sidecar 필드**이며 web/API로
  직렬화되어서는 안 된다(see [validation-and-tests_ko.md](./validation-and-tests_ko.md) V2).
- **Phase:** P2.

## T2 — Redaction 엔진 선택

- **Derives from:** ADR-0003(redaction), 연구 `publishing-policy-and-public-safe.md`.
- **Question:** redaction/scan stage에 Microsoft **Presidio**(NLP recall, REST 배포 가능) vs 더 가벼운 **regex + denylist**
  코어? CAW-04의 codename/fab/customer 패턴 목록은 어디에 위치하며, 공유 기반(shared substrate) 없이 upstream boundary
  정책과 doctrine 차원에서 어떻게 정합을 유지하는가?
- **Why critical:** redaction은 gate 구성요소이며, recall 실패는 곧 confidential 데이터 유출이다. 그러나 Presidio는 NLP
  의존성과 ops 부담을 추가하는데, 이는 SSG 중심 빌드에 맞지 않을 수 있다.
- **Spike:** 레이블링된 fixture 집합을 구성한다(합성 confidential 패턴 — codename/fab ID/customer name); 두 옵션의
  recall/precision을 측정한다; build-time 비용을 측정한다. **어느 쪽이든 human curator 승인은 필수다** — 엔진은 recall
  보조 수단이지 gate가 아니다.
- **Exit criterion:** fixture 집합에서 측정된 recall/precision을 담은 결정 표(측정 전에는 숫자를 TODO로 표시) + 선택된 엔진
  + 패턴 목록의 위치(아마 CAW-04 자체 repo의 버전 관리되는 파일).
- **Phase:** P2.

## T3 — 재검증 / 폐기(revocation) 피드

- **Derives from:** ADR-0003(재검증 주기), ADR-0004(upstream 철회), 연구 import + policy 문서.
- **Question:** upstream source가 이후에 **confidential로 재분류**되거나 **철회(retract)**될 때, CAW-04는 이를 어떻게
  인지하고 gate를 재실행하는가? provenance ref가 **liveness check**(poll)인가, **push** 통지인가, 아니면 주기적 재import인가?
  허용 가능한 staleness 윈도우는 무엇인가?
- **Why critical:** 게시된 artifact가 upstream에서 confidential이 되면, 철회되기 전까지 상시적 유출 상태다.
  이것이 public-safe 보장의 동적(dynamic) 절반이다.
- **Spike:** 게시된 각 artifact의 `origin_ref`를 다시 가져와 boundary 주장을 diff하고, 회귀(regression) 시 curator
  `unpublish`/`redact` 제안을 큐에 넣는 `revalidate()` 패스를 프로토타이핑한다. pull vs push를 결정한다(see
  open-questions OQ — import 방향).
- **Exit criterion:** 문서화된 revocation 피드 계약 + staleness 상한(TODO(open-question: numeric
  bound)) + gate를 스케줄에 따라 재실행하는 runbook 단계.
- **Phase:** P4(import 방향에 의존; T8과 결합).

## T4 — unpublish 시 Cache / CDN purge 보장

- **Derives from:** ADR-0003(purge 보장), ADR-0006(SSG/edge), 연구 policy + web/api stack.
- **Question:** public artifact는 edge/CDN에 캐시될 수 있다. `unpublish`/`redact` 시 **time-to-purge의 상한**은
  무엇이며, purge가 curator 동작이 완료로 보고되기 전에 **best-effort**인가 **보장(guaranteed)**되는가?
- **Why critical:** tombstone(HTTP 410)은 가장 느린 캐시만큼만 강하다. redact가 bytes를 edge에 남기면 boundary-change
  워크플로를 무력화한다.
- **Spike:** 배포 대상의 purge API를 평가한다(TODO(open-question: hosting target not yet fixed)); 
  `redact -> rebuild -> deploy -> purge -> verify-410` 파이프라인을 모델링한다; 짧은 max-age + 명시적 purge가 더 견고한
  보장을 주는지, 아니면 immutable-with-versioned-URLs + index 제거가 더 나은지 결정한다.
- **Exit criterion:** edge에서 410을 단언하는 검증 단계를 포함한 문서화된 purge 시퀀스 + 명시된 시간 상한.
  [validation-and-tests_ko.md](./validation-and-tests_ko.md) V4(tombstone이 410 반환)와 상호 링크.
- **Phase:** P4.

## T5 — Bundle 서명 / attestation

- **Derives from:** ADR-0003, ADR-0004(서명 방식), 연구 policy + import 문서.
- **Question:** imported bundle에 어떤 서명/attestation 방식 — **DSSE / in-toto / minisign** — 이 bundle이 주장된 검증
  upstream에서 왔고 전송 중 변조되지 않았음을 검증하는가?
- **Why critical:** 재검사는 bundle의 *내용을 증거로* 신뢰한다; 인증되지 않은 bundle은 공격자가 "검증됨, public-safe" 주장을
  위조하도록 허용한다. 서명은 증거의 출처를 인증한다(core 재검사를 **대체하지 않는다** — deny-by-default는 여전히 적용된다).
- **Spike:** CAW-02로부터 서명된 샘플 bundle 검증을 프로토타이핑한다; 두 제품(CAW-02/03 -> CAW-04) trust boundary에 대해
  세 방식의 key 관리 부담을 비교한다.
- **Exit criterion:** 선택된 방식 + key 배포 노트 + 재검사 실행 전에 서명되지 않거나 무효한 bundle을 **거부**하는 gate 단계.
- **Phase:** P2.

## T6 — Content negotiation

- **Derives from:** ADR-0007(결정: `Accept` 기본 + `.md`/`.json` suffix 보조), ADR-0001, 연구
  web/api + versioning 문서.
- **Question:** ADR-0007은 `Accept` header를 canonical로 선택하고 suffix alias를 부가했다. open detail: 일부 CDN은
  `Vary: Accept`를 잘 처리하지 못한다. 실제로 **suffix가 cache-safe canonical** 경로이고 `Accept`는 단순 클라이언트를 위한
  편의 수단인가? 이것은 재결정이 아니라 **구체화(elaboration)**다.
- **Why critical:** 잘못된 cache key는 CDN을 단편화하고 정적 artifact 모델을 훼손한다; agent는 안정적이고 공유 가능한 URL이
  필요하다.
- **Spike:** 후보 CDN에서 `Vary: Accept` 동작을 테스트한다; suffix 경로가 모든 artifact에 대해 Astro 빌드에서 정적으로
  방출되는지 확인한다(web/API parity, ADR-0007).
- **Exit criterion:** CDN별 권고가 문서화됨; 모든 artifact에 대해 suffix 경로 존재가 검증됨.
- **Phase:** P3.

## T7 — Search

- **Derives from:** ADR-0001, ADR-0006(deferred), 연구 web/api stack, skills-distribution.
- **Question:** **사전 빌드된 client-side index**(Pagefind 스타일)가 v1에 충분한가, 아니면 agent가 **server-side search**
  엔드포인트를 필요로 하는가? ADR은 런타임 search를 연기한다; 이 트랙은 그것이 언제/돌아올지를 범위로 정한다.
- **Why critical:** 대규모에서의 발견; 그러나 server-side search 엔드포인트는 런타임 경로를 재도입하며, 이는 내부 저장소로의
  live 경로가 되어서는 안 된다. 모든 search는 **public projection만** 인덱싱해야 한다.
- **Spike:** 빌드된 정적 사이트에 대해 Pagefind를 프로토타이핑한다; `index.json` manifest를 통해 index 크기 + agent 쿼리
  사용성을 측정한다(ADR-0007).
- **Exit criterion:** go/defer 결정; 빌드한다면, public 필드만 인덱싱함이 입증되는 정적 index(sidecar/audit 필드 없음 — see
  [validation-and-tests_ko.md](./validation-and-tests_ko.md) V2).
- **Phase:** P5(ADR-0007에 따라 deferred).

## T8 — Provenance dedup / 우선순위(fan-in)

- **Derives from:** ADR-0004(CAW-02 + CAW-03의 fan-in), 연구 import 문서.
- **Question:** 두 source adapter가 **동일한 논리적 항목**을 노출할 때, dedup/우선순위 규칙은 무엇이며, 병합 과정에서
  provenance는 어떻게 보존되는가?
- **Why critical:** 이중 게시 또는 병합 중 ancestor 손실은 감사 추적과 boundary 재계산을 손상시킨다(T1, T3와 결합).
- **Spike:** 논리적 identity key를 정의한다; ancestor graph를 union하고 우선순위를 기록하는 병합을 프로토타이핑한다.
- **Exit criterion:** 문서화된 우선순위 + provenance를 보존하는 병합 규칙과 테스트(두 source, 하나의 항목, 단일 게시
  artifact, sidecar에 두 ancestor 모두 유지).
- **Phase:** P2.

## T9 — Canonical serialization + digest 방식

- **Derives from:** ADR-0005, 연구 versioning-and-immutability.
- **Question:** 정확한 **canonical serialization** 스펙(필드 순서, 공백, 어떤 메타데이터 필드가 hashed envelope 안에 있고
  어떤 것이 sidecar에 있는가)과 **digest 알고리즘 + prefix**(`sha256:` vs multihash). hash가 sidecar/audit 필드를 포함하는가,
  아니면 public projection만 포함하는가?
- **Why critical:** content-digest는 immutability 증명이다; 재현 불가능한 hashing은 "영원히 동결" 보장(ADR-0005)과 parity
  테스트를 깨뜨린다.
- **Spike:** 두 번의 재빌드에 걸쳐 canonical normalization + hashing을 프로토타이핑한다; 동일한 digest를 단언한다.
- **Exit criterion:** 작성된 serialization 스펙 + 선택된 알고리즘/prefix + 재현성 테스트. 결정:
  hash는 **public projection**을 포함한다(따라서 sidecar churn이 public 콘텐츠를 재해시하지 않음) — T1이 audit
  integrity가 달리 요구함을 보이지 않는 한 — TODO(open-question).
- **Phase:** P1.

## Implications for runbooks

- P1 runbook은 어떤 콘텐츠가 동결되기 전에 T9(canonical hash)를 완료해야 한다.
- P2 runbook은 T1, T2, T5, T8을 완료해야 한다 — gate는 ancestor graph(T1), 서명된 증거(T5), 병합 규칙(T8) 없이는
  deny-by-default일 수 없다.
- P4 runbook은 T3 + T4를 완료해야 한다 — public-safe 보장의 동적 절반.
- T6/T7은 P3/P5 구체화다; 핵심 publish 경로를 차단하지 않는다.
- 모든 트랙의 exit test는 [validation-and-tests_ko.md](./validation-and-tests_ko.md)에 속한다; 미해결 세부사항은 모두
  [open-questions_ko.md](./open-questions_ko.md)에 반영된다.
