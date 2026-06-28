# Ports & Adapters (Open Integration Seams) — CAW-03

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [../03-architecture/component-boundaries.md](../03-architecture/component-boundaries_ko.md), [../02-research/ports-and-adapters-architecture.md](../02-research/ports-and-adapters-architecture_ko.md), [../01-decisions/ADR-0005-ports-and-adapters.md](../01-decisions/ADR-0005-ports-and-adapters_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적

가장 핵심적인(load-bearing) 설계 속성: CAW-03은 hexagonal 구조입니다 — core는 오직 **typed ports**에만 의존하며,
모든 외부 시스템(inputs, engines, outputs, signals)은 config로 선택되는 **adapter**입니다. 향후 통합
(internal wiki, internal experiment-server, venue submission, patent filing)은 단 하나의 adapter를 구현함으로써
**core를 변경하지 않고** 연결됩니다.

## 다섯 개의 port

| Port | 역할 | v1 adapters | 향후 adapters (v1에 문서화된 stub) |
| --- | --- | --- | --- |
| `SourceAdapter` | claim+evidence 번들 + result refs 제공 | CAW-02 bundle, CAW-01 results | **internal wiki**, **internal experiment-server**, 임의 사용자 번들 |
| `WritingEngineAdapter` | 논문 drafting | PaperOrchestra | 기타 엔진 |
| `PatentEngineAdapter` | 특허 drafting | v1 baseline | 외부 patent 도구 |
| `Sink`/`PublishAdapter` | 출력 emit | LaTeX/PDF | **internal wiki publish**, venue submission, patent filing |
| `Novelty`/`RadarAdapter` | related-work + threat signals | citation_pool + CAW-05 | live prior-art / patent search |

## Adapter 계약

모든 adapter는 **capability descriptor** + 그 operation을 노출합니다:

```ts
interface Adapter { capabilities(): Descriptor }   // { id, port, version, configSchema, features }
// + the port-specific method (fetch / draft / publish / signals)
```

## Config 기반 registry + preflight

- adapter는 **등록(registered)**되고 **config**로 선택됩니다(각 port를 어떤 adapter가 구현하는가). 결코 하드코딩되지 않습니다.
- 사용 전에 registry는 **preflight**를 실행합니다: adapter의 `configSchema`를 검증하고, version/feature
  호환성을 확인하며, 호환되지 않는 adapter를 거부합니다.
- Secrets/auth는 adapter별 **env refs**로 참조됩니다(공유 런타임 substrate 없음).

```yaml
# config example
ports:
  source:   [ { id: caw02-bundle }, { id: caw01-results } ]   # fan-in (precedence: TODO)
  engine:   { id: paperorchestra, version: ">=x.y" }
  patent:   { id: baseline-patent }
  sink:     { id: latex-pdf }
  novelty:  { id: caw05-radar }
```

## 문서화된 stub 패턴 (open seam)

향후 connector는 지금 **stub adapter**로 출하됩니다: 인터페이스 + `not-implemented` 마커 + config 예시 +
`implemented: false`를 광고하는 capability descriptor. 이를 선택하는 것은 허용되지만 preflight는 이를
no-op/unavailable로 안전하게 보고합니다. **나중에 실제 connector를 연결하는 것 = 그 하나의 adapter를 채우는 것.** 예시 대상:
`source/internal-wiki`, `source/experiment-server`, `sink/internal-wiki-publish`, `sink/venue-submission`,
`sink/patent-filing`, `novelty/live-prior-art`.

## adapter가 governance를 약화시킬 수 없음

Gates, patent-first interlock, confidentiality는 adapter 호출 주변의 **core**에서 실행됩니다. 오작동하거나
악의적인 adapter도 이를 우회할 수 없습니다 ([../03-architecture/component-boundaries.md](../03-architecture/component-boundaries_ko.md)).

## 미해결 질문(Open questions)

Source fan-in precedence + provenance 병합; sync 대 async (job-handle) 엔진 실행; adapter discovery 메커니즘 +
SemVer/compat 정책; Novelty가 하나의 port인지 분리(related-work 대 radar)인지 여부 —
[../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) 참조.

## 런북에 대한 함의

전용 런북이 다음을 구축합니다: (1) ports + value objects + fakes, (2) registry + config + preflight, (3) v1
adapters, (4) brief가 요구하는 문서화된 stub들. 이것이 wiki/exp-server 통합을 저렴하게 유지하는 seam입니다.
