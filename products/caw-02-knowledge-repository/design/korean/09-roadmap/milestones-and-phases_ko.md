# Milestones & Phases

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [dependency-graph.md](dependency-graph_ko.md)
  - [risks-and-mitigations.md](risks-and-mitigations_ko.md)
  - [../01-decisions/ADR-0001-product-surface-and-skill-interface.md](../01-decisions/ADR-0001-product-surface-and-skill-interface_ko.md)
  - [../01-decisions/ADR-0002-storage.md](../01-decisions/ADR-0002-storage_ko.md)
  - [../01-decisions/ADR-0005-ingestion-pipeline.md](../01-decisions/ADR-0005-ingestion-pipeline_ko.md)
  - [../01-decisions/ADR-0007-import-export-contracts.md](../01-decisions/ADR-0007-import-export-contracts_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF_ko.md

## Purpose

이 문서는 CAW-02의 빌드를 런북 단계 폴더(`10-runbooks/0X-*`)와 1:1로 매핑되는
단계(phase)들로 순서화하고, 각 단계의 **대표 마일스톤(headline milestone)**을
고정한다. AI 빌더가 어떤 단계가 시작되고 완료되었는지 알 수 있도록 단계별
**진입/종료 기준(entry/exit criteria)**을 정의한다. 이 문서는 단계별 빌드
지침을 명시하지 않으며(그것은 런북의 역할) 어떤 ADR 결정도 재정의하지 않는다(이를
구체화할 뿐). 범위는 PRODUCT-BRIEF로 고정된다: v0 = **append + retrieve +
skill-wrap**이며, continual learning이 아니다.

## Milestone definitions (headline outcomes)

| ID | Milestone | Proves |
|----|-----------|--------|
| **M0** | Repo + skeleton green | 트리가 컴파일/lint 통과; CI 실행; 빈 `knowledge/` 트리 초기화 |
| **M1** | **최초의 provenance-보존 지식 트랜잭션 round-trip** | `add-source → extract-claim → attach-evidence → synthesize-cited-note`가 유효한 md-in-git을 쓰고, SQLite로 reindex되며, skill 인터페이스를 통해 **검색 가능**하다 — 브리프(§2)의 가치 단위 |
| **M2** | 모든 쓰기에 boundary + trust 강제 | `boundary`/`visibility` monotone 전파 + T0–T3 ladder 계산; evidence gate 구조적 |
| **M3** | skill-wrap을 통한 agent 쓰기(confirmation-by-default) | op manifest에서 codegen된 MCP/CLI/API 얇은 adapter; agent 제출물 검토됨 |
| **M4** | Retrieval v0 (FTS5 + structured filters) | citation-제약 RAG가 claim+evidence를 반환하며 불투명한 blob을 반환하지 않음 |
| **M5** | Import/export boundary 가동 | import 시 quarantine; fail-closed export allow-list; CAW-03로 signed bundle |

M1은 **critical milestone**이다: provenance round-trip이 실제 storage 기질
위에서 end-to-end로 존재하기 전까지는 그 이후의 어떤 것도 의미가 없다.

## Phases (mapped to runbook folders)

| Phase | Runbook folder | Theme | Headline milestone |
|-------|----------------|-------|--------------------|
| P0 | `10-runbooks/00-foundations` | Repo, CI, storage layout, data model | M0 |
| P1 | `10-runbooks/01-storage-and-index` | md-git 단일 진실 공급원 + 결정론적 reindex → SQLite | (M1 가능케 함) |
| P2 | `10-runbooks/02-core-and-skillwrap` | core validator, evidence gate, op manifest, 트랜잭션 round-trip | **M1** |
| P3 | `10-runbooks/03-provenance-trust` | boundary/visibility 전파, trust ladder, audit/events | M2 |
| P4 | `10-runbooks/04-surfaces` | API + MCP + CLI 얇은 adapter, confirmation-by-default | M3 |
| P5 | `10-runbooks/05-retrieval` | FTS5 BM25 + first-class structured filters, RAG hydration | M4 |
| P6 | `10-runbooks/06-import-export` | quarantine import, fail-closed export, signed envelope | M5 |
| P7 | `10-runbooks/07-viewer-and-hardening` | 선택적 read-only viewer, dedup 품질, 운영 hardening | — |

> 단계는 의존성에 의해 **대체로 순차적**이다(see
> [dependency-graph.md](dependency-graph_ko.md)); core(P2)와 provenance(P3)가
> 안정되면 P4와 P5는 겹칠 수 있다.

---

## P0 — Foundations

**Goal:** green skeleton과 표준 on-disk 형태.

- **Entry:** ADR-0002/0003 accepted; 빈 repo.
- **Work:** `knowledge/{sources,claims,evidence,notes,concepts,interests,decisions,open-questions,assumptions,signals}/`와 `knowledge/_events/` 초기화; entity별 YAML frontmatter schema; CI(build + lint + schema-validate); fixture.
- **Exit (all true):**
  - [ ] `knowledge/` 트리 + `_events/`가 존재하고 버전 관리된다.
  - [ ] 모든 entity 타입의 frontmatter JSON-schema가 sample fixture를 lint한다.
  - [ ] 빈 트리에서 CI green(build + lint + schema-validate).
  - [ ] 데이터 모델(ADR-0003)이 하나의 generic 타입화된 edge 계약으로 인코딩된다.

## P1 — Storage & deterministic reindex

**Goal:** md-in-git이 단일 진실 공급원; SQLite는 파생되고 폐기 가능한 인덱스.

- **Entry:** P0 종료 충족.
- **Work:** entity당 하나의 `.md`(frontmatter + body)를 내보내는 writer; append-only `_events/<ts>-<op>.jsonl` 미러; `knowledge/`로부터 순수하게 SQLite(relational + FTS migration은 droppable하게 유지)를 재구축하는 **결정론적이고 idempotent한 reindex**.
- **Exit:**
  - [ ] 고정된 corpus에서 `reindex`를 반복 실행해도 byte-동일한 SQLite 콘텐츠를 생성한다(idempotent).
  - [ ] SQLite 파일을 삭제하고 reindex를 재실행하면 md-git으로부터 인덱스를 완전히 재구성한다.
  - [ ] FTS/vector 스키마는 **별도의 droppable migration**에 존재한다.
  - [ ] 모든 쓰기는 정확히 하나의 `_events` 라인을 추가한다; git commit이 audit 기록이다.

## P2 — Core + skill-wrap → **M1**

**Goal:** 최초의 provenance-보존 지식 트랜잭션, end to end.

- **Entry:** P1 종료 충족.
- **Work:** 모든 로직을 소유하는 단 하나의 트랜잭션 core — validator, 3-layer Claim→Evidence invariant, **구조적 evidence gate**(`attach_evidence`는 prose 필드가 없고; `artifact_ref`는 반드시 resolve되어야 함), append-only + supersedes(update/delete 없음). `add_source`, `parse`, `extract_claim`, `attach_evidence`, `synthesize_note`를 정의하는 하나의 op manifest. round-trip을 구동하는 최소 skill 진입점.
- **Exit (M1 acceptance):**
  - [ ] `add-source → extract-claim → attach-evidence → synthesize-cited-note` 실행이 `knowledge/` 아래에 schema + core 검증을 통과하는 유효한 md 파일을 쓴다.
  - [ ] 합성된 Note는 Claim+Evidence로의 citation을 지닌다; 생성된 요약은 **절대** Evidence로 저장되지 않는다.
  - [ ] `reindex`가 새 트랜잭션을 받아들인다; retrieval 쿼리가 **hydrate된 provenance 체인과 함께** Note를 반환한다(source→claim→evidence).
  - [ ] Evidence가 0인 Claim은 세 layer 모두(frontmatter, validator, reindex 재확인)에서 **거부**된다.
  - [ ] 전체 round-trip이 임시적 파일 편집이 아니라 skill 인터페이스를 통해 실행된다.

## P3 — Provenance, boundaries & trust

**Goal:** 모든 쓰기에서 계산되는 무결성 규칙.

- **Entry:** M1 충족.
- **Work:** PROV 형태의 2-layer provenance edge; **두 개의 직교 축** `boundary {public,internal,confidential}`와 `visibility {team,private}` + 계산된 **monotone 전파**(synthesis는 절대 강등하지 않음); 파생된 **trust ladder T0–T3 + contested**, AI 작성물은 **T2** 상한.
- **Exit:**
  - [ ] `confidential` 입력으로부터의 합성은 절대 덜 제한적인 `boundary`를 산출하지 않는다(monotonicity 테스트 통과).
  - [ ] Trust는 reindex에 의해 결정론적으로 재계산된다; AI 작성 노드는 절대 T2를 초과하지 않는다.
  - [ ] Contested 상태가 표현 가능하고 retrieval에서 드러난다.
  - [ ] Audit(events + signed git commit/blame)가 모든 노드가 어떻게 라벨을 얻었는지 재구성한다.

## P4 — Surfaces (API + MCP + CLI)

**Goal:** 얇은 adapter, 동일한 의미론, 안전한 agent 쓰기.

- **Entry:** M2 충족.
- **Work:** 단일 op manifest로부터 API + MCP + CLI를 codegen(adapter는 로직을 추가하지 않음); agent 쓰기에 **confirmation-by-default**; agent 제출물은 **기본적으로 검토됨**(v0에서 조용한 auto-accept 없음).
- **Exit:**
  - [ ] 세 surface 모두 manifest로부터 생성된다; conformance 테스트가 셋 간 동일한 동작을 보인다.
  - [ ] confirmation 없는 agent 쓰기는 차단된다; 거부된 후보는 audit을 위해 보존된다.
  - [ ] 어떤 surface도 core validator나 evidence gate를 우회할 수 없다.

## P5 — Retrieval v0

**Goal:** first-class structured filter를 갖춘 키워드 retrieval; citation-제약 RAG.

- **Entry:** M1 충족(P3/P4와 겹칠 수 있음).
- **Work:** SQLite **FTS5 (BM25)**; ranking **이전에** 적용되는 structured filter(`boundary`, `visibility`, `type`, `trust`, `concept`); 결과는 provenance 체인을 hydrate한다. **v0에는 embedding 없음**; vector sidecar 스키마는 예약됨.
- **Exit:**
  - [ ] 필터는 pre-ranking으로 적용된다; `private`/`confidential` 항목은 필터링되어 제외된 결과 집합에 절대 누출되지 않는다.
  - [ ] RAG는 claim+evidence bundle을 반환하며 불투명한 blob을 반환하지 않는다.
  - [ ] Vector 스키마는 예약되었으나 미사용; embedding 도입 트리거가 문서화됨(recall/precision). TODO(open-question: numeric recall/precision triggers).

## P6 — Import / export boundaries

**Goal:** 다른 독립 제품들로의 안전한 경계 횡단.

- **Entry:** M2 + M4 충족.
- **Work:** 버전화된 envelope, **모든 횡단에서의 필수 재-redaction**, **fail-closed export allow-list**. Import = quarantine + confidentiality 검사 후 노드로 매핑; CAW-01 projection과 CAW-05 radar signal **import**(→ Source/Claim/Evidence/OpenQuestion/RelatedWork/RadarSignal); 인용된 Claim+Evidence bundle을 CAW-03로 **export**; bundle은 **signed**; 양방향 provenance manifest.
- **Exit:**
  - [ ] CAW-01 projection을 import하면 quarantine 상태로 안착한다; 노드로 매핑하기 전에 confidentiality 검사가 실행된다.
  - [ ] Export는 allow-list에 없는 것을 모두 누락한다(fail-closed); confidential 항목은 공개용 bundle에 절대 나타날 수 없다.
  - [ ] Export된 bundle은 signed이며 provenance manifest를 지닌다.
  - [ ] 이들은 file/API 경계일 뿐이다 — CAW-01/05/03과 **공유 저장소 없음**.

## P7 — Viewer & hardening

**Goal:** read-only 브라우징 + 운영 견고성.

- **Entry:** M5 충족.
- **Work:** 선택적 **read-only** viewer(sources/claims/evidence/notes + links); dedup 품질 패스; resumable-runbook hardening(각 체크포인트에서 트리를 green으로 유지).
- **Exit:**
  - [ ] Viewer는 read-only다; 이를 통한 쓰기 경로 없음.
  - [ ] Dedup 동작이 문서화되고 측정됨. TODO(open-question: dedup acceptance metric).
  - [ ] 각 단계의 런북은 green 트리를 남겨 중단된 빌드가 깨끗하게 재개되도록 한다.

## Open Questions

- Embedding 추가를 위한 numeric retrieval 트리거(P5). TODO(open-question).
- Dedup acceptance metric(P7). TODO(open-question).
- P4와 P5가 공식적으로 병렬화되는지 엄격히 순차되는지 여부.
- See `../08-research-plan/open-questions.md`.

## Implications for runbooks

- 폴더 번호 `10-runbooks/0X-*`는 위의 단계 P0–P7과 일치한다.
- M1은 게이팅 런북 acceptance다; 이후 단계는 round-trip + reindex가 존재한다고 가정할 수 있다.
- 모든 런북은 Acceptance 체크포인트에서 트리를 green으로 남겨야 한다(resumability — see risks doc).
