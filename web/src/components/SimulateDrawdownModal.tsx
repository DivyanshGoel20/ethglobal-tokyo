"use client";

import React, { useState } from "react";
import { Agent, Rail } from "@/types";
import { Zap, X, ShieldAlert } from "lucide-react";

interface SimulateDrawdownModalProps {
  isOpen: boolean;
  onClose: () => void;
  agents: Agent[];
  rail: Rail;
  headroom: number;
  onConfirmDrawdown: (agentId: string, amount: number, endpoint: string) => void;
}

export const SimulateDrawdownModal: React.FC<SimulateDrawdownModalProps> = ({
  isOpen,
  onClose,
  agents,
  rail,
  headroom,
  onConfirmDrawdown,
}) => {
  const [selectedAgentId, setSelectedAgentId] = useState(agents[0]?.id || "");
  const [amount, setAmount] = useState("1.50");
  const [endpoint, setEndpoint] = useState("/api/v1/market-intelligence");

  if (!isOpen) return null;

  const numAmount = parseFloat(amount) || 0;
  const isExceeded = numAmount > headroom;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isExceeded || numAmount <= 0) return;
    onConfirmDrawdown(selectedAgentId || agents[0]?.id, numAmount, endpoint);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
      <div className="glass-panel max-w-md w-full p-6 border-white/15 bg-slate-900 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-2 text-xs font-mono text-amber-400 mb-2">
          <Zap className="w-4 h-4" />
          <span>SIMULATE x402 NANOPAYMENT</span>
        </div>

        <h3 className="text-xl font-semibold text-white mb-1">Agent Paywall Hit</h3>
        <p className="text-xs text-slate-400 mb-6 font-sans">
          Simulate an agent hitting an HTTP 402 paywall without personal funds, triggering an automatic Float overdraft on{" "}
          <strong className="text-white">{rail === "base" ? "Base" : "Sui"}</strong>.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4 font-mono text-xs">
          <div>
            <label className="text-slate-300 block mb-1">Select AI Agent</label>
            <select
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white focus:outline-none focus:border-amber-400"
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.address.slice(0, 8)}...)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-slate-300 block mb-1">Metered x402 Service Endpoint</label>
            <select
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white focus:outline-none focus:border-amber-400"
            >
              <option value="/api/v1/market-intelligence">/api/v1/market-intelligence ($1.50 USDC)</option>
              <option value="/risk?records=20">/risk?records=20 ($0.10 USDC)</option>
              <option value="/api/premium-inference">/api/premium-inference ($5.00 USDC)</option>
              <option value="/storage/decentralized-backup">/storage/decentralized-backup ($0.25 USDC)</option>
            </select>
          </div>

          <div>
            <label className="text-slate-300 block mb-1">Drawdown Amount (USDC)</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white focus:outline-none focus:border-amber-400"
            />
            <div className="flex justify-between text-[11px] text-slate-400 mt-1">
              <span>Remaining Headroom:</span>
              <span className="text-emerald-400 font-bold">${headroom.toFixed(2)} USDC</span>
            </div>
          </div>

          {isExceeded && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center space-x-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>Drawdown exceeds available credit limit. Overdraft will be rejected.</span>
            </div>
          )}

          <div className="flex items-center justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-slate-400 hover:text-white transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isExceeded || numAmount <= 0}
              className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-semibold transition-all disabled:opacity-50 cursor-pointer shadow-lg shadow-amber-500/20"
            >
              Execute Overdraft
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};