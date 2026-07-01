# RB-01 — syntorch runtime capture (read-only) → CAW-07 tiling IR

> **This runbook is for the in-company team.** CAW-07 (this repo) cannot implement
> the syntorch/vLLM side — syntorch is an internal torch-frontend package. This RB
> defines the **exact boundary + interface** so the team can wire the runtime
> capture, and CAW-07 stays a pure, testable Python library on the other side.

## Goal
Inside a running vLLM + syntorch forward pass, **capture each compute op's identity
+ shapes (read-only, no execution on novel HW)**, map it to an einsum + sizes, look
up / author its `AbstractTilingPlan` against the current HW twin, and record the
analytical cost — feeding the ADR-0005 Chakra op-id side-channel. **Never** compile
or run a kernel on the novel HW; there is no backend.

## Precondition / non-goals
- Read-only: the mode returns the **unmodified eager tensor**; vLLM keeps running
  normally on whatever real device it already uses (or FakeTensor for shape-only).
- Exploration-grade analytical cost only — this is NOT a device backend, autograd
  change, or codegen path.
- Pin versions (torch, syntorch, vLLM) in the RB preconditions before starting.

## The boundary (who owns what)
```
   vLLM + syntorch forward (TEAM owns) ── TorchDispatchMode ──► CaptureSink (CAW-07 owns)
      aten op stream + shapes                (this RB)            tile()/plan + cost accrual
```
CAW-07 exposes a stable `CaptureSink` (to be added in `caw07_tiling_ir/capture.py`,
CAW-07's job) with roughly:

```python
class CaptureSink:
    def __init__(self, hw): ...                 # hw = linearized twin (LevelStack)
    def on_op(self, op_id: str, kind: str,      # "matmul"|"attention"|"linear"|...
              pattern: str, sizes: dict[str,int],
              dtype_bytes: int) -> AbstractTilingPlan: ...
    def results(self) -> list[tuple[str, AbstractTilingPlan]]: ...
```
`on_op` authors/looks-up a plan (default heuristic tiling if none authored), costs
it, keys it by `op_id`, and returns it. **The TEAM's dispatch mode calls `on_op`.**

## Steps (TEAM)
1. **Mode skeleton.** Implement a `TorchDispatchMode` (pattern: PyTorch
   `FlopCounterMode` — an `OpOverload → handler` registry, no execution). Enter it
   around the vLLM forward for one request. Use `FakeTensorMode`/meta tensors if you
   want shapes without any real compute.
2. **Re-fuse decomposed aten.** Dispatch sees ops **after** Autograd/Functionalize
   decomposition (e.g. `scaled_dot_product_attention` appears decomposed into
   matmul/softmax/…). Maintain a small pattern re-fuser that lifts the decomposed
   stream back to high-level intent — `aten.mm/bmm/addmm/linear → matmul`,
   the QK^T·softmax··V group → `attention`, norms/elementwise → their ops — so tiles
   map to real op intent, not primitive shards. Capture at the **highest** level you
   can reach (ideally hook syntorch's pre-decomposition ops if syntorch exposes them).
3. **Stable op-id.** Assign each captured op a stable id (module path + call index,
   or the ADR-0005 Chakra node id) so the plan attaches to the same op across runs.
4. **Shapes → einsum + sizes.** From the op + tensor shapes build the pattern and
   `sizes` (matmul `"m k, k n -> m n"` with M/N/K; attention `B/H/Sq/Sk/D`), pick
   `dtype_bytes`, and call `sink.on_op(op_id, kind, pattern, sizes, dtype_bytes)`.
5. **HW twin in, cost out.** The sink already holds the current CAW-07 HW twin;
   it returns a costed `AbstractTilingPlan`. Accumulate per-op; the serving-loop
   layer (later RB) schedules these into end-to-end latency/throughput.
6. **Read-only return.** Return the real result tensor unchanged from every handler.

## Validation gates (how the TEAM knows it works)
- **G1 coverage:** every GEMM/attention op in a small LLM forward is captured with
  correct M/N/K (or B/H/Sq/Sk/D) — assert captured shapes vs a hand-traced layer.
- **G2 read-only:** outputs bit-identical with vs without the mode enabled.
- **G3 re-fusion:** `sdpa`/attention captured as ONE `attention` op, not N shards.
- **G4 determinism:** same request → same op-ids + plans across runs.
- **G5 handoff:** op-id keys match the Chakra/ADR-0005 side-channel used by CAW-01.

## Pitfalls
- Decomposition level (G3) is the main trap — without re-fusion you tile primitive
  shards and lose the real tile intent.
- Dynamic shapes (decode step, growing KV) — capture per-step; the serving-loop RB
  will fold decode steps.
- Do **not** add a PrivateUse1 device backend or try to *run* on the novel HW —
  capture + analytical cost only.
- Trace-driven: this needs a forward pass (real or FakeTensor); it is not a static
  analyzer. That is fine for exploration.

## CAW-07-side follow-up (this repo, not the team)
- Add `caw07_tiling_ir/capture.py` with `CaptureSink` + a default heuristic tiler,
  and a **mock** dispatch harness (a fake op stream) so the sink is unit-testable
  WITHOUT syntorch. Then the team wires the real `TorchDispatchMode` to it per above.
