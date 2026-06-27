# RB-051: fail-closed CAW-03 cited-bundle exporter 구축

- Status: ready
- Phase: phase-5-import-export
- Depends on: [RB-052 (boundary/redaction validation lib), RB-040 (retrieval + provenance hydration), RB-031 (effective-boundary propagation), RB-002 (core txn + audit)]
- Implements design:
  - [../../05-knowledge-core/import-export-flows.md](../../05-knowledge-core/import-export-flows_ko.md) (§5 Export, fail-closed allow-list, bundle payload)
  - [../../01-decisions/ADR-0007-import-export-contracts.md](../../01-decisions/ADR-0007-import-export-contracts_ko.md) (§4 export to CAW-03, §5 fail-closed defaults)
  - [../../04-data-layer/provenance-and-boundaries.md](../../04-data-layer/provenance-and-boundaries_ko.md) (§2 monotone propagation, §4 trust ladder)
- Produces: skill-wrap op `kr.export_bundle` — read-only, boundary 필터링, 서명됨. 인용된 `Claim`+`Evidence`의 서명된 `*.caw03-bundle.json`(버전 지정 엔벌로프, `boundary_kind=caw03-bundle`)을 자체 완결적인 `bibliography`와 `provenance_digest`와 함께 방출한다. Fail-closed: 빈 결과/과다 공유는 중단된다.

## 목표
인용된 Claim+Evidence bundle을 CAW-03에 **confidential이나 jimmy-private 데이터를 절대 누출하지 않고** 넘기는 exporter를 구축한다. "완료(Done)" = 명시적 curator 선택 시, 각 Claim의 evidence chain이 해석되고 게이트되며(≥1 구체적 Evidence; `generated-summary`만은 거부됨), 각 엔티티의 **effective** boundary/visibility가 monotone propagation으로 계산되고, fail-closed audience allow-list가 불확정한 것을 모두 제외하며, 모든 문자열에 대한 재-redaction 스윕이 hit 발생 시 중단하고, 인용이 자체 완결적 `bibliography`로 해석되며, Note는 `kind=synthesis, evidence=false`로 태깅되고, bundle이 버전 지정 엔벌로프 안에서 digest + 서명된다. CAW-02는 파일을 **방출**할 뿐 CAW-03에 절대 쓰지 않는다. 결과 bundle이 비어 있거나, public bundle에 대해 `jimmy-private`/`confidential` 항목이 명시적으로 요청되면, **전체 export가 중단**되며 위반 id 보고서를 낸다 — 절대 부분적인 조용한 누출이 아니다.

## 사전 조건
- [ ] RB-052가 머지되었다: `decide()`(fail-closed allow-list), `effective_boundary`/`effective_visibility`, `scan`/`redact`, `parse_envelope`, `write_crossing_audit`가 `kr.boundary`에서 사용 가능하다.
- [ ] Retrieval(RB-040)이 Claim의 전체 provenance chain(source→claim→evidence)을 hydrate할 수 있어 bundle이 hydrate된 retrieval 결과가 된다.
- [ ] 서명 키 + 스킴이 구성되어 있다. `TODO(open-question: signature scheme — minisign/cosign/DSSE vs detached sig?)`
- [ ] HEAD에서 tree가 green이다.

## 단계

1. **선택 + evidence-chain 해석을 구현한다.**
   - 할 일: `kr.export_bundle(claim_ids, target_audience, purpose)` — 선택은 **명시적 curator 동작**이다. 각 Claim에 대해 retrieval(RB-040)을 통해 그 `Evidence` chain을 hydrate한다.
   - 검증: claim id 집합이 주어지면, op은 각 Claim을 해석된 Evidence 목록과 함께 반환한다; 존재하지 않는 id는 아무것도 방출하지 않고 명확히 오류를 낸다.

2. **불변식 게이트를 강제한다.**
   - 할 일: 구체적 Evidence가 0개이거나 `generated-summary` evidence만 있는 Claim을 거부한다. 거부된 claim은 요청 집합에서 조용히 누락되지 않고 보고된다.
   - 검증: evidence가 없는 claim과 `generated-summary` evidence만 있는 claim은 둘 다 명명된 이유와 함께 거부된다.

3. **엔티티별 effective boundary/visibility를 계산한다.**
   - 할 일: 모든 Claim, Evidence, 인용된 Note에 대해 `kr.boundary`를 통해 `effective_boundary`/`effective_visibility`를 계산한다(provenance 조상에 대한 monotone propagation) — 행 자체의 선언된 플래그가 **아님**.
   - 검증: `public`으로 선언되었지만 `confidential` Evidence를 인용하는 Claim은 effective `confidential`로 해석된다; `private` 조상을 가진 Claim은 effective `private`로 해석된다.

4. **fail-closed audience allow-list를 적용한다.**
   - 할 일: 각 엔티티에 대해 `decide(item, target_audience)`를 호출한다. `target_audience=public`은 **effective** `boundary != public`인 모든 엔티티를 drop한다; `jimmy-private`(effective visibility `private`) 항목은 어떤 audience에 대해서도 **절대** export되지 않는다; 불확정 → EXCLUDE. drop된 id를 이유와 함께 수집한다.
   - 검증: `public` audience에 대해, `internal`/`confidential` effective 엔티티는 모두 제외된다; `jimmy-private` 엔티티는 `public`과 `internal` audience 모두에 대해 제외된다.

5. **재-redaction 스윕을 실행한다(hit 시 중단).**
   - 할 일: 살아남은 엔티티의 모든 text/locator/citation 문자열에 대해 `scan()`/`redact()`를 실행한다(codename/fab/customer). **어떤 hit이든 전체 export를 중단**시키며 위반 id를 낸다(제외 이후에도 심층 방어).
   - 검증: 심어둔 codename을 포함한 살아남은 엔티티는 export를 중단시킨다; 깨끗한 문자열은 통과한다.

6. **conflation + artifact-disclosure 규칙을 적용한다.**
   - 할 일: conflation guard를 강제한다(어떤 export된 claim도 public-source와 confidential evidence를 융합할 수 없음 — 중단). raw `artifact_ref` blob은 `target_audience=internal`일 때만 포함한다; 아니면 ref를 제거하고 `value`만 유지한다(projection이 측정값으로 제시될 수 없도록 CI/unit 유지).
   - 검증: conflated claim은 중단된다; `public` audience에 대해 `artifact_ref`는 null이지만 `value`/CI/unit은 남는다; `model-projection` evidence는 CI/unit을 유지한다.

7. **자체 완결적 bundle payload를 조립한다.**
   - 할 일: 모든 인용을 dedup된 `bibliography`로 해석한다(CAW-03이 CAW-02로부터 다른 것을 필요로 하지 않도록); export된 Note를 `kind=synthesis, evidence=false`로 태깅한다. flows §5에 따라 bundle payload를 구축한다(trust/boundary를 가진 claims[]와 evidence[] {kind, locator, citation, artifact_ref|null, value}).
   - 검증: `claims[*].evidence`의 모든 인용은 `bibliography` 엔트리로 해석된다; Note는 `evidence=false`를 지닌다; 매달린(dangling) 인용 없음.

8. **빈 결과 / 명시적 과다 공유를 거부한 뒤 digest + 서명 + wrap.**
   - 할 일: 모든 엔티티가 drop되면 → **거부**(아무것도 방출하지 않고 보고서 반환). public bundle에 `jimmy-private`/`confidential` 항목이 **명시적으로 요청**되면 → 위반 id와 함께 **전체 export 중단**. 아니면 `provenance_digest`(claims+evidence에 대한 sha256)를 계산하고 서명한 뒤 버전 지정 엔벌로프(`boundary_kind=caw03-bundle`)로 wrap한다.
   - 검증: 전부 drop된 선택은 파일을 방출하지 않고 오류 보고서를 반환한다; public 내 명시적 confidential 요청은 중단된다; 유효한 선택은 digest가 재검증되고 서명이 유효한 서명된 엔벌로프를 생성한다.

9. **파일 + 횡단별 audit 엔트리를 방출한다.**
   - 할 일: `*.caw03-bundle.json`을 쓴다; `write_crossing_audit(direction="export", boundary_kind="caw03-bundle", selected_ids, dropped_ids, redaction_hits, ...)`를 호출한다. CAW-02는 방출만 한다; CAW-03에 절대 쓰지 않는다.
   - 검증: 정확히 하나의 해시 체인 `_events` 줄이 선택된 id, drop된 id, redaction delta를 기록한다; 방출된 파일이 유일한 외부 artifact이다.

## 수용 기준
- [ ] export는 allow-list에 없는 것을 모두 생략한다(fail-closed); `confidential`/`jimmy-private` 항목은 public 대상 bundle에 **절대** 나타날 수 없다(선언된 플래그가 아닌 effective boundary/visibility 기준).
- [ ] 모든 export된 Claim은 ≥1 구체적 Evidence를 싣는다; evidence가 없거나 `generated-summary`만 있는 claim은 거부된다.
- [ ] 어떤 redaction hit, conflation, 빈 결과, 명시적 과다 공유 요청이든 위반 id 보고서와 함께 **전체 export를 중단**시킨다 — 절대 부분적인 조용한 누출이 아니다.
- [ ] bundle은 서명되고, `provenance_digest`와 자체 완결적 `bibliography`를 싣는다; Note는 `evidence=false`이다; `artifact_ref`는 `internal` audience에만 포함된다.
- [ ] 이것은 파일/API 경계일 뿐이다 — CAW-02는 방출하고 CAW-03에 절대 쓰지 않는다; 공유 store 없음.
- [ ] 각 export는 정확히 하나의 해시 체인 audit 엔트리를 쓴다; op은 `kr.boundary`를 통한 skill-wrap으로만 실행된다.
- [ ] Tree가 green이다(build + lint + tests).

## 롤백 / 안전
- export는 knowledge store에 대해 read-only이다: knowledge 노드를 생성하지 않고 방출된 파일 + audit 한 줄만 만든다. 롤백 = 방출된 파일 삭제; audit 줄은 남는다(append-only 이력).
- 구성상 fail-closed: 불확정 → 제외; 빈 결과/과다 공유 → 아무것도 방출하지 않고 중단. 망가진 서명기는 서명되지 않은 bundle을 보내는 대신 방출 전에 중단한다.

## 인계
CAW-03(별도 제품)은 서명되고 자체 완결적인 `*.caw03-bundle.json`을 가져와 그 `provenance_digest` + 서명을 검증하고, `bibliography`로부터 BibTeX를 방출하며, `confidential`/`jimmy-private`이 전혀 없고 synthesis가 non-evidence로 플래그됨을 신뢰할 수 있다. 추가 CAW-02 호출이 필요 없다; boundary는 감사 가능하고 재현 가능하다.
