import { NextResponse } from "next/server";

/**
 * Engine reachability probe for Settings → Engine "Test connection".
 *
 * Runs server-side so it can use the `ENGINE_BASE_URL` server env as a fallback
 * and is not subject to browser CORS. Pass `?url=` to test a candidate base URL
 * the user typed before saving. "reachable" means the engine answered at all
 * (any HTTP status); the real SimEnginePort exposes a richer /healthz later.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const base = (searchParams.get("url") || process.env.ENGINE_BASE_URL || "").trim();

  if (!base) {
    return NextResponse.json(
      { reachable: false, error: "No engine base URL configured." },
      { status: 400 },
    );
  }

  let target: string;
  try {
    target = new URL("/healthz", base).toString();
  } catch {
    return NextResponse.json(
      { reachable: false, error: "Invalid engine base URL." },
      { status: 400 },
    );
  }

  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(target, { signal: controller.signal, cache: "no-store" });
    return NextResponse.json({
      reachable: true,
      ok: res.ok,
      status: res.status,
      url: target,
      ms: Date.now() - startedAt,
    });
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return NextResponse.json({
      reachable: false,
      url: target,
      ms: Date.now() - startedAt,
      error: aborted ? "Timed out after 4s." : "Could not reach the engine.",
    });
  } finally {
    clearTimeout(timer);
  }
}
