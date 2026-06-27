# RB-052: 공유 boundary/redaction 검증 라이브러리 구축

- Status: ready
- Phase: phase-5-import-export
- Depends on: [RB-030 (provenance/trust + monotone propagation), RB-031 (effective-boundary computation), RB-002 (envelope-agnostic core txn + audit/_events)]
- Implements design:
  - [../../01-decisions/ADR-0007-import-export-contracts.md](../../01-decisions/ADR-0007-import-export-contracts_ko.md) (§1 envelope, §5 defaults, §6 skill-wrap parity)
  - [../../05-knowledge-core/import-export-flows.md](../../05-knowledge-core/import-export-flows_ko.md) (§1 boundary principles, §2 shared envelope, "RB (boundary-validation lib)")
  - [../../04-data-layer/provenance-and-boundaries.md](../../04-data-layer/provenance-and-boundaries_ko.md) (§1 two axes, §2 monotone propagation)
- Produces: 다음을 노출하는 제품 내 라이브러리 `kr.boundary`: 엔벌로프 검증기 + semver gate, 정규 redaction 룰셋 + `redact()`/`scan()`, effective-boundary/visibility 평가기, fail-closed allow-list 결정 함수, 횡단별 audit 엔트리 작성기. 더불어 어떤 confidential 데이터도 어떤 boundary를 넘지 않음을 증명하는 fail-closed 테스트 스위트.

## 목표
모든 import/export runbook이 호출하는 **하나의 공유 라이브러리**를 구축하여 기밀성 강제가 양방향에서 동일하고 이를 우회하는 raw 경로가 없게 한다. "완료(Done)" = (a) 공통 엔벌로프를 검증하고 semver-gate하며, (b) monotone propagation으로 **effective** `boundary`/`visibility`를 계산하고(선언된/행-로컬 플래그를 절대 신뢰하지 않음), (c) 정규 재-redaction 룰셋을 실행하여 hit 목록을 반환하고, (d) **fail-closed 기본값**(불확정 → 제외)으로 allow/exclude를 결정하며, (e) 구조화된 횡단별 audit 엔트리를 쓰는 단일 모듈(`kr.boundary`). 음성 위주의 테스트 스위트가 `confidential`/`jimmy-private` 항목이 어떤 boundary도 절대 통과할 수 없고, 모호성은 항상 제외로 해석됨을 증명한다.

## 사전 조건
- [ ] RB-030/RB-031이 머지되었다: `boundary_eff(n)`과 `visibility_eff(n)`이 provenance 조상(`evidence_for | challenges | extracted_from | cites | derived_from`)에 대해 계산 가능하다.
- [ ] Core txn + append-only `_events` audit(RB-002)이 audit 작성기가 체인에 연결할 수 있도록 사용 가능하다.
- [ ] `boundary` 격자 `public ⊂ internal ⊂ confidential`와 `visibility {team, private}`가 데이터 계층에 `NOT NULL` 기본값 `internal`/`private`로 정의되어 있다.
- [ ] HEAD에서 tree가 green이다(build + lint 통과).

## 단계

1. **엔벌로프 스키마 + semver gate를 정의한다.**
   - 할 일: 공유 엔벌로프(ADR-0007 §1 / flows §2)를 JSON-schema와 타입 지정 로더 `parse_envelope(bytes) -> Envelope`로 인코딩한다. `semver_gate(contract_version, supported_major)`를 구현한다: semver를 파싱; `MAJOR`가 알 수 없거나 지원되지 않으면 → `ERR_CONTRACT_MAJOR_UNKNOWN` 발생(거부, 절대 추측 안 함). 정규화된 payload에 대해 `payload_sha256`를 검증; 불일치 → `ERR_PAYLOAD_DIGEST_MISMATCH`.
   - 검증: 단위 테스트 — `supported_major=1`에 대한 `2.0.0` 엔벌로프는 거부된다; 변조된 payload(한 바이트 뒤집힘)는 digest 검사에 실패한다; 형식이 올바른 `1.x.y` 엔벌로프는 파싱된다.

2. **정규 redaction 룰셋을 구현한다.**
   - 할 일: codename/fab/customer/PII 패턴을 버전 지정되고 자체 완결적인 목록(`ruleset_version`)으로 담는 `ruleset.py`를 만든다. CAW-02가 소유 — 다른 어떤 제품으로부터도 import하지 않음(공유 의존 없음; regex 위치에 관한 open question 참조). `scan(strings) -> [Hit{rule_id, span, sample}]`와 `redact(strings) -> (redacted, [Hit])`를 노출한다.
   - 검증: 심어둔 codename/fab/customer/internal-host 마커를 포함한 테스트 fixture는 각각 올바른 `rule_id`의 hit을 생성한다; 깨끗한 public 텍스트는 0개의 hit을 생성한다. `ruleset_version`이 출력에 드러난다.

3. **effective-boundary / effective-visibility 평가를 래핑한다.**
   - 할 일: RB-031 propagation을 호출하는 `effective_boundary(node_id) -> boundary`와 `effective_visibility(node_id) -> visibility`를 노출한다: `boundary_eff = max_lattice(self, ancestors)`, `visibility_eff = team iff self and all ancestors team`. 캐시된/선언된 플래그를 답으로 절대 읽지 않는다; propagation이 조상을 해석할 수 없으면 → `confidential`/`private`로 취급한다(fail-closed unknown).
   - 검증: 테스트 — `confidential` Claim을 인용하는 `internal`로 선언된 Note는 `confidential`로 해석된다; 해석 불가능한 조상을 가진 노드는 선언된 값이 아닌 `confidential`/`private`로 해석된다.

4. **fail-closed allow-list 결정 함수를 구현한다.**
   - 할 일: `decide(item, target_audience) -> ALLOW | EXCLUDE{reason}`. 규칙: `target_audience=public` ⇒ `effective_boundary == public`일 때만 ALLOW; `visibility_eff == private`(jimmy-private) ⇒ 어떤 audience에 대해서도 절대 ALLOW 안 함; `target_audience=internal` ⇒ `internal`까지만 ALLOW. **기본 분기 = EXCLUDE**(인식되지 않거나 불확정한 상태는 모두 제외). 이 함수는 전(total)이고 부작용이 없다.
   - 검증: `{public,internal,confidential} × {team,private} × {public,internal}` audience의 교차곱에 대한 property test — 모든 `confidential` 항목과 모든 `private` 항목은 `public` audience에 대해 EXCLUDE이다; confidential/private→public 횡단에 대해 어떤 입력 경로도 ALLOW를 반환하지 않는다; 알 수 없는 enum 값은 EXCLUDE를 반환한다.

5. **횡단별 audit 엔트리 작성기를 구현한다.**
   - 할 일: `write_crossing_audit(direction, boundary_kind, selected_ids, dropped_ids, redaction_hits, ruleset_version, envelope_digest)`는 core audit API(RB-002)를 통해 `knowledge/_events/`에 정확히 하나의 해시 체인 줄을 추가한다. Direction ∈ `{import, export}`.
   - 검증: 시뮬레이션된 횡단은 drop된 id와 redaction delta를 포함한 정확히 하나의 `_events` 줄을 추가한다; 추가 후에도 해시 체인이 여전히 검증된다.

6. **단일 라이브러리 서피스를 노출하고 그것을 유일한 경로로 만든다.**
   - 할 일: `kr.boundary.__init__`에서 `parse_envelope`, `semver_gate`, `scan`, `redact`, `effective_boundary`, `effective_visibility`, `decide`, `write_crossing_audit`를 re-export한다. import/export runbook이 이 모듈을 통해 라우팅해야 함을 문서화한다(skill-wrap parity, ADR-0007 §6).
   - 검증: grep/lint 검사(또는 아키텍처 테스트)가 어떤 import/export 모듈도 redaction이나 boundary 비교를 로컬에서 재구현하지 않음을 단언한다.

7. **fail-closed 횡단 테스트 스위트를 작성한다.**
   - 할 일: `test_no_confidential_crosses.py`를 추가한다: (a) `confidential`은 절대 `public`으로 넘지 않음, (b) `jimmy-private`은 어떤 audience도 절대 넘지 않음, (c) 불확정 → EXCLUDE, (d) 심어둔 마커에 대해 redaction hit이 항상 반환됨, (e) semver MAJOR 불일치 거부를 단언하는 golden 케이스. 이를 boundary-safety 회귀 게이트로 표시한다.
   - 검증: `test_no_confidential_crosses`가 통과한다; `decide`의 기본값을 의도적으로 ALLOW로 약화시키면 스위트가 실패한다(테스트 docstring에 mutation 검사 문서화).

## 수용 기준
- [ ] `kr.boundary`는 Step 6의 전체 서피스를 노출한다; 다른 곳에 중복된 redaction/boundary 로직이 존재하지 않는다.
- [ ] 알 수 없는 엔벌로프 MAJOR와 payload-digest 불일치는 명명된 오류로 거부된다.
- [ ] `decide()`는 전(total)이고 부작용이 없으며 모든 불확정/알 수 없는 입력에 대해 EXCLUDE한다(default-deny).
- [ ] effective boundary/visibility는 provenance 조상에 대한 propagation에서 나온다, 절대 선언된/행-로컬 플래그가 아님; 해석 안 된 조상 ⇒ `confidential`/`private`.
- [ ] fail-closed 스위트는 어떤 `confidential` 항목도 `public`으로 넘지 않고 어떤 `jimmy-private` 항목도 어떤 audience도 넘지 않음을 증명한다.
- [ ] 각 시뮬레이션된 횡단은 정확히 하나의 해시 체인 `_events` audit 줄을 쓴다.
- [ ] Tree가 green이다(build + lint + tests).

## 롤백 / 안전
- 라이브러리는 부가적(additive)이고 순수하다; 스키마 마이그레이션 없음. 롤백하려면 `kr.boundary` 패키지와 그 테스트를 되돌린다 — 이 runbook은 데이터를 변경하지 않는다(audit 작성기는 RB-050/051의 실제 횡단에서만 호출된다).
- 구성상 fail-closed: 모듈이 로드에 실패하면 의존하는 importer/exporter가 실행될 수 없으므로, 망가진 빌드는 누출이 아닌 횡단 차단으로 이어진다.

## 인계
RB-050(import CAW-01/05)과 RB-051(export CAW-03)은 다음을 가정할 수 있다: 검증되고 semver-gate된 엔벌로프 로더, 정규 `scan`/`redact` 룰셋, propagation 기반 `effective_boundary`/`effective_visibility`, fail-closed `decide()`, 횡단별 audit 작성기 — 모두 `kr.boundary`로부터. 이들 중 어느 것도 재구현해서는 안 된다.
