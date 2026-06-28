# Validation & Tests — CAW-03

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [research-plan.md](./research-plan_ko.md), [../05-harness-core/evidence-gate-and-claim-ledger.md](../05-harness-core/evidence-gate-and-claim-ledger_ko.md), [../05-harness-core/ports-and-adapters.md](../05-harness-core/ports-and-adapters_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF_ko.md

## 목적

거버넌스가 유지됨을 증명하는 테스트들 — harness가 존재하는 이유.

## 테스트 스위트

### T1 — Gate fail-closed가 엔진을 차단한다
충분한 evidence가 없는(또는 유일한 "evidence"가 generated text인) claim은 ANY surface(API/MCP/CLI)를 통해서도
assemble 또는 draft될 수 **없다**. **Pass:** assemble/draft가 거부되고, claim이 backlog에 나타난다.

### T2 — Generated text은 결코 evidence가 아니다
synthesis/summary를 evidence로 사용하려는 `attach`/import는 거부된다; `evidence_refs`는 실제 CAW-02 evidence id로
resolve되어야 한다. **Pass:** 사유와 함께 거부된다.

### T3 — Patent-first interlock가 publish를 차단한다
`InterlockState=held` 상태의 patent-sensitive claim을 포함한 paper artifact는 publish될 수 없다. **Pass:**
`publish`가 거부되고, interlock이 해제된 후에만 풀린다.

### T4 — Adapter는 거버넌스를 약화시킬 수 없다
의도적으로 오작동하는 fake adapter(over-boundary data / ungated claims를 반환)도 gate, interlock, confidentiality를
우회할 수 없다. **Pass:** adapter와 무관하게 core가 거부한다.

### T5 — Stub adapter는 선택 가능하지만 안전하다
문서화된 stub(예: internal-wiki source)을 선택하면 preflight를 `implemented:false`로 통과하고 안전하게 no-op한다;
거버넌스를 조용히 누락하는 일은 결코 없다. **Pass:** 명확한 unavailable 신호, 데이터 유출 없음.

### T6 — Engine-neutral input 왕복(round-trip)
GatedClaimSet → EngineInputs → PaperOrchestra inputs는 claim_id + result_id를 보존한다; figure_id↔result_id가
manifest에서 바인딩된다. **Pass:** provenance를 재구성할 수 있다.

### T7 — Export 시 Confidentiality fail-closed
public sink로 publish할 때 public-safe로 redaction한다; over-share는 publish를 중단시킨다. **Pass:** confidential
유출 없음.

### T8 — Milestone-1 e2e
evidence-gated paper 하나: import → gate → assemble → draft (PaperOrchestra) → review → PDF, provenance 포함.
**Pass:** PDF가 존재하고, 모든 claim이 gated되며, lineage가 온전하다.

## Thresholds

수치형 gate/novelty threshold는 profile-config이며, Jimmy와 함께 설정되기 전까지 `TODO(open-question)`로 시작한다.

## runbook에 대한 함의

T1–T7은 각 feature runbook에 내장된 acceptance check이고, T8은 Milestone-1 acceptance이다.
