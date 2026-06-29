import type { HwTreeNode } from "@/features/simulation/model/fixtures/c3";
import { createClient } from "@/lib/supabase/client";

/**
 * Module library repository — persists SAVED hardware modules (the working
 * HwTreeNode the Module Design editor composes) so they can be reused as
 * children of a higher-level design.
 *
 * Backed by Supabase (`hw_module`, owner-RLS — see migration 0003) when a user
 * session is present. In the no-auth preview (no env / no session) it falls
 * back to `localStorage` so "Save as module" still persists across reloads and
 * the "Saved modules" palette still works. Both paths return the same
 * `SavedModule` shape, so callers never branch on the backend.
 */

export interface SavedModule {
  id: string;
  name: string;
  rootLevel: string;
  /** the full HwTreeNode document (what gets instantiated on reuse). */
  specTree: HwTreeNode;
  createdAt: string;
}

const LS_KEY = "caw01.hw_modules";

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

function readLocal(): SavedModule[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedModule[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocal(modules: SavedModule[]): void {
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
  return `mod-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function saveLocal(root: HwTreeNode): SavedModule {
  const mod: SavedModule = {
    id: newId(),
    name: root.name,
    rootLevel: root.level,
    specTree: root,
    createdAt: new Date().toISOString(),
  };
  writeLocal([mod, ...readLocal()]);
  return mod;
}

/* ---- row mapping ---------------------------------------------------------- */

interface ModuleRow {
  id: string;
  name: string;
  root_level: string;
  spec_tree: HwTreeNode;
  created_at: string;
}

const rowToModule = (r: ModuleRow): SavedModule => ({
  id: r.id,
  name: r.name,
  rootLevel: r.root_level,
  specTree: r.spec_tree,
  createdAt: r.created_at,
});

/* ---- public API ----------------------------------------------------------- */

/** Persist the working tree as a reusable module. Returns the saved record. */
export async function save(root: HwTreeNode): Promise<SavedModule> {
  const client = await authedClient();
  if (client) {
    const { data, error } = await client
      .from("hw_module")
      .insert({ name: root.name, root_level: root.level, spec_tree: root })
      .select("id, name, root_level, spec_tree, created_at")
      .single();
    if (!error && data) return rowToModule(data as ModuleRow);
    // fall through to local on RLS / network error so a save never silently drops.
  }
  return saveLocal(root);
}

/** List saved modules, newest first. */
export async function list(): Promise<SavedModule[]> {
  const client = await authedClient();
  if (client) {
    const { data, error } = await client
      .from("hw_module")
      .select("id, name, root_level, spec_tree, created_at")
      .order("created_at", { ascending: false });
    if (!error && data) return (data as ModuleRow[]).map(rowToModule);
  }
  return readLocal();
}

/** Fetch one saved module by id (or null if missing). */
export async function get(id: string): Promise<SavedModule | null> {
  const client = await authedClient();
  if (client) {
    const { data, error } = await client
      .from("hw_module")
      .select("id, name, root_level, spec_tree, created_at")
      .eq("id", id)
      .maybeSingle();
    if (!error && data) return rowToModule(data as ModuleRow);
  }
  return readLocal().find((m) => m.id === id) ?? null;
}

export const moduleRepository = { save, list, get };
