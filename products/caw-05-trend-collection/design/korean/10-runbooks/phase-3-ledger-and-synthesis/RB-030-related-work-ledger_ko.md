# RB-030: append-only related-work ledger + Semantic Scholar 검증 구축

- Status: ready
- Phase: phase-3-ledger-and-synthesis
- Depends on: [RB-200-classification-and-triage, RB-201-routing, RB-000-pipeline-core-and-store]
- Implements design:
  - [../../05-radar-core/related-work-ledger_ko.md](../../05-radar-core/related-work-ledger_ko.md)
  - [../../01-decisions/ADR-0005-related-work-ledger_ko.md](../../01-decisions/ADR-0005-related-work-ledger_ko.md)
  - [../../01-decisions/ADR-0006-storage-and-scheduling_ko.md](../../01-decisions/ADR-0006-storage-and-scheduling_ko.md)
  - [../../09-roadmap/dependency-graph_ko.md](../../09-roadmap/dependency-graph_ko.md) (invariant 4: novelty export 이전에 ledger)
- Produces: `ledger/*.jsonl` (append-only `LedgerLink` 행), `VerifiedSource`/`WatchedTarget`/`Finding` 레코드, Semantic Scholar (S2) `VerificationAdapter`, 그리고 export(RB-040+)를 뒷받침하는 SQLite ledger-cache 인덱스.

## Objective
분류되어 리뷰 대상이 된 `Finding`은 **provenance(출처)가 완비된 `LedgerLink`**를 통해 CAW-05이 소유한 `WatchedTarget`에 연결될 수 있으며, 이 링크는 `ledger/*.jsonl`에 **append-only**로 기록된다. 각 링크의 서지(bibliographic) 근거는 Semantic Scholar 검증 파이프라인(normalize → key lookup → title match → Levenshtein ≥ 0.70 + year ±1 gate → multi-key dedup)에 의해 `VerifiedSource`로 해석되며, `verified | ambiguous | unverified`를 방출한다. "Done"의 정의 = 같은 논문에 대한 주간 재실행이 정확히 하나의 `VerifiedSource`를 만들고(dedup), ambiguous/임계 미만 매치는 사람 리뷰로 라우팅되어 조용히 누락되지 않으며(recall-first), `noise`는 절대 링크되지 않고, 수정은 `superseded_by`를 가진 새 행을 추가하며(행은 절대 변경되지 않음), 모든 링크는 소스로 들어가는 `evidence_locator`를 지니고 생성된 요약은 `kind=generated-summary`로 태깅되어 evidence에서 제외된다. design 문서의 negative test N1–N7이 모두 성립한다.

## Preconditions
- [ ] RB-200/RB-201이 `classification`, `signal_vs_hype`, `watchlist_hit`, `boundary=public`, `trust`, 그리고 routing을 지닌 triage된 `Finding`을 생산한다 — [../../05-radar-core/related-work-ledger_ko.md](../../05-radar-core/related-work-ledger_ko.md) §2 참조.
- [ ] P0의 FILES-AS-TRUTH 레이아웃이 존재한다: `interests.yaml`, `findings/*.json`, `ledger/` 디렉터리, SQLite 인덱스(ADR-0006).
- [ ] `WatchedTarget` 앵커는 interest model의 watch list(ADR-0002 → brief §6)로부터 불투명한 `foreign_ref`(예: `caw03://claim/...`, `caw02://concept/...`)와 함께 시드될 수 있다.
- [ ] **공개(public)** Semantic Scholar API로의 네트워크 egress가 허용된다; 유료/ToS 위반 엔드포인트는 구성되지 않는다(brief §12, design §1.4).
- [ ] Tree가 green이다(컴파일, lint 통과).

## Steps

### 1. 네 개의 ledger 엔티티 정의(CAW-05-local 식별자)
- **Do:** `Finding`(`caw05:fnd-<uuid>`), `VerifiedSource`(`caw05:src-<sha>`, canonical key로 content-addressed), `WatchedTarget`(`caw05:tgt-<slug>`, `foreign_ref` + `label` + 출처가 된 watch-list 토픽 보유), `LedgerLink`(`caw05:lnk-<uuid>`)에 대한 타입화된 모델을 생성한다. [../../05-radar-core/related-work-ledger_ko.md](../../05-radar-core/related-work-ledger_ko.md) §2–§3의 필드 집합과 일치시킨다. `WatchedTarget`은 다른 제품으로의 유일한 seam이다 — 외부 URI를 참조할 뿐, 외부 store 내용을 절대 복사하지 않는다.
- **Verify:** 단위 테스트가 각 엔티티를 인스턴스화하고 JSON으로 round-trip하며 식별자가 문서화된 prefix를 사용함을 단언한다; `LedgerLink`는 `finding_ref`, `target_ref`, `relation`, `rationale`, `evidence_locator`, `provenance` 없이는 생성될 수 없다.

### 2. append-only ledger store 구현
- **Do:** `LedgerLink` 행을 `ledger/<run_id>.jsonl`(또는 ADR-0006에 따른 rolling 파일)에 JSONL 줄로 추가하는 `LedgerStore`를 작성한다. `append(link)`, `read_all()`, `supersede(old_link_id, new_link)`를 노출하며, `supersede`는 **새** 행을 쓰고 새 행의 선행자 포인터 / `superseded_by`를 통한 체인을 설정한다 — 원본 줄을 편집하거나 삭제해서는 안 된다.
- **Verify:** 한 테스트가 링크를 추가하고, supersede한 뒤, 파일을 읽는다: 두 행이 모두 존재하고, 원본 바이트는 변경되지 않으며, latest-state 뷰는 superseding 행으로 해석된다. in-place mutation API는 존재하지 않거나 / 노출되지 않는다(negative test N7).

### 3. relation 어휘 강제(noise는 절대 링크되지 않음)
- **Do:** triage class → `relation`을 매핑하되 `novelty-threat | support | adjacent`만 허용한다. `noise`로 분류된 finding으로부터 링크를 생성하려는 어떤 시도도 거부한다(raise, zero-strength edge를 쓰지 않음). design §3.1 참조.
- **Verify:** linker에 `noise` finding을 공급하는 테스트가 raise하고 `ledger/`에 아무것도 쓰지 않는다(negative test N5).

### 4. Semantic Scholar 검증 파이프라인 구축
- **Do:** design §4 / ADR-0005 §4의 단계적 흐름으로 `VerificationAdapter`를 구현한다:
  1. **NORMALIZE** — 소문자화, 구두점/발음 부호 제거, 공백 축약, arXiv `vN` suffix 제거.
  2. **KEY LOOKUP** — DOI/arXiv가 있으면 S2 `/paper/DOI:{doi}` 또는 `/paper/arXiv:{id}` 호출(정확하고 가장 저렴).
  3. **TITLE MATCH** — 없으면 단일 최적 매치를 위해 S2 `/paper/search/match?query={norm_title}` 호출.
  4. **FUZZY GATE** — Levenshtein-ratio(norm_title, match_title) ≥ `0.70` AND year가 `±1` 이내일 때만 수락.
  5. **DEDUP** — canonical-key 우선순위: DOI > arXiv(버전 제거) > S2 `paperId` > DBLP/ACL > normalized-title+author-surname 해시.
  6. **EMIT** — `VerifiedSource`(canonical key로 content-addressed) 또는 `ambiguous` / `unverified`로 표시.
  임계값 `0.70`과 `±1`은 상수가 아니라 config 값이어야 한다(design §4.3).
- **Verify:** fixture를 사용한(라이브 네트워크 없음) 단위 테스트가 다음을 커버한다: 정확한 DOI hit → `verified`; title ratio 0.82 + year 일치 → `verified`; ratio 0.60 → `ambiguous`; ratio 0.40 → `unverified`. 한 테스트가 0.55 미만 매치가 절대 `verified`로 방출되지 않음을 단언한다(negative test N2).

### 5. recall-first disposition 표 구현
- **Do:** 결정 표(design §4.1)를 연결한다: `verified`는 metadata/`externalIds`를 고정; `ambiguous`(0.55 ≤ ratio < 0.70 또는 year 불일치)는 **유지되어 사람 리뷰로 라우팅**되며 절대 폐기되지 않음; `unverified`(ratio < 0.55 또는 비어 있음)는 "could not verify"로 플래그된 raw metadata를 유지; S2 도달 불가/429 → backoff로 retry, 캐시, 그리고 **절대 Run을 차단하지 않음**(상태는 `unverified`로 fallback).
- **Verify:** S2 timeout/429를 시뮬레이션하는 테스트가 Run이 완료되고, 후보가 캐시되며, 상태가 `unverified`이고, retry가 예약됨을 확인한다(negative test N6). 한 테스트가 `ambiguous` 결과가 폐기 경로가 아니라 사람-리뷰 큐에 도달함을 확인한다.

### 6. run과 adapter 전반에 걸친 multi-key dedup 구현
- **Do:** `VerifiedSource`를 방출하기 전에 SQLite ledger-cache에서 canonical key(Step 4.5 우선순위)를 조회한다; 존재하면 기존 `VerifiedSource`를 재사용하고 새 locator를 부착한다(preprint와 그 published 버전은 S2 `externalIds`를 통해 하나의 소스로 collapse되며, 두 locator를 모두 유지 — design §4.2).
- **Verify:** 한 테스트가 같은 논문을 두 번(한 번은 arXiv adapter로, 한 번은 S2 search로) 수집하고 두 locator를 가진 정확히 하나의 `VerifiedSource` 행이 존재함을 단언한다(negative test N4).

### 7. provenance가 완비된 LedgerLink 조립
- **Do:** 링크 시 `provenance{discovered_via, discovered_at, run_id, verification_status}`, `strength{score, basis}`, `rationale`(사람이 읽을 수 있는 WHY, 감사 전용), `evidence_locator`(소스 INTO의 구체적 포인터, 예: "p.4 §3.2 / abstract" — 절대 요약 아님), 그리고 `kind=generated-summary`로 태깅된 `generated_summary_ref`(nullable, 절대 backing 아님)를 채운다. 기본값으로 `review_status=proposed`를 설정한다(findings는 proposal이다; brief §11). append-only store(Step 2)를 통해 영속화한다.
- **Verify:** 제공된 backing이 생성된 요약뿐인 `LedgerLink`가 **거부**됨(`evidence=false`)을 한 테스트가 단언한다 — `evidence_locator`는 verified source로 들어가야 한다(negative test N1). 스키마 검증이 `provenance` 또는 `evidence_locator`가 빠진 링크를 거부한다.

### 8. ledger를 SQLite 캐시로 인덱싱
- **Do:** append 시 SQLite ledger-cache(`target_ref`, `relation`, `verification_status`, `review_status`, `canonical_key`로 쿼리 가능)에 행을 upsert하여, export(RB-040+)와 read 뷰가 JSONL을 스캔하지 않고 confirmed 링크를 선택하도록 한다. 파일이 source of truth로 남고; SQLite는 재구축 가능한 인덱스다(ADR-0006).
- **Verify:** SQLite 파일을 삭제하고 `reindex` 명령을 실행한 뒤, 캐시가 `ledger/*.jsonl`로부터 동일하게 재구축됨을 확인한다; "`caw05:tgt-mc-dla-novelty`에 무엇이 영향을 주는가" 쿼리가 예상 링크를 반환한다.

## Acceptance criteria
- [ ] 네 개의 엔티티가 CAW-05-local 식별자로 존재한다; `WatchedTarget`은 외부 ref를 불투명 URI로만 참조한다(공유 store 없음).
- [ ] `ledger/*.jsonl`은 append-only다; 수정은 `superseded_by` 행을 추가한다; 원본은 절대 변경되지 않는다(N7).
- [ ] `noise` finding은 절대 링크되지 않는다(N5); relation 어휘는 `novelty-threat | support | adjacent`만이다.
- [ ] 검증은 gate에 따라 `verified | ambiguous | unverified`를 방출한다; 임계값(`0.70`, `±1`)은 config다(N2).
- [ ] ambiguous/임계 미만 매치는 사람 리뷰로 라우팅되며 절대 조용히 누락되지 않는다(recall-first).
- [ ] run/adapter 전반의 반복 논문은 다수 locator를 가진 정확히 하나의 `VerifiedSource`를 낳는다(N4).
- [ ] S2 장애/429는 backoff로 retry하고 캐시하며 절대 Run을 차단하지 않는다(N6).
- [ ] 모든 `LedgerLink`는 소스로 들어가는 `evidence_locator`로 provenance가 완비된다; 생성된 요약은 `kind=generated-summary`이며 evidence에서 제외된다(N1).
- [ ] SQLite ledger-cache가 JSONL로부터 재구축된다; tree가 green이다.

## Rollback / safety
- ledger는 append-only이므로, 잘못된 run은 행을 편집/삭제하는 것이 아니라 **superseding**으로 수정된다. 이 runbook을 중간에 되돌리려면, `ledger-cache` SQLite 테이블(재구축 가능)을 drop하고 현재 run에 한해 진행 중인 `ledger/<run_id>.jsonl` 파일을 폐기한다 — 커밋된 이전-run JSONL은 그대로 유지된다.
- 검증 호출은 **public, read-only, ToS-safe**다(S2/arXiv/DOI). 유료 스크래핑 없음; 비공개 경계나 내부 claim이 finding에 등장하면 링크를 중단한다(brief §12, design §1.5).
- 실패한 S2 의존성은 `unverified` + retry로 degrade한다; 절대 Run을 차단하거나 실패시켜서는 안 된다.

## Hand-off
다음 runbook(RB-031 synthesis, 이후 RB-040+ export)은 다음을 가정할 수 있다: verification status와 dedup된 `VerifiedSource`를 가진, provenance가 완비된 `LedgerLink`의 쿼리 가능한 append-only ledger; confirmed 링크가 export projection(ADR-0007)의 단일 source of truth라는 점; `noise`가 절대 등장하지 않는다는 점; 그리고 모든 링크가 evidence(`source` + `evidence_locator`)를 생성된 요약과 분리한다는 점. export는 `review_status=confirmed` 링크만 projection해야 하며 evidence/boundary 가드를 defense-in-depth로 재강제해야 한다.
