# 검증 및 테스트(Validation & Tests)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./research-plan_ko.md](./research-plan_ko.md), [./open-questions_ko.md](./open-questions_ko.md)
  - [../_meta/PRODUCT-BRIEF_ko.md](../_meta/PRODUCT-BRIEF_ko.md), [../_meta/DOC-CONVENTIONS_ko.md](../_meta/DOC-CONVENTIONS_ko.md)
  - ADRs: [0002](../01-decisions/ADR-0002-hypothesis-representation_ko.md) · [0003](../01-decisions/ADR-0003-experiment-ledger_ko.md) · [0004](../01-decisions/ADR-0004-writeback-traffic-schema_ko.md) · [0005](../01-decisions/ADR-0005-source-and-claim-ingestion_ko.md) · [0008](../01-decisions/ADR-0008-export-boundaries_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적

이 문서는 CAW-06의 load-bearing 가드레일을 기계 검사 가능한 단언으로 바꾸는 **불변(invariant) 테스트**를
규정한다. 이것들은 모든 함수에 대한 단위 테스트가 아니라 *가드레일 테스트*다 — 각각은 PRODUCT-BRIEF가 결코
깨져서는 안 된다고 말하는 속성을 방어한다: **no overclaim**, **failures useful**, **불확실성이 벗겨진 채 어떤
것도 경계를 넘지 않음**, **no shared store**, 그리고 **멱등적/재개 가능한 scouting**. 이 문서는 테스트 프레임워크
메커니즘이나 커버리지 목표를 정의하지 않으며(런북 관심사); *무엇이 참이어야 하는지*와 각 테스트가 실행되는
fixture를 정의한다. 아래 모든 테스트는 ADR과 런북 acceptance criterion으로 매핑된다.

## 1. 테스트 카탈로그 (불변)

| # | Invariant | Defends | ADR | Type |
|---|---|---|---|---|
| T1 | Generated evidence는 결코 hypothesis를 자동 승격할 수 없음 | no overclaim | 0002 | unit + property |
| T2 | `invalid`이 아닌 어떤 verdict 전에도 reproducibility gate 강제 | failures useful / repro | 0003 | integration |
| T3 | 부정 결과는 기본적으로 보존, 분류, 표면화됨 | failures useful | 0003 | integration |
| T4 | `wbtraffic` bundle이 CAW-01 L0로 lowering됨 (fixture 대비 round-trip) | export로서의 브리지 | 0004, 0008 | contract |
| T5 | Export는 status + uncertainty를 인라인으로 운반; 맨 hypothesis는 게이팅됨 | 경계에서 no overclaim | 0002, 0008 | contract |
| T6 | Scout는 멱등적 + 재개 가능 | 안전한 재실행 | 0001, 0005 | integration |
| T7 | No-shared-store: 어떤 export도 다른 제품의 저장소에 쓰지 않음 | 독립성 | 0008 | contract |

## 2. T1 — Hypothesis는 generated evidence에 의해 결코 자동 승격되지 않음

엄격한 규칙(ADR-0002 §2 규칙 2): `generated` evidence는 `inconclusive`에 정보를 줄 수 있으나 status를
`supported`/`refuted`로 **결코** 옮길 수 없다; 오직 `experiment` 또는 `external` evidence만 가능하다. Confidence는
**`evidence_strength`에 의해 상한이 정해진다** — generated-only는 `very-low`에 고정된다.

```text
GIVEN a Hypothesis at status=hypothesis with only Evidence{evidence_kind: "generated"}
WHEN the lifecycle validator evaluates a proposed StatusEvent → supported
THEN the transition is REJECTED and status stays "hypothesis", confidence ≤ very-low

GIVEN the same hypothesis + one Evidence{evidence_kind: "experiment", direction: "supporting"} above the bar
WHEN promotion to "supported" is proposed
THEN it is ALLOWED (and still flagged provisional)
```

| Case | only-generated | +experiment supporting | +experiment disconfirming | two experiments disagree |
|---|---|---|---|---|
| Expected status | `hypothesis` (pinned) | `supported` | `refuted` | `inconclusive` |
| Expected confidence | `very-low` | ≤ `low` (single run) | ≤ `medium` | `very-low` |

**Property test:** 무작위로 생성된 임의의 evidence 집합에 대해, 만약 그것이 비-`generated` 항목을 0개 포함한다면,
해결된 status는 반드시 `{hypothesis, inconclusive}` 안에 있어야 하고 confidence는 반드시 `very-low`여야 한다.
(ADR-0002 revisit trigger를 닫는다: "어떤 파이프라인 경로가 `generated` evidence로 승격한다면" → 이 테스트가
큰소리로 실패한다.)

## 3. T2 — Reproducibility gate 강제

ADR-0003: 모든 MUST repro 항목이 통과하기 전까지 run은 `invalid` 이외의 verdict에 도달할 수 없다(R1 config 동결,
R2 ≥3 seeds, R3 code rev 고정, R4 env 잠금, R5 data 명시, R6 decision rule 사전 등록, R7 hardware/budget, R11
baseline 기록, R12 failures 기록).

```text
GIVEN a ledger entry missing env.lock (R4) OR with <3 seeds (R2) OR no pre-registered decision_rule (R6)
WHEN the pre-run gate runs
THEN verdict is forced to "invalid" and the entry records which MUST item failed

GIVEN results are filled in, THEN a later edit of decision_rule
THEN it is REJECTED in place; the only legal path is a NEW entry with supersedes=<id>  (R6 anti-cherry-pick)
```

| MUST item missing | Gate outcome |
|---|---|
| R1 config / R3 code-rev / R4 env-lock | verdict pinned `invalid`, reason logged |
| R2 <3 seeds | `invalid` (closes lq-001 default of 3) |
| R6 rule edited after results | rejected; forces `supersedes` entry |
| R11 no baseline | `invalid` |
| all MUST present | verdict may be `supported`/`refuted`/`inconclusive` |

## 4. T3 — 부정 결과는 보존, 분류, 표면화됨

ADR-0003: 시작된 모든 run은 하나의 항목이다; `aborted`/`invalid`/`inconclusive`/`refuted`는 성공과 **동일한
스키마**를 사용한다; append-only + `supersedes`는 re-run이 그것이 대체하는 실패를 결코 덮어쓰지 않음을 의미한다.

```text
GIVEN a run that OOMs mid-way
THEN a ledger entry exists with status=aborted, failure_mode="oom", artifacts kept by path
AND it appears in the default negative-results view (NOT hidden)

GIVEN a hypothesis whose only runs are refuted/inconclusive
THEN its hypothesis card shows the full run history and the hypothesis stays visibly unsupported
```

- **Retention test:** 이전 항목을 삭제/덮어쓰는 것은 저장소 API를 통해 불가능하다(append-only); 정정은
  `supersedes`를 가진 새 항목이다.
- **Classification test:** 모든 비-성공은 제어된 어휘
  (`oom|budget-exceeded|nonconvergence|no-effect|flaky|setup-error`)에서 온 `failure_mode`를 운반한다; 비-성공에
  null `failure_mode`는 검증에 실패한다.
- **Surfacing test:** negative-results 뷰는 모든 `refuted`/`inconclusive`/non-null-`failure_mode` 항목을
  `hypothesis_id`별로 그룹화하여 나열한다; `no-effect` 결과 자체가 export 가능한 발견이다(T5).

## 5. T4 — `wbtraffic` bundle이 CAW-01 L0로 lowering됨 (fixture 대비 round-trip)

브리지는 **공유 저장소가 아니라 export**다(ADR-0004/0008). **고정된 CAW-01 L0 fixture** — 경계에서 재검증된 로컬
복사본 — 에 대해 테스트한다; CAW-01은 자신의 실제 IR을 소유한다(TRK-4).

```jsonc
// fixture: caw01-l0-fixture.json (pinned; re-verified, not a shared store)
{ "object_types": ["op", "tensor", "movement"],
  "op_classes": ["mem_store", "..."],
  "movement_fields": ["bytes", "from_tier", "to_tier"],
  "accepts_null_with_basis": "TODO(open-question: wbq-012)" }
```

```text
GIVEN a wbtraffic.v0 artifact (modeled estimate, assumptions listed)
WHEN Caw01WritebackAdapter lowers it to L0 objects
THEN each field maps per the ADR-0004 table:
     update event       → op{op_class:"mem_store"}
     bytes_per_update    → movement{bytes, from_tier:"device", to_tier:residency}
     fast_weights size   → tensor{size_bytes} (mutable, re-written)
     optimizer state     → extra tensor (enlarges capacity peak)
AND lowering uses NO new L0 object type (asymmetry is a read/write rollup split — wbq-002, an open question to CAW-01)
AND re-importing the lowered objects reconstructs the same field values (round-trip identity)
```

| Assertion | Pass condition |
|---|---|
| No new L0 object type introduced | only `op`/`tensor`/`movement` used |
| Round-trip identity | `lower(x)` then `parse` yields the same non-null fields |
| Modeled ≠ measured | every modeled field carries `basis: TODO(open-question)` and `uncertainty != supported` |
| Name drift caught | unknown CAW-01 object/op name → validation FAILS (no silent guess) |

## 6. T5 — Export는 status + uncertainty를 운반; 맨 hypothesis는 게이팅됨

어떤 것도 status/uncertainty가 벗겨진 채 경계를 넘지 않는다(ADR-0002 §2 규칙 4; ADR-0008 per-target gates).

```text
GIVEN a CAW-02 bundle whose payload omits status OR confidence
THEN validate() REJECTS it before any write

GIVEN an implication with status="hypothesis" (no resolving evidence_ref)
THEN the CAW-02 gate REJECTS it (bare hypothesis ≠ knowledge)
BUT the CAW-01 gate ACCEPTS it as a typed open question (CAW-01 tolerates open questions)

GIVEN a refuted/inconclusive item with a resolving evidence_ref
THEN the CAW-02 gate ACCEPTS it (negative results are knowledge)
```

| Item | CAW-01 gate | CAW-02 gate |
|---|---|---|
| `hypothesis`, no evidence | accept (open question) | **reject** |
| `supported` + evidence | accept (if writeback/hardware domain) | accept (flagged `provisional`) |
| `refuted`/`inconclusive` + evidence | accept ("axis not observed" — eq-001 TODO) | accept |
| status/confidence missing | **reject** | **reject** |

또한 `not_evidence`가 생성된 요약을 명시적으로 나열하고, export된 모든 `supported`가 `provisional`로 태그됨을
단언한다(ADR-0002 §7).

## 7. T6 — Scout는 멱등적이고 재개 가능

ADR-0005: 인제스트 파이프라인(S1 Discover → S5 Persist)은 `SourceAdapter` 뒤에서 멱등적이고 재개 가능하다;
같은 `FetchCursor` ⇒ 하류 중복 없음; 어댑터는 항상 **전진된(advanced)** cursor를 반환한다.

```text
GIVEN a SourceAdapter.fetch(query, cursor) returning items + cursor'
WHEN fetch is replayed with the SAME cursor
THEN no new Source/Claim records are created (idempotent)

GIVEN the pipeline is interrupted after S3 (canonicalize+dedup)
WHEN re-run from the persisted cursor/checkpoint
THEN it resumes at S4 without re-fetching or duplicating (resumable)

GIVEN a CAW-05 bundle re-imported with the same bundle_id watermark
THEN it merges as an added provenance entry, NOT a duplicate Source (TRK-5)
```

| Scenario | Expected |
|---|---|
| replay same cursor | 0 new records |
| arXiv v1 then v2 | distinct-but-linked sources (versions kept) |
| same paper via direct + CAW-05 | one `Source`, two provenance entries |
| crash mid-pipeline | resume from checkpoint, no dup |

## 8. T7 — No shared store (독립성 계약)

경계 계약 테스트(DOC-CONVENTIONS §8; PRODUCT-BRIEF §8): `ExportAdapter`는 오직 CAW-06 자신의 저장소에만 쓰고
자기 기술적(self-describing) bundle을 방출할 수 있다(파일 드롭 / POST). 그것은 CAW-01/CAW-02/CAW-05 내부의 어떤
경로도 열거나, 읽거나, 쓰면 안 된다.

```text
GIVEN any ExportAdapter.emit(bundle)
THEN the only writes are: (a) the outbound bundle at the configured drop/endpoint, (b) an ExportReceipt in CAW-06's store
AND the bundle is self-describing (schema_version, producer, content_hash) — no shared registry lookup
AND a failed/rejected export is logged and the finding stays exportable (failures first-class)
```

## 9. Fixtures

| Fixture | Used by | Note |
|---|---|---|
| `caw01-l0-fixture.json` | T4 | CAW-01 L0 형태의 고정 복사본; TRK-4에 따라 재검증됨, 공유 아님 |
| `caw05-action-brief.sample.json` | T5, T6 | `caw05.action-brief/v1`; 추가 필드에 관대함 |
| `hypothesis.generated-only.json` | T1 | generated evidence만 → 반드시 `hypothesis`로 유지 |
| `ledger.oom-abort.json` | T3 | `failure_mode: oom`을 가진 aborted run |
| `wbtraffic.modeled.json` | T4 | 모든 수치가 `null`/모델링됨, `basis: TODO` |

## 런북에 대한 함의

- 각 불변(T1–T7)은 런북 **acceptance criterion**이며, CI에서 실행된다; 각 단계 체크포인트에서 트리가 green으로
  유지된다(DOC-CONVENTIONS §6).
- T1 + T5는 anti-overclaim 척추다 — 어떤 export 어댑터가 활성화되기 전에 반드시 존재해야 한다.
- T4의 fixture는 CAW-01의 IR이 변경되었을 수 있을 때마다 **경계에서 CAW-01에 대해 재검증된다**(TRK-4); 이름
  불일치는 오래된 이름으로 조용히 lowering하기보다 테스트를 실패시킨다.
- 테스트에서 `TODO(open-question: …)`로 참조된 미해결 질문(예: wbq-012 null+basis 수용, eq-001 refuted→CAW-01)은
  해결될 때까지 [open-questions_ko.md](./open-questions_ko.md)에 추적된 채로 남는다.
