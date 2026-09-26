"use client";

import React from "react";
import { Rail } from "@/types";

interface CreditOverviewProps {
  creditLimit: number;
  arcDebt: number;
  suiDebt: number;
  rail: Rail;
  onOpenPurchase: () => void;
  onOpenRepay: () => void;
}

/**
 * One line, two rails. Headroom is what is left after both rails' debt,
 * because a dollar drawn on Sui is a dollar Arc will not lend again.
 */
export const CreditOverview: React.FC<CreditOverviewProps> = ({
  creditLimit,
  arcDebt,
  suiDebt,
  rail,
  onOpenPurchase,
  onOpenRepay,
}) => {
  const drawn = arcDebt + suiDebt;
  const railDebt = rail === "arc" ? arcDebt : suiDebt;
  const headroom = Math.max(0, creditLimit - drawn);
  const utilizationPct = creditLimit > 0 ? (drawn / creditLimit) * 100 : 0;
  const arcPct = creditLimit > 0 ? (arcDebt / creditLimit) * 100 : 0;
  const suiPct = creditLimit > 0 ? (suiDebt / creditLimit) * 100 : 0;

  return (
    <div className="panel p-6 mb-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-[#232732] gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">Facility Overview</h2>
          <p className="text-xs text-[#94a3b8] mt-0.5">
            One credit line underwritten by your World ID nullifier, spendable on Arc and Sui.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={onOpenPurchase}
            className="px-3 py-1.5 rounded-md text-xs font-mono font-medium bg-[#1c202a] hover:bg-[#252b38] border border-[#232732] text-white transition-colors cursor-pointer"
          >
            x402 Purchase
          </button>
          <button
            onClick={onOpenRepay}
            disabled={railDebt <= 0}
            className="px-3 py-1.5 rounded-md text-xs font-mono font-medium bg-[#1c202a] hover:bg-[#252b38] border border-[#232732] text-white transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Repay Debt
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-5">
        <div>
          <span className="text-[11px] font-mono uppercase text-[#64748b] block mb-1">Available Headroom</span>
          <div className="text-2xl font-bold font-mono text-white">
            ${headroom.toFixed(2)}
            <span className="text-xs font-normal text-[#64748b] ml-1.5">USDC</span>
          </div>
          <span className="text-[10px] font-mono text-[#64748b]">shared by both rails</span>
        </div>

        <div>
          <span className="text-[11px] font-mono uppercase text-[#64748b] block mb-1">
            Drawn on {rail === "arc" ? "Arc" : "Sui"}
          </span>
          <div className="text-2xl font-bold font-mono text-[#f59e0b]">
            ${railDebt.toFixed(2)}
            <span className="text-xs font-normal text-[#64748b] ml-1.5">USDC</span>
          </div>
          <span className="text-[10px] font-mono text-[#64748b]">
            {rail === "arc" ? `Sui $${suiDebt.toFixed(2)}` : `Arc $${arcDebt.toFixed(2)}`} on the other rail
          </span>
        </div>

        <div>
          <span className="text-[11px] font-mono uppercase text-[#64748b] block mb-1">Facility Limit</span>
          <div className="text-2xl font-bold font-mono text-[#94a3b8]">
            ${creditLimit.toFixed(2)}
            <span className="text-xs font-normal text-[#64748b] ml-1.5">USDC</span>
          </div>
        </div>
      </div>

      <div className="mt-5 pt-4 border-t border-[#1c202a]">
        <div className="flex justify-between items-center text-[11px] font-mono text-[#64748b] mb-1.5">
          <span>
            Utilization <span className="text-cyan-400 ml-2">■ Arc</span>
            <span className="text-[#2a82e4] ml-2">■ Sui</span>
          </span>
          <span>{utilizationPct.toFixed(1)}%</span>
        </div>
        <div className="h-1.5 w-full bg-[#181b22] rounded-full overflow-hidden flex">
          <div className="h-full bg-cyan-500 transition-all duration-300" style={{ width: `${Math.min(100, arcPct)}%` }} />
          <div className="h-full bg-[#2a82e4] transition-all duration-300" style={{ width: `${Math.min(100 - Math.min(100, arcPct), suiPct)}%` }} />
        </div>
      </div>
    </div>
  );
};
