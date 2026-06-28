# Publish Gate & Public-Safe (핵심 하중 지지 제어 장치)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./overview.md](./overview_ko.md)
  - [./import-and-recheck.md](./import-and-recheck_ko.md)
  - [../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate.md](../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md) (권위 있는 ADR)
  - [../01-decisions/ADR-0002-content-model.md](../01-decisions/ADR-0002-content-model_ko.md) (`isPublishable`, sidecar 분리)
  - [../01-decisions/ADR-0005-storage-and-versioning.md](../01-decisions/ADR-0005-storage-and-versioning_ko.md) (freeze, tombstones)
  - [../02-research/publishing-policy-and-public-safe.md](../02-research/publishing-policy-and-public-safe_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
이 문서는 **publish gate**(공개 게이트) — 공개 웹사이트 + REST API에서 *무엇을 공개해도 되는지*를 결정하는 단일 하중 지지 제어 장치 — 를 명세한다. ADR-0003을 core/구현 고도(altitude)에서 구체화한다: 즉 deny-by-default(기본 거부) 결정 함수, 검증된 source **와** public-safe 경계가 **둘 다** 필요하다는 요건, **redaction**(편집/삭제) 입장, 필수적인 **curator 승인**, 그리고 **생성된/미검증 콘텐츠는 결코 공개되지 않는다**는 규칙. 이 문서는 경계 의미론을 처음부터 다시 도출하지 않으며(CAW-02에서 가져온 의미론을 재사용하되 독립적인 사본임), import 재검사(re-check) 메커니즘도 다루지 않는다(see
[import-and-recheck.md](./import-and-recheck_ko.md)) — 재검사는 *이* 게이트를 import 시점에 강제하는 것이다.

## Non-negotiable principles (ADR-0003 기준 — 재서술, 약화 금지)
1. **public-safe source에서 나온 것만 공개.** 공개된 artifact가 가질 수 있는 유일한 `boundary`는 **`public`**이다. `internal`과 `confidential`은 publishable-never(공개 절대 불가)다 (brief §11).
2. **Default-deny, fail-closed(기본 거부, 닫힘 실패).** 불확정적이거나 미검증이거나 파싱 불가능한 것은 모두 **제외**된다. 결정 함수의 기본 분기(branch)는 **REJECT**다.
3. **upstream 경계를 결코 신뢰하지 마라.** 선언된 `public_safe`는 *증거*일 뿐 권위가 아니다; core는 로컬에서 다시 도출하고 다시 검사한다.
4. **두 개의 독립 축.** `boundary {public ⊂ internal ⊂ confidential}` (민감도)와 `visibility
   {team, private}` (범위). 공개 ⇒ `public` **이면서** `private` 조상이 없음. 두 축은 결코 합쳐지지 않는다.
5. **저작 금지, 세탁 금지.** redaction은 *제거*할 수는 있으나 결코 *날조*할 수 없다. **CAW-04 내부에는 downgrade/`reclassify` 경로가 없다** — confidential→public 전환은 오직 upstream에서만 일어나며 새로운 import로 다시 들어온다.
6. **모든 publish는 사람이 승인한다.** 게이트는 오직 자동 **reject**만 할 수 있다; 결코 자동 **approve**할 수 없다.

## The decision function
`publish_decision(item) → PUBLISH_OK | REJECT{reasons[]}`는 **total**(모든 입력에 대해 정의됨)하고 **side-effect-free**(계산만 함; store에 쓰지 않음 — 오직 audit writer만 별도로 씀)하다. 이것은 fail-closed 검사의 연쇄다: **첫 번째 hard failure에서 reject**; soft finding은 curator를 위해 수집됨; **기본 분기는 REJECT**다. agent가 호출하든 사람이 호출하든 동일한 함수이며 — 두 번째의 더 느슨한 경로는 없다.

```
fn publish_decision(item) -> Decision {
    let reasons = [];
    for check in [G1, G2, G3, G4, G5, G6, G7] {        // eligibility checks
        match check(item) {
            Pass            => continue,
            HardFail(r)     => return REJECT([r]),       // fail fast, fail closed
            SoftFinding(f)  => reasons.push(f),          // surfaced to curator, still REJECT-by-default
        }
    }
    if !reasons.is_empty() { return REJECT(reasons); }
    if !G8_human_approval_exists(item) { return HOLD; }  // eligible, awaiting curator (G8)
    return PUBLISH_OK;                                    // <-- ONLY reachable via explicit human approve
}
// default, if the chain is ever edited to fall through: REJECT  (mutation-tested)
```

## The gate checks (G1–G8)
| # | Check | 통과하려면 성립해야 하는 것 | 실패 시 |
|---|---|---|---|
| G1 | Validated source | **validated** CAW-02/CAW-03 source(upstream에서 accepted/validated)에 대한 해석 가능한 provenance 참조 | REJECT: no validated source |
| G2 | Effective boundary | **`boundary_eff(item) == public`**, 즉 item + 모든 provenance 조상에 대한 lattice-max(격자 최댓값) — 선언된 flag가 아님 | REJECT: above-public |
| G3 | Visibility | 어떤 조상도 `visibility=private`이 아님 (`visibility_eff == team`) | REJECT: private-derived |
| G4 | Redaction-clean | redaction scan이 *렌더링된 public view*에서 **0건**의 hit을 반환 | REJECT: leak markers found |
| G5 | Evidence-grade | 단순 generated-summary가 아님; `isPublishable(record)` 성립 — reuse/audit 메타데이터 존재(inputs/outputs, preconditions, provenance, safety boundary, version) | REJECT: not reusable/auditable |
| G6 | Contract version | import envelope의 `contract_version` MAJOR가 지원됨 | REJECT: unknown contract |
| G7 | Integrity | `payload_sha256`가 canonicalize된 payload와 일치; signature(있다면) 검증됨 | REJECT: integrity/tamper |
| G8 | Curator approval | 이 version에 대한 명시적 사람 approve 이벤트 존재 | HOLD (preview/admin에 머무름) |

- **G1–G7은 eligibility를 게이팅하고; G8은 live로의 승격을 게이팅한다.** G8 없이 G1–G7만 통과한 경우 내부 preview/admin surface(ADR-0001)에 머무르며 — **결코** 공개 web/API에 올라가지 않는다.
- **G2가 척추(spine)다.** `boundary_eff`는 item과 *모든* provenance 조상에 대한 lattice-max다. 하나의 `confidential` Claim을 인용하는 Tip은 그 자체로 `confidential`이며 reject된다 — synthesis는 결코 민감도를 아래로 세탁하지 않는다. core는 이를 **재계산**하며; 캐시된 upstream flag를 결코 읽지 않는다. 해석 불가능한 조상은 `confidential`/`private`으로 해석된다(fail-closed unknown).

## "Validated source AND public-safe" — 둘 다 필수, 어느 하나로도 불충분
게이트는 **AND**이지 OR이 아니다. 두 개의 독립 조건이 둘 다 성립해야 하며, 두 번째는 로컬에서 다시 도출된다:

| 조건 | 충족 수단 | 검사 | 차단하는 실패 모드 |
|---|---|---|---|
| **Validated source** | upstream-validated artifact에 대한 해석 가능한 provenance 참조 | G1, G7 | 날조되었거나 검증 불가능한 콘텐츠의 공개 |
| **Public-safe boundary** | 로컬에서 다시 도출한 `boundary_eff == public` + `visibility_eff == team` + redaction hit 0건 | G2, G3, G4 | internal/confidential/private 노하우의 유출 |

validated이지만 confidential한 item은 G2에서 실패한다. public이지만 미검증인 item은 G1/G5에서 실패한다. validated **이면서** public-safe인 — **그리고** 사람이 승인한(G8) — artifact만이 공개된다.

## 생성된 / 미검증 콘텐츠는 결코 공개되지 않는다 (G5)
CAW-04는 아무것도 저작하지 않는다 (brief §10). **단순 generated summary**는 *증거가 아니다* (brief §11: 생성된 결론은 sources/claims/evidence와 분리되어 보관됨). G5는 다음에 해당하는 record를 reject한다:
- 검증된 source 뒷받침이 없는 `generated-summary` kind이거나,
- 콘텐츠 모델이 요구하는 reusable+auditable 메타데이터가 결여됨(`isPublishable(record)`가 false — ADR-0002).

upstream에서의 자동 생성은 **proposal generation**(제안 생성)이다; 검증된 provenance 체인(G1)과 사람 승인(G8) 없이는 결코 공개 artifact가 되지 않는다. 게이트는 이를 통과시키도록 설정될 수 없다.

## Redaction 입장 — 변환이 아닌 탐지 + 거부
| 측면 | CAW-04 입장 | 근거 |
|---|---|---|
| 목적 | 변환이 아닌 **탐지 + 거부** | 공개 surface로의 유출은 서빙/캐싱되고 나면 복구 불가능 |
| hit 발생 시 동작 (public item) | **reject + curator에게 escalate** | hit은 *source*가 오분류되었음을 의미; 제거(strip)하면 조용히 변경된 artifact를 내보내고 upstream 버그를 감추게 됨 |
| 범위 | raw 필드만이 아닌 **렌더링된 public view**(template 적용 후 markdown/JSON/HTML) | 독자는 렌더링된 출력을 봄; 그것이 공격 표면 |
| Ruleset 소유권 | CAW-04가 자체 `ruleset_version`을 소유; CAW-02에서 import하지 **않음**(공유 substrate 없음) | 독립성 (brief §1); 교리적으로는 정렬 유지 |
| 엔진 | 후보: **Microsoft Presidio** (analyzer + custom recognizers) + CAW-04 codename/fab/customer 패턴 목록 | 성숙한 OSS, REST 배포 가능, 커스터마이즈 가능; "모두 찾는다는 보장은 없음" → 사람 승인은 여전히 필수 |

```
fn redact_scan(rendered_public_view) -> [Hit{ rule_id, span, sample, severity }]
// any hit on a candidate-public item  =>  G4 HardFail  =>  REJECT + escalate (never auto-strip)
```

`TODO(open-question: Presidio vs a lighter regex+denylist core — recall vs dependency/ops weight, given human
approval is mandatory regardless. ADR-0003.)`

## Curator approval (G8) — live로 가는 유일한 경로
- 게이트는 **자동 reject**한다; **결코 자동 approve하지 않는다**(원칙 6). G1–G7은 *proposal*을 만들고; G8은 사람의 행위다.
- 승인은 내부 preview/admin surface(ADR-0001)에서의 **명시적 이벤트**이며, 특정 `(artifact_id, version)`에 대해 `approved_by`로 audit에 기록된다.
- 승인은 **version 범위로 한정된다**: 새 version은 게이트를 다시 통과해야 하고; 이전 승인은 이월되지 않는다.
- 처리량은 **설계상** curator에 의해 제약된다 — 이것은 guardrail이지, 최적화로 없애야 할 병목이 아니다.

## Audit — 공개된 모든 item은 validated source + safety review로 추적된다
publish ledger는 **append-only, hash-chained `_events` log**(각 게이트 결정마다 그리고 각 publish/unpublish/redact마다 한 줄)이며, CAW-02 RB-013의 체인 구성을 재사용하고 git history를 중복된 두 번째 증인으로 둔다(md/MDX-first store, ADR-0005). Unpublish/redact는 **delete가 아닌 이벤트**다: 공개된 *version*은 불변(영원히 frozen — ADR-0005)이지만 HTTP 410 tombstone을 통해 서빙에서 철회될 수 있다.

```json
{
  "seq": 42,
  "prev_hash": "sha256:…",
  "event": "publish | reject | hold | unpublish | redact",
  "artifact_id": "caw04:<id>",
  "version": "1.2.0",
  "source_ref": { "product": "CAW-02|CAW-03", "id": "…", "producer_run_id": "<opaque>" },
  "boundary_eff": "public",
  "gate_result": { "G1": "ok", "G2": "ok", "G3": "ok", "G4": "ok", "G5": "ok", "G6": "ok", "G7": "ok", "G8": "ok" },
  "redaction": { "ruleset_version": "…", "hits": 0 },
  "approved_by": "human:jimmy",
  "envelope_digest": "sha256:…",
  "hash": "sha256: H(prev_hash ‖ canonical(line))"
}
```
보장 사항: **traceability**(`source_ref` + `producer_run_id`로 라이브 핸들 없이 모든 공개 artifact를 upstream으로 추적), **tamper-evidence**(`verify_audit()`가 체인을 따라가며 → `broken_at`), **reconstructable decisions**("왜 공개 가능했는지 + 누가 승인했는지"를 재생 가능), **withdrawal-without-erasure**(unpublish/redact 기록됨).

> Note: `source_ref`와 `producer_run_id`는 **audit 전용** provenance이며 sidecar에 존재한다 — 이들은 공개 web/API 출력으로 **결코** 직렬화되어서는 안 된다(ADR-0002 public-projection 분리; 테스트로 강제됨, see overview I3).

## Open Questions
- TODO(open-question: redaction engine — Presidio vs regex+denylist core. ADR-0003.)
- TODO(open-question: where the codename/fab/customer pattern list lives and how it stays aligned with CAW-02
  without a shared substrate. ADR-0003.)
- TODO(open-question: cache/CDN purge bound on time-to-purge after `redact`/`unpublish`. ADR-0003/0005.)
- TODO(open-question: distinct provenance kinds for already-public external sources vs internal-origin
  public-safe content — both `boundary=public`, different risk. ADR-0003.)
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md).

## Implications for runbooks
- **RB (pub.safe gate):** `publish_decision()`를 default-REJECT인 total, side-effect-free 함수로 구현; negative 위주 + mutation 테스트(기본값을 `PUBLISH_OK`로 약화하면 테스트 스위트가 깨져야 함).
- **RB (redaction):** 렌더링된 public view 위에서 `scan()`; hit이 있으면 reject+escalate; 결코 auto-strip하지 않음.
- **RB (preview/admin + approve):** G1–G7 후보를 published로 뒤집는 유일한 경로는 명시적 사람 approve 이벤트(G8); `approved_by` 기록.
- **RB (audit + verify):** hash-chained `_events` writer + `verify_audit()`; git을 중복 증인으로; 모든 라이브 artifact에 대해 "왜 공개 가능했는지 + 누가 승인했는지"를 재구성.
</parameter>
</invoke>
