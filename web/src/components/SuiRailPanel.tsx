"use client";

import React, { useCallback, useEffect, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";

type Obligation = {
  obligationId: string;
  agentAddress: string;
  status: string;
  drawnUsd: number;
  ceilingUsd: number | null;
  owedUsd: number;
  dueMs: number | null;
  purseUsd: number | null;
  draws: number;
  link: string | null;
};

type Status = {
  configured: boolean;
  network: string;
  facilityId?: string;
  packageId?: string;
  liquidityUsd?: number | null;
  facilityLink?: string | null;
  sellerUp: boolean;
  reason?: string;
};

interface SuiRailPanelProps {
  refreshTrigger: number;
  agentName: (address: string) => string;
  onChanged: (message: string) => void;
}

const STATUS_STYLE: Record<string, string> = {
  open: "bg-cyan-950/60 text-cyan-300 border border-cyan-800/40",
  settled: "bg-emerald-950/60 text-emerald-400 border border-emerald-800/40",
  closed: "bg-zinc-800 text-zinc-400",
  defaulted: "bg-red-950/60 text-red-400 border border-red-800/40",
};

const due = (ms: number | null) => {
  if (!ms) return "?";
  const left = ms - Date.now();
  if (left <= 0) return "due now";
  const h = Math.floor(left / 3_600_000);
  return h >= 24 ? `in ${Math.floor(h / 24)}d ${h % 24}h` : `in ${h}h ${Math.floor((left % 3_600_000) / 60_000)}m`;
};

/**
 * The Sui facility and the repayments parked against it.
 *
 * Each row is an obligation an agent signed before it drew: a tranche that can
 * cover many payments, collected on its date by whoever calls it. Reconciling
 * reads what the chain did and collects anything that has fallen due.
 */
export const SuiRailPanel: React.FC<SuiRailPanelProps> = ({ refreshTrigger, agentName, onChanged }) => {
  const [status, setStatus] = useState<Status | null>(null);
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [s, o] = await Promise.all([
      fetch("/api/sui/status").then((r) => r.json()).catch(() => null),
      fetch("/api/sui/obligations").then((r) => r.json()).catch(() => ({ obligations: [] })),
    ]);
    setStatus(s);
    setObligations(o.obligations ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshTrigger]);

  const reconcile = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/sui/reconcile", { method: "POST" });
      const d = await res.json();
      if (!res.ok || !d.success) throw new Error(d.error || "Reconciliation failed");
      onChanged(`Reconciled ${d.checked}: ${d.settled.length} repaid, ${d.defaulted.length} defaulted, ${d.pending} not yet due`);
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel p-6 mb-6">
      <div className="flex items-center justify-between pb-4 border-b border-[#232732]">
        <div>
          <h3 className="text-base font-semibold text-white">Parked Repayments</h3>
          <p className="text-xs text-[#94a3b8] mt-0.5">
            Signed by the agent before it drew. On its date anyone can collect: it repays, or it defaults in plain sight.
          </p>
        </div>
        <button
          onClick={reconcile}
          disabled={busy || !status?.configured}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-mono font-medium bg-[#1c202a] hover:bg-[#252b38] border border-[#232732] text-white transition-colors cursor-pointer disabled:opacity-40"
        >
          <RefreshCw className={`w-3 h-3 ${busy ? "animate-spin" : ""}`} />
          <span>Reconcile</span>
        </button>
      </div>

      {status && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-4 text-[11px] font-mono border-b border-[#1c202a]">
          <div>
            <div className="text-[#64748b] uppercase mb-0.5">Network</div>
            <div className="text-white">{status.configured ? `sui:${status.network}` : "not deployed"}</div>
          </div>
          <div>
            <div className="text-[#64748b] uppercase mb-0.5">Facility</div>
            {status.facilityId ? (
              status.facilityLink ? (
                <a href={status.facilityLink} target="_blank" rel="noreferrer" className="text-white underline inline-flex items-center gap-1">
                  {status.facilityId.slice(0, 10)}... <ExternalLink className="w-3 h-3" />
                </a>
              ) : (
                <div className="text-white">{status.facilityId.slice(0, 10)}...</div>
              )
            ) : (
              <div className="text-[#64748b]">{status.reason ?? "-"}</div>
            )}
          </div>
          <div>
            <div className="text-[#64748b] uppercase mb-0.5">Liquidity</div>
            <div className="text-white">{status.liquidityUsd == null ? "-" : `$${status.liquidityUsd.toFixed(2)}`}</div>
          </div>
          <div>
            <div className="text-[#64748b] uppercase mb-0.5">x402 Feed</div>
            <div className={status.sellerUp ? "text-emerald-400" : "text-[#64748b]"}>{status.sellerUp ? "up" : "down"}</div>
          </div>
        </div>
      )}

      {error && <div className="mt-3 text-[11px] text-red-400 font-mono">{error}</div>}

      {obligations.length === 0 ? (
        <div className="py-10 text-center text-xs text-[#64748b] font-mono">
          No repayments parked. One is parked the first time an agent borrows on Sui.
        </div>
      ) : (
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="text-[#64748b] border-b border-[#1c202a]">
                <th className="py-2.5 font-normal">Obligation</th>
                <th className="py-2.5 font-normal">Agent</th>
                <th className="py-2.5 font-normal">Drawn / Ceiling</th>
                <th className="py-2.5 font-normal">Purse</th>
                <th className="py-2.5 font-normal">Due</th>
                <th className="py-2.5 font-normal text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1c202a]">
              {obligations.map((o) => (
                <tr key={o.obligationId} className="text-slate-300">
                  <td className="py-3">
                    {o.link ? (
                      <a href={o.link} target="_blank" rel="noreferrer" className="underline inline-flex items-center gap-1">
                        {o.obligationId.slice(0, 10)}... <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      `${o.obligationId.slice(0, 10)}...`
                    )}
                  </td>
                  <td className="py-3 font-sans text-white">{agentName(o.agentAddress)}</td>
                  <td className="py-3">
                    ${o.drawnUsd.toFixed(3)} / ${o.ceilingUsd?.toFixed(2) ?? "?"}
                    <span className="text-[#64748b]"> · {o.draws} draw{o.draws === 1 ? "" : "s"}</span>
                  </td>
                  <td className="py-3">{o.purseUsd == null ? "-" : `$${o.purseUsd.toFixed(3)}`}</td>
                  <td className="py-3">{o.status === "open" ? due(o.dueMs) : "-"}</td>
                  <td className="py-3 text-right">
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] ${STATUS_STYLE[o.status] ?? "bg-zinc-800 text-zinc-400"}`}>
                      {o.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
