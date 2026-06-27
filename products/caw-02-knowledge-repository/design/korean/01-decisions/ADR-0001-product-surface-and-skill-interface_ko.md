# ADR-0001: 제품 표면(surface)과 에이전트 스킬 인터페이스

- **Status:** proposed
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [../_meta/PRODUCT-BRIEF_ko.md](../_meta/PRODUCT-BRIEF_ko.md) (단일 진실 공급원)
  - [../02-research/agent-skill-interface-and-mcp_ko.md](../02-research/agent-skill-interface-and-mcp_ko.md)
  - [../02-research/retrieval-and-rag_ko.md](../02-research/retrieval-and-rag_ko.md)
  - [ADR-0002-storage_ko.md](ADR-0002-storage_ko.md) (계획됨)
  - [ADR-0003-knowledge-data-model_ko.md](ADR-0003-knowledge-data-model_ko.md)
  - [ADR-0004-provenance-and-trust_ko.md](ADR-0004-provenance-and-trust_ko.md) (계획됨)
  - [ADR-0005-ingestion-pipeline_ko.md](ADR-0005-ingestion-pipeline_ko.md)
  - [ADR-0006-import-export-contracts_ko.md](ADR-0006-import-export-contracts_ko.md) (계획됨)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적
사람, AI 에이전트, 그리고 (독립적인) 다른 제품이 CAW-02와 상호작용하는 **표면(surface)** 들을 결정하고,
**에이전트 스킬 인터페이스**("skill-wrap")의 형태를 정한다. 이 ADR은 다음을 고정한다: v0에 어떤 표면이 존재하는지,
모든 표면이 **하나의 제품 코어** 위에 얇게 덮인 어댑터라는 규칙, 그리고 에이전트가 provenance(출처 이력)를
훼손하지 않으면서 검증된 지식 트랜잭션을 수행하는 방식. 이 ADR은 저장 레이아웃(ADR-0002), 데이터 모델(ADR-0003),
provenance 및 trust(신뢰) 어휘(ADR-0004), 수집(ingestion) 메커니즘(ADR-0005), import/export 와이어 포맷(ADR-0006)을
결정하지 **않는다**. 이들은 안정적인 코어 경계(boundary)로서 소비할 뿐이다.

## 배경
- 브리프(§4)는 주요 표면으로 타입이 명시된 **API**, **MCP 서버**, **CLI**를 지목하며, 부차적 표면으로 선택적인
  **읽기 전용 뷰어**를 든다. 풍부한 편집 UI는 v1에서 명시적 비목표(non-goal)이다(§9).
- 이 제품이 존재하는 이유 전체(§2, §5, §10)는 **provenance 무결성**이다: source, claim, evidence, 그리고
  생성된 합성물(synthesis)이 서로 구분된 채로 유지되며, **생성된 요약은 결코 evidence가 아니다**. 각 표면이
  규칙을 따로 재구현하면 서로 어긋나고(drift), 하나의 약한 표면이 누수 지점이 된다.
- 페르소나(§3)에는 지식을 추가/갱신하는 **AI 에이전트**가 포함된다. 에이전트는 가장 위험도가 높은 작성자이며 —
  유창한 텍스트를 대량으로 생산할 수 있으므로 — 그들이 사용하는 인터페이스는 훼손을 단순히 권장하지 않는 수준이
  아니라 구조적으로 어렵게 만들어야 한다.
- v0 범위("성숙도 주의"(maturity caution)) = **append + retrieve + skill-wrap**. 지속 학습(continual learning)도,
  지식의 자율적 자체 편집도 없다.
- 독립성(§1): CAW-02는 자체 코어, 데이터, 배포를 갖는다. CAW-01/05/03은 import/export 경계(ADR-0006)를 통해서만
  닿는 별개 제품이다. 공유 런타임 기반은 없다.

## 검토된 선택지

### A. 표면 아키텍처
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **하나의 코어, 세 개의 얇은 어댑터(API/MCP/CLI) + 읽기 전용 뷰어** | 단일 병목 지점이 불변식(invariant)을 강제; 표면들이 어긋날 수 없음; 에이전트/스크립트/제품이 증명 가능하게 동등 | op-manifest + 코드 생성(codegen) 규율이 필요 | **선택됨** |
| 표면별 독립 구현 | 각 표면을 고립된 채로 빠르게 출시 가능 | 규칙 어긋남 보장; 가장 약한 표면 = 누수 벡터; §10 위배 | 기각됨 |
| 단일 표면(API만), 나머지는 추후 | 최소 v0 | 브리프 §4는 v0에 MCP(에이전트) + CLI(사람/스크립트)를 명시적으로 원함; 에이전트는 주요 페르소나 | 기각됨 |

### B. 에이전트 인터페이스 방식
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **검증된 트랜잭션 도구**(add_source, extract_claims, attach_evidence, synthesize_note, classify_signal, …) | 각 도구가 하나의 불변식을 운반; provenance를 서버 측에서 강제; 산문(prose)을 evidence로 쓰는 경로 없음 | 정의할 도구가 더 많음 | **선택됨** |
| 범용 CRUD 도구(행(row) create/update/delete) | 도구가 적음 | 불변식을 호출자에게 누출; 에이전트가 Evidence 없는 Claim이나 Note를 Evidence로 작성 가능 | 기각됨 |
| 자유 형식 NL "이거 기억해줘" 도구 | 에이전트에게 쉬움 | 제품의 본질인 타입 명시된 provenance 체인을 파괴 | 기각됨 |

### C. 가변성(Mutability)
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **append-only 지식 + 정정용 `supersedes`** | 재구성 가능(§5); 감사 친화적; 에이전트에게 안전 | 독자가 "최신" 버전을 해소(resolve)해야 함 | **선택됨** |
| 제자리(in-place) update/delete | 읽기가 단순 | 재구성 가능성 파괴; 감사 불가; 에이전트 손상 되돌리기 불가 | 기각됨 |

## 결정
1. **모든 표면 뒤에 하나의 제품 코어.** 단일 트랜잭션 코어 서비스가 모든 비즈니스 로직을 소유한다:
   검증, **evidence gate**(ADR-0004 §2.3), trust 재계산, boundary 전파, 그리고 append-only 감사(audit).
   **API, MCP, CLI는 얇은 어댑터**로서 전송(transport) ↔ 코어의 타입 명시된 연산을 변환할 뿐 그 외에는
   아무것도 더하지 않는다.

   ```
   agent ──MCP──┐
   human ──CLI──┼──▶ skill-wrap (schema + guardrails) ──▶ core txn ──▶ store + append-only audit
   CAW-0x ─API──┘                   (single chokepoint)
   ```

2. **v0에 출시되는 표면:**
   - **타입 명시된 API** — 다른 제품(CAW-01/05/03)과 프로그래밍 방식 호출자를 위함. 연산당 하나의 라우트
     (`POST /v1/sources`, …).
   - **MCP 서버** — 에이전트 skill-wrap. 검증된 트랜잭션당 하나의 MCP 도구.
   - **CLI** — Jimmy와 스크립트를 위함. 연산당 하나의 서브커맨드(`kr add-source`, `kr attach-evidence`, …).
   - **읽기 전용 뷰어(선택적, 부차적)** — Source/Claim/Evidence/Note와 그 링크를 탐색; trust와
     boundary 배지를 렌더링; **쓰기 경로 없음**. 풍부한 편집 UI는 비목표(브리프 §9).

3. **동등성(parity)은 수동이 아니라 구조적이다.** 모든 연산은 **하나의 op manifest**에 선언된다(도구 이름,
   JSON Schema, 멱등성 키(idempotency key), 읽기/쓰기 종류, MCP 어노테이션). 세 개의 쓰기 표면과 그들이
   공유하는 검증 스키마는 **그 manifest로부터 생성된다**. 계약 테스트(contract test)가 세 표면이 동일한
   스키마로 동일한 연산 집합을 노출함을 단언한다. 연산 추가 = manifest 편집.

4. **MCP 도구 카탈로그(스킬 인터페이스)** 는 브리프의 가치 단위에 더해 retrieval과 신호 수집을 반영한다
   (상세 내용과 스키마는 [skill-interface 연구](../02-research/agent-skill-interface-and-mcp_ko.md) §2 참조):
   `kr.add_source`, `kr.extract_claims`, `kr.attach_evidence`, `kr.synthesize_note`, `kr.classify_signal`,
   `kr.record_decision`, `kr.link`, `kr.import_projection`(쓰기); `kr.search`, `kr.get`, `kr.export_bundle`,
   `kr.verify_audit`(읽기). 각 쓰기 도구는 범용 행 쓰기가 아니라 **검증된 트랜잭션**이다.

5. **Guardrail은 코어에 둔다** 그래야 MCP/CLI/API 전반에서 동일하게 유지된다. 핵심적인(load-bearing) 것들:
   - **생성된 텍스트는 결코 Evidence가 아니다.** `kr.attach_evidence`에는 **산문/요약 필드가 없다**; 그
     `artifact_ref`는 기존의 `Source/Trace/SimulationRun/Experiment` 또는 `file_uri`로 해소되어야 한다.
     `Note`를 evidence로 첨부하는 것은 거부된다.(브리프 §5/§10 강제; ADR-0003 불변식, ADR-0005 A3 참조.)
   - **Append-only.** `update`/`delete` 도구는 존재하지 않는다; 정정은 `supersedes`로 연결된 새 버전이다.
   - **쓰기로 boundary가 절대 강등되지 않는다**; export는 공개 안전(public-safe)한 것만(ADR-0004 §3, ADR-0006).
   - **에이전트의 쓰기는 기본적으로 확인 필수(confirmation-required)**; 읽기(`kr.search/get/export_bundle/verify_audit`)는
     `readOnlyHint:true`이며 자동 실행될 수 있다.

6. **어디서나 타입 명시된 봉투(envelope).** 모든 연산은 `{ ok, result?, error?, txn_id, audit_id }`를 반환한다.
   CLI의 `--json`과 API는 동일한 봉투를 반환한다; CLI는 기본값으로 사람용 테이블도 렌더링한다. `txn_id`는
   재시도 안전성을 위해 호출자의 `idempotency_key`를 그대로 반향(echo)한다.

7. **Retrieval 표면은 blob이 아니라 provenance를 반환한다.** `kr.search`/`kr.get`은 구조화된 `RetrievalHit`
   봉투(항목 + 수화(hydrate)된 `Source→Claim→Evidence→Note` 체인 + trust + boundary)를 반환한다
   ([retrieval 연구](../02-research/retrieval-and-rag_ko.md) 참조). 생성/RAG는 이미 신뢰 가능한 결과 집합 위에
   덧붙는 **opt-in** 레이어이다; 합성된 답변은 인용 제약(citation-constrained)을 받으며, 보관한다면 인용된
   `Note`로 저장된다(결코 `Evidence`로 저장하지 않는다).

## 결과
**쉬운 점:**
- provenance 무결성이 정확히 한 곳에서 강제된다; 새 표면은 모든 guardrail을 공짜로 상속한다.
- 에이전트의 기여는 감사 가능하며 기록으로 되돌릴 수 있다(append-only + 해시 체인된 감사).
- 다른 제품은 CAW-02 내부를 건드리지 않고 안정적인 타입 명시 API로 통합한다(독립성 보존).

**어려운 점 / 후속 작업:**
- 광범위한 표면 작업 **이전에** op-manifest + codegen + 동등성 계약 테스트를 구축해야 한다(아니면 어긋남이 돌아온다).
- 읽기 전용 뷰어는 boundary/trust 렌더링이 정확해야 한다, 아니면 미묘한 누수 표면이 된다;
  다른 모든 독자와 동일한 boundary 필터링된 읽기 경로를 소비해야 한다.
- v0는 **키워드/FTS retrieval만** 출시한다; 의미(semantic)/벡터 검색은 ADR-0007로 연기된다(동일한
  `kr.search` 뒤에 가산적으로 추가).
- 에이전트 쓰기에 대한 확인 정책은 구체적인 입도(granularity)가 필요하다(도구별 / boundary별 / 행위자별) —
  아래 미해결 질문.

**빌드 순서 함의(런북용):** 코어 txn + 감사 + guardrail 먼저; 그다음 op-manifest + MCP/CLI/API 코드 생성;
그다음 확인 게이트가 있는 MCP 서버; 읽기 전용 뷰어는 마지막에 읽기 전용으로.

## 미해결 질문 / 재검토 트리거
- `TODO(open-question: confirmation policy granularity for agent writes — per-tool vs per-boundary vs per-actor allow-lists; owned with ADR-0004.)`
- `TODO(open-question: API auth model for other independent products — static token vs mTLS vs signed-URL drop; aligns with ADR-0006.)`
- `TODO(open-question: should the viewer ever gain a thin "propose" path for humans, or stay strictly read-only in v1? Brief §9 says read-only for now.)`
- ADR-0007의 임베딩 트리거(A–D)가 발동하면 FTS-only retrieval 결정을 **재검토**한다.
- [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md) 참조.

## 런북에 대한 함의
- **RB (core txn + audit):** `data-change + 해시 체인된 감사 append`를 갖춘 단일 트랜잭션 코어; guardrail
  G1–G8(skill-interface 연구 §5 참조)을 어떤 표면보다도 먼저 단위 테스트된 불변식으로.
- **RB (op manifest + codegen):** 하나의 manifest → MCP 도구, CLI 서브커맨드, API 라우트, 공유 JSON Schema;
  동등성 계약 테스트.
- **RB (MCP server):** §4 카탈로그를 어노테이션과 함께 노출; 확인 게이트 구현; `kr.verify_audit` 추가.
- **RB (CLI):** 도구별 서브커맨드; `--json`, `--idempotency-key`, `--yes`; 동일한 봉투 출력.
- **RB (viewer):** boundary 필터링된 읽기 경로 위에서 읽기 전용 탐색; Claim/Evidence/Note를 trust +
  boundary 배지와 함께 구별되게 렌더링.
- **RB (negative tests):** 생성된 note를 evidence로 첨부하는 것이 MCP, CLI, API 전반에서 실패함을 단언.
