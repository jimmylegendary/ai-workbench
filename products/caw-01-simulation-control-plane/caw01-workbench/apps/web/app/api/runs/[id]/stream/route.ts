import type { NextRequest } from "next/server";
import type { AxisStatus } from "@caw/core";

export const dynamic = "force-dynamic";

/**
 * SSE run status (ADR-0003 §2). A real implementation pipes the engine port's
 * streamStatus(runId) (SimEnginePort) to the client; the browser consumes this
 * via useRunStatus. Heavy IR/trace bytes are NEVER streamed here — only status.
 * STUB: emit a couple of frames then a terminal "succeeded".
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await params; // runId — used by the engine port in the real impl

  const encoder = new TextEncoder();
  const frame = (axes: AxisStatus[]) =>
    encoder.encode(`data: ${JSON.stringify(axes)}\n\n`);

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        frame([
          { axis: "real", status: "succeeded", progress: 1 },
          { axis: "synthetic", status: "running", progress: 0.4 },
          { axis: "sim", status: "queued" },
        ]),
      );
      // TODO: replace with `for await (const axes of enginePort.streamStatus(id))`
      const t = setTimeout(() => {
        controller.enqueue(
          frame([
            { axis: "real", status: "succeeded", progress: 1 },
            { axis: "synthetic", status: "succeeded", progress: 1 },
            { axis: "sim", status: "succeeded", progress: 1 },
          ]),
        );
        controller.close();
      }, 1500);
      // best-effort cleanup
      return () => clearTimeout(t);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
