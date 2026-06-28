# ADR-0007: CAW-02 / CAW-03 / CAW-01 / CAW-06로의 Export 경계

- Status: proposed
- Owner: Jimmy
- Last-reviewed: TODO(open-question: set on review)
- Related:
  - Source of truth: [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF_ko.md) (§1, §5, §8, §9, §11, §12)
  - Conventions: [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS_ko.md) (§4 cross-linking = import/export 경계)
  - Research: [../02-research/related-work-ledger.md](../02-research/related-work-ledger_ko.md) (export bundle 형태), [../02-research/scheduling-and-ports.md](../02-research/scheduling-and-ports_ko.md) (ExportAdapter 포트), [../02-research/synthesis-and-formats.md](../02-research/synthesis-and-formats_ko.md) (paper-card / action-brief, `evidence:false`)
  - ADR-0004 classification & triage — [./ADR-0004-classification-and-triage.md](./ADR-0004-classification-and-triage_ko.md) (relation → target; review gate)
  - ADR-0005 related-work ledger — [./ADR-0005-related-work-ledger.md](./ADR-0005-related-work-ledger_ko.md) (단일 생산자; WatchedTarget → foreign_ref)
  - ADR-0006 storage & scheduling — [./ADR-0006-storage-and-scheduling.md](./ADR-0006-storage-and-scheduling_ko.md) (export idempotency 키; file-drop 전송)
  - CAW-02 (별도 제품) — 우리 `caw05-signal`을 Source/Claim/RelatedWork로 import (Boundary B)
  - CAW-03 (별도 제품) — `import_radar(bundle_uri)`가 우리 novelty signal을 pull
  - CAW-01 / CAW-06 (별도 제품) — open-question bundle을 import

## Context

triage된 finding은 그것에 따라 행동하는 제품으로 건너갈 때 비로소 가치가 된다: **novelty signal → CAW-03**,
**Source/Claim/RelatedWork → CAW-02**, **open question → CAW-01과 CAW-06**(brief §8). 넷 모두 **공유 저장소가 없는
독립 제품**이다: CAW-05는 명시적 경계를 넘어 파일 artifact를 emit하고, consumer가 **pull**한다. 강한 제약:
형제의 데이터베이스에 절대 쓰지 않는다; generated summary가 evidence로 건너가게 두지 않는다; review되지 않은
proposal을 novelty gate로 라우팅하지 않는다; 비공개 항목을 누출하지 않는다; 주간 re-run은 consumer가 dedup하게 한다.

영향 요인(Forces):
- **One producer, many consumers** — ledger(ADR-0005)만이 emit한다. export는 확인된 link의 투영이지 제2의
  source of truth가 아니다.
- **Decoupling** — consumer는 CAW-05의 내부 id에 의존하면 안 되고, CAW-05는 consumer의 스키마를 import하면 안
  된다. 이음매는 함수 호출이 아니라 포트 + 버전이 매겨진 bundle이다.
- **Fail-closed 안전** — 비공개, 빈, 또는 summary-as-evidence bundle은 abort해야 하며, defense-in-depth가 따른다
  (consumer는 import 시 re-redact / 재집행).
- **Idempotent 경계** — retry(ADR-0006)는 double-route하면 안 된다.
- **Ship seams, build v1** — v1 = CAW-01/02/03/06 adapter; 다른 target은 문서화된 stub(brief §9).

## Options considered

### A. Consumer 전반의 Bundle 스키마

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **모든 consumer에 대해 하나의 `caw05-signal` envelope 재사용(CAW-02가 이미 모델링한 계약); bundle 내부에서 relation → 각 consumer 어휘로 매핑** | 모든 consumer가 모델링하는 단일 스키마; 새 결합 없음; 단일 redaction/sign 경로 | envelope가 consumer 요구의 합집합을 담아야 함 | **chosen** |
| Consumer별 맞춤 스키마 | 맞춤형 | 유지/버전 관리할 N개 스키마; N배 drift | rejected |

### B. Id 투영

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **CAW-05가 `related_to`에서 WatchedTarget → `foreign_ref`로 투영(consumer는 자기 namespace를 봄)** | consumer가 우리 id로부터 decoupled 유지 | CAW-05가 매핑을 유지 | **chosen** |
| 우리 내부 id를 출하; consumer가 re-map | 우리 일이 줄어듦 | 모든 consumer를 CAW-05 id에 결합 | rejected (독립성 위반) |

### C. 전송

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **File drop; consumer가 pull (`*.caw05.jsonl`, content-addressed)** | 공유 substrate 없음; replay/diff 가능; idempotent | consumer가 poll/pull해야 함 | **chosen** (brief §1, §8) |
| Consumer store로 Push/live API | 즉각적 | 형제 store에 씀 — 독립성 위반 | rejected |

### D. CAW-03로의 기본 gate

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **CAW-03 novelty gate에는 confirmed-only**(proposal은 proposal로 유지) | gate가 review되지 않은 auto-link 위에서 절대 돌지 않음 | export 전 human-in-the-loop 필요 | **chosen** (brief §11) |
| 모든 것을 auto-export | zero latency | novelty gate로 false-threat noise 유입 | rejected |

## Decision

**1. `ExportAdapter` 포트가 유일한 export 이음매이다**(brief §9). 파이프라인은 포트에 의존하며 결코 구체
consumer에 의존하지 않는다:
```python
class ExportAdapter(Protocol):
    capabilities: AdapterCapabilities   # target, accepts=[SOURCE_CLAIM|NOVELTY_SIGNAL|OPEN_QUESTION], bundle_format
    def can_accept(self, signal: RoutedSignal) -> Acceptance: ...   # type/boundary/format preflight
    def export(self, signal: RoutedSignal, ctx: ExportContext) -> ExportReceipt: ...  # write a boundary bundle (idempotent)
```
v1 adapter: `Caw02SourceClaimExportAdapter`, `Caw03NoveltySignalExportAdapter`,
`Caw01OpenQuestionExportAdapter`, `Caw06OpenQuestionExportAdapter`. Stub: 다른 downstream target.

**2. 모든 consumer를 위한 하나의 envelope** — `boundary_kind=caw05-signal`을 재사용(CAW-02가 이미 소비하는
계약이며, CAW-03의 `import_radar(bundle_uri)`가 pull하는 동일 bundle URI). 외부 envelope는 `contract_version`
(semver; consumer는 미지의 major를 거부), `source_product`, `produced_at`, `producer_run_id`,
`declared_boundary`, `declared_audience`, `payload_sha256`, `redaction_applied[]`, 그리고 `payload.signals[]`
— export된 LedgerLink당 하나(전체 형태는 research §4)를 담는다. signal별 payload는
`source{title,authors,venue,year,doi,url,external_ids}`, `classification`, `relevance{score,rationale}`,
`related_to[]`, `extracted_claims[{text, evidence_locator}]`, `verification{status,match_ratio,canonical_key}`,
그리고 `kind=generated-summary`로 태그된 `raw_summary`를 담는다.

**3. Relation → consumer classification은 결정론적 투영이다:**

| Ledger `relation` | CAW-03 (novelty) | CAW-02 (knowledge) | CAW-01 / CAW-06 | Routed? |
|---|---|---|---|---|
| `novelty-threat` | `threat` → NoveltyVerdict 입력 | `threat` RelatedWork link | open-question (action brief) | **모든 routed target** |
| `support` | `support` (corroboration) | `support` RelatedWork link | — | CAW-03 + CAW-02 |
| `adjacent` | `neutral` | `neutral` RelatedWork (context) | — | 주로 CAW-02 |
| *(unverified link)* | `unknown` (절대 gate로 안 감) | `unknown` (curator review) | — | flagged, gated 안 됨 |
| `noise` | — | — | — | **절대 export 안 됨** |

`related_to`는 **WatchedTarget의 `foreign_ref`**(`caw03-claim:…` / `caw02-concept:…`)를 담아, 각 consumer가
*자기* namespace의 id를 본다. **CAW-05가 투영을 하고, consumer는 우리 id를 절대 re-map하지 않는다**(ADR-0005).

**4. Export 규칙 (fail-closed):**
- **기본은 confirmed-only**(finding은 proposal이고, Jimmy가 확인 — brief §11). `propose-only` 프로파일은
  `auto`로 플래그된 `proposed` link를 저위험 digest로 emit할 수 있다 **— 결코 CAW-03의 gate로는 아니다.**
- **`raw_summary`는 `kind=generated-summary`이며, 모든 evidence 필드에서 제외된다**. backing은 항상 `source` +
  `evidence_locator`이다(ADR-0005 / synthesis 불변식). consumer는 import 시 재집행한다.
- **`boundary=public`만**. redaction sweep이 emit 전에 돈다. 비공개 항목은 **bundle을 abort**시킨다
  (defense-in-depth; consumer도 re-redact한다).
- **Content-addressed + idempotent** — `payload_sha256`는 consumer가 주간 run의 re-import를 dedup하게 한다.
  `canonical_key`는 CAW-02가 우리 Source를 기존 것과 dedup하게 한다. per-bundle `idempotency_key`(ADR-0006)는
  retry를 no-op으로 만들어 novelty-threat가 결코 double-route되지 않게 한다.
- **빈 bundle은 거부된다**(export할 게 없음 → error + report, 결코 조용한 빈 파일이 아님).

**5. 전송 = file drop, consumer가 pull.** `*.caw05.jsonl`(라인당 signal 하나)을 경계 위치에 쓴다. **동일한**
bundle URI를 모든 consumer가 pull한다. CAW-05는 형제 store에 절대 쓰지 않는다.

**6. Synthesis surface는 bundle로 매핑된다**(synthesis-and-formats 출처): **paper-card**는 CAW-02
(Source/RelatedWork) + CAW-03(novelty)에 공급한다. **action brief**는 CAW-01/CAW-06 open question에 공급한다.
둘 다 `evidence:false`인 synthesis manifest를 담는다. 받는 제품은 재분류하며 산문을 evidence로 절대 저장하지 않는다.
export는 **vetted skill action**으로 출하되어, agent와 사람이 동일한 redaction/confidentiality 점검에 부딪힌다
(raw bypass 없음).

## Consequences

**Easy:** CAW-02와 CAW-03가 이미 모델링한 단일 스키마 — CAW-01/CAW-06 추가는 adapter 둘 더일 뿐 새 계약이 없음.
consumer는 `payload_sha256`/`canonical_key`로 주간 re-import를 dedup함. retry는 no-op. novelty gate는 오직
confirmed, public, verified-or-flagged link만 봄. 새 downstream consumer는 adapter 파일 하나 + config 플래그
하나(이음매 테스트).

**Hard / follow-on:** 단일 envelope는 consumer 요구의 합집합을 담아야 하고 어떤 consumer도 깨지 않으면서 semver로
진화해야 함. `WatchedTarget → foreign_ref` 매핑은 CAW-02/CAW-03 rename에 대해 fresh하게 유지되어야 함(ADR-0005와
공유 open question). bundle signature 방식은 하나의 verifier가 어디서나 동작하도록 계열 전반에서 합의되어야 함.
`ambiguous`/`unverified` link를 export하기는 하는지 여부(경향: curator review를 위해 CAW-02로는, 결코 CAW-03의
gate로는 아님).

**Negative tests (반드시 성립):** (N1) evidence 필드의 generated summary → 거부; (N2) public bundle 안의 비공개
link → bundle abort; (N3) review되지 않은(`proposed`) link가 CAW-03 gate로 → 거부; (N4) 같은 bundle의 retry →
no-op (double-route 없음); (N5) 어떤 bundle 안의 `noise`로 분류된 finding → 발생하면 안 됨; (N6) 빈 bundle →
error, 결코 조용한 빈 파일이 아님.

**Implications for runbooks:** **RB (export adapter — CAW-02 + CAW-03)**는 확인된 link를 `caw05-signal` envelope로
투영함; `relation → classification`을 매핑; foreign ref를 `related_to`에 넣음; `raw_summary`를 evidence에서 제외;
비공개/빈에 대해 fail closed; `payload_sha256` + `canonical_key`로 content-address; idempotency 키는 ADR-0006에서.
**RB (export adapter — CAW-01/CAW-06)**는 action brief로부터 open-question bundle을 만듦. **RB (ports)**는 v1
adapter + 문서화된 CAW-stub 패턴을 가진 `ExportAdapter` registry; 코어는 포트에만 의존. **RB (negative tests)**는
위 N1–N6.

## Open questions / revisit triggers

- TODO(open-question: `related_to`를 CAW-03 claim id에 직접 키잉할지, 아니면 CAW-03가 re-map하는 CAW-02
  concept/claim id에만 키잉할지? CAW-03 + ADR-0005와 공동 해결.)
- TODO(open-question: `ambiguous`/`unverified` link를 export하기는 하는가? 경향: curator review를 위해 CAW-02로,
  결코 CAW-03의 gate로는 아님.)
- TODO(open-question: `task` / `experiment` route(ADR-0004)는 v1에서 어디로든 export되는가, 아니면 CAW-01/CAW-06
  계약이 굳을 때까지 digest에 머무는가?)
- TODO(open-question: export envelope를 위한 signature 방식 — 하나의 verifier가 제품 전반에서 동작하도록 CAW-02의
  선택(minisign/cosign/DSSE)에 계열 전반으로 정렬.)
- TODO(open-question: consumer가 claim/concept을 rename/merge할 때 `foreign_ref`를 위한 staleness handshake.)
- **Revisit trigger:** 어떤 consumer가 `caw05-signal` envelope가 결여한 필드를 필요로 하면 → `contract_version`을
  올림(추가적이면 minor)하고, consumer별 맞춤 스키마를 출하하기 전에 이 ADR을 다시 연다.
- `../08-research-plan/open-questions.md` 참조 (생성 예정).
