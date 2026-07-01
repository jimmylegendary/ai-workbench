/**
 * Diverse example traces in the company OTel-joined `main.jsonl` format (CAW-01).
 *
 * Each `OtelExample` is a single session (unique `session_id`) whose `main`
 * array holds the raw per-request rows exactly as they land in `main.jsonl`.
 * Field names mirror the shared schema verbatim — including the intentional
 * misspelling `promt_tok` and the `request_id: null` convention for tools.
 *
 * Heavy payloads are represented only by their `*_ref` side-file pointers
 * (tokens.jsonl / hashes.jsonl / raw.jsonl / tools.jsonl are not shipped here).
 *
 * Authoring conventions:
 *   - `called_at` / `duration_ns` / prefetch / store are epoch/elapsed
 *     NANOSECONDS. Offsets are written as `<ms> * ms` so they stay readable.
 *   - `called_at` strictly increases within a session.
 *   - `hash_ref` + `tier_totals` + `prefetch_fetch_ns` + `store_ns` appear
 *     ONLY when LMCache is on. When it is off they are omitted entirely.
 *   - For llm rows, HBM + DRAM + SSD + MISS ~= n_prompt_hash_blocks.
 *   - `uid` presence, `chunk_size` (128/256/512) and refs are varied across
 *     examples to exercise the full shape of the format.
 */

export interface OtelExample {
  id: string;
  label: string;
  description: string;
  main: unknown[];
}

/** 1e6 ns == 1 ms. Multiply a millisecond figure by this to get nanoseconds. */
const ms = 1_000_000;

// ---------------------------------------------------------------------------
// 1) warm-cache — Warm KV cache · high prefix reuse
//    LMCache ON. 3 turns, mostly HBM hits, tiny MISS, small prefetch/store.
// ---------------------------------------------------------------------------
const warmT0 = 1_782_914_520_000_000_000; // 2026-07-01T14:02:00Z

const warmCache: OtelExample = {
  id: "warm-cache",
  label: "Warm KV cache · high prefix reuse",
  description:
    "LMCache on with a hot prefix: nearly every prompt block resolves from HBM, MISS stays near zero, and prefetch/store latencies are tiny.",
  main: [
    {
      called_at: warmT0,
      type: "llm",
      session_id: "sess-warm-1",
      turn_id: "turn-1",
      uid: "u-88",
      request_id: "req-w1a",
      duration_ns: 520 * ms,
      promt_tok: 1420,
      out_tok: 240,
      chunk_size: 256,
      prefetch_fetch_ns: 900_000,
      store_ns: 420_000,
      n_prompt_hash_blocks: 6,
      tier_totals: { HBM: 5, DRAM: 1, SSD: 0, MISS: 0 },
      token_ids_ref: { file: "tokens.jsonl", key: "req-w1a", prompt_count: 1420, out_count: 240 },
      hash_ref: { file: "hashes.jsonl", key: "req-w1a", n_blocks: 6 },
      raw_ref: { file: "raw.jsonl", key: "req-w1a", message_count: 3, chars: 5610 },
    },
    {
      called_at: warmT0 + 760 * ms,
      type: "tool",
      session_id: "sess-warm-1",
      turn_id: "turn-1",
      uid: "u-88",
      request_id: null,
      duration_ns: 180 * ms,
      promt_tok: 0,
      out_tok: 0,
      chunk_size: 256,
      n_prompt_hash_blocks: 0,
      tool: { name: "search_docs", tool_id: "tool-w01" },
      tool_ref: { file: "tools.jsonl", key: "tool-w01", input_chars: 72, output_chars: 1840 },
    },
    {
      called_at: warmT0 + 1_120 * ms,
      type: "llm",
      session_id: "sess-warm-1",
      turn_id: "turn-2",
      uid: "u-88",
      request_id: "req-w2a",
      duration_ns: 610 * ms,
      promt_tok: 1980,
      out_tok: 300,
      chunk_size: 256,
      prefetch_fetch_ns: 1_050_000,
      store_ns: 480_000,
      n_prompt_hash_blocks: 8,
      tier_totals: { HBM: 7, DRAM: 1, SSD: 0, MISS: 0 },
      token_ids_ref: { file: "tokens.jsonl", key: "req-w2a", prompt_count: 1980, out_count: 300 },
      hash_ref: { file: "hashes.jsonl", key: "req-w2a", n_blocks: 8 },
      raw_ref: { file: "raw.jsonl", key: "req-w2a", message_count: 5, chars: 7720 },
    },
    {
      called_at: warmT0 + 1_980 * ms,
      type: "llm",
      session_id: "sess-warm-1",
      turn_id: "turn-3",
      uid: "u-88",
      request_id: "req-w3a",
      duration_ns: 470 * ms,
      promt_tok: 2240,
      out_tok: 190,
      chunk_size: 256,
      prefetch_fetch_ns: 820_000,
      store_ns: 360_000,
      n_prompt_hash_blocks: 9,
      tier_totals: { HBM: 8, DRAM: 1, SSD: 0, MISS: 0 },
      token_ids_ref: { file: "tokens.jsonl", key: "req-w3a", prompt_count: 2240, out_count: 190 },
      hash_ref: { file: "hashes.jsonl", key: "req-w3a", n_blocks: 9 },
      raw_ref: { file: "raw.jsonl", key: "req-w3a", message_count: 7, chars: 9010 },
    },
  ],
};

// ---------------------------------------------------------------------------
// 2) cold-start — Cold start · mostly recompute
//    LMCache ON. First turn mostly MISS; later turns warm to DRAM/SSD/HBM.
//    Larger prefetch_fetch_ns as blocks are pulled up from slow tiers.
// ---------------------------------------------------------------------------
const coldT0 = 1_782_918_000_000_000_000; // 2026-07-01T15:00:00Z

const coldStart: OtelExample = {
  id: "cold-start",
  label: "Cold start · mostly recompute",
  description:
    "LMCache on but empty: the first turn is almost entirely MISS (recompute), then later turns warm up as blocks populate DRAM/SSD/HBM, with larger prefetch latencies while promoting from slow tiers.",
  main: [
    {
      called_at: coldT0,
      type: "llm",
      session_id: "sess-cold-1",
      turn_id: "turn-1",
      uid: "u-15",
      request_id: "req-c1a",
      duration_ns: 1_180 * ms,
      promt_tok: 2600,
      out_tok: 260,
      chunk_size: 128,
      prefetch_fetch_ns: 8_400_000,
      store_ns: 3_100_000,
      n_prompt_hash_blocks: 20,
      tier_totals: { HBM: 0, DRAM: 1, SSD: 1, MISS: 18 },
      token_ids_ref: { file: "tokens.jsonl", key: "req-c1a", prompt_count: 2600, out_count: 260 },
      hash_ref: { file: "hashes.jsonl", key: "req-c1a", n_blocks: 20 },
      raw_ref: { file: "raw.jsonl", key: "req-c1a", message_count: 2, chars: 10240 },
    },
    {
      called_at: coldT0 + 1_400 * ms,
      type: "tool",
      session_id: "sess-cold-1",
      turn_id: "turn-1",
      uid: "u-15",
      request_id: null,
      duration_ns: 640 * ms,
      promt_tok: 0,
      out_tok: 0,
      chunk_size: 128,
      n_prompt_hash_blocks: 0,
      tool: { name: "fetch_url", tool_id: "tool-c01" },
      tool_ref: { file: "tools.jsonl", key: "tool-c01", input_chars: 120, output_chars: 6400 },
    },
    {
      called_at: coldT0 + 2_260 * ms,
      type: "llm",
      session_id: "sess-cold-1",
      turn_id: "turn-2",
      uid: "u-15",
      request_id: "req-c2a",
      duration_ns: 900 * ms,
      promt_tok: 3100,
      out_tok: 320,
      chunk_size: 128,
      prefetch_fetch_ns: 5_200_000,
      store_ns: 1_800_000,
      n_prompt_hash_blocks: 24,
      tier_totals: { HBM: 6, DRAM: 8, SSD: 4, MISS: 6 },
      token_ids_ref: { file: "tokens.jsonl", key: "req-c2a", prompt_count: 3100, out_count: 320 },
      hash_ref: { file: "hashes.jsonl", key: "req-c2a", n_blocks: 24 },
      raw_ref: { file: "raw.jsonl", key: "req-c2a", message_count: 4, chars: 12880 },
    },
    {
      called_at: coldT0 + 3_400 * ms,
      type: "llm",
      session_id: "sess-cold-1",
      turn_id: "turn-3",
      uid: "u-15",
      request_id: "req-c3a",
      duration_ns: 700 * ms,
      promt_tok: 3400,
      out_tok: 280,
      chunk_size: 128,
      prefetch_fetch_ns: 2_600_000,
      store_ns: 900_000,
      n_prompt_hash_blocks: 27,
      tier_totals: { HBM: 18, DRAM: 6, SSD: 2, MISS: 1 },
      token_ids_ref: { file: "tokens.jsonl", key: "req-c3a", prompt_count: 3400, out_count: 280 },
      hash_ref: { file: "hashes.jsonl", key: "req-c3a", n_blocks: 27 },
      raw_ref: { file: "raw.jsonl", key: "req-c3a", message_count: 6, chars: 14120 },
    },
  ],
};

// ---------------------------------------------------------------------------
// 3) no-lmcache — No LMCache · no hash/tier
//    LMCache OFF: no hash_ref, no prefetch_fetch_ns/store_ns, and tier_totals
//    omitted entirely. Just plain llm + tool timing/tokens.
// ---------------------------------------------------------------------------
const noLmT0 = 1_782_921_600_000_000_000; // 2026-07-01T16:00:00Z

const noLmcache: OtelExample = {
  id: "no-lmcache",
  label: "No LMCache · no hash/tier",
  description:
    "LMCache disabled: rows carry no hash_ref, no prefetch/store latencies, and no tier_totals at all — only raw llm/tool timing and token counts, matching the real behavior when caching is off.",
  main: [
    {
      called_at: noLmT0,
      type: "llm",
      session_id: "sess-nolm-1",
      turn_id: "turn-1",
      uid: "u-31",
      request_id: "req-n1a",
      duration_ns: 780 * ms,
      promt_tok: 1520,
      out_tok: 260,
      chunk_size: 256,
      n_prompt_hash_blocks: 0,
      token_ids_ref: { file: "tokens.jsonl", key: "req-n1a", prompt_count: 1520, out_count: 260 },
      raw_ref: { file: "raw.jsonl", key: "req-n1a", message_count: 3, chars: 6020 },
    },
    {
      called_at: noLmT0 + 900 * ms,
      type: "tool",
      session_id: "sess-nolm-1",
      turn_id: "turn-1",
      uid: "u-31",
      request_id: null,
      duration_ns: 240 * ms,
      promt_tok: 0,
      out_tok: 0,
      chunk_size: 256,
      n_prompt_hash_blocks: 0,
      tool: { name: "run_query", tool_id: "tool-n01" },
      tool_ref: { file: "tools.jsonl", key: "tool-n01", input_chars: 96, output_chars: 3120 },
    },
    {
      called_at: noLmT0 + 1_360 * ms,
      type: "llm",
      session_id: "sess-nolm-1",
      turn_id: "turn-2",
      uid: "u-31",
      request_id: "req-n2a",
      duration_ns: 690 * ms,
      promt_tok: 2040,
      out_tok: 210,
      chunk_size: 256,
      n_prompt_hash_blocks: 0,
      token_ids_ref: { file: "tokens.jsonl", key: "req-n2a", prompt_count: 2040, out_count: 210 },
      raw_ref: { file: "raw.jsonl", key: "req-n2a", message_count: 5, chars: 8340 },
    },
  ],
};

// ---------------------------------------------------------------------------
// 4) tool-heavy — Tool-heavy agent
//    Many tool calls (search/fetch/exec/deploy/db) interleaved with a couple
//    llm calls. Tools have varied durations and request_id: null; the llm
//    rows use LMCache.
// ---------------------------------------------------------------------------
const toolT0 = 1_782_925_200_000_000_000; // 2026-07-01T17:00:00Z

const toolHeavy: OtelExample = {
  id: "tool-heavy",
  label: "Tool-heavy agent",
  description:
    "An agentic run dominated by tool calls — search, fetch, exec, deploy and db — with widely varying durations and request_id: null, punctuated by a couple of cached llm calls.",
  main: [
    {
      called_at: toolT0,
      type: "llm",
      session_id: "sess-tool-1",
      turn_id: "turn-1",
      uid: "u-77",
      request_id: "req-t1a",
      duration_ns: 560 * ms,
      promt_tok: 1240,
      out_tok: 300,
      chunk_size: 256,
      prefetch_fetch_ns: 1_400_000,
      store_ns: 700_000,
      n_prompt_hash_blocks: 5,
      tier_totals: { HBM: 3, DRAM: 1, SSD: 0, MISS: 1 },
      token_ids_ref: { file: "tokens.jsonl", key: "req-t1a", prompt_count: 1240, out_count: 300 },
      hash_ref: { file: "hashes.jsonl", key: "req-t1a", n_blocks: 5 },
      raw_ref: { file: "raw.jsonl", key: "req-t1a", message_count: 3, chars: 4920 },
    },
    {
      called_at: toolT0 + 640 * ms,
      type: "tool",
      session_id: "sess-tool-1",
      turn_id: "turn-1",
      uid: "u-77",
      request_id: null,
      duration_ns: 210 * ms,
      promt_tok: 0,
      out_tok: 0,
      chunk_size: 256,
      n_prompt_hash_blocks: 0,
      tool: { name: "code_search", tool_id: "tool-t01" },
      tool_ref: { file: "tools.jsonl", key: "tool-t01", input_chars: 88, output_chars: 2600 },
    },
    {
      called_at: toolT0 + 940 * ms,
      type: "tool",
      session_id: "sess-tool-1",
      turn_id: "turn-1",
      uid: "u-77",
      request_id: null,
      duration_ns: 880 * ms,
      promt_tok: 0,
      out_tok: 0,
      chunk_size: 256,
      n_prompt_hash_blocks: 0,
      tool: { name: "fetch_url", tool_id: "tool-t02" },
      tool_ref: { file: "tools.jsonl", key: "tool-t02", input_chars: 140, output_chars: 9800 },
    },
    {
      called_at: toolT0 + 1_920 * ms,
      type: "tool",
      session_id: "sess-tool-1",
      turn_id: "turn-1",
      uid: "u-77",
      request_id: null,
      duration_ns: 1_450 * ms,
      promt_tok: 0,
      out_tok: 0,
      chunk_size: 256,
      n_prompt_hash_blocks: 0,
      tool: { name: "exec_shell", tool_id: "tool-t03" },
      tool_ref: { file: "tools.jsonl", key: "tool-t03", input_chars: 220, output_chars: 5400 },
    },
    {
      called_at: toolT0 + 3_500 * ms,
      type: "tool",
      session_id: "sess-tool-1",
      turn_id: "turn-1",
      uid: "u-77",
      request_id: null,
      duration_ns: 320 * ms,
      promt_tok: 0,
      out_tok: 0,
      chunk_size: 256,
      n_prompt_hash_blocks: 0,
      tool: { name: "db_query", tool_id: "tool-t04" },
      tool_ref: { file: "tools.jsonl", key: "tool-t04", input_chars: 180, output_chars: 4120 },
    },
    {
      called_at: toolT0 + 3_960 * ms,
      type: "llm",
      session_id: "sess-tool-1",
      turn_id: "turn-2",
      uid: "u-77",
      request_id: "req-t2a",
      duration_ns: 720 * ms,
      promt_tok: 3200,
      out_tok: 260,
      chunk_size: 256,
      prefetch_fetch_ns: 1_100_000,
      store_ns: 560_000,
      n_prompt_hash_blocks: 13,
      tier_totals: { HBM: 9, DRAM: 3, SSD: 0, MISS: 1 },
      token_ids_ref: { file: "tokens.jsonl", key: "req-t2a", prompt_count: 3200, out_count: 260 },
      hash_ref: { file: "hashes.jsonl", key: "req-t2a", n_blocks: 13 },
      raw_ref: { file: "raw.jsonl", key: "req-t2a", message_count: 9, chars: 15600 },
    },
    {
      called_at: toolT0 + 4_820 * ms,
      type: "tool",
      session_id: "sess-tool-1",
      turn_id: "turn-2",
      uid: "u-77",
      request_id: null,
      duration_ns: 1_980 * ms,
      promt_tok: 0,
      out_tok: 0,
      chunk_size: 256,
      n_prompt_hash_blocks: 0,
      tool: { name: "deploy_service", tool_id: "tool-t05" },
      tool_ref: { file: "tools.jsonl", key: "tool-t05", input_chars: 260, output_chars: 3300 },
    },
  ],
};

// ---------------------------------------------------------------------------
// 5) long-context — Long context · large prompts
//    promt_tok 8k–32k, n_prompt_hash_blocks 30–120, SSD tier heavily used,
//    chunk_size 512. LMCache on.
// ---------------------------------------------------------------------------
const longT0 = 1_782_928_800_000_000_000; // 2026-07-01T18:00:00Z

const longContext: OtelExample = {
  id: "long-context",
  label: "Long context · large prompts",
  description:
    "Very large prompts (8k–32k tokens) with 30–120 hash blocks at chunk_size 512. Cache spills into the SSD tier and prefetch latencies climb as bulky KV state is pulled up.",
  main: [
    {
      called_at: longT0,
      type: "llm",
      session_id: "sess-long-1",
      turn_id: "turn-1",
      uid: "u-52",
      request_id: "req-l1a",
      duration_ns: 980 * ms,
      promt_tok: 8_200,
      out_tok: 420,
      chunk_size: 512,
      prefetch_fetch_ns: 6_800_000,
      store_ns: 2_400_000,
      n_prompt_hash_blocks: 32,
      tier_totals: { HBM: 8, DRAM: 10, SSD: 12, MISS: 2 },
      token_ids_ref: { file: "tokens.jsonl", key: "req-l1a", prompt_count: 8200, out_count: 420 },
      hash_ref: { file: "hashes.jsonl", key: "req-l1a", n_blocks: 32 },
      raw_ref: { file: "raw.jsonl", key: "req-l1a", message_count: 4, chars: 33120 },
    },
    {
      called_at: longT0 + 1_260 * ms,
      type: "tool",
      session_id: "sess-long-1",
      turn_id: "turn-1",
      uid: "u-52",
      request_id: null,
      duration_ns: 1_120 * ms,
      promt_tok: 0,
      out_tok: 0,
      chunk_size: 512,
      n_prompt_hash_blocks: 0,
      tool: { name: "read_corpus", tool_id: "tool-l01" },
      tool_ref: { file: "tools.jsonl", key: "tool-l01", input_chars: 64, output_chars: 48200 },
    },
    {
      called_at: longT0 + 2_600 * ms,
      type: "llm",
      session_id: "sess-long-1",
      turn_id: "turn-2",
      uid: "u-52",
      request_id: "req-l2a",
      duration_ns: 1_160 * ms,
      promt_tok: 18_600,
      out_tok: 520,
      chunk_size: 512,
      prefetch_fetch_ns: 12_400_000,
      store_ns: 4_600_000,
      n_prompt_hash_blocks: 73,
      tier_totals: { HBM: 20, DRAM: 22, SSD: 28, MISS: 3 },
      token_ids_ref: { file: "tokens.jsonl", key: "req-l2a", prompt_count: 18600, out_count: 520 },
      hash_ref: { file: "hashes.jsonl", key: "req-l2a", n_blocks: 73 },
      raw_ref: { file: "raw.jsonl", key: "req-l2a", message_count: 6, chars: 74800 },
    },
    {
      called_at: longT0 + 4_100 * ms,
      type: "llm",
      session_id: "sess-long-1",
      turn_id: "turn-3",
      uid: "u-52",
      request_id: "req-l3a",
      duration_ns: 1_180 * ms,
      promt_tok: 31_400,
      out_tok: 480,
      chunk_size: 512,
      prefetch_fetch_ns: 18_900_000,
      store_ns: 6_200_000,
      n_prompt_hash_blocks: 118,
      tier_totals: { HBM: 30, DRAM: 34, SSD: 50, MISS: 4 },
      token_ids_ref: { file: "tokens.jsonl", key: "req-l3a", prompt_count: 31400, out_count: 480 },
      hash_ref: { file: "hashes.jsonl", key: "req-l3a", n_blocks: 118 },
      raw_ref: { file: "raw.jsonl", key: "req-l3a", message_count: 8, chars: 126400 },
    },
  ],
};

// ---------------------------------------------------------------------------
// 6) multi-turn — Long multi-turn session
//    5–6 turns, mixed llm/tool, some rows omit uid, realistic drift and
//    varied chunk_size. LMCache on.
// ---------------------------------------------------------------------------
const multiT0 = 1_782_932_400_000_000_000; // 2026-07-01T19:00:00Z

const multiTurn: OtelExample = {
  id: "multi-turn",
  label: "Long multi-turn session",
  description:
    "A long conversation spanning six turns of mixed llm and tool calls. uid is present on some rows and omitted on others, chunk_size drifts, and cache hit rates wander as the topic shifts.",
  main: [
    {
      called_at: multiT0,
      type: "llm",
      session_id: "sess-multi-1",
      turn_id: "turn-1",
      uid: "u-09",
      request_id: "req-m1a",
      duration_ns: 480 * ms,
      promt_tok: 980,
      out_tok: 180,
      chunk_size: 128,
      prefetch_fetch_ns: 1_600_000,
      store_ns: 720_000,
      n_prompt_hash_blocks: 8,
      tier_totals: { HBM: 2, DRAM: 3, SSD: 1, MISS: 2 },
      token_ids_ref: { file: "tokens.jsonl", key: "req-m1a", prompt_count: 980, out_count: 180 },
      hash_ref: { file: "hashes.jsonl", key: "req-m1a", n_blocks: 8 },
      raw_ref: { file: "raw.jsonl", key: "req-m1a", message_count: 2, chars: 3920 },
    },
    {
      called_at: multiT0 + 620 * ms,
      type: "tool",
      session_id: "sess-multi-1",
      turn_id: "turn-1",
      request_id: null,
      duration_ns: 260 * ms,
      promt_tok: 0,
      out_tok: 0,
      chunk_size: 128,
      n_prompt_hash_blocks: 0,
      tool: { name: "search_docs", tool_id: "tool-m01" },
      tool_ref: { file: "tools.jsonl", key: "tool-m01", input_chars: 80, output_chars: 2140 },
    },
    {
      called_at: multiT0 + 1_040 * ms,
      type: "llm",
      session_id: "sess-multi-1",
      turn_id: "turn-2",
      uid: "u-09",
      request_id: "req-m2a",
      duration_ns: 600 * ms,
      promt_tok: 1740,
      out_tok: 240,
      chunk_size: 256,
      prefetch_fetch_ns: 1_200_000,
      store_ns: 540_000,
      n_prompt_hash_blocks: 7,
      tier_totals: { HBM: 5, DRAM: 1, SSD: 0, MISS: 1 },
      token_ids_ref: { file: "tokens.jsonl", key: "req-m2a", prompt_count: 1740, out_count: 240 },
      hash_ref: { file: "hashes.jsonl", key: "req-m2a", n_blocks: 7 },
      raw_ref: { file: "raw.jsonl", key: "req-m2a", message_count: 4, chars: 7010 },
    },
    {
      called_at: multiT0 + 1_820 * ms,
      type: "llm",
      session_id: "sess-multi-1",
      turn_id: "turn-3",
      request_id: "req-m3a",
      duration_ns: 540 * ms,
      promt_tok: 2260,
      out_tok: 200,
      chunk_size: 256,
      prefetch_fetch_ns: 980_000,
      store_ns: 460_000,
      n_prompt_hash_blocks: 9,
      tier_totals: { HBM: 7, DRAM: 2, SSD: 0, MISS: 0 },
      token_ids_ref: { file: "tokens.jsonl", key: "req-m3a", prompt_count: 2260, out_count: 200 },
      hash_ref: { file: "hashes.jsonl", key: "req-m3a", n_blocks: 9 },
      raw_ref: { file: "raw.jsonl", key: "req-m3a", message_count: 6, chars: 9240 },
    },
    {
      called_at: multiT0 + 2_540 * ms,
      type: "tool",
      session_id: "sess-multi-1",
      turn_id: "turn-4",
      uid: "u-09",
      request_id: null,
      duration_ns: 1_240 * ms,
      promt_tok: 0,
      out_tok: 0,
      chunk_size: 256,
      n_prompt_hash_blocks: 0,
      tool: { name: "exec_shell", tool_id: "tool-m02" },
      tool_ref: { file: "tools.jsonl", key: "tool-m02", input_chars: 190, output_chars: 6600 },
    },
    {
      called_at: multiT0 + 3_920 * ms,
      type: "llm",
      session_id: "sess-multi-1",
      turn_id: "turn-4",
      uid: "u-09",
      request_id: "req-m4a",
      duration_ns: 700 * ms,
      promt_tok: 3080,
      out_tok: 280,
      chunk_size: 512,
      prefetch_fetch_ns: 2_100_000,
      store_ns: 880_000,
      n_prompt_hash_blocks: 12,
      tier_totals: { HBM: 6, DRAM: 4, SSD: 1, MISS: 1 },
      token_ids_ref: { file: "tokens.jsonl", key: "req-m4a", prompt_count: 3080, out_count: 280 },
      hash_ref: { file: "hashes.jsonl", key: "req-m4a", n_blocks: 12 },
      raw_ref: { file: "raw.jsonl", key: "req-m4a", message_count: 8, chars: 12840 },
    },
    {
      called_at: multiT0 + 4_780 * ms,
      type: "tool",
      session_id: "sess-multi-1",
      turn_id: "turn-5",
      request_id: null,
      duration_ns: 420 * ms,
      promt_tok: 0,
      out_tok: 0,
      chunk_size: 512,
      n_prompt_hash_blocks: 0,
      tool: { name: "db_query", tool_id: "tool-m03" },
      tool_ref: { file: "tools.jsonl", key: "tool-m03", input_chars: 150, output_chars: 3980 },
    },
    {
      called_at: multiT0 + 5_360 * ms,
      type: "llm",
      session_id: "sess-multi-1",
      turn_id: "turn-5",
      uid: "u-09",
      request_id: "req-m5a",
      duration_ns: 620 * ms,
      promt_tok: 3620,
      out_tok: 260,
      chunk_size: 512,
      prefetch_fetch_ns: 1_500_000,
      store_ns: 640_000,
      n_prompt_hash_blocks: 14,
      tier_totals: { HBM: 10, DRAM: 3, SSD: 1, MISS: 0 },
      token_ids_ref: { file: "tokens.jsonl", key: "req-m5a", prompt_count: 3620, out_count: 260 },
      hash_ref: { file: "hashes.jsonl", key: "req-m5a", n_blocks: 14 },
      raw_ref: { file: "raw.jsonl", key: "req-m5a", message_count: 10, chars: 15020 },
    },
    {
      called_at: multiT0 + 6_240 * ms,
      type: "llm",
      session_id: "sess-multi-1",
      turn_id: "turn-6",
      request_id: "req-m6a",
      duration_ns: 560 * ms,
      promt_tok: 3980,
      out_tok: 220,
      chunk_size: 512,
      prefetch_fetch_ns: 1_320_000,
      store_ns: 580_000,
      n_prompt_hash_blocks: 16,
      tier_totals: { HBM: 12, DRAM: 3, SSD: 1, MISS: 0 },
      token_ids_ref: { file: "tokens.jsonl", key: "req-m6a", prompt_count: 3980, out_count: 220 },
      hash_ref: { file: "hashes.jsonl", key: "req-m6a", n_blocks: 16 },
      raw_ref: { file: "raw.jsonl", key: "req-m6a", message_count: 12, chars: 16680 },
    },
  ],
};

export const otelExamples: OtelExample[] = [
  warmCache,
  coldStart,
  noLmcache,
  toolHeavy,
  longContext,
  multiTurn,
];

/** Serialize an example's rows to newline-delimited JSON (`main.jsonl`). */
export function exampleJsonl(ex: OtelExample): string {
  return ex.main.map((row) => JSON.stringify(row)).join("\n");
}
