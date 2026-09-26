"use client";

import React, { useState, useEffect } from "react";
import { Award, Clock, ArrowUpRight, CheckCircle2, ShieldCheck, AlertCircle } from "lucide-react";

interface CreditTier {
  tierNumber: number;
  name: string;
  creditLimit: number;
  requiredInterestPaid: number;
  requiredActiveDurationDays: number;
  requiredRepaymentsCount: number;
  badgeColor: string;
}

interface ReputationSummary {
  humanOwner: string;
  currentTier: CreditTier;
  nextTier: CreditTier | null;
  reputationScore: number;
  totalBorrowed: number;
  totalRepaid: number;
  totalInterestPaid: number;
  totalActiveDurationDays: number;
  repaymentsCount: number;
  oldestActiveLoan: {
    loanId: string;
    agentAddress: string;
    dueTimestamp: number;
    hoursRemaining: number;
    isOverdue: boolean;
    isDueSoon: boolean;
    totalDue: number;
  } | null;
  tierProgress: {
    interestProgressPct: number;
    durationProgressPct: number;
    repaymentProgressPct: number;
    overallProgressPct: number;
  };
}

interface ReputationTierCardProps {
  humanOwner: string;
  refreshTrigger?: number;
  onTier?: (limit: number) => void;
}

const timeLeft = (hours: number) => {
  if (hours <= 0) return "Overdue";
  const d = Math.floor(hours / 24);
  const h = hours % 24;
  return d > 0 ? `${d}d ${h}h` : `${h}h`;
};

export const ReputationTierCard: React.FC<ReputationTierCardProps> = ({
  humanOwner,
  refreshTrigger,
  onTier,
}) => {
  const [data, setData] = useState<ReputationSummary | null>(null);

  useEffect(() => {
    if (!humanOwner) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/reputation?humanOwner=${encodeURIComponent(humanOwner)}`);
        const json = await res.json();
        if (!cancelled && json.success && json.summary) {
          setData(json.summary);
          onTier?.(json.summary.currentTier.creditLimit);
        }
      } catch {
        // Leave card intact with defaults
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [humanOwner, refreshTrigger, onTier]);

  // Fallback state if summary is loading or human is brand new
  const currentTier = data?.currentTier || {
    tierNumber: 1,
    name: "Tier 1: Starter Line",
    creditLimit: 10,
    requiredInterestPaid: 0,
    requiredActiveDurationDays: 0,
    requiredRepaymentsCount: 0,
    badgeColor: "emerald",
  };

  const nextTier = data?.nextTier || {
    tierNumber: 2,
    name: "Tier 2: Growth Operator",
    creditLimit: 25,
    requiredInterestPaid: 0.10,
    requiredActiveDurationDays: 7,
    requiredRepaymentsCount: 3,
    badgeColor: "cyan",
  };

  const score = data?.reputationScore ?? 50;
  const progress = data?.tierProgress?.overallProgressPct ?? 0;
  const oldestLoan = data?.oldestActiveLoan;

  return (
    <div className="panel p-6 mb-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-[#232732] gap-3">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-lg bg-[#12141a] border border-[#232732] flex items-center justify-center text-emerald-400">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-base font-semibold text-white">
                {currentTier.name}
              </h2>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950/60 text-emerald-400 border border-emerald-800/40">
                ${currentTier.creditLimit.toFixed(2)} Limit
              </span>
            </div>
            <p className="text-xs text-[#94a3b8] mt-0.5 font-mono">
              Reputation Standing · Score: {score}/100 · Dynamic Underwriting
            </p>
          </div>
        </div>

        {/* Tranche Status */}
        <div className="text-xs font-mono">
          {oldestLoan ? (
            <div className={`flex items-center space-x-1.5 px-3 py-1.5 rounded border ${
              oldestLoan.isOverdue
                ? "bg-red-950/40 border-red-800/50 text-red-400"
                : oldestLoan.isDueSoon
                ? "bg-amber-950/40 border-amber-800/50 text-amber-400"
                : "bg-[#12141a] border-[#232732] text-[#94a3b8]"
            }`}>
              <Clock className="w-3.5 h-3.5" />
              <span>Oldest tranche ${oldestLoan.totalDue.toFixed(2)} due in {timeLeft(oldestLoan.hoursRemaining)}</span>
            </div>
          ) : (
            <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-[#12141a] border border-[#232732] text-[#64748b]">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span>Zero outstanding debt</span>
            </div>
          )}
        </div>
      </div>

      {/* Graduation Progress Section */}
      {nextTier && (
        <div className="pt-5">
          <div className="flex justify-between items-baseline mb-2">
            <div className="flex items-center space-x-1.5 text-xs font-mono text-white">
              <span className="text-[#94a3b8]">Next Tier:</span>
              <span className="font-semibold text-cyan-400">{nextTier.name}</span>
              <span className="text-[#64748b]">(${nextTier.creditLimit.toFixed(2)} Line)</span>
            </div>
            <span className="text-xs font-mono text-cyan-400 font-semibold">
              {progress}%
            </span>
          </div>

          {/* Progress bar */}
          <div className="h-2 w-full bg-[#181b22] rounded-full overflow-hidden border border-[#232732]/40">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-cyan-400 transition-all duration-700"
              style={{ width: `${Math.min(100, Math.max(3, progress))}%` }}
            />
          </div>

          {/* Requirements Checklist */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 pt-3 border-t border-[#1c202a]">
            <div className="p-3 rounded-lg bg-[#12141a]/60 border border-[#232732]/60">
              <span className="text-[11px] font-mono text-[#64748b] block mb-1">
                Settled Repayments
              </span>
              <div className="flex items-center justify-between">
                <span className="text-sm font-mono font-semibold text-white">
                  {data?.repaymentsCount ?? 0} / {nextTier.requiredRepaymentsCount}
                </span>
                {(data?.repaymentsCount ?? 0) >= nextTier.requiredRepaymentsCount ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <span className="text-[10px] font-mono text-[#64748b]">settlements</span>
                )}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-[#12141a]/60 border border-[#232732]/60">
              <span className="text-[11px] font-mono text-[#64748b] block mb-1">
                Active History
              </span>
              <div className="flex items-center justify-between">
                <span className="text-sm font-mono font-semibold text-white">
                  {data?.totalActiveDurationDays ?? 0}d / {nextTier.requiredActiveDurationDays}d
                </span>
                {(data?.totalActiveDurationDays ?? 0) >= nextTier.requiredActiveDurationDays ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <span className="text-[10px] font-mono text-[#64748b]">days active</span>
                )}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-[#12141a]/60 border border-[#232732]/60">
              <span className="text-[11px] font-mono text-[#64748b] block mb-1">
                Interest Serviced
              </span>
              <div className="flex items-center justify-between">
                <span className="text-sm font-mono font-semibold text-white">
                  ${(data?.totalInterestPaid ?? 0).toFixed(2)} / ${nextTier.requiredInterestPaid.toFixed(2)}
                </span>
                {(data?.totalInterestPaid ?? 0) >= nextTier.requiredInterestPaid ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <span className="text-[10px] font-mono text-[#64748b]">USDC</span>
                )}
              </div>
            </div>
          </div>

          <p className="mt-3 text-[11px] font-mono text-[#64748b] flex items-center space-x-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 inline-block" />
            <span>FIFO Settlement: On-time repayments clear oldest tranches first and graduate your credit limit automatically.</span>
          </p>
        </div>
      )}
    </div>
  );
};
