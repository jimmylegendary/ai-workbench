# RB-031: 다섯 개의 FormatRenderer 출력 + citation gate 구축(generated ≠ evidence)

- Status: ready
- Phase: phase-3-ledger-and-synthesis
- Depends on: [RB-030-related-work-ledger, RB-200-classification-and-triage, RB-201-routing]
- Implements design:
  - [../../05-radar-core/synthesis-and-formats_ko.md](../../05-radar-core/synthesis-and-formats_ko.md)
  - [../../01-decisions/ADR-0001-product-surface-and-outputs_ko.md](../../01-decisions/ADR-0001-product-surface-and-outputs_ko.md)
  - [../../01-decisions/ADR-0004-classification-and-triage_ko.md](../../01-decisions/ADR-0004-classification-and-triage_ko.md)
  - [../../01-decisions/ADR-0007-export-boundaries_ko.md](../../01-decisions/ADR-0007-export-boundaries_ko.md) (paper-card/action-brief가 bundle을 공급)
- Produces: `FormatRenderer` 포트 + 다섯 adapter(`MemoRenderer`, `DigestRenderer`, `SlideOutlineRenderer`, `PaperCardRenderer`, `ActionBriefRenderer`); `Synthesizer`/`TemplateEngine`/`ProvenanceStamper` 포트; base + 다섯 child markdown 템플릿; 그리고 결정론적 **citation gate**(G1–G7).

## Objective
`Run`의 `synthesize` 스테이지는 triage·라우팅된 `Finding`을 하나의 `FormatRenderer` 포트 뒤에서 **다섯 가지 포맷**(memo, digest, slide-outline, paper-card, action-brief)의 markdown `Artifact`로 변환하며, 여기서 `Synthesizer` 단계만 비결정론적이고 *generated slot*으로 sandbox된다. 모든 artifact는 manifest(`evidence: false`)와 함께 verbatim 발췌를 생성된 산문과 구분하는 in-body 마커를 지니며, emit 이전과 export 이전에 **결정론적이고 fail-closed한 citation gate**를 통과한다. "Done"의 정의 = digest 포맷이 실제 findings로부터 주간 multi-finding 문서를 렌더링하고(M1의 주 출력); 각 생성된 사실 문장이 `[S#]` 소스 앵커로 해석되며; 인용이 실제 발췌 locator로 해석되고; `noise` finding이 절대 synthesis에 도달하지 않으며; 실패한 gate가 artifact(및 그로부터 만들어진 모든 bundle)를 중단시킨다. 생성된 요약은 절대 evidence로 emit되거나 export되지 않는다.

## Preconditions
- [ ] RB-200/RB-201이 `source_ref{uri,retrieved_at,kind}`, verbatim `excerpts[{quote,locator}]`, `title`, `classification`, `signal_vs_hype`, `watchlist_hit`, `boundary=public`, `trust`, `relates_to`, `routed_to`를 지닌 triage·라우팅된 `Finding`을 생산한다(synthesis 입력 계약, design §3).
- [ ] RB-030 ledger가 사용 가능하여 paper-card/action-brief가 export를 위해 `LedgerLink` / 외부 ref를 참조할 수 있다.
- [ ] CAW-family의 model adapter가 `Synthesizer`를 위해 연결되어 있으며, extractive(no-LLM) fallback 경로가 사용 가능하다(design §6).
- [ ] Tree가 green이다(컴파일, lint 통과).

## Steps

### 1. synthesize 스테이지 골격 정의(결정론적 척추)
- **Do:** design §1의 6단계 스테이지를 구현한다: (1) Select & Group, (2) Compose FormatRequest, (3) Generate(Synthesizer — 유일한 LLM 단계), (4) Bind template(TemplateEngine), (5) Stamp provenance(ProvenanceStamper), (6) Citation gate. 단계 1–2와 4–6은 순수 데이터 연산이다. `noise`로 분류된 finding은 Select & Group에서 걸러져 절대 synthesis에 들어가지 않는다.
- **Verify:** 한 테스트가 고정된 `Finding` 집합에 대해 스테이지를 실행하고 출력이 step-3 generated slot을 제외하고는 run 간 재현 가능함을 단언한다; 입력의 `noise` finding은 어떤 artifact에도 절대 등장하지 않는다.

### 2. base 템플릿 + manifest + banner 구현
- **Do:** 다음을 지닌 하나의 base markdown 템플릿을 작성한다: YAML frontmatter manifest(design §4.1 — `format`, `generated_by{agent,model,run_id,produced_at}`, `evidence: false`, `boundary`, `findings[]`, `sources[]`, `classification_summary`, `contract_version`); 상시 배너 `*Generated summary — not evidence. Verify against cited sources [S#].*`; 그리고 `[S#]` 참조 목록. generated 대 extracted slot은 어떤 renderer도 흐리게 만들 수 없도록 *템플릿 내에서* 구분되어야 한다.
- **Verify:** 렌더된 artifact가 배너, `evidence: false`를 가진 manifest, 해석 가능한 `[S#]` 목록을 포함한다; 한 테스트가 `boundary`가 인용된 finding들에 대한 `max()`와 같고 올릴 수만 있을 뿐 절대 내릴 수 없음을 단언한다.

### 3. 보조 포트 구현
- **Do:** `Synthesizer`(엄격한 프롬프트 계약: *generated slot만 채울 것; title/metadata/quote는 입력으로 전달되어 verbatim으로 재현되며 절대 재생성되지 않음; 모든 사실 문장은 제공된 `[S#]`를 인용*)를 LLM이 없을 때의 **extractive rule-only fallback**과 함께 연결한다; `TemplateEngine`(결정론적 data→markdown, base+child 상속); `ProvenanceStamper`(manifest §4.1 + 마커 §4.2 작성, `boundary` 계산). design §6 참조.
- **Verify:** LLM adapter를 비활성화한 상태에서도 extractive fallback이 여전히 gate를 통과하는 digest를 생산한다. 한 테스트가 `Synthesizer`가 finding 집합에 없는 새 소스를 도입할 수 없음을 단언한다.

### 4. 다섯 개의 FormatRenderer adapter 구현
- **Do:** 포트 `FormatRenderer.applies_to(group)` + `render(group, ctx) -> Artifact`와, **동일한** `Finding` group에 대한 다섯 adapter를 구현한다(finding은 *복사본*이 아니라 *뷰*다 — design §2):
  - `MemoRenderer` — finding 1개 → 문서 1개(high-salience, 특히 `novelty-threat`).
  - `DigestRenderer` — N → 문서 1개(주간 cron; **M1의 주 출력** — 먼저 구축).
  - `SlideOutlineRenderer` — N → Marp 호환 outline 1개(`---` 구분자, theme front-matter; PPTX/PDF 렌더는 downstream, v1 범위 밖 — design §7).
  - `PaperCardRenderer` — 논문/repo 1개 → 카드 1개; CAW-02 + CAW-03에 공급.
  - `ActionBriefRenderer` — task/open-question으로 라우팅된 finding 1개 → brief 1개; CAW-01/CAW-06에 공급.
  stub renderer(예: tweet-thread)는 `maturity="stub"`로 등록한다.
- **Verify:** 각 adapter의 `applies_to`가 cardinality/classification preconditions를 강제한다; 한 테스트가 `novelty-threat` finding을 memo + paper-card로, multi-finding 집합을 digest로 렌더링한다. 다섯 모두에 대해 `Artifact = {markdown, manifest, findings[], boundary, gate_result}`.

### 5. in-body provenance 마커 구현
- **Do:** 세 가지 라벨된 콘텐츠 종류를 렌더링한다(design §4.2): verbatim 발췌에 대한 `> [!quote]` + `[S#]`(`finding.excerpts[].quote`의 텍스트, 시각적으로 구분); 생성된 synthesis에 대한 plain 산문(각 사실 문장이 `[S#]`를 지님); `finding.source_ref`로 해석되는 `[S#]` 참조 목록. 생성된 paraphrase는 절대 quote로 스타일링되지 않는다.
- **Verify:** 한 테스트가 모든 `> [!quote]` 블록의 텍스트가 verbatim `finding.excerpts[].quote`와 일치하고 어떤 생성된 문장도 quote로 감싸이지 않음을 단언한다.

### 6. citation gate(G1–G7) 구현, fail-closed
- **Do:** emit 이전과 export 이전에 실행되는 결정론적 gate를 구현한다(design §5):
  - G1: 모든 생성된 사실 문장이 manifest의 `[S#]`로 해석됨 → 아니면 reject.
  - G2: 모든 `> [!quote]` locator가 실제 `finding.excerpts[].locator`로 해석됨 → 아니면 reject.
  - G3: quote span 내부에 생성된 산문 없음(paraphrase-as-quote 없음) → 아니면 reject.
  - G4: `manifest.evidence == false`이고 존재함 → 아니면 reject.
  - G5: `boundary == max(인용된 findings)`이고 `<= boundary_ceiling`, 비공개 항목 없음 → 아니면 reject + alert.
  - G6: 렌더된 모든 `finding.id`가 `manifest.findings`에 나열됨(orphan citation 없음) → 아니면 reject.
  - G7: `noise`로 분류된 finding이 존재함 → reject(절대 synthesis에 도달하면 안 됨).
  실패한 gate는 artifact를, 따라서 그로부터 만들어진 모든 bundle을 중단시킨다.
- **Verify:** negative test가 성립한다: 인용 없는 사실 주장 → reject(G1); 출처 없는 quote → reject(G2); 비공개 finding → reject + alert(G5); `noise` finding 렌더 → reject(G7). gate는 모든 `FormatRenderer`가 공유하며 export adapter가 defense-in-depth로 재검사한다.

### 7. artifact를 emit + export hand-off에 연결
- **Do:** gate 통과 시 markdown artifact를 synthesis 출력 위치에 쓴다; `paper-card`/`action-brief`의 경우, `Artifact`(CAW-02 import envelope를 미러링하는 manifest 포함)를 export 스테이지(ADR-0007 / RB-040+)로 넘긴다. gate 실패 시 아무것도 쓰지 않고 실패한 check와 함께 `gate_result`를 표면화한다.
- **Verify:** gate 실패 렌더는 artifact 파일을 생산하지 않고 non-zero/diagnostic 결과를 낸다; gate 통과 paper-card는 downstream consumer가 공유 store 없이 재검증할 수 있는 manifest를 생산한다.

## Acceptance criteria
- [ ] 다섯 `FormatRenderer` adapter가 하나의 triage된 `Finding` group으로부터 렌더링한다; digest가 주간 multi-finding 문서를 렌더링한다(M1 출력).
- [ ] `Synthesizer` 단계만 비결정론적이다; 단계 1–2, 4–6은 재현 가능하다; extractive fallback이 LLM 없이 gate를 통과하는 digest를 생산한다.
- [ ] 모든 artifact가 `evidence: false`와 상시 배너를 가진 §4.1 manifest를 지닌다; generated 대 extracted slot이 템플릿에서 구분된다.
- [ ] in-body 마커가 verbatim quote(`> [!quote]` + 실제 locator)를 생성된 산문(`[S#]`-인용)과 분리한다; paraphrase-as-quote 없음.
- [ ] citation gate G1–G7이 emit 이전과 export 이전에 실행되고, fail-closed이며, 네 negative test가 모두 성립한다.
- [ ] `noise` finding은 절대 synthesis에 도달하지 않는다; 생성된 요약은 절대 evidence로 emit되거나 export되지 않는다.
- [ ] `paper-card`/`action-brief`가 재검증 가능한 `Artifact`를 export 스테이지로 넘긴다; tree가 green이다.

## Rollback / safety
- synthesis는 findings 위에 생성된 레이어만 쓴다; `source_ref`, `excerpts`, `trust`, `boundary`를 변경할 수 없다. 중간에 롤백하려면 현재 run의 미검증/실패 artifact 파일을 삭제한다 — findings와 ledger는 손대지 않는다.
- citation gate는 첫 번째 방어선이다(export가 재검사); 렌더를 "unblock"하기 위해 절대 비활성화하지 마라. 지속되는 gate 실패는 우회할 gate가 아니라 고쳐야 할 콘텐츠 버그다.
- `boundary`는 synthesis에 의해 올라갈 수만 있고 절대 내려가지 않는다; 비공개 콘텐츠는 artifact를 중단시킨다(G5) — CAW-05는 public만 ingest/synthesize한다(brief §8, §12). 생성된 산문은 절대 내부 Samsung/SAIT claim으로 제시될 수 없다.

## Hand-off
export runbook(RB-040+)은 다음을 가정할 수 있다: CAW-02 import envelope를 미러링하는 manifest를 가진, gate를 통과한 markdown `Artifact`; `paper-card`가 CAW-02(Source/RelatedWork) + CAW-03(novelty)에, `action-brief`가 CAW-01/CAW-06에 공급된다는 점; evidence(`source_ref` + verbatim `excerpts`)가 생성된 산문(`evidence:false`, `[S#]`-인용)과 깔끔히 분리된다는 점; 그리고 citation gate가 이미 G1–G7을 강제했으며 export가 bundle을 서명하고 drop하기 전에 defense-in-depth로 재강제한다는 점.
