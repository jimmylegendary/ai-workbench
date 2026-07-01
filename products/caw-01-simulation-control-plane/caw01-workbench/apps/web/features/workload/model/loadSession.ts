import type { AgentSession } from "@caw/core";
import { genericAdapter } from "./genericAdapter";

/**
 * Parse a trace file's TEXT into a canonical `AgentSession`.
 *
 * Accepts either a single JSON document or JSONL (one JSON value per line,
 * treated as an array), then maps it through the generic adapter. Pure and
 * unit-testable: no I/O, no store access. `filename`, when given, is stamped
 * as the session `source`.
 *
 * Throws a clear Error on empty input, unparseable text, or an unrecognised
 * shape (propagated from the adapter).
 */
export function loadSession(text: string, filename?: string): AgentSession {
  const raw = parseText(text);
  const session = genericAdapter.parseSession(raw);
  return filename ? { ...session, source: filename } : session;
}

/** JSON first; on failure, fall back to JSONL (one object per non-empty line). */
function parseText(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("Cannot load an empty file.");
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    // not a single JSON document — try JSONL below
  }

  const lines = trimmed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    throw new Error("No JSON found in input.");
  }

  const objects: unknown[] = [];
  for (let i = 0; i < lines.length; i++) {
    try {
      objects.push(JSON.parse(lines[i]));
    } catch {
      throw new Error(
        `Could not parse input as JSON or JSONL (line ${i + 1} is not valid JSON).`,
      );
    }
  }

  return objects;
}
