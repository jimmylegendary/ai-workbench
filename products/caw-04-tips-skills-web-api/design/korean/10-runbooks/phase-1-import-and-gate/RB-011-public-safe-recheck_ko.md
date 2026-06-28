# RB-011: CORE public-safe re-check 구축 (deny-by-default, 로컬에서 다시 도출되는 boundary)

- Status: ready
- Phase: phase-1-import-and-gate
- Depends on: [RB-010 (staged 후보 + envelope + sidecar provenance)]
- Implements design:
  - [../../05-publishing-core/import-and-recheck_ko.md](../../05-publishing-core/import-and-recheck_ko.md)
  - [../../04-data-layer/public-safe-and-provenance_ko.md](../../04-data-layer/public-safe-and-provenance_ko.md)
  - [../../07-backend-api/import-service_ko.md](../../07-backend-api/import-service_ko.md)
  - [../../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md](../../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md)
- Produces: `pub.safe` core re-check 라이브러리(`runRecheck(staged) → RecheckVerdict`), `boundary_eff`/`visibility_eff` 재도출, 렌더링된 public view에 대한 redaction + 자유 텍스트(free-text) 유출 스캔, conflation guard, core 내의 `profiles.recheck` config, 그리고 부정(negative) 케이스 위주의 mutation 테스트 스위트.

## Objective

import된 모든 후보는 **단일하고 우회 불가능한 core 단계**를 통과하며, 이 단계는 public-safe 판정을 **로컬에서** 다시 도출한다 — upstream boundary claim을 절대 신뢰하지 않는다. re-check는 **deny-by-default이며 fail-closed**다: public-safe임이 긍정적으로 확인되지 않은 것은 무엇이든 `quarantine` 또는 `reject`가 되며, 절대 `publish` 대상이 되지 않는다. 이 단계는 항목과 **모든** provenance 조상(ancestor)에 대한 lattice-max로 `boundary_eff`를 재도출하고(해석 불가능한 조상 ⇒ `confidential`/`private`), 독자가 보게 될 **렌더링된 public view**에 redaction 룰셋을 다시 실행하며, 자유 텍스트에서 유출 마커를 스캔하고, conflation을 방어한다. 이 단계는 타입화된 `RecheckVerdict`(및 append-only audit 이벤트)를 내보내고 서빙되는 코퍼스에는 **아무것도** 쓰지 않는다. "Done"의 정의 = upstream에서 `public`으로 표시된 confidential 태그 fixture가 finding과 함께 quarantine되고, 깨끗한 검증된 Skill이 `publish` 대상이 되는 것이다.

## Preconditions

- [ ] RB-010이 파싱된 envelope(`provenance.graph` 포함), 증거 전용 `upstream_boundary_claim`, sidecar provenance 레코드를 지닌 staged 후보를 안착시켰다.
- [ ] boundary 모델이 core 내에 로컬로 사용 가능하다(두 축: `boundary {public ⊂ internal ⊂ confidential}`, `visibility {team, private}`) — CAW-04-OWN 사본이며, CAW-02에 대한 공유 의존이 아니다.
- [ ] 파이프라인 순서가 어떤 git 쓰기보다 **앞에** re-check를 고정한다. re-check는 **core**에 존재하며 절대 adapter에 있지 않다(ADR-0004 §2).
- [ ] public-projection / sidecar split이 존재하여(RB-001) re-check가 정확한 public view를 렌더링할 수 있다.

## Steps

1. **re-check를 우회 불가능한 core 단계로 배치한다.**
   - Do: core에 `runRecheck(staged: StagedCandidate): RecheckVerdict`를 구현하되, staging과 curator gate 사이의 고정된 파이프라인 경로 위에 둔다. 이를 우회하는 **raw import 경로는 없다**(ADR-0004 §2). 에이전트와 사람은 동일한 검사를 사용한다.
   - Verify: 구조 테스트로 staging에서 curator queue로 가는 유일한 경로가 `runRecheck`를 통과함을 확인한다. 어떤 adapter, registry config, 대체 진입점도 queue에 직접 도달하지 못한다.

2. **Stage 1 — envelope 파싱 + semver/integrity gate.**
   - Do: 계약 MAJOR가 지원됨과 `payload_sha256`이 canonical 화된 payload와 일치함을 다시 확인한다(re-assert). 실패 시 ⇒ `reject`(절대 추측 금지).
   - Verify: 알 수 없는 MAJOR ⇒ `reject`; digest 불일치 ⇒ `reject`.

3. **Stage 2 — provenance로부터 `boundary_eff` / `visibility_eff`를 로컬에서 재도출한다.**
   - Do: `boundary_eff`를 항목 + `provenance.graph`의 **모든** 조상에 대한 **lattice-max**로 계산한다. `visibility_eff`를 계산하고, `private` 조상이 하나라도 있으면 ⇒ private-derived다. **해석 불가능한 조상은 `confidential`/`private`로 해석된다**(fail-closed unknown). `boundary.recheck_status`를 CAW-04 자체(OWN) 계산으로 설정한다 — upstream 플래그를 절대 `classification`으로 복사하지 않는다.
   - Verify: `confidential` 조상 하나를 인용하는 후보는 `boundary_eff = confidential`을 산출하고, 해석 불가능한 조상은 fail-closed `confidential`을 산출하며, upstream `declared_boundary` 값은 절대 결과를 결정하지 않는다.

4. **Stage 2b — boundary 판정.**
   - Do: `boundary_eff == public` AND `visibility_eff == team`인 경우에만 진행할 수 있다. 그 외에는 ⇒ `quarantine`(`BOUNDARY_NOT_PUBLIC`).
   - Verify: `internal`/`confidential` 또는 private-derived 후보는 upstream claim과 무관하게 quarantine된다.

5. **Stage 3 — RENDERED PUBLIC VIEW에 대한 redaction 스캔.**
   - Do: 정확한 public projection(템플릿 적용 후 md/JSON/HTML)을 빌드하고 그 위에 redaction 룰셋(`scan(rendered_public_view) → Hit[]`)을 실행한다 — raw 필드만이 아니다. **candidate-public 항목에서의 hit는 무엇이든 ⇒ quarantine + escalate. 절대 자동 제거(auto-strip)하지 않는다**(hit는 source가 잘못 분류했다는 의미다). 룰셋 버전은 CAW-04 소유(`ruleset_version`)이며 CAW-02에서 import되지 않는다.
   - Verify: 템플릿 렌더링 후에만 보이는 유출 마커를 가진 후보는 hit가 기록된 채 quarantine되며, 후보는 절대 조용히 변형되지 않는다.

6. **Stage 4 — 자유 텍스트 유출 스캔.**
   - Do: 자유 텍스트에서 코드네임, fab/고객 정규식, 내부 host/URL, 직원 id를 스캔한다. hit는 무엇이든 ⇒ finding ⇒ quarantine.
   - Verify: 내부 host 문자열을 포함한 fixture는 finding과 함께 quarantine된다.

7. **Stage 5 — conflation guard.**
   - Do: public source를 confidential source와 융합한 후보는 거부/quarantine한다(합성을 통한 세탁 금지). public-source 연구를 내부 claim과 분리해서 유지한다(brief §11).
   - Verify: public 조상과 confidential 조상을 섞은 병합 후보는 차단된다.

8. **타입화된 판정 + audit 이벤트를 내보낸다(store 쓰기 없음).**
   - Do: `RecheckVerdict { decision: publish | quarantine | reject, boundary_eff, findings[], evidence_ref }`를 반환한다. hash-chained `_events` 원장에 `recheck` 이벤트 하나를 append하고 `evidence_ref`를 설정한다. sidecar `recheck` 블록(`status`, `rechecked_at`, `boundary_eff`, `visibility_eff`)을 채운다. 서빙되는 코퍼스에는 **아무것도** 쓰지 않는다. `publish` 판정은 후보를 **eligible**하게 만들 뿐이다(curator G8은 RB-012에서 여전히 필요).
   - Verify: 통과한 후보는 `decision = publish` + sidecar `recheck.status = pass`를 산출한다. audit 이벤트가 append되고 `verify_audit()`이 여전히 체인을 검증하며, 서빙 출력은 생성되지 않는다.

9. **임계값(threshold) + 패턴 목록을 `profiles.recheck`에 둔다(core 전용).**
   - Do: 임계값과 패턴 목록을 core 내의 `profiles.recheck`에 보관한다 — 절대 adapter에 두지 않는다. registry는 adapter가 re-check를 재정의하게 절대 허용할 수 없다(ADR-0004 §4).
   - Verify: 테스트로 어떤 adapter도 `profiles.recheck`를 읽기/쓰기/재정의할 수 없음을 확인한다.

10. **부정 케이스 위주 + mutation 테스트 스위트.**
    - Do: denial 케이스가 지배적인 테스트를 작성한다. 핵심 케이스: confidential 패턴을 지닌 upstream-`public` 후보는 반드시 quarantine + finding 로그를 남겨야 한다. mutation 테스트를 추가한다: 기본 결정을 `publish`로 약화시키면 스위트가 반드시 깨져야 한다.
    - Verify: 스위트가 통과하고, mutation(default → `publish`)이 스위트를 실패하게 만든다.

## Acceptance criteria

- [ ] `runRecheck`는 staging과 curator queue 사이의 단일하고 우회 불가능한 core 단계다.
- [ ] `boundary_eff`는 항목 + 모든 조상에 대한 lattice-max로 로컬에서 재도출되며, 해석 불가능 ⇒ fail-closed `confidential`/`private`.
- [ ] upstream `declared_boundary`/`public_safe` claim은 증거 전용이며 절대 `classification`/`recheck_status`를 설정하지 않는다.
- [ ] redaction은 **렌더링된 public view**를 스캔한다. hit는 무엇이든 ⇒ quarantine + escalate, 절대 auto-strip 안 함.
- [ ] 자유 텍스트 유출 스캔과 conflation guard가 강제된다.
- [ ] Deny-by-default: public-safe임이 긍정적으로 확인되지 않은 후보는 `quarantine`/`reject`이며, 절대 `publish`가 아니다.
- [ ] 각 판정은 `recheck` audit 이벤트를 append한다. sidecar `recheck` 블록이 채워지고, 서빙 출력은 쓰여지지 않는다.
- [ ] `profiles.recheck`는 core에 존재한다. 어떤 adapter도 이를 재정의할 수 없다.
- [ ] 부정 케이스 위주 + mutation 테스트: 기본값을 `publish`로 약화시키면 스위트가 깨진다.
- [ ] 트리가 green이다(빌드, lint, 테스트 통과).

## Rollback / safety

- re-check는 서빙되는 코퍼스에 아무것도 쓰지 않고 후보를 eligible로 표시만 한다 — 중간 실패가 publish할 수 없다. 안전한 rollback = 판정 + staged 후보 폐기(격리는 일회성). append된 audit 이벤트는 append-only이며 기록으로 남는다(체인을 다시 쓰지 말 것).
- re-check가 건너뛸 수 있음이 발견되면 이를 릴리스 blocker로 취급한다: deny-by-default + non-bypass 속성이 핵심을 지탱하는(load-bearing) public-safe 보장이다.

## Hand-off

RB-012(publish gate + curator approval)는 다음을 가정할 수 있다: 모든 후보가 로컬에서 재도출된 `boundary_eff`, findings 목록, audit 원장으로의 `evidence_ref`를 가진 타입화된 `RecheckVerdict`를 지닌다. sidecar `recheck` 블록이 채워져 있다. RB-012는 `publish`-eligible 후보를 curator queue로 소비하고, promotion 시점에 re-check를 다시 실행하며, 명시적 human approve(G8)만이 후보를 live로 전환한다. 여기서 생성된 boundary 판정이 권위를 가진다. upstream claim은 절대 그렇지 않다.
