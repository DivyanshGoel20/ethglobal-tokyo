"use client";

import { MiniKitProvider } from "@worldcoin/minikit-js/minikit-provider";

/**
 * MiniKit installs itself only inside World App; in a browser it is inert, so
 * the desktop dashboard is unaffected by being wrapped in it.
 */
export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MiniKitProvider props={{ appId: process.env.NEXT_PUBLIC_MINIAPP_ID || process.env.NEXT_PUBLIC_WORLD_APP_ID }}>
      {children}
    </MiniKitProvider>
  );
}
