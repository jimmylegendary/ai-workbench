# RB-050: CAW-01 projection + CAW-05 signal importer 구축

- Status: ready
- Phase: phase-5-import-export
- Depends on: [RB-052 (boundary/redaction validation lib), RB-002 (core txn + evidence gate + op manifest), RB-030 (provenance/trust), RB-012 (deterministic reindex)]
- Implements design:
  - [../../05-knowledge-core/import-export-flows.md](../../05-knowledge-core/import-export-flows_ko.md) (§3 Import A CAW-01, §4 Import B CAW-05, §6 mapping table)
  - [../../01-decisions/ADR-0007-import-export-contracts.md](../../01-decisions/ADR-0007-import-export-contracts_ko.md) (§2 CAW-01→Evidence, §3 CAW-05→typed nodes, §5 defaults)
  - [../../04-data-layer/provenance-and-boundaries.md](../../04-data-layer/provenance-and-boundaries_ko.md) (§5 evidence gate, §6 quarantine-on-import)
- Produces: skill-wrap op `kr.import_projection`(CAW-01)과 signal intake(`kr.classify_signal` / `kr.extract_claims`)(CAW-05); quarantine 파티션; content-addressed vault 복사 경로; projection을 `Evidence`(절대 `Claim`이 아님)로 만들고 signal의 `raw_summary`를 evidence에서 제외하는 노드 매핑.

## 목표
외부 knowledge를 boundary를 넘어 **안전하게** 가져오는 두 importer를 구축한다. "완료(Done)" = CAW-01 projection 파일이 **quarantine**되어 착륙하고, 기밀성 검사(boundary floor, scrub, 재-redaction, leak scan, audience)를 통과하며, CAW-02의 content-addressed vault로 복사되고, `Evidence`(+ `SimulationRun`/`Experiment` ref)로 매핑된다 — **절대 `Claim`이 아님**; 그리고 CAW-05 signal이 quarantine되고, dedup되고, 기밀성 검사를 받고, `Source`/`RelatedWork`/`Claim`/`OpenQuestion`으로 매핑되되, 후보 Claim의 evidence = `Source` + `evidence_locator`이고 `raw_summary`는 `kind=generated-summary`로 저장되며 **evidence에서 제외**된다. 둘 다 `kr.boundary`를 통한 검증된 skill-wrap 동작으로만 실행된다; 검사가 통과하기 전에는 아무것도 쿼리 가능하지 않다; 각 횡단은 audit 엔트리 하나를 쓴다. import는 trust를 다운그레이드할 수 있지만 boundary를 조용히 업그레이드하지 않는다; import된 항목은 로컬 evidence gate를 통과할 때까지 `T0`/`internal`로 착륙한다.

## 사전 조건
- [ ] RB-052가 머지되었다: `parse_envelope`, `semver_gate`, `scan`/`redact`, `effective_boundary`, `write_crossing_audit`가 `kr.boundary`에서 사용 가능하다.
- [ ] Core txn(RB-002)이 구조적 evidence gate(`evidence`는 산문 필드 없음; `artifact_uri`+`locator` 필수)와 append-only 쓰기를 강제한다.
- [ ] content-addressed vault 위치(`caw02-vault://<sha>`)가 ADR-0002(RB-010 storage)에 따라 구성되어 있다.
- [ ] Reindex(RB-012)가 멱등이어서 새로 매핑된 노드가 커밋 후에만 쿼리 가능해진다.
- [ ] HEAD에서 tree가 green이다.

## 단계

1. **quarantine 파티션을 생성한다.**
   - 할 일: reindexer가 **제외**하는 격리 staging 영역(예: `knowledge/_quarantine/<crossing_id>/`)을 추가한다 — staged 항목은 절대 쿼리 가능하지 않다. raw 엔벌로프, 파싱 상태, 검사 결과를 담는 quarantine 레코드를 정의한다.
   - 검증: staged 항목은 reindex 후 어떤 retrieval/FTS 쿼리에도 나타나지 않는다; 커밋된(검사 후) 노드만 나타난다.

2. **`kr.import_projection` 엔벌로프 intake(CAW-01)를 구현한다.**
   - 할 일: `*.caw01.json` 엔벌로프를 읽는다; `parse_envelope` + `semver_gate`(알 수 없는 MAJOR 거부)를 호출하고, `payload_sha256`를 검증한다. op을 **`(source_product, export_id)`에 대해 멱등**으로 만든다 — 재import는 `payload_sha256`로 dedup하며 두 번째 Evidence 노드를 만들지 않는다.
   - 검증: 알 수 없는 MAJOR와 digest 불일치는 어떤 staging 부작용 이전에 거부된다; 같은 파일을 두 번 재실행하면 정확히 하나의 Evidence 노드가 나온다.

3. **projection artifact를 vault로 stage + 복사한다.**
   - 할 일: 엔벌로프를 quarantine한다; 큰 artifact(값 또는 경로/URI로)를 `caw02-vault://<sha>`로 복사하고, 이후 무결성 검사를 위해 해시를 저장한다. 재구성은 CAW-01이 가동 중인 것에 절대 의존해서는 안 된다(라이브 참조가 아닌 복사).
   - 검증: import 후, artifact는 기록된 sha로 vault에서 해석되는 반면 CAW-01 소스 경로는 테스트에서 도달 불가능하다.

4. **CAW-01 기밀성 검사를 실행한다(flows §3 표).**
   - 할 일: 공유되는 곳에서는 `kr.boundary`를 통해 적용한다: **boundary floor**(`imported >= declared_boundary`; 더 엄격한 쪽으로 clamp, 절대 다운그레이드 안 함); **confidential-field scrub**(`confidential_fields`가 설정되고 `public_safe_view`가 없으면 **오직** `confidential`로만 저장, 아니면 quarantine 유지 → curator); **재-redaction**(`redaction_applied` 여부와 무관하게 `redact()` 실행, delta 로깅); **free-text leak scan**(`title`/`metric`에 대해 codename/fab/customer를 `scan()` → 검토 플래그); **audience**(`jimmy-private` → private 파티션, 팀에 자동 공유 절대 안 함). 어떤 hard failure든 항목을 quarantine 유지하고 curator에게 올린다.
   - 검증: confidential 마커를 지닌 채 `internal`로 선언된 projection은 `confidential`로 clamp/유지된다; 완전한 `redaction_applied`를 주장하는 producer도 여전히 재-redaction된다(delta 로깅); `jimmy-private` projection은 절대 팀 가시 뷰에 착륙하지 않는다.

5. **projection을 `Evidence`로 매핑한다(절대 `Claim`이 아님).**
   - 할 일: 통과 시 `Evidence(kind, value, locator, boundary)`와 카탈로그 `SimulationRun`/`Experiment` ref를 생성한다; curator/skill이 `Claim` 텍스트를 별도로 작성하고 projection은 그것이 가리키는 대상이다. `kind=model-projection`은 그 CI/unit을 유지한다; `kind=generated-summary`는 낮은 trust로 카탈로그되고 "not evidence-grade"로 플래그되며 claim의 **유일한 evidence가 될 수 없다**. core txn을 통해 커밋한다(markdown + 해시 체인 이벤트).
   - 검증: import는 절대 `Claim` 노드를 생성하지 않는다; 유일한 evidence가 `generated-summary`인 claim은 evidence gate에 의해 거부된다; `model-projection` evidence는 `ci_low/ci_high/unit`을 유지한다.

6. **CAW-05 signal intake(JSONL)를 구현한다.**
   - 할 일: `*.caw05.jsonl`을 한 줄에 하나의 signal로 읽는다; 각 줄에 대해 엔벌로프 semver gate를 실행한 뒤 signal을 **quarantine**한다(미검증, 미연결). 기존 `Source`에 대해 `external_ids`/`doi`로 **dedup**한다(Levenshtein-title fallback).
   - 검증: 중복 DOI는 기존 Source에 매핑된다(중복 없음); 잘못된 줄은 quarantine되고 커밋되지 않으며 전체 파일을 중단시키지 않는다.

7. **CAW-05 기밀성 검사를 실행한다(flows §4 표).**
   - 할 일: **provenance separation**(public 소스는 `boundary=public` 태깅, internal Samsung/SAIT claim에 절대 병합 안 함 — cross-tag link 차단); **conflation guard**(Claim은 public `Source`와 `confidential` projection을 하나의 evidence 항목으로 융합할 수 없음 — 별도 evidence 행 강제); **URL/PII sanity**(internal-host URL 거부, 추적 파라미터 제거); **classification trust**(`unknown` → T0, 자동 연결 안 함)를 적용한다.
   - 검증: public Source와 confidential projection을 하나의 evidence 항목에 첨부하려는 시도는 별도 행으로 분리된다; internal-host URL signal은 거부된다; `unknown`으로 분류된 signal은 T0에서 미연결로 남는다.

8. **signal을 typed 노드로 매핑하고 `raw_summary`를 evidence에서 제외한다.**
   - 할 일: `Source` 생성(외부 작업은 boundary=public); `classification threat|support` → 대상 `Claim`/`Concept`로의 typed `RelatedWork` link; 각 `extracted_claims[*]` → 후보 `Claim`이며 그 `Evidence`는 `Source` + 구체적 `evidence_locator`(예: `p.4 §3.2 / fig 2`) — **절대** `raw_summary`가 아님; `raw_summary`는 `Source`에 `kind=generated-summary`로 저장(evidence에서 제외); 수락된 claim에 대한 tension / credible threat → 자동으로 `OpenQuestion`을 올리고 reviewer에게 통지. 후보는 기본적으로 검토된다(조용한 자동 수락 없음). core txn으로 커밋한다.
   - 검증: 후보 Claim의 evidence edge는 summary가 아닌 Source+locator를 가리킨다; `raw_summary`는 절대 `evidence_for` edge의 `from`이 아니다; 수락된 claim에 대한 threat는 `OpenQuestion`을 생성한다.

9. **각 import에 대해 횡단별 audit 엔트리를 쓴다.**
   - 할 일: 횡단당 한 번 `write_crossing_audit(direction="import", boundary_kind, selected_ids, dropped_ids, redaction_hits, ...)`를 호출한다.
   - 검증: import당 정확히 하나의 해시 체인 `_events` 줄이 매핑된 id, quarantine/drop된 id, redaction delta를 기록한다.

## 수용 기준
- [ ] CAW-01 projection을 import하면 **quarantine**되어 착륙하고 어떤 노드 생성 **이전**에 기밀성 검사 표를 실행한다; 실패는 quarantine 유지하고 curator에게 올린다.
- [ ] projection은 `Evidence`(+ 선택적 `SimulationRun`/`Experiment`)로 매핑된다, **절대** `Claim`이 아님; `generated-summary`는 유일한 evidence가 될 수 없다.
- [ ] 같은 엔벌로프의 재import는 `payload_sha256`로 dedup한다(멱등); artifact는 CAW-01 없이 vault에서 재구성 가능하다.
- [ ] CAW-05 signal은 `Source`/`RelatedWork`/`Claim`/`OpenQuestion`으로 매핑된다; 후보 Claim의 evidence는 `Source`+`evidence_locator`이다; `raw_summary`는 `kind=generated-summary`이며 **evidence에서 제외**된다.
- [ ] boundary는 절대 조용히 하향 업그레이드되지 않는다(floor/clamp 유지); 재-redaction은 producer 주장과 무관하게 실행된다; `jimmy-private`는 절대 팀에 자동 공유되지 않는다.
- [ ] 각 import는 정확히 하나의 해시 체인 audit 엔트리를 쓴다; 두 op 모두 `kr.boundary`를 통한 skill-wrap으로만 실행된다.
- [ ] Tree가 green이다(build + lint + tests).

## 롤백 / 안전
- 모든 staging은 quarantine 파티션(reindex 제외)에 있다; 중간 실패는 쿼리 가능한 노드나 고아 파일을 남기지 않는다(core txn은 원자적 — 중단 시 아무것도 커밋되지 않음).
- 커밋된 import를 롤백하려면, 생성된 노드를 append-only 이벤트로 supersede한다(파괴적 삭제 없음); vault 복사본은 content-addressed이며 보관해도 무해하다.
- Fail-closed: 불확정한 기밀성 검사는 항목을 매핑하지 않고 quarantine 유지한다.

## 인계
RB-051(export)은 import된 외부 artifact가 올바른 `boundary`/`visibility`와 trust(≤ AI/import cap)를 지닌 일급 `Evidence`/`Source` 노드이고, vault에서 재구성 가능하며, `generated-summary`가 non-evidence로 플래그됨을 가정할 수 있다 — 따라서 export의 evidence 불변식과 effective-boundary gate는 깨끗하고 라벨된 노드 위에서 작동한다.
