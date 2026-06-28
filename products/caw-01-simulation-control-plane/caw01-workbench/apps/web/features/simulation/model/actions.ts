"use server";

import { StartRunInput } from "@caw/core";

/**
 * Server Actions = the human-mutation path (ADR-0003 §2). They are THIN: validate
 * with the shared Zod contract, then delegate to a @caw/core service which writes
 * the Supabase metadata row AND drives the engine port. MCP/CLI import the core
 * directly and never call these (ADR-0001).
 *
 * STUB: wire RunService(runRepo, enginePort) once @caw/db + engine-adapters land.
 */
export async function startRunAction(input: unknown) {
  const parsed = StartRunInput.parse(input);
  // TODO: const svc = new RunService(serverRunRepo, engineAdapter);
  //       return svc.start(parsed);
  return { ok: true as const, queued: parsed, todo: "wire RunService" };
}

export async function stopRunAction(runId: string) {
  // TODO: svc.stop(runId)
  return { ok: true as const, runId, todo: "wire RunService.stop" };
}

export async function saveAction(_kind: "item" | "full") {
  // TODO: WorkTreeService via @caw/core (per-item / full save, ADR-0007)
  return { ok: true as const };
}
