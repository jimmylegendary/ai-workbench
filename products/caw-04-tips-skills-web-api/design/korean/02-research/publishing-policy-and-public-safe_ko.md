# 퍼블리싱 정책 & Public-Safe Gate

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF_ko.md)
  - [../01-decisions/](../01-decisions/) (ADR: 퍼블리싱 정책 & public-safe boundary — TODO; brief §9에 따라 load-bearing)
  - [../06-interfaces/](../06-interfaces/) (ContentSourceAdapter / public-safe 재검사 — TODO)
  - [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적
이것은 CAW-04의 **load-bearing** 문서다(brief §9). 공개 웹사이트 + REST API에 **무엇을 퍼블리시할 수 있는지**를
결정하고, 검증되지 않았거나 public 위에 있는 콘텐츠를 막는 **publish gate**를 정의하며, 모든 import에서 실행되는
**public-safe 재검사**(upstream `public-safe` 플래그를 절대 신뢰하지 않음), **redaction**
스윕, 그리고 퍼블리시된 모든 항목을 검증된 내부 소스로 되짚는 **audit**를 명세한다. 새로운 것을 발명하기보다 CAW-02(별도
제품)에서 이미 설계된 boundary 의미론을 **재사용**한다. content model(Tip/Skill/Workflow… — 별도 ADR),
storage/versioning(별도 ADR), web/API 스택은 결정하지 않는다. brief §8의 ports & adapters 이음매를 전제한다.

## 타협 불가 원칙 (상속됨 + 공개 표면을 위해 날카롭게 다듬음)
1. **public 출력은 public-safe 소스에서만.** CAW-04는 *바로 그* 공개 표면이므로(brief §11), publish
   gate는 패밀리에서 가장 중요한 통제다. 퍼블리시된 산출물이 가질 수 있는 유일한 `boundary` 값은
   **`public`**이다. `internal`과 `confidential`은 publishable-never다.
2. **Default-deny, fail-closed.** 불확정적이거나, 검증되지 않았거나, 파싱 불가능한 것은 무엇이든 **제외**되며 절대
   퍼블리시되지 않는다. gating 후의 빈 결과는 no-op이지, 격하된 publish가 아니다.
3. **upstream 경계를 절대 신뢰하지 않는다.** CAW-02 / CAW-03에서의 import는 boundary를 선언한다. CAW-04는 이를 로컬에서
   **재도출하고 재검사**한다(심층 방어 — CAW-02의 "import 시 재-redact" 규칙을 미러링). 생산자의
   `public_safe=true`는 *힌트*일 뿐 권위가 아니다.
4. **CAW-02에서 재사용한 두 개의 독립 축.** `boundary {public ⊂ internal ⊂ confidential}`(민감도, "건물 밖으로
   나갈 수 있는가") 와 `visibility {team, private}`(범위). 퍼블리시된 항목은 `public`이어야 **하고** 어떤
   `private` 조상에서도 파생되지 않아야 한다. 이 축들은 절대 하나의 필드로 합쳐지지 않는다.
5. **저작 없음, 세탁 없음.** CAW-04는 검증된 upstream 산출물을 퍼블리시한다(brief §10). 노하우를 "더 공유 가능한"
   무언가로 절대 다시 쓰지 않는다 — redaction은 콘텐츠를 *제거*할 뿐 *발명*하지 않는다. redaction이 산출물의 의미를
   망가뜨릴 정도라면, 속 빈 stub으로 퍼블리시되는 게 아니라 거부된다.
6. **모든 publish는 사람이 승인한다.** 자동 gating은 *제안*을 만든다. Jimmy(큐레이터)가 각 publish를 승인한다(brief
   §11). gate는 오직 자동으로 *거부*만 할 수 있다. 절대 자동으로 *승인*할 수 없다.

## publish gate — 무엇을 퍼블리시할 수 있는가
gate는 무엇이든 공개 저장소에 도달하기 전에 실행되는 **전역적이고 부작용 없는 결정 함수**
`publish_decision(item) → PUBLISH_OK | REJECT{reasons[]}`다. 이것은 **fail-closed** 검사들의 체인이다. 첫 번째
hard failure가 거부하고, 모든 soft finding은 큐레이터를 위해 수집된다. 기본 분기 = REJECT.

| # | Gate check | 규칙 (통과하려면 성립해야 함) | 실패 시 |
|---|---|---|---|
| G1 | Validated source | 항목이 **검증된** CAW-02/CAW-03 소스(upstream에서 accepted/validated 상태)로의 해결 가능한 provenance ref를 지님 | REJECT: 검증된 소스 없음 |
| G2 | Effective boundary | **`boundary_eff(item) == public`** (선언된 플래그가 아니라 provenance 조상들에 대해 계산) | REJECT: public 위 |
| G3 | Visibility | 어떤 조상도 `visibility=private`이 아님 (`visibility_eff == team`) | REJECT: private 파생 |
| G4 | Redaction-clean | (아래의) public-safe 재검사가 렌더링된 public view에서 **zero** hit를 반환 | REJECT: leak 마커 발견 |
| G5 | Evidence-grade | 항목이 단순한 `generated-summary`가 아니며, content model에 따라 재사용 메타데이터(inputs/outputs/preconditions)가 존재 | REJECT: 재사용/감사 불가 |
| G6 | Contract version | import envelope의 `contract_version` MAJOR가 지원됨 | REJECT: 알 수 없는 contract |
| G7 | Integrity | `payload_sha256`가 정규화된 payload와 일치; signature(존재 시)가 검증됨 | REJECT: integrity/tamper |
| G8 | Curator approval | 이 버전에 대한 명시적 사람 approve 이벤트가 존재 | HOLD (preview/admin에 머무름) |

참고:
- **G2가 척추다.** `boundary_eff`는 항목과 모든 provenance 조상에 대한 lattice-max다(CAW-02
  RB-013). `confidential` Claim 하나를 인용하는 Tip은 그 자체로 `confidential`이며 거부된다 — synthesis는 민감도를
  아래로 세탁할 수 없다. CAW-04는 이것을 재계산하며, 캐시된 upstream 플래그를 읽지 않는다.
- **CAW-04 내부에 downgrade 경로 없음.** CAW-02는 사람이 귀속되는 `reclassify` 활동을 가진다. CAW-04는 의도적으로
  **그것이 없다**. 무언가가 public이 되어야 한다면, 그 결정은 **upstream에서** 일어나고 새 import로 재진입한다. 공개
  표면은 confidential이 public이 되는 장소가 될 수 없다.
- G8은 *라이브로의 승격*을 gate한다. G1–G7은 *적격성*을 gate한다. G8 없이 G1–G7을 통과한 것은 내부
  preview/admin 표면(brief §4)에 머무른다 — 절대 공개 web/API에 올라가지 않는다.

## import 시 public-safe 재검사 (심층 방어)
모든 산출물은 하나의 공유 제품 내 라이브러리(`pub.safe`라고 부른다)를 통해 import 경계를 넘는데, 이는 CAW-02의
`kr.boundary`에 해당하는 CAW-04판이다. 이를 우회하는 **raw import 경로는 없다** — 에이전트와 사람은 같은 검사를
사용한다(brief §8 ports & adapters; CAW-03과 동일한 패턴).

Import 재검사 파이프라인(각 단계 fail-closed):

1. **envelope를 parse + semver-gate.** CAW-02의 공통 envelope 형태(`contract_version`,
   `source_product`, `declared_boundary`, `payload_sha256`, `redaction_applied`, `payload`)를 재사용. 알 수 없는
   MAJOR → 거부(절대 추측하지 않음). Digest 불일치 → 거부.
2. **effective boundary/visibility를 로컬에서 재도출.** `declared_boundary`나 어떤 upstream
   `public_safe` 필드도 신뢰하지 않는다. 번들에 실려 온 provenance 그래프로부터 `boundary_eff`/`visibility_eff`를
   계산하라. **해결 불가능한 조상은 `confidential`/`private`로 해석된다**(fail-closed unknown), 정확히 CAW-02
   RB-052 단계 3처럼.
3. **redaction ruleset을 *렌더링된 public view*(독자가 실제로 보게 될 markdown/JSON)에 대해 재실행한다.**
   `redaction_applied`와 무관하게. 생산자 redaction은 단일 실패 지점이다. CAW-04는 재-redact한다.
   `scan(view) → [Hit{rule_id, span, sample}]`. 후보-public 항목에 hit가 하나라도 있으면 ⇒ 거부(public 산출물을
   자동으로 strip하지 말 것 — hit는 소스가 오분류했다는 뜻이며 큐레이터로 escalate).
4. **자유 텍스트 leak 스캔** — 구조화된 필드로 잡히지 않는 내부 마커: 프로젝트 코드네임, fab/customer
   정규식, 내부 호스트명/URL, 직원 식별자. CAW-02 import의 "free-text leak scan"을 미러링.
5. **Conflation guard.** 퍼블리시된 산출물은 public 소스와 confidential 소스를 하나의 항목으로 융합할 수 없다(CAW-02
   가드레일: 공개 연구를 내부 Samsung/SAIT 주장과 절대 혼동하지 않음). 혼합된 provenance ⇒ 분할하거나 거부.
6. **candidate를 방출**하며, 절대 퍼블리시된 항목을 방출하지 않는다. candidate는 큐레이터 검토(G8)를 위해 전체 findings
   리포트가 첨부된 채 preview/admin 저장소에 안착한다.

### Redaction: 여기서 무엇이며 무엇이 아닌가
| 측면 | CAW-04 입장 | 근거 |
|---|---|---|
| 목적 | **탐지 + 거부**이지 변환이 아님 | 공개 표면 leak은 제공/캐시되면 복구 불가 |
| public 항목에 대한 auto-strip | **아니오** — hit는 오분류된 소스라는 뜻; escalate | strip은 조용히 변경된 산출물을 퍼블리시하고 upstream 버그를 가림 |
| Ruleset 소유권 | CAW-04가 자체 `ruleset_version`을 소유; CAW-02에서 import **안 함**(공유 기반 없음) | 독립성; 단 교리적으로는 정렬 유지 |
| 엔진 | 후보: PII/regex를 위한 **Microsoft Presidio**(analyzer + custom recognizers), 더하여 CAW-04 코드네임/fab/customer 패턴 목록 | 성숙한 OSS, REST 배포 가능, 커스터마이즈 가능; "모두 찾는다는 보장 없음"을 명시 → 사람 승인은 여전히 필수 |
| 범위 | raw 필드가 아닌 **렌더링된 public view**(템플릿 적용 후 markdown/JSON) | 독자는 렌더링된 출력을 본다; 그것이 공격 표면 |

`TODO(open-question: Presidio vs 더 가벼운 regex+denylist 코어 — Presidio는 NLP 의존성과 운영 부담을 더한다;
사람 승인이 어차피 필수임을 감안할 때 그 recall이 가치가 있는가?)`

## CAW-02에서 재사용한 boundary 용어 (재정의 금지)
| 개념 | CAW-02 정의 (그대로 재사용) | CAW-04 사용 |
|---|---|---|
| `boundary` lattice | `public ⊂ internal ⊂ confidential`, NOT NULL, 기본값 `internal` | `public`만 publishable; default-deny |
| `visibility` | `{team, private}`, NOT NULL, 기본값 `private` | 어떤 `private` 조상이라도 ⇒ 절대 publishable 아님 |
| `boundary_eff` | self + provenance 조상에 대한 lattice-max | G2 gate 값; 로컬에서 재계산 |
| Monotone propagation | synthesis는 민감도를 절대 downgrade 안 함 | import된 파생물은 자신의 floor를 유지 |
| 경계 횡단 시 재-redaction | 생산자의 `redaction_applied`와 무관하게 재검사 | import 재검사, 단계 3 |
| Fail-closed allow-list | 불확정 ⇒ EXCLUDE | gate의 기본 분기 |
| Hash-chained `_events` audit | 횡단당 append-only 한 줄, `verify_audit` | publish audit (아래) |

CAW-04는 이를 공유 라이브러리나 저장소가 아니라 **의미론의 복사본**으로 유지한다(독립성 계약). boundary 값은 import
envelope 안에 도착하며, CAW-04는 이를 신뢰하기보다 재도출한다.

## Audit — 퍼블리시된 모든 항목은 검증된 소스 + safety review로 추적된다
publish ledger는 append-only, **hash-chained** `_events` 로그(gate 결정당, 그리고 publish/
unpublish당 한 줄)이며, CAW-02 RB-013의 체인 구성(`seq`, `prev_hash`, `hash = H(prev_hash ‖ canonical(line))`)을
재사용하고 git history를 중복된 두 번째 증인으로 둔다(md/MDX-first 저장소, brief §6).

각 publish 이벤트는 최소한 다음을 기록한다:

```json
{
  "seq": 42,
  "prev_hash": "…",
  "event": "publish | reject | unpublish | redact",
  "artifact_id": "caw04:<id>",
  "version": "1.2.0",
  "source_ref": { "product": "CAW-02|CAW-03", "id": "…", "producer_run_id": "<opaque>" },
  "boundary_eff": "public",
  "gate_result": { "G1": "ok", "G2": "ok", "…": "…" },
  "redaction": { "ruleset_version": "…", "hits": 0 },
  "approved_by": "human:jimmy",
  "envelope_digest": "sha256:…",
  "hash": "…"
}
```

Audit 보장:
- **추적성(brief §3 사용 사례 5):** `source_ref` + `producer_run_id`는 사람이 라이브 핸들 없이 모든 공개 산출물을
  원천 제품으로 되짚게 한다(run id는 CAW-02에서처럼 opaque).
- **변조 증거성:** `verify_audit()`가 체인을 순회한다. 변경된 과거 라인은 `broken_at`을 산출한다.
- **재구성 가능한 결정:** 기록된 `gate_result` + `redaction`은 "이것이 왜 publishable이었고 누가 승인했는가"를
  재생 가능하게 만든다 — safety review가 곁다리가 아니라 기록의 일부다.
- **Unpublish/redact는 이벤트이지 삭제가 아니다:** upstream에서 경계가 바뀌면 CAW-04는 `unpublish`/
  `redact` 이벤트를 기록한다(brief §3 사용 사례 4). 퍼블리시된 *버전*은 불변이지만 서빙에서 철회될 수 있다.

## 트레이드오프 / ADR로 가져갈 결정
| 결정 | 옵션 | 기울기 | 이유 |
|---|---|---|---|
| Publishable boundary 집합 | `{public}`만 vs `{public, internal-on-authed}` | **`{public}`만** | brief §10 비목표: public 위 퍼블리시 없음; authed 내부 docs는 v1 범위 밖 |
| hit 시 redaction | 거부 vs auto-strip | **거부 + escalate** | 공개 leak은 비가역; hit는 소스에서 고칠 upstream 오분류를 신호 |
| upstream `public_safe` 신뢰 | 신뢰 vs 재도출 | **로컬에서 재도출** | 심층 방어; brief §7 "upstream 경계를 절대 맹목적으로 신뢰하지 않음" |
| Redaction 엔진 | Presidio vs regex/denylist | **TODO (open question)** | recall vs 의존성/운영 부담; 어느 쪽이든 사람 승인은 필수 |
| CAW-04 내부 downgrade | `reclassify` 허용 vs 없음 | **없음** | 공개 표면은 confidential이 public이 되는 곳이 절대 되어서는 안 됨 |
| 승인 | manual vs auto | **manual, publish당** | brief §11: Jimmy가 모든 publish 승인; gate는 자동 거부만 가능 |

## Open Questions
- TODO(open-question: redaction engine — Microsoft Presidio (NLP recall, REST-deployable) vs a lighter
  regex+denylist core, given human approval is mandatory regardless of engine?)
- TODO(open-question: where does CAW-04's codename/fab/customer pattern list live and how is it kept doctrinally
  aligned with CAW-02's without becoming a shared dependency / shared substrate?)
- TODO(open-question: does the import bundle ship the full provenance ancestor graph so CAW-04 can recompute
  `boundary_eff`, or only the leaf item + declared boundary? If only the leaf, every item with unresolved
  ancestry fails closed and nothing publishes — is the richer bundle required from CAW-02/CAW-03?)
- TODO(open-question: signature/attestation scheme on imported bundles — DSSE / in-toto / minisign — to verify the
  upstream producer, consistent with CAW-02's open export-signature question?)
- TODO(open-question: re-validation cadence — when an upstream source is later reclassified to confidential, how
  does CAW-04 learn it must unpublish? pull/poll, a revocation feed, or curator-driven?)
- TODO(open-question: cache/CDN purge guarantee on unpublish — a public artifact may be cached at the edge; what
  is the bound on time-to-purge after a `redact`/`unpublish` event?)
- TODO(open-question: handling already-public external sources (e.g. cited papers) vs internal-origin public-safe
  content — both are `boundary=public` but carry different risk; do they need distinct provenance kinds?)
- [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) 참조.

## 런북에 대한 함의
- **RB (pub.safe library):** 하나의 공유 제품 내 gate 라이브러리 — envelope parse + semver gate, 로컬
  `boundary_eff`/`visibility_eff` 재도출(fail-closed unknown ⇒ confidential/private), 렌더링된 public view에 대한
  `scan()` redaction, default-REJECT의 전역 `publish_decision()`, 그리고 hash-chained audit
  writer. negative 중심 테스트 스위트가 어떤 `internal`/`confidential`/`private` 항목도 gate를 통과하지 못하며
  불확정 ⇒ REJECT임을 증명한다(mutation-tested: 기본값을 PUBLISH_OK로 약화하면 스위트가 깨져야 한다).
- **RB (ContentSourceAdapter — CAW-02 / CAW-03 import):** envelope 수령 → 재검사 파이프라인 → findings 리포트가
  첨부된 *candidate* 안착(절대 퍼블리시된 항목 아님); 횡단당 append-only audit 한 줄.
- **RB (preview/admin + curator approve):** G1–G7을 통과한 candidate를 퍼블리시로 뒤집는 유일한 경로는 명시적
  사람 approve 이벤트(G8)다; audit에 `approved_by`를 기록.
- **RB (PublishSinkAdapter — 웹사이트 빌드 + REST API):** `boundary_eff=public`이고 승인이 기록된 산출물만
  퍼블리시; 불변 버전 출력을 방출; `unpublish`/`redact` 이벤트가 서빙을 철회하고 cache/CDN purge를 트리거.
- **RB (audit + verify):** publish ledger에 대한 `verify_audit()` + 중복 증인으로서의 git; 모든 라이브 산출물에 대해
  "왜 publishable + 누가 승인" 재구성.
- 모든 importer/publisher는 **검증된 skill-interface action**이어야 하며, 그래서 에이전트가 사람과 동일한 gate를
  통과한다 — 공개 저장소로의 raw 경로는 없다.

---

Sources:
- [Microsoft Presidio (PII detection/redaction framework)](https://github.com/microsoft/presidio)
- [Presidio: Data Protection and De-identification SDK](https://microsoft.github.io/presidio/)
- [Static Site Generator Security guide](https://www.blog.brightcoding.dev/2025/11/21/static-site-generator-security-the-ultimate-guide-to-protecting-your-markdown-powered-websites-in-2025)
- 재사용된 내부 설계(별도 제품): CAW-02 RB-013 (boundary + audit), CAW-02 import/export-boundaries, CAW-02 RB-052 (boundary/redaction validation library).
