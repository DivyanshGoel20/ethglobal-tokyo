"use client";

import React, { useState, useEffect } from "react";
import { Rail, Agent, ActivityItem } from "@/types";
import { WorldAuthGate } from "@/components/WorldAuthGate";
import { Header } from "@/components/Header";
import { CreditOverview } from "@/components/CreditOverview";
import { ReputationTierCard } from "@/components/ReputationTierCard";
import { SmartContractTelemetry } from "@/components/SmartContractTelemetry";
import { AgentList } from "@/components/AgentList";
import { ActivityFeed } from "@/components/ActivityFeed";
import { SimulateDrawdownModal } from "@/components/SimulateDrawdownModal";
import { RepayModal } from "@/components/RepayModal";

export default function Home() {
  const [isWorldVerified, setIsWorldVerified] = useState(false);
  const [nullifierHash, setNullifierHash] = useState("");
  
  const [rail, setRail] = useState<Rail>("arc");

  // Real, clean states without hardcoded fake data
  const [creditLimit, setCreditLimit] = useState(10.0);
  const [arcDebt, setArcDebt] = useState(0.0);
  const [suiDebt, setSuiDebt] = useState(0.0);
  const [arcAgents, setArcAgents] = useState<Agent[]>([]);
  const [suiAgents, setSuiAgents] = useState<Agent[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);

  // Modals
  const [isDrawdownOpen, setIsDrawdownOpen] = useState(false);
  const [isRepayOpen, setIsRepayOpen] = useState(false);

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
      .catch(() => {});
  }, []);

  const currentDebt = rail === "arc" ? arcDebt : suiDebt;
  const currentAgents = rail === "arc" ? arcAgents : suiAgents;
  const currentActivities = activities.filter((a) => a.rail === rail);
  const headroom = Math.max(0, creditLimit - currentDebt);

  const handleSignIn = (verifiedNullifier?: string) => {
    if (verifiedNullifier) {
      setNullifierHash(verifiedNullifier);
    }
    setIsWorldVerified(true);
  };

  const handleSignOut = () => {
    fetch("/api/auth/session", { method: "DELETE" }).catch(() => {});
    setIsWorldVerified(false);
  };

  // Add agent
  const handleAddAgent = (name: string, address: string, limit: number) => {
    const fallbackAddr =
      rail === "arc"
        ? `0x${Math.random().toString(16).slice(2, 10)}...${Math.random().toString(16).slice(2, 6)}`
        : `0x${Math.random().toString(16).slice(2, 8)}...${Math.random().toString(16).slice(2, 6)}`;

    const newAgent: Agent = {
      id: `agent-${rail}-${Date.now()}`,
      name,
      address: (address.trim() || fallbackAddr) as `0x${string}`,
      humanOwner: nullifierHash,
      creditLimit: limit,
      outstandingDebt: 0,
      totalBorrowed: 0,
      totalRepaid: 0,
      currentBalance: 0,
      registeredAt: Date.now(),
      rail,
      allocatedLimit: limit,
      spent: 0,
      status: "active",
    };

    if (rail === "arc") {
      setArcAgents((prev) => [newAgent, ...prev]);
    } else {
      setSuiAgents((prev) => [newAgent, ...prev]);
    }

    setActivities((prev) => [
      {
        id: `act-${Date.now()}`,
        type: "authorization",
        agentName: name,
        rail,
        txHash: `0x${Math.random().toString(16).slice(2, 8)}...`,
        timestamp: "Just now",
      },
      ...prev,
    ]);
  };

  // Toggle agent status
  const handleToggleAgentStatus = (id: string) => {
    const update = (list: Agent[]) =>
      list.map((a) =>
        a.id === id ? { ...a, status: a.status === "active" ? ("paused" as const) : ("active" as const) } : a
      );

    if (rail === "arc") {
      setArcAgents(update(arcAgents));
    } else {
      setSuiAgents(update(suiAgents));
    }
  };

  // Remove agent
  const handleRemoveAgent = (id: string) => {
    if (rail === "arc") {
      setArcAgents((prev) => prev.filter((a) => a.id !== id));
    } else {
      setSuiAgents((prev) => prev.filter((a) => a.id !== id));
    }
  };

  // Confirm simulated drawdown
  const handleConfirmDrawdown = (agentId: string, amount: number, endpoint: string) => {
    if (rail === "arc") {
      setArcDebt((prev) => prev + amount);
      setArcAgents((prev) =>
        prev.map((a) => (a.id === agentId ? { ...a, spent: (a.spent ?? 0) + amount } : a))
      );
    } else {
      setSuiDebt((prev) => prev + amount);
      setSuiAgents((prev) =>
        prev.map((a) => (a.id === agentId ? { ...a, spent: (a.spent ?? 0) + amount } : a))
      );
    }

    const agent = currentAgents.find((a) => a.id === agentId);

    setActivities((prev) => [
      {
        id: `act-${Date.now()}`,
        type: "drawdown",
        agentName: agent?.name || "Agent",
        amount,
        rail,
        txHash: `0x${Math.random().toString(16).slice(2, 8)}...`,
        timestamp: "Just now",
        endpoint,
      },
      ...prev,
    ]);
  };

  // Confirm repayment
  const handleConfirmRepay = (amount: number) => {
    if (rail === "arc") {
      setArcDebt((prev) => Math.max(0, prev - amount));
    } else {
      setSuiDebt((prev) => Math.max(0, prev - amount));
    }

    setActivities((prev) => [
      {
        id: `act-${Date.now()}`,
        type: "repayment",
        amount,
        rail,
        txHash: `0x${Math.random().toString(16).slice(2, 8)}...`,
        timestamp: "Just now",
      },
      ...prev,
    ]);
  };

  if (!isWorldVerified) {
    return <WorldAuthGate onVerified={handleSignIn} onSignIn={handleSignIn} />;
  }

  return (
    <div className="min-h-screen pb-12 bg-[#0a0b0e] text-[#f8fafc]">
      <Header
        rail={rail}
        setRail={setRail}
        nullifierHash={nullifierHash}
                onSignOut={handleSignOut}
      />

      <main className="max-w-5xl mx-auto px-6 pt-6">
        <CreditOverview
          creditLimit={creditLimit}
          outstandingDebt={currentDebt}
          rail={rail}
          onOpenDrawdown={() => setIsDrawdownOpen(true)}
          onOpenRepay={() => setIsRepayOpen(true)}
        />

        <ReputationTierCard
          humanOwner={nullifierHash}
          refreshTrigger={currentDebt}
          onTier={setCreditLimit}
        />

        <AgentList
          agents={currentAgents}
          rail={rail}
          onAddAgent={handleAddAgent}
          onToggleStatus={handleToggleAgentStatus}
          onRemoveAgent={handleRemoveAgent}
        />

        <ActivityFeed activities={currentActivities} rail={rail} />

        <SmartContractTelemetry humanOwner={nullifierHash} refreshTrigger={currentDebt} />
      </main>

      <SimulateDrawdownModal
        isOpen={isDrawdownOpen}
        onClose={() => setIsDrawdownOpen(false)}
        agents={currentAgents}
        rail={rail}
        headroom={headroom}
        onConfirmDrawdown={handleConfirmDrawdown}
      />

      <RepayModal
        isOpen={isRepayOpen}
        onClose={() => setIsRepayOpen(false)}
        rail={rail}
        outstandingDebt={currentDebt}
        onConfirmRepay={handleConfirmRepay}
      />
    </div>
  );
}
