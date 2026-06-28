# RB-012: 입력 어셈블리 (엔진 중립)

- Status: ready
- Phase: phase-1-gate-and-assembly
- Depends on: [RB-011]
- Implements design: [../../05-harness-core/input-assembly_ko.md](../../05-harness-core/input-assembly_ko.md)
- Produces: `assemble_inputs` — 게이팅된 청구항 + CAW-01 결과 참조로부터 만든 엔진 중립 입력 번들

## Objective

`GatedClaimSet` + CAW-01 결과 참조를 어떤 `WritingEngineAdapter`든 소비할 수 있는 엔진 중립 입력 번들
(idea/experimental_log/figures/template/guidelines)로 변환한다. 어셈블 전 게이팅(gate-before-assemble); 숫자는 result-ref로 뒷받침된다.

## Preconditions
- [ ] RB-011 (게이트).

## Steps
1. **Do:** [input-assembly.md](../../05-harness-core/input-assembly_ko.md)에 따라 엔진 중립 번들 스키마(CAW-03 소유)를 정의한다.
   **Verify:** `test:` 스키마가 샘플을 검증함; claim_id + result_id 왕복.
2. **Do:** `assemble_inputs(gatedSetId)` 구현: 게이팅된 청구항으로만 번들을 구축; 게이팅되지 않은 청구항은 거부한다.
   **Verify:** `test:` 어셈블리가 게이팅되지 않은 청구항을 거부함; 게이팅된 것은 수용함.
3. **Do:** FigureTableManifest를 위해 각 figure/value를 그 CAW-01 `result_id`에 바인딩한다 (result-ref로 뒷받침되는 숫자).
   **Verify:** `test:` 어셈블된 모든 숫자가 result_id를 동반함.
4. **Do:** 출력 전에 아티팩트의 기밀성 트랙을 적용한다 (트랙을 넘는 콘텐츠 제외).
   **Verify:** `test:` 트랙을 넘는 콘텐츠가 제외됨.

## Acceptance criteria
- [ ] 게이팅된 청구항으로만 엔진 중립 번들이 구축됨; 출처(claim_id+result_id)가 보존됨.
- [ ] 기밀성 트랙이 적용됨.

## Rollback / safety
순수 변환; 롤백하려면 revert.

## Hand-off
RB-020이 이 번들을 PaperOrchestra 입력 및 초안으로 매핑한다.
