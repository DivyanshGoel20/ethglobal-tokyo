"use client";

import React, { useState, useEffect } from "react";
import { Rail, Agent, ActivityItem } from "@/types";
import { WorldAuthGate } from "@/components/WorldAuthGate";
import { Header } from "@/components/Header";
import { CreditOverview } from "@/components/CreditOverview";
import { AgentList } from "@/components/AgentList";
import { ActivityFeed } from "@/components/ActivityFeed";
import { SimulateDrawdownModal } from "@/components/SimulateDrawdownModal";
import { RepayModal } from "@/components/RepayModal";

export default function Home() {
  const [isWorldVerified, setIsWorldVerified] = useState(false);
  const [nullifierHash, setNullifierHash] = useState("");
  
  const [rail, setRail] = useState<Rail>("base");

  // Real, clean states without hardcoded fake data
  const [creditLimit] = useState(100.0);
  const [baseDebt, setBaseDebt] = useState(0.0);
  const [suiDebt, setSuiDebt] = useState(0.0);
  const [baseAgents, setBaseAgents] = useState<Agent[]>([]);
  const [suiAgents, setSuiAgents] = useState<Agent[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);

  // Modals
  const [isDrawdownOpen, setIsDrawdownOpen] = useState(false);
  const [isRepayOpen, setIsRepayOpen] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute("data-rail", rail);
  }, [rail]);

  useEffect(() => {
    const savedNullifier = localStorage.getItem("world_nullifier");
    

    if (savedNullifier) {
      setNullifierHash(savedNullifier);
      setIsWorldVerified(true);
    } else {
      fetch("/api/auth/session")
        .then((res) => res.json())
        .then((data) => {
          if (data?.authenticated && data?.nullifierHash) {
            setNullifierHash(data.nullifierHash);
            
            setIsWorldVerified(true);
          }
        })
        .catch(() => {});
    }
  }, []);

  const currentDebt = rail === "base" ? baseDebt : suiDebt;
  const currentAgents = rail === "base" ? baseAgents : suiAgents;
  const currentActivities = activities.filter((a) => a.rail === rail);
  const headroom = Math.max(0, creditLimit - currentDebt);

  const handleSignIn = (verifiedNullifier?: string) => {
    if (verifiedNullifier) {
      setNullifierHash(verifiedNullifier);
      localStorage.setItem("world_nullifier", verifiedNullifier);
    }
    setIsWorldVerified(true);
  };

  const handleSignOut = () => {
    localStorage.removeItem("world_nullifier");
    fetch("/api/auth/session", { method: "DELETE" }).catch(() => {});
    setIsWorldVerified(false);
  };

  // Add agent
  const handleAddAgent = (name: string, address: string, limit: number) => {
    const fallbackAddr =
      rail === "base"
        ? `0x${Math.random().toString(16).slice(2, 10)}...${Math.random().toString(16).slice(2, 6)}`
        : `0x${Math.random().toString(16).slice(2, 8)}...${Math.random().toString(16).slice(2, 6)}`;

    const newAgent: Agent = {
      id: `agent-${rail}-${Date.now()}`,
      name,
      address: address.trim() || fallbackAddr,
      rail,
      allocatedLimit: limit,
      spent: 0,
      status: "active",
    };

    if (rail === "base") {
      setBaseAgents((prev) => [newAgent, ...prev]);
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

    if (rail === "base") {
      setBaseAgents(update(baseAgents));
    } else {
      setSuiAgents(update(suiAgents));
    }
  };

  // Remove agent
  const handleRemoveAgent = (id: string) => {
    if (rail === "base") {
      setBaseAgents((prev) => prev.filter((a) => a.id !== id));
    } else {
      setSuiAgents((prev) => prev.filter((a) => a.id !== id));
    }
  };

  // Confirm simulated drawdown
  const handleConfirmDrawdown = (agentId: string, amount: number, endpoint: string) => {
    if (rail === "base") {
      setBaseDebt((prev) => prev + amount);
      setBaseAgents((prev) =>
        prev.map((a) => (a.id === agentId ? { ...a, spent: a.spent + amount } : a))
      );
    } else {
      setSuiDebt((prev) => prev + amount);
      setSuiAgents((prev) =>
        prev.map((a) => (a.id === agentId ? { ...a, spent: a.spent + amount } : a))
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
    if (rail === "base") {
      setBaseDebt((prev) => Math.max(0, prev - amount));
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

        <AgentList
          agents={currentAgents}
          rail={rail}
          onAddAgent={handleAddAgent}
          onToggleStatus={handleToggleAgentStatus}
          onRemoveAgent={handleRemoveAgent}
        />

        <ActivityFeed activities={currentActivities} rail={rail} />
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
