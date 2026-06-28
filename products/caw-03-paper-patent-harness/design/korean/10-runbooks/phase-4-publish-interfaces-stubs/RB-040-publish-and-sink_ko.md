# RB-040: Publish + sink (LaTeX/PDF)

- Status: ready
- Phase: phase-4-publish-interfaces-stubs
- Depends on: [RB-021, RB-013, RB-023]
- Implements design: [../../05-harness-core/artifact-lifecycle_ko.md](../../05-harness-core/artifact-lifecycle_ko.md), [../../04-data-layer/confidentiality-and-provenance_ko.md](../../04-data-layer/confidentiality-and-provenance_ko.md)
- Produces: interlock와 confidentiality(기밀성)가 적용된 `publish` + v1 `Sink/PublishAdapter` (LaTeX/PDF)

## Objective

`SinkAdapter`를 통해 리뷰가 완료된 artifact를 내보내되, adapter에 도달하기 전에 core에서 patent-first
interlock과 fail-closed confidentiality redaction을 강제한다.

## Preconditions
- [ ] RB-021 (작성/리뷰된 artifact), RB-013 (confidentiality), RB-023 (interlock).

## Steps
1. **Do:** port 뒤에 `adapters/sink/v1/latex-pdf`를 구현하고 registry에 등록한다.
   **Verify:** `test:` registry가 이를 선택한다; preflight를 통과한다.
2. **Do:** `publish(artifactId, sinkRef)`를 구현한다: interlock 확인(하나라도 held이면 거부) → sink boundary로 redact(fail-closed) → 내보내기 → Artifact `published`.
   **Verify:** `test:` T3 (held → 거부), T7 (과다 공유 → 중단; public-safe만 내보냄).
3. **Do:** publish에 확인 절차(human gate)를 요구한다; 무엇이 내보내졌는지 provenance를 기록한다.
   **Verify:** `test:` 확인 없는 publish는 거부된다.

## Acceptance criteria
- [ ] Publish는 interlock이 해제되고 confidentiality가 충족된 경우에만(T3, T7), 그리고 사람이 확인했을 때만 sink를 통해 내보낸다.

## Rollback / safety
Deny-by-default(기본 거부); adapter/op를 되돌려 롤백한다.

## Hand-off
RB-041은 publish 이전에 review 단계를 추가한다; RB-043은 publish stub(wiki/venue/filing)을 추가한다.
