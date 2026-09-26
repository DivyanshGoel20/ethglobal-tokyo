"use client";

import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { MiniKit } from "@worldcoin/minikit-js";
import { LifelineMark } from "@/components/Pulse";

const MiniApp = dynamic(() => import("@/components/mini/MiniApp"), { ssr: false });

/**
 * Inside World App the root is the mini app, so the Developer Portal's App
 * URL works whether it points here or at /mini. In a browser it opens the
 * rail you last looked at: /arc or /sui.
 */
export default function Home() {
  const router = useRouter();
  const [inWorldApp, setInWorldApp] = useState<boolean | null>(null);

  useEffect(() => {
    const inside = MiniKit.isInWorldApp();
    setInWorldApp(inside);
    if (inside) return;
    let last = "arc";
    try {
      if (localStorage.getItem("lifeline_rail") === "sui") last = "sui";
    } catch {
      /* a display preference */
    }
    router.replace(`/${last}${window.location.search}`);
  }, [router]);

  if (inWorldApp) return <MiniApp />;
  return (
    <div className="min-h-screen grid place-items-center">
      <LifelineMark size={22} className="pulse-dot" />
    </div>
  );
}
