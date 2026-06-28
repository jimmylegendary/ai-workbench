# Dependency Graph

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set review date)
- **Related:**
  - [./milestones-and-phases_ko.md](./milestones-and-phases_ko.md)
  - [./risks-and-mitigations_ko.md](./risks-and-mitigations_ko.md)
  - [../01-decisions/ADR-0004-import-and-ports.md](../01-decisions/ADR-0004-import-and-ports_ko.md)
  - [../01-decisions/ADR-0005-storage-and-versioning.md](../01-decisions/ADR-0005-storage-and-versioning_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적

이 문서는 CAW-04의 **빌드 순서 DAG**를 명시한다: 어떤 역량이 다른 것보다 먼저 존재해야 하는가.
이 순서는 임의적이지 않다 — 공개 표면을 **구조적으로 public-safe**하게 만드는 것이 바로 이 순서다.
이 문서는 phase/milestone을 할당하지 않는다(see [milestones-and-phases.md](./milestones-and-phases_ko.md)).

## DAG가 강제하는 invariant

| Invariant | 이를 강제하는 edge |
|-----------|----------------------|
| 어떤 adapter도 gate를 우회할 수 없음 | ports + registry + **gate**가 adapter보다 먼저 빌드됨 |
| identity & immutability를 갖기 전에는 아무것도 빌드/제공되지 않음 | content model + **storage/versioning**이 build보다 먼저 |
| core 재검사 없이는 아무것도 발행되지 않음 | **import + re-check**가 publish보다 먼저 |
| 주소 지정 가능 이력 없이는 mutation 없음 | **versioning**이 모든 update/unpublish 경로보다 먼저 |
| Audit 필드는 절대 유출되지 않음 | sidecar 분리(content model 내)가 build/serialize보다 먼저 |

## ASCII DAG

```
                          ┌──────────────────────────┐
                          │ A. Content model (8 ents) │
                          │  common fields + SIDECAR  │  (ADR-0002)
                          └─────────────┬─────────────┘
                                        │
              ┌─────────────────────────┼──────────────────────────┐
              v                         v                          v
   ┌────────────────────┐   ┌────────────────────┐    ┌─────────────────────┐
   │ B. Hexagonal core  │   │ C. Config-driven   │    │ D. Storage &        │
   │    + TWO ports     │   │    adapter         │    │    versioning       │
   │  (ADR-0004)        │   │    registry        │    │  git + semver +     │
   └─────────┬──────────┘   └─────────┬──────────┘    │  content-digest     │
             │                        │               │  + sidecar persist  │
             v                        │               │  (ADR-0005)         │
   ┌────────────────────┐            │               └──────────┬──────────┘
   │ E. Publish GATE    │<───────────┘                          │
   │ deny-by-default;   │                                       │
   │ public-safe RE-    │                                       │
   │ CHECK = CORE stage │                                       │
   │ (ADR-0003)         │                                       │
   └─────────┬──────────┘                                       │
             │                                                  │
             v                                                  │
   ┌────────────────────┐                                       │
   │ F. ContentSource   │  upstream boundary claim = EVIDENCE   │
   │    adapters (v1)    │  ONLY; writes git AFTER re-check     │
   │  CAW-02, CAW-03     │                                       │
   │  (ADR-0004/0005)    │                                       │
   └─────────┬──────────┘                                       │
             │                                                  │
             └───────────────┬──────────────────────────────────┘
                             v
                  ┌─────────────────────┐
                  │ G. Build (Astro 5 + │   reads frozen git content
                  │  Starlight SSG)     │   (ADR-0006)
                  │  static artifact    │
                  └─────────┬───────────┘
                            │
              ┌─────────────┼──────────────┐
              v             v              v
     ┌──────────────┐ ┌───────────┐ ┌──────────────┐
     │ H. Website   │ │ I. REST   │ │ J. MCP view  │
     │   (HTML)     │ │  API JSON │ │  + SKILL.md  │
     │              │ │  + raw md │ │  + index.json│
     │  PublishSink │ │  (ADR-0007)│ │              │
     └──────┬───────┘ └─────┬─────┘ └──────┬───────┘
            └───────────────┼──────────────┘
                            v
                  ┌─────────────────────┐
                  │ K. Lifecycle ops    │  needs versioning (D)
                  │  unpublish/redact   │  + published surfaces (H/I/J)
                  │  HTTP 410 tombstone │  (ADR-0003/0005)
                  │  + cache invalidate │
                  └─────────────────────┘
```

## Edge 목록(machine-checkable)

| From | To | Reason |
|------|----|--------|
| A | B, C, D | core, registry, storage 모두 typed model에 의존 |
| A | (sidecar) → G | serialize-time 분리가 build 전에 존재해야 함 |
| B, C | E | gate는 core에 위치; registry가 adapter를 공급 |
| D | E | gate는 storage를 통해 write; versioned identity 필요 |
| E | F | adapter는 gate / re-check 뒤에서만 실행 가능 |
| D | F | ContentSource는 re-check 후에 git에 write |
| F, D | G | build는 동결된, versioned git 콘텐츠를 read |
| G | H, I, J | 하나의 build가 세 표면을 모두 방출(web/API parity) |
| D | K | unpublish/redact는 versioning + tombstone identity 필요 |
| H, I, J | K | lifecycle은 이미 발행된 표면에 작용 |

## Milestone M1까지의 critical path

```
A → D → (B,C → E) → F → G → {H, I}
```

M1(검증된 Skill 하나 → gate → versioned 웹 페이지 + API 리소스)은 이 경로상의 모든 노드를 필요로 한다;
J/K는 M1 critical path에 있지 않지만 곧바로 뒤따른다.

## 병렬화 가능한 작업

| 병렬 실행 가능 | 제약 |
|---------------------|-----------|
| C(registry) ∥ D(storage) | 둘 다 A만 필요 |
| H, I, J(surface emitter) | 모두 G 뒤에 gate됨; 하나의 build, 병렬 writer |
| Stub 문서화(미래 adapter) | B/C 이후 언제든; 코드 의존성 없음 |

## Open Questions

- MCP view(J)가 M1 안에 출시되는가 M2에 출시되는가 — TODO(open-question).
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md).

## runbook에 대한 함의

- runbook을 이 DAG로 위상 정렬하라; gate runbook보다 adapter runbook을 절대 먼저 스케줄하지 말라.
- G→{H,I,J} fan-out은 세 개의 파이프라인이 아니라 병렬 sink writer를 가진 단일 build runbook이다.
