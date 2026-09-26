"use client";

import { useEffect } from "react";
import { MiniKitProvider } from "@worldcoin/minikit-js/minikit-provider";

/**
 * MiniKit installs itself only inside World App; in a browser it is inert, so
 * the desktop dashboard is unaffected by being wrapped in it.
 */
export default function Providers({ children }: { children: React.ReactNode }) {
  // Tells the server log the app actually started (see the reporter in layout).
  useEffect(() => {
    const w = window as unknown as { __lifelineReport?: (k: string, m: string) => void; WorldApp?: unknown };
    w.__lifelineReport?.("booted", w.WorldApp ? "in World App" : "in a browser");
  }, []);

  return (
    <MiniKitProvider props={{ appId: process.env.NEXT_PUBLIC_MINIAPP_ID || process.env.NEXT_PUBLIC_WORLD_APP_ID }}>
      {children}
    </MiniKitProvider>
  );
}
