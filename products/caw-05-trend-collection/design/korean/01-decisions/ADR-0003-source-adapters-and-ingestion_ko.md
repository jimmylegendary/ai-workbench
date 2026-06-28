# ADR-0003: Source adapters & ingestion — 법적/ToS-안전 패밀리, SourceAdapter 포트, 증분 fetch + dedup

- **Status:** proposed
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF_ko.md) (단일 진실 공급원)
  - [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS_ko.md)
  - [ADR-0001-product-surface-and-outputs_ko.md](ADR-0001-product-surface-and-outputs_ko.md) (Run이 이 어댑터들을 소비)
  - [ADR-0002-interest-model_ko.md](ADR-0002-interest-model_ko.md) (여기서 생산된 `RawFinding`들을 점수화; 구조화된 메타데이터 필요)
  - [ADR-0004-classification-and-triage_ko.md](ADR-0004-classification-and-triage_ko.md) (deduped finding + trust prior를 소비)
  - [../02-research/source-ingestion_ko.md](../02-research/source-ingestion_ko.md) (소스별 접근 표, SourceAdapter 계약)
  - [../02-research/scheduling-and-ports_ko.md](../02-research/scheduling-and-ports_ko.md) (레지스트리, cursor, dedup 레이어, 스텁 패턴)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적(Purpose)
**CAW-05가 어떤 소스 패밀리를 ingest하는지**, **재수집 없이 법적/ToS-안전하게 어떻게 ingest하는지**, **소스와
실행에 걸쳐 어떻게 중복 제거하는지**, 그리고 모든 패밀리가 꽂히는 **`SourceAdapter` 포트** + 레지스트리(문서화된
스텁 포함)를 결정한다. 이 문서는 v1 소스 집합, per-source-cursor + 다층 dedup 코어, 여섯 가지 어댑터 계약
의무를 확정한다. 이 문서는 interest 점수화(ADR-0002), classification/triage(ADR-0004), ledger, export 경계를
결정하지 **않는다** — 어댑터는 **fetch + 정규화만** 하며, 결코 classify하거나 rank하지 않는다. 모든 v1 소스는
**공개, 읽기 전용**이다; CAW-05는 결코 그것들을 내부 Samsung/SAIT 주장과 섞지 않는다(브리프 §12).

## 맥락(Context)
- watch list(§6)는 **좁고 학술 위주**이므로, 지배적 신호는 **논문(arXiv/conf), 코드(GitHub), 랩 블로그**에
  산다 — v1 ingestion 비중이 거기로 간다(source-ingestion 연구 §1). HN/Reddit/증권/뉴스레터는 recall이 낮고
  ToS/비용 마찰이 있는 인접 확인 채널이다.
- 미션은 **좁은 리스트에서 높은 recall**(§1, §3): 자세는 "*안전한* 패밀리 내에서 폭넓게 ingest하고, 나중에
  필터링" — 결코 소스에서 drop하지 않음.
- 두 가지 강한 제약(§5, §12): **법적/ToS-안전만**(HTML 스크래핑보다 공식 API와 publisher feed 선호; HTML만
  존재하는 경우 메타데이터 + 링크) 그리고 **항상 provenance**(모든 항목은 origin URL, 검색 timestamp,
  source-native id, `boundary=public`, trust를 보관).
- **Ports & adapters**(§9): v1 = arXiv/Semantic Scholar + RSS/blogs + GitHub; 스텁 = HN/Reddit, 증권,
  뉴스레터, 내부 feed; config 구동 레지스트리, 형제 CAW-03과 동일 패턴(공유 레지스트리 없음).
- 재실행은 재수집하거나 재발행해서는 안 된다; 주간 cron은 놓친 주를 흡수해야 한다(ADR-0001 / 스케줄링 연구
  §2–3). 그래서 **증분 cursor + content-addressed dedup이 코어에 살며**, 모든 어댑터가 상속한다.

## 고려된 옵션(Options considered)

### A. v1 소스 집합
| 옵션 | 장점 | 단점 | 적합도 |
|---|---|---|---|
| **코어: arXiv(query API + OAI-PMH + cs.AR/cs.LG/cs.DC RSS) + Semantic Scholar(enrich/cross-ref) + GitHub(Atom + REST) + 큐레이션된 랩 블로그 RSS; 경량: HN(Algolia); 스텁: Reddit/EDGAR/뉴스레터/내부** | 좁은 리스트에서 가장 높은 recall; 모두 무료 + ToS-안전; 깔끔한 DOI/arXiv dedup; 스텁으로 입증된 이음새 | 블로그 allow-list + watch-list repo 큐레이션이 수동 | **선택됨** |
| v1에 모든 것을 라이브로(Reddit/증권/미디어 포함) | 넓은 커버리지 | Reddit은 OAuth 사전 승인 필요; 애널리스트 리포트는 유료(§11); 낮은 신호/높은 noise; ToS 위험 | 거부됨 |
| arXiv만 | 가장 단순 | watch-list 작업이 먼저 등장하는 코드(GitHub) + 랩 블로그를 놓침 → recall 갭 | 거부됨 |

### B. 법적/ToS 자세
| 옵션 | 장점 | 단점 | 적합도 |
|---|---|---|---|
| **공식 API + publisher feed; HTML만 존재하는 경우 metadata-only-link; v1에 스크래핑 없음** | ToS-안전(§12); rate limit 존중; provenance 깔끔 | 일부 소스는 feed를 제공할 때까지 제외 | **선택됨** |
| 커버리지 극대화를 위한 HTML 스크래핑 | 더 많은 텍스트 | ToS/법적 위험; 재배포 위험; 취약 — §12 위배 | 거부됨 |

### C. Dedup 전략
| 옵션 | 장점 | 단점 | 적합도 |
|---|---|---|---|
| **다층: (1) native id, (2) cross-source canonical DOI▸arXiv▸정규화-title, (3) 정규화 title+body의 SHA-256, (4) 플래그 뒤의 SimHash near-dup** | arXiv+S2+blog+HN 상의 논문이 여러 provenance 항목을 가진 하나의 finding; recall-안전 기본값 | SimHash 임계값이 false-merge(finding drop) 위험 | **선택됨; SimHash opt-in만** |
| 단일 id dedup | 사소함 | id가 없거나 불일치할 때 쌍둥이 생성(야생에서 흔함) | 거부됨 |

### D. Cursor + dedup이 사는 곳
| 옵션 | 장점 | 단점 | 적합도 |
|---|---|---|---|
| **코어 안; 어댑터는 dedup에 대해 얇고 + stateless** | 모든 패밀리가 증분 + dedup을 무료로 상속; 어댑터는 교체 가능하게 유지 | 코어가 더 많은 상태를 소유 | **선택됨** |
| 어댑터별 | 어댑터 자율성 | 각자 cursor/dedup 재구현 → 표류, 쌍둥이, 재-spam | 거부됨 |

## 결정(Decision)
**하나의 `SourceAdapter` 포트 뒤에 안전하고 학술 비중이 높은 v1 소스 집합; 코어 안의 증분 cursor + 다층 dedup;
나머지는 문서화된 스텁.**

1. **v1 소스 집합**(source-ingestion 연구 §4):
   - **v1 코어** — `ArxivAdapter`(query API + OAI-PMH harvest, 3초 단일 연결 limiter + 카테고리별 RSS),
     `SemanticScholarAdapter`(enrichment + citation cross-ref, 필수 지수 backoff), `GithubAdapter`
     (repo별 `releases/tags/commits.atom` + ETag/`since`가 있는 REST, secondary-rate-limit 헤더 준수),
     `BlogRssAdapter`(검증된 `feeds.yaml`로 구동되는 conditional GET을 가진 일반 Atom/RSS).
   - **v1 경량** — Algolia API 상의 `HackerNewsAdapter`, **메타데이터 + 링크만**, `created_at_i` watermark.
   - **v1 스텁** — `RedditAdapter`(OAuth 사전 승인), `EdgarAdapter`(SEC 제출, ≤10 req/s),
     `NewsletterAdapter`, `InternalFeedAdapter`: 등록되어 발견 가능하되 config-비활성; preflight는 `active`
     스텁을 거부한다.
2. **법적/ToS-안전 ingestion.** 공식 API + publisher 제공 feed만; 소스가 HTML만 제공하는 경우, 라이선스가
   허용하지 않는 한 fair-use snippet을 넘는 재현된 full text가 아닌 **메타데이터 + 링크**를 ingest한다. 각
   어댑터는 `legal_mode`(`api | publisher_feed | metadata_only_link`)와 `tos_class`를 선언한다; ToS-비안전
   어댑터는 **preflight**에서 거부된다(스케줄링 연구 §5). 유료 애널리스트 리포트는 범위 밖(§11).
3. **`SourceAdapter` 포트.** 코어는 이 인터페이스에 의존한다; 각 패밀리는 config 구동 레지스트리
   (`sources.yaml`/`caw05.config.toml`)의 교체 가능한 어댑터다. 계약(source-ingestion 연구 §5):
   `capabilities() -> SourceCapabilities`, `fetch(query, cursor) -> (Iterable[RawFinding], FetchCursor)`,
   `healthcheck() -> HealthStatus`. `RawFinding`은 `source_native_id`, `canonical_id`, `title`, `url`,
   `authors`, `published_at`/`updated_at`, `summary_or_body` + `body_is_full_text`, `provenance`
   (`origin, retrieved_at, source_native_id, boundary="public", trust`), 그리고 감사용 raw payload를 담는다.
   **모든 어댑터가 준수해야 하는 여섯 계약 의무:** (1) 멱등 + 증분(매 실행마다 cursor 전진); (2) 어댑터 내부의
   rate-limit + jitter가 있는 지수 backoff; (3) `legal_mode` 준수(metadata-only는 재현된 full text를 결코
   저장하지 않음); (4) provenance 완전(origin + `retrieved_at` + native id + boundary 없이는 finding 없음);
   (5) 타입드 실패(스케줄러가 반응하도록 transient vs terminal); (6) **classification/ranking 없음** — 어댑터는
   얇게 유지.
4. **코어 안의 증분 fetch.** 소스별 **watermark**(OAI `from`/`resumptionToken`, feed `ETag`/`Last-Modified`,
   HN `created_at_i`, GitHub `since`)를 지속; **완전히 성공한 소스 통과에서만** cursor를 전진(recall 편향:
   의심스러우면 재-fetch하고 dedup). 저렴한 304를 위해 HTTP conditional 요청 사용; 다운타임 이후 date-windowed
   catch-up. arXiv(3초)와 SEC(10 req/s, 위반 시 IP 차단)는 직렬화되며, 호스트당 결코 병렬화되지 않음; GitHub
   Search(30/min)는 Atom feed + `since`를 선호하여 보존.
5. **코어 안의 dedup(다층, recall-안전).** (1) 소스 내 native id; (2) cross-source canonical 정체성
   `DOI ▸ arXiv id ▸ 정규화 title+author` — 하나의 finding, 여러 `provenance` 항목; (3) 두 소스를 통한 같은
   항목에 대한 정규화 title+abstract/body의 SHA-256; (4) 보수적 임계값으로 **플래그 뒤의** **SimHash** near-dup
   접기(false-merge는 finding을 *drop*하여 recall을 위배하므로 — 기본값은 둘 다 유지). arXiv **버전**은 별개로
   유지되되 연결됨(v2는 새로운 novelty 신호일 수 있음). Export 멱등 키(ADR-0004 라우팅)는 재시도 시 이중 발행을
   방지한다.

## 결과(Consequences)
- **쉬움:** 어댑터 파일 하나 + config 블록 하나를 구현하여 패밀리(HN/Reddit, EDGAR, 새 블로그) 추가;
  classification과 dedup은 소스를 결코 알지 못함(스케줄링 연구 §8 seam test).
- **쉬움:** 주간 재실행은 저렴하고 중복 없음; 놓친 주는 cursor catch-up으로 자가 치유; 네 소스에 걸친 같은
  논문이 하나의 감사 가능한 finding으로 붕괴.
- **어려움 / 비용:** `feeds.yaml` + canonical watch-list repo URL 큐레이션은 수동이며 미해결 질문; arXiv의
  3초와 SEC의 IP 차단 한계가 직렬화를 강제; SimHash 임계값 튜닝은 연기(recall 위험).
- **후속:** ADR-0002는 entity lane을 위해 어댑터가 공급하는 구조화된 author/venue 메타데이터에 의존; ADR-0004는
  deduped finding + signal-vs-hype를 시드하는 소스별 `trust` prior를 소비; ledger의 Semantic Scholar 검증은
  여기의 S2 클라이언트를 재사용. Runbooks: v1 코어 어댑터(각각 6 의무 통과); HN 경량; 등록된 스텁; ingestion
  런타임(token-bucket limiter, cursor 지속, cross-source dedup, provenance 스탬핑); `sources.yaml`/레지스트리.

## 미해결 질문 / 재검토 트리거(Open questions / revisit triggers)
- TODO(open-question: 각 watch-list 프로젝트에 대한 canonical GitHub org/repo 확정 — MemOS, Chakra, MC-DLA/
  DeepStack, SECDA-DSE.) [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md) 참조.
- TODO(open-question: v1 랩/회사 블로그 RSS allow-list 확정; 각각 스크래핑 필요 vs feed 제공 검증.)
- TODO(open-question: >1 RPS를 위해 Semantic Scholar API 키를 추구할지, 아니면 v1 볼륨에 대해 공유 unauth
  풀에 머물지?)
- TODO(open-question: Reddit watch-list 신호가 OAuth 사전 승인 가치가 있는지, 아니면 v1에서 건너뛸지?)
- TODO(open-question: "증권 리포트"의 범위 — SEC EDGAR 제출(무료, 스텁으로 범위 내) vs 유료 애널리스트 리포트
  (범위 밖 §11)? 브리프의 의도 명확화.)
- TODO(open-question: requester-pays S3를 통한 arXiv PDF/소스 full text — triage에 필요한지, 아니면
  abstract+link가 v1에 충분한지?)
- TODO(open-question: layer-4를 위한 SimHash Hamming 임계값 + body 정규화 — 허용 가능한 false-merge 비율,
  그리고 v1에서 켜져 있기는 한지?)
- **재검토 트리거:** classification이나 코어가 소스별 분기를 필요로 하면, `SourceAdapter` 계약이 유출되고 있는
  것 — 파이프라인이 아니라 계약/value object를 확장하라.
