"use client";

import React from "react";
import { Rail } from "@/types";
import { TrendingUp, ArrowDownRight, Layers, Zap, DollarSign } from "lucide-react";

interface CreditTankProps {
  creditLimit: number;
  outstandingDebt: number;
  rail: Rail;
  onOpenDrawdown: () => void;
  onOpenRepay: () => void;
}

export const CreditTank: React.FC<CreditTankProps> = ({
  creditLimit,
  outstandingDebt,
  rail,
  onOpenDrawdown,
  onOpenRepay,
}) => {
  const headroom = Math.max(0, creditLimit - outstandingDebt);
  const utilizationPct = creditLimit > 0 ? (outstandingDebt / creditLimit) * 100 : 0;
  const headroomPct = 100 - utilizationPct;

  return (
    <div className="glass-panel p-6 sm:p-8 mb-8 border-white/10 relative overflow-hidden">
      {/* Background glow tailored to rail */}
      <div
        className={`absolute -top-24 -right-24 w-80 h-80 rounded-full blur-[100px] pointer-events-none transition-all duration-500 ${
          rail === "base" ? "bg-blue-600/15" : "bg-cyan-500/15"
        }`}
      />

      {/* Header of the Tank */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-6 border-b border-white/10 gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs font-mono text-slate-400 mb-1">
            <span className="uppercase tracking-wider">Facility Status &bull;</span>
            <span className={rail === "base" ? "text-blue-400 font-semibold" : "text-cyan-400 font-semibold"}>
              {rail === "base" ? "Base Mainnet / Sepolia (EVM)" : "Sui Network (Move PTB)"}
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight">
            Undercollateralized Credit Line
          </h2>
        </div>

        <div className="flex items-center space-x-2">
          <button
            id="simulate-drawdown-btn"
            onClick={onOpenDrawdown}
            className={`flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-mono font-medium transition-all shadow-md cursor-pointer ${
              rail === "base"
                ? "bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/20"
                : "bg-cyan-600 hover:bg-cyan-500 text-white shadow-cyan-600/20"
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Simulate 402 Drawdown</span>
          </button>

          <button
            id="repay-facility-btn"
            onClick={onOpenRepay}
            className="flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-mono font-medium border border-white/15 bg-white/5 hover:bg-white/10 text-white transition-all cursor-pointer"
          >
            <DollarSign className="w-3.5 h-3.5" />
            <span>Repay Facility</span>
          </button>
        </div>
      </div>

      {/* Core Numbers and Waterline Reservoir */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pt-6 items-center">
        {/* Available Headroom */}
        <div className="lg:col-span-4">
          <span className="text-xs font-mono uppercase tracking-wider text-slate-400 flex items-center space-x-1.5 mb-1">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            <span>Available Headroom</span>
          </span>
          <div className="text-4xl sm:text-5xl font-bold font-mono text-white mb-2">
            ${headroom.toFixed(2)}
            <span className="text-sm font-normal text-slate-400 ml-2">USDC</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed font-sans">
            Ready to be drawn by authorized agents upon hitting HTTP 402 paywalls on {rail === "base" ? "Base" : "Sui"}.
          </p>
        </div>

        {/* Visual Tank Bar (Waterline) */}
        <div className="lg:col-span-4 flex flex-col justify-center">
          <div className="flex justify-between items-center text-xs font-mono mb-2">
            <span className="text-slate-400">Tank Reservoir Level</span>
            <span className={rail === "base" ? "text-blue-400" : "text-cyan-400"}>
              {headroomPct.toFixed(1)}% Headroom
            </span>
          </div>

          <div className="tank-reservoir h-12 w-full p-1 relative">
            {/* The liquid fill (representing remaining available headroom) */}
            <div
              className="tank-liquid"
              style={{
                height: `${headroomPct}%`,
                width: "100%",
              }}
            >
              <div className="waterline-crest" />
            </div>

            {/* In-tank labels */}
            <div className="relative z-10 h-full flex items-center justify-between px-3 text-[11px] font-mono">
              <span className="text-slate-300 font-medium">
                Drawn: ${outstandingDebt.toFixed(2)}
              </span>
              <span className="text-white font-semibold">
                Cap: ${creditLimit.toFixed(2)}
              </span>
            </div>
          </div>

          <div className="flex justify-between items-center text-[10px] font-mono text-slate-500 mt-2">
            <span>0% (Empty)</span>
            <span>Waterline threshold</span>
            <span>100% (Cap)</span>
          </div>
        </div>

        {/* Outstanding Debt & Total Cap */}
        <div className="lg:col-span-4 grid grid-cols-2 gap-4">
          <div className="p-4 rounded-xl bg-black/30 border border-white/5">
            <span className="text-[11px] font-mono uppercase text-slate-400 block mb-1 flex items-center space-x-1">
              <ArrowDownRight className="w-3 h-3 text-amber-400" />
              <span>Outstanding Debt</span>
            </span>
            <div className="text-2xl font-bold font-mono text-amber-400">
              ${outstandingDebt.toFixed(2)}
            </div>
            <span className="text-[10px] font-mono text-slate-500">Subject to Human liability</span>
          </div>

          <div className="p-4 rounded-xl bg-black/30 border border-white/5">
            <span className="text-[11px] font-mono uppercase text-slate-400 block mb-1 flex items-center space-x-1">
              <Layers className="w-3 h-3 text-slate-400" />
              <span>Facility Cap</span>
            </span>
            <div className="text-2xl font-bold font-mono text-slate-200">
              ${creditLimit.toFixed(2)}
            </div>
            <span className="text-[10px] font-mono text-slate-500">Underwritten by World ID</span>
          </div>
        </div>
      </div>
    </div>
  );
};