import {
  summariseTurn,
  type AgentSession,
  type AgentStep,
  type AgentTurn,
  type ExecLocation,
  type StepKind,
  type StepStatus,
  type TraceAdapter,
} from "@caw/core";

/**
 * generic-json adapter — a best-effort `TraceAdapter` that maps COMMON trace
 * JSON shapes onto the canonical `AgentSession`. It is intentionally permissive:
 * it pulls whatever fields it can recognise and never throws on a missing
 * OPTIONAL field. It throws only when it cannot locate any turns/steps at all,
 * so callers can surface a clear "unrecognised format" error.
 *
 * Handled input shapes:
 *   (a) `{ turns: [{ steps: [...] }] }` or `{ session: { turns: [...] } }`
 *   (b) a bare array of turns   → `[{ steps: [...] }, ...]`
 *   (c) a flat event array grouped by a turn id field (`turn_id`/`turnId`/
 *       `turn`); with no turn id, everything collapses into a single turn.
 */

// ---- tiny safe readers -----------------------------------------------------

type Rec = Record<string, unknown>;

const isRec = (v: unknown): v is Rec =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const asArray = (v: unknown): unknown[] | undefined =>
  Array.isArray(v) ? v : undefined;

const str = (v: unknown): string | undefined =>
  typeof v === "string" ? v : undefined;

const num = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;

/** string or number → string (ids can arrive as numbers). */
const idOf = (v: unknown): string | undefined =>
  typeof v === "string" ? v : typeof v === "number" ? String(v) : undefined;

/** first present, non-null value among the given keys. */
function pick(rec: Rec, ...keys: string[]): unknown {
  for (const k of keys) {
    const v = rec[k];
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
}

/** ISO string as-is; epoch number (s or ms) → ISO; otherwise undefined. */
function toIso(v: unknown): string | undefined {
  if (typeof v === "string") return v.trim() || undefined;
  if (typeof v === "number" && Number.isFinite(v)) {
    const ms = v > 1e12 ? v : v * 1000; // < ~2001 in ms ⇒ treat as seconds
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  }
  return undefined;
}

function deriveDuration(start?: string, end?: string): number | undefined {
  if (!start || !end) return undefined;
  const a = Date.parse(start);
  const b = Date.parse(end);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return undefined;
  return b - a;
}

function toStringArray(v: unknown): string[] | undefined {
  const arr = asArray(v);
  if (!arr) return undefined;
  const out = arr.map(idOf).filter((x): x is string => x !== undefined);
  return out.length ? out : undefined;
}

const toRecord = (v: unknown): Rec | undefined => (isRec(v) ? v : undefined);

// ---- field mapping ---------------------------------------------------------

const KIND_MAP: Record<string, StepKind> = {
  io: "io",
  input: "io",
  output: "io",
  prompt: "io",
  response: "io",
  message: "io",
  user: "io",
  assistant: "io",
  human: "io",
  ai: "io",
  router: "router",
  route: "router",
  routing: "router",
  decision: "router",
  branch: "router",
  llm: "llm",
  model: "llm",
  completion: "llm",
  generation: "llm",
  generate: "llm",
  chat: "llm",
  reason: "llm",
  plan: "llm",
  think: "llm",
  tool: "tool",
  function: "tool",
  action: "tool",
  call: "tool",
  tool_call: "tool",
  api: "tool",
  memory: "memory",
  retrieval: "memory",
  retrieve: "memory",
  recall: "memory",
  store: "memory",
  vector: "memory",
  embed: "memory",
  server: "server",
  serving: "server",
  inference: "server",
  vllm: "server",
};

/** kind/type/role → StepKind; unknown non-io defaults to "tool". */
function mapKind(v: unknown): StepKind {
  const s = str(v)?.toLowerCase().trim();
  if (!s) return "tool";
  if (s in KIND_MAP) return KIND_MAP[s];
  if (/(input|output|prompt|response|message|assistant)/.test(s)) return "io";
  if (/(rout|decision|branch|classif|dispatch)/.test(s)) return "router";
  if (/(llm|model|complet|generat|chat|reason|plan|think)/.test(s)) return "llm";
  if (/(memor|retriev|recall|vector|embed|scratch)/.test(s)) return "memory";
  if (/(server|serv|vllm|tgi|endpoint|infer)/.test(s)) return "server";
  return "tool";
}

const STATUS_MAP: Record<string, StepStatus> = {
  ok: "ok",
  success: "ok",
  succeeded: "ok",
  successful: "ok",
  complete: "ok",
  completed: "ok",
  done: "ok",
  finished: "ok",
  pass: "ok",
  passed: "ok",
  error: "error",
  err: "error",
  fail: "error",
  failed: "error",
  failure: "error",
  exception: "error",
  running: "running",
  pending: "running",
  in_progress: "running",
  inprogress: "running",
  active: "running",
  started: "running",
};

function mapStatus(v: unknown): StepStatus {
  const s = str(v)?.toLowerCase().trim();
  if (s && s in STATUS_MAP) return STATUS_MAP[s];
  return "unknown";
}

function mapExec(v: unknown): ExecLocation | undefined {
  const s = str(v)?.toLowerCase().trim();
  if (s === "client" || s === "local") return "client";
  if (s === "server" || s === "remote" || s === "cloud") return "server";
  return undefined;
}

// ---- step / turn builders --------------------------------------------------

function toStep(raw: unknown, i: number): AgentStep {
  if (!isRec(raw)) {
    return {
      id: `step-${i + 1}`,
      kind: "tool",
      name: typeof raw === "string" && raw ? raw : `step ${i + 1}`,
      status: "unknown",
    };
  }

  const kind = mapKind(
    pick(raw, "kind", "type", "role", "stepKind", "step_type", "category"),
  );
  const startedAt = toIso(
    pick(raw, "startedAt", "started_at", "start", "startTime", "timestamp", "ts", "time"),
  );
  const endedAt = toIso(
    pick(raw, "endedAt", "ended_at", "end", "endTime", "finishedAt", "finished_at"),
  );

  const step: AgentStep = {
    id:
      idOf(pick(raw, "id", "stepId", "step_id", "uuid", "spanId", "span_id")) ??
      `step-${i + 1}`,
    kind,
    name:
      str(
        pick(
          raw,
          "name",
          "label",
          "title",
          "tool",
          "toolName",
          "tool_name",
          "action",
          "operation",
          "op",
        ),
      ) ?? kind,
    status: mapStatus(pick(raw, "status", "state", "outcome", "result_status")),
  };

  const parentId = idOf(pick(raw, "parentId", "parent_id", "parent", "parentStep"));
  if (parentId) step.parentId = parentId;

  const next = toStringArray(
    pick(raw, "next", "nextSteps", "next_steps", "children", "downstream"),
  );
  if (next) step.next = next;

  if (startedAt) step.startedAt = startedAt;
  if (endedAt) step.endedAt = endedAt;

  const durationMs =
    num(
      pick(
        raw,
        "durationMs",
        "duration_ms",
        "latencyMs",
        "latency_ms",
        "elapsedMs",
        "elapsed_ms",
        "tookMs",
      ),
    ) ?? deriveDuration(startedAt, endedAt);
  if (durationMs !== undefined) step.durationMs = durationMs;

  const exec = mapExec(
    pick(raw, "execLocation", "exec_location", "location", "where", "runtime"),
  );
  if (exec) step.execLocation = exec;

  const tokensIn = num(
    pick(raw, "tokensIn", "tokens_in", "promptTokens", "prompt_tokens", "inputTokens", "input_tokens"),
  );
  if (tokensIn !== undefined) step.tokensIn = tokensIn;

  const tokensOut = num(
    pick(raw, "tokensOut", "tokens_out", "completionTokens", "completion_tokens", "outputTokens", "output_tokens"),
  );
  if (tokensOut !== undefined) step.tokensOut = tokensOut;

  const costUsd = num(pick(raw, "costUsd", "cost_usd", "cost"));
  if (costUsd !== undefined) step.costUsd = costUsd;

  const args = toRecord(
    pick(raw, "args", "arguments", "input", "inputs", "params", "parameters", "request"),
  );
  if (args) step.args = args;

  const result = pick(raw, "result", "output", "outputs", "response", "return", "data");
  if (result !== undefined) step.result = result;

  const meta = toRecord(pick(raw, "meta", "metadata", "attributes", "extra"));
  if (meta) step.meta = meta;

  return step;
}

function toTurn(raw: unknown, index: number): AgentTurn {
  const rec = isRec(raw) ? raw : {};
  const rawSteps =
    asArray(pick(rec, "steps", "events", "spans", "trace", "actions")) ?? [];
  const steps = rawSteps.map((s, i) => toStep(s, i));

  const startedAt = toIso(
    pick(rec, "startedAt", "started_at", "start", "startTime", "timestamp"),
  );
  const endedAt = toIso(pick(rec, "endedAt", "ended_at", "end", "endTime"));

  const turn: AgentTurn = {
    id: idOf(pick(rec, "id", "turnId", "turn_id", "uuid")) ?? `turn-${index + 1}`,
    index: num(pick(rec, "index", "turnIndex", "turn_index")) ?? index,
    steps,
    summary: summariseTurn(steps),
  };

  const label = str(pick(rec, "label", "name", "title", "summary"));
  if (label) turn.label = label;
  if (startedAt) turn.startedAt = startedAt;
  if (endedAt) turn.endedAt = endedAt;

  const durationMs =
    num(pick(rec, "durationMs", "duration_ms", "durationMillis")) ??
    deriveDuration(startedAt, endedAt) ??
    (steps.some((s) => s.durationMs !== undefined)
      ? steps.reduce((a, s) => a + (s.durationMs ?? 0), 0)
      : undefined);
  if (durationMs !== undefined) turn.durationMs = durationMs;

  return turn;
}

// ---- shape detection -------------------------------------------------------

const TURN_ID_KEYS = [
  "turn_id",
  "turnId",
  "turn",
  "turnIndex",
  "turn_index",
  "conversationTurn",
] as const;

/** Group a flat event array into turn-like records keyed by a turn id field. */
function groupEvents(events: unknown[]): Rec[] {
  const groups = new Map<string, unknown[]>();
  const order: string[] = [];
  for (const e of events) {
    const tid = isRec(e) ? idOf(pick(e, ...TURN_ID_KEYS)) : undefined;
    const key = tid ?? "__single__";
    let bucket = groups.get(key);
    if (!bucket) {
      bucket = [];
      groups.set(key, bucket);
      order.push(key);
    }
    bucket.push(e);
  }
  return order.map((k, i) => ({
    id: k === "__single__" ? `turn-${i + 1}` : k,
    index: i,
    steps: groups.get(k) ?? [],
  }));
}

type Extracted =
  | { kind: "turns"; turns: unknown[] }
  | { kind: "events"; events: unknown[] };

/** Locate the turn list (or a flat event stream) inside common wrappers. */
function extract(raw: unknown): Extracted | null {
  // {session:{turns}}
  if (isRec(raw) && isRec(raw.session)) {
    const t = asArray(raw.session.turns);
    if (t && t.length) return { kind: "turns", turns: t };
  }
  // {turns:[...]}
  if (isRec(raw)) {
    const t = asArray(raw.turns);
    if (t && t.length) return { kind: "turns", turns: t };
  }
  // bare array — turns (have steps/events) or a flat event stream
  if (Array.isArray(raw)) {
    if (raw.length === 0) return null;
    const looksLikeTurns = raw.some(
      (it) => isRec(it) && (asArray(it.steps) || asArray(it.events)),
    );
    return looksLikeTurns
      ? { kind: "turns", turns: raw }
      : { kind: "events", events: raw };
  }
  // {events|steps|trace|log|spans:[...]} flat
  if (isRec(raw)) {
    const ev =
      asArray(raw.events) ??
      asArray(raw.steps) ??
      asArray(raw.trace) ??
      asArray(raw.log) ??
      asArray(raw.spans);
    if (ev && ev.length) return { kind: "events", events: ev };
  }
  return null;
}

// ---- adapter ---------------------------------------------------------------

export const genericAdapter: TraceAdapter = {
  name: "generic-json",

  detect(raw: unknown): boolean {
    return extract(raw) !== null;
  },

  parseSession(raw: unknown): AgentSession {
    const found = extract(raw);
    if (!found) {
      throw new Error(
        "generic-json adapter: could not find any turns or steps in the input.",
      );
    }

    const turnRecs =
      found.kind === "turns" ? found.turns : groupEvents(found.events);
    const turns = turnRecs.map((t, i) => toTurn(t, i));

    const totalSteps = turns.reduce((a, t) => a + t.steps.length, 0);
    if (turns.length === 0 || totalSteps === 0) {
      throw new Error(
        "generic-json adapter: found a session shell but no steps to render.",
      );
    }

    const sessRec: Rec = isRec(raw)
      ? isRec(raw.session)
        ? raw.session
        : raw
      : {};

    const session: AgentSession = {
      id: idOf(pick(sessRec, "id", "sessionId", "session_id", "uuid")) ?? "session-1",
      turns,
    };

    const source = str(pick(sessRec, "source", "exporter", "origin"));
    if (source) session.source = source;

    const createdAt =
      toIso(pick(sessRec, "createdAt", "created_at", "timestamp")) ??
      turns[0]?.startedAt;
    if (createdAt) session.createdAt = createdAt;

    const meta = toRecord(pick(sessRec, "meta", "metadata"));
    if (meta) session.meta = meta;

    return session;
  },
};
