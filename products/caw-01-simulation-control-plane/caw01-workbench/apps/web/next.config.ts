import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @caw/core is consumed as TS source from the workspace.
  transpilePackages: ["@caw/core"],
  experimental: {
    // Server Actions are the human-mutation path (ADR-0003 §2).
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default nextConfig;
