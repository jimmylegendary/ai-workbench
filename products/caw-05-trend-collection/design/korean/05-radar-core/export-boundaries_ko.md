# Radar Core — Export Boundaries(내보내기 경계)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - **Source of truth:** [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF_ko.md) (§1 독립성, §8 exports, §11 proposals, §12 generated≠evidence)
  - Conventions: [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS_ko.md) (§4 제품 간 = import/export 경계)
  - ADR-0007 export boundaries — [../01-decisions/ADR-0007-export-boundaries.md](../01-decisions/ADR-0007-export-boundaries_ko.md) (권위 있는 envelope + relation projection)
  - ADR-0005 related-work ledger — [../01-decisions/ADR-0005-related-work-ledger.md](../01-decisions/ADR-0005-related-work-ledger_ko.md) (단일 producer; `LedgerLink`, `foreign_ref`)
  - ADR-0006 storage & scheduling — [../01-decisions/ADR-0006-storage-and-scheduling.md](../01-decisions/ADR-0006-storage-and-scheduling_ko.md) (idempotency key, file-drop)
  - ADR-0004 classification & triage — [../01-decisions/ADR-0004-classification-and-triage.md](../01-decisions/ADR-0004-classification-and-triage_ko.md) (relation → target; review gate)
  - Siblings: [./synthesis-and-formats.md](./synthesis-and-formats_ko.md) (paper-card/action-brief → bundles), [./ports-and-adapters.md](./ports-and-adapters_ko.md)
  - Consumers (별도 제품): **CAW-02** (Source/Claim/RelatedWork), **CAW-03** (novelty), **CAW-01 / CAW-06** (open questions)

## 목적(Purpose)
이 문서는 **core 수준**의 export 계약을 확정한다. 즉 triage된 finding이 다른 제품으로 넘어가는 **유일한** 이음새인
`ExportAdapter`, v1 consumer 각각이 받는 bundle, 그리고 export를 안전하게 유지하는 fail-closed 규칙이다. 이것은 core
사양이다. 옵션 표와 전체 signal별 payload 스키마는 ADR-0007에 권위 있게 있으며 여기서는 **상호 링크하되 복제하지 않는다**.
이 문서는 synthesis manifest([./synthesis-and-formats.md](./synthesis-and-formats_ko.md) §4), ledger 스키마(ADR-0005),
또는 registry 메커니즘([./ports-and-adapters.md](./ports-and-adapters_ko.md))을 결정하지 않는다.

**독립성(brief §1, §8):** CAW-02/03/01/06은 **공유 저장소가 없는 별도 제품**이다. CAW-05는 **명시적 경계를 가로질러 파일
artifact를 쓰고**, consumer가 **pull**한다. CAW-05는 절대 형제 제품의 데이터베이스에 쓰지 않는다.

## 1. export 이음새
Export는 `Run`의 `export` 단계다(`collect → dedup → classify → synthesize → export`). 파이프라인은 구체적 consumer가
아니라 `ExportAdapter` port에만 의존한다.

```python
class ExportAdapter(Protocol):
    capabilities: AdapterCapabilities   # target, accepts=[SOURCE_CLAIM|NOVELTY_SIGNAL|OPEN_QUESTION], bundle_format
    def can_accept(self, signal: RoutedSignal) -> Acceptance: ...  # type/boundary/format preflight (no I/O)
    def export(self, signal: RoutedSignal, ctx: ExportContext) -> ExportReceipt: ...  # write a boundary bundle (idempotent)
# v1 adapters: Caw02SourceClaimExportAdapter, Caw03NoveltySignalExportAdapter,
#              Caw01OpenQuestionExportAdapter, Caw06OpenQuestionExportAdapter
# stub adapters: other downstream targets (registered, maturity="stub")
```

**하나의 producer, 다수의 consumer.** append-only ledger(ADR-0005)가 방출하는 *유일한* 것이다. export는 **confirmed된
`LedgerLink`들의 projection**이지 두 번째 진실 원천이 아니다. Adapter는 triage/routing을 우회할 수 없다: classify 단계가
이미 생성하고 review gate가 이미 통과시킨 `RoutedSignal`을 소비한다(ADR-0004 §5) — raw finding에서 곧장 bundle로 가는
경로는 없다.

## 2. 누구에게 무엇이 가는가 (relation → consumer projection)
Routing은 ledger `relation`을 각 consumer의 어휘에 매핑하는 **deterministic projection**이다(ADR-0007 §3).
`related_to`는 `WatchedTarget`의 `foreign_ref`(`caw03-claim:…` / `caw02-concept:…`)를 담아 각 consumer가 *자기 자신의*
네임스페이스로 id를 보게 한다 — **CAW-05가 projection을 수행하고, consumer는 절대 우리 id를 재매핑하지 않는다**(ADR-0005).

| Ledger `relation` | → CAW-03 (novelty) | → CAW-02 (knowledge) | → CAW-01 / CAW-06 | Routed targets |
|---|---|---|---|---|
| `novelty-threat` | `threat` → NoveltyVerdict 입력 | `threat` RelatedWork 링크 | open-question (action brief) | **all** |
| `support` | `support` (입증) | `support` RelatedWork 링크 | — | CAW-03 + CAW-02 |
| `adjacent` | `neutral` | `neutral` RelatedWork (맥락) | — | 주로 CAW-02 |
| *(검증되지 않은 링크)* | `unknown` (**절대 gate로 가지 않음**) | `unknown` (curator review) | — | flag됨, gate 안 됨 |
| `noise` | — | — | — | **절대 export 안 됨** |

Synthesis surface는 bundle에 매핑된다([./synthesis-and-formats.md](./synthesis-and-formats_ko.md)): **paper-card**는
CAW-02 + CAW-03로 공급되고, **action-brief**는 CAW-01 / CAW-06로 공급된다. 둘 다 `evidence:false`로 synthesis manifest를
담는다.

## 3. bundle — 모든 consumer를 위한 단일 envelope
단일 `boundary_kind=caw05-signal` envelope를 재사용한다(CAW-02가 이미 모델링한 계약이며, CAW-03의
`import_radar(bundle_uri)`가 pull하는 동일한 bundle URI). 하나의 스키마, 하나의 redaction 경로, 하나의 signature 경로.
전체 signal별 payload는 ADR-0007 §2에 있다. envelope 형태:

```yaml
caw05_signal_bundle:                 # outer envelope (one file per Run-export)
  contract_version: "1.0.0"          # semver; consumers reject an unknown MAJOR
  source_product: caw-05
  produced_at: <RFC3339>
  producer_run_id: ULID
  declared_boundary: public          # public-only (brief §8)
  declared_audience: <consumer>
  payload_sha256: <hex>              # content address — consumers dedup weekly re-imports
  redaction_applied: [<rule>, ...]
  signature: <scheme>                # TODO(open-question: family-wide scheme — minisign/cosign/DSSE)
  payload:
    signals:                         # one per exported LedgerLink
      - source: {title, authors, venue, year, doi, url, external_ids}
        classification: threat|support|neutral|unknown
        relevance: {score, rationale}         # additive/explainable (ADR-0002)
        related_to: [<foreign_ref>, ...]      # consumer-namespace ids
        extracted_claims: [{text, evidence_locator}]   # backed by source, NOT prose
        verification: {status, match_ratio, canonical_key}   # ADR-0005 S2 verification
        raw_summary: {kind: generated-summary, text: ...}    # excluded from every evidence field
        idempotency_key: <hash(finding_id + target + classification_version)>
```

`raw_summary`는 항상 `kind=generated-summary`로 태그되며 모든 evidence 필드에서 제외된다. 근거는 항상 `source` +
`evidence_locator`이다. Consumer는 import 시 이를 재강제한다(defense-in-depth).

## 4. export 규칙 (fail-closed)
| # | 규칙 | 이유 |
|---|---|---|
| 1 | **기본은 confirmed-only** — finding은 proposal이고, Jimmy가 confirm한다(brief §11). `propose-only` profile은 `auto`로 플래그된 `proposed` 링크를 저위험 digest로 방출할 수 있다 **— 절대 CAW-03의 gate로는 안 됨.** | novelty gate는 미리뷰 auto-link에 절대 실행되지 않음 |
| 2 | **`raw_summary`는 모든 evidence 필드에서 제외**(`kind=generated-summary`) | generated ≠ evidence (brief §5, §12) |
| 3 | **`boundary=public`만**; 방출 전 redaction sweep; non-public 항목은 **bundle을 중단** | 기밀 누출 없음 (brief §8, §12) |
| 4 | **Content-addressed + idempotent** — `payload_sha256` + `canonical_key` + bundle별 `idempotency_key`(ADR-0006) | retry가 novelty-threat를 이중 route하지 않음 |
| 5 | **빈 bundle 거부** — export할 것이 없음 → error + report, 절대 조용한 빈 파일 아님 | 관측 가능성; recall 미션 |
| 6 | **Export는 검증된 skill action** — 에이전트와 사람이 동일한 redaction/기밀 검사를 거침; raw 우회 없음 | `novelty-threat`의 MCP `export`는 proposal-only (ADR-0001 §4) |

### Negative 테스트 (반드시 유지 — ADR-0007 N1–N6과 미러)
- **N1** evidence 필드의 생성된 summary → 거부됨.
- **N2** public bundle 안의 non-public 링크 → bundle 중단.
- **N3** CAW-03 gate로 가는 미리뷰(`proposed`) 링크 → 거부됨.
- **N4** 같은 bundle의 retry → no-op (이중 route 없음).
- **N5** 어떤 bundle 안의 `noise`로 분류된 finding → 발생해서는 안 됨.
- **N6** 빈 bundle → error, 절대 조용한 빈 파일 아님.

이것들은 synthesis citation gate([./synthesis-and-formats.md](./synthesis-and-formats_ko.md) §5)가 upstream에서 이미
강제한 것을 재검사한다 — gate가 1선이고, export adapter는 defense-in-depth다.

## 5. Transport — file drop, consumer가 pull
Bundle은 경계 위치에 `*.caw05.jsonl`(라인당 signal 하나)로 쓰인다. 모든 consumer가 pull하는 것은 **동일한** bundle URI다.
형제 저장소로의 push도, 공유 registry도 없다(brief §1, §8). Idempotency(규칙 4)는 주간 재실행의 re-pull을
`payload_sha256`으로 안전하게 dedup하게 만든다.

## 6. 이음새 테스트(seam test)
새 downstream consumer는 **adapter 파일 하나 + config 플래그 하나**다 — 새 계약도, core 수정도 없다. consumer가
`caw05-signal` envelope에 없는 필드를 필요로 하면 `contract_version`을 올리고(additive면 minor) ADR-0007을 재개한다 —
절대 consumer별 맞춤 스키마를 출시하지 않는다. CAW-01/02/03/06을 넘어서는 stub target은 문서화된 stub로 출시된다
([./ports-and-adapters.md](./ports-and-adapters_ko.md) §stubs).

## 7. Open Questions
[../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md)에서 추적:
- TODO(open-question: `related_to`를 CAW-03 claim id에 직접 key로 걸지, 아니면 CAW-03이 재매핑하는 CAW-02 concept/claim
  id에만 걸지? CAW-03 + ADR-0005와 공동으로 해결.)
- TODO(open-question: `ambiguous`/`unverified` 링크를 export하기는 하는가? 선호: curator review를 위해 CAW-02로,
  절대 CAW-03의 gate로는 안 함.)
- TODO(open-question: `task`/`experiment` route(ADR-0004)가 v1에서 어디든 export되는지, 아니면 CAW-01/CAW-06 계약이
  확정될 때까지 digest에 머무는지?)
- TODO(open-question: envelope의 signature scheme — 하나의 verifier가 제품 전반에 걸쳐 작동하도록 CAW-02의 선택과
  제품군 전반에 맞춤.)
- TODO(open-question: consumer가 claim/concept을 rename/merge할 때 `foreign_ref`의 staleness handshake.)

## 8. 런북에 대한 함의
- **RB (export adapter — CAW-02 + CAW-03):** confirmed된 `LedgerLink`를 `caw05-signal` envelope로 projection;
  `relation → classification` 매핑; `foreign_ref`를 `related_to`에 넣음; `raw_summary`를 evidence에서 제외;
  non-public/empty에 fail closed; `payload_sha256` + `canonical_key`로 content-address; idempotency key(ADR-0006).
- **RB (export adapter — CAW-01/CAW-06):** action brief에서 나온 open-question bundle.
- **RB (negative tests):** 위 N1–N6을 실행 가능한 테스트로.
- **RB (ports):** v1 adapter들 + 문서화된 CAW-stub 패턴을 가진 `ExportAdapter` registry; core는 port에만 의존
  ([./ports-and-adapters.md](./ports-and-adapters_ko.md)).
