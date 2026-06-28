# CAW-05 Runbook 규약 — 엄격한 형식 + 빌더 규칙

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: review date)
- **Related:** [./README_ko.md](./README_ko.md), [../_meta/DOC-CONVENTIONS_ko.md](../_meta/DOC-CONVENTIONS_ko.md), [../_meta/PRODUCT-BRIEF_ko.md](../_meta/PRODUCT-BRIEF_ko.md), [../05-radar-core/overview_ko.md](../05-radar-core/overview_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적
이 문서는 **모든 CAW-05 runbook이 어떻게 작성되고 실행되는지**를 고정합니다: 엄격한 runbook 형식([../_meta/DOC-CONVENTIONS_ko.md](../_meta/DOC-CONVENTIONS_ko.md) §6에서) 더하기 조기 경보 레이더에 핵심적인(load-bearing) **CAW-05 고유 빌더 규칙**(recall 우선; dedup + triage는 코어에서; abstain→human; 생성된 rationale은 결코 evidence로 export되지 않음; 합법/ToS 적합 sources만; stub은 `NotImplemented`; 트리를 green으로 남김). runbook 순서를 정하지 않으며(see [./README_ko.md](./README_ko.md)), 설계를 결정하지 않습니다(see ADR + `05-radar-core/`).

## 1. 엄격한 runbook 형식 (DOC-CONVENTIONS §6 — 필수)
모든 runbook 파일은 `RB-XXX-<topic>.md`(kebab-case)이며, `RB-0XX` = 스테이지 0 … `RB-4XX` = 스테이지 4로 번호가 매겨지고, **정확히** 다음 골격을 사용합니다:

```
# RB-XXX: <imperative title>
- Status: ready | blocked
- Phase: <phase folder name>
- Depends on: [RB-###, ...]
- Implements design: [relative links to ADRs / 05-radar-core docs]
- Produces: <artifacts/components>

## Objective         — one paragraph; what "done" looks like
## Preconditions      — checklist true before starting
## Steps              — numbered atomic steps, each with **Do:** and **Verify:**
## Acceptance criteria — objectively checkable checklist
## Rollback / safety  — how to undo a mid-way failure
## Hand-off           — what the next runbook can assume
```

본문 규칙:
- **원자적이고 검증 가능한 단계.** 모든 단계는 구체적인 **Do:** 동작과, 에이전트/CI가 주관적 판단 없이 평가할 수 있는 **Verify:** 검사를 갖습니다. 한 단계가 서로 무관한 두 변경을 결합해서는 안 됩니다.
- **코드는 빌드 가이드일 뿐** — skeleton, 시그니처, config 샘플. 실제 구현은 빌더가 작성합니다; 완성된 코드를 마치 산출물인 것처럼 붙여넣지 마세요.
- **설계 상호 링크.** `Implements design:`은 runbook이 실현하는 모든 ADR과 `05-radar-core/` 문서를 링크합니다; 설계 ↔ runbook의 추적성이 유지되도록 다시 링크하세요(DOC-CONVENTIONS §4).
- **지어낸 사실 금지.** 날짜, 벤치마크 수치, recall 목표치, 내부 사실을 지어내지 마세요. 알 수 없는 것은 `TODO(open-question: ...)`로 표시하고 [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md)를 링크하세요.
- **정확한 이름 사용**: PRODUCT-BRIEF / GLOSSARY의 이름(Run, SourceAdapter, FormatRenderer, ExportAdapter, LedgerLink, novelty-threat 등)을 사용하세요. 동의어를 새로 만들지 마세요.
- **Status 규율:** runbook은 모든 `Depends on:` runbook이 Acceptance를 통과할 때까지 `blocked` 상태입니다; 전제 조건이 충족될 때만 `ready`로 전환하세요.

## 2. CAW-05 빌더 규칙 (모든 runbook에 적용)
이 규칙들은 레이더의 정체성을 인코딩합니다. 이 중 하나를 위반하는 단계는 "동작"하더라도 결함입니다.

### R1 — 항상 Recall 우선
가까운 논문/시스템 하나를 놓치면 novelty가 사라질 수 있습니다(PRODUCT-BRIEF §1). Relevance는 **recall 우선 하한(floor)**을 사용합니다: 확신이 없으면 **노출하고, 버리지 마세요**. ranking/relevance runbook의 Acceptance 검사에는 **알려진 가까운 항목이 하한 아래로 떨어지지 않는지** watch-list spot-check가 반드시 포함되어야 합니다. false negative(놓친 결과)보다 false positive(사람이 훑어봄)를 선호하세요. 무거운 ML ranking은 v1에서 제외 — BM25-first, 가산적(additive), **설명 가능(explainable)**하게 유지하세요(ADR-0002, [../05-radar-core/interest-model_ko.md](../05-radar-core/interest-model_ko.md)).

### R2 — Dedup과 triage는 adapters가 아니라 CORE에 위치
SourceAdapters는 fetch + 정규화 + cursors 운반만 합니다. **다층 dedup**(cross-source, cross-run)과 모든 **classification/triage/routing**은 파이프라인 코어에서 일어납니다(ADR-0003/0004, [../05-radar-core/source-ingestion-and-dedup_ko.md](../05-radar-core/source-ingestion-and-dedup_ko.md)). dedup 또는 triage 로직을 adapter 안에 두는 runbook은 잘못된 것입니다. Verify: 두 sources에서 온 동일 항목, 또는 두 번째 Run의 동일 항목이 코어에서 하나의 finding으로 collapse됩니다.

### R3 — Classification은 사람에게 abstain (selective review)
캐스케이드는 recall에 편향된 **LF → LLM → human**입니다. 신뢰도가 낮으면 분류기는 **abstain하고 그 항목을 human review용으로 큐에 넣습니다** — 자동 결정하지 않습니다(ADR-0004, [../05-radar-core/classification-and-triage_ko.md](../05-radar-core/classification-and-triage_ko.md)). classify/route runbook의 Acceptance는 신뢰도가 낮은 finding이 자동 route가 아니라 human-review 큐에 도달하는지 반드시 검증해야 합니다. finding은 제안(proposal)이며, 전략적 결정의 리뷰어는 Jimmy입니다(PRODUCT-BRIEF §12).

### R4 — 생성된 rationale은 결코 evidence가 아니며, 사실로 export되지 않음
생성된 요약/rationale은 **별도로 저장되고 non-evidence로 플래그**됩니다(PRODUCT-BRIEF §5, §12, [../05-radar-core/synthesis-and-formats_ko.md](../05-radar-core/synthesis-and-formats_ko.md)). Export bundle은 모델 산문이 아니라 **source + claim + provenance**를 운반합니다. 공개 source 연구를 내부 Samsung/SAIT claim과 절대 혼동하지 마세요. Verify: export 페이로드는 provenance가 뒷받침된 필드를 포함하고, 생성된 텍스트는 모두 generated로 표시되며 evidence 필드에서 제외됩니다.

### R5 — 합법 / ToS 적합 sources만
**공개적이고 합법/ToS 적합인** sources만 ingest합니다(PRODUCT-BRIEF §12). 유료(paywall) 또는 ToS 위반 ingestion은 절대 금지. 공개 출력물에 기밀 회사 데이터 금지. source runbook은 접근 경로가 source의 ToS/rate limit을 존중하는지(예: ETag/date cursors, 문서화된 API 약관) 반드시 검증해야 합니다. 불확실하면 stub으로 남기세요(R6).

### R6 — Stub은 자신의 port 뒤에서 문서화된 `NotImplemented`
비-v1 기능 — sources(Reddit, SEC/EDGAR, newsletters, 내부 feed), 4개의 비-digest 포맷, 비-CAW-03 export, 비-cron scheduler — 는 자신의 port 뒤에서 **`NotImplemented`를 raise하는 문서화된 stub**으로 출하되며, config에 등록되고 기본 비활성화됩니다(PRODUCT-BRIEF §9, ADR-0001). stub은 결코 데이터를 조용히 위조하지 않습니다. Verify: stub이 port 레지스트리에 목록화되고, 호출 시 `NotImplemented`를 raise하며, 기본적으로 off입니다.

### R7 — Export는 오직 ExportAdapter port를 통해서만; 공유 store 없음
**ExportAdapter가 유일한 export seam입니다**(ADR-0007, [../05-radar-core/export-boundaries_ko.md](../05-radar-core/export-boundaries_ko.md)). 직접적인 cross-product 쓰기 없음, CAW-01/02/03/06과 공유되는 런타임/store 없음. Bundle은 파일/API 경계이며 **signed**됩니다. novelty-threat export는 provenance가 완전한 LedgerLink로 추적되어야 합니다(M2에서 검증; M1 최소 케이스에 대한 open question은 DAG 문서 참고). Verify: 모든 export가 port를 통과하고 signed bundle을 생성합니다.

### R8 — 트리를 green으로 남김 (파일에서 재개 가능)
모든 Acceptance 체크포인트에서 트리는 **컴파일, lint, 테스트 통과**하며, 상태는 파일(`interests.yaml`, `findings/*.json`, `ledger/*.jsonl`) + SQLite 인덱스에 존재합니다(FILES-AS-TRUTH, ADR-0006). 중단된 빌드나 Run은 메모리가 아니라 파일에서 재개됩니다. 트리를 red로 남기는 runbook은 완료된 것이 아닙니다.

## 3. Verify 단계 품질 기준
**Verify:**는 빌드 에이전트나 CI가 실행하여 모호함 없는 pass/fail을 얻을 수 있을 때만 허용됩니다 — 예: 명령 exit code, 필수 필드를 가진 파일의 존재, 테스트 이름, 개수, green lint. "맞아 보임" / "합리적으로 보임"은 피하세요. 위의 각 빌더 규칙(R1–R8)은 해당되는 곳마다 구체적인 Verify로 나타나야 합니다.

## 4. 완료의 정의 (runbook별)
- 모든 `Steps`가 그들의 `Verify:`를 통과함.
- 모든 `Acceptance criteria` 체크박스가 객관적으로 확인됨.
- 해당되는 빌더 규칙 R1–R8이 가정이 아니라 검증됨.
- 트리가 green이고 `Hand-off`가 다음 runbook이 가정해도 되는 것을 정확히 기술함.

## 인계 (Hand-off)
빌더: 이 파일을 읽고, 다음으로 순서를 위해 [./README_ko.md](./README_ko.md)를 읽은 뒤, 현재 phase 폴더에서 가장 낮은 번호의 `ready` runbook을 실행하세요. 여기의 지침이 runbook과 충돌하면 이 규약 문서 + 설계가 우선합니다; 설계가 [../_meta/PRODUCT-BRIEF_ko.md](../_meta/PRODUCT-BRIEF_ko.md)와 충돌하면 brief가 우선합니다.
