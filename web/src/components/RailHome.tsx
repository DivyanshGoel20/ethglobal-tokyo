"use client";

import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { MiniKit } from "@worldcoin/minikit-js";
import { LifelineMark } from "./Pulse";
import { Dashboard } from "./Dashboard";
import type { Rail } from "@/types";

const MiniApp = dynamic(() => import("./mini/MiniApp"), { ssr: false });

/**
 * A rail's page. Opened inside World App it is the mini app, so the
 * Developer Portal's App URL works whichever page it points at.
 */
export function RailHome({ rail }: { rail: Rail }) {
  const [inWorldApp, setInWorldApp] = useState<boolean | null>(null);
  useEffect(() => setInWorldApp(MiniKit.isInWorldApp()), []);

  if (inWorldApp === null) {
    return (
      <div className="min-h-screen grid place-items-center">
        <LifelineMark size={22} className="pulse-dot" />
      </div>
    );
  }
  return inWorldApp ? <MiniApp /> : <Dashboard rail={rail} />;
}
