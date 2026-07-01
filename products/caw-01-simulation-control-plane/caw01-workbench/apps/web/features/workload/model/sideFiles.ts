import type { SourceKind } from "@/features/workload/store";
import {
  readServerSideEntry,
  readStorageSideEntry,
} from "@/features/workload/model/serverTraceActions";
import { exampleSideEntry } from "@/features/workload/model/fixtures/otel-examples";

/**
 * Lazy side-file resolution for the Workload step inspector.
 *
 * Heavy per-request payloads (token ids / prompt hashes / raw messages / tool
 * io) never ship inside `main.jsonl` — each row only carries a `*_ref` pointer
 * ({ file, key, …counts }) kept in `step.meta`. On an explicit Load click the
 * inspector calls `resolveSideRef(ref, kind)`, which — depending on where the
 * session was loaded from — reads the sibling side file (Server / Supabase) or
 * synthesizes a shape-correct example row (Example). A single-file PC upload has
 * no side files, so it returns a clear ok:false message.
 *
 * Nothing here throws to the client: every path resolves to a typed result.
 */

/**
 * A side-file pointer as stamped into `step.meta` by the otel-joined adapter.
 * `key` matches the side row's `request_id` (llm refs) or `tool_id` (tool refs).
 * The extra count fields are per-ref hints used only for labels / synthesis.
 */
export interface SideRef {
  file: string;
  key: string;
  // raw_ref
  message_count?: number;
  chars?: number;
  // token_ids_ref
  prompt_count?: number;
  out_count?: number;
  // hash_ref
  n_blocks?: number;
  // tool_ref
  input_chars?: number;
  output_chars?: number;
}

/** Resolution outcome — the loaded (or synthesized) row on success. */
export type SideResult =
  | { ok: true; data: Record<string, unknown>; note?: string }
  | { ok: false; error: string };

/** Narrow an unknown `step.meta` value into a `SideRef` (null if not one). */
export function asSideRef(value: unknown): SideRef | null {
  if (typeof value !== "object" || value === null) return null;
  const r = value as Record<string, unknown>;
  if (typeof r.file !== "string" || typeof r.key !== "string") return null;
  return r as unknown as SideRef;
}

/**
 * Resolve a side-file ref for a session loaded from `kind`. Dispatches to the
 * matching backend; never throws.
 */
export async function resolveSideRef(
  ref: SideRef,
  kind: SourceKind,
): Promise<SideResult> {
  try {
    switch (kind) {
      case "example":
        return exampleSideEntry(ref);
      case "server":
        return await readServerSideEntry(ref);
      case "supabase":
        return await readStorageSideEntry(ref);
      case "pc":
      default:
        return {
          ok: false,
          error:
            "A single-file PC upload has no side files. Load the trace from a Server directory or a Supabase bucket (which ship the sibling tokens/hashes/raw/tools.jsonl) to inspect this payload.",
        };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
