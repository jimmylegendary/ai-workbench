# Open Questions — 추적 레지스터

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: review date — do not invent)
- **Related:**
  - [research-plan.md](research-plan_ko.md)
  - [validation-and-tests.md](validation-and-tests_ko.md)
  - [../01-decisions/](../01-decisions/)의 모든 ADR
  - [../02-research/](../02-research/)의 모든 연구 노트
- **Source of truth:** ../_meta/PRODUCT-BRIEF_ko.md

## 목적

이 문서는 CAW-02 설계 세트(7개의 ADR 전체 + 6개의 연구 노트 전체)에서 제기된 모든 open question을
**단일하게 집계한 레지스터**이며, 중복이 제거되고 추적된다. 각 행에는 안정적인 `OQ-id`,
질문, 이를 소유하는 ADR/문서, **resolve-by**(해결 목표 — phase 또는 해당 항목을 소유하는 연구 트랙),
그리고 status가 있다. ADR과 연구 노트는 서로 어긋나는 목록을 유지하는 대신 *이곳*을 링크한다. 이
문서가 "무엇이 아직 결정되지 않았는가"에 대한 source of truth이다. 결정을 다시 논쟁하지는 않으며 —
맥락은 해당 ADR을 참조하라. Phase(P0/P1/P2)와 연구 트랙(R1–R8)은
[research-plan.md](research-plan_ko.md)에 정의되어 있다.

## Status 범례

| Status | 의미 |
| --- | --- |
| `open` | 미해결; 결정 또는 측정이 필요하다. |
| `deferred` | 명명된 revisit 트리거 뒤로 의도적으로 미룬 상태(지금은 블로킹 아님). |
| `partial` | 방향은 ADR로 고정되었으나 하위 세부사항이 남아 있다. |
| `resolved` | 종료됨; 소유 ADR이 업데이트됨(완료 시 여기서 취소선 처리). |

## 레지스터

| OQ-id | 질문 | 소유 ADR / 문서 | Resolve-by | Track | Status |
| --- | --- | --- | --- | --- | --- |
| OQ-01 | **ID 스킴** — content-addressed hash vs sequential/typed slug (안정적 링크 vs dedup vs 변조 증거). | ADR-0002, ADR-0003, [storage-options](../02-research/knowledge-store-storage-options_ko.md) | P0 | R1 | open |
| OQ-02 | **claim_type 분류 체계** — `{empirical, methodological, definitional, comparative, normative}`로 충분한가? | ADR-0003, ADR-0005, [ingestion](../02-research/ingestion-and-extraction_ko.md) | P0 | — | open |
| OQ-03 | 감사/학습을 위해 **거부된 ClaimCandidate를 노드로 영속화**할 것인가, 그렇다면 어떤 boundary 하에서인가? | ADR-0003, ADR-0005, [ingestion](../02-research/ingestion-and-extraction_ko.md) | P0 | — | open |
| OQ-04 | **T2 corroboration을 위한 "independent source"**가 기계적으로 판정 가능한가, 아니면 휴리스틱/사람 판단인가(위험: 공유 상류로 인한 거짓 corroboration)? | ADR-0003, ADR-0004, [provenance](../02-research/provenance-and-trust-models_ko.md) | P1 | — | open |
| OQ-05 | **팀 쓰기 동시성** — git PR/merge vs write-through API를 통한 직렬화; Postgres 포트를 강제하는 정확한 지표. | ADR-0002, [storage-options](../02-research/knowledge-store-storage-options_ko.md) | P0 (모델) / P2 (포트) | R3, R4 | open |
| OQ-06 | 파일이 skill 인터페이스 외부에서 편집될 경우 **`_events` JSONL과 git history가 어떻게 정합되는가**? | ADR-0002, [storage-options](../02-research/knowledge-store-storage-options_ko.md) | P0 | R1 | open |
| OQ-07 | **Semantic dedup cosine 임계값 + embedding model** — 실제 claim 위에서 도메인 튜닝. | ADR-0005, [ingestion](../02-research/ingestion-and-extraction_ko.md) | P2 | R2 | deferred |
| OQ-08 | 에이전트가 **특정 클래스의 claim을 자동 수락**할 수 있는가(예: 고신뢰 public), 아니면 v0에서는 모든 항목에 사람 검토가 필수인가? | ADR-0005, [skill-interface](../02-research/agent-skill-interface-and-mcp_ko.md), [ingestion](../02-research/ingestion-and-extraction_ko.md) | P0 | — | open |
| OQ-09 | source가 더 새로운 파서로 재파싱될 때의 **span 안정성** — 재매핑 vs 재추출. | ADR-0005, [ingestion](../02-research/ingestion-and-extraction_ko.md) | P1 | — | open |
| OQ-10 | **CAW-05의 분류**를 어디까지 그대로 신뢰하고, 어디까지 인테이크 시 재분류할 것인가(stage B3)? | ADR-0005, [ingestion](../02-research/ingestion-and-extraction_ko.md), [import-export](../02-research/import-export-boundaries_ko.md) | P1 | R6 | open |
| OQ-11 | 에이전트 쓰기에 대한 **confirmation-policy 세분성** — per-tool vs per-boundary vs per-actor allow-list. | ADR-0001, ADR-0004, [skill-interface](../02-research/agent-skill-interface-and-mcp_ko.md) | P0 | — | open |
| OQ-12 | **제품 간 API 인증** — static token vs mTLS vs signed-URL drop. | ADR-0001, ADR-0007, [import-export](../02-research/import-export-boundaries_ko.md) | P1 | R8 | open |
| OQ-13 | **viewer**가 언젠가 얇은 사람용 "propose" 경로를 가져야 하는가, 아니면 v1에서 엄격히 read-only로 유지하는가(brief §9 = read-only)? | ADR-0001 | P2 | — | deferred |
| OQ-14 | **재분류 / 기밀 해제 워크플로** — Jimmy 외에 누가 등급을 낮출 수 있으며, 어떤 감사가 필요한가? | ADR-0004, [provenance](../02-research/provenance-and-trust-models_ko.md) | P1 | — | open |
| OQ-15 | **provenance 이벤트의 변조 증거** — v0에서 hash chain / content addressing을 둘 것인가, 나중에 업그레이드할 것인가? | ADR-0004, [provenance](../02-research/provenance-and-trust-models_ko.md) | P0 (경량) / P2 (전체) | R7 | open |
| OQ-16 | CAW-01/05/03 boundary 전반에 공유되는 정확한 **provenance-manifest 필드**. | ADR-0004, ADR-0007, [provenance](../02-research/provenance-and-trust-models_ko.md) | P1 | R6 | open |
| OQ-17 | export bundle를 위한 **서명 스킴** — minisign vs cosign vs DSSE vs detached sig. | ADR-0007, [import-export](../02-research/import-export-boundaries_ko.md) | P1 | R6 | open |
| OQ-18 | **CAW-01/05가 우리의 envelope를 네이티브로 방출**하는가, 아니면 CAW-02가 얇은 래핑 어댑터를 제공하는가? | ADR-0007, [import-export](../02-research/import-export-boundaries_ko.md) | P1 | R6 | open |
| OQ-19 | **codename/fab/customer redaction regex**가 어디에 위치하며, **공유 의존성 없이** 어떻게 동기 상태를 유지하는가. | ADR-0007, ADR-0004, [import-export](../02-research/import-export-boundaries_ko.md) | P1 | R5 | open |
| OQ-20 | CAW-05에서 가져온 Source의 **Dedup authority** — DOI vs arXiv vs S2 id 우선순위. | ADR-0007, [import-export](../02-research/import-export-boundaries_ko.md) | P1 | R6 | open |
| OQ-21 | 라이브 핸들 없이 **`producer_run_id` traceability 존중** — 감사용으로 불투명한 breadcrumb로 충분한가? | ADR-0007, [import-export](../02-research/import-export-boundaries_ko.md) | P1 | — | open |
| OQ-22 | **Embedding model 및 로컬리티** — local vs API; API embedding이 confidential boundary를 위반하는가(기밀의 경우 local-only일 가능성 높음)? | ADR-0006, [retrieval](../02-research/retrieval-and-rag_ko.md) | P2 | R2 | deferred |
| OQ-23 | model 업그레이드 / 편집된 항목에 대한 **re-embedding 정책** — 오래된 벡터나 깨진 provenance 없이. | ADR-0006, [retrieval](../02-research/retrieval-and-rag_ko.md) | P2 | R2 | deferred |
| OQ-24 | **Grounding-check 엔진** — v0 또는 v1에서 자동 claim-entailment; LLM 비용/boundary 함의. | ADR-0006, [retrieval](../02-research/retrieval-and-rag_ko.md) | P1 | — | open |
| OQ-25 | **Chunking 단위** — `Claim`/`Note` 행 전체 vs 긴 source의 하위 청킹; anchor/locator를 어떻게 저장하는가. | ADR-0006, [retrieval](../02-research/retrieval-and-rag_ko.md) | P1 | — | open |
| OQ-26 | embedding을 늦추기 위한 **Synonym/concept 태깅** 투자("가난뱅이의 시맨틱"). | ADR-0006, [retrieval](../02-research/retrieval-and-rag_ko.md) | P1 | — | open |
| OQ-27 | FTS-only 대비 **언제 벡터를 도입할 것인가** — 측정된 트리거(recall/precision A–D). | ADR-0006 | P2 | R2 | deferred |
| OQ-28 | T0–T3/contested 전환에 대한 정확한 **trust-ladder 값 + evidence-count 임계값**. | ADR-0004, [skill-interface](../02-research/agent-skill-interface-and-mcp_ko.md) | P0 | — | partial |
| OQ-29 | `synthesize_note`가 **새 Claim을 제안**하도록 허용해야 하는가, 아니면 기존 것만 인용해야 하는가(proposal queue로 Jimmy를 리뷰어로 유지)? | [skill-interface](../02-research/agent-skill-interface-and-mcp_ko.md), ADR-0005 | P0 | — | open |
| OQ-30 | **감사 보존 + confidential 필드 암호화/삭제** 모델. | [skill-interface](../02-research/agent-skill-interface-and-mcp_ko.md), ADR-0002 | P1 | — | open |
| OQ-31 | `import_projection`이 공유 substrate 없이 **CAW-01 export가 진정으로 artifact-backed인지**(사전 요약된 blob이 아님) 어떻게 검증하는가. | [skill-interface](../02-research/agent-skill-interface-and-mcp_ko.md), ADR-0007 | P1 | R6 | open |
| OQ-32 | **Idempotency-key 보존 윈도우**(30d 자리표시자는 검증되지 않음). | [skill-interface](../02-research/agent-skill-interface-and-mcp_ko.md) | P0 | — | open |
| OQ-33 | **Edge 저장** — SQLite의 인접 행 vs md frontmatter에 내장된 링크(evidence gate + propagation 계산 방식에 영향). | ADR-0002, ADR-0003, [provenance](../02-research/provenance-and-trust-models_ko.md) | P0 | R1 | partial |
| OQ-34 | artifact store가 public 배포에서 도달 불가능할 때 **confidential CAW-01 projection을 어떻게 참조하는가** — URI 스킴 + 접근 중재. | ADR-0004, [provenance](../02-research/provenance-and-trust-models_ko.md) | P1 | R5 | open |
| OQ-35 | 세 개의 lockstep 레이어를 넘어 **Claim→Evidence "≥1" 불변식이 어디서 강제되는가** — Postgres로 전환되면 DB trigger도 추가하는가? | ADR-0003, [storage-options](../02-research/knowledge-store-storage-options_ko.md) | P0 / P2 | R4 | partial |

## 중복 제거에 관한 노트

- **OQ-01 / OQ-33**은 구별되지만 결합되어 있다(R1): edge가 ID를 참조하므로 ID 스킴과 edge-storage
  선택은 함께 결정된다.
- **OQ-05**는 "팀 동시성"의 storage 및 write-path 측면을 흡수한다. 이는 **명명된 Postgres-port
  트리거**이다(R3가 v0 모델을 선택하고, R4가 포트 임계값을 소유한다).
- **OQ-07 / OQ-22 / OQ-23 / OQ-27**은 모두 ingestion(dedup)과 retrieval(recall, re-embedding,
  로컬리티) 관점에서 본 *embedding* 질문이다. 모두 ADR-0006의 측정된 트리거 뒤로 `deferred`되어 있고
  R2 하에서 추적된다. 측정 전에는 어느 것도 하드코딩된 숫자를 출하하지 않는다.
- **OQ-16 / OQ-17 / OQ-18 / OQ-20**은 *boundary-envelope* 클러스터로, ADR-0007과 연구 R6가
  소유한다.
- **OQ-28**은 `partial`이다: ADR-0004가 ladder 형태(T0–T3 + contested, AI는 T2로 상한)를 고정하며,
  정확한 evidence-count 임계값만 남아 있다.
- **OQ-35**는 `partial`이다: ADR-0003이 이미 세 개의 lockstep 강제 레이어를 고정한다. 열린 부분은
  포트 이후 *네 번째* 안전장치 검사로 Postgres DB trigger를 추가할지 여부뿐이다.

## 런북에 대한 함의

- 런북은 코드에서 값을 골라 `open`/`partial` OQ를 조용히 해결해서는 안 된다. 이제 `resolved`된 여기의
  행을 참조하거나(소유 ADR이 업데이트된 채로) `TODO(open-question)` 마커를 앞으로 가져가야 한다.
- `deferred` 행은 트리거 게이트로 유지되어야 한다 — 어떤 런북도 추측으로 구현하지 않는다(DOC-CONVENTIONS
  + ADR-0006의 측정된-트리거 규율).
- 질문이 종료되면 여기서 해당 행을 `resolved`로 취소선 처리하고 **동시에** 같은 변경에서 소유 ADR의
  Open-Questions 섹션을 업데이트한다.
