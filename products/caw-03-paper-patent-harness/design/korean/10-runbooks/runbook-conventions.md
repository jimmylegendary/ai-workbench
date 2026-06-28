# Runbook Conventions — CAW-03

- **Status:** draft
- **Owner:** Jimmy
- **Audience:** AI 빌더
- **Source of truth:** ../_meta/PRODUCT-BRIEF_ko.md · ../_meta/DOC-CONVENTIONS_ko.md §6

## 계약(contract)

모든 runbook은 DOC-CONVENTIONS §6을 따른다:

```
# RB-XXX: <imperative title>
- Status: ready | blocked
- Phase: <folder>
- Depends on: [RB-###, ...]
- Implements design: [links]
- Produces: <artifacts/components>

## Objective / Preconditions / Steps (Do:+Verify:) / Acceptance criteria / Rollback / Hand-off
```

## CAW-03에 특화된 빌더 규칙

- **PaperOrchestra를 다시 만들지 말 것.** 이는 v1 `WritingEngineAdapter`로, subprocess로 호출된다. port 뒤의
  black box로 취급한다.
- **Governance는 core에 있으며 adapter에는 절대 두지 않는다.** gate, patent-first interlock, confidentiality는
  반드시 core 서비스에서 실행되어야 한다. adapter(또는 stub, 또는 오작동하는 fake)는 결코 이를 우회할 수 없어야 한다.
- **생성된 텍스트는 결코 evidence가 아니다.** 구조적으로 강제한다(prose evidence 필드 없음; artifact_ref는 반드시 resolve되어야 함).
- **Ports first, adapters second.** 실제 adapter를 만들기 전에 5개의 port + registry + preflight + fake를 먼저 빌드한다.
- **미래 connector를 위한 documented stub**(internal wiki, experiment-server, venue, filing): interface +
  `implemented:false` descriptor + config 예시를 제공한다. governance를 떨어뜨리는 조용한 no-op은 절대 안 된다.
- CAW-01/CAW-02 데이터는 **복사하지 말고 참조**한다(id/URI). 공유 store 없음.
- publish/filing에는 **human gate**를 둔다. 결코 자율적이지 않다.
- 각 Acceptance 체크포인트에서 트리를 green 상태(컴파일됨, lint+test 통과)로 유지하여 중단된 빌드가 재개될 수 있게 한다.

## Verify 어휘

`cmd:` shell exit/output · `test:` unit/contract/e2e test · `view:` 수동/시각적 확인.
