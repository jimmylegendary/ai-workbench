# RB-012: deny-by-default publish gate와 curator 승인 큐 구축

- Status: ready
- Phase: phase-1-import-and-gate
- Depends on: [RB-010 (import + staging), RB-011 (core public-safe re-check + verdict)]
- Implements design:
  - [../../05-publishing-core/publish-gate-and-public-safe_ko.md](../../05-publishing-core/publish-gate-and-public-safe_ko.md)
  - [../../07-backend-api/import-service_ko.md](../../07-backend-api/import-service_ko.md)
  - [../../04-data-layer/public-safe-and-provenance_ko.md](../../04-data-layer/public-safe-and-provenance_ko.md)
  - [../../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md](../../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md)
- Produces: 전체적(total)이고 부작용 없는(side-effect-free) `publish_decision()`(G1–G8, default-REJECT), curator 승인 큐(내부 preview/admin), hash-chained `_events` audit writer + `verify_audit()`, 그리고 mutation-test된 gate 스위트.

## Objective

**무엇이 publish될 수 있는가**를 결정하는 단일 load-bearing 제어가 **전체적이고, 부작용 없으며, default-REJECT**인 결정 함수로 구현된다. Publication은 검증된 source **와** 로컬에서 재도출된 public-safe boundary가 **둘 다** 필요하며 — 어느 하나만으로는 불충분 — **generated/unverified 콘텐츠는 절대 publish되지 않는다**(G5). G1–G7이 적격성을 게이트한다; **G8(명시적 인간 승인)만이 라이브로 가는 유일한 경로**이며 — gate는 오직 자동으로 **reject**만 할 수 있고, 절대 자동으로 **approve**할 수 없다. G8 없이 G1–G7을 통과한 것은 내부 preview/admin 표면에 머무르며, 공개 웹/API에는 절대 가지 않는다. 모든 결정과 publish/unpublish/redact는 append-only, hash-chained audit 이벤트이며, **audit 전용 provenance는 어떤 공개 출력으로도 절대 직렬화되지 않는다**. "Done" = 검증되고 public-safe한 Skill 후보가 그 findings + provenance와 함께 curator 큐에 있고, 오직 명시적 approve만이 그것을 published로 뒤집으며; 그 외 모든 것은 reject되거나 보류되는 것.

## Preconditions

- [ ] RB-011이 타입화된 `RecheckVerdict`(로컬 재도출 `boundary_eff`, findings, `evidence_ref`)를 만드는 `runRecheck`를 도착시킴.
- [ ] RB-010이 staged 후보 + sidecar provenance를 도착시킴(`origin_ref`, `origin_version`은 sidecar 전용).
- [ ] content-model `isPublishable(record)` predicate가 존재함(재사용/audit 메타데이터: inputs/outputs, preconditions, provenance, safety boundary, version).
- [ ] 내부 preview/admin 표면(ADR-0001)이 curator 경로로 존재하거나 스캐폴드됨.
- [ ] 파이프라인 순서가 고정됨: `import → re-check → curator gate → version → publish`. 이 runbook은 git store를 쓰거나 build하지 않는다(그것은 phase-2); "승인됨, version 준비 완료"에서 멈춘다.

## Steps

1. **`publish_decision(item)`을 전체적 + 부작용 없게 구현.**
   - Do: `publish_decision(item) → PUBLISH_OK | REJECT{reasons[]} | HOLD`. 계산만 한다 — store를 절대 쓰지 않는다(오직 audit writer만 별도로 쓴다). 체인은 G1–G7을 실행한다; **첫 hard failure가 reject**한다; soft findings는 수집된다; **default branch는 REJECT**다. agent와 인간에 대해 동일한 함수 — 두 번째의 더 느슨한 경로는 없다.
   - Verify: Property test — 함수가 모든 입력(malformed 포함)에 대해 정의되고 어떤 write도 수행하지 않음; 빈/알 수 없는 입력은 REJECT를 반환.

2. **gate 체크 G1–G7 구현(적격성).**
   - Do:
     - G1 Validated source: **검증된** CAW-02/CAW-03 source로의 해석 가능한 provenance ref ⇒ 아니면 REJECT.
     - G2 Effective boundary: `boundary_eff == public`(item + 모든 ancestor에 대한 lattice-max, RB-011에서) ⇒ 아니면 REJECT. 이것이 척추다; 절대 캐시된 upstream flag를 읽지 말 것.
     - G3 Visibility: `private` ancestor 없음(`visibility_eff == team`) ⇒ 아니면 REJECT.
     - G4 Redaction-clean: redaction 스캔이 렌더된 public view에서 **0**개의 hit를 반환 ⇒ 아니면 REJECT.
     - G5 Evidence-grade: 맨 `generated-summary`가 아님; `isPublishable(record)`가 성립 ⇒ 아니면 REJECT.
     - G6 Contract version: envelope `contract_version` MAJOR가 지원됨 ⇒ 아니면 REJECT.
     - G7 Integrity: `payload_sha256`가 일치; signature(있으면)가 검증됨 ⇒ 아니면 REJECT.
   - Verify: 체크당 하나의 negative test — 검증됐지만 confidential인 item은 G2 실패; public이지만 unverified인 item은 G1/G5 실패; 검증된 backing 없는 generated-summary는 G5 실패; 알 수 없는 contract는 G6 실패; 변조된 payload는 G7 실패.

3. **"validated source AND public-safe"를 AND로 강제.**
   - Do: 두 독립 조건이 모두 필요함을 확인: validated source(G1, G7)와 public-safe boundary(G2, G3, G4). 어느 하나만으로는 적격성을 산출하지 않는다.
   - Verify: 한 조건만 통과하는 item은 절대 적격이 아님을 테스트가 확인.

4. **G8 구현 — curator 승인을 라이브로 가는 유일한 경로로.**
   - Do: G1–G7을 soft findings 없이 통과한 후, `HOLD`(적격, curator 대기)를 반환. `PUBLISH_OK`로의 유일한 전이는 특정 `(artifact_id, version)`에 대해 `approved_by`로 기록되는 **명시적 인간 approve 이벤트**다. 승인은 **version-scoped**다: 새 version은 gate에 재진입한다; 이전 승인은 이월되지 않는다. gate는 절대 자동 승인할 수 없다.
   - Verify: Test — approve 이벤트가 없는 적격 item은 `HOLD`로 머무름(preview/admin에, 절대 public에 아님); 오직 명시적 approve만 `PUBLISH_OK`를 산출; v1.0.0에 대한 승인은 v1.1.0을 만족시키지 않음.

5. **curator 승인 큐 구축(내부 preview/admin 전용).**
   - Do: `listQueue(filter?)`, `approve(entryId, {semver, notes?})`, `reject(entryId, reason)` 구현. 각 `QueueEntry`는 `RecheckVerdict`(findings + 재계산된 boundary)와 `source_ref`를 **admin에서만** 보여준다. 큐 상태: `publish` ⇒ ready; `quarantine` ⇒ blocked(findings 해소 전까지 승인 불가); `reject` ⇒ 큐에 없음(폐기 + audit됨).
   - Do: `approve`는 **promotion 시점에 `runRecheck`를 재실행**한다(stale verdict 없음), 그 후 semver bump를 할당하고 versioning(phase-2)으로 넘긴다. `reject`/`quarantine`는 절대 자동 promote하지 않는다.
   - Verify: Test — quarantine된 entry는 승인 불가; ready entry를 승인하면 re-check를 재실행하고, `approved_by`를 기록하며, version 준비된 `PublishableItem`을 만듦; `source_ref`는 admin에 보이고 어떤 public-projection 객체에도 부재.

6. **append-only, hash-chained `_events` audit writer + `verify_audit()` 구현.**
   - Do: gate 결정마다 그리고 publish/unpublish/redact마다 하나의 이벤트를 씀: `{ seq, prev_hash, event, artifact_id, version, source_ref, boundary_eff, visibility_eff, gate_result{G1..G8}, redaction{ruleset_version, hits}, approved_by, envelope_digest, hash }`, 여기서 `hash = H(prev_hash ‖ canonical(line))`. 체인을 걸어가 `broken_at`을 내는 `verify_audit()` 구현; git history가 중복된 두 번째 witness다. Unpublish/redact는 **delete가 아니라 이벤트**다.
   - Verify: Test — publish는 chained 이벤트를 append함; 어떤 line이든 변조하면 `verify_audit()`가 `broken_at`을 보고함; "왜 publishable한가 + 누가 승인했나"는 `gate_result` + `approved_by`로부터 재구성 가능.

7. **serialization 방화벽 강제(audit 전용 필드는 절대 직렬화되지 않음).**
   - Do: `source_ref`, `producer_run_id`, `origin_ref`, `origin_version`, `validated_by`, `reviewer`, redaction 내부가 sidecar / audit ledger에만 존재함을 확인. 큐 표면은 그것들을 표시할 수 있음(admin 전용); `publicProjection(record)` allow-list는 그것들을 제외해야 함.
   - Verify: Test — deny-list된 키가 public 출력용으로 형성된 객체에 **0**번 나타남; 테스트를 약화시키면 CI가 실패해야 함. (전체 build-artifact 강제는 phase-2에서 도착; 이것은 projection 경계를 단언.)

8. **default-REJECT 속성을 mutation-test.**
   - Do: mutation test 추가: 체인을 편집하여 `PUBLISH_OK`로 fall-through하게 하면(default를 약화시키면) 스위트가 반드시 깨져야 함. gate의 자동 경로는 reject-only다.
   - Verify: mutation(default → `PUBLISH_OK`, 또는 G8 인간 승인 요건 제거)이 스위트를 실패시킴.

## Acceptance criteria

- [ ] `publish_decision()`이 전체적이고, 부작용 없으며, default-REJECT.
- [ ] G1–G7이 적격성을 강제; 각각에 통과하는 negative test가 있음; "validated source AND public-safe"는 엄격한 AND.
- [ ] G5가 generated/unverified 콘텐츠를 차단(맨 generated-summary 또는 `isPublishable` false).
- [ ] G8이 라이브로 가는 유일한 경로; gate는 자동 reject하지만 절대 자동 approve하지 않음; 승인은 version-scoped.
- [ ] `approve`가 promotion에서 re-check를 재실행하고, `approved_by`를 기록하며, version 준비된 `PublishableItem`을 만듦; `quarantine`/`reject`는 절대 promote하지 않음.
- [ ] curator 큐는 내부 전용; `source_ref`/findings가 admin에 보이고 어떤 public projection에도 부재.
- [ ] hash-chained `_events` writer + `verify_audit()`가 동작; unpublish/redact는 delete가 아니라 이벤트.
- [ ] audit 전용 필드가 어떤 public-projection 객체에도 나타나지 않음(serialization 방화벽 테스트 통과).
- [ ] Mutation test: default를 `PUBLISH_OK`로 약화(또는 G8 제거)하면 스위트가 깨짐.
- [ ] 트리가 green(build, lint, test 통과).

## Rollback / safety

- gate는 부작용 없고 "승인됨, version 준비 완료"에서 멈춘다 — 여기서 git-store write나 build가 일어나지 않으므로, 중간 실패가 publish할 수 없다. 안전한 rollback = 큐 entry / `PublishableItem` 폐기; audit 이벤트는 append-only이며 유지되어야 함(절대 체인을 다시 쓰지 말 것).
- phase-2 versioning 전의 우발적 승인은 공개 효과가 없다(아직 아무것도 build/served되지 않음). deny-by-default + human-only-approve 속성은 만약 약화되면 release blocker다.

## Hand-off

Phase-2(storage/versioning + build/publish)는 다음을 가정할 수 있다: promotion-시-재실행된 `RecheckVerdict`, 할당된 semver, 기록된 `approved_by`, 그리고 hash-chained audit ledger의 전체 `gate_result`를 가진 승인된 `PublishableItem`이 존재함. item은 `boundary_eff == public`, `visibility_eff == team`, redaction-clean, evidence-grade다. Versioning은 그것을 `src/content/{...}/<slug>/<semver>.md(x)`(영원히 frozen)에 sidecar를 옆에 두고 쓴다; build는 모든 artifact에 대해 serialization 방화벽이 강제된 채 웹 + API를 방출한다. audit 전용 provenance는 계속해서 절대 직렬화되지 않아야 한다.
