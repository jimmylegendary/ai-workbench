import {
  summariseTurn,
  type AgentSession,
  type AgentStep,
  type AgentTurn,
} from "@caw/core";

/**
 * Example agent-trace SESSION — the Workload viewer's "always shows something"
 * fixture until a real company trace is loaded through a TraceAdapter. Two turns
 * of a tool-using agent; each turn's `server` step is what would drive the
 * Serving pipeline (synthetic/sim axes). Shapes match @caw/core AgentSession.
 */

const T = (base: string, sec: number) =>
  new Date(Date.parse(base) + sec * 1000).toISOString();

function turn(
  id: string,
  index: number,
  label: string,
  base: string,
  steps: AgentStep[],
): AgentTurn {
  const totalMs = steps.reduce((a, s) => a + (s.durationMs ?? 0), 0);
  return {
    id,
    index,
    label,
    startedAt: base,
    endedAt: T(base, Math.round(totalMs / 1000)),
    durationMs: totalMs,
    steps,
    summary: summariseTurn(steps),
  };
}

const B1 = "2026-06-30T14:02:00Z";
const turn1Steps: AgentStep[] = [
  { id: "t1-in", kind: "io", name: "user prompt", execLocation: "client", startedAt: T(B1, 0), durationMs: 20, status: "ok", args: { text: "summarise the incident + propose a fix" } },
  { id: "t1-route", kind: "router", name: "route → tool-use", parentId: "t1-in", next: ["t1-llm1"], startedAt: T(B1, 0), durationMs: 8, status: "ok" },
  { id: "t1-llm1", kind: "llm", name: "plan (LLM)", parentId: "t1-route", next: ["t1-srv1", "t1-tool1"], execLocation: "server", startedAt: T(B1, 1), durationMs: 640, tokensIn: 1180, tokensOut: 210, costUsd: 0.004, status: "ok" },
  { id: "t1-srv1", kind: "server", name: "vLLM generate", parentId: "t1-llm1", execLocation: "server", startedAt: T(B1, 1), durationMs: 610, tokensIn: 1180, tokensOut: 210, status: "ok", meta: { model: "internal-llm-8b", batch: 4 } },
  { id: "t1-tool1", kind: "tool", name: "search_logs", parentId: "t1-llm1", next: ["t1-mem1"], execLocation: "client", startedAt: T(B1, 2), durationMs: 320, status: "ok", args: { query: "incident 4471 stacktrace" } },
  { id: "t1-mem1", kind: "memory", name: "write scratchpad", parentId: "t1-tool1", next: ["t1-out"], startedAt: T(B1, 2), durationMs: 12, status: "ok" },
  { id: "t1-out", kind: "io", name: "assistant reply", parentId: "t1-mem1", execLocation: "client", startedAt: T(B1, 3), durationMs: 15, status: "ok" },
];

const B2 = "2026-06-30T14:03:10Z";
const turn2Steps: AgentStep[] = [
  { id: "t2-in", kind: "io", name: "user follow-up", execLocation: "client", startedAt: T(B2, 0), durationMs: 18, status: "ok", args: { text: "apply the fix to staging" } },
  { id: "t2-route", kind: "router", name: "route → tool-use", parentId: "t2-in", next: ["t2-llm1"], startedAt: T(B2, 0), durationMs: 7, status: "ok" },
  { id: "t2-llm1", kind: "llm", name: "reason (LLM)", parentId: "t2-route", next: ["t2-srv1", "t2-tool1"], execLocation: "server", startedAt: T(B2, 1), durationMs: 720, tokensIn: 1540, tokensOut: 260, costUsd: 0.005, status: "ok" },
  { id: "t2-srv1", kind: "server", name: "vLLM generate", parentId: "t2-llm1", execLocation: "server", startedAt: T(B2, 1), durationMs: 690, tokensIn: 1540, tokensOut: 260, status: "ok", meta: { model: "internal-llm-8b", batch: 6 } },
  { id: "t2-tool1", kind: "tool", name: "deploy_staging", parentId: "t2-llm1", next: ["t2-out"], execLocation: "client", startedAt: T(B2, 2), durationMs: 1450, status: "error", args: { env: "staging" }, result: { error: "quota exceeded" } },
  { id: "t2-out", kind: "io", name: "assistant reply", parentId: "t2-tool1", execLocation: "client", startedAt: T(B2, 4), durationMs: 16, status: "ok" },
];

export const exampleSession: AgentSession = {
  id: "sess-example-1",
  source: "example fixture",
  createdAt: B1,
  turns: [
    turn("turn-1", 0, "incident triage", B1, turn1Steps),
    turn("turn-2", 1, "apply fix", B2, turn2Steps),
  ],
};
