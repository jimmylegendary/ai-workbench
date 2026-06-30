import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Providers } from "@/lib/query/Providers";
import { ThemeApplier } from "@/features/settings/ThemeApplier";

export const metadata: Metadata = {
  title: "CAW-01 · Simulation Control Plane",
  description: "Instrument-grade control plane for memory-centric AI-hardware simulations.",
};

/*
  No-flash appearance: synchronously apply the persisted theme/density/accent
  (localStorage key `caw01.settings`, written by features/settings/store.ts)
  before first paint, so a dark-mode reload never flashes light. ThemeApplier
  then owns every change after hydration. Kept tiny + defensive (try/catch).
*/
const NO_FLASH_SCRIPT = `(function(){try{var r=document.documentElement,s=JSON.parse(localStorage.getItem('caw01.settings')||'{}').state;if(!s)return;var t=s.theme,d=s.density,a=s.accentColor;var dark=t==='dark'||(t==='system'&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);r.classList.toggle('dark',!!dark);if(d)r.dataset.density=d;if(a)r.style.setProperty('--accent',a);}catch(e){}})();`;

/*
  Fonts: the design system uses Inter (UI) + JetBrains Mono (readouts). Wire them
  with next/font/google (variable: --font-inter / --font-jetbrains-mono) or ship
  the woff2 files from packages/design-tokens; globals.css falls back to system.
*/
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_SCRIPT }} />
      </head>
      <body>
        <ThemeApplier />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
