import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

// Monorepo workspace root (caw01-workbench/) — silences Next's multi-lockfile
// root inference and scopes output file tracing correctly.
const workspaceRoot = fileURLToPath(new URL("../../", import.meta.url));

const nextConfig: NextConfig = {
  // @caw/core is consumed as TS source from the workspace.
  transpilePackages: ["@caw/core"],
  outputFileTracingRoot: workspaceRoot,
  experimental: {
    // Server Actions are the human-mutation path (ADR-0003 §2).
    serverActions: { bodySizeLimit: "2mb" },
  },
  webpack: (config) => {
    // @caw/core uses ESM ".js" import specifiers that point at ".ts" sources
    // (resolved by tsc's bundler mode). Teach webpack the same mapping.
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".jsx": [".tsx", ".jsx"],
    };
    return config;
  },
};

export default nextConfig;
