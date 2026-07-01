"use server";

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@/lib/supabase/server";
import type { SideRef, SideResult } from "@/features/workload/model/sideFiles";

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

// ── Side-file entries (lazy, per-step) ───────────────────────────────────────
//
// A side file (tokens/hashes/raw/tools.jsonl) is a sibling of the main trace.
// Given a ref { file, key }, we read the file, parse it as JSON or JSONL, and
// return the single row whose `request_id` (llm refs) or `tool_id` (tool refs)
// equals `ref.key`. Same never-throw + traversal-hardening contract as above.

/** A bare in-root file name (no separators / traversal / absolute path). */
function isSafeName(name: string): boolean {
  return (
    !!name &&
    !path.isAbsolute(name) &&
    !name.includes("..") &&
    !/[\\/]/.test(name) &&
    TRACE_EXT.test(name)
  );
}

/** Parse side-file text as a JSON array/object OR JSONL rows (skips bad lines). */
function parseRows(text: string): Record<string, unknown>[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];
  // Try a single JSON document first (array or object).
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (r): r is Record<string, unknown> => typeof r === "object" && r !== null,
      );
    }
    if (typeof parsed === "object" && parsed !== null) {
      return [parsed as Record<string, unknown>];
    }
  } catch {
    // fall through to JSONL
  }
  const rows: Record<string, unknown>[] = [];
  for (const line of trimmed.split(/\r?\n/)) {
    const s = line.trim();
    if (!s) continue;
    try {
      const r = JSON.parse(s) as unknown;
      if (typeof r === "object" && r !== null) rows.push(r as Record<string, unknown>);
    } catch {
      // skip malformed line
    }
  }
  return rows;
}

/** Find the row whose request_id / tool_id equals the ref key. */
function findByKey(
  rows: Record<string, unknown>[],
  key: string,
): Record<string, unknown> | undefined {
  return rows.find((r) => r.request_id === key || r.tool_id === key);
}

/** Read one side-file row from disk (sibling of the server trace dir). */
export async function readServerSideEntry(ref: SideRef): Promise<SideResult> {
  const dir = process.env.WORKLOAD_TRACE_DIR;
  if (!dir) return { ok: false, error: "WORKLOAD_TRACE_DIR is not set." };
  if (!ref || !isSafeName(ref.file)) {
    return { ok: false, error: "Invalid side-file name." };
  }

  const root = path.resolve(dir);
  const resolved = path.resolve(root, ref.file);
  if (resolved !== path.join(root, path.basename(ref.file))) {
    return { ok: false, error: "Refusing to read outside the trace directory." };
  }

  try {
    const text = await readFile(resolved, "utf8");
    const row = findByKey(parseRows(text), ref.key);
    if (!row) {
      return { ok: false, error: `No entry for "${ref.key}" in ${ref.file}.` };
    }
    return { ok: true, data: row };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to read side file.",
    };
  }
}

/** Read one side-file row from the Supabase Storage bucket. */
export async function readStorageSideEntry(ref: SideRef): Promise<SideResult> {
  if (!supabaseConfigured()) {
    return { ok: false, error: "Supabase is not configured (local mode)." };
  }
  if (!ref || !isSafeName(ref.file)) {
    return { ok: false, error: "Invalid side-file path." };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.storage
      .from(traceBucket())
      .download(ref.file);
    if (error || !data) {
      return { ok: false, error: error?.message ?? "Side file not found." };
    }
    const text = await data.text();
    const row = findByKey(parseRows(text), ref.key);
    if (!row) {
      return { ok: false, error: `No entry for "${ref.key}" in ${ref.file}.` };
    }
    return { ok: true, data: row };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to download side file.",
    };
  }
}
