# RB-042: 내부 curator preview/approve 표면 구축

- **Status:** ready
- **Phase:** phase-4-interfaces-and-stubs
- **Depends on:** [RB-010 (core gate + re-check), RB-030 (git write + versioning + tombstones), RB-040 (public-projection render), RB-041 (emit-time validator)]
- **Implements design:** [../../06-interfaces/preview-admin_ko.md](../../06-interfaces/preview-admin_ko.md), [../../01-decisions/ADR-0001-product-surface-and-delivery_ko.md](../../01-decisions/ADR-0001-product-surface-and-delivery_ko.md), [../../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md](../../01-decisions/ADR-0003-publishing-policy-and-public-safe-gate_ko.md), [../../01-decisions/ADR-0004-import-and-ports_ko.md](../../01-decisions/ADR-0004-import-and-ports_ko.md), [../../01-decisions/ADR-0005-storage-and-versioning_ko.md](../../01-decisions/ADR-0005-storage-and-versioning_ko.md), [../../01-decisions/ADR-0002-content-model_ko.md](../../01-decisions/ADR-0002-content-model_ko.md)
- **Produces:** 내부 전용 curator 표면 — review queue, candidate detail 뷰(public preview + internal audit pane + diff), curator 액션(approve/redact-then-approve/hold/reject/unpublish), approve→assign-semver→write-git→emit-publish-event 경로, 그리고 append-only audit log. public write 경로 없음.

## Objective

preview/admin 표면은 gate를 통과한 candidate가 검토되고 **승인**되는 **내부, curator 전용** 작업 공간이다 — candidate를 public 웹사이트와 API로 promote하는 *유일한* 경로다. "완료"의 정의 = Jimmy가 import된 candidate의 큐를 그 core re-check 결과와 함께 볼 수 있고, candidate를 정확한 public projection과 더 풍부한 internal audit pane(sidecar + raw findings) 양쪽으로 검사할 수 있으며, 발행된 latest와 diff하고, 명시적인 artifact별 결정을 내릴 수 있는 상태. 승인은 필수이며 deny-by-default다: `approved` candidate만이 git에 작성되고 발행된다. 이 표면은 git에 작성하고 rebuild를 트리거한다; **public 인터넷에서 도달 가능한 런타임 write 엔드포인트를 노출하지 않으며**, 절대 public host로 출시되지 않는다.

## Preconditions

- [ ] core public-safe re-check (RB-010)가 이 표면의 상류에서 실행되어 candidate별 findings(`pass`/`fail`/`needs-redaction`)를 생산한다 — 이 표면은 findings를 소비할 뿐, 상류의 boundary 주장에 대해 trust를 재실행하지 않는다.
- [ ] git write 경로 + semver/digest 할당 + tombstone write (RB-030)가 호출 가능하다.
- [ ] public-projection render (RB-040)와 emit 시점 validator + no-sidecar 테스트 (RB-041)가 라이브러리로 재사용 가능하다.
- [ ] 내부 전용 host/auth context가 존재한다 (TODO(open-question: hosting + auth mechanism — do not invent)).

## Steps

1. **내부 전용 경계 강제.**
   - Do: 표면을 내부 전용 app/tool로 구축한다. public CDN/host에 절대 배포되어서는 안 되며 public write 엔드포인트를 노출해서는 안 된다. CAW-04의 git repo에 작성하고 rebuild를 트리거한다; public 표면은 read-only static artifact로 유지된다.
   - Verify: 표면이 public host 설정에서 도달 불가능하다; public 대상 write 라우트가 없다; CI/deploy 설정이 이를 public deploy 대상에서 제외한다.

2. **Review queue.**
   - Do: candidate 큐를 다음 열로 렌더링한다: candidate (`{type}/{slug}` + 제안된 semver), source (`source_product` + `source_ref`), gate result (core re-check의 `pass`/`fail`/`needs-redaction`), diff (발행된 latest 대비 new artifact / new version / boundary change), status (`pending`/`held`/`approved`/`rejected`/`redacted`). 상태는 deny-by-default다.
   - Verify: seed된 candidate가 그 gate result와 함께 나타나며 자동으로 `approved`가 아닌 상태를 가진다.

3. **Candidate detail — public preview pane.**
   - Do: 웹사이트/API가 방출할 **정확한** public projection을 렌더링하며, 실제 build (RB-040/RB-041)와 **동일한** `boundary===public` assertion과 no-sidecar 테스트를 실행하여, preview가 public 표면이 보여줄 것보다 더 많은 것을 절대 보여줄 수 없게 한다.
   - Verify: preview pane 출력이 동일한 candidate의 public projection과 byte 단위로 동등하다; 비-public candidate가 실제 build에서와 동일한 assertion을 여기서도 실패시킨다.

4. **Candidate detail — internal audit pane.**
   - Do: internal 전용 audit pane을 렌더링한다: sidecar `origin_ref`/`origin_version`을 포함한 전체 provenance, raw gate findings, 그리고 re-check가 redaction 대상으로 표시한 모든 span. 이 필드들은 결정을 위해서만 표시되며 public projection으로 **절대** 직렬화되지 않는다.
   - Verify: audit pane이 sidecar 필드를 보여준다; 동일한 candidate의 public preview pane(Step 3)은 그 중 어느 것도 보여주지 않는다.

5. **Candidate detail — diff pane.**
   - Do: candidate를 현재 발행된 latest와 diff한다: 변경된 필드, body diff, 그리고 new artifact / new version / **boundary change**로의 분류. boundary change는 edit이 아니라 deprecate/unpublish/redact로 라우팅한다.
   - Verify: boundary-change candidate가 표시되어 edit 경로가 아니라 lifecycle 액션으로 라우팅된다.

6. **Curator 액션.**
   - Do: 다음을 구현한다: **Approve & publish** (semver 할당/확인; `<slug>/<semver>.md(x)` + sidecar를 git에 작성; publish event 방출); **Redact then approve** (public projection에 redaction을 적용하고, re-check를 재실행한 뒤, 승인 — raw는 내부에 유지); **Hold** (큐에 유지, git write 없음); **Reject** (이유와 함께 rejected로 표시, git write 없음); **Unpublish/redact live item** (tombstone 작성 → rebuild → 양쪽 public 표면에서 410, index/sitemap/search에서 제외). 발행된 `(slug, semver)`는 영구히 frozen이다 — 수정은 새 버전이지 결코 in-place edit이 아니다.
   - Verify: `approve` (또는 `redact then approve`)만이 git에 작성한다; hold/reject는 git write를 수행하지 않는다; unpublish는 tombstone을 작성한다; 기존 `(slug,semver)`의 재승인은 거부된다(frozen).

7. **Append-only audit log.**
   - Do: 모든 curator 액션을 append-only로 기록한다: 누가(curator), 무엇을(candidate + version + digest), 언제(timestamp), 왜(reason / gate-findings 스냅샷).
   - Verify: 각 액션이 who/what/when/why를 포착하는 불변 항목을 추가한다; 항목은 편집하거나 삭제할 수 없다.

8. **Rebuild / deploy 트리거.**
   - Do: approve/unpublish/redact 시, static artifact를 rebuild + redeploy하기 위해 `SiteAndApiSinkAdapter`가 소비하는 **publish event**를 방출한다 (TODO(open-question: webhook vs CI-on-git-push vs scheduled)).
   - Verify: approve가 public artifact의 rebuild를 트리거하는 정확히 하나의 publish event를 방출한다.

## Acceptance criteria

- [ ] 표면이 내부 전용이며, public host에 절대 존재하지 않고, public write 경로가 없다.
- [ ] 큐가 core re-check findings를 보여준다; 아무것도 자동 승인되지 않는다(deny-by-default).
- [ ] public-preview pane이 실제 build와 동일한 `boundary===public` assertion + no-sidecar 테스트를 실행하며 public 표면보다 더 많은 것을 보여줄 수 없다.
- [ ] audit pane이 sidecar/raw-findings를 보여준다; 그 필드들은 public projection에 절대 도달하지 않는다.
- [ ] `approved` (redact-then-approve 포함) candidate만이 git에 작성되고 발행된다.
- [ ] approve가 semver를 할당/확인하고 `<slug>/<semver>.md(x)` + sidecar를 작성한다; 발행된 `(slug,semver)`는 영구히 frozen이다.
- [ ] Unpublish/redact가 tombstone을 작성한다 → 웹사이트 + API에서 410 → index/sitemap/search에서 제외.
- [ ] 모든 액션이 append-only who/what/when/why audit log에 포착된다.

## Rollback / safety

- 이 표면은 git write를 제안할 뿐이다; 잘못된 승인은 새 버전이나 unpublish/redact tombstone으로 수정되며 — frozen된 `(slug,semver)`의 in-place edit으로는 절대 수정되지 않는다.
- curator 승인은 **인간** gate 계층이다; 이는 machine gate를 대체하지 않는다. 승인된 candidate가 비-public boundary를 지니거나 sidecar 필드를 유출하면, build 시점 assertion과 emit 시점 validator (RB-040/RB-041)가 **fail closed**된다 — public 표면은 구조상 public-safe로 유지된다.
- 표면 자체가 사용 불가능하면, 발행이 일어나지 않는다(deny-by-default); public artifact는 영향받지 않는다.

## Hand-off

- `SiteAndApiSinkAdapter`에 전달된 publish event가 RB-040 (website)과 RB-041 (API) rebuild를 구동한다.
- RB-043 (MCP + stubs)이 등록된 stub 어댑터를 이 admin UI에 노출한다(각각 `registry.list()`에 나타난다), 그러나 어떤 stub도 `active`로 승인될 수 없다.
- unpublish 시의 Lifecycle/cache invalidation은 RB-030 ops가 소유한다; 이 표면은 이를 트리거할 뿐이다.
