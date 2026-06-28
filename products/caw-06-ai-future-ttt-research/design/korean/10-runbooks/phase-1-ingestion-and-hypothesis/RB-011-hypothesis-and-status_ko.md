# RB-011: hypothesis 레코드 종류, 가역적(reversible) status 생명주기, 보정된(calibrated) 불확실성, 강한 evidence cap 구축

- Status: ready
- Phase: phase-1-ingestion-and-hypothesis
- Depends on: [RB-001 (스토어 레이아웃 + 레코드 스키마), RB-010 (수집 → CandidateClaim 레코드)]
- Implements design:
  - [../../05-ttt-research-core/hypothesis-and-uncertainty.md](../../05-ttt-research-core/hypothesis-and-uncertainty_ko.md) (과대주장 방지 계약)
  - [../../01-decisions/ADR-0002-hypothesis-representation.md](../../01-decisions/ADR-0002-hypothesis-representation_ko.md) (핵심을 떠받치는 결정)
  - [../../05-ttt-research-core/experiment-scout-pipeline.md](../../05-ttt-research-core/experiment-scout-pipeline_ko.md) (2–3단계: Claim 통합, 가설 수립)
- Produces: 교차 참조 id를 가진 세 가지 레코드 종류(`Claim`, `Hypothesis`, `Evidence`); append-only `status_log` 위의 4상태 가역적 status 생명주기; `confidence ≤ evidence_strength` cap을 가진 보정된 정성적 불확실성 필드; 강한 규칙을 강제하는 검증기(바닥값 `hypothesis`, `generated`는 승격 불가); `store/hypotheses` 아래에 `Hypothesis` 레코드를 산출하는 scout 가설 생성 단계.

## Objective
코어는 **"어떤 소스가 X라고 말한다" (`Claim`)**, **"우리가 Y를 확인하고자 제안한다" (`Hypothesis`)**, **"우리가 Y와 관련된 Z를 관찰했다" (`Evidence`)**를 id로 교차 참조되는 세 개의 분리된, 개별 주소 지정 가능한 레코드로 구조적으로 구별할 수 있다 — 결코 하나의 "사실(fact)" 덩어리로 병합되지 않는다. "완료(Done)"의 의미는 다음과 같다: stage-2가 `CandidateClaim`을 귀속된 `Claim`으로 통합한다; stage-3가 하나 이상의 `Claim`으로부터 `status=hypothesis`, `confidence=very-low`, `falsifiability`(또는 `TODO`)를 가진 ≥1개의 `Hypothesis`를 생성한다; status 생명주기는 가역적이고 append-only다; 그리고 **검증기는** status 없이 직렬화된 모든 hypothesis, 그 `evidence_strength` cap을 초과하는 모든 `confidence`, 그리고 유일한 증거가 `evidence_kind=generated`인 모든 `→ supported`/`→ refuted` 전이를 **거부한다**. hypothesis는 결코 확정된 claim으로 렌더링되거나 export되지 않는다.

## Preconditions
- [ ] RB-010 완료: `store/claims`가 귀속된 `CandidateClaim`(축자적 스팬, `source_locator`, `claim_type`, `writes_back`, `status=unverified`, `asserted_by`)을 보유; `store/sources` 중복 제거됨.
- [ ] RB-001 완료: 스토어 레이아웃 + 기본 레코드 스키마/검증기 하네스 import 가능.
- [ ] RB-010 수락 체크포인트에서 트리가 그린.
- [ ] hypothesis-and-uncertainty.md §4의 보정 표가 테스트 케이스로 인코딩할 수 있게 사용 가능.

## Steps

### 1. 세 가지 분리된 레코드 종류 구현
- **Do:** `Claim`, `Hypothesis`, `Evidence`를 id 교차 참조를 가진 세 개의 스키마로 정의한다(결코 합쳐지지 않음). `Claim`은 `asserted_by` provenance를 지니고 "<source> claims …"로 렌더링한다. `Hypothesis`는 `statement`, `theme`, `status`, `confidence`, `evidence_strength`, `agreement`, 선택적 `likelihood`, `falsifiability`, `reproducibility`, `derived_from_claims[]`, `evidence[]`(Evidence id들), `status_log[]`, `boundary`, `provenance`를 지닌다. `Evidence`는 `evidence_kind ∈ {experiment, external, generated}`, `supports`(Hypothesis id), `direction ∈ {supporting, disconfirming, neutral}`, `strength`, 그리고 해당되는 경우 `ledger_ref`/`source_ref`를 지닌다. hypothesis-and-uncertainty.md §5의 예시 형태를 참고한다(빌더가 실제 스키마를 작성).
- **Verify:** 세 종류 모두에 대해 라운드트립 직렬화 테스트가 통과한다; 테스트는 세 종류가 id로 독립적으로 주소 지정 가능하며 어떤 스키마도 다른 것의 페이로드를 인라인으로 임베드하지 않음("fact" 덩어리 없음)을 검증한다. `Claim`을 `Hypothesis` 결론으로 재진술하는 것은 구조적으로 불가능하다(서로 다른 레코드).

### 2. stage-2 구현: CandidateClaim을 Claim으로 통합
- **Do:** RB-010의 `CandidateClaim`을 `asserted_by`가 소스로 설정된 `Claim` 레코드로 정규화/통합하는 stage-2 단계를 구축한다. 귀속과 축자적 스팬을 보존한다; 결코 claim을 "우리의 결론"으로 의역하지 않는다. `claim_type`과 `writes_back`을 이월(carry forward)한다.
- **Verify:** 테스트는 각 `Claim`이 `asserted_by`, 그 `claim_type`, `writes_back`을 유지하는지 검증한다; 텍스트로 렌더링된 `Claim`은 "<source> claims …"로 읽히며 결코 "it is true that …"로 읽히지 않는다. 검증기는 `asserted_by`가 없는 `Claim`을 거부한다.

### 3. append-only 로그 위의 4상태 status 생명주기 인코딩
- **Do:** **기본값이자 바닥값이 `hypothesis`**인 status `hypothesis | supported | refuted | inconclusive`를 구현한다. status는 append-only `status_log`의 최신 항목으로 해석된다(각 `StatusEvent`: `ts`, `from→to`, 촉발 `evidence` id들, `by`). `supported`/`refuted`는 **결코 종료 상태가 아니다** — 어떤 상태든 새롭거나 모순되는 증거에 대해 재개된다(생명주기는 가역적). `current_status(hypothesis)` 해석기 = 최신 이벤트를 구현한다.
- **Verify:** 테스트가 `hypothesis → supported → refuted → inconclusive → hypothesis`를 구동하여, 각 전이가 `StatusEvent`를 추가하는지(결코 이전 이벤트를 변경/삭제하지 않음), `current_status`가 최신을 반환하는지 검증한다. `supported` 이후의 재개가 수용되어 가역성을 증명한다.

### 4. 강한 규칙을 검증기로 강제 (핵심을 떠받침)
- **Do:** 다음을 **거부**하는 검증기를 추가한다: (a) `status` 없이 직렬화된 모든 `Hypothesis`(바닥값 `hypothesis`); (b) `hypothesis` 외의 것에 있는 증거 0개 hypothesis; (c) 촉발 증거가 **오직** `evidence_kind=generated`인 모든 `→ supported` 또는 `→ refuted` `StatusEvent` — generated 증거는 `inconclusive`에만 정보를 줄 수 있다; (d) `status`/`confidence`가 누락된 모든 export 대상 hypothesis. 이들은 경고가 아니라 불변식(invariant)이다.
- **Verify:** 테스트는 각 거부가 발동하는지 검증한다: status 없는 hypothesis는 검증에 실패한다; `generated` Evidence만으로 `supported`로 승격하면 발생(raise)한다; 하나의 `experiment`/`external` Evidence를 가진 동일 승격은 통과한다. `generated`만 가진 Evidence는 status를 `inconclusive`로 이동시킬 수 있고 그것은 통과한다.

### 5. cap을 가진 보정된 정성적 불확실성 구현
- **Do:** `evidence_strength ∈ {none, weak, moderate, strong}` × `agreement ∈ {conflicting, mixed, consistent}`에서 도출되는 `confidence ∈ {very-low … very-high}`를 구현하며 기본값은 `very-low`다. **강한 cap**을 강제한다: `confidence`는 산문과 무관하게 `evidence_strength`에 의해 제한된다(`none → very-low`, `weak → low`). `likelihood`는 선택적이며 **정량화되지 않으면 생략된다** — 결코 숫자를 지어내지 않는다(빈 값 ≠ "반반의 가능성"). `falsifiability`는 markdown이며 **`hypothesis`를 떠나려면 필수**다(누락 ⇒ `TODO`이지 `supported` 후보가 아님). `reproducibility ∈ {unrun, single-run, replicated, failed-to-reproduce}`.
- **Verify:** §4 보정 표를 테스트 케이스로 인코딩한다(예: generated만 ⇒ `evidence_strength=none/weak`, `confidence=very-low`; 단일 toy run 지지 ⇒ `moderate`/`low`; 두 run 불일치 ⇒ `conflicting`/`very-low`). 테스트는 `evidence_strength=weak`에서 `confidence=high` 설정이 cap에 의해 거부되는지, 그리고 누락된 `likelihood`가 부재로 남는지(결코 숫자로 기본값화되지 않음) 검증한다.

### 6. stage-3 구현: 안전한 기본값을 가진 scout 가설 생성
- **Do:** 하나 이상의 `Claim`으로부터 확인 가능한 `Hypothesis` 레코드를 제안하는 stage-3 단계를 구축한다(여기서는 claim 간 추론이 허용됨). 생성된 모든 hypothesis는 `status=hypothesis`, `confidence=very-low`, `evidence_strength=none|weak`, `reproducibility=unrun`으로 만들어지며, `derived_from_claims[]`가 설정되고 `falsifiability`가 채워지거나 `TODO`로 방출된다. 생성 산문 자체는 증거가 **아니다**; 기록된다면 그것은 `evidence_kind=generated`인 `Evidence`다(이는 status를 승격할 수 없음). `store/hypotheses`에 영속화한다.
- **Verify:** RB-010 claim에 대해 stage-3을 실행하면 `derived_from_claims`가 채워진 채 안전한 기본값을 가진 ≥1개의 `Hypothesis`가 산출된다; 테스트는 어떤 생성된 hypothesis도 `very-low`보다 높게 만들어지지 않으며, 생성된 근거(rationale)는 승격이 아니라 `evidence_kind=generated`로 안착함을 검증한다. 핵심 TTT-writeback hypothesis는 전제(premise)가 아니라 추적되는 `Hypothesis`로서 존재한다.

### 7. export 경계 입장 검증 (과대주장 없음, 공유 스토어 없음)
- **Do:** (여기서 어댑터를 구축하지 않고 코드/테스트로) `hypothesis`-status 항목은 `confidence` + `falsifiability`를 지닌 미래 워크로드 **open question**으로서 CAW-01(별도 제품)로만 export 자격이 있으며, 헐벗은(bare) hypothesis는 CAW-02 claim+evidence export 자격이 없음을 확인한다. export는 `status` + `confidence` + 증거 링크를 **인라인**으로 지녀야 한다. 어떤 레코드도 불확실성이 벗겨진 채로 경계를 넘지 않는다. (어댑터는 phase 4에서 구축됨; 이 단계는 자격 술어(eligibility predicate)만 강제한다.)
- **Verify:** 자격 술어 테스트는 `status=hypothesis` 항목이 "CAW-01 open question만"으로 매핑되고 CAW-02 claim 게이트에 의해 거부되는지 검증한다; `confidence`/`status`가 누락된 hypothesis는 모든 export 자격 검사에 의해 거부된다.

## Acceptance criteria
- [ ] 세 가지 분리된 레코드 종류(`Claim`, `Hypothesis`, `Evidence`)가 존재하며 id로 교차 참조되고 결코 하나의 fact 덩어리로 병합되지 않는다.
- [ ] `Claim`은 `asserted_by` + 축자적 귀속을 유지한다; "<source> claims …"로 렌더링되며 결코 우리의 결론으로 렌더링되지 않는다.
- [ ] `Claim`(들)로부터 `status=hypothesis`, `confidence=very-low`, `derived_from_claims`와 `falsifiability`(또는 `TODO`)를 가진 ≥1개의 `Hypothesis`가 생성됨.
- [ ] status 생명주기는 4상태, 기본값+바닥값 `hypothesis`, append-only `status_log`, `current = 최신 이벤트`, 완전히 가역적(`supported`/`refuted` 이후 재개 작동).
- [ ] 검증기가 거부한다: status 없는 hypothesis; 증거 0개인 비-`hypothesis`; `generated` 증거만으로 구동되는 `→ supported`/`→ refuted`(강한 evidence cap); status/confidence가 누락된 export 대상 레코드.
- [ ] 보정된 불확실성이 강제됨: `confidence ≤ evidence_strength` cap 유지; 정량화되지 않으면 `likelihood` 생략; `hypothesis`를 떠나려면 `falsifiability` 필수. §4 보정 예시가 테스트로 통과.
- [ ] export 자격 술어가 강제됨: `hypothesis` → CAW-01 open-question만; 헐벗은 hypothesis는 CAW-02 게이트에 의해 거부됨; 불확실성이 인라인으로 동행; 공유 스토어 가정 없음.
- [ ] 이 체크포인트에서 트리가 그린(컴파일 성공, lint 통과)이다.

## Rollback / safety
- `status_log`는 append-only다; 결코 `StatusEvent`를 삭제하거나 재작성하지 않는다. 잘못된 전이를 "되돌리려면" 교정 전이를 추가하고(감사 가능), 이력을 변경하지 않는다.
- 검증기 변경이 `generated` 증거가 status를 승격하게 하거나 hypothesis가 status/confidence 없이 직렬화되게 한다면, **멈춰라** — 그것은 기능 요청이 아니라 핵심을 떠받치는 불변식이 깨지는 것이다(ADR-0002 재검토 트리거). 변경을 되돌려라.
- hypothesis 레코드는 `store/hypotheses` 아래에서 가산적(additive)이다; 잘못된 stage-3 패스는 그것이 만든 hypothesis id만 삭제하여(이들은 `created_at`/`created_by` provenance를 지님) 되돌리고 재실행할 수 있다.
- 게이트를 통과시키려고 `likelihood` 숫자나 `falsifiability`를 결코 조작하지 않는다; 대신 `TODO(open-question: ...)`를 방출한다(DOC-CONVENTIONS §3).

## Hand-off
다음 phase(**RB-2XX, experiment ledger**)는 다음을 가정할 수 있다: `store/hypotheses`가 `status=hypothesis`/`confidence=very-low`이며 `falsifiability`(또는 `TODO`)와 `reproducibility=unrun`을 가진 추적되는 `Hypothesis` 레코드를 보유하고, ledger 판정(verdict)을 받을 준비가 된 `Evidence` 레코드 종류와 status 생명주기가 마련되어 있다. ledger 판정(실패 포함)은 `Evidence`(`evidence_kind=experiment`, 음성 결과 포함)를 만들고 `StatusEvent`를 **제안**한다 — 오직 `experiment`/`external` 증거만 `→ supported`/`→ refuted`를 구동할 수 있으며, `→ supported`는 인간 게이트(human-gated)다. 생성된(generated) 요약은 결코 증거가 아니다; 어떤 것도 status/불확실성이 벗겨진 채 export되지 않는다.
