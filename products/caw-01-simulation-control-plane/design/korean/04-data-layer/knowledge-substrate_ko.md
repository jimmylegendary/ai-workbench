# Run-Evidence Provenance & Trust — CAW-01

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [data-model.md](./data-model_ko.md), [../08-research-plan/validation-and-golden-tests.md](../08-research-plan/validation-and-golden-tests_ko.md), [../00-overview/scope-and-non-goals.md](../00-overview/scope-and-non-goals_ko.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## 목적

**이 제품 자신의 run**에 대해 **주장(claim), 증거(evidence), 생성된 결론을 분리**하여 유지하는 출처/감사
(provenance/audit) 모델을 정의한다 — 이는 CAW-01 산출물을, 제품 경계(product boundary)를 넘어 이를 소비하는 다른
독립 제품(예: 논문/특허 제품 CAW-03)의 증거로 사용 가능하게 만드는 불변식이다.

CAW-01은 독립적이고 단독으로 동작하는(standalone) 제품이다. **자신의 run에 필요한 최소한의 evidence/provenance만**
보관한다. 일반 지식 저장소(general knowledge repository) — 외부 `Source`/`Claim`/`Note`/`Concept`/`Interest`/
`OpenQuestion`을 수집(ingest)하는 것 — 은 **별도 제품(CAW-02)**이며 **여기서는 범위 밖**이다: CAW-01은 그러한
광범위한 지식 엔티티를 모델링하지 않으며, 자신의 evidence/claim을 제품 경계를 넘어 CAW-02로 export하거나 CAW-02에
의해 소비될 수 있다 — 절대 공유 저장소를 통하지 않는다.

## 핵심 불변식

> **주장(Claim)은 반드시 증거(Evidence)를 가리켜야 한다. 생성된 요약(summary)은 그 자체로 증거가 아니다.**

```
Claim ──(supported by)──► Evidence ──(refers to)──► {SimulationRun | TraceArtifact}
  ▲
generated conclusion ──┘  (must attach Evidence to become publishable)
```

시스템이 생성한 결론(예: "device X needs more capacity")은 **뒷받침되지 않은 주장(unbacked claim)**으로 시작하며,
run 출력(이 제품 자신의 run/artifact)을 가리키는 Evidence가 첨부될 때에만 게시 가능(publishable)해진다.
외부 소스와 광범위한 claim 그래프는 CAW-02(별도 제품)에 있다.

## 신뢰 수준 & 경계(boundary)

모든 `Evidence`(및 전이적으로 그것이 뒷받침하는 모든 `Claim`)는 다음을 지닌다:

| 필드 | 값 | 용도 |
| --- | --- | --- |
| `trust_level` | high / medium / low / unverified | 주장이 제안(proposal)을 뒷받침할 수 있는지를 게이트 |
| `boundary` | public / internal / confidential | 공개 대상 산출물에 무엇이 나타날 수 있는지를 게이트 |

가드레일([SOURCE-BRIEF §11](../_meta/SOURCE-BRIEF_ko.md)):
- 공개 대상 산출물에 confidential 데이터 금지.
- 공개 소스 연구를 내부 Samsung/SAIT 주장과 절대 혼동하지 않는다(boundary 태깅이 이를 강제).

## 신뢰 사다리(trust ladder) (시뮬레이션 증거용)

run에서 도출된 증거는 신뢰 사다리에서 어디에 위치하는지에 따라 등급이 매겨진다
([../08-research-plan/validation-and-golden-tests.md](../08-research-plan/validation-and-golden-tests_ko.md)):

1. **실행 가능한 가정(Executable assumption)** — syntorch가 아직 만들어지지 않은 device 가정을 실행 가능하게 만든다.
2. **명시적 런타임(Explicit runtime)** — tiling/partitioning을 산문이 아닌 코드/strategy-id로 표현한다.
3. **검증된 trace(Validated trace)** — syntorch trace를 A100/OTel golden 증거와 대조 검증한다.
4. **축 간 일치(Cross-axis agreement)** — 동일 L0에 대해 synthetic 축과 simulation 축이 허용 오차 내에서 일치한다.

`EvidenceService.trustStatus(runId)`는 어떤 run이 어느 단(rung)에 도달했는지를 드러낸다.

## 저장에서의 분리

- 생성된 텍스트는 `kind='generated'`인 `Claim`으로 저장되며, 절대 직접 `Evidence`로 저장되지 않는다.
- Evidence 행은 항상 구체적인 run/artifact id를 참조한다 — 자유 텍스트(free text)는 절대 안 됨.
- Projection은 자신이 계산된 `refs`를 인용하므로, artifact의 계보(lineage)를 재구성할 수 있다.

## 미해결 질문

정확한 `trust_level` 승격 규칙(어떤 증거가 low→high로 승격시키는가) — TODO(open-question), golden-test 임계값과 연결됨.

## 런북에 대한 함의

phase-0 데이터 레이어 런북이 claim→evidence FK 제약 + boundary/trust 컬럼을 인코딩한다. evidence/projection
런북은 "증거 없이는 게시 불가(no publish without evidence)"를 강제한다.
