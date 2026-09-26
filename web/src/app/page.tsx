"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Rail, Agent, ActivityItem, Instrument } from "@/types";
import { WorldAuthGate } from "@/components/WorldAuthGate";
import { Header } from "@/components/Header";
import { Vitals } from "@/components/Vitals";
import { Monitor, type LeadData } from "@/components/Monitor";
import { EventTape } from "@/components/EventTape";
import { Underwriting } from "@/components/Underwriting";
import { FacilityRecord } from "@/components/FacilityRecord";
import { ParkedRepayments } from "@/components/ParkedRepayments";
import { PurchaseModal } from "@/components/PurchaseModal";
import { RepayModal } from "@/components/RepayModal";
import { LifelineMark } from "@/components/Pulse";
import { traceWindow } from "@/lib/ecg";

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

type Obligation = { obligationId: string; agentAddress: string; status: string; dueMs: number | null };

const ARC_TX = (hash?: string) => (hash && /^0x[0-9a-f]{64}$/i.test(hash) ? `https://testnet.arcscan.app/tx/${hash}` : null);
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export default function Home() {
  const [isWorldVerified, setIsWorldVerified] = useState(false);
  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const [nullifierHash, setNullifierHash] = useState("");

  const [rail, setRail] = useState<Rail>("arc");
  // Arc opens on the strip and Sui on the monitor; either can be read on
  // either, and the choice is remembered per rail.
  const [instruments, setInstruments] = useState<Record<Rail, Instrument>>({ arc: "strip", sui: "monitor" });
  const instrument = instruments[rail];
  const [sui, setSui] = useState<{ ready: boolean; network: string | null }>({ ready: false, network: null });

  const [creditLimit, setCreditLimit] = useState(10.0);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const [purchaseFor, setPurchaseFor] = useState<string | null | undefined>(undefined);
  const [isRepayOpen, setIsRepayOpen] = useState(false);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 4200);
  };

  /** Back to the gate: the cookie expired, was voided, or never existed. */
  const endSession = useCallback(() => {
    setIsWorldVerified(false);
    setNullifierHash("");
    setAgents([]);
    setPayments([]);
    setObligations([]);
  }, []);

  const load = useCallback(async () => {
    try {
      const [a, p, o] = await Promise.all([
        fetch("/api/agents"),
        fetch("/api/payments"),
        fetch("/api/sui/obligations").catch(() => null),
      ]);
      if (a.status === 401) return endSession();
      const agentData = await a.json();
      const paymentData = await p.json().catch(() => ({}));
      const obligationData = o ? await o.json().catch(() => ({})) : {};
      if (Array.isArray(agentData.agents)) setAgents(agentData.agents);
      if (Array.isArray(paymentData.payments)) setPayments(paymentData.payments);
      if (Array.isArray(obligationData.obligations)) setObligations(obligationData.obligations);
      setNow(Date.now());
    } catch (err) {
      console.error("[Lifeline] Could not load:", err);
    }
  }, [endSession]);

  const refresh = () => {
    setRefreshTrigger((t) => t + 1);
    void load();
  };

  // The instrument is stamped on the document: every colour is a token, so
  // the strip and the monitor are the same components under different ink.
  useEffect(() => {
    document.documentElement.setAttribute("data-instrument", instrument);
  }, [instrument]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("lifeline_instruments") || "{}");
      setInstruments((cur) => ({
        arc: saved.arc === "monitor" || saved.arc === "strip" ? saved.arc : cur.arc,
        sui: saved.sui === "monitor" || saved.sui === "strip" ? saved.sui : cur.sui,
      }));
    } catch {
      /* a display preference */
    }
  }, []);

  const chooseInstrument = (next: Instrument) => {
    setInstruments((cur) => {
      const updated = { ...cur, [rail]: next };
      try {
        localStorage.setItem("lifeline_instruments", JSON.stringify(updated));
      } catch {
        /* a display preference */
      }
      return updated;
    });
  };

  // The session cookie is httpOnly, so who we are is a question for the server.
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

    // Offer Sui only when it is deployed and configured here.
    fetch("/api/sui/status")
      .then((r) => r.json())
      .then((d) => {
        const ready = !!d.configured;
        setSui({ ready, network: d.network ?? null });
        if (!ready) setRail("arc");
        else {
          try {
            if (localStorage.getItem("lifeline_rail") === "sui") setRail("sui");
          } catch {
            /* a display preference */
          }
        }
      })
      .catch(() => setSui({ ready: false, network: null }));

    // The trace moves: re-read every half minute so the strip keeps feeding.
    const tick = setInterval(() => void load(), 30_000);
    return () => clearInterval(tick);
  }, [isWorldVerified, load]);

  const chooseRail = (next: Rail) => {
    setRail(next);
    try {
      localStorage.setItem("lifeline_rail", next);
    } catch {
      /* a display preference, not worth failing over */
    }
  };

  const arcDebt = agents.reduce((n, a) => n + (a.outstandingDebt || 0), 0);
  const suiDebt = agents.reduce((n, a) => n + (a.suiDebt || 0), 0);
  const headroom = Math.max(0, creditLimit - arcDebt - suiDebt);

  const nameOf = (address: string) => agents.find((a) => same(a.address, address))?.name ?? `${address.slice(0, 8)}…`;

  const railPayments = useMemo(
    () => payments.filter((p) => p.status === "SUCCESS" && (p.rail ?? "arc") === rail),
    [payments, rail]
  );

  const win = useMemo(() => traceWindow(railPayments.map((p) => p.timestamp), now), [railPayments, now]);

  const leads: LeadData[] = useMemo(
    () =>
      agents.map((agent) => ({
        agent,
        beats: railPayments
          .filter((p) => same(p.agentAddress, agent.address))
          .map((p) => ({ t: p.timestamp, amountUsd: Number(p.requestedAmount) || 0, borrowed: (Number(p.shortfall) || 0) > 0 })),
        defaults:
          rail === "sui"
            ? obligations.filter((o) => same(o.agentAddress, agent.address) && o.status === "defaulted" && o.dueMs).map((o) => o.dueMs!)
            : [],
      })),
    [agents, railPayments, obligations, rail]
  );

  const dayAgo = now - 86_400_000;
  const beats24h = railPayments.filter((p) => p.timestamp >= dayAgo);

  const activities: ActivityItem[] = railPayments.map((p) => ({
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
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
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
      await post("/api/agents", { action: "add", name: input.name, walletAddress: input.address, privateKey: input.privateKey || undefined });
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
    fetch("/api/auth/session", { method: "DELETE" }).catch(() => {});
    endSession();
  };

  if (isLoadingSession) {
    return (
      <div className="min-h-screen grid place-items-center">
        <LifelineMark size={22} className="pulse-dot" />
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
    <div className="min-h-screen">
      <Header
        rail={rail}
        setRail={chooseRail}
        nullifierHash={nullifierHash}
        onSignOut={handleSignOut}
        suiReady={sui.ready}
        instrument={instrument}
        setInstrument={chooseInstrument}
      />

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 sheet rise px-4 py-3 max-w-sm flex items-center gap-3">
          <span style={{ width: 6, height: 6, background: "var(--alarm)", display: "inline-block", flexShrink: 0 }} />
          <span className="text-[13px]">{toast}</span>
        </div>
      )}

      <main className="max-w-[1180px] mx-auto px-6 sm:px-10">
        <Vitals
          creditLimit={creditLimit}
          arcDebt={arcDebt}
          suiDebt={suiDebt}
          rail={rail}
          beats24h={beats24h.length}
          borrowedBeats24h={beats24h.filter((p) => (Number(p.shortfall) || 0) > 0).length}
          onPurchase={() => setPurchaseFor(null)}
          onRepay={() => setIsRepayOpen(true)}
        />

        <Monitor
          leads={leads}
          rail={rail}
          instrument={instrument}
          window={win}
          suiNetwork={sui.network}
          onAddAgent={handleAddAgent}
          onRemoveAgent={handleRemoveAgent}
          onPayAgent={handlePayAgent}
          onBuy={(a) => setPurchaseFor(a.address)}
        />

        {rail === "sui" && (
          <ParkedRepayments
            refreshTrigger={refreshTrigger}
            agentName={nameOf}
            onChanged={(m) => {
              showToast(m);
              refresh();
            }}
          />
        )}

        <div className="grid gap-12 lg:grid-cols-[1.5fr_1fr] pb-20">
          <EventTape activities={activities} rail={rail} />
          <div className="space-y-12">
            <Underwriting humanOwner={nullifierHash} refreshTrigger={refreshTrigger} onTier={setCreditLimit} />
            {rail === "arc" && <FacilityRecord humanOwner={nullifierHash} refreshTrigger={refreshTrigger} />}
          </div>
        </div>
      </main>

      <footer className="rule-t">
        <div className="max-w-[1180px] mx-auto px-6 sm:px-10 py-5 flex flex-wrap justify-between gap-2 lab">
          <span>Lifeline · credit for machines that spend</span>
          <span>{rail === "arc" ? "Arc testnet · 5042002" : `Sui ${sui.network ?? ""}`}</span>
        </div>
      </footer>

      <PurchaseModal
        isOpen={purchaseFor !== undefined}
        initialAgent={purchaseFor ?? null}
        onClose={() => setPurchaseFor(undefined)}
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
