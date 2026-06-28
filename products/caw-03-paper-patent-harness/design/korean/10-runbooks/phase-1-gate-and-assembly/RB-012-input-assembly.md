# RB-012: Input assembly (engine-neutral)

- Status: ready
- Phase: phase-1-gate-and-assembly
- Depends on: [RB-011]
- Implements design: [../../05-harness-core/input-assembly_ko.md](../../05-harness-core/input-assembly_ko.md)
- Produces: `assemble_inputs` — gated claim + CAW-01 result ref로부터 만들어진 engine-neutral input bundle

## Objective

`GatedClaimSet` + CAW-01 result ref를, 어떤 `WritingEngineAdapter`든 소비할 수 있는 engine-neutral input bundle
(idea/experimental_log/figures/template/guidelines)로 변환한다. gate-before-assemble; 숫자는 result-ref-backed.

## Preconditions
- [ ] RB-011(gate).

## Steps
1. **Do:** [input-assembly_ko.md](../../05-harness-core/input-assembly_ko.md)에 따라 engine-neutral bundle schema(CAW-03-owned)를 정의한다.
   **Verify:** `test:` schema가 샘플을 검증하고; claim_id + result_id를 round-trip한다.
2. **Do:** `assemble_inputs(gatedSetId)`를 구현한다: gated claim에서만 bundle을 빌드하고; ungated claim은 거부한다.
   **Verify:** `test:` assembly가 ungated claim을 거부하고; gated claim은 수락한다.
3. **Do:** FigureTableManifest를 위해 각 figure/value를 그 CAW-01 `result_id`에 바인딩한다(result-ref-backed 숫자).
   **Verify:** `test:` assemble된 모든 숫자가 result_id를 갖는다.
4. **Do:** 출력 전에 artifact의 confidentiality track을 적용한다(over-track 콘텐츠 제외).
   **Verify:** `test:` over-track 콘텐츠가 제외된다.

## Acceptance criteria
- [ ] gated claim에서만 engine-neutral bundle이 빌드됨; provenance(claim_id+result_id) 보존됨.
- [ ] confidentiality track 적용됨.

## Rollback / safety
순수 transform; 롤백하려면 revert한다.

## Hand-off
RB-020이 이 bundle을 PaperOrchestra input으로 매핑하고 draft한다.
