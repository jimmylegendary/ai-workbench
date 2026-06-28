# RB-022: recall-biased selective-review gate + deterministic config-driven routing

- **Status:** ready
- **Phase:** phase-2-relevance-and-classify
- **Depends on:** [RB-021 (classification cascade), RB-020 (recall floor), RB-003 (Routing port stub), RB-001 (CLI/MCP surface ops: confirm/export)]
- **Implements design:** [../../05-radar-core/classification-and-triage.md](../../05-radar-core/classification-and-triage_ko.md) (§6, §7, §8), [../../01-decisions/ADR-0004-classification-and-triage.md](../../01-decisions/ADR-0004-classification-and-triage_ko.md), [../../01-decisions/ADR-0002-interest-model.md](../../01-decisions/ADR-0002-interest-model_ko.md) (recall floor)
- **Produces:** Run의 **triage/route 단계**: calibrated **selective-review gate** (auto-accept / queue / abstain→human, 절대 silent-discard 아님), `review.state` machine + needs-review queue, 그리고 `Routing` port 뒤의 **deterministic config-driven routing engine**으로 neutral `routed_finding`을 `knowledge / task / experiment / open-question / discard`로 emit.

## Objective
"Done" = 각 `classified_finding`이 recall-biased selective-prediction gate와 deterministic routing profile을
통과한다. gate는 high-confidence `support/adjacent/noise`만 auto-accept하고; **`novelty-threat`는 항상 queue**
(high-confidence라도 — 실존적 비용); mid-confidence는 queue; **low confidence나 self-consistency disagreement에서
abstain→queue — 절대 silent-discard 아님**. watch-list hit이 ≥1개인 finding (`surface_not_drop`)은 **절대
`noise`로 auto-discard되지 않는다**. Routing은 named triage profile (`narrow-radar-weekly`)이 선택한
`(relevance class, signal bucket, review state)`의 순수 deterministic function이며, **multi-route**를 허용하고,
per-target bundle 형태가 ExportAdapter에 있는 neutral `routed_finding`을 emit한다 (router는 다른 product의
schema를 절대 import 안 함). **`review.state ∈ {auto-accepted, human-confirmed, human-overridden}`이 되기
전까지는 아무것도 export되지 않는다.**

## Preconditions
- [ ] RB-021 완료: finding이 두 축, `method.self_consistency`, `method.abstained`, confidence 입력,
      `rationale_note{evidence:false}`, `surface_not_drop`를 carry.
- [ ] `Routing` port 존재 (P0 stub); `confirm`/`export` proposal-only surface op 존재 (ADR-0001 / RB-001).
- [ ] triage profile config 파일 생성 가능 (`profile: narrow-radar-weekly`); `τ_high`/`τ_low`/`N`은 상수가
      아니라 config key.
- [ ] Tree가 green.

## Steps

1. **calibrated confidence scorer 구축.**
   - **Do:** raw signal (LF agreement, N-sample self-consistency, watch-list specificity, `source_trust_prior`,
     verbalized confidence)을 Jimmy의 confirm/override history에 대한 작은 logistic fit을 통해 calibrated
     probability로 매핑한다. ECE를 추적한다. label이 ~50개 미만이면 **conservative cold-start mode**로 실행한다
     (confidence를 low로 취급 → 더 많이 queue). override rate가 drift하면 recalibrate.
   - **Verify:** Calibration이 `interest-feedback`/override log에서 fit됨 (하드코딩 아님); history가 비어있으면
     scorer가 conservative로 default (대부분의 항목 queue, `discard`로 조용히 accept되는 것 없음).

2. **selective-review gate 구현 (§6 표).**
   - **Do:** 순서대로 적용한다: (a) `novelty-threat` → confidence와 무관하게 **항상 queue**; (b) low confidence
     (< `τ_low`) OR self-consistency disagreement / `method.abstained` → **abstain→queue**; (c) mid confidence
     (`τ_low`–`τ_high`) → queue; (d) high confidence (≥ `τ_high`) AND class ∈ `{support, adjacent, noise}` →
     **auto-accept**. `τ_high`/`τ_low`/`N`은 config에서 읽음.
   - **Verify:** high-confidence `novelty-threat`도 여전히 **queue**로 감 (auto-accept 아님); low-confidence
     `support`는 queue로 감; high-confidence `support`는 auto-accept.

3. **gate에서 recall-first floor 강제 (절대 silent-discard 아님).**
   - **Do:** `surface_not_drop: true` (≥1개 `recall_priority:high` watch-list hit)인 finding은 **절대**
     `discard`로 auto-route될 수 없다 — 최악의 경우 queue된다. routing 전 hard precondition으로 인코딩한다.
   - **Verify (negative test N1):** watch-list hit을 carry하는 high-confidence `noise` label은 discard가 아니라
     **queue**됨.

4. **`review.state` machine + needs-review queue 구현.**
   - **Do:** State: `auto-accepted | queued | human-confirmed | human-overridden`. Queue된 항목은 digest의
     "needs-review" 섹션에 surface된다; `novelty-threat`는 **same-cycle** review로 flag된다. human `confirm`은
     `human-confirmed`를 설정; override는 `human-overridden`을 설정하고 LF/threshold recalibration을 위한
     **label된 example을 emit** (active learning). `reviewer`, `decided_at`를 기록한다.
   - **Verify:** Queue된 항목은 human op 없이 routed/export로 transition할 수 없음; override는 calibration log에
     label된 example을 씀.

5. **deterministic routing engine 구현 (§7) Routing port 뒤.**
   - **Do:** Routing = named profile 표의 `(relevance class, signal bucket, review state)`의 순수 function.
     모든 §7 행을 인코딩한다, 예: `novelty-threat × signal/mixed → open-question + flag → CAW-03 (advisory) +
     CAW-01/CAW-06`; `novelty-threat × hype → open-question(low-pri) → CAW-03 marked low-signal (still
     surfaced)`; `support × signal → knowledge → CAW-02`; `noise × any → discard (logged tombstone, never
     hard-deleted)`; actionable → `task → CAW-06/action-brief`. finding은 **여러 route**를 취할 수 있다 (union을
     route). neutral `routed_finding{decision, targets[], digest_eligible}`을 emit한다.
   - **Verify:** 각 §7 행이 table-driven test에서 disposition + target으로 매핑됨; `novelty-threat × hype`
     finding도 여전히 CAW-03로 route (recall floor), low-signal로 표시; 두 행에 해당하는 finding은 두 target을
     모두 받음.

6. **pre-confirm export gate 강제.**
   - **Do:** `review.state ∈ {auto-accepted, human-confirmed, human-overridden}`가 아니면 어떤 export bundle의
     emission도 차단한다. `discard`는 logged **tombstone**을 쓴다 (dedup + audit를 위해 보관, 절대 hard-delete
     안 함). router는 다른 product의 schema를 절대 import 안 함 — `routed_finding`을 emit하고; ExportAdapter가
     나중에 per-target bundle을 구축 (P4/P5).
   - **Verify (negative test N3):** `queued` finding에 시도된 export는 **거부**됨; `discard`는 dedup을 위해 검색
     가능한 tombstone을 산출.

7. **생성된 rationale를 routing 내내 non-evidence로 유지.**
   - **Do:** `rationale_note{evidence:false}`를 `routed_finding`에 변경 없이 carry한다; route를 설명하거나
     digest에 렌더할 수 있으나 절대 target의 evidence가 되지 않는다. Routing 결정은 발화한 deterministic rule을
     log한다 (auditable), LLM rationale이 아님.
   - **Verify (negative test N2 boundary):** 어떤 routed_finding이나 downstream bundle도 `rationale_note`를
     evidence로 사용할 수 없음; route는 profile rule + provenance로 정당화됨.

8. **profile + threshold를 config로, 불변식은 profile-independent로 만들기.**
   - **Do:** routing 표, `τ_high`/`τ_low`/`N`, signal cut-point를 `narrow-radar-weekly` profile config에 넣는다.
     (a) `surface_not_drop` finding을 auto-discard하거나 (b) `rationale_note.evidence:true`로 설정하려는 모든
     profile을 **거부**하는 profile-load guard를 추가한다.
   - **Verify:** watch-list hit을 auto-discard하는 profile 로드는 load time에 거부됨; 새 watch-list line/target은
     core code 편집 없이 profile 행으로 추가됨.

## Acceptance criteria
- [ ] Selective gate가 §6과 일치: novelty-threat는 항상 queue; low conf / disagreement에서 abstain→queue;
      high-conf support/adjacent/noise는 auto-accept.
- [ ] Negative test N1: watch-list hit이 있는 high-confidence `noise`는 discard가 아니라 queue됨.
- [ ] Negative test N3: `review.state`가 confirmed/accepted/overridden이 아니면 export 거부.
- [ ] Routing은 deterministic, table-driven, multi-route; 모든 §7 행이 test로 커버됨.
- [ ] `routed_finding`은 neutral (foreign product schema import 안 됨); discard = logged tombstone.
- [ ] Profile-load guard가 두 불변식을 완화하는 모든 profile을 거부 (watch-list hit의 auto-discard 없음;
      rationale는 절대 evidence 아님).
- [ ] Override는 calibration에 feed하는 label된 example을 산출; ECE 추적됨.
- [ ] 이 checkpoint에서 tree가 green.

## Rollback / safety
- Gate 결정, `review.state`, `routed_finding`은 derived metadata다; 이를 clear하면 post-RB-021 state로 복귀 —
  label + raw finding 불변.
- Cold-start safety: calibration data가 불충분하면 gate는 **queue**로 bias하며, 절대 silent
  auto-accept-into-discard로 가지 않음.
- Tombstone은 append-only다; 잘못된 `discard`는 tombstone log에서 복구 가능 (절대 hard-delete 안 함).
- profile 변경이 §1 불변식 (ADR-0004 §6)을 완화한다면, **멈춰라** — 그것은 어떤 profile도 해서는 안 되는
  단 하나의 일이다.

## Hand-off
Phase-3/4 synthesis (digest)는 각 finding이 `review.state` + `rationale_note{evidence:false}`를 가진 neutral
`routed_finding{decision, targets[], digest_eligible}`를 carry함을 가정할 수 있다. M1 export 경로 (DAG에 따라
앞당겨진 minimal CAW-03 ExportAdapter)는 `routed_finding` target을 소비한다 — 단 pre-confirm export gate를 지난
finding에 대해서만, 그리고 CAW-03로의 `novelty-threat`는 **advisory**로 남아 provenance로 뒷받침되며 절대 생성된
rationale로 뒷받침되지 않는다. needs-review queue + override log는 P3 calibration과 P5 ledger에 feed한다.
