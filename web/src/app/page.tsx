"use client";

import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { MiniKit } from "@worldcoin/minikit-js";
import { WorldAuthGate } from "@/components/WorldAuthGate";
import { Header } from "@/components/Header";
import { Vitals } from "@/components/Vitals";
import { Monitor } from "@/components/Monitor";
import { EventTape } from "@/components/EventTape";
import { Underwriting } from "@/components/Underwriting";
import { AccountLinks } from "@/components/AccountLinks";
import { Counterparties } from "@/components/Counterparties";
import { FacilityRecord } from "@/components/FacilityRecord";
import { ParkedRepayments } from "@/components/ParkedRepayments";
import { PurchaseModal } from "@/components/PurchaseModal";
import { RepayModal } from "@/components/RepayModal";
import { LifelineMark } from "@/components/Pulse";
import { useLifeline } from "@/lib/useLifeline";

const MiniApp = dynamic(() => import("@/components/mini/MiniApp"), { ssr: false });

/**
 * Opened inside World App, the root is the mini app - so the Developer
 * Portal's App URL works whether it points here or at /mini.
 */
export default function Home() {
  const [inWorldApp, setInWorldApp] = useState<boolean | null>(null);
  useEffect(() => setInWorldApp(MiniKit.isInWorldApp()), []);

  if (inWorldApp === null) {
    return (
      <div className="min-h-screen grid place-items-center">
        <LifelineMark size={22} className="pulse-dot" />
      </div>
    );
  }
  return inWorldApp ? <MiniApp /> : <Dashboard />;
}

function Dashboard() {
  const L = useLifeline();

  if (L.isLoadingSession) {
    return (
      <div className="min-h-screen grid place-items-center">
        <LifelineMark size={22} className="pulse-dot" />
      </div>
    );
  }

  if (!L.isWorldVerified) return <WorldAuthGate onVerified={L.signedIn} />;

  return (
    <div className="min-h-screen">
      <Header
        rail={L.rail}
        setRail={L.chooseRail}
        nullifierHash={L.nullifierHash}
        onSignOut={L.handleSignOut}
        suiReady={L.sui.ready}
      />

      {L.toast && (
        <div className="fixed bottom-6 right-6 z-50 sheet rise px-4 py-3 max-w-sm flex items-center gap-3">
          <span style={{ width: 6, height: 6, background: "var(--alarm)", display: "inline-block", flexShrink: 0 }} />
          <span className="text-[13px]">{L.toast}</span>
        </div>
      )}

      <main className="max-w-[1180px] mx-auto px-6 sm:px-10">
        <AccountLinks onToast={L.showToast} />
        <Vitals
          creditLimit={L.creditLimit}
          arcDebt={L.arcDebt}
          suiDebt={L.suiDebt}
          rail={L.rail}
          beats24h={L.beats24h.length}
          borrowedBeats24h={L.beats24h.filter((p) => (Number(p.shortfall) || 0) > 0).length}
          onPurchase={() => L.setPurchaseFor(null)}
          onRepay={() => L.setIsRepayOpen(true)}
        />

        <Monitor
          leads={L.leads}
          rail={L.rail}
          suiNetwork={L.sui.network}
          onAddAgent={L.handleAddAgent}
          onRemoveAgent={L.handleRemoveAgent}
          onPayAgent={L.handlePayAgent}
          onBuy={(a) => L.setPurchaseFor(a.address)}
        />

        {L.rail === "sui" && <ParkedRepayments refreshTrigger={L.refreshTrigger} agentName={L.nameOf} onChanged={L.done} />}

        <div className="grid gap-12 lg:grid-cols-[1.5fr_1fr] pb-20">
          <EventTape activities={L.activities} rail={L.rail} />
          <div className="space-y-12">
            <Underwriting humanOwner={L.nullifierHash} rail={L.rail} refreshTrigger={L.refreshTrigger} onTier={L.setCreditLimit} />
            {L.rail === "arc" && <FacilityRecord humanOwner={L.nullifierHash} refreshTrigger={L.refreshTrigger} />}
            {L.rail === "arc" && (
              <Counterparties payments={L.payments} refreshTrigger={L.refreshTrigger} agentName={L.nameOf} onChanged={L.done} />
            )}
          </div>
        </div>
      </main>

      <footer className="rule-t">
        <div className="max-w-[1180px] mx-auto px-6 sm:px-10 py-5 flex flex-wrap justify-between gap-2 lab">
          <span>Lifeline · credit for machines that spend</span>
          <span>{L.rail === "arc" ? "Arc testnet · 5042002" : `Sui ${L.sui.network ?? ""}`}</span>
        </div>
      </footer>

      <PurchaseModal
        isOpen={L.purchaseFor !== undefined}
        initialAgent={L.purchaseFor ?? null}
        onClose={() => L.setPurchaseFor(undefined)}
        agents={L.agents}
        rail={L.rail}
        headroom={L.headroom}
        onDone={L.done}
        onSessionExpired={L.endSession}
      />

      <RepayModal
        isOpen={L.isRepayOpen}
        onClose={() => L.setIsRepayOpen(false)}
        rail={L.rail}
        agents={L.agents}
        onDone={L.done}
        onSessionExpired={L.endSession}
      />
    </div>
  );
}
