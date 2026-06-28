# 런북 컨벤션 — CAW-03

- **Status:** draft
- **Owner:** Jimmy
- **Audience:** AI 빌더
- **Source of truth:** ../_meta/PRODUCT-BRIEF_ko.md · ../_meta/DOC-CONVENTIONS_ko.md §6

## 계약(The contract)

모든 런북은 DOC-CONVENTIONS §6을 따른다:

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

- **PaperOrchestra를 다시 만들지 말 것.** 그것은 v1 `WritingEngineAdapter`이며, 서브프로세스로 호출된다. 포트 뒤의
  블랙박스로 취급하라.
- **거버넌스는 core에 있으며, 절대 adapter에 두지 않는다.** 게이트, patent-first interlock, confidentiality는
  core 서비스에서 실행되어야 한다. adapter(또는 stub, 또는 오작동하는 fake)가 이를 우회할 수 있어서는 절대 안 된다.
- **생성된 텍스트는 결코 evidence가 아니다.** 구조적으로 강제하라(prose evidence 필드 없음; artifact_ref는 반드시 해석(resolve)되어야 함).
- **포트 먼저, adapter는 그다음.** 실제 adapter를 만들기 전에 5개의 port + registry + preflight + fake를 빌드하라.
- **미래의 커넥터를 위한 documented stub**(internal wiki, experiment-server, venue, filing): 인터페이스
  + `implemented:false` descriptor + config 예시를 함께 제공하라. 거버넌스를 떨어뜨리는 조용한 no-op은 절대 안 된다.
- CAW-01/CAW-02 데이터는 **복사하지 말고 참조**하라(id/URI). 공유 store 없음.
- publish/filing에는 **human gate**가 있다. 절대 자율적으로 하지 않는다.
- 각 Acceptance checkpoint에서 트리를 green 상태(컴파일됨, lint+test 통과)로 유지하여 중단된 빌드가 재개될 수 있게 하라.

## Verify 어휘

`cmd:` shell exit/output · `test:` unit/contract/e2e test · `view:` 수동/시각적 확인.
