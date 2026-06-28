# Novelty, Prior-Art & Venue (신규성, 선행 기술, 발표처)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF_ko.md), [../01-decisions/](../01-decisions/) (ADR: ports & adapters — TODO; ADR: paper-ladder & novelty governance — TODO; ADR: patent module — TODO), [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적
이 문서는 CAW-03(Paper & Patent **harness**)이 **novelty(신규성)와 prior-art(선행 기술)**를 어떻게 거버넌스하는지
결정한다: claim이 *novel*인지 vs *threatened*인지 vs **patent-first** 처리가 필요한지 어떻게 감지하는가, **CAW-05**
radar(별도 제품)를 단일 **Novelty/Radar port**를 통해 어떻게 소비하는가, 그리고 venue-fit(발표처 적합성)을 어떻게
평가하는가. 세 가지 아티팩트를 산출한다: (1) **novelty / claim-boundary 정책**, (2) **P1/P2/P3 ladder 거버넌스**
(claim 타이핑 + 논문 순서 + patent-first 게이트), (3) v1 adapter와 미래 adapter용 문서화된 stub을 갖춘
**Novelty/Radar port 표면**(인터페이스 + capability descriptor + 스키마). 이 문서는 PaperOrchestra의
literature-review agent를 재구축하지 **않으며**(그 engine은 여전히 인용을 발견 + 검증한다), claim 원장을
재소유하지 않으며(CAW-02에서 import), live prior-art 커넥터를 구현하지 않는다(v1에서는 port + stub만).

## 범위 경계: engine vs harness vs radar
"related work(관련 연구)"에 닿는 것은 세 가지로 서로 다르며, 이들을 혼동하는 것이 주된 설계 위험이다.

| 관심사 | 소유자 | 산출물 |
|---|---|---|
| draft를 위한 **인용 발견 + 검증** | PaperOrchestra `literature-review-agent` (WritingEngine, Semantic Scholar로 검증) | BibTeX + Intro/Related Work 산문 |
| 분야 전반의 **트렌드 / 위협 radar** (지속적) | **CAW-05** (별도 제품) | concept/claim별 분류된 신호(threat/support/neutral) |
| **Novelty 거버넌스**: 이 claim이 여전히 novel인가? patent-first가 필요한가? | **CAW-03 harness** (이 문서) | draft를 게이팅하는 **novelty 판정 + claim-boundary 결정** |

CAW-03은 분야를 직접 크롤링하지 않는다; CAW-05로부터 radar를 **import**하고 하나의 port를 통해 prior-art
서비스를 **query**한 뒤 **decide(결정)**한다. 결정이 부가가치이며, 발견은 위임된다.

## 개념 모델: novelty 상태 & claim-boundary
각 claim(import된 원장에서 타입 부여됨)은 draft 시점에 계산되고 재검사 가능한 **novelty 판정**을 지닌다:

| 판정 | 의미 | 기본 게이트 조치 |
|---|---|---|
| `novel` | 임계값 이상의 prior-art/radar 충돌 없음 | draft로 진행 |
| `threatened` | 관련 연구가 겹치지만 완전히 anticipate하지는 않음(부분적 범위 충돌) | claim boundary를 좁히거나 차별화 추가; 사람 검토 |
| `anticipated` | prior-art가 claim을 완전히 포괄함(새롭지 않음) | 해당 paper claim을 그대로 차단; background/인용으로 강등 |
| `superseded` | 더 새로운 결과가 우리 결과를 능가함 | 표시; 논문의 기여 프레이밍을 무효화할 수 있음 |
| `patent-sensitive` | claim이 보호하고 싶을 수 있는 특허 가능 주제임 | 어떤 publication 전에도 **patent-first** 경로로 라우팅 |

**Claim-boundary** = 주장의 명시적 범위(무엇이 claim되고 무엇이 claim되지 않는가). `threatened` claim에 대한
harness의 임무는 novelty를 회복하는 **더 좁은 boundary를 제안**하는 것이며(예: prior art가 결여한 operating
regime, 제약, metric, 또는 메커니즘을 추가), 그 boundary를 일급(first-class) 필드로 기록하여 engine이 그것에
맞춰 draft하고 patent 경로가 그것을 claim limitation으로 재사용할 수 있게 한다.

## prior-art / patent 검색 환경 (PatentSearch sub-port의 기반)
미래의 `live-prior-art` adapter가 감쌀 수 있는 실제 서비스들; v1은 port + 값싼 기본 하나 + stub을 배포한다.

| 서비스 | 접근 | 커버리지 / 비고 | v1 adapter 적합성 |
|---|---|---|---|
| **PatentsView** (USPTO 공개 데이터) | 무료 REST API (~45 q/min), 대량 다운로드 | 미국 grant/app, 제목/초록, CPC, 양수인/발명자 | **v1 기본값** (무료, 키 불필요, 스크립트 가능) |
| **Google Patents (BigQuery 공개 데이터셋)** | GCP BigQuery | ~120M 문서, 100+ 관청, 전문(full text) | 강력한 미래 adapter (GCP billing 필요) |
| **Lens.org Patent API** | Freemium (14일 trial 후 유료) | ~140M 레코드, USPTO/EPO/WIPO 집계 | 미래 adapter (유료) |
| **EPO Open Patent Services (OPS)** | 무료 tier + 키 | EP/전세계 서지, family 데이터 | 미래 adapter (EU/family 커버리지) |
| **USPTO Patent Public Search (PE2E)** | 웹 도구, 깔끔한 API 없음 | examiner 등급 검색; 자동화 어려움 | 수동 fallback 전용 |
| **PQAI (projectpq.ai)** | 오픈소스 AI prior-art 검색 | semantic/neural prior-art 검색 | 미래 "semantic" adapter |

**논문** prior-art(patent이 아님)의 경우 Semantic Scholar가 이미 engine 안에 있다; harness는 다시 query하는
대신 engine의 검증된 pool을 재사용하고 CAW-05 radar로 보충한다.

## novelty 감지 접근법 (v1 검사기가 실제로 하는 일)
LLM novelty 채점은 활발한 연구 분야이다(예: *OpenNovelty* agentic verifiable assessment arXiv:2601.01576;
*NovBench* arXiv:2604.11543; *SC4ANM* section-combination prediction arXiv:2505.16330). v1은 연구용 채점기를
통째로 채택하기보다 의도적으로 **보수적이고 설명 가능하게** 유지한다.

| 접근법 | 장점 | 단점 | v1 결정 |
|---|---|---|---|
| **Overlap/retrieval 신호** (claim 임베딩, 최근접 related-work + radar 검색, 임계값) | 값싸고 설명 가능, 날조 없음 | 조잡함; 임계값 튜닝 | **v1 baseline** |
| **LLM contradiction/anticipation 판정기** (source S가 claim C를 anticipate하는가?) | retrieval이 놓치는 의미적 겹침 포착 | LLM이 판정을 환각할 수 있음 | v1에서 **자문(advisory) 전용**, 결코 단독 게이트 아님 |
| **완전 agentic novelty 채점기** (OpenNovelty 스타일) | 가장 강력, 인용 기반 | 무겁고, 외부 의존성, 미성숙 | **port-stub** (미래 adapter) |
| **사람 판정** | 권위 있음 | 느림 | `threatened`/`patent-sensitive`에 **필수** |

**규칙:** novelty 판정은 `(retrieval_signal, llm_advisory, human_decision)`이다. 생성된 LLM 텍스트는 **결코
evidence가 아니며** `anticipated`/`novel`의 단독 근거가 될 수 없다; 사람 검토를 위해 *표시*만 한다(brief의
evidence-gate 불변식을 그대로 따름). harness는 판정이 감사 가능하도록 입력을 기록한다.

## Venue-fit (발표처 적합성)
Venue-fit은 paper 아티팩트에 부착된 자문 메타데이터이며 게이트가 아니다. 입력과 도구:

| 신호 | 출처 | 용도 |
|---|---|---|
| 주제 일치 | engine의 검증된 인용 pool + Semantic Scholar fields-of-study | 유사 연구를 인용하는 venue 제안 |
| 마감 / 주기 | 외부 CFP 추적기(예: aideadlines.org, WikiCFP)를 통한 얇은 fetch | paper-ladder 타이밍 |
| 범위/형식 적합 | venue의 `conference_guidelines.md` (이미 PaperOrchestra 입력) | 페이지/형식/익명성 제약 |
| 저널 제안기 | Elsevier Journal Finder / Springer / IEEE 추천기 | 저널 fallback |

v1은 사람이 선택에 사용하는 순위가 매겨진 **venue-fit 노트**(상위 N개 venue + 근거 + 다음 마감)를 산출한다;
자동 제출은 비목표(non-goal)이다. venue 선택은 paper-ladder rung과 engine의 guidelines 입력으로 **피드백된다**.

## P1/P2/P3 ladder 거버넌스
brief는 "P1/P2/P3"를 **claim 타입**이자 **paper-ladder rung(단계)**으로 중의적으로 쓴다; 이 문서가 그 매핑을
고정한다.

### Claim 타이핑 (CAW-02 원장에서 import, novelty/patent 라우팅에 사용)
| 타입 | 의미 | Patent 자세 | 기본 publish 자세 |
|---|---|---|---|
| **P1** | 핵심 **method** claim (알고리즘, 기법) | 보통 publish 가능; patent 선택 사항 | publish (P1 paper) |
| **P2** | **tool / system** claim (구현, 시스템 결과) | 때때로 특허 가능 | P1 이후/와 함께 publish (P2 paper) |
| **P3** | **future-device** / 미래 지향 claim (device/제품의 projection) | **기본적으로 patent-sensitive** | **patent-first**, 출원 결정 후에만 publish |

### Paper ladder (프로그램 논문 순서)
ladder는 각 논문이 이전 것 위에 쌓이고 disclosure 순서가 특허 권리를 태우지 않도록 프로그램의 논문 순서를
정한다: **P1 (method)** → **P2 (tool/system + results)** → **P3 (future-device / vision)**. 각 rung은 준비
게이트를 가진다(claim이 evidence gate 통과 + novelty 판정 ≠ `anticipated` + confidentiality clear).

### Patent-first 게이트 (하중을 지탱하는 규칙)
| Claim 타입 | Novelty 판정 | 조치 |
|---|---|---|
| P1 / P2 | `novel` | 논문 draft; patent **선택 사항** (사람 플래그) |
| P1 / P2 | `threatened` | boundary 좁히고 재검사; 그 후 draft |
| P1 / P2 | `patent-sensitive` (사람이 가치 있다고 플래그) | **patent-first**: 출원 결정까지 논문 보류 |
| P3 | 무엇이든 | **기본 patent-first**: file/abandon 결정이 기록될 때까지 public draft 없음 |
| 무엇이든 | `anticipated` | 기여로서 차단; background로 강등 |

**Patent-first**의 의미: 해당 claim에 대한 publication 지향 draft는 사람이 결정을 기록할 때까지 **차단**된다
(`file` → patent 경로가 먼저 실행; `abandon-protection` → publish 허용; `defer` → 차단 유지). 이것은 제안이
아니라 harness가 강제하는 아티팩트 수명 주기상의 상태이다. 출원 전 공개 disclosure는 특허 권리를 상실시킬 수
있으므로, 게이트는 **fail closed(닫힘 우선)**한다.

## Novelty/Radar port 표면
하나의 타입 있는 port; config로 선택; 코어는 인터페이스에만 의존한다. sub-capability는 **capability
descriptor**에 선언되어, adapter가 어떤 capability를 결여할 때 harness가 우아하게 degrade한다(예: live patent
검색이 연결되지 않아도 CAW-05 import는 작동).

```python
# Port (stable contract). Adapters register against it; config picks them.
class NoveltyRadarPort(Protocol):
    def capabilities(self) -> CapabilityDescriptor: ...
    def check_novelty(self, req: NoveltyRequest) -> NoveltyVerdict: ...      # core gate input
    def search_prior_art(self, req: PriorArtQuery) -> list[PriorArtHit]: ... # optional capability
    def import_radar(self, bundle_uri: str) -> list[RadarSignal]: ...        # CAW-05 import

@dataclass
class CapabilityDescriptor:
    adapter_id: str
    supports: set[str]          # {"radar_import","paper_prior_art","patent_prior_art","llm_advisory"}
    boundary_max: str           # "public" | "internal" — confidentiality ceiling this adapter may touch
    rate_limit_qpm: int | None
    offline_ok: bool            # works from cached artifacts with no live calls
```

```json
// RadarSignal — REUSES the CAW-05 boundary envelope (CAW-02 already consumes the same shape).
// CAW-03 imports the SAME file artifact; it does not reach into CAW-05's store.
{
  "signal_id": "caw05:<opaque>",
  "signal_type": "paper | preprint | patent | blog | release",
  "source": { "title": "...", "authors": ["..."], "year": 2026, "doi": "...", "url": "https://...",
              "external_ids": { "arxiv": "...", "s2": "..." } },
  "classification": "threat | support | neutral | unknown",
  "relevance": { "score": 0.0, "rationale": "..." },
  "related_to": ["caw03-claim:<id>"],
  "boundary": "public",
  "raw_summary": "generated — NOT evidence"
}
```

```json
// NoveltyVerdict — what the gate consumes. Auditable, no fabricated evidence.
{
  "claim_id": "caw03:<id>",
  "claim_type": "P1 | P2 | P3",
  "verdict": "novel | threatened | anticipated | superseded | patent-sensitive",
  "retrieval_signal": { "top_hits": ["..."], "max_overlap": 0.0 },
  "llm_advisory": { "opinion": "...", "confidence": 0.0 },   // advisory only, never sole basis
  "proposed_boundary_narrowing": "string | null",
  "patent_first": true,
  "human_decision": "pending | confirmed | overridden",
  "inputs_digest": "sha256 over signals+hits (replayable)"
}
```

### v1 adapter vs port-only stub
| Adapter | v1 상태 | Capability |
|---|---|---|
| **CAW-05 radar import** | 구현됨 | `radar_import` (file-drop, CAW-02가 쓰는 것과 같은 envelope) |
| **Engine-pool 재사용** (PaperOrchestra의 검증된 BibTeX에서 얻은 paper prior-art) | 구현됨 | `paper_prior_art`, `offline_ok` |
| **Retrieval + LLM-advisory 검사기** | 구현됨 | `llm_advisory` (flag 전용) |
| **PatentsView** prior-art | 구현됨 (얇음, 무료) | `patent_prior_art` |
| Google Patents / Lens / EPO-OPS / PQAI | **stub** (인터페이스 + not-implemented 마커 + config 예시) | `patent_prior_art` |
| OpenNovelty 스타일 agentic 채점기 | **stub** | `llm_advisory` (verifiable) |

stub은 명확한 메시지와 config 예시와 함께 `NotImplemented`를 반환하는 등록된 adapter여서, 나중에 실제 커넥터를
연결하는 것이 코어 변경이 아니라 adapter 하나로 끝난다(brief §5 규칙).

## 핵심 트레이드오프
| 결정 | 선택 | 근거 | 기각된 대안 |
|---|---|---|---|
| Novelty 소유자 | harness가 **결정**, engine/radar는 **공급** | 거버넌스를 어느 한 engine과 독립적으로 유지 | novelty를 PaperOrchestra에 내장(engine과 결합) |
| Radar 결합 | port를 통한 **CAW-05 file artifact import** | 공유 기반 없음; CAW-05는 분리 유지 | CAW-05로의 live API(독립성 위반) |
| Prior-art 기본값 | **PatentsView** 무료 API + stub | 비용 없고 스크립트 가능한 v1; 나중에 풍부하게 | 첫날부터 유료 Lens/Google 요구 |
| LLM novelty | **자문 flag 전용** | 생성된 텍스트는 evidence가 아님 | LLM 판정을 게이트로(환각 위험) |
| Patent-first | **P3 / patent-sensitive에 대한 fail-closed 게이트** | disclosure가 권리를 상실시킬 수 있음 | 저자가 기억하리라 신뢰(권리 누출) |
| Venue-fit | **자문 노트, 게이트 아님** | 사람이 선택; 과도한 자동화 회피 | 자동 제출(비목표) |

## Open Questions
- TODO(open-question: `retrieval_signal`의 overlap 임계값 + 임베딩 모델 — 어떤 corpus로 튜닝하고, CAW-05 자체
  채점기와의 공유 의존성을 어떻게 피하는가?)
- TODO(open-question: CAW-05가 **CAW-03 claim id**에 키가 매핑된 `related_to` 힌트를 방출하는가, 아니면 CAW-03이
  import된 원장을 통해 재매핑해야 하는 CAW-02 concept/claim id에만 매핑되는가?)
- TODO(open-question: "patent-sensitive" 플래깅의 권위 주체는 누구인가 — 사람 전용인가, 아니면 harness가 claim
  타입 + patent prior-art 적중으로부터 자동 제안할 수 있는가?)
- TODO(open-question: confidentiality — patent prior-art query가 내부 아이디어를 제3자 API에 드러낼 수 있다;
  `patent_prior_art`를 `boundary=public` claim 텍스트로만 제한하는가, 그리고 query 자체는 어떻게 redact되는가?)
- TODO(open-question: import된 radar 번들이 "submission-ready" 전에 novelty 판정을 재실행해야 하기 전까지
  얼마나 오래되어도 되는가? 게이트에 대한 freshness SLA?)
- TODO(open-question: venue-fit 마감 데이터 출처 — CFP 추적기 스크래핑이 허용되는가, 아니면 깨지기 쉬운
  스크래퍼를 피하기 위해 유지되는 목록을 요구하는가?)
- [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) 참조.

## 런북에 대한 함의
- **RB (novelty-radar-port):** `NoveltyRadarPort`, `CapabilityDescriptor`, 그리고 verdict/signal 스키마를 정의;
  config 기반 adapter registry; 코어는 port에만 의존. 네 개의 v1 adapter + stub 마커 배포.
- **RB (radar-import adapter):** 공유 envelope + 재redaction을 재사용하는 CAW-05 file-drop importer;
  `related_to`를 harness claim id로 매핑; `external_ids`로 중복 제거; `raw_summary`는 evidence에서 제외.
- **RB (novelty-checker):** engine pool + radar에 대한 retrieval 신호; LLM 자문(flag 전용); 감사 가능한
  `NoveltyVerdict` 방출; 생성된 텍스트가 `novel`/`anticipated`의 단독 근거가 되지 않게 함.
- **RB (patent-first gate):** claim 타입(P3)과 `patent-sensitive`에 키가 매핑된 수명 주기 상태 + fail-closed
  게이트; 사람의 `file|abandon|defer` 결정이 기록될 때까지 publish 지향 draft 차단.
- **RB (prior-art adapter — PatentsView v1):** 얇은 클라이언트(rate-limit 인식), `PriorArtHit` 매핑, query
  텍스트의 redaction; Google/Lens/EPO/PQAI stub을 config 예시와 함께 문서화.
- **RB (paper-ladder + venue-fit):** rung별 준비 게이트를 갖춘 ladder 계획(P1→P2→P3); engine의
  `conference_guidelines.md` 입력에 공급하는 venue-fit 노트 생성기. 모든 조치는 검증된 skill-interface 호출이어서
  agent와 사람이 동일한 게이트를 공유한다.
