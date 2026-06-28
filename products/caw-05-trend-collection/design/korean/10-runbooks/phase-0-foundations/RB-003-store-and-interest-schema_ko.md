# RB-003: Files-as-truth store + 재구축 가능한 SQLite 인덱스/ledger-cache + interest artifact 스키마 & watch-list 시드

- Status: ready
- Phase: phase-0-foundations
- Depends on: [RB-000, RB-001, RB-002]
- Implements design: [../../04-data-layer/storage-and-scheduling_ko.md](../../04-data-layer/storage-and-scheduling_ko.md), [../../05-radar-core/interest-model_ko.md](../../05-radar-core/interest-model_ko.md), [../../01-decisions/ADR-0006-storage-and-scheduling_ko.md](../../01-decisions/ADR-0006-storage-and-scheduling_ko.md), [../../01-decisions/ADR-0002-interest-model_ko.md](../../01-decisions/ADR-0002-interest-model_ko.md), [../../03-architecture/repo-structure_ko.md](../../03-architecture/repo-structure_ko.md)
- Produces: store I/O 레이어(`findings/*.json` 읽기/쓰기, append-only `ledger/*.jsonl`, `state/`, `runs/<run_id>.receipt.json`); 재구축 가능한 `index.sqlite`(FTS5 + `seen` + ledger projection)와 `caw05 index rebuild`; 타입화된 interest artifact(`interests.yaml` → `interests.json` 컴파일러 + 스키마 검증); PRODUCT-BRIEF §6의 좁은 watch-list 시드; 하류에서 존중되는 recall-priority 하한(floor) 플래그.

## Objective
CAW-05의 자체 store를 실제로 만들고 저장 계약을 증명합니다: **파일이 진실이고, DB는 폐기 가능한 cache** — `index.sqlite`를 삭제하고 파일을 재생(replay)하면 FTS5, `seen` dedup 집합, ledger projection이 재현됩니다([storage-and-scheduling_ko.md §1, §7](../../04-data-layer/storage-and-scheduling_ko.md)). 또한 brief §6 watch list로부터 `recall_priority: high`로 시드된, 컴파일되고 스키마 검증된, 핵심적인 타입화된 interest artifact([interest-model_ko.md §1](../../05-radar-core/interest-model_ko.md))를 작성하여 Phase 2 relevance가 입력을 갖도록 합니다. "Done"의 의미: store가 finding과 ledger row를 round-trip; `caw05 index rebuild`가 query 목적상 bit-equivalent하게 cache를 재구성; `interests.yaml`이 검증되고 `interests.json`으로 컴파일되며 provenance를 가진 시드 항목을 운반; 그리고 recall 하한이 파이프라인이 읽을 수 있는 config 플래그. 여기서 실제 ingestion이나 scoring 수학은 없음(Phase 1/2); fakes가 레코드를 공급.

## Preconditions
- [ ] RB-002 완료: ports, registry, preflight, fakes, provenance/boundary를 가진 값 객체(`RawFinding`, `Cursor` 등).
- [ ] FTS5 가용성 결정됨: FTS5가 대상 Python/SQLite에 컴파일되어 있는지 preflight 검사를 추가, 아니면 `rank-bm25`로 폴백([tech-stack_ko.md §2.3 / §4](../../03-architecture/tech-stack_ko.md)). TODO(open-question: confirm FTS5).
- [ ] YAML 라이브러리 선택됨(PyYAML/ruamel — TODO(open-question: pin)); `.gitignore`가 이미 `index.sqlite`/`run.lock`/`artifacts/`를 제외(RB-000).

## Steps

1. **files-as-truth store I/O 구현.**
   - Do: `core/`에 store 레이어를 추가하여 `RawFinding`/Finding당 하나를 `data/findings/<finding_id>.json`에 쓰고(`canonical_id`에서 파생된 `finding_id`로 키잉, [repo-structure_ko.md §5](../../03-architecture/repo-structure_ko.md)), `LedgerLink` row를 `data/ledger/<yyyy-ww>.jsonl`에 append(append-only — 정정은 `superseded_by` row를 추가하고 결코 변형하지 않음), source별 watermark를 `data/state/<source>.cursor`에 영속화(성공 시 advance), 그리고 `data/runs/<run_id>.receipt.json`에 `{window, per_source:{fetched,new,dup}, classified_counts, exports[], status}`를 작성. 대용량 blob은 inline이 아니라 경로로 provenance에서 참조되어 `data/artifacts/<sha>/`로 감([storage-and-scheduling_ko.md §1–§2](../../04-data-layer/storage-and-scheduling_ko.md)).
   - Verify: fake finding을 쓴 뒤 읽으면 동일하게 round-trip; ledger 정정이 새 row를 append하고 원본을 그대로 둠.

2. **SQLite 인덱스 구축 (FTS5 + seen + ledger projection).**
   - Do: `data/index.sqlite`용 스키마 빌더 생성: finding `title`/`abstract`/`body`에 대한 FTS5 테이블(컬럼 가중치 title>abstract>body, Phase 2 `bm25()`용 — [interest-model_ko.md §2](../../05-radar-core/interest-model_ko.md)); dedup layer 1–2용 `seen` 테이블(canonical id + SHA-256 content hash, [storage-and-scheduling_ko.md §6](../../04-data-layer/storage-and-scheduling_ko.md)); 그리고 평탄화된 ledger projection(`target_ref`, `relation`). DB를 cache-only로 표시(결코 권위적이지 않음).
   - Verify: fake findings를 인덱싱하면 FTS5와 `seen`이 채워짐; 기본 FTS5 query가 finding을 반환.

3. **`caw05 index rebuild` 구현 (일관성 권위).**
   - Do: `index.sqlite`를 DROP하고 `findings/*.json` + `ledger/*.jsonl` + `state/seen.idx`를 재생하여 FTS5, `seen`, ledger projection을 재구성하는 연산 추가([storage-and-scheduling_ko.md §7](../../04-data-layer/storage-and-scheduling_ko.md)). `index rebuild` 서브커맨드로 연결(해당되는 곳에서 op-manifest로부터 도출).
   - Verify(negative test): `index.sqlite`를 삭제하고 `caw05 index rebuild`를 실행한 뒤, 재구축된 FTS5 row, `seen` 집합, ledger projection이 삭제 이전 상태와 같음을 단언 — §7 계약.

4. **타입화된 interest artifact 스키마 정의.**
   - Do: `core/model/`에 [interest-model_ko.md §1](../../05-radar-core/interest-model_ko.md)과 일치하는 interest artifact용 pydantic 스키마 추가: 최상위 `version`, `updated`, `watch_lists[]`(`id`, `label`, `default_weight`, `recall_priority` 포함), 그리고 필드 `id`, `type`(enum keyword|topic|entity|author|venue), `terms`, `aliases`, `weight`, `watch_list`, `polarity`(positive|negative), `decay`(none|slow|fast), `canonical_id`, `provenance`(seed|jimmy|feedback|suggested)를 가진 `interests[]`. 날짜를 지어내지 마세요 — `updated: TODO`로 남김.
   - Verify: 스키마가 잘 형성된 artifact를 검증하고 알 수 없는 `type`/`polarity`를 거부.

5. **brief §6 watch list로부터 `interests.yaml` 시드.**
   - Do: `config/interests.yaml`을 `version: 1`과 `recall_priority: high`로 설정된 `memory-centric-dse` watch list로 작성하고, brief §6 고유명사를 `provenance: seed-brief-§6`을 가진 타입화된 interest로 시드: memory-centric DSE; memory device for LLM; DeepStack; Minsoo Rhu / MC-DLA / memory-wall 계열; MemOS; SECDA-DSE; TTT writeback / test-time compute memory traffic; Chakra / trace-based workload modeling; LLM-serving & memory-hierarchy simulation. Minsoo Rhu에는 `type: author`(`canonical_id: TODO(open-question: S2 authorId/ORCID)` 포함), 나머지에는 `type: topic`/`keyword`, 그리고 일반적 LLM hype를 강등하기 위한 최소 하나의 negative-polarity 항목을 사용. `config/watchlist.yaml`이 별도의 시드 표면이라면 그것도 일관되게 시드([repo-structure_ko.md §1](../../03-architecture/repo-structure_ko.md)).
   - Verify: `interests.yaml`이 RB-003 스키마에 대해 검증됨; 모든 시드 항목이 `provenance`를 운반하고 watch list가 `recall_priority: high`.

6. **interests 컴파일러(yaml → json)를 version 게이팅과 함께 구현.**
   - Do: `interests.yaml`을 검증하고 머신이 소비하는 `interests.json`을 내보내는 컴파일러를 추가하고, accepted 편집마다 `version` bump를 요구(git diff = 전체 감사; version으로 rollback — [interest-model_ko.md §5](../../05-radar-core/interest-model_ko.md)). 이후 join을 위해 interest row를 `index.sqlite`로 미러링. 여기서 학습된 profile, feedback nudging 없음(Phase 2+).
   - Verify: 컴파일이 YAML과 의미적으로 동일한 `interests.json`을 생성; `version` bump 없이 편집하면 플래그됨.

7. **recall 우선 하한 플래그를 파이프라인에 노출.**
   - Do: `recall_priority: high`를 노출하여 하류 noise route가 surface-not-drop을 반드시 존중하도록: high-priority watch-list interest와 매칭되는 finding은 항상 triage용으로 노출되고 결코 자동 폐기되지 않음 — 점수는 순서를 지배하지 생존을 지배하지 않음([interest-model_ko.md §3](../../05-radar-core/interest-model_ko.md)). 여기서는 플래그 배관 + 가드 훅만 구현; scoring 수학은 Phase 2.
   - Verify: high-priority watch-list 매치로 태그된 fake finding이 (stub) noise 경로에서 결코 dropped되지 않음을 한 테스트가 단언.

## Acceptance criteria
- [ ] Store I/O가 findings(`findings/*.json`)를 round-trip하고, ledger row(`ledger/*.jsonl`, `superseded_by`로 append-only)를 append하며, cursors와 run receipt를 영속화; 대용량 blob은 경로로 참조, inline 아님.
- [ ] `index.sqlite`가 FTS5(가중치 title>abstract>body) + `seen`(id + SHA-256) + ledger projection을 구축; gitignore되고 cache-only로 표시됨.
- [ ] `caw05 index rebuild`가 DB 삭제 후 query에 대해 FTS5, `seen` 집합, ledger projection을 bit-equivalent하게 재현(§7 negative test).
- [ ] interest 스키마가 시드된 `interests.yaml`을 검증; 모든 시드 항목이 `provenance: seed-brief-§6`(또는 `seed-jimmy`)을 운반; watch list가 `recall_priority: high`.
- [ ] 컴파일러가 `interests.json`을 내보내고 `version` bump에 게이트; 지어낸 날짜 없음(`updated: TODO`).
- [ ] recall 우선 하한 플래그가 파이프라인이 읽을 수 있고, high-priority 매치가 결코 자동 drop되지 않음을 가드 테스트가 보여줌.
- [ ] `rank-bm25` 폴백 경로가 명시된 FTS5 가용성 preflight 검사가 존재.
- [ ] CI green; core→ports 경계 여전히 강제됨.

## Rollback / safety
- `index.sqlite`는 폐기 가능: file↔index drift가 의심되면 in-place 조정이 아니라 `caw05 index rebuild`로 수정([storage-and-scheduling_ko.md §7](../../04-data-layer/storage-and-scheduling_ko.md)).
- Ledger는 append-only: 결코 row를 변형/삭제하지 않음; 정정은 `superseded_by` row를 추가하여 감사 추적이 유지됨.
- recall-bias 규칙: 불확실하면 버리지 말고 둘 다 유지 / 재fetch — 중복은 값싸고, 놓친 논문은 실존적(PRODUCT-BRIEF §1). dedup이나 noise 하한이 high-priority 매치를 조용히 drop하게 두지 마세요.
- interest 편집은 human-gated이고 버전화됨 — 여기서 interest를 자동 생성/삭제하거나 `terms`를 자동 편집하지 마세요.
- 실제 sources에 접촉하지 않음(합법/ToS 적합); fakes만 fixture를 씀. 브랜치를 폐기하고 `data/` fixture를 비워 되돌림.

## Hand-off
이로써 Phase 0 / Milestone M0이 완료됩니다: 모든 표면에 걸친 no-op Run, 다섯 ports + registry + preflight + stubs, 그리고 재구축 가능한 인덱스와 시드되고 검증된 interest artifact를 가진 files-as-truth store. Phase 1(RB-1XX)은 provenance 태그된 finding을 쓸 실제 장소, core 내 영속화된 cursors + `seen` dedup 인덱스, 그리고 타입화된 `recall_priority: high` watch list를 가정할 수 있으며 — Phase 2 relevance 이전에 합류하는 v1 SourceAdapters(arXiv/S2/GitHub/RSS/HN-light)와 interest 모델 wiring 구현으로 진행합니다.
