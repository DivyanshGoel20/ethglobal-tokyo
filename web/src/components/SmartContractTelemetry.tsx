"use client";

import React, { useState, useEffect } from "react";
import { RefreshCw, ChevronDown, ChevronUp, ExternalLink, ShieldCheck, Database, FileText } from "lucide-react";

interface TelemetryData {
  network: { name: string; chainId: number; rpcUrl: string; latestBlock: number };
  contract: { address: string; owner: string; explorerUrl: string };
  profile: {
    profileId: string;
    humanOwner: string;
    humanRoot: string;
    creditLimit: number;
    outstandingDebt: number;
    remainingCredit: number;
    totalBorrowed: number;
    totalRepaid: number;
    status: string;
    createdAtIso: string;
  } | null;
  authorizedAgents: Array<{
    agentAddress: string;
    isAuthorized: boolean;
    authorizedAtIso: string;
  }>;
  drawdowns: Array<{
    loanId: number;
    agentAddress: string;
    amountUsdc: number;
    timestampIso: string;
    status: string;
    paymentReference: string;
    txHash?: string;
  }>;
  repayments: Array<{
    repaymentId: number;
    payer: string;
    beneficiaryAgent: string;
    amountUsdc: number;
    timestampIso: string;
  }>;
  totalDrawdownsCount: number;
  totalRepaymentsCount: number;
}

interface SmartContractTelemetryProps {
  humanOwner?: string | null;
  refreshTrigger?: number;
}

const short = (a: string) => (a ? `${a.slice(0, 6)}...${a.slice(-4)}` : "—");

export const SmartContractTelemetry: React.FC<SmartContractTelemetryProps> = ({
  humanOwner,
  refreshTrigger = 0,
}) => {
  const [data, setData] = useState<TelemetryData | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [tab, setTab] = useState<"profile" | "agents" | "draws" | "repayments">("profile");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTelemetry = async (showLoading = false) => {
    if (showLoading) setIsBusy(true);
    try {
      const url = humanOwner
        ? `/api/contract-telemetry?human=${encodeURIComponent(humanOwner)}`
        : "/api/contract-telemetry";
      const res = await fetch(url, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Arc RPC unreachable");
      setData(json.telemetry);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Arc RPC unreachable");
    } finally {
      setIsBusy(false);
    }
  };

  useEffect(() => {
    fetchTelemetry();
  }, [humanOwner, refreshTrigger]);

  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => fetchTelemetry(), 12000);
    return () => clearInterval(interval);
  }, [isOpen, humanOwner]);

  const contractAddress = data?.contract?.address || "0xe382723bE95cB5c8801270a03Da17Bf4c27F320f";
  const latestBlock = data?.network?.latestBlock || 0;

  return (
    <div className="panel p-6 mb-6">
      {/* Header Bar */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between cursor-pointer select-none"
      >
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-[#12141a] border border-[#232732] flex items-center justify-center text-cyan-400">
            <Database className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-sm font-semibold text-white">Smart Contract Telemetry</h3>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#12141a] border border-[#232732] text-[#94a3b8]">
                Arc Testnet (5042002)
              </span>
            </div>
            <p className="text-xs text-[#64748b] font-mono mt-0.5">
              Live on-chain state at block #{latestBlock.toLocaleString()} · Contract: {short(contractAddress)}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              fetchTelemetry(true);
            }}
            className="p-1.5 rounded hover:bg-[#1c202a] text-[#94a3b8] hover:text-white transition-colors"
            title="Refresh on-chain state"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isBusy ? "animate-spin text-cyan-400" : ""}`} />
          </button>
          {isOpen ? (
            <ChevronUp className="w-4 h-4 text-[#94a3b8]" />
          ) : (
            <ChevronDown className="w-4 h-4 text-[#94a3b8]" />
          )}
        </div>
      </div>

      {/* Expanded Live Telemetry Body */}
      {isOpen && (
        <div className="mt-5 pt-4 border-t border-[#1c202a]">
          {/* Sub-tabs */}
          <div className="flex space-x-2 mb-4">
            {(["profile", "agents", "draws", "repayments"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1.5 rounded text-xs font-mono transition-colors ${
                  tab === t
                    ? "bg-[#1c202a] text-white border border-[#232732]"
                    : "text-[#64748b] hover:text-[#94a3b8]"
                }`}
              >
                {t === "profile" && "Credit Profile"}
                {t === "agents" && `Agents (${data?.authorizedAgents?.length || 0})`}
                {t === "draws" && `Drawdowns (${data?.drawdowns?.length || 0})`}
                {t === "repayments" && `Repayments (${data?.repayments?.length || 0})`}
              </button>
            ))}
          </div>

          {/* Tab 1: Profile */}
          {tab === "profile" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-lg bg-[#12141a]/60 border border-[#232732]/60 font-mono text-xs">
              <div>
                <span className="text-[#64748b] block mb-1 text-[11px]">On-Chain Limit</span>
                <span className="text-white text-sm font-semibold">
                  ${(data?.profile?.creditLimit ?? 10).toFixed(2)} USDC
                </span>
              </div>
              <div>
                <span className="text-[#64748b] block mb-1 text-[11px]">Outstanding Debt</span>
                <span className="text-[#f59e0b] text-sm font-semibold">
                  ${(data?.profile?.outstandingDebt ?? 0).toFixed(2)} USDC
                </span>
              </div>
              <div>
                <span className="text-[#64748b] block mb-1 text-[11px]">Total Borrowed</span>
                <span className="text-white text-sm font-semibold">
                  ${(data?.profile?.totalBorrowed ?? 0).toFixed(2)} USDC
                </span>
              </div>
              <div>
                <span className="text-[#64748b] block mb-1 text-[11px]">Total Repaid</span>
                <span className="text-emerald-400 text-sm font-semibold">
                  ${(data?.profile?.totalRepaid ?? 0).toFixed(2)} USDC
                </span>
              </div>
            </div>
          )}

          {/* Tab 2: Agents */}
          {tab === "agents" && (
            <div className="space-y-2 font-mono text-xs">
              {data?.authorizedAgents && data.authorizedAgents.length > 0 ? (
                data.authorizedAgents.map((a, i) => (
                  <div
                    key={i}
                    className="flex justify-between items-center p-2.5 rounded bg-[#12141a] border border-[#232732]"
                  >
                    <span className="text-white">{a.agentAddress}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-950/60 text-emerald-400 border border-emerald-800/40">
                      Authorized on Arc
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-[#64748b] py-3 text-center">No agents registered on-chain yet.</p>
              )}
            </div>
          )}

          {/* Tab 3: Drawdowns */}
          {tab === "draws" && (
            <div className="space-y-2 font-mono text-xs">
              {data?.drawdowns && data.drawdowns.length > 0 ? (
                data.drawdowns.map((d, i) => (
                  <div
                    key={i}
                    className="flex justify-between items-center p-2.5 rounded bg-[#12141a] border border-[#232732]"
                  >
                    <div>
                      <span className="text-white font-semibold">Loan #{d.loanId}: ${d.amountUsdc.toFixed(2)} USDC</span>
                      <span className="text-[#64748b] ml-2 text-[10px]">by {short(d.agentAddress)}</span>
                    </div>
                    <span className="text-[#94a3b8] text-[11px]">{d.timestampIso ? new Date(d.timestampIso).toLocaleDateString() : "Active"}</span>
                  </div>
                ))
              ) : (
                <p className="text-[#64748b] py-3 text-center">No on-chain drawdowns recorded.</p>
              )}
            </div>
          )}

          {/* Tab 4: Repayments */}
          {tab === "repayments" && (
            <div className="space-y-2 font-mono text-xs">
              {data?.repayments && data.repayments.length > 0 ? (
                data.repayments.map((r, i) => (
                  <div
                    key={i}
                    className="flex justify-between items-center p-2.5 rounded bg-[#12141a] border border-[#232732]"
                  >
                    <div>
                      <span className="text-emerald-400 font-semibold">Repayment #{r.repaymentId}: ${r.amountUsdc.toFixed(2)} USDC</span>
                      <span className="text-[#64748b] ml-2 text-[10px]">by {short(r.payer)}</span>
                    </div>
                    <span className="text-[#94a3b8] text-[11px]">{r.timestampIso ? new Date(r.timestampIso).toLocaleDateString() : "Settled"}</span>
                  </div>
                ))
              ) : (
                <p className="text-[#64748b] py-3 text-center">No on-chain repayments recorded.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
