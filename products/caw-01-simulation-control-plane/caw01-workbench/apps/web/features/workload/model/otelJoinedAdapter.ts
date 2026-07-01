import {
  summariseTurn,
  type AgentSession,
  type AgentStep,
  type AgentTurn,
  type TraceAdapter,
} from "@caw/core";

/**
 * Adapter for the company OTel-joined trace: agent + litellm + vllm(+lmcache)
 * spans collected via OTel and joined per REQUEST. Input = one SESSION's
 * `main.jsonl` (array of rows). Heavy payloads (token ids / hashes / raw
 * messages / tool io) live in side files (tokens/hashes/raw/tools.jsonl) and
 * are referenced by `*_ref {file,key}` — kept in step.meta for lazy fetch.
 *
 * main.jsonl row (per interview + shared schema):
 *   called_at(ns), duration_ns(ns), type: "llm"|"tool", session_id, turn_id,
 *   uid?, request_id?(null for tools), promt_tok, out_tok, chunk_size,
 *   prefetch_fetch_ns?, store_ns?, n_prompt_hash_blocks,
 *   tier_totals{HBM,DRAM,SSD,MISS}, token_ids_ref?, hash_ref?(absent w/o lmcache),
 *   raw_ref?, tool?{name,tool_id}(type=tool), tool_ref?(type=tool).
 *
 * Notes (interview): within a turn, llm/tool calls are NOT strictly sequential
 * and there is no cross-request parent link — we order by called_at (temporal).
 * Failures are effectively absent → status defaults to "ok". The serving-
 * relevant input (prompt tokens, hash blocks, chunk_size, tier residency) is
 * surfaced in meta so it can drive the Serving pipeline (synthetic/sim axes).
 */

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null;
const numOf = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;
const strOf = (v: unknown): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;

/** epoch-ns → ISO. (ns exceeds JS safe-int so it is µs-ish precise — fine for display.) */
function nsToIso(ns: unknown): string | undefined {
  const n = numOf(ns);
  if (n === undefined) return undefined;
  const d = new Date(n / 1e6);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** Drop undefined entries so the inspector shows only present fields. */
function compact(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out;
}

function firstObject(rows: unknown[]): Rec | undefined {
  for (const r of rows) if (isRec(r)) return r;
  return undefined;
}

function rowToStep(row: Rec, i: number): AgentStep {
  const isTool = row.type === "tool";
  const tool = isRec(row.tool) ? row.tool : undefined;
  const toolId = tool ? strOf(tool.tool_id) : undefined;
  const requestId = strOf(row.request_id);
  const calledAt = row.called_at;

  const id =
    (isTool ? toolId : requestId) ?? `${String(row.type)}-${String(calledAt)}-${i}`;

  const durationNs = numOf(row.duration_ns) ?? numOf(row.duration);
  const meta = compact({
    request_id: requestId,
    tool_id: toolId,
    uid: strOf(row.uid),
    session_id: strOf(row.session_id),
    turn_id: strOf(row.turn_id),
    called_at_ns: numOf(calledAt),
    chunk_size: numOf(row.chunk_size),
    n_prompt_hash_blocks: numOf(row.n_prompt_hash_blocks),
    tier_totals: isRec(row.tier_totals) ? row.tier_totals : undefined,
    prefetch_fetch_ns: numOf(row.prefetch_fetch_ns),
    store_ns: numOf(row.store_ns),
    token_ids_ref: isRec(row.token_ids_ref) ? row.token_ids_ref : undefined,
    hash_ref: isRec(row.hash_ref) ? row.hash_ref : undefined,
    raw_ref: isRec(row.raw_ref) ? row.raw_ref : undefined,
    tool_ref: isRec(row.tool_ref) ? row.tool_ref : undefined,
  });

  const step: AgentStep = {
    id,
    kind: isTool ? "tool" : "llm",
    name: isTool ? (tool && strOf(tool.name)) ?? "tool" : "LLM call",
    execLocation: isTool ? "client" : "server",
    status: "ok",
    meta,
  };
  const startedAt = nsToIso(calledAt);
  if (startedAt) step.startedAt = startedAt;
  if (durationNs !== undefined) step.durationMs = durationNs / 1e6;
  if (!isTool) {
    const ti = numOf(row.promt_tok);
    const to = numOf(row.out_tok);
    if (ti !== undefined) step.tokensIn = ti;
    if (to !== undefined) step.tokensOut = to;
  }
  return step;
}

export const otelJoinedAdapter: TraceAdapter = {
  name: "otel-joined",

  detect(raw: unknown): boolean {
    if (!Array.isArray(raw)) return false;
    const first = firstObject(raw);
    if (!first) return false;
    const typeOk = first.type === "llm" || first.type === "tool";
    return typeOk && "called_at" in first && "turn_id" in first;
  },

  parseSession(raw: unknown): AgentSession {
    if (!Array.isArray(raw)) {
      throw new Error("otel-joined adapter expects an array of main.jsonl rows.");
    }
    const rows = raw.filter(isRec);
    if (rows.length === 0) {
      throw new Error("otel-joined trace has no rows.");
    }

    // group rows by turn_id, preserving first-seen turn order
    const byTurn = new Map<string, Rec[]>();
    for (const r of rows) {
      const tid = strOf(r.turn_id) ?? "turn-0";
      if (!byTurn.has(tid)) byTurn.set(tid, []);
      byTurn.get(tid)!.push(r);
    }

    const turns: AgentTurn[] = [...byTurn.entries()].map(([tid, rs], index) => {
      const ordered = [...rs].sort(
        (a, b) => (numOf(a.called_at) ?? 0) - (numOf(b.called_at) ?? 0),
      );
      const steps = ordered.map((r, i) => rowToStep(r, i));
      const startedAt = nsToIso(ordered[0]?.called_at);
      return compactTurn({
        id: tid,
        index,
        label: `turn ${index + 1}`,
        startedAt,
        steps,
        summary: summariseTurn(steps),
      });
    });

    const sessionId = strOf(rows[0].session_id) ?? "session";
    return { id: sessionId, source: "otel-joined trace", turns };
  },
};

/** small helper to keep AgentTurn tidy (drop undefined startedAt). */
function compactTurn(t: {
  id: string;
  index: number;
  label: string;
  startedAt?: string;
  steps: AgentStep[];
  summary: AgentTurn["summary"];
}): AgentTurn {
  const turn: AgentTurn = {
    id: t.id,
    index: t.index,
    label: t.label,
    steps: t.steps,
    summary: t.summary,
  };
  if (t.startedAt) turn.startedAt = t.startedAt;
  return turn;
}
