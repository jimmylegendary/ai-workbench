# Adapter Registry & Config — CAW-03

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [../05-harness-core/ports-and-adapters.md](../05-harness-core/ports-and-adapters_ko.md), [../01-decisions/ADR-0005-ports-and-adapters.md](../01-decisions/ADR-0005-ports-and-adapters_ko.md), [api-surface.md](./api-surface_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

각 port에 대해 adapter를 발견(discover)하고, preflight하며, 선택하는 config 기반 registry로, 열린 seam을 안전하면서도 커스터마이즈 가능하게 유지하는 메커니즘이다.

## Responsibilities

| Step | Behavior |
| --- | --- |
| **Discover** | port별로 등록된 adapter를 열거한다 (entry-point group 또는 config manifest — TODO) |
| **Select** | config에 따라 port별 adapter를 선택한다 (SourceAdapter는 fan-in 허용) |
| **Preflight** | adapter의 `configSchema`를 검증하고, 버전/기능 호환성을 확인하며, 호환되지 않으면 거부한다 |
| **Instantiate** | adapter별 secret을 **env refs**를 통해 주입한다 (공유 substrate 없음) |
| **Stub handling** | 문서화된 stub은 선택 가능하지만 preflight가 `implemented: false`를 보고한다 → 안전한 no-op/사용 불가 처리 |

## Config

```yaml
ports:
  source:  [ { id: caw02-bundle }, { id: caw01-results } ]   # fan-in; precedence: TODO(open-question)
  engine:  { id: paperorchestra, version: ">=x.y" }
  patent:  { id: baseline-patent }
  sink:    { id: latex-pdf }
  novelty: { id: caw05-radar }
profiles:
  gate:    { ... }       # gate thresholds per claim type
  confidentiality: { ... }
```

## Capability descriptor

```ts
type Descriptor = { id, port, version, features: string[], configSchema: ZodSchema, implemented: boolean }
```
Preflight = config를 `configSchema`에 대해 검증 + `features`/`version`이 core의 요구사항을 충족하는지 단언(assert).

## Governance guarantee

registry는 adapter가 core의 gate/interlock/confidentiality를 절대 override하지 못하게 한다. adapter는 오직 데이터/엔진만 공급한다 ([../03-architecture/component-boundaries.md](../03-architecture/component-boundaries_ko.md)).

## Open questions

Discovery 메커니즘 (entry-point vs manifest); SemVer/compat 정책; source fan-in precedence; adapter별 secret 모델 — [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) 참고.

## Implications for runbooks

registry runbook은 v1 adapter가 도착하기 전에 discovery + preflight + config 선택 + stub handling을 구현한다.
