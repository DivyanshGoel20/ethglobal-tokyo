"use client";

import React, { useState } from "react";
import { Agent, Rail } from "@/types";
import { Plus, X, RefreshCw } from "lucide-react";

interface AgentListProps {
  agents: Agent[];
  rail: Rail;
  suiNetwork?: string | null;
  /** Empty address provisions a fresh wallet Float holds the key to. */
  onAddAgent: (input: { name: string; address: string; privateKey: string; capUsd: number }) => Promise<void>;
  onRemoveAgent: (address: string) => Promise<void>;
  onPayAgent?: (address: string) => Promise<void>;
}

const short = (a?: string) => (a && a.length > 18 ? `${a.slice(0, 8)}...${a.slice(-6)}` : a || "");

export const AgentList: React.FC<AgentListProps> = ({
  agents,
  rail,
  suiNetwork,
  onAddAgent,
  onRemoveAgent,
  onPayAgent,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [limit, setLimit] = useState("5");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const railName = rail === "arc" ? "Arc" : "Sui";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy("add");
    setError(null);
    try {
      await onAddAgent({
        name: name.trim(),
        address: address.trim(),
        privateKey: privateKey.trim(),
        capUsd: parseFloat(limit) || 5,
      });
      setName("");
      setAddress("");
      setPrivateKey("");
      setIsModalOpen(false);
    } catch (err: any) {
      setError(err.message || "Could not authorize the agent.");
    } finally {
      setBusy(null);
    }
  };

  const act = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (err: any) {
      setError(err.message || "That did not go through.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="panel p-6 mb-6">
      <div className="flex items-center justify-between pb-4 border-b border-[#232732]">
        <div>
          <h3 className="text-base font-semibold text-white">Authorized Agents</h3>
          <p className="text-xs text-[#94a3b8] mt-0.5">
            One key per agent, one agent on both rails. Showing its {railName} identity.
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

      {error && !isModalOpen && (
        <div className="mt-3 text-[11px] text-red-400 font-mono">{error}</div>
      )}

      {agents.length === 0 ? (
        <div className="py-12 text-center text-xs text-[#64748b] font-mono">
          No agents on this line yet. Click &quot;Authorize Agent&quot; to grant spending rights.
        </div>
      ) : (
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="text-[#64748b] border-b border-[#1c202a]">
                <th className="py-2.5 font-normal">Name</th>
                <th className="py-2.5 font-normal">{railName} Address</th>
                <th className="py-2.5 font-normal">Holds</th>
                <th className="py-2.5 font-normal">Drawn</th>
                <th className="py-2.5 font-normal">Status</th>
                <th className="py-2.5 font-normal text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1c202a]">
              {agents.map((agent) => {
                const addr = rail === "arc" ? agent.address : agent.suiAddress;
                const holds = rail === "arc" ? Number(agent.gatewayBalanceUSDC ?? agent.currentBalance ?? 0) : agent.suiWalletUsd;
                const drawn = rail === "arc" ? agent.outstandingDebt : agent.suiDebt ?? 0;
                return (
                  <tr key={agent.address} className="hover:bg-[#181b22]/50 text-slate-300">
                    <td className="py-3 font-sans font-medium text-white">{agent.name}</td>
                    <td className="py-3 text-[#94a3b8]" title={addr}>
                      {addr ? short(addr) : <span className="text-[#64748b]">no key held</span>}
                    </td>
                    <td className="py-3">{holds === undefined ? "-" : `$${holds.toFixed(2)}`}</td>
                    <td className="py-3 text-[#f59e0b]">${drawn.toFixed(2)}</td>
                    <td className="py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] ${
                          drawn > 0
                            ? "bg-amber-950/60 text-amber-400 border border-amber-800/40"
                            : "bg-emerald-950/60 text-emerald-400 border border-emerald-800/40"
                        }`}
                      >
                        {drawn > 0 ? "borrowing" : "clear"}
                      </span>
                    </td>
                    <td className="py-3 text-right space-x-2 whitespace-nowrap">
                      {rail === "sui" && onPayAgent && agent.suiAddress && suiNetwork !== "mainnet" && (
                        <button
                          onClick={() => act(`pay-${agent.address}`, () => onPayAgent(agent.address))}
                          disabled={!!busy}
                          title="Test networks: a customer pays this agent $0.10 in demo dollars"
                          className="text-[11px] text-[#94a3b8] hover:text-white underline cursor-pointer disabled:opacity-40"
                        >
                          {busy === `pay-${agent.address}` ? "paying..." : "+$0.10 earnings"}
                        </button>
                      )}
                      <button
                        onClick={() => act(`rm-${agent.address}`, () => onRemoveAgent(agent.address))}
                        disabled={!!busy || agent.outstandingDebt > 0 || (agent.suiDebt ?? 0) > 0}
                        title={agent.outstandingDebt > 0 || (agent.suiDebt ?? 0) > 0 ? "Repay before revoking" : undefined}
                        className="text-[11px] text-red-400 hover:text-red-300 underline cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

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
              Leave the address empty and Float mints the agent a wallet - one key that is its identity on Arc and
              on Sui.
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
                <label className="text-[#94a3b8] block mb-1">Existing Arc Address (optional)</label>
                <input
                  type="text"
                  placeholder="empty: mint a new wallet"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-[#0a0b0e] border border-[#232732] text-white focus:outline-none focus:border-zinc-500 font-mono text-[11px]"
                />
              </div>

              {address.trim() && (
                <div>
                  <label className="text-[#94a3b8] block mb-1">Its Private Key (optional)</label>
                  <input
                    type="password"
                    placeholder="needed for Float to sign on its behalf, and for Sui"
                    value={privateKey}
                    onChange={(e) => setPrivateKey(e.target.value)}
                    className="w-full px-3 py-2 rounded bg-[#0a0b0e] border border-[#232732] text-white focus:outline-none focus:border-zinc-500 font-mono text-[11px]"
                  />
                </div>
              )}

              {!address.trim() && (
                <div>
                  <label className="text-[#94a3b8] block mb-1">Spending Cap (USDC)</label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={limit}
                    onChange={(e) => setLimit(e.target.value)}
                    className="w-full px-3 py-2 rounded bg-[#0a0b0e] border border-[#232732] text-white focus:outline-none focus:border-zinc-500 font-mono"
                  />
                </div>
              )}

              {error && <div className="text-[11px] text-red-400">{error}</div>}

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
                  disabled={busy === "add"}
                  className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded bg-white hover:bg-zinc-200 text-black font-medium text-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  {busy === "add" && <RefreshCw className="w-3 h-3 animate-spin" />}
                  <span>{busy === "add" ? "Authorizing on chain..." : "Authorize"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
