import Link from "next/link";

/** 404 — keeps a dead link from looking like a broken app. */
export default function NotFound() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-8 text-center">
      <div>
        <h1 className="text-lg font-semibold text-text">Page not found</h1>
        <p className="mt-1 text-sm text-text-muted">
          That route doesn’t exist.
        </p>
        <Link
          href="/simulation"
          className="mt-4 inline-block rounded-[var(--radius-md)] bg-primary px-3 py-1.5 text-sm text-white"
        >
          Go to Simulation
        </Link>
      </div>
    </div>
  );
}
