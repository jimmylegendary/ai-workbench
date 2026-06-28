import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Providers } from "@/lib/query/Providers";

export const metadata: Metadata = {
  title: "CAW-01 · Simulation Control Plane",
  description: "Instrument-grade control plane for memory-centric AI-hardware simulations.",
};

/*
  Fonts: the design system uses Inter (UI) + JetBrains Mono (readouts). Wire them
  with next/font/google (variable: --font-inter / --font-jetbrains-mono) or ship
  the woff2 files from packages/design-tokens; globals.css falls back to system.
*/
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
