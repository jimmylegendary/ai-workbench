# RB-042: 선택적 read-only knowledge viewer 구축

- Status: ready
- Phase: phase-4-interfaces
- Depends on: [RB-040 (read API: search/get/verify_audit), RB-031 (trust/boundary labels), RB phase-3 retrieval (hydrated chain, pre-rank filters)]
- Implements design:
  - [../../06-interfaces/knowledge-viewer.md](../../06-interfaces/knowledge-viewer_ko.md)
  - [../../06-interfaces/api-and-mcp.md](../../06-interfaces/api-and-mcp_ko.md) (read path, scopes)
  - [../../01-decisions/ADR-0001-product-surface-and-skill-interface.md](../../01-decisions/ADR-0001-product-surface-and-skill-interface_ko.md)
  - [../../09-roadmap/milestones-and-phases.md](../../09-roadmap/milestones-and-phases_ko.md) (P7 read-only viewer; 마지막 인터페이스 서피스로 여기서 구축)
- Produces: Source/Claim/Evidence/Note와 그 provenance edge를 trust/boundary/visibility 배지와 함께 탐색하는 최소한의 **read-only** 웹 viewer로, **오직** API를 통한 `kr.search`/`kr.get`/`kr.verify_audit`로만 뒷받침된다. 명시적으로 **write 경로 없음**, **직접 store 접근 없음**. 제품에 영향 없이 삭제 가능.

## 목표
"완료(Done)" = Jimmy와 팀이 엔티티를 검색·탐색하고, `Source→Claim→Evidence→Note` provenance chain을 따라가며, trust + boundary + visibility 배지를 읽을 수 있는 선택적 최소 viewer가 존재한다 — 모두 boundary 필터링된 read API로만 제공된다. viewer는 비즈니스 로직을 갖지 않고, SQL을 발행하지 않으며, markdown/SQLite/`_events/`를 직접 읽지 않고, create/edit/delete/approve/import/export 컨트롤이 없다. 다른 모든 reader와 동일한 actor 스코프, boundary 필터링 read 경로를 재사용하므로 구조적으로 confidential하거나 클리어런스 범위 밖 항목을 노출할 수 없으며, 생성된 Note를 절대 Evidence로 배지하지 않는다. viewer는 core에 아무 영향 없이 삭제 가능하다.

## 사전 조건
- [ ] RB-040이 반영되었다: `GET /v1/search`, `GET /v1/entities/{id}`, `GET /v1/audit/verify`가 존재하고, `readOnlyHint:true`이며, 랭킹 **이전**에 boundary/visibility 필터를 적용하고, hydrate된 provenance chain + trust/boundary/visibility 라벨을 반환한다.
- [ ] RB-031이 반영되었다: trust ladder(T0–T3 + contested), AI 작성 T2 cap, `boundary`/`visibility` 라벨이 read op에서 반환된다.
- [ ] viewer가 운반할 `kr:read`를 가진 actor 자격 증명이 사용 가능하다(특별한 viewer 권한 없음).
- [ ] Tree가 green이다.

## 단계

1. **자체 store가 없는 최소 read-only 앱을 스캐폴드한다.**
   - 할 일: 작은 웹 앱을 만든다(의도적으로 최소화 — TODO(open-question: read API 위의 SSR vs 작은 SPA, [knowledge-viewer.md §6](../../06-interfaces/knowledge-viewer_ko.md) 참조)). 데이터베이스가 없고, 뷰잉 actor의 `kr:read` API 자격 증명을 운반하는 것 외에 자체 auth 시스템이 없으며, 상태가 없다. 자체적으로 삭제 가능한 모듈/패키지에 위치함을 확인한다.
   - 검증: viewer 모듈을 삭제하고 재빌드해도 core, CLI, API, MCP, 테스트가 모두 green으로 남는다(진정으로 선택적임을 증명).

2. **데이터 소스를 필터링된 read 경로로 제한한다.**
   - 할 일: **오직** `GET /v1/search`, `GET /v1/entities/{id}`, `GET /v1/audit/verify`만 호출하는 얇은 클라이언트를 구현한다. (구성 + lint/test로) markdown 파일, SQLite 인덱스, `knowledge/_events/`에 대한 직접 접근과 write/import/export op 호출을 금지한다.
   - 검증: grep/정적 검사가 viewer에서 파일시스템이나 SQLite 접근, write/import/export op 참조를 찾지 못한다; 모든 네트워크 호출은 세 read 라우트만 대상으로 한다.

3. **Search 뷰를 구축한다.**
   - 할 일: 쿼리 박스와 일급 필터(`type`, `boundary`, `visibility`, `trust`, `concept`)를 `kr.search` 파라미터에 연결하여 렌더링한다. 결과 행은 id, title/summary, trust + boundary 배지를 보여준다. 필터는 core로 전달된다(거기서 랭킹 전 적용) — viewer는 로컬에서 재필터링이나 재랭킹을 하지 않는다.
   - 검증: `--` 등가 필터로 검색하면 동일 actor에 대해 `kr query`와 동일한 hit 집합을 반환한다; 필터링되어 제외된 `private`/`confidential` 항목은 결과에 절대 나타나지 않는다.

4. **Entity 상세 + Provenance chain 뷰를 구축한다.**
   - 할 일: 초점 엔티티에 대해 `kr.get`을 통해 frontmatter 필드 + markdown 본문 + 타입 지정 edge를 렌더링한다. `Source→Claim→Evidence→Note` 그래프를 타입 지정 edge와 함께 렌더링하는 provenance-chain 뷰를 추가한다: Claim은 첨부된 Evidence(구체적 artifact ref와 함께)를 보여주고, Note는 인용하는 Claim을 보여주되 **생성된 것이며 evidence가 아님을 명확히 표시**한다. 엔티티 id로 deep-linking을 지원한다.
   - 검증: Claim을 열면 실제 artifact ref와 함께 Evidence를 보여준다; Note를 열면 인용된 Claim과 "Generated note (not evidence)" 마커를 보여준다; id로의 deep link는 해당 엔티티를 렌더링한다.

5. **core 필드로부터 정확히 배지를 렌더링한다(계산 없음, 오버라이드 없음).**
   - 할 일: [knowledge-viewer.md §4](../../06-interfaces/knowledge-viewer_ko.md)의 배지 집합을 렌더링한다: Trust(T0–T3 / contested, 색상 ladder, contested는 시각적으로 구별), Boundary(public/internal/confidential, confidential은 가장 강한 마커), Visibility(team/private, private 구별), Authoring(human/agent, agent는 T2-cap 노트 표시), Evidence 플래그("Evidence" vs "Generated note (not evidence)"). viewer는 core가 반환하는 필드만 렌더링한다 — trust/boundary를 계산하거나 오버라이드하지 않는다.
   - 검증: AI가 작성한 노드는 T2-cap 노트를 표시하고 절대 더 높은 티어를 표시하지 않는다; `contested` 항목은 시각적으로 구별된다; Note는 절대 "Evidence" 배지를 받지 않는다.

6. **Audit 뷰(read-only).**
   - 할 일: 엔티티의 append-only 이력 + `supersedes` lineage와 `kr.verify_audit`에서 가져온 "chain ok / tampered" 표시기를 보여준다. 교정 컨트롤 없음.
   - 검증: audit 뷰는 변조되지 않은 엔티티에 대해 "chain ok"를 보고한다; 검증 결과를 제시하되 어떤 write/fix 동작도 제공하지 않는다.

7. **음성 / 누출 테스트.**
   - 할 일: (a) 클리어런스 부족 actor의 viewer 세션이 confidential 항목을 노출할 수 없고(동일한 boundary 필터링 read 경로 사용), (b) Note가 절대 Evidence로 표시되지 않음을 검증하는 테스트를 추가한다. viewer가 write/import/export affordance를 노출하지 않음을 단언하는 테스트를 추가한다.
   - 검증: 두 누출 테스트가 통과한다; affordance 테스트는 렌더링된 UI에 create/edit/delete/approve/import/export 컨트롤이 없음을 확인한다.

## 수용 기준
- [ ] viewer는 read-only이다: create/edit/delete/approve/import/export 컨트롤이나 라우트 없음.
- [ ] viewer는 **오직** `kr.search`/`kr.get`/`kr.verify_audit`로만 읽는다; 직접 markdown/SQLite/`_events/` 접근 없음(test/lint로 강제).
- [ ] Search, Entity 상세, Provenance chain, Audit 뷰가 올바르게 렌더링된다; provenance chain은 Claim→Evidence 불변식을 가시화한다.
- [ ] trust/boundary/visibility/authoring/evidence 배지는 core가 반환한 필드로만 렌더링된다; 클라이언트 측 계산이나 오버라이드 없음; Note는 절대 Evidence로 배지되지 않는다.
- [ ] 클리어런스 부족 actor는 viewer를 통해 confidential/private 항목을 노출할 수 없다(누출 테스트 통과).
- [ ] viewer 모듈은 tree의 나머지가 green으로 유지된 채 삭제 가능하다(진정으로 선택적).
- [ ] 이 체크포인트에서 tree가 green이다.

## 롤백 / 안전
- viewer는 자체 store가 없는 분리되고 선택적이며 무상태인 모듈이다; 삭제해도 knowledge store, 인덱스, audit log를 손상시키거나 변경할 수 없다. 롤백 = 모듈 제거 후 재빌드.
- read-only이고 boundary 필터링 read 경로를 사용하므로 실패 시 되돌릴 write나 누출 경로가 없다; viewer 충돌은 탐색에만 영향을 주며 데이터 무결성에는 절대 영향이 없다.

## 인계
- 이로써 P4 인터페이스 서피스(API + MCP + CLI + 선택적 viewer)가 완성된다. Phase-5 import/export runbook은 모든 read/write 서피스가 단일 core를 통해 라우팅되며 viewer가 boundary 횡단에 절대 참여하지 않음(import/export는 core의 게이트된 op을 통해서만 발생)을 가정할 수 있다.
- 사람을 위한 미래의 "propose" 경로(TODO(open-question, ADR-0001) — brief §9는 v1에서 read-only라고 명시)는 viewer가 아닌 core write op을 거쳐야 한다.
