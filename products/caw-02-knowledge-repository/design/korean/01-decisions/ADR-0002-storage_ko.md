# ADR-0002: 저장 — markdown 우선 단일 진실 공급원 + 재구축 가능한 SQLite 인덱스

- **Status:** proposed
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [../_meta/PRODUCT-BRIEF_ko.md](../_meta/PRODUCT-BRIEF_ko.md)
  - [../02-research/knowledge-store-storage-options_ko.md](../02-research/knowledge-store-storage-options_ko.md)
  - [./ADR-0004-provenance-and-trust_ko.md](./ADR-0004-provenance-and-trust_ko.md)
  - [./ADR-0006-retrieval_ko.md](./ADR-0006-retrieval_ko.md)
  - [./ADR-0007-import-export-contracts_ko.md](./ADR-0007-import-export-contracts_ko.md)
  - [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적
CAW-02가 v0에서 자신의 `Source → Claim → Evidence → Note` provenance 체인을 **물리적으로 어떻게 영속화**하는지를
결정한다. 모든 표면(API/MCP/CLI/뷰어)이 무엇을 대상으로 읽고 쓰는지, 그리고 Postgres / 그래프 /
지속 학습(continual-learning)으로 가는 업그레이드 경로를 고정한다. retrieval 랭킹([ADR-0006](./ADR-0006-retrieval_ko.md) 참조),
trust/boundary 어휘([ADR-0004](./ADR-0004-provenance-and-trust_ko.md) 참조), import/export 와이어 포맷
([ADR-0007](./ADR-0007-import-export-contracts_ko.md) 참조)은 결정하지 **않는다**.

## 배경
- 이 store는 CAW-02 자신의 것이다; CAW-01/03/05과 **공유 기반(shared substrate)이 없다**(브리프 §1, §6).
- 규모는 단일 큐레이터(Jimmy) + 소규모 팀 + 소수의 AI 에이전트이며, 조직/멀티테넌트가 아니다(브리프 §3, §9).
- 두 힘이 서로를 잡아당긴다: **trust/재구성 가능성**은 git에 들어가는 평문(plain), diff 가능, 감사 가능한 파일을
  원한다; **질의/링크**는 `Claim→Evidence`를 강제하고 링크를 순회하며 boundary/trust로 필터링하기 위해 관계형
  store를 원한다.
- 스키마는 **재작성 없이 미래의 그래프 / 지속 학습 업그레이드**를 허용해야 한다(브리프 §5, §6).
- v0 범위는 **append + retrieve + skill-wrap**이다; 지속 학습은 명시적으로 제외된다(브리프 §2, §9). v1에 Neo4j 없음.
- 대용량 import된 아티팩트(CAW-01 projection/trace)는 **경로/URI로 참조**되며, 결코 인라인되지 않는다(브리프 §6, §7).

## 검토된 선택지
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **markdown만(git)** | 최고의 diff/감사/이력; 제품 재작성에도 살아남음; 인프라 제로 | `Claim→Evidence` 강제 불가; 링크 순회는 grep; boundary/trust 질의 없음 | trust는 예, 질의는 아니오 — 단독으로는 불충분 |
| **SQLite만** | FK + CHECK 불변식; FTS5; 재귀 CTE 순회; 단일 파일 | 바이너리 SoT는 사람이 diff 가능한 이력을 잃음; 재구성 가능성이 제품 코드에 묶임 | SoT로는 기각됨 |
| **Postgres만** | MVCC, `tsvector`, `pgvector`, Apache AGE | 서버 인프라가 인프라 제로 단일 큐레이터 기본값을 깨뜨림; v0 규모에 과함 | v0 기본값이 아니라 **이식성(portability) 목표** |
| **하이브리드: md SoT + 재구축 가능한 SQLite 인덱스** | git trust/diff/이력 AND 질의/불변식 레이어; 인덱스는 폐기 가능하며 재구성 가능; 이식 가능한 부분집합 스키마가 변경 없이 Postgres로 이식 | 두 표현이 발맞춰 유지되어야 함; 팀 쓰기 동시성은 PR/merge 규율 필요 | **선택됨** |

## 결정
**git 저장소의 markdown 파일이 단일 진실 공급원이다; SQLite 데이터베이스는 파생된 폐기 가능한 인덱스이다.**

1. **파일이 정본(canonical)이다.** 각 엔티티는 하나의 `.md` = **YAML frontmatter(기계 계약) + markdown 본문
   (사람용 노트)** 이며 `knowledge/{sources,claims,evidence,notes,concepts,interests,decisions,open-questions,assumptions,signals}/`
   아래에 위치한다. append-only `knowledge/_events/<ts>-<op>.jsonl`이 모든 skill-wrap 쓰기를 미러링한다; git
   이력(서명된 커밋, blame)은 두 번째 append-only 원장(ledger)이다.
2. **SQLite는 누구에게도 권위적이지 않다.** 멱등적 `reindex`를 통해 **파일로부터 완전히 재구축 가능**하다.
   읽기 시 `content_hash` 불일치는 인덱스가 낡았다는 뜻 ⇒ 재구축한다; 행을 결코 조용히 신뢰하지 않는다.
3. **이식 가능한 부분집합 스키마.** 코어 테이블은 SQLite∩Postgres 부분집합(`TEXT/INTEGER/TIMESTAMP`, 대리
   `TEXT` id, FK, CHECK)만 사용한다. 범용 타입 명시 **`edge`** 테이블이 업그레이드 경로의 핵심(keystone)이다;
   FTS와 벡터는 **분리되어 폐기 가능한** 마이그레이션에 두어 retrieval 선택이 이식성을 위협하지 않게 한다.
4. **코어 테이블(파일로부터 재구축):** `node(id, kind, boundary, visibility, trust, artifact_uri, file_path,
   content_hash, created_at)`, `edge(src_id, dst_id, rel)`, `event(seq, ts, op, node_id, payload)`. boundary/visibility는
   **default-deny / default-private** 기본값을 갖는 `NOT NULL`이다([ADR-0004](./ADR-0004-provenance-and-trust_ko.md) 참조).
5. **불변식 강제는 DB 트리거가 아니라 ingest 검증기(validator)에 둔다.** 이식 가능한 FK는 "타입 명시된 edge
   ≥1"을 표현할 수 없으므로, writer/`reindex`가 모든 `kind='claim'`이 `evidence` 노드로 향하는
   `edge(rel='supports')`를 ≥1개 갖는지 재검사한다 — SQLite와 Postgres에서 동일하다.
6. **쓰기 순서:** 파일 먼저 → 인덱스로 미러 → `_events` append → 검증 → 커밋. 검증 실패는 트랜잭션 전체를
   중단한다(고아 파일 없음).
7. **대용량 아티팩트**는 `knowledge/` 바깥에 머물며 `artifact_uri`로 참조된다; import는 공개 안전(public-safe)
   페이로드만 복사하고 `boundary`를 새긴다([ADR-0007](./ADR-0007-import-export-contracts_ko.md) 참조).

## v0 선택, 명료하게 진술
**md 우선 SoT + 단일 로컬 SQLite 인덱스 파일.** Postgres가 아니고, 그래프 DB가 아니다. 하나의 배포 단위,
서버 없음.

## 결과
- **쉬운 점:** provenance로서 git 네이티브 감사/diff/blame; 원할 때 인덱스를 드롭하고 재구축; `reindex` 런북은
  설계 전체가 기대는 안전망; 하나의 바이너리 + 저장소로 출시.
- **쉬운 업그레이드 경로(SoT 재작성 없음):** (1) v0 관계형 edge + 재귀 CTE; (2) 팀의 동시 작성자 / 인덱스
  경합이 요구할 때 Postgres 이식 — 동일한 이식 가능 스키마, CTE 불변, MVCC/`tsvector`/`pgvector` 획득;
  (3) 동일한 Postgres 위에서 **Apache AGE**를 통한 네이티브 그래프(기존 `edge` 테이블 위 openCypher)는 순회
  깊이/성능 또는 진정한 지속 학습이 정당화할 때만. 모든 단계에서 파일이 정본으로 유지된다; 그래프 엔진은 FTS와
  꼭 마찬가지로 또 하나의 파생 인덱스일 뿐이다.
- **지속 학습**(v0 아님)은 append-only `event`/JSONL 원장 + 재구성 가능한 체인을 읽는다; v0의 어떤 것도 나중에
  그것을 추가하기 위해 되돌려지지 않는다.
- **어려운 점:** 팀 쓰기 동시성은 Postgres 이식 전까지 파일에 대한 PR/merge이다(단일 작성자 인덱스 잠금);
  skill 인터페이스 바깥의 직접 파일 편집은 `_events` 원장을 git과 어긋나게(drift) 할 수 있다.
- **후속 작업:** `reindex` 런북(DB 드롭, 재구축, 바이트 동일 질의 결과); `Claim→Evidence` 검증기를 갖춘
  ingest/skill-wrap 런북; 수용 기준(acceptance check)으로서 이식 가능 부분집합 SQL lint.

## 미해결 질문 / 재검토 트리거
- `TODO(open-question: ID scheme — content-addressed hash vs sequential slug)`
- `TODO(open-question: team write-concurrency — git PR/merge vs serializing write-through API; this is the Postgres-port trigger)`
- `TODO(open-question: how _events JSONL and git history reconcile if files are edited outside the skill interface)`
- **재검토 트리거 → Postgres:** 동시 팀 작성자 또는 인덱스 경합이 나타날 때.
- **재검토 트리거 → Apache AGE / 그래프:** 순회 깊이/성능이 저하되거나(SQLite CTE BFS ~10만 노드 범위) 지속
  학습이 승인될 때.
- [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md) 참조.

## 런북에 대한 함의
- **RB (reindex first):** `knowledge/**`로부터 SQLite 인덱스를 결정론적, 멱등적으로 재구축.
- **RB (ingest/skill-wrap):** 파일 우선 쓰기 + 인덱스 미러 + `_events` append + `Claim→Evidence` 검증기; 실패 시 중단.
- **RB (schema):** 이식 가능 부분집합 코어 테이블; FTS/벡터는 분리된 폐기 가능 마이그레이션에; 수용 기준으로 이식 가능 SQL lint.
