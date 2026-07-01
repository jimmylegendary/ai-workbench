"use server";

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@/lib/supabase/server";

/**
 * Server actions for the WorkloadPanel's non-PC trace sources.
 *
 *  • Server source   — files on disk under WORKLOAD_TRACE_DIR (node fs).
 *  • Supabase source — objects in the WORKLOAD_TRACE_BUCKET Storage bucket.
 *
 * These NEVER throw to the client: every path returns a typed result so the
 * rail can surface a small message and keep the current session. The read
 * paths are traversal-hardened — a chosen name can only resolve to a file
 * directly inside the configured root/bucket.
 */

/** Listing outcome shared by both sources — `configured` drives the "unset" note. */
export interface TraceListResult {
  configured: boolean;
  files: string[];
  error?: string;
}

/** Read outcome — text on success, a message on failure (never throws). */
export type TraceReadResult =
  | { ok: true; text: string }
  | { ok: false; error: string };

const TRACE_EXT = /\.(json|jsonl)$/i;
const DEFAULT_BUCKET = "workload-traces";

const supabaseConfigured = (): boolean =>
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const traceBucket = (): string =>
  process.env.WORKLOAD_TRACE_BUCKET || DEFAULT_BUCKET;

// ── Server (filesystem) source ───────────────────────────────────────────────

/** List *.json / *.jsonl file names under WORKLOAD_TRACE_DIR ([] if unset). */
export async function listServerTraces(): Promise<TraceListResult> {
  const dir = process.env.WORKLOAD_TRACE_DIR;
  if (!dir) return { configured: false, files: [] };

  try {
    const entries = await readdir(path.resolve(dir), { withFileTypes: true });
    const files = entries
      .filter((e) => e.isFile() && TRACE_EXT.test(e.name))
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b));
    return { configured: true, files };
  } catch (e) {
    return {
      configured: true,
      files: [],
      error: e instanceof Error ? e.message : "Failed to read trace directory.",
    };
  }
}

/** Read one trace file by name — resolved strictly within WORKLOAD_TRACE_DIR. */
export async function readServerTrace(name: string): Promise<TraceReadResult> {
  const dir = process.env.WORKLOAD_TRACE_DIR;
  if (!dir) return { ok: false, error: "WORKLOAD_TRACE_DIR is not set." };

  // SECURITY: reject anything that isn't a bare file name in the root.
  if (!name || path.isAbsolute(name) || name.includes("..") || /[\\/]/.test(name)) {
    return { ok: false, error: "Invalid trace name." };
  }
  if (!TRACE_EXT.test(name)) {
    return { ok: false, error: "Only .json / .jsonl traces are allowed." };
  }

  const root = path.resolve(dir);
  const resolved = path.resolve(root, name);
  if (resolved !== path.join(root, path.basename(name))) {
    return { ok: false, error: "Refusing to read outside the trace directory." };
  }

  try {
    const text = await readFile(resolved, "utf8");
    return { ok: true, text };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to read trace file.",
    };
  }
}

// ── Supabase Storage source ──────────────────────────────────────────────────

/** List *.json / *.jsonl objects in the trace bucket (configured:false in local mode). */
export async function listStorageTraces(): Promise<TraceListResult> {
  if (!supabaseConfigured()) return { configured: false, files: [] };

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.storage
      .from(traceBucket())
      .list(undefined, { sortBy: { column: "name", order: "asc" } });
    if (error) return { configured: true, files: [], error: error.message };

    const files = (data ?? [])
      .map((o) => o.name)
      .filter((n) => TRACE_EXT.test(n));
    return { configured: true, files };
  } catch (e) {
    return {
      configured: true,
      files: [],
      error: e instanceof Error ? e.message : "Failed to list storage traces.",
    };
  }
}

/** Download one trace object from the bucket and return its text. */
export async function readStorageTrace(objectPath: string): Promise<TraceReadResult> {
  if (!supabaseConfigured()) {
    return { ok: false, error: "Supabase is not configured (local mode)." };
  }
  if (!objectPath || path.isAbsolute(objectPath) || objectPath.includes("..")) {
    return { ok: false, error: "Invalid trace path." };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.storage
      .from(traceBucket())
      .download(objectPath);
    if (error || !data) {
      return { ok: false, error: error?.message ?? "Trace not found." };
    }
    const text = await data.text();
    return { ok: true, text };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to download trace.",
    };
  }
}
