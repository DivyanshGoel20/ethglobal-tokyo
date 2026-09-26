"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Rail, Agent, ActivityItem } from "@/types";
import { WorldAuthGate } from "@/components/WorldAuthGate";
import { Header } from "@/components/Header";
import { CreditOverview } from "@/components/CreditOverview";
import { ReputationTierCard } from "@/components/ReputationTierCard";
import { SmartContractTelemetry } from "@/components/SmartContractTelemetry";
import { AgentList } from "@/components/AgentList";
import { ActivityFeed } from "@/components/ActivityFeed";
import { PurchaseModal } from "@/components/PurchaseModal";
import { RepayModal } from "@/components/RepayModal";
import { SuiRailPanel } from "@/components/SuiRailPanel";

type Payment = {
  paymentId: string;
  agentAddress: string;
  resourceUrl: string;
  requestedAmount: string;
  shortfall: string;
  fundingSource: string;
  status: string;
  timestamp: number;
  transactionId?: string;
  rail?: Rail;
};

const ARC_TX = (hash?: string) => (hash && /^0x[0-9a-f]{64}$/i.test(hash) ? `https://testnet.arcscan.app/tx/${hash}` : null);

export default function Home() {
  const [isWorldVerified, setIsWorldVerified] = useState(false);
  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const [nullifierHash, setNullifierHash] = useState("");

  const [rail, setRail] = useState<Rail>("arc");
  const [sui, setSui] = useState<{ ready: boolean; network: string | null }>({ ready: false, network: null });

  const [creditLimit, setCreditLimit] = useState(10.0);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  const [isPurchaseOpen, setIsPurchaseOpen] = useState(false);
  const [isRepayOpen, setIsRepayOpen] = useState(false);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3600);
  };

  /** Back to the gate: the cookie expired, was voided, or never existed. */
  const endSession = useCallback(() => {
    setIsWorldVerified(false);
    setNullifierHash("");
    setAgents([]);
    setPayments([]);
  }, []);

  const load = useCallback(async () => {
    try {
      const [a, p] = await Promise.all([fetch("/api/agents"), fetch("/api/payments")]);
      if (a.status === 401) return endSession();
      const agentData = await a.json();
      const paymentData = await p.json().catch(() => ({}));
      if (Array.isArray(agentData.agents)) setAgents(agentData.agents);
      if (Array.isArray(paymentData.payments)) setPayments(paymentData.payments);
    } catch (err) {
      console.error("[Dashboard] Could not load:", err);
    }
  }, [endSession]);

  const refresh = () => {
    setRefreshTrigger((t) => t + 1);
    void load();
  };

  useEffect(() => {
    document.documentElement.setAttribute("data-rail", rail);
  }, [rail]);

  // The session cookie is httpOnly, so who we are is a question for the server.
  // A nullifier kept in localStorage was an identity anyone could type in.
  useEffect(() => {
    fetch("/api/auth/session")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.authenticated && data?.nullifierHash) {
          setNullifierHash(data.nullifierHash);
          setIsWorldVerified(true);
        }
      })
      .catch(() => {})
      .finally(() => setIsLoadingSession(false));
  }, []);

  useEffect(() => {
    if (!isWorldVerified) return;
    void load();

    // Offer Sui only when it is deployed and configured, and never strand the
    // UI on a rail that cannot be used.
    fetch("/api/sui/status")
      .then((r) => r.json())
      .then((d) => {
        const ready = !!d.configured;
        setSui({ ready, network: d.network ?? null });
        if (!ready) setRail("arc");
        else if (localStorage.getItem("float_rail") === "sui") setRail("sui");
      })
      .catch(() => setSui({ ready: false, network: null }));
  }, [isWorldVerified, load]);

  const chooseRail = (next: Rail) => {
    setRail(next);
    try {
      localStorage.setItem("float_rail", next);
    } catch {
      /* a display preference, not worth failing over */
    }
  };

  const arcDebt = agents.reduce((n, a) => n + (a.outstandingDebt || 0), 0);
  const suiDebt = agents.reduce((n, a) => n + (a.suiDebt || 0), 0);
  const headroom = Math.max(0, creditLimit - arcDebt - suiDebt);

  const nameOf = (address: string) =>
    agents.find((a) => a.address.toLowerCase() === address.toLowerCase())?.name ?? `${address.slice(0, 10)}...`;

  const activities: ActivityItem[] = payments
    .filter((p) => p.status === "SUCCESS" && (p.rail ?? "arc") === rail)
    .map((p) => ({
      id: p.paymentId,
      type: p.fundingSource === "FLOAT_FACILITY" ? "x402_overdraft" : "x402_normal",
      agentName: nameOf(p.agentAddress),
      agentAddress: p.agentAddress,
      amount: Number(p.requestedAmount),
      borrowed: Number(p.shortfall) || 0,
      rail: p.rail ?? "arc",
      timestamp: p.timestamp,
      txHash: p.transactionId ?? "",
      txLink:
        (p.rail ?? "arc") === "sui"
          ? sui.network && sui.network !== "localnet" && p.transactionId
            ? `https://suiscan.xyz/${sui.network}/tx/${p.transactionId}`
            : null
          : ARC_TX(p.transactionId),
      endpoint: (() => {
        try {
          const u = new URL(p.resourceUrl);
          return u.pathname + u.search;
        } catch {
          return p.resourceUrl;
        }
      })(),
    }));

  const post = async (url: string, body: unknown) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      endSession();
      throw new Error("Your World session expired. Verify again.");
    }
    if (!res.ok || data.success === false || data.error) throw new Error(data.error || "That did not go through.");
    return data;
  };

  const handleAddAgent = async (input: { name: string; address: string; privateKey: string; capUsd: number }) => {
    if (input.address) {
      await post("/api/agents", {
        action: "add",
        name: input.name,
        walletAddress: input.address,
        privateKey: input.privateKey || undefined,
      });
    } else {
      const data = await post("/api/agent/provision", { label: input.name, capUsd: input.capUsd });
      if (data.authorizedOnChain === false) showToast(`Agent created, but Arc authorization failed: ${data.authorizationError}`);
    }
    showToast(`${input.name} is on the line`);
    refresh();
  };

  const handleRemoveAgent = async (address: string) => {
    const res = await fetch(`/api/agents?address=${encodeURIComponent(address)}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) return endSession();
    if (!res.ok || !data.success) throw new Error(data.error || "Could not revoke the agent");
    showToast(`${nameOf(address)} revoked`);
    refresh();
  };

  const handlePayAgent = async (address: string) => {
    await post("/api/sui/earn", { agentAddress: address, amount: 0.1 });
    showToast(`${nameOf(address)} was paid $0.10 for its work`);
    refresh();
  };

  const handleSignOut = () => {
    // The cookie is what authorises spending, so the server has to void it.
    fetch("/api/auth/session", { method: "DELETE" }).catch(() => {});
    endSession();
  };

  if (isLoadingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0b0e]">
        <span className="font-mono text-[11px] text-[#64748b]">checking session...</span>
      </div>
    );
  }

  if (!isWorldVerified) {
    return (
      <WorldAuthGate
        onVerified={(hash) => {
          setNullifierHash(hash);
          setIsWorldVerified(true);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen pb-12 bg-[#0a0b0e] text-[#f8fafc]">
      <Header rail={rail} setRail={chooseRail} nullifierHash={nullifierHash} onSignOut={handleSignOut} suiReady={sui.ready} />

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 panel px-4 py-3 text-xs font-mono text-white shadow-xl max-w-sm">
          {toast}
        </div>
      )}

      <main className="max-w-5xl mx-auto px-6 pt-6">
        <CreditOverview
          creditLimit={creditLimit}
          arcDebt={arcDebt}
          suiDebt={suiDebt}
          rail={rail}
          onOpenPurchase={() => setIsPurchaseOpen(true)}
          onOpenRepay={() => setIsRepayOpen(true)}
        />

        <ReputationTierCard humanOwner={nullifierHash} refreshTrigger={refreshTrigger} onTier={setCreditLimit} />

        <AgentList
          agents={agents}
          rail={rail}
          suiNetwork={sui.network}
          onAddAgent={handleAddAgent}
          onRemoveAgent={handleRemoveAgent}
          onPayAgent={handlePayAgent}
        />

        {rail === "sui" && <SuiRailPanel refreshTrigger={refreshTrigger} agentName={nameOf} onChanged={(m) => { showToast(m); refresh(); }} />}

        <ActivityFeed activities={activities} rail={rail} />

        {rail === "arc" && <SmartContractTelemetry humanOwner={nullifierHash} refreshTrigger={refreshTrigger} />}
      </main>

      <PurchaseModal
        isOpen={isPurchaseOpen}
        onClose={() => setIsPurchaseOpen(false)}
        agents={agents}
        rail={rail}
        headroom={headroom}
        onDone={(m) => {
          showToast(m);
          refresh();
        }}
        onSessionExpired={endSession}
      />

      <RepayModal
        isOpen={isRepayOpen}
        onClose={() => setIsRepayOpen(false)}
        rail={rail}
        agents={agents}
        onDone={(m) => {
          showToast(m);
          refresh();
        }}
        onSessionExpired={endSession}
      />
    </div>
  );
}
