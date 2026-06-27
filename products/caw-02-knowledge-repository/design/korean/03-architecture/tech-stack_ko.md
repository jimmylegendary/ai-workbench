# Tech Stack — CAW-02 v0를 위한 구체적 선택

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./data-flow_ko.md](./data-flow_ko.md)
  - [./repo-structure_ko.md](./repo-structure_ko.md)
  - [../01-decisions/ADR-0001-product-surface-and-skill-interface_ko.md](../01-decisions/ADR-0001-product-surface-and-skill-interface_ko.md)
  - [../01-decisions/ADR-0002-storage_ko.md](../01-decisions/ADR-0002-storage_ko.md)
  - [../01-decisions/ADR-0006-retrieval_ko.md](../01-decisions/ADR-0006-retrieval_ko.md)
  - [../01-decisions/ADR-0007-import-export-contracts_ko.md](../01-decisions/ADR-0007-import-export-contracts_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF_ko.md

## Purpose
이 문서는 v0에서 ADR들을 실현하는 **구체적이고 의견이 분명한 기술 스택**을 고른다: 언어/런타임, git+markdown
스토리지, SQLite FTS5 index, thin adapter를 위한 codegen 경로, MCP 서버, 그리고 CLI. 각 선택이 왜 digest에
부합하는지를 밝히고 정확한 버전 핀(pin)은 `TODO`로 남긴다. 아키텍처를 다시 결정하지는 않으며(그것은 ADR들이
한다) — 그것을 구현하는 도구를 명명한다. 선택이 진정으로 열려 있는 곳은 `TODO(open-question)`으로 표시한다.

## 스택을 이끄는 제약(digest에서)
1. **하나의 transactional core가 모든 로직을 소유하고; adapter는 thin하며 하나의 op manifest에서 codegen된다**(ADR-0001).
   → core의 언어는 API/MCP/CLI에 걸쳐 하나의 스키마를 공유하기 위해 일급 codegen + 강력한 타입 시스템을 갖춰야 한다.
2. **Markdown-in-git이 source of truth이고; SQLite는 파생되는 폐기 가능 index다**(ADR-0002).
   → 편리한 YAML+markdown 파싱과 FTS5를 갖춘 임베드 가능한 SQL 엔진이 필요하다; v0에는 DB 서버 없음.
3. **하나의 배포 단위, 단일 curator + 소규모 팀 + 소수의 agent**(brief §3, ADR-0002).
   → 서비스보다 in-process, single-binary 지향 배포를 선호한다.
4. **Portable-subset 스키마; Postgres/Apache-AGE는 미래의 교체이지 재작성이 아니다**(ADR-0002).
   → SQL 접근 계층은 SQLite∩Postgres 부분집합을 지켜야 하고 FTS/vector를 droppable 마이그레이션 뒤로 격리해야 한다.
5. **MCP 서버는 agent를 위한 주요 surface다**(brief §4).
   → 유지보수되는 일급 MCP SDK가 있는 언어를 고른다.

## 결정 — 언어 & 런타임
| 후보 | 장점 | 단점 | 적합도 |
|---|---|---|---|
| **TypeScript / Node** | 일급 MCP SDK; 뛰어난 codegen 생태계(zod→JSON-Schema→types); 훌륭한 YAML/markdown 라이브러리; core+adapter+선택적 viewer에 하나의 언어; `better-sqlite3`가 동기적·transactional한 SQLite를 제공 | CPU 부하가 큰 파싱에서 단일 스레드(완화: GROBID는 별도 프로세스) | **선택됨** |
| Go | 단일 정적 바이너리; 강한 동시성 | MCP SDK 성숙도 낮음; codegen이 더 수작업; viewer UI에 무거움 | 강력한 대안; 단일 정적 바이너리가 강한 요구가 되면 재검토 |
| Python | 최고의 ML/embedding 생태계(미래) | manifest→adapter codegen을 위한 컴파일 타임 타입이 약함; 패키징 마찰 | core가 아니라 **parser/extractor 사이드카**에 사용 |
| Rust | 가장 빠르고 안전한 단일 바이너리 | v0에서 이 폭을 구축하기에 가장 느림 | v0 규모에는 과함 |

**선택: Node 위의 TypeScript.** 하나의 언어가 transactional core, 세 개의 codegen된 adapter, 선택적 read-only
viewer를 모두 아우른다; manifest 기반 codegen 스토리가 여기서 가장 강력하다; MCP SDK가 일급이다. LLM 부하가 큰
파싱/추출(GROBID, schema-constrained 추출)은 **별도 프로세스/사이드카**로 실행되어 core의 트랜잭션을 결코 막지
않는다(ADR-0005).

- `TODO(open-question: pin Node LTS — e.g. 20.x vs 22.x; choose at runbook time)`
- `TODO(open-question: package manager + monorepo tool — pnpm workspaces vs npm; pin versions)`

## 결정 — 스토리지: git + markdown (source of truth)
| 관심사 | 선택 | 이유 |
|---|---|---|
| 정본 store | **git repo 내 markdown 파일** | Diff/blame/signed-commit 감사; 제품 재작성을 견딤(ADR-0002) |
| 엔티티별 계약 | **YAML frontmatter + markdown body** | 기계 계약 + 사람 노트를 하나의 diff 가능한 파일에 |
| Frontmatter 파싱 | **`gray-matter`** (front-matter 분리) + **`yaml`** (typed 파싱) | 성숙하고 round-trip에 충분히 무손실; `TODO(open-question: verify key-order/round-trip stability for deterministic reindex)` |
| 스키마 검증 | **`zod`** 스키마 → frontmatter 계약 (3계층 불변식의 layer 1) | 같은 스키마가 codegen + 런타임 검증을 함께 공급 |
| 이벤트 원장 | **append-only JSONL** `knowledge/_events/<ts>-<op>.jsonl` | 모든 쓰기를 미러링; 저렴하고 grep 가능하며 replay 가능 |
| git 접근 | core가 호출하는 **`git` CLI** (signed commits) | v0에서 libgit2 바인딩 불필요; `TODO(open-question: commit-signing key management for agents vs humans)` |

파일 위에 ORM은 없다: **파일이 곧 모델**이다; SQLite index는 그것들로부터 재구축된다.

## 결정 — 파생 index: SQLite + FTS5
| 관심사 | 선택 | 이유 |
|---|---|---|
| 엔진 | **`better-sqlite3`** 를 통한 **SQLite (embedded)** | 동기적·transactional·단일 파일; 서버 없음; 하나의 배포 단위(ADR-0002, ADR-0006) |
| 핵심 테이블 | `node`, `edge`, `event` (portable subset: `TEXT/INTEGER/TIMESTAMP`, FK, CHECK) | 그래프 업그레이드 대비; Postgres로 변경 없이 포팅(ADR-0002 §3) |
| Full-text | **별도의 droppable 마이그레이션** 내 **FTS5 (BM25)** | 키워드/전문용어 recall; 결정론적·검사 가능; SQL boundary-filter 가능(ADR-0006) |
| Vectors | **예약된 nullable `node_vec` 사이드카; v0에서는 미사용** | 측정된 트리거가 있을 때만 `sqlite-vec` 추가(ADR-0006) |
| Migrations | 단순 번호 매김 SQL 파일 + 작은 runner | FTS/vector 격리로 portability가 결코 위협받지 않음 |
| Portability lint | 인수 검사로서의 **portable-subset SQL lint** | core 스키마를 SQLite∩Postgres 안에 유지 |

- index는 **폐기 가능하다**: `reindex`가 그것을 결정론적으로 drop하고 재구축한다; `content_hash` 불일치 ⇒ 오래됨 ⇒ 재구축.
- `TODO(open-question: pin better-sqlite3 + bundled SQLite version; confirm FTS5 compiled in the distributed build)`
- `TODO(open-question: sqlite-vec vs pgvector when the embeddings trigger fires — deferred, ADR-0006)`

## 결정 — 하나의 op manifest → codegen된 thin adapter
core는 단일 **op manifest** (`kr.*` 연산들: `add_source`, `extract_claims`, `attach_evidence`,
`synthesize_note`, `classify_signal`, `search`, `import_projection`, `export_bundle`, …)를 노출한다. 각 op는
한 번 정의된다(input/output `zod` 스키마 + 메타데이터). Adapter는 **생성되며** 어떤 로직도 더하지 않는다(ADR-0001).

```
                 op-manifest (zod schemas + op metadata, single source)
                 ┌──────────────┬───────────────┬──────────────────┐
                 ▼              ▼               ▼                  ▼
            JSON Schema    OpenAPI/types     MCP tool defs      CLI commands
                 │              │               │                  │
                 ▼              ▼               ▼                  ▼
            (validation)   API adapter      MCP adapter        CLI adapter
                            (thin)            (thin)             (thin)
                 └──────────────┴───────────────┴──────────────────┘
                                  all call → CORE op (single transaction)
```

| 관심사 | 선택 | 이유 |
|---|---|---|
| Op 스키마 | **`zod`** | 하나의 스키마 → 런타임 검증 + 하위 모든 것을 위한 `zod-to-json-schema` |
| JSON Schema | **`zod-to-json-schema`** | MCP tool defs, API 문서, manifest export를 공급 |
| Codegen | manifest 위의 작은 in-repo 생성기 | Adapter는 아무것도 더하지 않음; 손으로 편집하지 않고 재생성(ADR-0001) |
| `TODO` | `TODO(open-question: generate OpenAPI from zod vs hand-keep a thin spec; pin tooling)` |

## 결정 — surface
| Surface | 도구 | 이유 / 비고 |
|---|---|---|
| **MCP server** | **`@modelcontextprotocol/sdk`** (TS, 일급) | 주요 agent surface; manifest에서 tool 생성; 쓰기는 기본 확인(confirmation-by-default)(ADR-0001) |
| **API** | **최소 프레임워크를 통한 HTTP** (`TODO(open-question: Fastify vs Hono vs bare node:http)`) | Typed adapter; thin; 동일 ops |
| **CLI** | **`commander`** (혹은 `clipanion`) — `TODO(open-question: pin)` | 사람 + 스크립트 surface; 동일 ops; `reindex`, import/export, 감사에 적합 |
| **Viewer (선택, read-only)** | `search()` 위의 정적 렌더 또는 작은 SPA | Source/Claim/Evidence/Note + 링크 + trust 탐색; 풍부한 편집은 비목표(brief §4, §9) |

## 결정 — ingestion 사이드카 도구
| 단계 | 도구 | 이유 |
|---|---|---|
| PDF 파싱 | **GROBID** (PDF→TEI), 깨진 PDF에는 LLM fallback | 결정론적·재실행 가능; locator가 재파싱을 견딤(ADR-0005) |
| Article 파싱 | readability → markdown | 안정적 `block_id`/`char_span`를 가진 구조화 블록 |
| Claim 추출 | **schema-constrained LLM** (JSON emit; 필수 `supporting_block_ids`) | 스키마 계층에서 no-provenance 케이스를 차단(ADR-0005) |
| Hashing | `sha256` (node:crypto) | Source dedup + idempotency key |

추출/합성을 위한 LLM/provider 선택은 의도적으로 사이드카 뒤로 추상화되며
`TODO(open-question: extraction/synthesis model + provider; must honor confidential-boundary locality — see ADR-0006)`
이다. CAW-02 자체가 추출/합성을 위해 Anthropic 모델을 호출할 때는 공식 SDK와 현재 model id로 핀하라(여기에
하드코딩하지 말고 빌드 시점에 claude-api 레퍼런스를 참조하라).

## 제품 간 경계 (공유 substrate 없음)
Import/export는 CAW-02의 **자체** boundary 스키마로 검증되는 **versioned JSON 봉투(envelope) + JSONL**을
사용한다(ADR-0007). CAW-01/03/05는 별개의 독립 제품으로 오직 파일/API 경계를 통해서만 접근된다 — 공유 DB,
registry, queue, runtime은 없다. 번들 서명: `TODO(open-question: minisign vs cosign vs DSSE — ADR-0007)`.

## 배포 형태
- **하나의 배포 단위:** TS core + adapter를 하나의 패키지로; 그 옆에 지식 **repo (git)**; `reindex`로 재구축되는
  로컬 **`index.sqlite`** 하나. GROBID는 ingestion 전용 선택적 동반 프로세스로 실행된다.
- v0에는 서버 데이터베이스 없음. Postgres (+ 선택적 Apache AGE)는 동시 writer / index 경합에 게이트된 **미래의
  교체**다(ADR-0002 revisit triggers) — 동일 portable 스키마이며 데이터 재작성이 아니다.

## 버전 핀 체크리스트 (모두 `TODO`, runbook 시점에 설정)
- `TODO(open-question: Node LTS)` · `TODO(open-question: pnpm/npm)` · `TODO(open-question: typescript)`
- `TODO(open-question: better-sqlite3 + bundled SQLite/FTS5)` · `TODO(open-question: zod + zod-to-json-schema)`
- `TODO(open-question: @modelcontextprotocol/sdk)` · `TODO(open-question: HTTP framework)` · `TODO(open-question: CLI lib)`
- `TODO(open-question: GROBID image/version)` · `TODO(open-question: gray-matter + yaml)` · `TODO(open-question: signing tool)`

## Open Questions
- `TODO(open-question: single static binary requirement — if it appears, revisit Go for the core)`
- `TODO(open-question: viewer rendering approach — static export vs minimal SPA)`
- See [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md).

## runbook에 대한 함의
- **scaffold RB**는 위 버전들을 핀하고 워크스페이스를 세운다(core + adapter + manifest codegen).
- **schema/migrations RB**는 portable-subset 핵심 테이블 + FTS5(droppable) + 예약된 `node_vec`를 구축하며,
  portable-SQL lint를 인수 검사로 둔다.
- **codegen RB**는 op manifest를 API/MCP/CLI adapter로 변환한다(손으로 편집하지 말고 재생성).
- **ingestion-sidecar RB**는 GROBID + schema-constrained extractor를 별도 프로세스로 연결한다.
