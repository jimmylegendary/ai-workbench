# Research Plan — CAW-04의 open track

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:** [./validation-and-tests_ko.md](./validation-and-tests_ko.md), [./open-questions_ko.md](./open-questions_ko.md), [../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md), [../01-decisions/ADR-0004-import-and-ports.md](../01-decisions/ADR-0004-import-and-ports_ko.md), [../01-decisions/ADR-0005-storage-and-versioning.md](../01-decisions/ADR-0005-storage-and-versioning_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적

이 문서는 CAW-04의 빌드 phase 이전에(또는 그와 병행하여) 닫혀야 하는 **open research track**을 열거한다.
각 트랙은 질문, 그것이 파생된 ADR/연구 문서, 그것이 critical path에 있는 이유,
그것을 해결하는 **spike**, **exit criterion**, 그리고 그 답을 필요로 하는 **phase**를 명시한다. 이 문서는
ADR에서 이미 확정된 것을 재결정하지 않는다 — 남은 미지수의 범위를 정할 뿐이다. 모든 트랙의 통합 제약은
CAW-04의 load-bearing 속성이다: **공개 표면은 구조적으로 public-safe하다**(내부 저장소로의 라이브 경로가 없는,
동결되고 검증된 정적 artifact). 어떤 트랙도 이 속성을 침식해서는 안 된다.

참조된 phase(빌드 계획 기준; runbook이 작성되면 그것을 참조):
`P0` core/skeleton · `P1` content model + storage · `P2` import + public-safe gate · `P3` web/API build ·
`P4` versioning/tombstone + operations · `P5` hardening/future connectors.

## 트랙 요약

| # | Track | Owning ADR / doc | Blocks phase | Risk if unresolved |
|---|-------|------------------|-------------|--------------------|
| T1 | CAW-02/03으로부터의 Provenance ancestor graph | ADR-0003, ADR-0002 | P2 | boundary를 로컬에서 재도출 불가; gate가 upstream을 맹목적으로 신뢰 |
| T2 | Redaction 엔진 선택(Presidio 대 regex/denylist) | ADR-0003 | P2 | recall 격차로 confidential 데이터 유출, 또는 ops 부담으로 빌드 정체 |
| T3 | Re-validation / revocation 피드 | ADR-0003, ADR-0004 | P4 | 재분류된 upstream 콘텐츠가 공개 상태로 남음 |
| T4 | unpublish 시 Cache/CDN purge 보장 | ADR-0003, ADR-0006 | P4 | Tombstone된 바이트가 edge에 잔존 |
| T5 | Bundle 서명 / attestation | ADR-0003, ADR-0004 | P2 | import가 인증되지 않은 upstream bundle을 신뢰 |
| T6 | Content negotiation(`Accept` 대 suffix) | ADR-0007, ADR-0001 | P3 | 캐시 분절; 에이전트 통합 마찰 |
| T7 | 검색(client index 대 server) | ADR-0001, ADR-0006 | P5 | 에이전트가 대규모로 artifact를 발견 불가 |
| T8 | Provenance dedup/우선순위(fan-in) | ADR-0004 | P2 | 두 소스의 동일 항목이 중복 발행 |
| T9 | Canonical serialization + digest 방식 | ADR-0005 | P1 | 재현 불가능한 해시가 immutability 증명을 깨뜨림 |

---

## T1 — CAW-02/CAW-03으로부터의 Provenance ancestor graph

- **Derives from:** ADR-0003(로컬 `boundary_eff` 재계산), ADR-0002(provenance/origin_ref sidecar),
  research `publishing-policy-and-public-safe.md`, `content-model-and-metadata.md`.
- **Question:** import bundle이 **전체 provenance ancestor graph**(모든 upstream 소스 +
  그 boundary claim, 전이적으로)를 함께 전달하여 CAW-04가 effective boundary를 로컬에서 재계산할 수 있게 하는가,
  아니면 평탄한 leaf claim만 전달하는가? 그리고 CAW-02/CAW-03이 고정할 수 있는 **안정적이고 버전이 매겨진 `origin_ref`**를
  노출하는가, 아니면 가변 핸들만 노출하는가?
- **Why critical:** ADR-0004는 public-safe 재검사를 **core stage**로 만들고 upstream claim을 **증거로만** 취급한다.
  재검사가 leaf claim만 볼 수 있다면 deny-by-default일 수 없다 — confidential한 ancestor로부터 파생된 public-safe leaf는
  반드시 실패해야 한다. graph는 그 재계산의 입력이다.
- **Spike:** CAW-02와 CAW-03(별개 제품, import 경계)으로부터 샘플 export를 요청하고; ancestor graph를 모델링하며;
  `boundary_eff = max(severity over all ancestors)`를 프로토타이핑하고; `origin_ref` immutability를 확인한다.
- **Exit criterion:** ancestor graph를 담는 문서화된 bundle schema 필드 + ancestor가 confidential일 때 실패하는 테스트를
  가진 결정적 재계산 규칙. 기억할 것: `origin_ref`/`origin_version`은 **audit 전용 sidecar 필드**이며 web/API로
  직렬화되어서는 안 된다([validation-and-tests.md](./validation-and-tests_ko.md) V2 참조).
- **Phase:** P2.

## T2 — Redaction 엔진 선택

- **Derives from:** ADR-0003(redaction), research `publishing-policy-and-public-safe.md`.
- **Question:** redaction/scan stage에 Microsoft **Presidio**(NLP recall, REST 배포 가능)를 쓸 것인가 대 더 가벼운
  **regex + denylist** 코어인가? CAW-04의 codename/fab/customer 패턴 목록은 어디에 위치하며, 공유 기반(substrate) 없이
  upstream boundary 정책과 doctrine 차원에서 어떻게 정합성을 유지하는가?
- **Why critical:** redaction은 gate 구성 요소이며; recall 실패는 confidential 데이터 유출이다. 그러나 Presidio는
  SSG 중심 빌드에 맞지 않을 수 있는 NLP 의존성과 ops 부담을 추가한다.
- **Spike:** 라벨링된 fixture 집합(합성 confidential 패턴 — codename/fab ID/customer 이름)을 구축하고; 두 옵션의
  recall/precision을 측정하며; 빌드 시간 비용을 측정한다. **어느 쪽이든 human curator 승인은 필수다** —
  엔진은 recall 보조 수단이지 gate가 아니다.
- **Exit criterion:** fixture 집합에서 측정된 recall/precision을 담은 결정 표(측정 전까지 숫자는 TODO로 표시)와
  선택된 엔진 + 패턴 목록 위치(아마도 CAW-04 자체 repo 내의 버전 관리된 파일).
- **Phase:** P2.

## T3 — Re-validation / revocation 피드

- **Derives from:** ADR-0003(재검증 주기), ADR-0004(upstream 철회), research import + policy 문서.
- **Question:** upstream 소스가 이후 **confidential로 재분류**되거나 **철회**될 때 CAW-04는 이를 어떻게 인지하고
  gate를 다시 실행하는가? provenance 참조가 **liveness 검사**(폴링)인가, **push** 통지인가, 아니면 주기적 재import인가?
  허용 가능한 staleness 윈도우는 무엇인가?
- **Why critical:** upstream에서 confidential이 된 발행 artifact는 철회될 때까지 상존하는 유출이다.
  이것이 public-safe 보장의 동적인 절반이다.
- **Spike:** 각 발행 artifact의 `origin_ref`를 다시 pull하고, boundary claim을 diff하며, 회귀 시 curator의
  `unpublish`/`redact` 제안을 큐에 넣는 `revalidate()` 패스를 프로토타이핑한다. pull 대 push를 결정한다
  (open-questions OQ — import 방향 참조).
- **Exit criterion:** 문서화된 revocation 피드 계약 + staleness 상한(TODO(open-question: numeric
  bound)) + 스케줄에 따라 gate를 다시 실행하는 runbook 단계.
- **Phase:** P4(import 방향에 의존; T8과 결합).

## T4 — unpublish 시 Cache / CDN purge 보장

- **Derives from:** ADR-0003(purge 보장), ADR-0006(SSG/edge), research policy + web/api stack.
- **Question:** 공개 artifact는 edge/CDN에 캐시될 수 있다. `unpublish`/`redact` 시 **purge까지의 시간 상한**은
  무엇이며, curator 작업이 완료로 보고되기 전에 purge가 **best-effort**인가 **보장**인가?
- **Why critical:** tombstone(HTTP 410)은 가장 느린 캐시만큼만 강하다. edge에 바이트를 남기는 redact는
  boundary-change 워크플로를 무력화한다.
- **Spike:** 배포 대상의 purge API를 평가하고(TODO(open-question: hosting target not yet fixed));
  `redact -> rebuild -> deploy -> purge -> verify-410` 파이프라인을 모델링하며; 짧은 max-age + 명시적 purge,
  아니면 immutable-with-versioned-URLs + index 제거 중 어느 쪽이 더 확실한 보장을 주는지 결정한다.
- **Exit criterion:** edge에서 410을 단언하는 검증 단계를 포함한 문서화된 purge 시퀀스 + 명시된 시간 상한.
  [validation-and-tests.md](./validation-and-tests_ko.md) V4(tombstone이 410을 반환)와 상호 링크.
- **Phase:** P4.

## T5 — Bundle 서명 / attestation

- **Derives from:** ADR-0003, ADR-0004(서명 방식), research policy + import 문서.
- **Question:** imported bundle에 어떤 서명/attestation 방식 — **DSSE / in-toto / minisign** — 이 bundle이
  주장된 검증 upstream에서 왔으며 전송 중 변조되지 않았음을 검증하는가?
- **Why critical:** 재검사는 bundle의 *내용을 증거로* 신뢰한다; 인증되지 않은 bundle은 공격자가
  "validated, public-safe" claim을 위조하게 한다. 서명은 증거 출처를 인증한다(core 재검사를 **대체하지 않는다** —
  deny-by-default는 여전히 적용된다).
- **Spike:** CAW-02로부터 서명된 샘플 bundle 검증을 프로토타이핑하고; 두 제품(CAW-02/03 -> CAW-04) 신뢰 경계에 대해
  세 방식의 키 관리 부담을 비교한다.
- **Exit criterion:** 선택된 방식 + 키 배포 메모 + 재검사 실행 전에 서명되지 않거나 무효한 bundle을 **거부**하는
  gate 단계.
- **Phase:** P2.

## T6 — Content negotiation

- **Derives from:** ADR-0007(결정: `Accept` 우선 + `.md`/`.json` suffix 보조), ADR-0001, research
  web/api + versioning 문서.
- **Question:** ADR-0007은 `Accept` header를 canonical로 하고 suffix를 alias로 선택했다. open detail: 일부 CDN은
  `Vary: Accept`를 잘 처리하지 못한다. 실무에서 **suffix가 cache-safe canonical** 경로이고 `Accept`는 멍청한
  클라이언트를 위한 편의 수단인가? 이는 **재결정이 아니라 구체화**다.
- **Why critical:** 잘못된 cache key는 CDN을 분절시키고 정적 artifact 모델을 약화시킨다; 에이전트는 안정적이고
  공유 가능한 URL을 필요로 한다.
- **Spike:** 후보 CDN에서 `Vary: Accept` 동작을 테스트하고; Astro 빌드가 모든 artifact에 대해 suffix route를
  정적으로 방출하는지 확인한다(web/API parity, ADR-0007).
- **Exit criterion:** 문서화된 CDN별 권고; 모든 artifact에 대해 suffix route 존재 검증.
- **Phase:** P3.

## T7 — 검색

- **Derives from:** ADR-0001, ADR-0006(deferred), research web/api stack, skills-distribution.
- **Question:** **사전 빌드된 클라이언트 측 인덱스**(Pagefind 스타일)가 v1에 충분한가, 아니면 에이전트가
  **서버 측 검색** 엔드포인트를 필요로 하는가? ADR은 런타임 검색을 연기한다; 이 트랙은 그것이 언제/돌아올지를 정한다.
- **Why critical:** 대규모 발견; 그러나 서버 측 검색 엔드포인트는 런타임 경로를 재도입하며, 이는 내부 저장소로의
  라이브 경로가 되어서는 안 된다. 어떤 검색이든 **public projection만** 인덱싱해야 한다.
- **Spike:** 빌드된 정적 사이트 위에서 Pagefind를 프로토타이핑하고; `index.json` manifest를 통해 인덱스 크기 +
  에이전트 질의 사용성을 측정한다(ADR-0007).
- **Exit criterion:** go/defer 결정; 구축 시, 오직 public 필드만 인덱싱함을 입증할 수 있는 정적 인덱스
  (sidecar/audit 필드 없음 — [validation-and-tests.md](./validation-and-tests_ko.md) V2 참조).
- **Phase:** P5(ADR-0007에 따라 deferred).

## T8 — Provenance dedup / 우선순위(fan-in)

- **Derives from:** ADR-0004(CAW-02 + CAW-03의 fan-in), research import 문서.
- **Question:** 두 source 어댑터가 **동일한 논리적 항목**을 노출할 때, dedup/우선순위 규칙은 무엇이며,
  병합 전반에서 provenance는 어떻게 보존되는가?
- **Why critical:** 중복 발행이나 병합에서 ancestor를 잃는 것은 audit 추적과 boundary 재계산을 손상시킨다
  (T1, T3과 결합).
- **Spike:** 논리적 동일성 키를 정의하고; ancestor graph를 union하고 우선순위를 기록하는 병합을 프로토타이핑한다.
- **Exit criterion:** 테스트를 가진, 문서화된 우선순위 + provenance 보존 병합 규칙(두 소스, 하나의 항목,
  단일 발행 artifact, 두 ancestor 모두 sidecar에 보존).
- **Phase:** P2.

## T9 — Canonical serialization + digest 방식

- **Derives from:** ADR-0005, research versioning-and-immutability.
- **Question:** 정확한 **canonical serialization** 사양(필드 순서, 공백, 어떤 메타데이터 필드가 해시된 envelope 안에
  있고 어떤 것이 sidecar에 있는가)과 **digest 알고리즘 + 접두사**(`sha256:` 대 multihash). 해시가
  sidecar/audit 필드를 포함하는가 아니면 public projection만 포함하는가?
- **Why critical:** content-digest는 immutability 증명이다; 재현 불가능한 해싱은 "영원히 동결" 보장(ADR-0005)과
  parity 테스트를 깨뜨린다.
- **Spike:** 두 번의 rebuild에 걸쳐 canonical normalization + hashing을 프로토타이핑하고; 동일한 digest를 단언한다.
- **Exit criterion:** 작성된 serialization 사양 + 선택된 알고리즘/접두사 + 재현성 테스트. 결정:
  해시는 **public projection**을 포함한다(따라서 sidecar 변동이 public 콘텐츠를 결코 재해싱하지 않음). 단,
  T1이 audit 무결성에 다른 필요가 있음을 보이는 경우는 예외 — TODO(open-question).
- **Phase:** P1.

## runbook에 대한 함의

- P1 runbook은 콘텐츠가 동결되기 전에 T9(canonical hash)를 완료해야 한다.
- P2 runbook은 T1, T2, T5, T8을 완료해야 한다 — ancestor graph(T1), 서명된 증거(T5),
  병합 규칙(T8) 없이는 gate가 deny-by-default일 수 없다.
- P4 runbook은 T3 + T4를 완료해야 한다 — public-safe 보장의 동적인 절반.
- T6/T7은 P3/P5 구체화 작업이다; core publish 경로를 막지 않는다.
- 모든 트랙의 exit 테스트는 [validation-and-tests.md](./validation-and-tests_ko.md)에 속한다; 모든 미해결
  세부 사항은 [open-questions.md](./open-questions_ko.md)에 반영된다.
