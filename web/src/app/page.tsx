"use client";

import React, { useState, useEffect } from "react";
import { Rail, Agent, ActivityItem } from "@/types";
import { WorldAuthGate } from "@/components/WorldAuthGate";
import { Header } from "@/components/Header";
import { CreditTank } from "@/components/CreditTank";
import { AgentList } from "@/components/AgentList";
import { ActivityFeed } from "@/components/ActivityFeed";
import { SimulateDrawdownModal } from "@/components/SimulateDrawdownModal";
import { RepayModal } from "@/components/RepayModal";

const INITIAL_BASE_AGENTS: Agent[] = [
  {
    id: "agent-base-1",
    name: "Alpha-Crawler-01",
    address: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
    rail: "base",
    allocatedLimit: 150,
    spent: 42.5,
    status: "active",
    lastActive: "2 mins ago",
    model: "Claude 3.5 Sonnet (Agentic)",
  },
  {
    id: "agent-base-2",
    name: "Base-Synthesizer",
    address: "0x123f681646d4a755815f9cb19e1acc8565a0c2ac",
    rail: "base",
    allocatedLimit: 100,
    spent: 12.0,
    status: "active",
    lastActive: "14 mins ago",
    model: "GPT-4o Autonomous",
  },
];

const INITIAL_SUI_AGENTS: Agent[] = [
  {
    id: "agent-sui-1",
    name: "Sui-Stream-Watcher",
    address: "0x5c42...9f18a203",
    rail: "sui",
    allocatedLimit: 200,
    spent: 65.0,
    status: "active",
    lastActive: "Just now",
    model: "DeepSeek-R1 Agent",
  },
  {
    id: "agent-sui-2",
    name: "Move-Arbitrage-Bot",
    address: "0x9e88...a4b1c024",
    rail: "sui",
    allocatedLimit: 100,
    spent: 8.5,
    status: "active",
    lastActive: "1 hour ago",
    model: "Claude 3.5 Sonnet (Agentic)",
  },
];

const INITIAL_ACTIVITIES: ActivityItem[] = [
  {
    id: "act-1",
    type: "drawdown",
    agentName: "Alpha-Crawler-01",
    amount: 1.5,
    rail: "base",
    txHash: "0x4e8a...31bf",
    timestamp: "3 mins ago",
    endpoint: "/api/v1/market-intelligence",
    status: "settled",
  },
  {
    id: "act-2",
    type: "drawdown",
    agentName: "Sui-Stream-Watcher",
    amount: 5.0,
    rail: "sui",
    txHash: "0x7c99...80fe",
    timestamp: "18 mins ago",
    endpoint: "/api/premium-inference",
    status: "settled",
  },
  {
    id: "act-3",
    type: "repayment",
    amount: 25.0,
    rail: "base",
    txHash: "0x1a2b...99c4",
    timestamp: "1 hour ago",
    status: "settled",
  },
  {
    id: "act-4",
    type: "world_verify",
    rail: "base",
    txHash: "0x98f1...440a",
    timestamp: "2 hours ago",
    status: "settled",
  },
];

export default function Home() {
  const [isWorldVerified, setIsWorldVerified] = useState(false);
  const [nullifierHash, setNullifierHash] = useState(
    "0x7a8f9c12e840a23b9d01245ffbc6e87901a1c94b"
  );
  const [rail, setRail] = useState<Rail>("base");

  // Rail specific debt state
  const [baseDebt, setBaseDebt] = useState(54.5);
  const [suiDebt, setSuiDebt] = useState(73.5);
  const [creditLimit] = useState(500.0);

  const [baseAgents, setBaseAgents] = useState<Agent[]>(INITIAL_BASE_AGENTS);
  const [suiAgents, setSuiAgents] = useState<Agent[]>(INITIAL_SUI_AGENTS);
  const [activities, setActivities] = useState<ActivityItem[]>(INITIAL_ACTIVITIES);

  // Modals
  const [isDrawdownOpen, setIsDrawdownOpen] = useState(false);
  const [isRepayOpen, setIsRepayOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Sync data-rail attribute with DOM for CSS
  useEffect(() => {
    document.documentElement.setAttribute("data-rail", rail);
  }, [rail]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const currentDebt = rail === "base" ? baseDebt : suiDebt;
  const currentAgents = rail === "base" ? baseAgents : suiAgents;
  const headroom = Math.max(0, creditLimit - currentDebt);

  // Handle mock World sign in
  const handleSignInWithWorld = () => {
    setIsWorldVerified(true);
    showToast("Human identity verified via World ID.");
  };

  const handleSignOut = () => {
    setIsWorldVerified(false);
    showToast("Session signed out.");
  };

  // Add agent
  const handleAddAgent = (name: string, model: string, limit: number) => {
    const isBase = rail === "base";
    const newAgent: Agent = {
      id: `agent-${rail}-${Date.now()}`,
      name,
      address: isBase
        ? `0x${Math.random().toString(16).slice(2, 10)}...${Math.random().toString(16).slice(2, 6)}`
        : `0x${Math.random().toString(16).slice(2, 8)}...${Math.random().toString(16).slice(2, 6)}`,
      rail,
      allocatedLimit: limit,
      spent: 0,
      status: "active",
      lastActive: "Just now",
      model,
    };

    if (isBase) {
      setBaseAgents([newAgent, ...baseAgents]);
    } else {
      setSuiAgents([newAgent, ...suiAgents]);
    }

    setActivities([
      {
        id: `act-${Date.now()}`,
        type: "authorization",
        agentName: name,
        rail,
        txHash: `0x${Math.random().toString(16).slice(2, 6)}...`,
        timestamp: "Just now",
        status: "settled",
      },
      ...activities,
    ]);

    showToast(`Agent "${name}" authorized on ${rail.toUpperCase()}.`);
  };

  // Toggle agent status
  const handleToggleAgentStatus = (id: string) => {
    const update = (agents: Agent[]) =>
      agents.map((a) =>
        a.id === id ? { ...a, status: a.status === "active" ? "paused" : ("active" as const) } : a
      );

    if (rail === "base") {
      setBaseAgents(update(baseAgents));
    } else {
      setSuiAgents(update(suiAgents));
    }
  };

  // Confirm simulated drawdown
  const handleConfirmDrawdown = (agentId: string, amount: number, endpoint: string) => {
    if (rail === "base") {
      setBaseDebt((prev) => prev + amount);
      setBaseAgents((prev) =>
        prev.map((a) => (a.id === agentId ? { ...a, spent: a.spent + amount, lastActive: "Just now" } : a))
      );
    } else {
      setSuiDebt((prev) => prev + amount);
      setSuiAgents((prev) =>
        prev.map((a) => (a.id === agentId ? { ...a, spent: a.spent + amount, lastActive: "Just now" } : a))
      );
    }

    const agent = currentAgents.find((a) => a.id === agentId);

    setActivities([
      {
        id: `act-${Date.now()}`,
        type: "drawdown",
        agentName: agent?.name || "Autonomous Agent",
        amount,
        rail,
        txHash: `0x${Math.random().toString(16).slice(2, 8)}...`,
        timestamp: "Just now",
        endpoint,
        status: "settled",
      },
      ...activities,
    ]);

    showToast(`Drawdown settled: $${amount.toFixed(2)} on ${rail.toUpperCase()}`);
  };

  // Confirm repayment
  const handleConfirmRepay = (amount: number) => {
    if (rail === "base") {
      setBaseDebt((prev) => Math.max(0, prev - amount));
    } else {
      setSuiDebt((prev) => Math.max(0, prev - amount));
    }

    setActivities([
      {
        id: `act-${Date.now()}`,
        type: "repayment",
        amount,
        rail,
        txHash: `0x${Math.random().toString(16).slice(2, 8)}...`,
        timestamp: "Just now",
        status: "settled",
      },
      ...activities,
    ]);

    showToast(`Repaid: $${amount.toFixed(2)} USDC on ${rail.toUpperCase()}`);
  };

  if (!isWorldVerified) {
    return <WorldAuthGate onSignIn={handleSignInWithWorld} />;
  }

  return (
    <div className="min-h-screen pb-16">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 glass-panel px-4 py-2.5 bg-black/90 border-white/20 text-white text-xs font-mono shadow-2xl flex items-center space-x-2 animate-bounce">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span>{toast}</span>
        </div>
      )}

      {/* Header */}
      <Header
        rail={rail}
        setRail={setRail}
        nullifierHash={nullifierHash}
        onSignOut={handleSignOut}
        onRefresh={() => showToast("Ledger telemetry refreshed.")}
      />

      <main className="max-w-6xl mx-auto px-4 sm:px-6">
        {/* Credit Tank & Reservoir */}
        <CreditTank
          creditLimit={creditLimit}
          outstandingDebt={currentDebt}
          rail={rail}
          onOpenDrawdown={() => setIsDrawdownOpen(true)}
          onOpenRepay={() => setIsRepayOpen(true)}
        />

        {/* Authorized AI Agents */}
        <AgentList
          agents={currentAgents}
          rail={rail}
          onAddAgent={handleAddAgent}
          onToggleStatus={handleToggleAgentStatus}
        />

        {/* Activity Feed */}
        <ActivityFeed activities={activities} rail={rail} />
      </main>

      {/* Drawdown Simulation Modal */}
      <SimulateDrawdownModal
        isOpen={isDrawdownOpen}
        onClose={() => setIsDrawdownOpen(false)}
        agents={currentAgents}
        rail={rail}
        headroom={headroom}
        onConfirmDrawdown={handleConfirmDrawdown}
      />

      {/* Repay Modal */}
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