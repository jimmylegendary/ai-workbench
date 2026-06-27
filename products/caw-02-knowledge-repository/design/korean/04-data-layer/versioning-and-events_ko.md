# Versioning & Events — append-only + supersedes, _events 원장, 감사로서의 git

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./data-model_ko.md](./data-model_ko.md)
  - [./storage-strategy_ko.md](./storage-strategy_ko.md)
  - [./provenance-and-boundaries_ko.md](./provenance-and-boundaries_ko.md)
  - [../01-decisions/ADR-0002-storage_ko.md](../01-decisions/ADR-0002-storage_ko.md)
  - [../01-decisions/ADR-0004-provenance-and-trust_ko.md](../01-decisions/ADR-0004-provenance-and-trust_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF_ko.md

## 목적
이 문서는 **CAW-02가 시간에 따른 변화를 어떻게 기록하는지**를 확정한다. 즉 append-only + `supersedes`
모델(update/delete 없음), append-only `knowledge/_events/*.jsonl` 원장, 감사 기반(substrate)으로서의 git
이력, 그리고 **skill 인터페이스 밖에서** 이루어진 편집이 reindex 시 어떻게 조정되는지다. 이는
[ADR-0002](../01-decisions/ADR-0002-storage_ko.md)와
[ADR-0004](../01-decisions/ADR-0004-provenance-and-trust_ko.md)를 구체화한다. 엔티티 필드(see
[data-model](./data-model_ko.md))나 인덱스 메커니즘(see [storage-strategy](./storage-strategy_ko.md))은
재정의하지 않는다.

## 1. Append-only + supersedes (update 없음, delete 없음)
지식은 **결코 제자리에서 변경되지 않는다**. 정정은 새 content-addressed id를 가진 **새 노드**이며, 이전
버전과 `supersedes` edge로 연결된다. 삭제는 논리적(`rejected`/`superseded` status)이며 결코 물리적이지 않다
— 이력에서 아무것도 잃지 않는다.

| 작업 | 실제로 일어나는 일 |
|---|---|
| "claim 편집" | `supersedes: <old id>`를 가진 새 `clm_*` 노드(새 id) 작성; 옛 노드는 남고 `status=superseded` |
| "claim 삭제" | `status=rejected`인 새 버전(+ `provenance_event` 사유); 노드는 감사를 위해 남음 |
| "evidence 오타 수정" | 옛 것을 supersede하는 새 `evd_*` 버전; artifact 포인터/locator는 정정되지 덮어쓰이지 않음 |
| "boundary 재분류" | `reclassify` provenance_event(boundary 변경 자체가 append-only — see provenance doc §3) |

```yaml
# clm_2026_b9 supersedes clm_2026_a1
id:         clm_2026_b9xk...
supersedes: clm_2026_a1q7...
status:     accepted
# the superseded node is updated only in its status field via a NEW event, never content-mutated:
#   clm_2026_a1q7 -> status: superseded   (recorded as a supersede event, original content_hash preserved in history)
```

**reader는 supersedes 체인을 resolve하여** 최신 버전을 찾는다; 체인 자체가 편집 이력이며 edge로 또는
git-blame을 통해 걸을 수 있다.

`TODO(open-question: how status flips on a superseded node are recorded without violating "no in-place mutation" — likely a status-only event whose prior value lives in git history; confirm.)`

## 2. _events JSONL 원장
모든 skill-wrap write는 `knowledge/_events/<ts>-<op>.jsonl`에 **한 줄**을 append한다. 이는 commit되고(source
of truth의 일부), append-only이며, reindex 시 인덱스 `event` 테이블로 미러링된다.

```jsonl
{"seq":1,"ts":"2026-06-27T10:04:11Z","op":"add_source","node":"src_2026_aa","prov":"pe_2026_01","by":"human:jimmy","hash":"blake3:7c.."}
{"seq":2,"ts":"2026-06-27T10:05:02Z","op":"extract_claim","node":"clm_2026_a1","prov":"pe_2026_02","by":"skill:extract-claims","hash":"blake3:9f.."}
{"seq":3,"ts":"2026-06-27T10:06:40Z","op":"attach_evidence","node":"evd_2026_77","edges":[["evd_2026_77","clm_2026_a1","evidence_for"]],"prov":"pe_2026_03","by":"skill:attach-evidence","hash":"blake3:2c.."}
{"seq":4,"ts":"2026-06-27T11:00:00Z","op":"supersede","node":"clm_2026_b9","supersedes":"clm_2026_a1","prov":"pe_2026_04","by":"human:jimmy","hash":"blake3:de.."}
```

| 필드 | 의미 |
|---|---|
| `seq` | 단조 시퀀스(replay 시 `ts` 순서로부터 할당) |
| `op` | 트랜잭션 종류: `add_source\|extract_claim\|attach_evidence\|synthesize_note\|classify_signal\|supersede\|reclassify\|review\|reject` |
| `node` | 작성된 노드 |
| `edges` | 이 트랜잭션에서 생성된 edge(선택) |
| `prov` | `provenance_event` id(누가/무엇이/언제 — provenance doc §6) |
| `hash` | drift 감지를 위한, 작성된 노드의 `content_hash` |

원장은 store의 **replay 가능한 척추(spine)**다: continual learning(v0 아님)과 미래의 모든 감사가 이를 직접
읽는다. 이는 git 이력을 미러링할 뿐 — 결코 대체하지 않는다.

## 3. 두 개의 append-only 원장, 하나의 진실
| 원장 | 입도(granularity) | 권위 | 강점 |
|---|---|---|---|
| git 이력(서명된 commit, blame) | commit/파일별 | 기록의 감사 | tamper-evident, human-diffable, 제품 재작성에도 생존 |
| `_events/*.jsonl` | 지식 트랜잭션별 | replay 척추 | machine-replayable, 구조화, 의미론적 op 이름 |

이들은 **설계상 중복적(redundant)**이다: git은 byte 수준에서 "누가 이 파일을 언제 바꿨는가"에 답하고,
`_events`는 의미론 수준에서 "어떤 지식 트랜잭션이 일어났는가"에 답한다. 건강한 store는 둘을 일관되게
유지한다(모든 event 줄이 commit된 파일 변경에 대응). 발산(divergence)은 조정 신호다(§4).

`TODO(open-question: tamper-evidence — add a hash chain over _events lines in v0, or rely on signed git commits? owned by ADR-0004.)`

## 4. Out-of-band 편집의 조정
파일이 source of truth이므로, 사람은 skill 인터페이스를 거치지 않고 `knowledge/**.md`를 직접(또는 PR/merge로)
편집할 수 있다(MAY). 이는 `_events` append와 evidence gate를 우회하므로, **reindex가 조정 지점**이다(see
[storage-strategy §5](./storage-strategy_ko.md)).

```
reindex reconciliation:
  1. parse every .md -> recompute content_hash
  2. for each node: compare hash to the last _events line for that node
       - hash matches latest event        -> in sync
       - hash differs / no event           -> OUT-OF-BAND EDIT
  3. for each out-of-band edit:
       a. RE-RUN the Claim->Evidence invariant + boundary propagation + trust recompute
       b. if invariant violated  -> reindex FAILS LOUD (the edit is rejected, not silently indexed)
       c. if invariant holds      -> synthesize a reconciliation event:
            {"op":"reconcile","node":..,"by":"oob:git","hash":..,"note":"out-of-band edit detected at reindex"}
  4. git commits provide the who/when the missing _events line lacked (blame fills the audit gap)
```

| 시나리오 | 결과 |
|---|---|
| Out-of-band 편집이 불변식을 유지 | 수용됨; `reconcile` event가 append되어 원장이 따라잡음; git-blame이 author/time 제공 |
| Out-of-band 편집이 `Claim→Evidence`를 깨뜨림(예: evidence 제거) | reindex가 **큰 소리로 실패**; 수정될 때까지 store는 inconsistent로 플래그됨 |
| Out-of-band 편집이 `boundary`를 계산된 하한 아래로 낮춤 | 전파가 하한을 재계산; 선언-하한-미만이 노출됨(provenance doc §2); 정당하려면 `reclassify` 필요 |
| 파일의 직접 삭제 | supersedes/edge 대상이 dangle; reindex가 dangling 참조를 hard error로 보고 |

이것이 정확히 ADR-0002의 미해결 위험 — "skill 인터페이스 밖의 직접 파일 편집은 `_events` 원장을 git으로부터
drift시킬 수 있다" — 이며 reindex가 그 봉쇄책이다: 결코 행을 신뢰하지 않고, 항상 재확인하며, 깨진 상태를
인덱싱하기보다 큰 소리로 실패한다.

`TODO(open-question: should a reconcile event be auto-synthesized, or should out-of-band edits require explicit operator acknowledgement before the ledger is updated?)`

## 5. v0가 의도적으로 하지 않는 것
| v0에 없음 | 이유 |
|---|---|
| 자율 자기 편집 / continual learning | brief §2/§9 — v0는 append + retrieve + skill-wrap |
| 물리적 삭제 / 이력의 hard GC | append-only 감사가 제품의 무결성 보장이다 |
| 분산 multi-writer 충돌 해결 | 팀 write는 Postgres 포팅 전까지 파일에 대한 PR/merge다(storage doc §8) |
| event에 대한 암호학적 hash-chain(서명된 git commit을 넘어서) | 연기됨; tamper-evidence open question 참조 |

## Open Questions
- `TODO(open-question: status-only flips on superseded nodes vs strict no-in-place-mutation.)`
- `TODO(open-question: tamper-evidence — hash chain over _events in v0 vs signed git commits only.)`
- `TODO(open-question: auto-synthesized reconcile event vs operator acknowledgement for out-of-band edits.)`
- `TODO(open-question: team write-concurrency model — git PR/merge vs serializing write-through API; the Postgres-port trigger.)`
- See [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md).

## 런북에 대한 함의
- **RB (write path):** append-only + supersedes; 트랜잭션당 `_events` 한 줄 + `provenance_event` 하나; 서명된 commit.
- **RB (reindex):** drift 감지(hash vs 마지막 event), 불변식 재확인, `reconcile` event 합성, 위반 시 fail-loud.
- **RB (reader/resolver):** `supersedes` 체인을 최신 버전으로 resolve; edge + git-blame으로부터 편집 이력 노출.
