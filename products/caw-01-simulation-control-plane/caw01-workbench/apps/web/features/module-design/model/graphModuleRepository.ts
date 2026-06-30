import { createClient } from "@/lib/supabase/client";

/**
 * Flow-module library repository — persists SAVED flow graphs composed in the
 * Workload (agent-turn harness) and Serving (serving → representation →
 * simulator) Module Design editors so they can be reloaded and reused.
 *
 * Mirrors `moduleRepository` (the HW library): backed by Supabase
 * (`flow_module`, owner-RLS — see migration 0004) when a real user session is
 * present, and falling back to `localStorage` in the no-auth preview (no env /
 * no session) so "Save as … module" still persists across reloads and the
 * "Saved modules" palette still works. Both paths return the same
 * `SavedFlowModule` shape, so callers never branch on the backend.
 *
 * The graph itself is intentionally generic (`FlowGraph<N, E>`): each composer
 * stores its own node/edge shapes (workload uses WorkloadNode/WorkloadEdge,
 * serving uses ServingFlowNode/ServingFlowEdge) and round-trips them wholesale.
 */

export type FlowModuleKind = "workload" | "serving";

/** A composed flow graph — the editor's working document, stored wholesale. */
export interface FlowGraph<N = unknown, E = unknown> {
  nodes: N[];
  edges: E[];
}

export interface SavedFlowModule<N = unknown, E = unknown> {
  id: string;
  name: string;
  kind: FlowModuleKind;
  graph: FlowGraph<N, E>;
  createdAt: string;
}

/** Input to {@link save} — what the composer hands over. */
export interface SaveFlowModuleInput<N = unknown, E = unknown> {
  name: string;
  kind: FlowModuleKind;
  graph: FlowGraph<N, E>;
}

const LS_KEY = "caw01.flow_modules";

/* ---- Supabase availability (a real authenticated session?) ---------------- */

async function authedClient(): Promise<ReturnType<typeof createClient> | null> {
  try {
    const client = createClient();
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) return null;
    return client;
  } catch {
    return null; // missing env / SSR / network — use the local fallback.
  }
}

/* ---- localStorage fallback ------------------------------------------------ */

function readLocal(): SavedFlowModule[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedFlowModule[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocal(modules: SavedFlowModule[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(modules));
  } catch {
    // quota / private-mode — best-effort only.
  }
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `flow-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function saveLocal(input: SaveFlowModuleInput): SavedFlowModule {
  const mod: SavedFlowModule = {
    id: newId(),
    name: input.name,
    kind: input.kind,
    graph: input.graph,
    createdAt: new Date().toISOString(),
  };
  writeLocal([mod, ...readLocal()]);
  return mod;
}

/* ---- row mapping ---------------------------------------------------------- */

interface FlowModuleRow {
  id: string;
  name: string;
  kind: FlowModuleKind;
  graph: FlowGraph;
  created_at: string;
}

const rowToModule = (r: FlowModuleRow): SavedFlowModule => ({
  id: r.id,
  name: r.name,
  kind: r.kind,
  graph: r.graph,
  createdAt: r.created_at,
});

/* ---- public API ----------------------------------------------------------- */

/** Persist the working graph as a reusable module. Returns the saved record. */
export async function save<N = unknown, E = unknown>(
  input: SaveFlowModuleInput<N, E>,
): Promise<SavedFlowModule<N, E>> {
  const client = await authedClient();
  if (client) {
    const { data, error } = await client
      .from("flow_module")
      .insert({ name: input.name, kind: input.kind, graph: input.graph })
      .select("id, name, kind, graph, created_at")
      .single();
    if (!error && data)
      return rowToModule(data as FlowModuleRow) as SavedFlowModule<N, E>;
    // fall through to local on RLS / network error so a save never silently drops.
  }
  return saveLocal(input) as SavedFlowModule<N, E>;
}

/** List saved modules of a given kind, newest first. */
export async function list<N = unknown, E = unknown>(
  kind: FlowModuleKind,
): Promise<SavedFlowModule<N, E>[]> {
  const client = await authedClient();
  if (client) {
    const { data, error } = await client
      .from("flow_module")
      .select("id, name, kind, graph, created_at")
      .eq("kind", kind)
      .order("created_at", { ascending: false });
    if (!error && data)
      return (data as FlowModuleRow[]).map(rowToModule) as SavedFlowModule<N, E>[];
  }
  return readLocal().filter((m) => m.kind === kind) as SavedFlowModule<N, E>[];
}

/** Fetch one saved module by id (or null if missing). */
export async function get<N = unknown, E = unknown>(
  id: string,
): Promise<SavedFlowModule<N, E> | null> {
  const client = await authedClient();
  if (client) {
    const { data, error } = await client
      .from("flow_module")
      .select("id, name, kind, graph, created_at")
      .eq("id", id)
      .maybeSingle();
    if (!error && data)
      return rowToModule(data as FlowModuleRow) as SavedFlowModule<N, E>;
  }
  return (readLocal().find((m) => m.id === id) ?? null) as SavedFlowModule<
    N,
    E
  > | null;
}

export const graphModuleRepository = { save, list, get };
