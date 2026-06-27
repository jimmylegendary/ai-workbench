# 데이터 모델 — 엔티티 frontmatter 스키마 + 범용 타입 지정 edge 모델

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./storage-strategy_ko.md](./storage-strategy_ko.md)
  - [./provenance-and-boundaries_ko.md](./provenance-and-boundaries_ko.md)
  - [./versioning-and-events_ko.md](./versioning-and-events_ko.md)
  - [../01-decisions/ADR-0002-storage_ko.md](../01-decisions/ADR-0002-storage_ko.md)
  - [../01-decisions/ADR-0003-knowledge-data-model_ko.md](../01-decisions/ADR-0003-knowledge-data-model_ko.md)
  - [../01-decisions/ADR-0004-provenance-and-trust_ko.md](../01-decisions/ADR-0004-provenance-and-trust_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF_ko.md

## 목적
이 문서는 모든 CAW-02 지식 엔티티의 **구체적인 디스크 상 형태**를 확정한다. 즉 `kind`별 YAML frontmatter
계약, 하나의 범용 타입 지정 `edge` 모델, 노드 id 체계, 그리고 `Claim→Evidence` 불변식의 구조적 형태다. 이는
[ADR-0003](../01-decisions/ADR-0003-knowledge-data-model_ko.md)(어휘)와
[ADR-0002](../01-decisions/ADR-0002-storage_ko.md)(파일이 source of truth)를 구체화한다. 물리적
영속화/reindex 메커니즘(see [storage-strategy](./storage-strategy_ko.md)), trust/boundary의 *의미*(see
[provenance-and-boundaries](./provenance-and-boundaries_ko.md)), 또는 event/version 로그(see
[versioning-and-events](./versioning-and-events_ko.md))는 결정하지 않는다.

## 1. 엔티티 하나 = 마크다운 파일 하나
모든 노드는 **하나의 `.md` 파일** = YAML frontmatter(기계 계약) + 마크다운 본문(사람용 노트)이며, `kind`별로
다음과 같이 배치된다:

```
knowledge/
  sources/         clm? no — src_*.md
  claims/          clm_*.md
  evidence/        evd_*.md
  notes/           not_*.md
  concepts/        cpt_*.md
  interests/       int_*.md
  open-questions/  oq_*.md
  decisions/       dec_*.md
  assumptions/     asm_*.md
  signals/         rw_*.md, rdr_*.md
  _refs/           trc_*.md, sim_*.md, exp_*.md   # imported-artifact references
  _events/         <ts>-<op>.jsonl                # append-only event mirror
```

frontmatter가 정본(canonical)이며, SQLite `node`/`edge` 행은 이와 동기화되어 유지되는 파생 미러다
(see [storage-strategy](./storage-strategy_ko.md)). 본문은 자유로운 사람용 산문이며 **결코** 기계적으로
load-bearing하지 않다 — 본문은 결코 evidence가 될 수 없다(brief §10의 구조적 형태).

## 2. 노드 id 체계
```
<prefix>_<yyyy>_<base32(blake3(canonical_payload))[:10]>
e.g.  clm_2026_k7t2qx9m1a
```

| 규칙 | 값 |
|---|---|
| kind별 prefix | `src claim→clm evd not cpt int oq dec asm rw rdr trc sim exp` |
| 연도 세그먼트 | 생성 연도 (사람이 훑어보기 위한 것, 의미론적 아님) |
| 해시 세그먼트 | 정본 frontmatter에서 `id`를 뺀 것 + 본문에 대한 base32(blake3)의 처음 10자 |
| 안정성 | id는 생성 시 content-addressed 되며 그 후 **불변(immutable)**; 정정은 `supersedes`로 연결된 새 id다 |
| 파일명 | `id` + `.md`; 파일명과 `id` 필드는 반드시 일치해야 한다(reindex가 재확인) |
| 충돌 | 해시 충돌 ⇒ `-1` 추가 후 `TODO(open-question: collision policy)`를 노출 |

content-addressing은 노드의 id를 탄생 시점 콘텐츠의 지문으로 만들기 때문에 중복 import가 스스로 감지된다.
`supersedes` 체인(id 변경이 아니라)이 이후의 모든 편집을 담는다 — see
[versioning-and-events](./versioning-and-events_ko.md).

`TODO(open-question: content-addressed hash vs sequential slug — owned jointly by ADR-0002/0003; this doc assumes hash.)`

## 3. 공통 frontmatter (모든 노드)
인덱스 `node` 행으로 미러링되며 동기화 유지된다. **derived**로 표시된 필드는 core가 계산하며 호출자가
설정해서는 **안 된다**(존재하고 값이 어긋나면 거부됨).

```yaml
id:            clm_2026_k7t2qx9m1a        # immutable, == filename
kind:          claim                       # closed vocabulary, see §4
schema_version: 1                          # frontmatter contract version
boundary:      internal                    # public|internal|confidential (default-deny: internal)
visibility:    private                     # team|private (default-private)
status:        needs_evidence              # proposed|accepted|needs_evidence|rejected|superseded
generated:     true                        # true for Note + any LLM-proposed candidate
trust:         T0                          # DERIVED  T0..T3|contested  (never caller-set)
artifact_uri:  null                        # path/URI for evidence/_refs; null otherwise
created_by:    skill:extract-claims        # agent id (human or skill name)
attributed_to: human:jimmy                 # origin author (may differ on import)
created_via:   pe_2026_a13f...             # provenance_event id of the writing activity
supersedes:    null                        # id of the version this replaces (null if original)
content_hash:  blake3:9f2c...              # detects file<->index drift
created_at:    2026-06-27T10:04:11Z        # RFC3339 UTC
```

edge는 여기서 자유 필드로 저장되지 않는다. edge는 `edge` 테이블에 1:1로 미러링되는 전용 link 블록(§5)에
존재하므로, 단일 표현이 파일과 인덱스를 모두 구동한다.

## 4. kind별 frontmatter 스키마
닫힌 `kind` 어휘(ADR-0003): `source claim evidence note concept interest open_question decision
assumption trace simulation_run experiment related_work radar_signal`. 아래는 각 kind가 §3 위에 추가하는
**타입별** 필드다. 예시에는 구별되는 필드만 표시한다.

### Source
```yaml
kind: source
source_type:  paper|article|note|dataset|import_ref   # what the raw input is
title:        "Sparse Mixture-of-Experts routing..."
origin_uri:   https://arxiv.org/abs/...               # where it came from (may be null for internal)
imported_from: caw-05|caw-01|null                      # cross-product import provenance (file boundary)
```
Source는 **그 자체로 아무것도 주장하지 않는다**; 이는 `extracted_from`/`evidence_of`의 대상이다.

### Claim
```yaml
kind: claim
statement:    "MoE routing reduces FLOPs/token by ~Nx at fixed quality."
claim_type:   empirical    # empirical|methodological|definitional|comparative|normative  (TODO taxonomy ADR-0005)
# status starts needs_evidence; promotion to accepted requires >=1 evidence_for edge (§6)
```
**evidence 없이는 무효.** 맨몸 Claim은 일급(first-class) `status=needs_evidence`, `trust=T0` 상태다 —
가시적이고, 승격 불가능하며, 숨겨야 할 오류가 결코 아니다.

### Evidence
```yaml
kind: evidence
stance:       supports          # supports|challenges
artifact_uri: file://knowledge/_refs/sim_2026_...   # MUST resolve to a real artifact/source span
locator:      "p.4, fig.2"      # span/page/line/cell locator inside the artifact
# NOTE: there is NO prose/summary field. Evidence is a typed pointer, never free text.
```
**산문 필드의 부재가 곧 스키마 계층의 evidence gate**다(ADR-0004 §3, layer 1). Evidence는 자신의 Claim으로의
`evidence_for` edge와 구체적 artifact/source로의 `extracted_from` edge를 가진다.

### Note (synthesis)
```yaml
kind: note
generated:    true             # always true; structurally barred from being evidence
title:        "What we know about MoE routing efficiency"
# body holds the synthesis prose; every assertion in it is backed by a cites edge to Claim/Evidence
```

### Concept / Interest
```yaml
kind: concept
label:        "mixture-of-experts"
aliases:      ["MoE", "sparse experts"]
```
```yaml
kind: interest
label:        "inference-cost reduction"
priority:     high|normal|low        # drives intake prioritization (ADR-0005 Pipeline B)
```

### OpenQuestion / Decision / Assumption
```yaml
kind: open_question
question:     "Does MoE routing hold at our context lengths?"
raised_by:    human:jimmy|signal:rdr_2026_...    # manual or auto-raised by a refuting signal
resolved_by:  null                                # decision id once resolved
```
```yaml
kind: decision
title:        "Adopt MoE for the v2 inference path"
decided_by:   human:jimmy        # strategic decisions are human-reviewed (brief §10)
status:       accepted
```
```yaml
kind: assumption
statement:    "Token distribution at inference matches training mix."
confidence:   stated            # stated|tested  (tested requires linked evidence)
```

### 가져온 artifact 참조 (여기서 카탈로그만 하며, 실행하지 않음)
```yaml
kind: simulation_run            # or trace | experiment
artifact_uri: file:///artifacts/caw01/run_8831/projection.parquet
origin:       caw-01            # the independent product that produced it (file/API boundary)
checksum:     blake3:...        # integrity of the referenced artifact
# payload is NEVER inlined; only referenced by URI (brief §6/§7)
```

### Intake 신호
```yaml
kind: related_work              # or radar_signal
external_ref:  https://...                 # the external work
classification: supports|refutes|neutral   # typed stance vs our claims (not a loose summary)
imported_from:  caw-05                      # radar intake boundary
```

## 5. 범용 타입 지정 edge 모델
모든 관계는 **하나의 범용 `edge`**다 — graph-upgrade-ready(ADR-0002/0003). 파일에서 edge는 *source* 노드의
frontmatter에 타입 지정 link 블록으로 존재하며, reindex가 이를 `edge` 테이블로 투영한다.

```yaml
# inside evd_2026_xxx.md frontmatter
links:
  - rel: evidence_for      # this Evidence backs a Claim
    to:  clm_2026_k7t2qx9m1a
  - rel: extracted_from    # ...and points at a concrete artifact
    to:  sim_2026_9f1d2c
```

```sql
-- derived index (portable SQLite∩Postgres subset)
CREATE TABLE edge (
  src_id  TEXT NOT NULL,
  dst_id  TEXT NOT NULL,
  rel     TEXT NOT NULL,
  created_via TEXT NOT NULL,          -- provenance_event id
  PRIMARY KEY (src_id, dst_id, rel)
);
```

| `rel` | From → To | 의미 |
|---|---|---|
| `evidence_for` | Evidence → Claim | claim을 뒷받침한다. **불변식의 방향.** |
| `challenges` | Evidence → Claim | claim에 반한다(위협/지지를 구동). |
| `extracted_from` | Evidence → Source\|Trace\|SimulationRun\|Experiment | 가리키는 구체적 artifact. |
| `cites` | Note → Claim\|Evidence | synthesis가 근거로 삼는 것을 인용. |
| `derived_from` | Note\|Claim → Source\|Claim | 계보(PROV `wasDerivedFrom`). |
| `about_concept` | Claim\|Source\|Note → Concept | 검색을 위한 주제 인덱싱. |
| `addresses` | Claim\|Evidence → OpenQuestion\|Decision\|Assumption | 발견을 의사결정에 연결. |
| `relates_to` | any → any | 약한 연관. |
| `supports` | RelatedWork\|RadarSignal → Claim | 외부 신호가 입증함. |
| `refutes` | RelatedWork\|RadarSignal → Claim | 외부 신호가 위협함(OpenQuestion 자동 제기). |
| `supersedes` | any vN → any vN-1 | append-only 정정 체인. |
| `attributed_to` | any → Agent | 누가/무엇이 생성했는가. |

**구조적 차단:** 어떤 edge도 `note`를 `evidence_for`/`extracted_from`의 `from`으로 만들 수 없다. 이는
"생성된 synthesis는 evidence가 아니다"의 데이터 모델 형태이며 core link validator가 거부한다.

## 6. Claim→Evidence 불변식 (구조적 형태)
**정의.** `kind=claim` 노드는 다음 조건을 모두 만족할 때만 *유효*하다(즉 `status=accepted`와 `trust > T0`을 가질 수 있다):
1. `evidence` 노드로부터 오는 **≥1개의 `evidence_for` edge**를 가지며, **그리고**
2. 그러한 모든 `evidence` 노드가 구체적 `source|trace|simulation_run|experiment`로의 `extracted_from` edge를
   가진다(또는 resolvable한 `artifact_uri`), **결코** 자유 텍스트로가 아니며 **결코** `note`로가 아니다.

**세 개의 동기화 계층**(ADR-0003)에서 강제되며, API/MCP/CLI 및 SQLite/Postgres에 걸쳐 동일하다:

| 계층 | 위치 | 실패 코드 |
|---|---|---|
| 1. Schema | `attach_evidence`에 산문 필드가 없음; `artifact_uri`가 resolve되어야 함 | `ERR_EVIDENCE_NOT_ARTIFACT` |
| 2. Core validator | pre-commit: ≥1 `evidence_for`; `extracted_from` resolve됨; note-as-evidence 없음 | `ERR_TRUST_WITHOUT_EVIDENCE`, `ERR_NOTE_AS_EVIDENCE` |
| 3. Reindex 재확인 | rebuild가 `knowledge/**`에 대해 불변식을 다시 실행; 큰 소리로 실패 | reindex 중단 |

evidence 없는 Claim은 일급 `needs_evidence`/`T0` 상태이지 결코 숨겨진 오류가 아니다.

## 7. 재구성 가능성 순회(traversal)
```
note --cites--> claim --evidence_for(in)--> evidence --extracted_from--> source|trace|simulation_run|experiment
```
`edge`에 대한 재귀 CTE로, 또는 연결된 파일들에 걸친 git-blame으로 사용 가능하다. 모든 hop은 또한
`created_via` → `provenance_event`를 통해 *누가/무엇이/언제*를 기록한다(see
[versioning-and-events](./versioning-and-events_ko.md)).

## Open Questions
- `TODO(open-question: ID scheme — content-addressed hash vs sequential slug.)`
- `TODO(open-question: claim_type taxonomy sufficiency — owned with ADR-0005.)`
- `TODO(open-question: do we persist rejected Claim candidates as nodes, and under what boundary?)`
- See [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md).

## 런북에 대한 함의
- **RB (schema):** 이 필드들로 `node`/`edge` 테이블 생성; `boundary`/`visibility`는 NOT NULL default-deny.
- **RB (frontmatter validator):** kind별 YAML 스키마 검사; Evidence에 산문 필드 없음; 파일명==`id`.
- **RB (invariant gate):** 부정 테스트(맨몸 Claim, note-as-evidence 둘 다 실패)를 포함한 3계층 강제.
