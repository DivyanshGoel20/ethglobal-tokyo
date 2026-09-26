"use client";

import dynamic from "next/dynamic";

// MiniKit reads window.WorldApp; rendered on the server, the hydration
// mismatch silently breaks every handler. The mini app renders client-side.
const MiniApp = dynamic(() => import("@/components/mini/MiniApp"), { ssr: false });

export default function MiniPage() {
  return <MiniApp />;
}
