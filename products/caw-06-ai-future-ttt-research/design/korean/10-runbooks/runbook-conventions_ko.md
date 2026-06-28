# 런북 규약 — CAW-06

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [./README_ko.md](./README_ko.md), [../_meta/DOC-CONVENTIONS_ko.md](../_meta/DOC-CONVENTIONS_ko.md), [../_meta/PRODUCT-BRIEF_ko.md](../_meta/PRODUCT-BRIEF_ko.md), [../09-roadmap/milestones-and-phases_ko.md](../09-roadmap/milestones-and-phases_ko.md), [../09-roadmap/dependency-graph_ko.md](../09-roadmap/dependency-graph_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적
모든 CAW-06 런북을 위한 **운영 계약**: STRICT 형식([DOC-CONVENTIONS §6](../_meta/DOC-CONVENTIONS_ko.md)을 CAW-06에 맞게 재진술한 것) 더하기 이 제품의 load-bearing 빌더 규칙. 설계(`../01-decisions/`의 ADR)를 결정하거나 런북을 나열([README.md](./README_ko.md) 참조)하지는 않습니다. 이 파일과 DOC-CONVENTIONS / PRODUCT-BRIEF가 충돌하면, brief가 우선합니다.

## 1. 엄격한 런북 형식
모든 런북 파일은 해당 phase 폴더 내의 `RB-XXX-topic.md`이며, phase별로 번호가 매겨집니다(`RB-0XX` P0 … `RB-4XX` P4). 다음 헤더로 시작한 다음 여섯 개의 고정 섹션이 **순서대로** 옵니다:

```
# RB-XXX: <imperative title>
- Status: ready | blocked
- Phase: <phase folder name>
- Depends on: [RB-###, ...]        # only upstream nodes in the DAG
- Implements design: [relative links to ADRs / design docs]
- Produces: <artifacts / components>

## Objective          — one paragraph; what "done" looks like
## Preconditions      — checklist true before starting
## Steps              — numbered atomic steps, each with **Do:** and **Verify:**
## Acceptance criteria — objectively checkable checklist (reference the phase exit gate)
## Rollback / safety  — how to undo a mid-way failure
## Hand-off           — what the next runbook may assume
```

규칙:
- **Steps는 원자적 + 검증 가능.** 각 step은 구체적인 **Do:**(하나의 동작)와 **Verify:**(관찰 가능한 확인 — 명령, 존재하는 파일, 통과하는 테스트)를 가짐. Verify 없는 step은 없음.
- **코드는 빌드 가이드일 뿐** — 스켈레톤, 시그니처, 스키마, 설정. 빌더가 실제 코드를 작성하며, 전체 구현을 붙여넣지 마세요.
- **Acceptance criteria**는 [milestones-and-phases.md](../09-roadmap/milestones-and-phases_ko.md)의 해당 phase 종료 게이트를 재진술해야 하며 객관적으로 확인 가능해야 함.
- 런북이 구현하는 모든 ADR/설계 문서를 **상호 링크**; 상류 런북은 `Depends on:`에 링크.
- `PRODUCT-BRIEF.md` / `GLOSSARY.md`의 엔티티 이름을 정확히 사용(Source, Claim, Hypothesis, ExperimentScout, ledger, `wbtraffic.v0`, ImplicationMap, ExportAdapter).
- 미지의 것은 `TODO(open-question: ...)`로 표기; 날짜, 수치, 벤치마크 값을 절대 지어내지 마세요.

## 2. CAW-06 빌더 규칙 (load-bearing — 모든 관련 런북에서 강제)

### No overclaim — status 생애주기
Hypothesis는 **4-state 가역 status**(`hypothesis` 기본 → `supported` | `refuted` | `inconclusive`)와 **보정된 정성적 불확실성**을 지닙니다. hypothesis는 **결코** 확정된 claim으로 제시되지 않습니다. 어떤 레코드도 status/uncertainty가 제거된 채로 함수/모듈 경계를 넘을 수 없습니다. hypothesis를 다루는 런북은 status 필드가 존재하고 올바르게 기본값이 설정되었는지 Verify해야 합니다(ADR-0002).

### Evidence cap (HARD)
**Generated evidence는 결코 hypothesis의 status를 승격할 수 없습니다.** Toy-experiment 출력, 모델 요약, 파이프라인 도출 신호는 불확실성 노트를 올리거나 내릴 수 있지만 status를 `supported`로 이동시킬 수 없습니다. evidence를 쓰는 런북은 cap이 유지되는지 Verify해야 합니다: status 승격을 시도하는 generated-evidence 쓰기는 거부됩니다. sources, claims, evidence, generated conclusions를 분리하세요(brief §12).

### Failures useful — 네거티브 결과 보존
claim을 **refute**하거나 **error**를 내는 toy experiment는 유효한 결과입니다. 네거티브 결과는 **기본적으로 기록, 분류, 노출**됩니다 — 결코 폐기되거나 숨겨지지 않습니다. 4-value verdict는 `{supported, refuted, inconclusive, error}`입니다. 런북은 의도적으로 실패하는 run 경로를 포함하고 그것이 persist되어 노출되는지 Verify해야 합니다(ADR-0003).

### Reproducibility gate (HARD)
**config + seed + env가 캡처되지 않으면 ledger 항목 없음.** 하나의 run = 하나의 append-only `ledger/EXP-XXXX` 항목으로, **사전 등록된 결정 규칙**(run 이전에 기록됨) → verdict를 기록합니다. 런북은 게이트가 config/seed/env가 누락된 항목을 차단하고 항목이 append-only인지(in-place 변경 없음) Verify해야 합니다(ADR-0003).

### Writeback은 CAW-01로의 export — 공유 스토어 없음
`wbtraffic.v0` 번들은 **자기 기술적**이며 **CAW-01의 L0 객체 + open questions 위로 lower**되고, **설정된 경계 경로로의 단방향 push**로 export됩니다. CAW-06은 형제 제품의 내부 스토어를 결코 읽거나 쓰지 않습니다. **CAW-01 IR 객체 이름은 CAW-01이 소유합니다 — 재확인하고, 가정하지 마세요.** v1 번들 = **analytic L0 추정**: 모든 ADR-0004 필드 존재, 수치 기본값 `null`/`TODO(open-question)`, basis는 `analytic-L0` 대 `toy-grounded-L0`로 표기, modeled-vs-measured 표기. Export는 **사람 게이트**입니다(Jimmy가 전략적 결정을 검토)(ADR-0004, ADR-0008).

### Generated summary는 evidence가 아님
모든 generated summary(implication-map 산문, hypothesis 서술, run 다이제스트)는 명시적 **generated** 플래그를 지니며 결코 evidence로 간주되지 않습니다. summary를 방출하는 런북은 플래그가 설정되었는지 Verify해야 합니다(brief §12, ADR-0006).

### Stub은 NotImplemented
포트(`SourceAdapter`, `ExperimentRunnerAdapter`, `ExportAdapter`)는 어댑터에 **앞서** 출하됩니다. 비-v1 어댑터는 **문서화, 등록, 비활성** — `NotImplemented` 스타일 가드를 발생시킵니다. 런북은 stub이 config 기반 레지스트리에 등록되어 있으나 호출 시 발생하는지 Verify해야 합니다(ADR-0001, ADR-0008).

### 트리를 녹색으로 유지
모든 Acceptance 체크포인트에서 트리는 **컴파일되고 lint를 통과**해야 하며, 중단된 빌드가 깔끔하게 재개되도록 합니다. 스토어와 파이프라인은 **멱등 + 재개 가능**해야 합니다: 런북의 step을 재실행해도 레코드가 중복되지 않고(S3에서 dedup) append-only ledger를 손상시키지 않습니다(ADR-0007).

## 3. 검증 어휘
기계적으로 확인 가능한 Verify step을 선호하세요: CLI 종료 코드, `store/...` 아래 생성된 파일 경로, 통과하는 단위 테스트, 스키마 검증기 통과, 레지스트리 조회, 0개의 새 레코드를 생성하는 멱등 재실행. brief가 사람 게이트를 의무화한 경우(export 검토)를 제외하고는 사람 판단에 의존하는 Verify step을 피하세요.

## 4. 경계 & 안전 기본값 (모든 런북)
- 출력에 기밀 회사 데이터 없음; ToS 안전 소스만 ingest.
- 공개 소스 연구와 내부 claim을 결코 혼동하지 않음.
- 제품 간 참조는 **import/export 경계** — 다른 제품을 명명(예: "CAW-01, a separate product"); 결코 공유 스토어/레지스트리/substrate를 암시하지 않음.
- 자동 scouting은 **제안/hypothesis 생성**; Jimmy가 전략적 결정의 검토자이며 export의 게이트입니다.
