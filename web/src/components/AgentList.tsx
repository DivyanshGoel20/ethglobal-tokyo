"use client";

import React, { useState } from "react";
import { Agent, Rail } from "@/types";
import { Plus, X } from "lucide-react";

interface AgentListProps {
  agents: Agent[];
  rail: Rail;
  onAddAgent: (name: string, address: string, limit: number) => void;
  onToggleStatus: (id: string) => void;
  onRemoveAgent: (id: string) => void;
}

export const AgentList: React.FC<AgentListProps> = ({
  agents,
  rail,
  onAddAgent,
  onToggleStatus,
  onRemoveAgent,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [limit, setLimit] = useState("50");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onAddAgent(name.trim(), address.trim(), parseFloat(limit) || 25);
    setName("");
    setAddress("");
    setIsModalOpen(false);
  };

  return (
    <div className="panel p-6 mb-6">
      <div className="flex items-center justify-between pb-4 border-b border-[#232732]">
        <div>
          <h3 className="text-base font-semibold text-white">Authorized Agents</h3>
          <p className="text-xs text-[#94a3b8] mt-0.5">
            Autonomous software authorized to draw from this credit line on {rail === "arc" ? "Arc" : "Sui"}.
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-mono font-medium bg-white hover:bg-zinc-200 text-black transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Authorize Agent</span>
        </button>
      </div>

      {agents.length === 0 ? (
        <div className="py-12 text-center text-xs text-[#64748b] font-mono">
          No agents authorized on {rail === "arc" ? "Arc" : "Sui"}. Click "Authorize Agent" to grant spending rights.
        </div>
      ) : (
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="text-[#64748b] border-b border-[#1c202a]">
                <th className="py-2.5 font-normal">Name</th>
                <th className="py-2.5 font-normal">Address</th>
                <th className="py-2.5 font-normal">Sub-Limit</th>
                <th className="py-2.5 font-normal">Drawn</th>
                <th className="py-2.5 font-normal">Status</th>
                <th className="py-2.5 font-normal text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1c202a]">
              {agents.map((agent) => (
                <tr key={agent.id} className="hover:bg-[#181b22]/50 text-slate-300">
                  <td className="py-3 font-sans font-medium text-white">{agent.name}</td>
                  <td className="py-3 text-[#94a3b8]">
                    {agent.address.length > 18
                      ? `${agent.address.slice(0, 8)}...${agent.address.slice(-6)}`
                      : agent.address}
                  </td>
                  <td className="py-3">${(agent.allocatedLimit ?? agent.creditLimit ?? 0).toFixed(2)}</td>
                  <td className="py-3 text-[#f59e0b]">${(agent.spent ?? agent.outstandingDebt ?? 0).toFixed(2)}</td>
                  <td className="py-3">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] ${
                        agent.status === "active"
                          ? "bg-emerald-950/60 text-emerald-400 border border-emerald-800/40"
                          : "bg-zinc-800 text-zinc-400"
                      }`}
                    >
                      {agent.status}
                    </span>
                  </td>
                  <td className="py-3 text-right space-x-2">
                    <button
                      onClick={() => onToggleStatus(agent.id || agent.agentId || agent.address)}
                      className="text-[11px] text-[#94a3b8] hover:text-white underline cursor-pointer"
                    >
                      {agent.status === "active" ? "Pause" : "Resume"}
                    </button>
                    <button
                      onClick={() => onRemoveAgent(agent.id || agent.agentId || agent.address)}
                      className="text-[11px] text-red-400 hover:text-red-300 underline cursor-pointer"
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Authorize Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="panel max-w-sm w-full p-6 bg-[#12141a] shadow-xl relative">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 text-[#94a3b8] hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <h4 className="text-sm font-semibold text-white mb-1">Authorize Agent</h4>
            <p className="text-xs text-[#94a3b8] mb-4">
              Add an authorized agent to spend against your facility on {rail === "arc" ? "Arc" : "Sui"}.
            </p>

            <form onSubmit={handleSubmit} className="space-y-3.5 text-xs font-mono">
              <div>
                <label className="text-[#94a3b8] block mb-1">Agent Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Scraper-Agent-01"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-[#0a0b0e] border border-[#232732] text-white focus:outline-none focus:border-zinc-500 font-sans"
                />
              </div>

              <div>
                <label className="text-[#94a3b8] block mb-1">
                  Agent Address ({rail === "arc" ? "0x... Arc EVM" : "0x... Sui"})
                </label>
                <input
                  type="text"
                  placeholder={
                    rail === "arc" ? "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf" : "0x5c428a9b1820...4e21"
                  }
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-[#0a0b0e] border border-[#232732] text-white focus:outline-none focus:border-zinc-500 font-mono text-[11px]"
                />
              </div>

              <div>
                <label className="text-[#94a3b8] block mb-1">Credit Limit (USDC)</label>
                <input
                  type="number"
                  min="1"
                  max="500"
                  value={limit}
                  onChange={(e) => setLimit(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-[#0a0b0e] border border-[#232732] text-white focus:outline-none focus:border-zinc-500 font-mono"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 rounded text-xs text-[#94a3b8] hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 rounded bg-white hover:bg-zinc-200 text-black font-medium text-xs transition-colors cursor-pointer"
                >
                  Authorize
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
