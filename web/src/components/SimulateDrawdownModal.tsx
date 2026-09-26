"use client";

import React, { useState } from "react";
import { Agent, Rail } from "@/types";
import { X } from "lucide-react";

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
  const [amount, setAmount] = useState("1.00");
  const [endpoint, setEndpoint] = useState("/api/v1/resource");

  if (!isOpen) return null;

  const numAmount = parseFloat(amount) || 0;
  const isExceeded = numAmount > headroom;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isExceeded || numAmount <= 0) return;
    onConfirmDrawdown(selectedAgentId || agents[0]?.id || "", numAmount, endpoint);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="panel max-w-sm w-full p-6 bg-[#12141a] shadow-xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[#94a3b8] hover:text-white cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        <h4 className="text-sm font-semibold text-white mb-1">Simulate 402 Drawdown</h4>
        <p className="text-xs text-[#94a3b8] mb-4">
          Simulate an agent hitting an x402 paywall on {rail === "arc" ? "Arc" : "Sui"}.
        </p>

        {agents.length === 0 ? (
          <div className="py-6 text-center text-xs text-[#64748b] font-mono">
            No agents authorized yet. Authorize an agent first to simulate drawdowns.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3.5 text-xs font-mono">
            <div>
              <label className="text-[#94a3b8] block mb-1">Agent</label>
              <select
                value={selectedAgentId}
                onChange={(e) => setSelectedAgentId(e.target.value)}
                className="w-full px-3 py-2 rounded bg-[#0a0b0e] border border-[#232732] text-white focus:outline-none focus:border-zinc-500 font-sans"
              >
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.address.slice(0, 6)}...)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[#94a3b8] block mb-1">Service Endpoint</label>
              <input
                type="text"
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                placeholder="/api/v1/resource"
                className="w-full px-3 py-2 rounded bg-[#0a0b0e] border border-[#232732] text-white focus:outline-none focus:border-zinc-500"
              />
            </div>

            <div>
              <label className="text-[#94a3b8] block mb-1">Amount (USDC)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-3 py-2 rounded bg-[#0a0b0e] border border-[#232732] text-white focus:outline-none focus:border-zinc-500"
              />
              <div className="flex justify-between text-[11px] text-[#64748b] mt-1">
                <span>Headroom:</span>
                <span>${headroom.toFixed(2)} USDC</span>
              </div>
            </div>

            {isExceeded && (
              <div className="text-[11px] text-red-400 font-mono">
                Amount exceeds available headroom (${headroom.toFixed(2)}).
              </div>
            )}

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded text-xs text-[#94a3b8] hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isExceeded || numAmount <= 0}
                className="px-3.5 py-1.5 rounded bg-white hover:bg-zinc-200 text-black font-medium text-xs transition-colors cursor-pointer disabled:opacity-40"
              >
                Drawdown
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
