/**
 * Example of the company OTel-joined trace `main.jsonl` (one session, raw rows).
 * Fed through otelJoinedAdapter to demo the real ingestion path end-to-end.
 * Field names mirror the shared schema exactly (incl. `promt_tok`). Heavy
 * payloads are represented only by their *_ref pointers (side files not shipped).
 */

// epoch-ns base (2026-06-30T14:02:00Z) — kept as literals to avoid Date.now().
const t0 = 1782914520000000000;
const ms = 1000000; // 1e6 ns

export const otelMainExample: unknown[] = [
  {
    called_at: t0,
    type: "llm",
    session_id: "sess-otel-1",
    turn_id: "turn-1",
    uid: "u-42",
    request_id: "req-1a",
    duration_ns: 640 * ms,
    promt_tok: 1180,
    out_tok: 210,
    chunk_size: 256,
    prefetch_fetch_ns: 3_200_000,
    store_ns: 900_000,
    n_prompt_hash_blocks: 5,
    tier_totals: { HBM: 3, DRAM: 1, SSD: 0, MISS: 1 },
    token_ids_ref: { file: "tokens.jsonl", key: "req-1a", prompt_count: 1180, out_count: 210 },
    hash_ref: { file: "hashes.jsonl", key: "req-1a", n_blocks: 5 },
    raw_ref: { file: "raw.jsonl", key: "req-1a", message_count: 3, chars: 4820 },
  },
  {
    called_at: t0 + 700 * ms,
    type: "tool",
    session_id: "sess-otel-1",
    turn_id: "turn-1",
    uid: "u-42",
    request_id: null,
    duration_ns: 320 * ms,
    promt_tok: 0,
    out_tok: 0,
    chunk_size: 256,
    n_prompt_hash_blocks: 0,
    tier_totals: { HBM: 0, DRAM: 0, SSD: 0, MISS: 0 },
    tool: { name: "search_logs", tool_id: "tool-9f" },
    tool_ref: { file: "tools.jsonl", key: "tool-9f", input_chars: 64, output_chars: 2210 },
  },
  {
    called_at: t0 + 1200 * ms,
    type: "llm",
    session_id: "sess-otel-1",
    turn_id: "turn-1",
    uid: "u-42",
    request_id: "req-1b",
    duration_ns: 410 * ms,
    promt_tok: 1650,
    out_tok: 180,
    chunk_size: 256,
    prefetch_fetch_ns: 1_100_000,
    store_ns: 600_000,
    n_prompt_hash_blocks: 7,
    tier_totals: { HBM: 6, DRAM: 1, SSD: 0, MISS: 0 },
    token_ids_ref: { file: "tokens.jsonl", key: "req-1b", prompt_count: 1650, out_count: 180 },
    hash_ref: { file: "hashes.jsonl", key: "req-1b", n_blocks: 7 },
    raw_ref: { file: "raw.jsonl", key: "req-1b", message_count: 4, chars: 6120 },
  },
  {
    called_at: t0 + 90_000 * ms,
    type: "llm",
    session_id: "sess-otel-1",
    turn_id: "turn-2",
    uid: "u-42",
    request_id: "req-2a",
    duration_ns: 720 * ms,
    promt_tok: 1980,
    out_tok: 240,
    chunk_size: 256,
    prefetch_fetch_ns: 4_400_000,
    store_ns: 1_050_000,
    n_prompt_hash_blocks: 8,
    tier_totals: { HBM: 4, DRAM: 2, SSD: 1, MISS: 1 },
    token_ids_ref: { file: "tokens.jsonl", key: "req-2a", prompt_count: 1980, out_count: 240 },
    hash_ref: { file: "hashes.jsonl", key: "req-2a", n_blocks: 8 },
    raw_ref: { file: "raw.jsonl", key: "req-2a", message_count: 5, chars: 7340 },
  },
  {
    called_at: t0 + 90_800 * ms,
    type: "tool",
    session_id: "sess-otel-1",
    turn_id: "turn-2",
    uid: "u-42",
    request_id: null,
    duration_ns: 1_450 * ms,
    promt_tok: 0,
    out_tok: 0,
    chunk_size: 256,
    n_prompt_hash_blocks: 0,
    tier_totals: { HBM: 0, DRAM: 0, SSD: 0, MISS: 0 },
    tool: { name: "deploy_staging", tool_id: "tool-c3" },
    tool_ref: { file: "tools.jsonl", key: "tool-c3", input_chars: 120, output_chars: 88 },
  },
];

/** JSONL text form (what a real main.jsonl file looks like) — for the loader demo. */
export const otelMainExampleJsonl: string = otelMainExample
  .map((r) => JSON.stringify(r))
  .join("\n");
