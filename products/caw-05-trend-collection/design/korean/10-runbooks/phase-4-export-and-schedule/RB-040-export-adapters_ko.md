# RB-040: ExportAdapter seam과 v1 CAW-02/03/01/06 bundle adapter 구축

- Status: ready
- Phase: phase-4-export-and-schedule
- Depends on: [RB-031 (append-only ledger + LedgerLink), RB-032 (synthesis/digest + paper-card/action-brief), RB-003 (ports registry + ExportAdapter port stub), RB-021 (two-axis classification + review gate)]
- Implements design: [../../05-radar-core/export-boundaries_ko.md](../../05-radar-core/export-boundaries_ko.md), [../../01-decisions/ADR-0007-export-boundaries_ko.md](../../01-decisions/ADR-0007-export-boundaries_ko.md), [../../05-radar-core/synthesis-and-formats_ko.md](../../05-radar-core/synthesis-and-formats_ko.md)
- Produces: `ExportAdapter` 구체 v1 adapter(`Caw02SourceClaimExportAdapter`, `Caw03NoveltySignalExportAdapter`, `Caw01OpenQuestionExportAdapter`, `Caw06OpenQuestionExportAdapter`); `caw05-signal` envelope builder + signer; 문서화된 stub adapter; negative-test 스위트 N1–N6.

## Objective
radar는 **confirmed `LedgerLink`**를 단일하고 서명되고 content-addressed된 `caw05-signal`
boundary bundle(`*.caw05.jsonl`)로 projection하여, 명명된 consumer(CAW-02/03/01/06)가 가져가는 곳에 drop할 수 있다 — `ExportAdapter` 포트를 **유일한** export seam으로 한다. "Done"의 의미: 라우팅된 novelty-threat finding이 CAW-03(및 relation-projection된 target들)을 위한 public-only이고 idempotent한 bundle을 생산하며 그 안에서 `raw_summary`가 어떤 evidence 필드에도 절대 등장하지 않고; 모든 fail-closed 규칙(N1–N6)이 실행 가능한 테스트에 의해 강제되며; 새 downstream consumer는 core 편집 없이 adapter 파일 1개 + config 플래그 1개다.

## Preconditions
- [ ] RB-003이 `ExportAdapter` `Protocol` + config 기반 adapter registry를 노출했다; core는 포트에만 의존한다.
- [ ] RB-031이 `relation`, `WatchedTarget.foreign_ref`, S2 `verification` 레코드(또는 `pending-ledger-verification` 플래그)를 지닌, provenance가 완비된 `LedgerLink`로 append-only `ledger/*.jsonl`을 생산한다.
- [ ] RB-021이 classification review gate를 통과한 `RoutedSignal`을 생산한다(abstain→human은 이미 해결됨; `noise`는 이미 제외됨).
- [ ] RB-032가 paper-card(→CAW-02/03)와 action-brief(→CAW-01/06)에 대해 `evidence:false`로 synthesis manifest를 생산한다.
- [ ] `boundary`(public/internal)가 ingestion provenance에 의해 모든 finding/link에 stamp된다.
- [ ] Tree가 green이다(컴파일, lint 통과).

## Steps

### 1. `caw05-signal` envelope + per-signal payload 타입 정의
- **Do:** export-boundaries.md §3 / ADR-0007 §2와 정확히 일치하는 타입화된 `Caw05SignalBundle` envelope와 `Signal` payload를 추가한다: envelope = `contract_version`(semver "1.0.0"), `source_product=caw-05`, `produced_at`(RFC3339), `producer_run_id`(ULID), `declared_boundary=public`, `declared_audience`, `payload_sha256`, `redaction_applied[]`, `signature`, `payload.signals[]`. per-signal = `source{title,authors,venue,year,doi,url,external_ids}`, `classification`, `relevance{score,rationale}`, `related_to[]`, `extracted_claims[{text,evidence_locator}]`, `verification{status,match_ratio,canonical_key}`, `raw_summary{kind:"generated-summary",text}`, `idempotency_key`. per-consumer 필드는 추가하지 마라 — 모두에 대해 하나의 envelope.
- **Verify:** 한 단위 테스트가 샘플 bundle을 serialize→parse로 round-trip하며 필드 손실이 없음을 확인한다; `raw_summary.kind != "generated-summary"`이면 스키마 단언이 실패한다.

### 2. relation→classification projection 구현(결정론적)
- **Do:** export-boundaries.md §2 / ADR-0007 §3의 표로부터 순수 함수 `project(relation) -> {target: classification}`를 구현한다: `novelty-threat`→{caw03:`threat`, caw02:`threat`, caw01/06:open-question}; `support`→{caw03:`support`, caw02:`support`}; `adjacent`→{caw02:`neutral`}; unverified link→`unknown`(**절대 CAW-03의 gate로는 안 됨**); `noise`→**아무것도 아님, 절대 export되지 않음**. `WatchedTarget.foreign_ref`(`caw03-claim:…`/`caw02-concept:…`)를 `related_to[]`에 넣어 각 consumer가 자신의 namespace를 보게 한다 — projection은 CAW-05이 한다; consumer는 우리 id를 절대 re-map하지 않는다.
- **Verify:** table 기반 테스트가 각 relation이 표의 라우팅된 target과 classification에 정확히 매핑됨을 단언한다; `noise`와 unverified→CAW-03-gate는 둘 다 empty/refused를 낸다.

### 3. evidence-separation + redaction sweep 구현(fail-closed)
- **Do:** 어떤 signal을 만들기 전에, (a) `raw_summary`가 모든 evidence 필드에서 제외됨을 단언하고 — 유일한 backing은 `source` + `evidence_locator`; (b) `declared_boundary=public`을 단언하고 어떤 link라도 비공개이면 **전체 bundle**을 중단하며; (c) 적용된 규칙을 `redaction_applied[]`에 기록하는 sweep을 실행한다. 생성된 rationale/summary는 기록되지만 절대 evidence로 emit되지 않는다(brief §5, §12).
- **Verify:** N1 test — evidence 필드에 놓인 생성된 요약이 거부된다. N2 test — public bundle의 비공개 link가 bundle을 중단시킨다(부분 파일 미작성).

### 4. content-addressing + idempotency 구현
- **Do:** canonical-serialize된 `payload`에 대해 `payload_sha256`을 계산한다; per-signal `idempotency_key = hash(finding_id + target + classification_version)`(ADR-0006 §4.4)를 설정한다; consumer-side Source dedup을 위해 S2 verification의 `canonical_key`를 운반한다. `export()`를 idempotent하게 만든다: 동일 `payload_sha256`/idempotency_key의 재방출은 no-op이다.
- **Verify:** N4 test — 같은 `RoutedSignal`에 `export()`를 두 번 호출하면 bundle 하나가 쓰이고 두 번째는 no-op이다(double-route 없음). 한 필드를 바꾸면 `payload_sha256`이 바뀐다.

### 5. signer 구현
- **Do:** envelope를 서명하고 `signature`를 채운다. `Signer` 인터페이스 뒤의 pluggable 방식을 사용하며; 기본은 단일 family-aligned 방식으로 한다. 구체 방식은 `TODO(open-question: family-wide scheme — minisign/cosign/DSSE; align with CAW-02's verifier)`로 표시한다.
- **Verify:** 생산된 bundle의 signature가 매칭 verifier로 검증된다; 변조된 payload는 검증에 실패한다.

### 6. 포트 위에서 네 개의 v1 ExportAdapter 구현
- **Do:** `Caw03NoveltySignalExportAdapter`(`NOVELTY_SIGNAL` 수락), `Caw02SourceClaimExportAdapter`(`SOURCE_CLAIM` 수락), `Caw01OpenQuestionExportAdapter` + `Caw06OpenQuestionExportAdapter`(`OPEN_QUESTION` 수락)를 구현한다. 각각 `capabilities`(target, accepts[], bundle_format)를 설정한다; `can_accept()`는 no-I/O type/boundary/format preflight를 수행한다; `export()`는 단계 1–5를 통해 빌드하고 `*.caw05.jsonl`(줄당 하나의 signal)을 consumer의 boundary drop 위치에 쓴다. paper-card → CAW-02+CAW-03; action-brief → CAW-01/CAW-06(synthesis-and-formats §; 둘 다 `evidence:false`를 지님). adapter는 gate를 통과한 `RoutedSignal`만 소비한다 — raw finding에서 bundle로 가는 경로는 없다.
- **Verify:** 각 adapter에 대해 `can_accept()`가 미스매치 signal 타입을 거부한다; 매칭되는 confirmed signal의 `export()`가 구성된 boundary URI에 유효한 서명된 `*.caw05.jsonl`을 쓴다. N3 test — CAW-03의 gate로 가는 미리뷰(`proposed`) link가 거부된다.

### 7. confirmed-only + empty-bundle 규칙 강제
- **Do:** 기본 프로파일 = **confirmed-only**; Jimmy가 confirm한 link만 라우팅된다. `propose-only` 프로파일은 `proposed` link를 `auto`로 플래그하여 low-stakes digest target에 emit할 수 있다 — **절대 CAW-03의 gate로는 안 됨**. empty bundle은 거부한다: export할 것이 없음 → error + report, 절대 조용한 빈 파일 아님.
- **Verify:** N5 test — `noise`로 분류된 finding은 어떤 bundle에도 절대 등장하지 않는다. N6 test — empty export는 error를 raise하고 파일을 쓰지 않는다.

### 8. adapter 등록 + 문서화된 stub 패턴
- **Do:** config 기반 registry에 네 v1 adapter를 등록한다(`maturity="v1"`). 다른 downstream target을 위한 문서화된 stub adapter를 추가한다(`maturity="stub"`, 등록됨, `export()` 시 명확한 "stub" 메시지로 거부). seam 테스트를 확인한다: 새 consumer = adapter 파일 1개 + config 플래그 1개, core 편집 없음, 새 계약 없음.
- **Verify:** registry가 4개 v1 + stub들을 나열한다; stub `export()` 호출이 문서화된 거부를 반환한다; core는 포트만 import하고 구체 adapter는 절대 import하지 않는다(core 패키지에서 구체 adapter import를 grep → 없음).

## Acceptance criteria
- [ ] 모든 export가 `ExportAdapter` 포트를 통한다; core는 구체-consumer import가 zero다.
- [ ] confirmed novelty-threat가 CAW-03과 relation-projection된 target을 위한 서명되고 public-only이며 content-addressed된 `*.caw05.jsonl`을 생산한다.
- [ ] `relation → classification` projection이 export-boundaries.md §2와 정확히 일치한다; `related_to[]`가 `foreign_ref`(consumer namespace)를 운반한다.
- [ ] `raw_summary`는 `kind=generated-summary`이며 모든 evidence 필드에서 부재한다; backing은 항상 `source` + `evidence_locator`다.
- [ ] negative test N1–N6이 모두 통과한다.
- [ ] stub adapter가 등록 + 문서화된다; seam 테스트가 성립한다(새 consumer = 파일 1개 + 플래그 1개).
- [ ] Tree가 green이다.

## Rollback / safety
- 포트 + adapter는 additive다; 롤백하려면 v1 adapter를 deregister한다(config 플래그) — core Run은 여전히 `synthesize`까지 완료하고 `export`를 깔끔히 건너뛴다.
- 모든 쓰기는 boundary 위치로의 content-addressed 파일 drop이다; sibling store는 절대 쓰이지 않으므로, 잘못된 bundle은 부작용 없이 삭제된다. 실패/중단된 bundle은 부분 파일을 남기지 않는다(단계 3, 7).
- 빌드를 통과시키려고 N1–N6을 약화하지 마라; 실패하는 negative test는 우회가 아니라 멈추고 고치라는 뜻이다.

## Hand-off
- RB-041(scheduler/Run)은 idempotency가 보장된 상태로 `export`를 최종 파이프라인 스테이지로 호출할 수 있다(retry가 절대 double-route하지 않음).
- RB-042(CLI/MCP)는 `export`를 gate된 terminal op로 노출할 수 있다: CLI는 실행(operator가 gate), MCP는 proposal-only.
- M2(RB-05x)는 CAW-03 export를 provenance가 완비된 S2-verified `LedgerLink`를 요구하도록 강화한다; 이 runbook이 이미 `verification` 필드와 unverified→`unknown` 경로를 연결한다.
