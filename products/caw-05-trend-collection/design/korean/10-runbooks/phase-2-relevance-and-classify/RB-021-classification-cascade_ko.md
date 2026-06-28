# RB-021: LF→LLM→human cascade로 finding을 두 축으로 classify (rationale은 절대 evidence 아님)

- **Status:** ready
- **Phase:** phase-2-relevance-and-classify
- **Depends on:** [RB-020 (relevance scoring + recall floor), RB-002 (Classifier port stub), RB-012 (FILES-AS-TRUTH store)]
- **Implements design:** [../../05-radar-core/classification-and-triage.md](../../05-radar-core/classification-and-triage_ko.md), [../../01-decisions/ADR-0004-classification-and-triage.md](../../01-decisions/ADR-0004-classification-and-triage_ko.md), [../../01-decisions/ADR-0002-interest-model.md](../../01-decisions/ADR-0002-interest-model_ko.md)
- **Produces:** Run의 **classify 단계**: labeling-function (LF) layer, `Classifier` port 뒤의 self-consistent LLM judge, 그리고 두 축 (`relevance.class` × `signal.bucket`), `method`, `rationale_note{evidence:false}`를 carry하는 `classified_finding` record. (selective-review gate + routing은 RB-022.)

## Objective
"Done" = 각 scored finding이 **두 직교 label**을 가진 `classified_finding` record를 받는다 — Axis A relevance
class (`novelty-threat | support | adjacent | noise`)와 Axis B signal-vs-hype (`hype | mixed | signal`) — 이는
cheap→expensive cascade로 할당된다: 먼저 deterministic labeling function, 그다음 self-consistent LLM judge
(N≥2 sample)는 약한/충돌하는/near-miss case에만, label의 authorship을 `method.labeler`가 기록한다. 두 불변식이
데이터에 인코딩되고 negative test로 강제된다: **(1) 생성된 rationale은 `evidence:false`이며 절대 claim을 뒷받침할
수 없다**, 그리고 **(2) watch list term에 대한 LF miss는 LLM으로 fall through하고 절대 `noise`로 default되지
않는다** (recall-first). 이 단계는 label + confidence 입력만 할당한다; auto-accept/queue/route를 **결정하지
않는다** (그것은 RB-022).

## Preconditions
- [ ] RB-020 완료: finding이 `relevance{score, explain[], matched_watch_list, surface_not_drop}`를 carry.
- [ ] finding이 provenance + `source_trust_prior` (high/medium/low) + ingestion의 `dedup_key`를 carry (ADR-0003).
- [ ] `Classifier` port 존재 (P0 stub), contract `finding → {relevance, signal, confidence inputs,
      rationale_note}`.
- [ ] judge용 LLM 선정됨 (TODO open-question — Claude/Anthropic이면 model id + params에 대해 claude-api reference
      준수); v1은 라이브 호출 없이 cascade를 테스트 가능하도록 fixture/mock에 대해 judge를 실행할 수 있다.
- [ ] Tree가 green.

## Steps

1. **`classified_finding` record schema 정의.**
   - **Do:** classification-and-triage.md §4의 record를 구현한다: read-only `provenance`/`dedup_key`;
     `relevance{class, watchlist_hits, confidence}`; `signal{score, bucket}`; `rationale_note{text,
     model{name,version,prompt_hash}, evidence:false}`; `method{labeler, self_consistency{samples,agreement},
     abstained}`. `rationale_note.evidence`를 어떤 code path로도 true로 설정할 수 없는 상수 `false`로 만든다.
   - **Verify:** schema validation이 `rationale_note.evidence: true`인 record를 거부; provenance/dedup_key field는
     immutable (upstream에서 write-once).

2. **Stage 1 구현 — labeling function (deterministic, 항상 실행).**
   - **Do:** high-precision LF를 구축한다: watch-list keyword/author/venue regex → `novelty-threat` 후보;
     known-aggregator-domain → `noise` 후보; `has-code` / `has-numbers` / `has-method` / `has-baseline` →
     signal++; superlative / press-release / N-th-hand → signal−−. Axis B를 `source_trust_prior`에서 시드 (carry,
     재유도 안 함). noisy LF를 Snorkel-style로 결합하고 **LF별 vote + agreement**를 confidence feature로 유지.
   - **Verify:** `Chakra` + `MC-DLA`가 있는 title이 두 LF vote가 기록된 `novelty-threat` 후보를 산출; code +
     number가 있는 arXiv finding이 press-release fixture 대비 signal feature를 높임.

3. **결정적 recall 규칙 인코딩 (LF miss → LLM, 절대 noise 아님).**
   - **Do:** LF가 약하거나, 충돌하거나, watch-list **near-miss** (예: RB-020의 `matched_watch_list` hit이
     있으나 LF가 class를 발화하지 않음)일 때, finding은 Stage 2로 escalate된다. watch-list를 건드리는 finding은
     LF만으로 **절대** `noise`로 label될 수 없다.
   - **Verify (negative test N4):** 어떤 LF도 classify하지 않은 watch-list term을 match하는 finding은 `noise`를
     받지 **않는다**; `method.labeler`가 LLM 대기 상태로 LLM judge에 queue됨.

4. **Stage 2 구현 — Classifier port 뒤의 self-consistent LLM judge.**
   - **Do:** escalate된 finding에만 호출한다. 하나의 prompt가 구조화된 형태로 **두 축 + rationale**을 반환한다.
     **N self-consistent sample** (N config, ≥2)을 실행한다; **agreement rate를 raw confidence signal로** 사용한다.
     `model.name/version`, `prompt_hash` (prompt의 sha256), `self_consistency{samples, agreement}`를 기록한다.
     model text는 엄격히 `rationale_note.text`로 `evidence:false`와 함께 저장한다. Verbalized/token-prob
     confidence는 약한 secondary signal로만 log할 수 있다.
   - **Verify (negative test N5):** single-sample 실행 (N=1)은 **거부**됨 — judge는 N≥2를 요구하고 agreement를
     기록; `prompt_hash`와 `model.version`이 모든 LLM-label된 record에 존재.

5. **`method.labeler` provenance + abstention flag 설정.**
   - **Do:** `method.labeler ∈ {lf, lf+llm, llm}`를 기록한다 (human은 RB-022에서 나중에 설정). N-sample
     agreement가 disagreement bar 아래일 때 `method.abstained: true`를 설정한다 (gate가 RB-022에서 이를 소비).
     여기서 auto-discard하지 않는다 — abstention은 flag만 한다.
   - **Verify:** LF-only clear case는 `labeler: lf`를 가지며 LLM 호출이 없었음; 불일치하는 N-sample case는
     `abstained: true`를 가짐.

6. **rationale를 end-to-end로 엄격히 non-evidence로 유지.**
   - **Do:** rationale를 `Note(evidence=false)`로 저장한다. 어떤 serializer, export builder, digest renderer도
     `rationale_note`를 claim의 backing으로 promote할 수 없게 한다 — backing은 항상 provenance + (post-verification)
     source locator다. claim-construction 경계에 guard/assert를 추가한다.
   - **Verify (negative test N2):** `rationale_note`를 claim의 evidence로 전달하는 것은 guard에 의해 **거부**됨;
     digest는 rationale를 렌더할 수 있으나 evidence가 아닌 생성된 것으로 flag.

7. **record를 store에 영속화.**
   - **Do:** 각 `classified_finding`을 immutable finding에 대한 metadata로 쓴다 (files-as-truth); classification
     재실행은 고정된 입력 + 고정된 `prompt_hash`/model version에 대해 idempotent (재과금 방지를 위해 LLM 결과를
     `prompt_hash`로 캐시).
   - **Verify:** 재실행이 변경되지 않은 finding에 대해 새 LLM 호출 없이 동일한 label을 산출 (`prompt_hash` cache
     hit).

## Acceptance criteria
- [ ] 모든 finding이 두 축 + `method` + `rationale_note{evidence:false}`를 가진 `classified_finding`을 지님.
- [ ] LF가 모든 finding에서 실행; LLM judge는 약한/충돌/near-miss에만 실행; 대부분의 finding은 LLM 없이 clear.
- [ ] Negative test N4: watch-list term에 대한 LF miss는 절대 `noise`를 산출하지 않음 (LLM으로 escalate).
- [ ] Negative test N5: N=1 LLM 실행 거부; N≥2에서 `agreement`, `model.version`, `prompt_hash` 기록.
- [ ] Negative test N2: `rationale_note`는 claim을 뒷받침할 수 없음 (`evidence:false` 강제).
- [ ] Record는 파일로부터 reproducible; LLM 결과는 `prompt_hash`로 캐시.
- [ ] 이 checkpoint에서 tree가 green.

## Rollback / safety
- Classification record는 derived metadata다; `classified_finding` block을 삭제하면 post-RB-020 state로 복귀 —
  raw finding + relevance 불변.
- LLM judge가 사용 불가하면, 단계는 안전하게 degrade해야 한다: escalate된 finding은 `method.abstained:true` /
  LLM 미label로 남아 RB-022의 human queue로 흐른다 — **절대** 자동으로 `noise`로 label되지 않는다.
- 어떤 code path나 config profile에서도 두 불변식 (N2, N4)을 절대 완화하지 말 것 (ADR-0004 §6 revisit trigger:
  stop).

## Hand-off
RB-022는 각 finding이 두 축, `method.self_consistency`, `method.abstained`, `relevance.confidence` 입력,
그리고 `surface_not_drop` (RB-020에서)을 가진 `classified_finding`을 carry함을 가정할 수 있다. RB-022는 calibrated
selective-review gate (auto-accept/queue/abstain), human-review state machine, deterministic routing을 소유한다.
`rationale_note{evidence:false}` flag는 finding과 함께 ledger와 export로 변경 없이 이동한다.
