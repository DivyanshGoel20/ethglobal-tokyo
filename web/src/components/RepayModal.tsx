"use client";

import React, { useEffect, useState } from "react";
import { Agent, Rail } from "@/types";
import { X, RefreshCw } from "lucide-react";

interface RepayModalProps {
  isOpen: boolean;
  onClose: () => void;
  rail: Rail;
  agents: Agent[];
  onDone: (message: string) => void;
  onSessionExpired: () => void;
}

type Obligation = {
  obligationId: string;
  agentAddress: string;
  status: string;
  owedUsd: number;
  dueMs: number | null;
  purseUsd: number | null;
};

/**
 * Repaying differs by rail. On Arc the agent sends USDC from its wallet and the
 * operator books it on the facility. On Sui the debt is a parked obligation:
 * settling it early moves the agent's coins into its purse and settles in one
 * transaction the agent signs.
 */
export const RepayModal: React.FC<RepayModalProps> = ({ isOpen, onClose, rail, agents, onDone, onSessionExpired }) => {
  const owing = agents.filter((a) => a.outstandingDebt > 0);
  const [agentAddress, setAgentAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [obligations, setObligations] = useState<Obligation[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    if (rail === "arc") {
      const first = owing[0];
      setAgentAddress(first?.address ?? "");
      setAmount(first ? first.outstandingDebt.toFixed(2) : "");
    } else {
      setObligations(null);
      fetch("/api/sui/obligations")
        .then((r) => r.json())
        .then((d) => setObligations((d.obligations ?? []).filter((o: Obligation) => o.owedUsd > 0)))
        .catch(() => setObligations([]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, rail]);

  if (!isOpen) return null;

  const post = async (url: string, body: unknown) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      onSessionExpired();
      throw new Error("Your World session expired. Verify again to repay.");
    }
    if (!res.ok || !data.success) throw new Error(data.error || "Repayment did not settle.");
    return data;
  };

  const repayArc = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = parseFloat(amount) || 0;
    if (!agentAddress || value <= 0) return;
    setBusy("arc");
    setError(null);
    try {
      const data = await post("/api/repay", { agentAddress, amount: value });
      onDone(`Repaid $${Number(data.amount).toFixed(2)} on Arc`);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const settle = async (o: Obligation) => {
    setBusy(o.obligationId);
    setError(null);
    try {
      await post("/api/sui/settle", { obligationId: o.obligationId });
      onDone(`Settled $${o.owedUsd.toFixed(3)} on Sui`);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const nameOf = (addr: string) => agents.find((a) => a.address.toLowerCase() === addr.toLowerCase())?.name ?? addr.slice(0, 10);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="panel max-w-md w-full p-6 bg-[#12141a] shadow-xl relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-[#94a3b8] hover:text-white cursor-pointer">
          <X className="w-4 h-4" />
        </button>

        <h4 className="text-sm font-semibold text-white mb-1">Repay Facility Debt</h4>
        <p className="text-xs text-[#94a3b8] mb-4">
          {rail === "arc"
            ? "The agent pays from its own Arc wallet; the facility books it."
            : "Settle a parked repayment before its date. The agent pays from its own Sui coins."}
        </p>

        {rail === "arc" ? (
          owing.length === 0 ? (
            <div className="py-6 text-center text-xs text-[#64748b] font-mono">Nothing is owed on Arc.</div>
          ) : (
            <form onSubmit={repayArc} className="space-y-3.5 text-xs font-mono">
              <div>
                <label className="text-[#94a3b8] block mb-1">Paying Agent</label>
                <select
                  value={agentAddress}
                  onChange={(e) => {
                    setAgentAddress(e.target.value);
                    const a = owing.find((x) => x.address === e.target.value);
                    if (a) setAmount(a.outstandingDebt.toFixed(2));
                  }}
                  className="w-full px-3 py-2 rounded bg-[#0a0b0e] border border-[#232732] text-white focus:outline-none focus:border-zinc-500 font-sans"
                >
                  {owing.map((a) => (
                    <option key={a.address} value={a.address}>
                      {a.name} - owes ${a.outstandingDebt.toFixed(2)}
                    </option>
                  ))}
                </select>
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
              </div>
              {error && <div className="text-[11px] text-red-400">{error}</div>}
              <div className="flex items-center justify-end space-x-2 pt-2">
                <button type="button" onClick={onClose} className="px-3 py-1.5 rounded text-xs text-[#94a3b8] hover:text-white cursor-pointer">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!!busy}
                  className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded bg-white hover:bg-zinc-200 text-black font-medium text-xs transition-colors cursor-pointer disabled:opacity-40"
                >
                  {busy && <RefreshCw className="w-3 h-3 animate-spin" />}
                  <span>{busy ? "Settling on Arc..." : "Confirm Repayment"}</span>
                </button>
              </div>
            </form>
          )
        ) : obligations === null ? (
          <div className="py-6 text-center text-xs text-[#64748b] font-mono">reading obligations from chain...</div>
        ) : obligations.length === 0 ? (
          <div className="py-6 text-center text-xs text-[#64748b] font-mono">Nothing is owed on Sui.</div>
        ) : (
          <div className="space-y-2 text-xs font-mono">
            {obligations.map((o) => (
              <div key={o.obligationId} className="panel-subtle p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-white">
                    {nameOf(o.agentAddress)} owes <span className="text-[#f59e0b]">${o.owedUsd.toFixed(3)}</span>
                  </div>
                  <div className="text-[10px] text-[#64748b] truncate">
                    {o.status} · due {o.dueMs ? new Date(o.dueMs).toLocaleString() : "?"} · purse ${o.purseUsd?.toFixed(3) ?? "?"}
                  </div>
                </div>
                <button
                  onClick={() => settle(o)}
                  disabled={!!busy}
                  className="shrink-0 flex items-center space-x-1 px-3 py-1.5 rounded bg-white hover:bg-zinc-200 text-black font-medium text-[11px] cursor-pointer disabled:opacity-40"
                >
                  {busy === o.obligationId && <RefreshCw className="w-3 h-3 animate-spin" />}
                  <span>{o.status === "defaulted" ? "Cure" : "Settle early"}</span>
                </button>
              </div>
            ))}
            {error && <div className="text-[11px] text-red-400">{error}</div>}
          </div>
        )}
      </div>
    </div>
  );
};
