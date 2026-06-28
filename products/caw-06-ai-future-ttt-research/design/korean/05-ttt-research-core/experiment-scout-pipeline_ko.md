# ExperimentScout 파이프라인 — Run + ingestion 단계

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [./overview.md](./overview_ko.md) (코어가 무엇인지 + 폴더 맵)
  - [./hypothesis-and-uncertainty.md](../05-ttt-research-core/hypothesis-and-uncertainty_ko.md) (status/uncertainty 계약)
  - [../01-decisions/ADR-0001-product-surface-and-scout.md](../01-decisions/ADR-0001-product-surface-and-scout_ko.md) (the Run)
  - [../01-decisions/ADR-0005-source-and-claim-ingestion.md](../01-decisions/ADR-0005-source-and-claim-ingestion_ko.md) (5단계 ingestion)
  - [../02-research/source-and-claim-ingestion.md](../02-research/source-and-claim-ingestion_ko.md) (서술)
  - [../01-decisions/ADR-0003-experiment-ledger.md](../01-decisions/ADR-0003-experiment-ledger_ko.md) (5단계 verdict)
  - [../01-decisions/ADR-0006-implication-mapping.md](../01-decisions/ADR-0006-implication-mapping_ko.md) (6단계)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적

이 문서는 **`ExperimentScout` Run이 어떻게 thread를 전진시키는지**를 기술한다: **여섯 개의 scout 단계**
(`discover → extract → hypothesize → plan-repro → log-result → map-implications`)와 discover 단계 안에 들어
있는 **5단계 ingestion 하위 파이프라인**(`S1 Discover → S2 Import from CAW-05 → S3 Canonicalize+Dedup →
S4 Extract claims → S5 Persist`)을 다룬다. 이 문서는 **멱등(idempotent) + 재개 가능(resumable)** 실행 모델을
확정한다. hypothesis 표현([hypothesis-and-uncertainty.md](../05-ttt-research-core/hypothesis-and-uncertainty_ko.md)
참조), 원장 스키마(ADR-0003), writeback 스키마(ADR-0004), implication mapping 내부(ADR-0006),
저장/스케줄링 메커니즘(ADR-0007)을 재정의하지 **않으며** — 그것들을 안정적인 경계로 소비한다.

## 1. 실행 모델: 멱등 + 재개 가능

`Run`은 범위 내(in-scope) 각 thread를 가능한 한 많은 단계만큼 전진시키는 한 번의 pass이며, 다음 속성을
가진다(ADR-0001 §1, ADR-0005):

| 속성 | 메커니즘 |
|---|---|
| Single-flight | Run 락; 겹치는 발화는 두 번 큐잉되지 않고 건너뜀 |
| Resumable | thread별 단계별 체크포인트; 크래시는 마지막 완료 단계에서 재개 |
| Idempotent | 완료된 thread-stage 재실행은 **no-op**; dedup 키가 중복 source/claim 방지 |
| Incremental | 각 `SourceAdapter`가 `FetchCursor`를 전진; 새 항목만 진입 |
| Catch-up | (cron이 아닌) Run 래퍼가 누락된 윈도우 계산; 평범한 cron에서도 정확 |
| Observable | Run당 run-receipt heartbeat; `status` op이 thread별 단계 보고 |

**트리거 모드.** 스케줄형(cron v1)은 모든 활성 thread에 대해 주기적 Run을 발화한다. 트리거형
(`caw06 run --thread <id>`, 또는 CAW-05 import 이벤트)은 단일 thread를 즉시 열거나 전진시킨다
(`TODO(open-question: import triggers an immediate single-thread Run, or enqueue for the next pass? lean: enqueue
+ optional --now.)`).

## 2. 여섯 개의 scout 단계

```
 ┌──────────┐   ┌──────────┐   ┌────────────┐   ┌───────────┐   ┌────────────┐   ┌──────────────────┐
 │ 1 Discover│─►│ 2 Extract │─►│ 3 Hypoth.  │─►│ 4 Plan    │─►│ 5 Log      │─►│ 6 Map            │
 │ (ingest) │   │  claims  │   │   esize    │   │  repro    │   │  result    │   │  implications    │
 └──────────┘   └──────────┘   └────────────┘   └───────────┘   └────────────┘   └──────────────────┘
   Source         Claim          Hypothesis       experiment      ledger entry      ImplicationMap
   Candidate-                    (status=          plan +          + Evidence        + export routing
   Claim                         hypothesis)       decision rule   (failures kept)
```

| # | 단계 | 입력 | 동작 | 출력 | 과대주장 방지 가드 |
|---|---|---|---|---|---|
| 1 | Discover | adapters + cursors | 5단계 ingestion 실행(§3) | `Source`, `CandidateClaim` | ingestion은 무엇도 참이라 단언하지 않음; 추출적(extractive)일 뿐 |
| 2 | Extract claims | `CandidateClaim`들 | `asserted_by`를 가진 `Claim`으로 통합/정규화 | `Claim` | "<source> claims …"로 렌더, 결코 "it is true that …"가 아님 |
| 3 | Hypothesize | `Claim`들 | 검증 가능한 hypothesis 제안; 여기서는 claim 간 추론 허용 | `Hypothesis` | `status=hypothesis`, `confidence=very-low`로 생성; `falsifiability` 또는 `TODO` 요구 |
| 4 | Plan reproduction | 하나의 `Hypothesis` | 최소 toy 실험 설계; **결정 규칙 사전 등록** + config+seed+env | 실험 계획 | 실행 전 규칙 고정(ADR-0003); 범위 낚시(scope-fishing) 금지 |
| 5 | Log result | plan + runner 출력 | 하나의 **append-only** 원장 항목; verdict → `Evidence`; 실패 보존 + 분류 | 원장 항목, `Evidence`, 제안된 `StatusEvent` | `generated` verdict 텍스트는 결코 `experiment` 증거가 아님; reproducibility gate(config+seed+env) |
| 6 | Map implications | 하나의 발견 | 도메인 전반에 걸친 타입화된 implication; 요약을 **generated, not evidence**로 표시 | `ImplicationMap`, 익스포트 제안 | 요약은 `generated` 태그; 익스포트는 status로 게이팅 |

**Human gate.** 1–4단계와 5단계의 *로깅*은 무인으로 실행된다. **종단 경로(terminal routes)** — hypothesis를
`supported`로 승격, claim+evidence를 CAW-02로 익스포트, `wbtraffic` 번들을 CAW-01에 커밋 — 는
**제안만(proposal-only)** 한다: Run/agent는 대기 중인 human-gate 이벤트를 생성하고, Jimmy가 확인한다(brief §12;
ADR-0001 §4).

## 3. 5단계 ingestion 하위 파이프라인(Discover 내부)

ADR-0005에 의해 확정됨. 하나의 파이프라인, 다섯 단계, 각각 하나의 책임과 타입화된 출력; ingestion은 **S5에서
멈추며** hypothesis 단계로 절대 진입하지 않는다.

```
 S1 Discover ─► S2 Import(CAW-05) ─► S3 Canonicalize+Dedup ─► S4 Extract claims ─► S5 Persist
  arXiv/S2        action-brief        DOI▸arXiv▸norm(title)     extractive span     store/{sources,claims}
  via adapters    bundle (read-only)  merge multi-origin        + source_locator    provenance-stamped
```

| 단계 | 책임 | 핵심 규칙 | 출력 |
|---|---|---|---|
| S1 Discover | `SourceAdapter` 뒤에서 공개 TTT 연구 수집 | 멱등+증분(`FetchCursor`); adapter 내 rate-limit/backoff; legal-mode(공개, ToS 준수); adapter에서 추출 없음 | 원시 source 레코드 |
| S2 Import from CAW-05 | CAW-05(별개 제품)에서 `action-brief` 번들 읽기 | **읽기 전용, 공개, 비증거적**(CAW-05 산문은 `evidence:false`); `bundle_id` = import 워터마크; 알 수 없는 스키마 major ⇒ 타입화된 `SourceUnavailable`, 절대 추측 금지 | 가져온 항목 |
| S3 Canonicalize+Dedup | origin 전반에 걸친 단일 정체성 | `DOI ▸ arXiv id ▸ normalized(title+first-author+year)`; 여러 `provenance`를 가진 하나의 `Source`로 병합; arXiv 버전은 구별-되-연결 유지; 알려진 논문의 CAW-05 import는 새 source가 아니라 `provenance{origin:"caw05"}`를 추가 | 중복 제거된 `Source` |
| S4 Extract claims | 원자적, 귀속 가능한(attributable) claim | 각 `CandidateClaim`은 축어적 `evidence_span` + `source_locator` + `claim_type` + `writes_back` 플래그(기본 `unknown`)를 가짐; `status=unverified`; 모든 의역(paraphrase)은 `evidence:false`; `supported`를 절대 방출하지 않음 | `CandidateClaim` |
| S5 Persist | CAW-06 자체 저장소에 쓰기 | provenance가 찍힌 markdown/JSON(ADR-0007); canonical id를 키로 한 멱등 upsert | `store/sources`, `store/claims` |

### CandidateClaim 형태(예시 — 빌더가 스키마를 작성)

```jsonc
{
  "id": "CLM-2026-0031",
  "kind": "CandidateClaim",
  "source_ref": "SRC-2026-0012",
  "claim_type": "memory-traffic",        // mechanism|quantitative-result|capability|efficiency|memory-traffic|reproducibility
  "statement": "TTT-E2E updates fast weights per segment during inference.",
  "evidence_span": "… we update the inner weights W via a self-supervised loss at test time …",  // verbatim
  "source_locator": {"section": "3.2", "page": 5},
  "writes_back": "unknown",              // true|false|unknown  (default unknown — brief §6)
  "status": "unverified",                // ingestion NEVER emits supported
  "evidence": false,                     // this is an attributed assertion, not our verdict
  "asserted_by": "SRC-2026-0012",
  "provenance": {"retrieved_at": "TODO", "boundary": {"imports_from": []}}
}
```

`memory-traffic` claim_type + `writes_back` 플래그는 writeback-traffic 스키마(ADR-0004)와 CAW-01
익스포트(ADR-0008)가 하류에서 소비하는 씨앗이다.

## 4. CAW-05 import 경계(명시적, 공유 아님)

CAW-05는 **자체 저장소를 가진 별개 제품**이다. 우리는 그것의 `action-brief` 익스포트만을 file-drop 또는
pull 엔드포인트를 통해 가져온다 — 결코 공유 저장소/레지스트리/런타임이 아니다. 번들은 읽기 전용, 공개,
provenance를 지니며, **비증거적**으로 취급된다: `open_question`은 `mechanism`/`memory-traffic` 타입의
**씨앗 `CandidateClaim`**이 되며, `status=unverified`, `writes_back=unknown` — 절대 `supported`가 아니다.
CAW-05의 `classification`/`relevance`는 **우선순위 힌트로만** 함께 따라오며, 결코 진리 verdict가 아니다.
`TODO(open-question: confirm CAW-05's action-brief wire schema + delivery against CAW-05's own ADR-0007 at the
boundary.)`

## 5. 재개 가능성 체크포인트(단계별 "done"의 의미)

| 단계 | 체크포인트 = done 조건 | 재개 동작 |
|---|---|---|
| Ingestion S1–S5 | cursor 전진 + sources/claims upsert | 재실행은 이미 영속화된 canonical id를 건너뜀 |
| Hypothesize | `status=hypothesis` + `falsifiability` 또는 `TODO`로 `Hypothesis` 작성 | claim 집합에 대한 기존 hypothesis는 재생성되지 않음 |
| Plan repro | plan + 사전 등록 결정 규칙 + config+seed+env 기록 | 커밋된 plan이 없을 때만 재계획 |
| Log result | 원장 항목 추가(불변) + `Evidence` 작성 | 로깅된 run은 절대 덮어쓰지 않음; 재실행은 **새** 항목 |
| Map implications | `ImplicationMap` 작성; 익스포트 제안은 gate 대기 | 재매핑은 맵을 갱신; 익스포트는 제안만 유지 |

## Open Questions

[../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) 참조.

- `TODO(open-question: claim-extraction method — single extract+attribute pass vs a verify pass re-checking each claim against its span?)`
- `TODO(open-question: is abstract+metadata enough for memory-traffic claim extraction, or is arXiv full text/PDF required for v1?)`
- `TODO(open-question: dedup tie-break when CAW-05 canonical_id disagrees with our directly-discovered id?)`
- `TODO(open-question: does a CAW-05 import trigger an immediate single-thread Run, or enqueue for the next pass?)`

## 런북에의 함의

- **Run 래퍼 런북:** 락 + 단계별 체크포인트 + cursor catch-up + heartbeat; 평범한 cron에서도 정확.
- **Ingestion 런북:** `SourceAdapter` 뒤의 5단계; v1 adapter(arXiv, Semantic Scholar, CAW-05 import)
  + 문서화된 스텁; canonical id에 대한 멱등 upsert.
- **단계 런북:** hypothesize(ADR-0002의 기본값), plan-repro(사전 등록 규칙, reproducibility gate),
  log-result(append-only, 실패 보존), map-implications(요약은 generated 태그).
- **Gate 런북:** 종단 경로(승격/익스포트)는 대기 중인 human-gate 이벤트를 방출; 절대 자동 실행되지 않음.
