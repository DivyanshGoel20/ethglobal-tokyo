"use client";

import React from "react";
import { Rail } from "@/types";

interface CreditOverviewProps {
  creditLimit: number;
  outstandingDebt: number;
  rail: Rail;
  onOpenDrawdown: () => void;
  onOpenRepay: () => void;
}

export const CreditOverview: React.FC<CreditOverviewProps> = ({
  creditLimit,
  outstandingDebt,
  rail,
  onOpenDrawdown,
  onOpenRepay,
}) => {
  const headroom = Math.max(0, creditLimit - outstandingDebt);
  const utilizationPct = creditLimit > 0 ? (outstandingDebt / creditLimit) * 100 : 0;

  return (
    <div className="panel p-6 mb-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-[#232732] gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">Facility Overview</h2>
          <p className="text-xs text-[#94a3b8] mt-0.5">
            Credit headroom on {rail === "base" ? "Base (EVM)" : "Sui (Move)"} underwritten by your World ID nullifier.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={onOpenDrawdown}
            className="px-3 py-1.5 rounded-md text-xs font-mono font-medium bg-[#1c202a] hover:bg-[#252b38] border border-[#232732] text-white transition-colors cursor-pointer"
          >
            Simulate Drawdown
          </button>
          <button
            onClick={onOpenRepay}
            disabled={outstandingDebt <= 0}
            className="px-3 py-1.5 rounded-md text-xs font-mono font-medium bg-[#1c202a] hover:bg-[#252b38] border border-[#232732] text-white transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Repay Debt
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-5">
        <div>
          <span className="text-[11px] font-mono uppercase text-[#64748b] block mb-1">
            Available Headroom
          </span>
          <div className="text-2xl font-bold font-mono text-white">
            ${headroom.toFixed(2)}
            <span className="text-xs font-normal text-[#64748b] ml-1.5">USDC</span>
          </div>
        </div>

        <div>
          <span className="text-[11px] font-mono uppercase text-[#64748b] block mb-1">
            Drawn Debt
          </span>
          <div className="text-2xl font-bold font-mono text-[#f59e0b]">
            ${outstandingDebt.toFixed(2)}
            <span className="text-xs font-normal text-[#64748b] ml-1.5">USDC</span>
          </div>
        </div>

        <div>
          <span className="text-[11px] font-mono uppercase text-[#64748b] block mb-1">
            Facility Limit
          </span>
          <div className="text-2xl font-bold font-mono text-[#94a3b8]">
            ${creditLimit.toFixed(2)}
            <span className="text-xs font-normal text-[#64748b] ml-1.5">USDC</span>
          </div>
        </div>
      </div>

      {/* Clean Hairline Progress Bar */}
      <div className="mt-5 pt-4 border-t border-[#1c202a]">
        <div className="flex justify-between items-center text-[11px] font-mono text-[#64748b] mb-1.5">
          <span>Utilization</span>
          <span>{utilizationPct.toFixed(1)}%</span>
        </div>
        <div className="h-1.5 w-full bg-[#181b22] rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${
              rail === "base" ? "bg-[#0052ff]" : "bg-[#2a82e4]"
            }`}
            style={{ width: `${Math.min(100, utilizationPct)}%` }}
          />
        </div>
      </div>
    </div>
  );
};
