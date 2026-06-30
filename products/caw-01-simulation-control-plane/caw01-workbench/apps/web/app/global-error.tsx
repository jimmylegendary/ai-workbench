"use client";

/**
 * Last-resort boundary for errors thrown in the ROOT layout itself (where the
 * normal error.tsx can't render because the layout is what failed). Renders its
 * own <html>/<body> with inline styles (globals.css may not be available here).
 * Recoverable via reset() — a single bad render never takes the whole app down.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          background: "#0b0d10",
          color: "#e6e8eb",
        }}
      >
        <div style={{ maxWidth: 460, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 8px" }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: 13, color: "#9aa1ac", margin: "0 0 4px" }}>
            The app hit an unexpected error. Your data is unaffected.
          </p>
          {error?.digest && (
            <p style={{ fontSize: 11, color: "#5b6573", fontFamily: "monospace" }}>
              ref: {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 16,
              padding: "8px 14px",
              borderRadius: 6,
              border: "none",
              background: "#2563eb",
              color: "#fff",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
