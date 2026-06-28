import { StartRunInput } from "../schemas/run.js";
import type { SimEnginePort, RunRepository } from "../ports/index.js";

/**
 * RunService — the single home of the "start/stop a run" verb (ADR-0001).
 * Web Server Actions, MCP, and CLI all call THIS, never each other's transport.
 * Writes the metadata row (RunRepository) AND drives the engine (SimEnginePort);
 * the engine later fills ir_uri/artifact_uri via the callback. STUB.
 */
export class RunService {
  constructor(
    private readonly runs: RunRepository,
    private readonly engine: SimEnginePort,
  ) {}

  async start(rawInput: unknown) {
    const input = StartRunInput.parse(rawInput); // one validation contract
    const row = await this.runs.createQueued(input.experiment_id, input.config_id);
    const { runId } = await this.engine.startRun(input);
    // TODO: associate runId with row; reconcile on engine callback.
    return { run: row, runId };
  }

  async stop(runId: string) {
    await this.engine.cancelRun(runId);
    // TODO: mark the run row cancelled.
  }
}
